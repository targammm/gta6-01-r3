// Procedural car models (sedan / taxi / van / pickup / police cruiser), arcade
// handling, entering and exiting cars, and the wanted heat a theft brings.
import * as THREE from 'three';
import { DRIVING, PALETTE } from './config.js';
import { clamp, damp } from './random.js';
import { collideBuildings, clampToCity } from './city.js';
import { burstDust, burstSmoke, dropSkid } from './effects.js';
import { playCrash } from './audio.js';

const BODY_COLORS = [0xc22a1e, 0x1e5ac2, 0x2a9d5e, 0xd8d8d8, 0x222222, 0x8a5ac2, 0xe07b1f, 0x3a7a8a];
const WHEEL_R = 0.38;

export function createCarMesh(type, colorHex) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  let bodyLen = 4.6;
  let bodyH = 0.85;
  let bodyY = 0.75;
  if (type === 'van') { bodyLen = 5.4; bodyH = 1.5; bodyY = 1.05; }
  if (type === 'pickup') { bodyLen = 5.2; }

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyLen), bodyMat);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);

  if (type !== 'van') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, bodyLen * 0.48), glassMat);
    cabin.position.set(0, bodyY + bodyH / 2 + 0.3, -bodyLen * 0.06);
    cabin.castShadow = true;
    group.add(cabin);
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.7), darkMat);
    bed.position.set(0, bodyY + bodyH / 2 + 0.1, bodyLen * 0.26);
    group.add(bed);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.28, 0.5),
      new THREE.MeshLambertMaterial({ color: PALETTE.taxiYellow, emissive: 0xaa7700, emissiveIntensity: 0.4 }),
    );
    sign.position.set(0, bodyY + bodyH + 0.75, -bodyLen * 0.06);
    group.add(sign);
  }
  if (type === 'cruiser') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, bodyLen * 0.9), darkMat);
    stripe.position.y = bodyY + 0.1;
    group.add(stripe);
  }

  // Headlights + taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd21f1f, emissive: 0xaa0000, emissiveIntensity: 0.6 });
  for (const side of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.12), headMat);
    head.position.set(side, 0.7, bodyLen / 2);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.12), tailMat);
    tail.position.set(side, 0.7, -bodyLen / 2);
    group.add(tail);
  }

  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 12);
  for (const [wx, wz] of [[-0.95, bodyLen / 2 - 0.8], [0.95, bodyLen / 2 - 0.8], [-0.95, -bodyLen / 2 + 0.8], [0.95, -bodyLen / 2 + 0.8]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, WHEEL_R, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Police light bar, red + blue, flashing in syncCarMesh.
  let lightL = null;
  let lightR = null;
  if (type === 'cruiser') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.5), darkMat);
    bar.position.set(0, bodyY + bodyH / 2 + 0.75, -bodyLen * 0.06);
    group.add(bar);
    lightL = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }),
    );
    lightL.position.set(-0.38, bodyY + bodyH / 2 + 0.78, -bodyLen * 0.06);
    group.add(lightL);
    lightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }),
    );
    lightR.position.set(0.38, bodyY + bodyH / 2 + 0.78, -bodyLen * 0.06);
    group.add(lightR);
  }

  return { group, wheels, lightL, lightR, type, bodyLen };
}

export function makeCar(world, type, x, z, heading, colorHex, driver) {
  const mesh = createCarMesh(type, colorHex);
  world.render.scene.add(mesh.group);
  const car = {
    type,
    x, z,
    heading,
    speed: 0,
    steer: 0,
    driver: driver || null,
    isPolice: type === 'cruiser',
    parked: driver === null,
    mesh,
    group: mesh.group,
    wheels: mesh.wheels,
    lightL: mesh.lightL,
    lightR: mesh.lightR,
    bodyLen: mesh.bodyLen,
    ai: null,
    ramCooldown: 0,
    skidCooldown: 0,
  };
  world.cars.push(car);
  syncCarMesh(car, 0, world.time);
  return car;
}

export function spawnParkedCar(world, type, x, z, heading = 0, colorHex = null) {
  const color = colorHex !== null ? colorHex : BODY_COLORS[Math.floor(world.rng() * BODY_COLORS.length)];
  return makeCar(world, type, x, z, heading, color, null);
}

export function spawnRandomCar(world, x, z, heading) {
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'pickup'];
  const type = types[Math.floor(world.rng() * types.length)];
  const color = type === 'taxi' ? PALETTE.taxiYellow : BODY_COLORS[Math.floor(world.rng() * BODY_COLORS.length)];
  return makeCar(world, type, x, z, heading, color, 'ai');
}

