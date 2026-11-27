export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createInput(canvas) {
  const keys = new Set();
  let throttle = 0;
  let actions = 0;
  let missionKey = 0;
  let stick = { x: 0, y: 0 };
  let dragging = false;
  let dragStart = null;

  function isHandled(code) {
    return [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE',
      'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
      'Space', 'Enter', 'KeyP', 'Escape', 'KeyV', 'KeyM', 'KeyR',
      'Digit1', 'Digit2', 'Digit3', 'Digit4',
      'Digit5', 'Digit6', 'Digit7', 'Digit8',
    ].includes(code);
  }

  function onKeyDown(e) {
    if (!isHandled(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    switch (e.code) {
      case 'Space': case 'Enter': actions |= ACTION_CONFIRM; break;
      case 'KeyP': case 'Escape': actions |= ACTION_PAUSE; break;
      case 'KeyV': actions |= ACTION_VIEW; break;
      case 'KeyM': actions |= ACTION_MUTE; break;
      case 'KeyR': actions |= ACTION_RESTART; break;
      default: {
        const m = e.code.match(/^Digit([1-8])$/);
        if (m) missionKey = parseInt(m[1], 10);
      }
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function clearAll() {
    keys.clear();
    stick = { x: 0, y: 0 };
    dragging = false;
    dragStart = null;
  }

  function onPointerDown(e) {
    actions |= ACTION_CONFIRM;
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    stick = { x: 0, y: 0 };
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
  }

  function onPointerMove(e) {
    if (!dragging || !dragStart) return;
    stick = {
      x: clamp((e.clientX - dragStart.x) / 160, -1, 1),
      y: clamp((e.clientY - dragStart.y) / 160, -1, 1),
    };
  }

  function onPointerUp() {
    dragging = false;
    dragStart = null;
    stick = { x: 0, y: 0 };
  }

  function onWheel(e) {
    e.preventDefault();
    throttle = clamp(throttle + (e.deltaY < 0 ? 0.06 : -0.06), 0, 1);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const held = (code) => keys.has(code);

  function steering() {
    let roll = stick.x;
    let pitch = -stick.y;
    if (held('ArrowLeft') || held('KeyA')) roll -= 1;
    if (held('ArrowRight') || held('KeyD')) roll += 1;
    if (held('ArrowUp') || held('KeyW')) pitch += 1;
    if (held('ArrowDown') || held('KeyS')) pitch -= 1;
    let rudder = 0;
    if (held('KeyQ')) rudder -= 1;
    if (held('KeyE')) rudder += 1;
    return {
      roll: clamp(roll, -1, 1),
      pitch: clamp(pitch, -1, 1),
      rudder: clamp(rudder, -1, 1),
    };
  }

  function updateThrottle(dt) {
    const up = held('ShiftLeft') || held('ShiftRight');
    const down = held('ControlLeft') || held('ControlRight');
    if (up) throttle = clamp(throttle + 0.7 * dt, 0, 1);
    if (down) throttle = clamp(throttle - 0.7 * dt, 0, 1);
    return throttle;
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  function takeMissionKey() {
    const k = missionKey;
    missionKey = 0;
    return k;
  }

  function setThrottle(v) {
    throttle = clamp(v, 0, 1);
    return throttle;
  }

  return { steering, updateThrottle, takeActions, takeMissionKey, setThrottle };
}
