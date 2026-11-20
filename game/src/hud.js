// DOM HUD: money / XP / missions / clock, wanted stars, health bar, mission
// banner, speed, contextual prompts, crosshair, minimap canvas, and the
// title / pause / dead / busted overlays.
import { WORLD, GAME_NAME, GAME_TAGLINE, HERO_NAME, FIXER_NAME, CONTROLS, MISSIONS } from './config.js';
import { currentObjective } from './missions.js';

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function createHud() {
  const root = document.getElementById('hud');
  const hud = { root };

  hud.money = el('div', 'hud-money', root);
  hud.sub = el('div', 'hud-sub', root);
  hud.objective = el('div', 'hud-objective', root);
  hud.stars = el('div', 'hud-stars', root);
  hud.healthWrap = el('div', 'hud-health', root);
  hud.healthBar = el('div', 'hud-health-bar', hud.healthWrap);
  hud.healthNum = el('div', 'hud-health-num', hud.healthWrap);
  hud.banner = el('div', 'hud-banner', root);
  hud.message = el('div', 'hud-message', root);
  hud.speed = el('div', 'hud-speed', root);
  hud.prompt = el('div', 'hud-prompt', root);
  hud.controls = el('div', 'hud-controls', root);
  hud.controls.textContent = CONTROLS.join('  ·  ');
  hud.crosshair = el('div', 'hud-crosshair', root);
  hud.crosshair.textContent = '+';
  hud.minimap = el('canvas', 'hud-minimap', root);
  hud.minimap.width = 220;
  hud.minimap.height = 220;
  hud.miniCtx = hud.minimap.getContext('2d');

  // Overlays.
  hud.title = el('div', 'hud-title', root);
  hud.title.innerHTML = `
    <div class="title-name">${GAME_NAME}</div>
    <div class="title-tag">${GAME_TAGLINE}</div>
    <div class="title-story">${HERO_NAME} came home to Solmar Bay after five years away — and the city owes him. ${FIXER_NAME} has three jobs lined up. Steal a car, lose the cops, take the harbour back.</div>
    <div class="title-save"></div>
    <div class="title-play">PRESS ENTER TO PLAY</div>
    <div class="title-controls">${CONTROLS.join('<br>')}</div>`;
  hud.titleSave = hud.title.querySelector('.title-save');

  hud.pause = el('div', 'hud-overlay', root);
  hud.pause.innerHTML = '<div class="overlay-big">PAUSED</div><div class="overlay-sub">Press P to resume · R restart mission · M mute</div>';
  hud.dead = el('div', 'hud-overlay', root);
  hud.dead.innerHTML = '<div class="overlay-big">WASTED</div><div class="overlay-sub">Press Enter — respawn ($200 fee)</div>';
  hud.busted = el('div', 'hud-overlay', root);
  hud.busted.innerHTML = '<div class="overlay-big">BUSTED</div><div class="overlay-sub">The Solmar Bay PD got you — press Enter ($200 fine)</div>';

  return hud;
}

