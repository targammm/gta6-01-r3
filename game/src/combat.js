// Pistol combat: the player's ray-cast shots, Viper enemy AI that stalks and
// shoots back, and the close-range punch.
import * as THREE from 'three';
import { COMBAT, WANTED } from './config.js';
import { clamp } from './random.js';
import { burstSparks, muzzleFlash } from './effects.js';
import { playGunshot } from './audio.js';
import { addWanted } from './vehicles.js';

export function createCombat(world) {
  world.enemies = [];
  world.shotsFired = 0;
  world.shootCooldown = 0;
  world.punchCooldown = 0;
}

export function spawnEnemy(world, x, z) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0x141414 }),
  );
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);
  // Red Viper band across the chest.
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.22, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xd21f1f, emissive: 0x881111, emissiveIntensity: 0.5 }),
  );
  band.position.y = 1.3;
  group.add(band);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.95;
  group.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  gun.position.set(0.3, 1.35, 0.45);
  group.add(gun);
  group.position.set(x, 0, z);
  world.render.scene.add(group);
  const enemy = {
    x, z, heading: 0,
    health: COMBAT.enemyHealth,
    fireTimer: 1 + Math.random() * 0.5,
    holdFire: 0,
    group,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
  };
  world.enemies.push(enemy);
  return enemy;
}

// Ray from the camera through the crosshair; spheres approximate the targets.
export function rayHit(world, origin, dir) {
  let best = null;
  let bestT = COMBAT.pistolRange;
  const testSphere = (cx, cy, cz, r, kind, target) => {
    const ox = cx - origin.x;
    const oy = cy - origin.y;
    const oz = cz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > bestT) return;
    const px = origin.x + dir.x * t;
    const py = origin.y + dir.y * t;
    const pz = origin.z + dir.z * t;
    const d = Math.hypot(cx - px, cy - py, cz - pz);
    if (d < r) {
      bestT = t;
      best = { kind, target, point: { x: px, y: py, z: pz }, t };
    }
  };
  for (const e of world.enemies) testSphere(e.x, 1.3, e.z, 1.1, 'enemy', e);
  for (const car of world.cars) {
    if (car === world.player.inCar) continue;
    testSphere(car.x, 1.0, car.z, 2.2, 'car', car);
  }
  return best;
}

export function playerShoot(world) {
  if (world.shootCooldown > 0) return;
  world.shootCooldown = COMBAT.pistolFireRate;
  world.shotsFired++;
  const p = world.player;
  const camera = world.render.camera;
  const origin = camera.position;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = rayHit(world, origin, dir);
  const gunX = p.x + Math.sin(p.heading) * 0.6;
  const gunZ = p.z + Math.cos(p.heading) * 0.6;
  muzzleFlash(world.effects, gunX, 1.4, gunZ, Math.sin(p.heading), 0, Math.cos(p.heading));
  playGunshot(world.audio);
  if (world.wanted === 0) addWanted(world, WANTED.shoot);
  if (!hit) return;
  if (hit.kind === 'enemy') {
    hit.target.health -= COMBAT.pistolDamage;
    burstSparks(world.effects, hit.point.x, hit.point.y, hit.point.z, 10);
    if (hit.target.health <= 0) killEnemy(world, hit.target);
  } else if (hit.kind === 'car') {
    hit.target.speed *= 0.4;
    burstSparks(world.effects, hit.point.x, hit.point.y, hit.point.z, 6);
  }
}

export function killEnemy(world, enemy) {
  const i = world.enemies.indexOf(enemy);
  if (i !== -1) world.enemies.splice(i, 1);
  burstSparks(world.effects, enemy.x, 1.2, enemy.z, 16);
  world.render.scene.remove(enemy.group);
  world.xp += COMBAT.killXp;
  world.message = `Viper down! +${COMBAT.killXp} XP`;
  world.messageTimer = 3;
  addWanted(world, WANTED.kill);
}

export function updateEnemies(world, dt) {
  const p = world.player;
  for (const e of [...world.enemies]) {
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    const wantAngle = Math.atan2(p.x - e.x, p.z - e.z);
    let dh = wantAngle - e.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    e.heading += clamp(dh, -3 * dt, 3 * dt);
    // Close in past 10 m, strafe up close.
    if (d > 10) {
      e.x += Math.sin(e.heading) * COMBAT.enemySpeed * dt;
      e.z += Math.cos(e.heading) * COMBAT.enemySpeed * dt;
    } else {
      const strafe = Math.PI / 2 * e.strafeDir;
      e.x += Math.sin(e.heading + strafe) * 1.6 * dt;
      e.z += Math.cos(e.heading + strafe) * 1.6 * dt;
      if (Math.random() < dt * 0.2) e.strafeDir *= -1;
    }
    e.group.position.set(e.x, 0, e.z);
    e.group.rotation.y = e.heading;
    // Shoot back — unless staging is holding fire for the final frame.
    if (e.holdFire > 0) {
      e.holdFire -= dt;
      continue;
    }
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && d < COMBAT.enemyRange) {
      e.fireTimer = COMBAT.enemyFireRate * (0.8 + Math.random() * 0.5);
      const gx = e.x + Math.sin(e.heading) * 0.6;
      const gz = e.z + Math.cos(e.heading) * 0.6;
      muzzleFlash(world.effects, gx, 1.4, gz, Math.sin(e.heading), 0, Math.cos(e.heading));
      playGunshot(world.audio);
      if (Math.random() < 0.45) {
        world.health = Math.max(0, world.health - COMBAT.enemyDamage);
        world.cameraShake = Math.max(world.cameraShake, 0.2);
        burstSparks(world.effects, p.x, 1.2, p.z, 4);
        if (world.health <= 0) world.phase = 'dead';
      }
    }
  }
}

export function playerPunch(world) {
  if (world.punchCooldown > 0 || world.player.inCar) return;
  world.punchCooldown = 0.5;
  const p = world.player;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  for (const e of [...world.enemies]) {
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < 2.4 && side < 1.2) {
      e.health -= 12;
      burstSparks(world.effects, e.x, 1.2, e.z, 6);
      if (e.health <= 0) killEnemy(world, e);
    }
  }
}
