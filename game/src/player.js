// Rico Vale on foot and behind the wheel: third-person movement, jumping,
// the chase camera, and the slow title orbit.
import * as THREE from 'three';
import { PLAYER, DRIVING } from './config.js';
import { clamp, damp, angleLerp } from './random.js';
import { readMoveAxes, isDown, wasPressed } from './input.js';
import { collideBuildings, clampToCity } from './city.js';
import { driveCar, syncCarMesh } from './vehicles.js';
import { burstDust } from './effects.js';

export function fwd(a) {
  return { x: Math.sin(a), z: Math.cos(a) };
}

export function createPlayer(scene) {
  const group = new THREE.Group();

  const jacket = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0x0f766e }),
  );
  jacket.position.y = 1.15;
  jacket.castShadow = true;
  group.add(jacket);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.95;
  head.castShadow = true;
  group.add(head);

  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.36, 0.16, 14),
    new THREE.MeshLambertMaterial({ color: 0xffc21c }),
  );
  hat.position.y = 2.18;
  group.add(hat);

  const legMat = new THREE.MeshLambertMaterial({ color: 0x1e2a4a });
  for (const side of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.75, 8), legMat);
    leg.position.set(side, 0.38, 0);
    group.add(leg);
  }

  scene.add(group);
  return {
    group,
    x: 0, z: 40, y: 0,
    heading: Math.PI,
    camYaw: 0,
    camPitch: 0.25,
    camDrift: 0,
    vy: 0,
    onGround: true,
    speed: 0,
    speedKmh: 0,
    walkPhase: 0,
    inCar: null,
    health: 100,
  };
}

export function updatePlayer(world, dt) {
  const p = world.player;
  const input = world.input;
  const axes = readMoveAxes(input);
  const running = isDown(input, 'ShiftLeft') || isDown(input, 'ShiftRight');
  const targetSpeed = (axes.x !== 0 || axes.z !== 0)
    ? (running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;

  // Movement is relative to the camera view direction.
  const view = fwd(p.camYaw + Math.PI);
  const right = { x: -view.z, z: view.x };
  let mx = view.x * axes.z + right.x * axes.x;
  let mz = view.z * axes.z + right.z * axes.x;
  const mLen = Math.hypot(mx, mz);
  if (mLen > 0.01) {
    mx /= mLen;
    mz /= mLen;
    p.heading = angleLerp(p.heading, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
  }
  p.speed = damp(p.speed, targetSpeed, 12, dt);
  p.x += mx * p.speed * dt;
  p.z += mz * p.speed * dt;
  p.speedKmh = Math.abs(p.speed) * 3.6;

  // Jump + gravity.
  if (wasPressed(input, 'Space') && p.onGround) {
    p.vy = PLAYER.jumpSpeed;
    p.onGround = false;
  }
  if (!p.onGround) {
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
      burstDust(world.effects, p.x, 0.1, p.z, 4);
    }
  }

  // Building collision + city bounds.
  const fixed = collideBuildings(world.city, p.x, p.z, PLAYER.radius);
  if (fixed.x !== p.x || fixed.z !== p.z) {
    p.x = fixed.x;
    p.z = fixed.z;
    p.speed *= 0.4;
  }
  const clamped = clampToCity(p.x, p.z, 2);
  p.x = clamped.x;
  p.z = clamped.z;

  // Health regen while calm on foot.
  if (world.wanted < 1 && world.health < PLAYER.maxHealth) {
    world.health = Math.min(PLAYER.maxHealth, world.health + PLAYER.regenPerSec * dt);
  }

  // Walk bob + dust.
  if (p.speed > 0.5) {
    p.walkPhase += dt * p.speed * 1.6;
    if (Math.random() < 0.06) burstDust(world.effects, p.x, 0.1, p.z, 2);
  }

  // Mouse orbit.
  p.camYaw -= input.mouseDX * 0.0032;
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.15, 0.9);

  p.group.position.set(p.x, p.y + Math.abs(Math.sin(p.walkPhase)) * 0.08, p.z);
  p.group.rotation.y = p.heading;
  p.group.visible = !p.inCar;
}

export function updateDriving(world, dt) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  const input = world.input;
  const axes = { throttle: 0, reverse: 0, steer: 0, brake: 0 };
  const keys = input.keys;
  if (keys.has('KeyW') || keys.has('ArrowUp')) axes.throttle = 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) axes.reverse = 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) axes.steer -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) axes.steer += 1;
  if (keys.has('Space')) axes.brake = 1;
  driveCar(world, car, dt, axes);
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.speed = car.speed;
  p.speedKmh = Math.abs(car.speed) * 3.6;

  // Driving camera: yaw follows the car, mouse adds a small drift.
  p.camDrift = clamp(p.camDrift + input.mouseDX * 0.0032, -0.6, 0.6);
  p.camDrift = damp(p.camDrift, 0, 0.4, dt);
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.15, 0.9);
  p.camYaw = angleLerp(p.camYaw, car.heading + Math.PI + p.camDrift, 1 - Math.exp(-4 * dt));
}

export function updateCamera(world, dt) {
  const render = world.render;
  const camera = render.camera;
  const p = world.player;

  if (world.phase === 'title') {
    const t = world.time;
    const a = (t / 126) * Math.PI * 2;
    camera.position.set(Math.cos(a) * 130, 72, Math.sin(a) * 130);
    camera.lookAt(0, 10, 0);
    return;
  }

  const inCar = !!p.inCar;
  const back = inCar ? 9.5 : 7.5;
  const height = (inCar ? 4.2 : 3.4) + p.camPitch * 4;
  const ahead = inCar ? 8 : 4;
  const dir = fwd(p.camYaw);
  const tx = inCar ? p.inCar.x : p.x;
  const tz = inCar ? p.inCar.z : p.z;
  const ty = inCar ? 0 : p.y;

  const cx = tx + dir.x * back;
  const cz = tz + dir.z * back;
  const cy = ty + height;
  camera.position.set(
    damp(camera.position.x, cx, 7, dt),
    damp(camera.position.y, cy, 7, dt),
    damp(camera.position.z, cz, 7, dt),
  );
  const lx = tx - dir.x * ahead;
  const lz = tz - dir.z * ahead;
  camera.lookAt(lx, ty + 1.7, lz);

  if (world.cameraShake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * world.cameraShake * 0.6;
    camera.position.y += (Math.random() - 0.5) * world.cameraShake * 0.6;
    world.cameraShake = Math.max(0, world.cameraShake - 1.8 * dt);
  }
}

export { syncCarMesh, DRIVING };