export function driveCar(world, car, dt, axes) {
  const speed = car.speed;
  const forward = speed >= 0 ? 1 : -1;
  if (axes.throttle) car.speed += DRIVING.accel * axes.throttle * dt;
  if (axes.reverse) {
    if (speed > 0.5) car.speed -= DRIVING.brake * dt;
    else car.speed -= DRIVING.reverseAccel * dt;
  }
  if (axes.brake) car.speed -= Math.sign(car.speed) * DRIVING.brake * dt;
  // Drag + grip: the car always travels along its heading (arcade).
  car.speed -= car.speed * DRIVING.drag * dt;
  car.speed = clamp(car.speed, -DRIVING.maxReverse, DRIVING.maxSpeed);
  if (Math.abs(car.speed) < 0.05 && !axes.throttle && !axes.reverse) car.speed = 0;

  const authority = clamp(Math.abs(car.speed) / 8, 0, 1);
  car.steer = damp(car.steer, axes.steer || 0, 10, dt);
  car.heading += car.steer * DRIVING.steer * authority * forward * dt;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideBuildings(world.city, nx, nz, 1.4);
  if (fixed.x !== nx || fixed.z !== nz) {
    if (Math.abs(car.speed) > 6) {
      car.speed *= -0.25;
      playCrash(world.audio, Math.min(1, Math.abs(car.speed) / 20));
      world.cameraShake = Math.max(world.cameraShake, 0.4);
      burstDust(world.effects, car.x, 0.4, car.z, 8);
    } else {
      car.speed *= 0.4;
    }
    car.x = fixed.x;
    car.z = fixed.z;
  } else {
    car.x = nx;
    car.z = nz;
  }
  const clamped = clampToCity(car.x, car.z, 3);
  car.x = clamped.x;
  car.z = clamped.z;

  // Bumping other cars slows you and shoves them.
  for (const other of world.cars) {
    if (other === car) continue;
    const d = Math.hypot(other.x - car.x, other.z - car.z);
    if (d < 3.2 && d > 0.01) {
      const push = (3.2 - d) * 0.5;
      const ux = (other.x - car.x) / d;
      const uz = (other.z - car.z) / d;
      other.x += ux * push;
      other.z += uz * push;
      if (Math.abs(car.speed) > 8) {
        playCrash(world.audio, 0.5);
        world.cameraShake = Math.max(world.cameraShake, 0.25);
      }
      car.speed *= 0.85;
    }
  }

  // Skid marks + dust on hard fast turns.
  if (Math.abs(car.steer) > 0.7 && Math.abs(car.speed) > 12) {
    car.skidCooldown -= dt;
    if (car.skidCooldown <= 0) {
      car.skidCooldown = 0.09;
      dropSkid(world.effects, car.x - Math.sin(car.heading) * 1.6, car.z - Math.cos(car.heading) * 1.6, car.heading);
      burstDust(world.effects, car.x, 0.3, car.z, 3);
    }
  }

  syncCarMesh(car, dt, world.time);
}

export function syncCarMesh(car, dt, time) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = (car.speed * dt) / WHEEL_R;
  for (const wheel of car.wheels) wheel.rotation.x += spin;
  if (car.isPolice && car.lightL && car.lightR) {
    const phase = Math.floor((time || 0) * 4) % 2 === 0;
    car.lightL.material.emissiveIntensity = phase ? 2.2 : 0.15;
    car.lightR.material.emissiveIntensity = phase ? 0.15 : 2.2;
  }
}

export function addWanted(world, n) {
  world.wanted = clamp(world.wanted + n, 0, 5);
  world.troubleTimer = 0;
}

export function tryEnterCar(world) {
  const p = world.player;
  if (p.inCar) {
    exitCar(world);
    return;
  }
  let best = null;
  let bestD = DRIVING.enterRadius;
  for (const car of world.cars) {
    if (car.driver) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return;
  best.driver = 'player';
  best.parked = false;
  p.inCar = best;
  p.camYaw = best.heading + Math.PI;
  if (best.isPolice) {
    world.message = 'Cruiser commandeered!';
    world.messageTimer = 3;
  } else {
    addWanted(world, 1);
    world.stolenCars++;
    world.message = 'Car stolen';
    world.messageTimer = 3;
  }
}

export function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  p.inCar = null;
  p.x = car.x + Math.cos(car.heading) * DRIVING.exitOffset;
  p.z = car.z - Math.sin(car.heading) * DRIVING.exitOffset;
  p.y = 0;
  p.vy = 0;
  p.onGround = true;
  p.camYaw = car.heading + Math.PI;
  world.message = 'E — GET OUT • W/S drive • Space brake';
  world.messageTimer = 2;
}
