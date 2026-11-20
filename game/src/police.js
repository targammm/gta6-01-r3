// Wanted level, police cruiser spawns, the chase, ramming and the BUSTED bust.
import { WORLD, WANTED, MAX_POLICE } from './config.js';
import { clamp, damp } from './random.js';
import { makeCar, addWanted } from './vehicles.js';
import { collideBuildings, clampToCity } from './city.js';
import { burstDust } from './effects.js';
import { playCrash } from './audio.js';

export function createPolice(world) {
  world.cops = [];
  world.policeSpawnTimer = 0;
  world.bustedTimer = 0;
}

export function spawnPoliceCar(world, mode = 'random') {
  const p = world.player;
  let x;
  let z;
  if (mode === 'front') {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    x = p.x + fx * 24 + fz * 4;
    z = p.z + fz * 24 - fx * 4;
  } else if (mode === 'side') {
    x = p.x + 5;
    z = p.z - 4;
  } else {
    const a = world.rng() * Math.PI * 2;
    const d = 55 + world.rng() * 25;
    x = p.x + Math.cos(a) * d;
    z = p.z + Math.sin(a) * d;
  }
  const clamped = clampToCity(x, z, 6);
  const car = makeCar(world, 'cruiser', clamped.x, clamped.z, p.heading, 0xf2f2f2, 'police');
  car.speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
  world.cops.push(car);
  return car;
}

// How many cruisers the current wanted level calls for.
export function wantedCruiserCount(wanted) {
  if (wanted < 1) return 0;
  return Math.min(MAX_POLICE, 1 + Math.floor(wanted));
}

export function updateWantedLevel(world, dt) {
  const want = wantedCruiserCount(world.wanted);
  if (world.wanted >= 1) {
    // The first cruiser answers fast so the heat is felt at once; later
    // cruisers join on the per-level schedule.
    if (world.cops.length === 0) {
      spawnPoliceCar(world, 'random');
      world.policeSpawnTimer = WANTED.spawnDelayByLevel[Math.min(5, Math.floor(world.wanted))];
    } else if (world.cops.length < want) {
      world.policeSpawnTimer -= dt;
      if (world.policeSpawnTimer <= 0) {
        spawnPoliceCar(world, 'random');
        world.policeSpawnTimer = WANTED.spawnDelayByLevel[Math.min(5, Math.floor(world.wanted))];
      }
    }
    // Heat cools after a quiet stretch with no cruiser nearby.
    world.troubleTimer += dt;
    const nearest = nearestCopDist(world);
    if (world.troubleTimer > WANTED.decayDelay && (world.cops.length === 0 || nearest > 70)) {
      world.wanted = Math.max(0, world.wanted - WANTED.decayRate * dt);
      if (world.wanted < 0.4) {
        world.wanted = 0;
        world.message = 'You lost them';
        world.messageTimer = 3;
      }
    }
  } else if (world.cops.length > 0) {
    // No heat: the farthest cruiser peels off, one at a time.
    const far = world.cops[world.cops.length - 1];
    removeCop(world, far);
  }
}

export function nearestCopDist(world) {
  const p = world.player;
  let best = Infinity;
  for (const cop of world.cops) {
    best = Math.min(best, Math.hypot(cop.x - p.x, cop.z - p.z));
  }
  return best;
}

export function removeCop(world, cop) {
  const i = world.cops.indexOf(cop);
  if (i !== -1) world.cops.splice(i, 1);
  const j = world.cars.indexOf(cop);
  if (j !== -1) world.cars.splice(j, 1);
  world.render.scene.remove(cop.group);
}

export function updatePoliceChase(world, dt) {
  const p = world.player;
  const level = Math.min(5, Math.floor(world.wanted));
  const targetSpeed = WANTED.policeSpeedByLevel[level] || 0;
  for (const cop of [...world.cops]) {
    // Steer toward the player, up to 2.2 rad/s.
    const wantAngle = Math.atan2(p.x - cop.x, p.z - cop.z);
    let dh = wantAngle - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    cop.speed = damp(cop.speed, targetSpeed, 1.2, dt);
    const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
    const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
    const fixed = collideBuildings(world.city, nx, nz, 1.4);
    if (fixed.x !== nx || fixed.z !== nz) {
      // Stuck on a building: back up and turn away.
      cop.speed = -6;
      cop.heading += 1.2 * dt * 10;
      cop.x = fixed.x;
      cop.z = fixed.z;
    } else {
      cop.x = nx;
      cop.z = nz;
    }
    const clamped = clampToCity(cop.x, cop.z, 3);
    cop.x = clamped.x;
    cop.z = clamped.z;
    cop.group.position.set(cop.x, 0, cop.z);
    cop.group.rotation.y = cop.heading;
    const spin = (cop.speed * dt) / 0.38;
    for (const wheel of cop.wheels) wheel.rotation.x += spin;

    // Ram: close in and shove the player's car, or hurt the player on foot.
    const d = Math.hypot(p.x - cop.x, p.z - cop.z);
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
    if (d < 4 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 1.2;
      if (p.inCar) {
        p.inCar.speed *= 0.94;
        world.cameraShake = Math.max(world.cameraShake, 0.35);
        playCrash(world.audio, 0.6);
        burstDust(world.effects, cop.x, 0.5, cop.z, 6);
      } else if (world.health > 0) {
        world.health = Math.max(0, world.health - 1);
        world.cameraShake = Math.max(world.cameraShake, 0.35);
      }
    }

    // BUSTED: a cruiser sits on the player on foot for 2.5 s.
    if (!p.inCar && d < 3) {
      world.bustedTimer += dt;
      if (world.bustedTimer >= 2.5) {
        world.phase = 'busted';
        world.bustedTimer = 0;
        return;
      }
    } else {
      world.bustedTimer = Math.max(0, world.bustedTimer - dt * 2);
    }
  }
}

export { addWanted };
