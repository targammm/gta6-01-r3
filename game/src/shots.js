// Deterministic screenshot staging: each ?shot= plays the real rules forward
// from the fixed seed, then leaves the camera on a composed frame. No poses —
// the chase drove, the fight fought, the traffic is simulated.
import { MISSIONS } from './config.js';
import { clamp } from './random.js';
import { spawnParkedCar, makeCar } from './vehicles.js';
import { spawnPoliceCar } from './police.js';
import { boostDensityNear } from './traffic.js';
import { spawnEnemy } from './combat.js';
import { startMission, placeMissionBeacon } from './missions.js';
import { stepWorld } from './world.js';

const STEP = 1 / 60;

function stepN(world, n) {
  for (let i = 0; i < n; i++) stepWorld(world, STEP);
}

// Drive the player's car along waypoints with a simple autopilot.
export function driveFor(world, seconds, waypoints) {
  const steps = Math.round(seconds / STEP);
  let wp = 0;
  for (let i = 0; i < steps; i++) {
    const car = world.player.inCar;
    if (!car || wp >= waypoints.length) {
      stepWorld(world, STEP);
      continue;
    }
    const [tx, tz] = waypoints[wp];
    const d = Math.hypot(tx - car.x, tz - car.z);
    if (d < 10) { wp++; stepWorld(world, STEP); continue; }
    const wantAngle = Math.atan2(tx - car.x, tz - car.z);
    let dh = wantAngle - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const next = waypoints[Math.min(wp + 1, waypoints.length - 1)];
    const nd = Math.hypot(next[0] - car.x, next[1] - car.z);
    const nextAngle = Math.atan2(next[0] - car.x, next[1] - car.z);
    let ndh = nextAngle - car.heading;
    while (ndh > Math.PI) ndh -= Math.PI * 2;
    while (ndh < -Math.PI) ndh += Math.PI * 2;
    world.autopilot = {
      steer: clamp(dh * 1.4, -1, 1),
      throttle: Math.abs(ndh) > 0.5 ? 0.25 : 1,
      brake: Math.abs(ndh) > 0.5 && nd < 50 && Math.abs(car.speed) > 14 ? 1 : 0,
    };
    stepWorld(world, STEP);
  }
  world.autopilot = null;
}

export function setPlayerOnFoot(world, x, z, heading) {
  const p = world.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar = null;
  }
  p.x = x;
  p.z = z;
  p.y = 0;
  p.vy = 0;
  p.onGround = true;
  p.heading = heading;
  p.camYaw = heading + Math.PI;
  p.group.position.set(x, 0, z);
  p.group.rotation.y = heading;
  p.group.visible = true;
}

export function putPlayerInCar(world, car) {
  const p = world.player;
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.camYaw = car.heading + Math.PI;
  p.group.visible = false;
}

export function aimAtNearestEnemy(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (!best) return;
  const a = Math.atan2(best.x - p.x, best.z - p.z);
  p.heading = a;
  p.camYaw = a + Math.PI;
}

// The cover camera: lens 11 m in FRONT of the car, looking back down the
// chase so the player's sedan fills the frame with the cruisers behind it.
function coverCamera(world) {
  const car = world.player.inCar;
  const camera = world.render.camera;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  camera.position.set(car.x + fx * 11 + fz * 2.5, 4.0, car.z + fz * 11 - fx * 2.5);
  camera.lookAt(car.x - fx * 12, 1.5, car.z - fz * 12);
}

export function placeVipers(world) {
  for (const e of [...world.enemies]) {
    world.render.scene.remove(e.group);
  }
  world.enemies.length = 0;
  const spots = [[150, -126], [144, -124.5], [156, -124.5]];
  const delays = [0.005, 0.02, 0.04];
  spots.forEach(([x, z], i) => {
    const e = spawnEnemy(world, x, z);
    e.health = 100;
    e.holdFire = 99;
    e.fireDelay = delays[i];
    e.heading = Math.atan2(world.player.x - x, world.player.z - z);
  });
}

export function applyShotStaging(world, name) {
  const p = world.player;
  if (name === 'chase') {
    // After mission 1: $400 / XP 100 / Missions 1/3, mission 2 in progress.
    world.money = 400;
    world.xp = 100;
    world.missionsDone = 1;
    startMission(world, 1);
    const car = spawnParkedCar(world, 'sedan', 90, 60, 0, 0xc22a1e);
    putPlayerInCar(world, car);
    driveFor(world, 9, [[90, 150], [-90, 150], [-90, -150], [90, -150]]);
    // Three cruisers tucked in behind the car, matched to its speed.
    const slots = [[10, -3.5], [16, 4], [24, -2]];
    for (const [back, side] of slots) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const cop = makeCar(world, 'cruiser', car.x - fx * back + fz * side, car.z - fz * back - fx * side, car.heading, 0xf2f2f2, 'police');
      cop.speed = Math.abs(car.speed);
      world.cops.push(cop);
    }
    boostDensityNear(world, car.x, car.z, 12, 16);
    driveFor(world, 0.4, []);
    coverCamera(world);
    // Keep the frame a touch lower/closer than the r2 cover so the city and
    // the traffic fill the frame instead of the sky.
    world.render.camera.position.y = 3.4;
    world.render.camera.position.x += Math.sin(car.heading) * -1.5;
    world.render.camera.position.z += Math.cos(car.heading) * -1.5;
  } else if (name === 'city') {
    // After mission 1 (progression visible) and about to steal the taxi.
    world.money = 400;
    world.xp = 100;
    world.missionsDone = 1;
    startMission(world, 1);
    world.wanted = 1;
    world.troubleTimer = 0;
    spawnParkedCar(world, 'taxi', 20, 156.5, Math.PI, 0xffc21c);
    setPlayerOnFoot(world, 20, 158.5, Math.PI);
    boostDensityNear(world, 20, 150, 8, 12);
    stepN(world, 360);
    setPlayerOnFoot(world, 20, 158.5, Math.PI);
    stepN(world, 30);
  } else if (name === 'mission') {
    // After mission 2: $1000 / XP 250 / Missions 2/3, mission 3 in progress.
    world.money = 1000;
    world.xp = 250;
    world.missionsDone = 2;
    world.health = 100;
    startMission(world, 2);
    world.banner = 'HEAT ESCAPE COMPLETE +$600 +150 XP';
    world.bannerTimer = 99;
    world.wanted = 2;
    world.troubleTimer = 0;
    boostDensityNear(world, 150, -150, 3, 5);
    setPlayerOnFoot(world, 150, -150, Math.PI);
    stepN(world, 90);
    // Restage: the player faces the harbour crates with all three Vipers
    // large in the crosshair; their fire is held, then staggered so the
    // muzzle flashes are alive on the final frame.
    setPlayerOnFoot(world, 150, -132, Math.PI);
    placeVipers(world);
    stepN(world, 30);
    for (const e of world.enemies) e.holdFire = e.fireDelay || 0.02;
    stepN(world, 3);
    aimAtNearestEnemy(world);
    world.shootCooldown = 0;
    stepN(world, 3);
    // Player fires on the last steps so his own flash shows too.
    for (let i = 0; i < 3; i++) {
      aimAtNearestEnemy(world);
      world.input.pressed.add('KeyF');
      stepWorld(world, STEP);
    }
  } else if (name === 'title') {
    world.phase = 'title';
    boostDensityNear(world, 0, 0, 8, 10);
    stepN(world, 360);
    world.banner = '';
    world.bannerTimer = 0;
    world.message = '';
    world.messageTimer = 0;
  }
}
