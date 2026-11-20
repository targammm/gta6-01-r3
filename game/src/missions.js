// The three-mission story chain: Package Run, Heat Escape, Harbor Showdown.
// Beacons mark the target, rewards pay out, and the next mission starts at once.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { dist2D } from './random.js';
import { spawnEnemy } from './combat.js';
import { playMissionComplete, playPickup } from './audio.js';
import { writeSave } from './save.js';
import { addWanted } from './vehicles.js';

export function createMissions(world) {
  world.missionIndex = world.missionsDone;
  world.missionStep = 0;
  world.missionBeacon = null;
  world.missionRing = null;
  if (world.missionsDone < MISSIONS.length) {
    startMission(world, world.missionsDone);
  }
}

export function startMission(world, index) {
  world.missionIndex = index;
  world.missionStep = 0;
  const m = MISSIONS[index];
  if (!m) return;
  world.banner = `${m.name} — ${m.story}`;
  world.bannerTimer = 5;
  world.message = m.steps[0].label;
  world.messageTimer = 4;
  if (m.id === 'heat-escape') {
    addWanted(world, 3);
  }
  placeMissionBeacon(world);
}

export function placeMissionBeacon(world) {
  removeMissionBeacon(world);
  const step = currentStep(world);
  if (!step || step.type !== 'goto') return;
  const scene = world.render.scene;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beacon.position.set(step.x, 30, step.z);
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 6.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(step.x, 0.08, step.z);
  scene.add(ring);
  world.missionBeacon = beacon;
  world.missionRing = ring;
}

export function removeMissionBeacon(world) {
  if (world.missionBeacon) {
    world.render.scene.remove(world.missionBeacon);
    world.missionBeacon = null;
  }
  if (world.missionRing) {
    world.render.scene.remove(world.missionRing);
    world.missionRing = null;
  }
}

export function currentStep(world) {
  const m = MISSIONS[world.missionIndex];
  if (!m) return null;
  return m.steps[world.missionStep] || null;
}

export function currentObjective(world) {
  if (world.missionIndex >= MISSIONS.length) return 'Free roam — Solmar Bay is yours';
  const m = MISSIONS[world.missionIndex];
  const step = currentStep(world);
  if (!step) return m.name;
  return `${m.name}: ${step.label}`;
}

export function missionTargetPos(world) {
  const step = currentStep(world);
  if (!step || step.type !== 'goto') return null;
  return { x: step.x, z: step.z };
}

export function advanceMissionStep(world) {
  const m = MISSIONS[world.missionIndex];
  if (!m) return;
  world.missionStep++;
  if (world.missionStep >= m.steps.length) {
    completeMission(world);
    return;
  }
  const step = currentStep(world);
  world.message = step.label;
  world.messageTimer = 4;
  if (step.type === 'fight') {
    removeMissionBeacon(world);
    spawnMissionEnemies(world);
  } else {
    placeMissionBeacon(world);
  }
}

export function completeMission(world) {
  const m = MISSIONS[world.missionIndex];
  if (!m) return;
  world.money += m.reward;
  world.xp += m.xp;
  world.missionsDone = world.missionIndex + 1;
  world.banner = `${m.name} COMPLETE +$${m.reward} +${m.xp} XP`;
  world.bannerTimer = 5;
  playMissionComplete(world.audio);
  writeSave(world);
  removeMissionBeacon(world);
  if (world.missionsDone >= MISSIONS.length) {
    world.missionIndex = MISSIONS.length;
    world.missionStep = 0;
    world.message = 'STORY COMPLETE — Rico Vale owns Solmar Bay. Free roam!';
    world.messageTimer = 6;
  } else {
    startMission(world, world.missionsDone);
  }
}

export function updateMissions(world, dt) {
  if (world.missionIndex >= MISSIONS.length) return;
  const step = currentStep(world);
  if (!step) return;
  const p = world.player;
  if (step.type === 'goto') {
    if (dist2D(p.x, p.z, step.x, step.z) < step.radius) {
      playPickup(world.audio);
      advanceMissionStep(world);
    }
  } else if (step.type === 'escape') {
    if (world.wanted <= 0) advanceMissionStep(world);
  } else if (step.type === 'fight') {
    if (world.enemies.length === 0) advanceMissionStep(world);
  }
  // Beacon pulse.
  if (world.missionRing) {
    const t = world.time;
    const s = 1 + Math.sin(t * 3) * 0.12;
    world.missionRing.scale.set(s, s, 1);
    world.missionRing.material.opacity = 0.28 + Math.sin(t * 3) * 0.1;
  }
}

export function spawnMissionEnemies(world) {
  const spots = [[-8, -6], [7, -9], [2, 8]];
  for (const [ox, oz] of spots) {
    spawnEnemy(world, 150 + ox, -150 + oz);
  }
}

export function restartMission(world) {
  world.wanted = 0;
  world.health = 100;
  for (const cop of [...world.cops]) {
    const i = world.cops.indexOf(cop);
    if (i !== -1) world.cops.splice(i, 1);
    const j = world.cars.indexOf(cop);
    if (j !== -1) world.cars.splice(j, 1);
    world.render.scene.remove(cop.group);
  }
  startMission(world, world.missionIndex);
}
