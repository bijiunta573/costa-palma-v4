// Costa Palma — keyboard and mouse state, read by every controller.
// One shared object; the game loop polls it each frame. Mouse orbit uses
// pointer lock when the browser grants it and falls back to drag-orbiting,
// so the game stays playable in frames where lock is refused.

export const input = {
  keys: new Set(),
  mouseDX: 0, // accumulated since last frame; controllers consume and reset
  mouseDY: 0,
  firing: false, // left button held
  aiming: false, // right button held
  locked: false, // pointer lock active
  dragOrbit: false,
  pressed: new Set(), // keys that went down this frame (edge detection)
};

const watched = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyM', 'Space', 'ShiftLeft', 'ShiftRight',
]);

export function initInput(canvas, onFirstGesture) {
  window.addEventListener('keydown', (ev) => {
    if (watched.has(ev.code)) ev.preventDefault();
    if (!input.keys.has(ev.code)) input.pressed.add(ev.code);
    input.keys.add(ev.code);
  });
  window.addEventListener('keyup', (ev) => input.keys.delete(ev.code));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false;
    input.aiming = false;
  });

  canvas.addEventListener('mousedown', (ev) => {
    onFirstGesture();
    if (ev.button === 0) {
      input.firing = true;
      if (!input.locked) input.dragOrbit = true;
    }
    if (ev.button === 2) input.aiming = true;
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) {
      input.firing = false;
      input.dragOrbit = false;
    }
    if (ev.button === 2) input.aiming = false;
  });
  window.addEventListener('mousemove', (ev) => {
    if (input.locked) {
      input.mouseDX += ev.movementX || 0;
      input.mouseDY += ev.movementY || 0;
    } else if (input.dragOrbit) {
      input.mouseDX += ev.movementX || 0;
      input.mouseDY += ev.movementY || 0;
    }
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
}

// Ask for pointer lock (called from click handlers, which browsers require).
export function requestLock(canvas) {
  if (!input.locked && canvas.requestPointerLock) {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {}); // refusal is fine: drag-orbit works
  }
}

export function down(code) {
  return input.keys.has(code);
}

// True only on the frame the key went down; consumes the whole edge set, so
// call once per frame from the main loop after systems have read it.
export function wasPressed(code) {
  return input.pressed.has(code);
}

export function endFrameInput() {
  input.pressed.clear();
  input.mouseDX = 0;
  input.mouseDY = 0;
}
