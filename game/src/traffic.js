// AI traffic that follows the avenues and pedestrians that walk the sidewalks —
// plus the shot-local density boost that packs extra life around the camera.
import * as THREE from 'three';
import { WORLD, TRAFFIC_COUNT, PED_COUNT, SHOT_TRAFFIC_BOOST, SHOT_PED_BOOST } from './config.js';
import { clamp, damp } from './random.js';
import { collideBuildings, clampToCity, nearestRoadCoord } from './city.js';
import { makeCar, spawnRandomCar } from './vehicles.js';
import { burstDust } from './effects.js';

const PED_COLORS = [0xd94f3d, 0x3d7ad9, 0x3dd97a, 0xd9b23d, 0x9b3dd9, 0xd97ab2, 0x3dd9c2, 0xe8e8e8];

export function createTraffic(world) {
  world.traffic = [];
  world.peds = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    spawnTrafficCar(world);
  }
  for (let i = 0; i < PED_COUNT; i++) {
    spawnPedestrian(world);
  }
}

function randomRoadPoint(world) {
  const vertical = world.rng() < 0.5;
  const road = WORLD.roads[Math.floor(world.rng() * WORLD.roads.length)];
  const along = -190 + world.rng() * 380;
  return vertical ? { x: road, z: along } : { x: along, z: road };
}

export function spawnTrafficCar(world, nearX = null, nearZ = null) {
  let x;
  let z;
  let heading;
  if (nearX !== null) {
    // Spawn on the nearest avenue to the focus point, within ±45 m of it.
    const vertical = world.rng() < 0.5;
    const road = nearestRoadCoord(vertical ? nearX : nearZ);
    const off = (world.rng() - 0.5) * 90;
    x = vertical ? road + (world.rng() < 0.5 ? 3.2 : -3.2) : nearX + off;
    z = vertical ? nearZ + off : road + (world.rng() < 0.5 ? 3.2 : -3.2);
    heading = vertical ? (world.rng() < 0.5 ? 0 : Math.PI) : (world.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  } else {
    const pt = randomRoadPoint(world);
    x = pt.x;
    z = pt.z;
    heading = Math.abs(x) > Math.abs(z) && Math.abs(pt.x - nearestRoadCoord(pt.x)) < 1
      ? 0 : Math.PI / 2;
    heading = world.rng() < 0.5 ? heading : heading + Math.PI;
  }
  const car = spawnRandomCar(world, x, z, heading);
  car.ai = {
    axis: Math.abs(Math.sin(heading)) > 0.5 ? 'x' : 'z',
    dir: 1,
    road: 0,
    targetSpeed: 9 + world.rng() * 6,
  };
  car.ai.axis = Math.abs(Math.sin(heading)) > 0.5 ? 'x' : 'z';
  car.ai.road = nearestRoadCoord(car.ai.axis === 'x' ? car.z : car.x);
  car.ai.dir = car.ai.axis === 'x' ? Math.sign(Math.sin(heading)) || 1 : Math.sign(Math.cos(heading)) || 1;
  world.traffic.push(car);
  return car;
}

export function spawnPedestrian(world, nearX = null, nearZ = null) {
  const group = world.render.scene;
  let x;
  let z;
  if (nearX !== null) {
    const a = world.rng() * Math.PI * 2;
    const r = 8 + world.rng() * 47;
    x = nearX + Math.cos(a) * r;
    z = nearZ + Math.sin(a) * r;
  } else {
    const road = WORLD.roads[Math.floor(world.rng() * WORLD.roads.length)];
    const along = -190 + world.rng() * 380;
    const side = world.rng() < 0.5 ? 10.2 : -10.2;
    if (world.rng() < 0.5) { x = road + side; z = along; } else { x = along; z = road + side; }
  }
  x = clamp(x, -205, 205);
  z = clamp(z, -205, 172);
  const color = PED_COLORS[Math.floor(world.rng() * PED_COLORS.length)];
  const mesh = createPedMesh(color);
  group.add(mesh.group);
  const ped = {
    x, z, heading: world.rng() * Math.PI * 2,
    speed: 1.1 + world.rng() * 1.0,
    state: 'walk',
    fleeTimer: 0,
    road: nearestRoadCoord(world.rng() < 0.5 ? x : z),
    axis: world.rng() < 0.5 ? 'x' : 'z',
    dir: world.rng() < 0.5 ? 1 : -1,
    group: mesh.group,
    bob: world.rng() * 6,
  };
  world.peds.push(ped);
  return ped;
}

function createPedMesh(colorHex) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.6, 4, 10),
    new THREE.MeshLambertMaterial({ color: colorHex }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.75;
  group.add(head);
  return { group };
}

