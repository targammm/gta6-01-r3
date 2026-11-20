// World state + the fixed 1/60 s step: the order every system runs in, the
// autopilot hook the staged shots use, and start / respawn / restart.
import { createSeededRandom, angleLerp } from './random.js';
import { createRender, renderFrame } from './render.js';
import { createCity } from './city.js';
import { createInput, wasPressed, endInputStep } from './input.js';
import { createPlayer, updatePlayer, updateDriving, updateCamera } from './player.js';
import { createEffects, updateEffects } from './effects.js';
import { createAudio, ensureAudio, updateEngineSound, updateSirenSound, updateMusic, setMuted } from './audio.js';
import { createHud, updateHud } from './hud.js';
import { createTraffic, updateTraffic, updatePedestrians } from './traffic.js';
import { createPolice, updateWantedLevel, updatePoliceChase } from './police.js';
import { createMissions, updateMissions, restartMission } from './missions.js';
import { createCombat, updateEnemies, playerShoot, playerPunch, spawnEnemy, killEnemy } from './combat.js';
import { driveCar, spawnParkedCar, tryEnterCar } from './vehicles.js';
import { loadSave, writeSave, applySaveToState } from './save.js';

export function createWorld(canvas, seed) {
  const world = {
    seed,
    rng: createSeededRandom(seed),
    phase: 'title',
    time: 0,
    money: 0,
    xp: 0,
    missionsDone: 0,
    bestMoney: 0,
    wanted: 0,
    troubleTimer: 0,
    health: 100,
    stolenCars: 0,
    cameraShake: 0,
    banner: '',
    bannerTimer: 0,
    message: '',
    messageTimer: 0,
    saveTimer: 0,
    autopilot: null,
    saveInfo: null,
    cars: [],
  };
  world.render = createRender(canvas);
  world.scene = world.render.scene;
  world.city = createCity(world.render.scene, world.rng);
  world.input = createInput(canvas);
  world.player = createPlayer(world.render.scene);
  world.effects = createEffects(world.render.scene);
  world.audio = createAudio();
  world.hud = createHud();
  createTraffic(world);
  createPolice(world);
  createCombat(world);
  world.combat = { spawnEnemy, killEnemy, playerShoot, playerPunch };
  world.saveInfo = loadSave();
  applySaveToState(world, world.saveInfo);
  createMissions(world);

  // Six parked cars the player can steal, spread across the districts.
  spawnParkedCar(world, 'sedan', 36, 150, Math.PI, 0xc22a1e);
  spawnParkedCar(world, 'taxi', -84, 90, Math.PI / 2, 0xffc21c);
  spawnParkedCar(world, 'sedan', -24, -30, 0, 0x1e5ac2);
  spawnParkedCar(world, 'pickup', 96, -90, -Math.PI / 2, 0x2a9d5e);
  spawnParkedCar(world, 'sedan', -150, 36, Math.PI, 0xd8d8d8);
  spawnParkedCar(world, 'van', 150, -24, Math.PI / 2, 0xe8dcc0);

  return world;
}

export function startGame(world) {
  world.phase = 'play';
  ensureAudio(world.audio);
  world.message = 'Follow the ◆ marker — Mara is waiting';
  world.messageTimer = 4;
}

export function respawnPlayer(world) {
  const p = world.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar = null;
  }
  p.x = 0;
  p.z = 40;
  p.y = 0;
  p.vy = 0;
  p.onGround = true;
  p.heading = Math.PI;
  p.camYaw = 0;
  p.group.visible = true;
  world.health = 100;
  world.wanted = 0;
  world.money = Math.max(0, world.money - 200);
  for (const cop of [...world.cops]) {
    const i = world.cops.indexOf(cop);
    if (i !== -1) world.cops.splice(i, 1);
    const j = world.cars.indexOf(cop);
    if (j !== -1) world.cars.splice(j, 1);
    world.render.scene.remove(cop.group);
  }
  world.phase = 'play';
  writeSave(world);
}

export function stepWorld(world, dt) {
  world.time += dt;
  const input = world.input;
  const p = world.player;

  if (world.phase === 'title') {
    if (wasPressed(input, 'Enter')) startGame(world);
    updateTraffic(world, dt);
    updatePedestrians(world, dt);
    updateEffects(world.effects, dt);
    updateCamera(world, dt);
    updateHud(world);
    endInputStep(input);
    return;
  }

  if (world.phase === 'pause') {
    if (wasPressed(input, 'KeyP')) world.phase = 'play';
    updateEffects(world.effects, dt);
    updateHud(world);
    endInputStep(input);
    return;
  }

  if (world.phase === 'dead' || world.phase === 'busted') {
    if (wasPressed(input, 'Enter')) respawnPlayer(world);
    updateEffects(world.effects, dt);
    updateHud(world);
    endInputStep(input);
    return;
  }

  // --- play phase, in order ---
  ensureAudio(world.audio);
  if (wasPressed(input, 'KeyP')) {
    world.phase = 'pause';
    endInputStep(input);
    return;
  }
  if (wasPressed(input, 'KeyM')) setMuted(world.audio, !world.audio.muted);
  if (wasPressed(input, 'KeyR')) restartMission(world);
  if (wasPressed(input, 'KeyE')) tryEnterCar(world);
  if (wasPressed(input, 'KeyF') || wasPressed(input, 'MouseShoot')) playerShoot(world);
  if (wasPressed(input, 'KeyV')) playerPunch(world);

  if (p.inCar) {
    if (world.autopilot) {
      driveCar(world, p.inCar, dt, world.autopilot);
      p.x = p.inCar.x;
      p.z = p.inCar.z;
      p.heading = p.inCar.heading;
      p.speed = p.inCar.speed;
      p.speedKmh = Math.abs(p.inCar.speed) * 3.6;
      p.camYaw = angleLerp(p.camYaw, p.inCar.heading + Math.PI, 1 - Math.exp(-4 * dt));
    } else {
      updateDriving(world, dt);
    }
  } else {
    updatePlayer(world, dt);
  }

  updateTraffic(world, dt);
  updatePedestrians(world, dt);
  updateWantedLevel(world, dt);
  updatePoliceChase(world, dt);
  updateMissions(world, dt);
  updateEnemies(world, dt);
  updateEffects(world.effects, dt);
  updateCamera(world, dt);
  updateEngineSound(world.audio, p.speedKmh || 0, !!p.inCar);
  updateSirenSound(world.audio, world.wanted);
  updateMusic(world.audio, dt);

  if (world.bannerTimer > 0) world.bannerTimer -= dt;
  if (world.messageTimer > 0) world.messageTimer -= dt;
  world.shootCooldown = Math.max(0, (world.shootCooldown || 0) - dt);
  world.punchCooldown = Math.max(0, (world.punchCooldown || 0) - dt);

  world.saveTimer += dt;
  if (world.saveTimer > 5) {
    world.saveTimer = 0;
    writeSave(world);
  }
  updateHud(world);
  endInputStep(input);
}

export { renderFrame };
