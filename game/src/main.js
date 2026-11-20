// Boot + main loop + ?shot= staging. In shot mode the world is simulated
// forward with real fixed steps, one frame is rendered, and window.__shotReady
// tells the screenshot tool the frame is final. Otherwise a live loop runs.
import { createWorld, stepWorld, startGame } from './world.js';
import { renderFrame } from './render.js';
import { applyShotStaging } from './shots.js';
import { updateHud } from './hud.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = parseInt(params.get('seed') || '20261120', 10) || 20261120;

const canvas = document.getElementById('game');
const world = createWorld(canvas, seed);
window.__solmar = world;

if (shot) {
  // Staged screenshot: simulate, render once, signal readiness.
  world.phase = 'play';
  applyShotStaging(world, shot);
  updateHud(world);
  renderFrame(world.render, world.render.scene, world.render.camera);
  window.__shotReady = true;
} else {
  // Live game loop: fixed 1/60 s steps, at most 5 per rendered frame.
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  canvas.addEventListener('click', () => {
    if (world.phase === 'title') startGame(world);
  });
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepWorld(world, STEP);
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0;
    renderFrame(world.render, world.render.scene, world.render.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