// Shot-local density boost: extra cars + pedestrians around (cx, cz), used only
// by the staged screenshots — never a global count change.
export function boostDensityNear(world, cx, cz, carCount, pedCount) {
  for (let i = 0; i < carCount; i++) spawnTrafficCar(world, cx, cz);
  for (let i = 0; i < pedCount; i++) spawnPedestrian(world, cx, cz);
}

export function carAheadBlocked(world, car, maxDist, width) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    if (along > 0.5 && along < maxDist) {
      const side = Math.abs(dx * fz - dz * fx);
      if (side < width) return true;
    }
  }
  const p = world.player;
  if (!p.inCar) {
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const along = dx * fx + dz * fz;
    if (along > 0.5 && along < maxDist && Math.abs(dx * fz - dz * fx) < width) return true;
  }
  return false;
}

export function updateTraffic(world, dt) {
  for (const car of world.traffic) {
    const ai = car.ai;
    if (!ai) continue;
    const blocked = carAheadBlocked(world, car, 9, 2.4);
    const want = blocked ? 0 : ai.targetSpeed;
    car.speed = damp(car.speed, want, blocked ? 14 : 8, dt);
    // Steer back onto the avenue line.
    const linePos = ai.axis === 'x' ? car.z : car.x;
    const off = linePos - ai.road;
    const steerTo = clamp(-off * 0.12, -0.5, 0.5);
    const targetHeading = ai.axis === 'x'
      ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ai.dir > 0 ? 0 : Math.PI);
    let dh = targetHeading - car.heading + steerTo;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Turn at intersections, sometimes.
    const onCrossX = WORLD.roads.some((r) => Math.abs(car.x - r) < 2);
    const onCrossZ = WORLD.roads.some((r) => Math.abs(car.z - r) < 2);
    if (onCrossX && onCrossZ && world.rng() < 0.012) {
      ai.axis = ai.axis === 'x' ? 'z' : 'x';
      ai.dir = world.rng() < 0.5 ? 1 : -1;
      ai.road = nearestRoadCoord(ai.axis === 'x' ? car.z : car.x);
    }
    // Wrap around the city edge.
    if (car.x > 205) car.x = -205;
    if (car.x < -205) car.x = 205;
    if (car.z > 205) car.z = -205;
    if (car.z < -205) car.z = 205;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.38;
    for (const wheel of car.wheels) wheel.rotation.x += spin;
  }
}

export function updatePedestrians(world, dt) {
  const p = world.player;
  const playerCar = p.inCar;
  for (const ped of world.peds) {
    // Flee the player's car when it gets close.
    const px = playerCar ? playerCar.x : p.x;
    const pz = playerCar ? playerCar.z : p.z;
    const dCar = Math.hypot(ped.x - px, ped.z - pz);
    if (playerCar && dCar < 6) {
      ped.state = 'flee';
      ped.fleeTimer = 1.2;
      const a = Math.atan2(ped.x - px, ped.z - pz);
      ped.heading = a;
    }
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    const speed = ped.fleeTimer > 0 ? 3.4 : ped.speed;
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    ped.bob += dt * speed * 3;
    // Turn at intersections, sometimes.
    const onCrossX = WORLD.roads.some((r) => Math.abs(ped.x - r) < 2);
    const onCrossZ = WORLD.roads.some((r) => Math.abs(ped.z - r) < 2);
    if (onCrossX && onCrossZ && world.rng() < 0.008 && ped.fleeTimer <= 0) {
      ped.heading += (world.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    // Buildings turn pedestrians around; the beach and the city edge too.
    if (world.city && world.city.buildings) {
      const hit = world.city.buildings.some((b) =>
        ped.x > b.x0 - 0.5 && ped.x < b.x1 + 0.5 && ped.z > b.z0 - 0.5 && ped.z < b.z1 + 0.5);
      if (hit) ped.heading += Math.PI;
    }
    const clamped = clampToCity(ped.x, ped.z, 2);
    if (clamped.x !== ped.x || clamped.z !== ped.z) {
      ped.x = clamped.x;
      ped.z = clamped.z;
      ped.heading += Math.PI;
    }
    if (ped.z > 172) { ped.z = 172; ped.heading += Math.PI; }
    ped.group.position.set(ped.x, Math.abs(Math.sin(ped.bob)) * 0.05, ped.z);
    ped.group.rotation.y = ped.heading;
  }
}

export { SHOT_TRAFFIC_BOOST, SHOT_PED_BOOST };
