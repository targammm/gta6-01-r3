// Keyboard + mouse input. Edge-triggered presses are latched until the next fixed
// step consumes them, so a quick tap is never lost between slow rendered frames.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    pointerLocked: false,
    dragging: false,
    canvas,
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.dragging = false;
  });

  canvas.addEventListener('click', () => {
    if (!input.pointerLocked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (err) { /* pointer lock unavailable */ }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('mousedown', () => { input.dragging = true; });
  window.addEventListener('mouseup', () => { input.dragging = false; });
  document.addEventListener('mousemove', (e) => {
    if (input.pointerLocked || input.dragging) {
      input.mouseDX += e.movementX || 0;
      input.mouseDY += e.movementY || 0;
    }
  });
  // Clicking (left mouse) also fires the pistol — handled as a latched press.
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.pressed.add('MouseShoot');
  });

  return input;
}

export function isDown(input, code) {
  return input.keys.has(code);
}

export function wasPressed(input, code) {
  return input.pressed.has(code);
}

// WASD / arrows as camera-relative move axes: x = strafe right, z = forward.
export function readMoveAxes(input) {
  let x = 0;
  let z = 0;
  if (isDown(input, 'KeyW') || isDown(input, 'ArrowUp')) z += 1;
  if (isDown(input, 'KeyS') || isDown(input, 'ArrowDown')) z -= 1;
  if (isDown(input, 'KeyA') || isDown(input, 'ArrowLeft')) x -= 1;
  if (isDown(input, 'KeyD') || isDown(input, 'ArrowRight')) x += 1;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}

// Driving axes: throttle 0..1, brake 0..1, steer -1..1.
export function driveAxes(input) {
  const throttle = isDown(input, 'KeyW') || isDown(input, 'ArrowUp') ? 1 : 0;
  const reverse = isDown(input, 'KeyS') || isDown(input, 'ArrowDown') ? 1 : 0;
  let steer = 0;
  if (isDown(input, 'KeyA') || isDown(input, 'ArrowLeft')) steer -= 1;
  if (isDown(input, 'KeyD') || isDown(input, 'ArrowRight')) steer += 1;
  const brake = isDown(input, 'Space') ? 1 : 0;
  return { throttle, reverse, steer, brake };
}

// Called at the end of every fixed step: consume edge presses + mouse deltas.
export function endInputStep(input) {
  input.pressed.clear();
  input.mouseDX = 0;
  input.mouseDY = 0;
}
