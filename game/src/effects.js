// Pooled particle cloud (dust / smoke / sparks / muzzle flash) + skid marks.
// One THREE.Points, 600 slots, dead particles parked far below the city.
// The muzzle flash also gets a bright additive quad so it reads in a still.
import * as THREE from 'three';

const MAX_PARTICLES = 600;
const MAX_SKIDS = 90;

export function createEffects(scene, camera) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i++) positions[i * 3 + 1] = -100;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc21c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), flashMat);
  flash.visible = false;
  scene.add(flash);

  return {
    scene,
    camera,
    points,
    positions,
    colors,
    vel: new Float32Array(MAX_PARTICLES * 3),
    life: new Float32Array(MAX_PARTICLES),
    maxLife: new Float32Array(MAX_PARTICLES),
    cursor: 0,
    skids: [],
    skidGeo: new THREE.PlaneGeometry(0.5, 1.4),
    flash,
    flashTimer: 0,
  };
}

export function spawnParticle(effects, x, y, z, vx, vy, vz, life, r, g, b) {
  const i = effects.cursor;
  effects.cursor = (effects.cursor + 1) % MAX_PARTICLES;
  effects.positions[i * 3] = x;
  effects.positions[i * 3 + 1] = y;
  effects.positions[i * 3 + 2] = z;
  effects.vel[i * 3] = vx;
  effects.vel[i * 3 + 1] = vy;
  effects.vel[i * 3 + 2] = vz;
  effects.colors[i * 3] = r;
  effects.colors[i * 3 + 1] = g;
  effects.colors[i * 3 + 2] = b;
  effects.life[i] = life;
  effects.maxLife[i] = life;
}

export function burstDust(effects, x, y, z, n = 6) {
  for (let i = 0; i < n; i++) {
    spawnParticle(effects, x, y + 0.2, z,
      (Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 3,
      0.5 + Math.random() * 0.5, 0.72, 0.62, 0.45);
  }
}

export function burstSmoke(effects, x, y, z, n = 8) {
  for (let i = 0; i < n; i++) {
    spawnParticle(effects, x, y + 0.4, z,
      (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2,
      0.8 + Math.random() * 0.8, 0.25, 0.25, 0.25);
  }
}

export function burstSparks(effects, x, y, z, n = 10) {
  for (let i = 0; i < n; i++) {
    spawnParticle(effects, x, y, z,
      (Math.random() - 0.5) * 18, (Math.random() - 0.3) * 9, (Math.random() - 0.5) * 18,
      0.25 + Math.random() * 0.3, 1.0, 0.75, 0.15);
  }
}

// Big bright muzzle flash: a fan of hot sparks, a light puff, and a glowing
// quad at the muzzle so the shot reads in a still frame.
export function muzzleFlash(effects, x, y, z, dx, dy, dz) {
  for (let i = 0; i < 14; i++) {
    const spread = 0.35;
    spawnParticle(effects, x + dx * 0.4, y, z + dz * 0.4,
      dx * (14 + Math.random() * 10) + (Math.random() - 0.5) * spread * 20,
      dy * 12 + (Math.random() - 0.5) * 4,
      dz * (14 + Math.random() * 10) + (Math.random() - 0.5) * spread * 20,
      0.09 + Math.random() * 0.08, 1.0, 0.85, 0.3);
  }
  for (let i = 0; i < 6; i++) {
    spawnParticle(effects, x + dx * 0.7, y, z + dz * 0.7,
      (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4,
      0.12 + Math.random() * 0.1, 1.0, 0.95, 0.6);
  }
  if (effects.flash) {
    effects.flash.position.set(x + dx * 0.8, y, z + dz * 0.8);
    effects.flash.visible = true;
    effects.flashTimer = 0.08;
  }
}

export function dropSkid(effects, x, z, heading) {
  if (effects.skids.length >= MAX_SKIDS) {
    const old = effects.skids.shift();
    effects.scene.remove(old.mesh);
    old.mesh.material.dispose();
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 });
  const mesh = new THREE.Mesh(effects.skidGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -heading;
  mesh.position.set(x, 0.03, z);
  effects.scene.add(mesh);
  effects.skids.push({ mesh, life: 6 });
}

export function updateEffects(effects, dt) {
  const { positions, vel, life } = effects;
  if (effects.flashTimer > 0) {
    effects.flashTimer -= dt;
    effects.flash.material.opacity = Math.max(0, effects.flashTimer / 0.08);
    if (effects.camera) {
      effects.flash.lookAt(effects.camera.position);
      effects.flash.rotateZ(Math.PI / 4);
    }
    if (effects.flashTimer <= 0) effects.flash.visible = false;
  }
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) {
      positions[i * 3 + 1] = -100;
      continue;
    }
    vel[i * 3 + 1] -= 1.5 * dt;
    positions[i * 3] += vel[i * 3] * dt;
    positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
    positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
  }
  effects.points.geometry.attributes.position.needsUpdate = true;
  effects.points.geometry.attributes.color.needsUpdate = true;
  for (let i = effects.skids.length - 1; i >= 0; i--) {
    const s = effects.skids[i];
    s.life -= dt;
    if (s.life <= 0) {
      effects.scene.remove(s.mesh);
      s.mesh.material.dispose();
      effects.skids.splice(i, 1);
    } else if (s.life < 1.5) {
      s.mesh.material.opacity = 0.55 * (s.life / 1.5);
    }
  }
}