function gameClock(world) {
  const totalMin = 12 * 60 + Math.floor(world.time / 4);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function updateHud(world) {
  const hud = world.hud;
  if (!hud) return;
  const inGame = world.phase === 'play' || world.phase === 'pause';
  const showHud = world.phase !== 'title';

  hud.money.textContent = `$${Math.floor(world.money)}`;
  hud.sub.textContent = `XP ${Math.floor(world.xp)} • MISSIONS ${world.missionsDone}/3 • ${gameClock(world)}`;
  hud.objective.textContent = `◆ ${currentObjective(world)}`;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < Math.floor(world.wanted) ? '★' : '☆';
  hud.stars.textContent = stars;
  hud.stars.classList.toggle('hot', world.wanted >= 3);
  const hp = Math.max(0, Math.round(world.health));
  hud.healthBar.style.width = `${hp}%`;
  hud.healthBar.style.background = hp > 55 ? '#3dd97a' : hp > 25 ? '#ff9a1f' : '#e03131';
  hud.healthNum.textContent = hp;

  hud.banner.textContent = world.bannerTimer > 0 ? world.banner : '';
  hud.message.textContent = world.messageTimer > 0 ? world.message : '';

  const kmh = Math.round(world.player.speedKmh || 0);
  hud.speed.innerHTML = `${kmh}<span> km/h</span>`;
  hud.speed.style.display = world.player.inCar ? 'block' : 'none';

  // Contextual prompt: nearest enterable car, or the driving hint.
  let prompt = '';
  if (world.phase === 'play') {
    if (world.player.inCar) {
      prompt = 'E — GET OUT • W/S drive • Space brake';
    } else {
      for (const car of world.cars) {
        if (car.driver) continue;
        if (Math.hypot(car.x - world.player.x, car.z - world.player.z) < 3.4) {
          prompt = car.isPolice ? 'Press E — TAKE THE CRUISER' : 'Press E — STEAL CAR';
          break;
        }
      }
    }
  }
  hud.prompt.textContent = prompt;
  hud.crosshair.style.display = (world.phase === 'play' && !world.player.inCar) ? 'block' : 'none';

  // Overlays.
  hud.title.style.display = world.phase === 'title' ? 'flex' : 'none';
  hud.pause.style.display = world.phase === 'pause' ? 'flex' : 'none';
  hud.dead.style.display = world.phase === 'dead' ? 'flex' : 'none';
  hud.busted.style.display = world.phase === 'busted' ? 'flex' : 'none';
  if (world.phase === 'title') {
    if (world.saveInfo) {
      hud.titleSave.textContent = `Saved game: $${world.saveInfo.money} • ${world.saveInfo.missionsDone}/3 missions • ${world.saveInfo.xp} XP — press Enter to continue`;
    } else {
      hud.titleSave.textContent = 'New game — no save yet';
    }
  }
  for (const key of ['money', 'sub', 'objective', 'stars', 'healthWrap', 'speed', 'controls', 'minimap']) {
    if (hud[key]) hud[key].style.display = showHud ? '' : 'none';
  }
  if (showHud) drawMinimap(world);
}

export function drawMinimap(world) {
  const hud = world.hud;
  const ctx = hud.miniCtx;
  if (!ctx) return;
  const S = 220;
  const half = WORLD.half;
  const toPx = (m) => ((m + half) / (half * 2)) * S;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(20, 26, 20, 0.85)';
  ctx.fillRect(0, 0, S, S);
  // Sea + sand.
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(0, toPx(WORLD.seaZ), S, S - toPx(WORLD.seaZ));
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, toPx(WORLD.beachZ), S, toPx(WORLD.seaZ) - toPx(WORLD.beachZ));
  // City blocks.
  ctx.fillStyle = 'rgba(160, 160, 150, 0.5)';
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const bx = -180 + i * 60;
      const bz = -180 + j * 60;
      if (bz > 168) continue;
      ctx.fillRect(toPx(bx - 17), toPx(bz - 17), toPx(bx + 17) - toPx(bx - 17), toPx(bz + 17) - toPx(bz - 17));
    }
  }
  // Roads, thick.
  ctx.strokeStyle = '#e8e8e2';
  ctx.lineWidth = 5;
  for (const r of WORLD.roads) {
    ctx.beginPath();
    ctx.moveTo(toPx(r), 0);
    ctx.lineTo(toPx(r), S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, toPx(r));
    ctx.lineTo(S, toPx(r));
    ctx.stroke();
  }
  // Traffic blips.
  ctx.fillStyle = '#cccccc';
  for (const car of world.traffic) {
    ctx.beginPath();
    ctx.arc(toPx(car.x), toPx(car.z), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission target.
  const target = world.missionIndex < MISSIONS.length
    ? (() => {
      const m = MISSIONS[world.missionIndex];
      const step = m.steps[world.missionStep];
      return step && step.type === 'goto' ? step : null;
    })()
    : null;
  if (target) {
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.arc(toPx(target.x), toPx(target.z), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', toPx(target.x), toPx(target.z));
  }
  // Police blips, flashing red/blue.
  const flash = Math.floor(world.time * 2) % 2 === 0;
  ctx.fillStyle = flash ? '#ff2222' : '#2244ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (const cop of world.cops) {
    ctx.beginPath();
    ctx.arc(toPx(cop.x), toPx(cop.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Player triangle, big with a black outline.
  const p = world.player;
  ctx.save();
  ctx.translate(toPx(p.x), toPx(p.z));
  ctx.rotate(Math.PI - p.heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
