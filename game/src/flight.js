// The flight model: arcade-sim physics for one bush plane. Speed comes from the
// throttle against drag and gravity; bank turns the nose (coordinated turn); below
// stall speed the wing sinks and the controls go mushy. Collisions with terrain,
// water and the runway are resolved here, and every notable event (ring pass, gate
// pass, touchdown, crash, takeoff) is returned to the caller as an event object.
// Units are metres, seconds and radians; heading 0 is north (-Z), clockwise.

import * as THREE from 'three';
import { PLANE, RUNWAY, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { terrainHeight } from './terrain.js';

const G = 9.81;
const KNOTS = 1.94384;
const FEET = 3.28084;

export const EVENT_RING = 'ring';
export const EVENT_GATE = 'gate';
export const EVENT_TOUCHDOWN = 'touchdown';
export const EVENT_CRASH = 'crash';
export const EVENT_TAKEOFF = 'takeoff';
export const EVENT_FUEL_EMPTY = 'fuelEmpty';
export const EVENT_OUT_OF_BOUNDS = 'outOfBounds';

export function headingToVector(heading, pitch) {
  return new THREE.Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(heading) * Math.cos(pitch),
  );
}

export function createFlight(rings, gates) {
  const state = {
    pos: new THREE.Vector3(RUNWAY.centreX - RUNWAY.length / 2 + 60, RUNWAY.elevation + PLANE.gearHeight, RUNWAY.centreZ),
    heading: Math.PI / 2, // facing east, down the runway (090)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    verticalSpeed: 0,
    onGround: true,
    crashed: false,
    crashReason: '',
    outOfBounds: false,
    stalled: false,
    time: 0,
    distanceFlown: 0,
    // Per-ring/gate pass tracking: the sign of the dot product with the ring normal.
    ringSide: rings.map(() => 1),
    gateSide: gates.map(() => 1),
    ringNormal: rings.map((ring, i) => {
      const next = rings[(i + 1) % rings.length];
      return new THREE.Vector3(next.x - ring.x, 0, next.z - ring.z).normalize();
    }),
    gateNormal: gates.map((gate, i) => {
      const next = gates[(i + 1) % gates.length];
      return new THREE.Vector3(next.x - gate.x, 0, next.z - gate.z).normalize();
    }),
  };

  function resetOnRunway() {
    state.pos.set(RUNWAY.centreX - RUNWAY.length / 2 + 60, RUNWAY.elevation + PLANE.gearHeight, RUNWAY.centreZ);
    state.heading = Math.PI / 2;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = PLANE.fuelCapacity;
    state.verticalSpeed = 0;
    state.onGround = true;
    state.crashed = false;
    state.crashReason = '';
    state.outOfBounds = false;
    state.stalled = false;
    state.time = 0;
    state.distanceFlown = 0;
    state.ringSide.fill(1);
    state.gateSide.fill(1);
  }

  function onRunwayRect(x, z) {
    return (
      Math.abs(x - RUNWAY.centreX) < RUNWAY.length / 2 &&
      Math.abs(z - RUNWAY.centreZ) < RUNWAY.width / 2
    );
  }

  function crash(reason) {
    if (state.crashed) return { type: EVENT_CRASH, reason };
    state.crashed = true;
    state.crashReason = reason;
    state.speed = 0;
    return { type: EVENT_CRASH, reason };
  }

  /**
   * One fixed step. `input` is { roll, pitch, throttle, rudder } with roll/pitch in
   * -1..1 and throttle in 0..1. Returns an array of events that happened this step.
   */
  function step(dt, input) {
    const events = [];
    if (state.crashed) return events;
    state.time += dt;

    // Throttle and fuel.
    state.throttle = clamp(input.throttle, 0, 1);
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (PLANE.burnPerSecond + PLANE.burnPerThrottle * state.throttle) * dt);
      if (state.fuel === 0) events.push({ type: EVENT_FUEL_EMPTY });
    }
    const thrust = state.fuel > 0 ? state.throttle : 0;

    // Bank toward the stick, pitch toward the stick; controls weaken near stall.
    const authority = state.speed < PLANE.stallSpeed ? 0.35 + 0.65 * (state.speed / PLANE.stallSpeed) : 1;
    const targetRoll = input.roll * (PLANE.maxBankDeg * Math.PI / 180);
    const targetPitch = input.pitch * (PLANE.maxPitchDeg * Math.PI / 180);
    const rollRate = state.onGround ? 6 : 2.4;
    state.roll = lerp(state.roll, targetRoll, Math.min(1, rollRate * dt));
    if (!state.onGround) {
      state.pitch = lerp(state.pitch, targetPitch, Math.min(1, 1.8 * authority * dt));
      // Coordinated turn: bank rolls the nose around.
      state.heading += (G * Math.tan(state.roll) / Math.max(state.speed, 18)) * dt;
      state.heading += input.rudder * 0.25 * dt;
    } else {
      state.pitch = lerp(state.pitch, 0, Math.min(1, 4 * dt));
      // Steering on the ground follows the stick a little.
      state.heading += input.roll * 0.35 * dt * Math.min(1, state.speed / 20);
    }

    // Speed: thrust against drag, gravity along the climb angle.
    const drag = PLANE.drag * state.speed * state.speed + 0.6;
    let accel = PLANE.thrust * thrust - drag;
    if (!state.onGround) accel -= G * Math.sin(state.pitch) * 0.55;
    state.speed = Math.max(0, state.speed + accel * dt);
    if (state.onGround) state.speed = Math.min(state.speed, PLANE.maxSpeed);

    // Stall: below stall speed the wing sinks and the nose drops.
    state.stalled = !state.onGround && state.speed < PLANE.stallSpeed;
    const sink = state.stalled ? (PLANE.stallSpeed - state.speed) * 0.85 : 0;
    const dir = headingToVector(state.heading, state.pitch);
    const velocity = dir.clone().multiplyScalar(state.speed);
    velocity.y -= sink;
    state.verticalSpeed = velocity.y;
    const prevPos = state.pos.clone();
    state.pos.addScaledVector(velocity, dt);
    state.distanceFlown += state.pos.distanceTo(prevPos);

    // Takeoff: fast enough and pulling up leaves the ground.
    if (state.onGround && state.speed > PLANE.stallSpeed * 1.08 && input.pitch > 0.25) {
      state.onGround = false;
      state.pos.y = RUNWAY.elevation + PLANE.gearHeight + 0.5;
      events.push({ type: EVENT_TAKEOFF });
    }

    // Ground and water.
    const ground = terrainHeight(state.pos.x, state.pos.z);
    const overRunway = onRunwayRect(state.pos.x, state.pos.z);
    const groundClearance = state.pos.y - ground;
    if (!state.onGround && groundClearance <= PLANE.gearHeight) {
      if (overRunway && Math.abs(state.roll) < 0.25 && Math.abs(state.pitch) < 0.18 && state.verticalSpeed > -7) {
        state.onGround = true;
        state.pos.y = RUNWAY.elevation + PLANE.gearHeight;
        state.pitch = 0;
        state.roll *= 0.4;
        events.push({
          type: EVENT_TOUCHDOWN,
          verticalSpeed: state.verticalSpeed,
          centreOffset: Math.abs(state.pos.z - RUNWAY.centreZ),
          speed: state.speed,
        });
      } else if (ground > 0.5) {
        events.push(crash(state.verticalSpeed < -7 ? 'hard impact with the ground' : 'flew into the terrain'));
      } else {
        events.push(crash('ditched in the sea'));
      }
    }
    if (state.onGround) {
      // Rolling: brakes and drag bleed speed; stay on the strip height.
      state.speed = Math.max(0, state.speed - (2.2 + state.speed * 0.12) * dt);
      state.pos.y = RUNWAY.elevation + PLANE.gearHeight;
      if (!overRunway && state.speed < 4) {
        // Rolled off the strip end onto grass at walking pace: just stop, no crash.
        state.pos.y = Math.max(state.pos.y, ground + PLANE.gearHeight);
      }
      if (state.speed > 1 && !overRunway && state.pos.y - ground < PLANE.gearHeight + 0.5) {
        state.pos.y = ground + PLANE.gearHeight;
      }
    }
    if (state.pos.y < 0.8 && ground <= 0.5 && !state.onGround) {
      events.push(crash('ditched in the sea'));
    }

    // Out of bounds: warn, and nudge the nose home so a lost pilot recovers.
    const distCentre = Math.hypot(state.pos.x, state.pos.z);
    const wasOut = state.outOfBounds;
    state.outOfBounds = distCentre > WORLD.boundRadius;
    if (state.outOfBounds && !wasOut) events.push({ type: EVENT_OUT_OF_BOUNDS });

    // Ring passes: crossed the ring's plane inside its radius.
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const toPlane = new THREE.Vector3(state.pos.x - ring.x, state.pos.y - ring.y, state.pos.z - ring.z);
      const side = Math.sign(toPlane.dot(state.ringNormal[i])) || 1;
      if (side !== state.ringSide[i]) {
        state.ringSide[i] = side;
        const radial = Math.hypot(
          toPlane.x - state.ringNormal[i].x * toPlane.dot(state.ringNormal[i]),
          toPlane.y,
          toPlane.z - state.ringNormal[i].z * toPlane.dot(state.ringNormal[i]),
        );
        if (radial < ring.radius + 2) events.push({ type: EVENT_RING, index: i });
      }
    }
    for (let i = 0; i < gates.length; i += 1) {
      const gate = gates[i];
      const toPlane = new THREE.Vector3(state.pos.x - gate.x, state.pos.y - gate.y, state.pos.z - gate.z);
      const side = Math.sign(toPlane.dot(state.gateNormal[i])) || 1;
      if (side !== state.gateSide[i]) {
        state.gateSide[i] = side;
        const radial = Math.hypot(
          toPlane.x - state.gateNormal[i].x * toPlane.dot(state.gateNormal[i]),
          toPlane.y,
          toPlane.z - state.gateNormal[i].z * toPlane.dot(state.gateNormal[i]),
        );
        if (radial < gate.radius + 2) events.push({ type: EVENT_GATE, index: i });
      }
    }

    return events;
  }

  /** Readouts the HUD draws, in pilot units. */
  function readouts() {
    return {
      altitudeFt: Math.max(0, Math.round((state.pos.y - RUNWAY.elevation) * FEET)),
      speedKt: Math.round(state.speed * KNOTS),
      headingDeg: Math.round(((state.heading * 180) / Math.PI % 360 + 360) % 360),
      verticalSpeedFpm: Math.round(state.verticalSpeed * FEET * 60),
      throttle: state.throttle,
      fuel: state.fuel,
      speed: state.speed,
    };
  }

  return { state, step, resetOnRunway, readouts, onRunwayRect };
}
