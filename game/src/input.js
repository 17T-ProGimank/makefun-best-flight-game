// Keyboard and mouse input. Held keys steer; one-shot presses (start, pause, view,
// mute, restart, mission select) are queued as flags and taken once by the loop, so
// a press between two frames is never lost or counted twice. Dragging on the canvas
// flies the plane like a stick; the mouse wheel works the throttle.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const VIEW = new Set(['KeyV']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);
const RUDDER_LEFT = new Set(['KeyQ']);
const RUDDER_RIGHT = new Set(['KeyE']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let missionKey = 0;
  let throttle = 0;
  let stickRoll = 0;
  let stickPitch = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (LEFT.has(event.code) || RIGHT.has(event.code) || PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)) {
        event.preventDefault();
      }
      return;
    }
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (VIEW.has(event.code)) actions |= ACTION_VIEW;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    else if (event.code >= 'Digit1' && event.code <= 'Digit4') missionKey = Number(event.code.slice(-1));
    else if (!LEFT.has(event.code) && !RIGHT.has(event.code) && !PITCH_UP.has(event.code) && !PITCH_DOWN.has(event.code)
      && !THROTTLE_UP.has(event.code) && !THROTTLE_DOWN.has(event.code)
      && !RUDDER_LEFT.has(event.code) && !RUDDER_RIGHT.has(event.code)) return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false;
    stickRoll = 0;
    stickPitch = 0;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    stickRoll = Math.max(-1, Math.min(1, (event.clientX - dragStartX) / 160));
    stickPitch = Math.max(-1, Math.min(1, (dragStartY - event.clientY) / 160));
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    stickRoll = 0;
    stickPitch = 0;
  });
  canvas.addEventListener('wheel', (event) => {
    throttle = Math.max(0, Math.min(1, throttle + (event.deltaY < 0 ? 0.06 : -0.06)));
    event.preventDefault();
  }, { passive: false });

  /** Steering for this frame: stick first, keys second, both in -1..1. */
  function steering() {
    let roll = stickRoll;
    let pitch = stickPitch;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    let rudder = 0;
    if (keys.has('KeyQ')) rudder -= 1;
    if (keys.has('KeyE')) rudder += 1;
    return {
      roll: Math.max(-1, Math.min(1, roll)),
      pitch: Math.max(-1, Math.min(1, pitch)),
      rudder,
    };
  }

  /** Throttle the pilot set: Shift/Ctrl nudge it, wheel nudges it, keys hold it. */
  function updateThrottle(dt) {
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle = Math.min(1, throttle + dt * 0.7);
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttle = Math.max(0, throttle - dt * 0.7);
    return throttle;
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  function takeMissionKey() {
    const taken = missionKey;
    missionKey = 0;
    return taken;
  }

  function setThrottle(value) {
    throttle = Math.max(0, Math.min(1, value));
  }

  return { steering, updateThrottle, takeActions, takeMissionKey, setThrottle };
}
