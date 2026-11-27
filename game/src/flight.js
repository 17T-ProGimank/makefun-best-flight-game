import * as THREE from 'three';
import { PLANE, RUNWAY, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { terrainHeight } from './terrain.js';

export const EVENT_RING = 'ring';
export const EVENT_GATE = 'gate';
export const EVENT_TOUCHDOWN = 'touchdown';
export const EVENT_CRASH = 'crash';
export const EVENT_TAKEOFF = 'takeoff';
export const EVENT_FUEL_EMPTY = 'fuelEmpty';
export const EVENT_OUT_OF_BOUNDS = 'outOfBounds';
export const EVENT_SCOOP = 'scoop';
export const EVENT_DROP = 'drop';

const G = 9.81;
const GEAR_HEIGHT = PLANE.gearHeight ?? 1.4;
const MAX_SPEED = PLANE.maxSpeed ?? 96;
const STALL_SPEED = PLANE.stallSpeed ?? 27;
const MAX_BANK = ((PLANE.maxBankDeg ?? 62) * Math.PI) / 180;
const MAX_PITCH = ((PLANE.maxPitchDeg ?? 34) * Math.PI) / 180;
const BURN_PER_SECOND = PLANE.burnPerSecond ?? 0.12;
const BURN_PER_THROTTLE = PLANE.burnPerThrottle ?? 0.35;
const RUNWAY_CENTRE_X = RUNWAY.centreX ?? 0;
const RUNWAY_CENTRE_Z = RUNWAY.centreZ ?? 320;
const RUNWAY_ELEVATION = RUNWAY.elevation ?? 8;
const RUNWAY_HALF_LENGTH = (RUNWAY.length ?? 620) / 2;
const RUNWAY_HALF_WIDTH = (RUNWAY.width ?? 42) / 2;
const OUT_OF_BOUNDS_RADIUS = WORLD.outOfBoundsRadius ?? WORLD.radius ?? 2400;

export function headingToVector(heading, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(
    Math.sin(heading) * cp,
    Math.sin(pitch),
    -Math.cos(heading) * cp,
  );
}

function stripAt(x, z, strips) {
  if (!strips) return null;
  for (const strip of strips) {
    // Strips run heading 090: length along X, width along Z.
    if (
      Math.abs(x - strip.x) <= strip.length / 2 &&
      Math.abs(z - strip.z) <= strip.width / 2
    ) {
      return strip;
    }
  }
  return null;
}

function directionToNext(list, index) {
  if (!list || list.length === 0) return new THREE.Vector3(1, 0, 0);
  const current = list[index];
  let target = null;
  if (index + 1 < list.length) target = list[index + 1];
  else if (index > 0) target = current;
  if (target && index + 1 < list.length) {
    const v = new THREE.Vector3(target.x - current.x, (target.y ?? 0) - (current.y ?? 0), target.z - current.z);
    if (v.lengthSq() > 1e-6) return v.normalize();
  }
  if (index > 0) {
    const prev = list[index - 1];
    const v = new THREE.Vector3(current.x - prev.x, (current.y ?? 0) - (prev.y ?? 0), current.z - prev.z);
    if (v.lengthSq() > 1e-6) return v.normalize();
  }
  return new THREE.Vector3(1, 0, 0);
}

export function createFlight(rings, gates, options = {}) {
  const fireZone = options.fireZone ?? null;
  const strips = options.strips ?? [];

  const ringList = rings ?? [];
  const gateList = gates ?? [];

  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    heading: Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    verticalSpeed: 0,
    onGround: true,
    crashed: false,
    crashReason: '',
    outOfBounds: false,
    stalled: false,
    time: 0,
    distanceFlown: 0,
    ringSide: ringList.map(() => 1),
    gateSide: gateList.map(() => 1),
    ringNormal: new THREE.Vector3(1, 0, 0),
    gateNormal: new THREE.Vector3(1, 0, 0),
    water: 0,
    scoopProgress: 0,
    stripId: null,
    groundTime: 0,
  };

  let fuelEmptyEmitted = false;
  let nextRingIndex = 0;
  let nextGateIndex = 0;

  function refreshNormals() {
    state.ringNormal = directionToNext(ringList, Math.min(nextRingIndex, Math.max(0, ringList.length - 1)));
    state.gateNormal = directionToNext(gateList, Math.min(nextGateIndex, Math.max(0, gateList.length - 1)));
  }

  function resetOnRunway() {
    state.pos.set(RUNWAY_CENTRE_X - RUNWAY_HALF_LENGTH + 60, RUNWAY_ELEVATION + GEAR_HEIGHT, RUNWAY_CENTRE_Z);
    state.heading = Math.PI / 2;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = 100;
    state.verticalSpeed = 0;
    state.onGround = true;
    state.crashed = false;
    state.crashReason = '';
    state.outOfBounds = false;
    state.stalled = false;
    state.time = 0;
    state.distanceFlown = 0;
    state.ringSide = ringList.map(() => 1);
    state.gateSide = gateList.map(() => 1);
    state.water = 0;
    state.scoopProgress = 0;
    state.stripId = null;
    state.groundTime = 0;
    fuelEmptyEmitted = false;
    nextRingIndex = 0;
    nextGateIndex = 0;
    refreshNormals();
  }

  function onRunwayRect(x, z) {
    return (
      Math.abs(x - RUNWAY_CENTRE_X) < RUNWAY_HALF_LENGTH &&
      Math.abs(z - RUNWAY_CENTRE_Z) < RUNWAY_HALF_WIDTH
    );
  }

  function readouts() {
    const headingDeg = Math.round(((state.heading * 180) / Math.PI) % 360 + 360) % 360;
    return {
      altitudeFt: Math.max(0, Math.round((state.pos.y - RUNWAY_ELEVATION) * 3.28084)),
      speedKt: Math.round(state.speed * 1.94384),
      headingDeg,
      verticalSpeedFpm: Math.round(state.verticalSpeed * 3.28084 * 60),
      throttle: state.throttle,
      fuel: state.fuel,
      speed: state.speed,
    };
  }

  function checkPasses(events) {
    // Rings: toTarget is the vector from the plane to the ring centre.
    // Normal is the travel direction through the ring; the sign of the
    // dot product flips from +1 to -1 as the plane crosses the ring plane.
    for (let i = 0; i < ringList.length; i++) {
      const ring = ringList[i];
      const normal = directionToNext(ringList, i);
      const toTarget = new THREE.Vector3(ring.x - state.pos.x, (ring.y ?? 0) - state.pos.y, ring.z - state.pos.z);
      const side = Math.sign(toTarget.dot(normal)) || 1;
      if (state.ringSide[i] !== side) {
        const prevSide = state.ringSide[i];
        state.ringSide[i] = side;
        if (prevSide > 0 && side < 0) {
          const d = new THREE.Vector3(state.pos.x - ring.x, state.pos.y - (ring.y ?? 0), state.pos.z - ring.z);
          const along = d.dot(normal);
          const perp = d.clone().addScaledVector(normal, -along);
          const radial = perp.length();
          const radius = ring.radius ?? 30;
          if (radial < radius + 2) {
            events.push({ type: EVENT_RING, index: i });
            if (i === nextRingIndex) nextRingIndex++;
          }
        }
      }
    }
    for (let i = 0; i < gateList.length; i++) {
      const gate = gateList[i];
      const normal = directionToNext(gateList, i);
      const toTarget = new THREE.Vector3(gate.x - state.pos.x, (gate.y ?? 0) - state.pos.y, gate.z - state.pos.z);
      const side = Math.sign(toTarget.dot(normal)) || 1;
      if (state.gateSide[i] !== side) {
        const prevSide = state.gateSide[i];
        state.gateSide[i] = side;
        if (prevSide > 0 && side < 0) {
          const d = new THREE.Vector3(state.pos.x - gate.x, state.pos.y - (gate.y ?? 0), state.pos.z - gate.z);
          const along = d.dot(normal);
          const perp = d.clone().addScaledVector(normal, -along);
          const radial = perp.length();
          const radius = gate.radius ?? 40;
          if (radial < radius + 2) {
            events.push({ type: EVENT_GATE, index: i });
            if (i === nextGateIndex) nextGateIndex++;
          }
        }
      }
    }
    refreshNormals();
  }

  function step(dt, input = {}) {
    const events = [];
    if (state.crashed || dt <= 0) return events;

    const rollInput = clamp(input.roll ?? 0, -1, 1);
    const pitchInput = clamp(input.pitch ?? 0, -1, 1);
    const rudderInput = clamp(input.rudder ?? 0, -1, 1);
    state.throttle = clamp(input.throttle ?? state.throttle, 0, 1);

    // Fuel burn; thrust dies with the tank.
    if (state.fuel > 0) {
      state.fuel -= (BURN_PER_SECOND + BURN_PER_THROTTLE * state.throttle) * dt;
      if (state.fuel <= 0) {
        state.fuel = 0;
        if (!fuelEmptyEmitted) {
          fuelEmptyEmitted = true;
          events.push({ type: EVENT_FUEL_EMPTY });
        }
      }
    } else if (!fuelEmptyEmitted) {
      fuelEmptyEmitted = true;
      events.push({ type: EVENT_FUEL_EMPTY });
    }
    if (state.fuel > 0) fuelEmptyEmitted = false;
    const thrust = state.fuel > 0 ? state.throttle : 0;

    // Control authority weakens near the stall.
    const authority = clamp(0.35 + 0.65 * (state.speed / STALL_SPEED), 0, 1);
    const blend = clamp(dt * 4 * authority, 0, 1);
    const targetRoll = state.onGround ? 0 : rollInput * MAX_BANK;
    const targetPitch = state.onGround ? 0 : pitchInput * MAX_PITCH;
    state.roll = lerp(state.roll, targetRoll, blend);
    state.pitch = lerp(state.pitch, targetPitch, blend);

    if (!state.onGround) {
      state.heading += (G * Math.tan(state.roll)) / Math.max(state.speed, 18) * dt + rudderInput * 0.25 * dt;
    } else {
      state.heading += rollInput * 0.35 * dt * Math.min(1, state.speed / 20);
    }

    // Speed: thrust minus drag, minus the climb penalty when airborne.
    const drag = 0.0032 * state.speed * state.speed + 0.6;
    const accel =
      thrust * 26 - drag - (state.onGround ? 0 : G * Math.sin(state.pitch) * 0.55);
    state.speed = Math.max(0, state.speed + accel * dt);
    if (state.onGround) state.speed = Math.min(state.speed, MAX_SPEED);

    // Stall sink.
    let sink = 0;
    state.stalled = false;
    if (!state.onGround && state.speed < STALL_SPEED) {
      sink = (STALL_SPEED - state.speed) * 0.85;
      state.stalled = true;
    }

    const velocity = headingToVector(state.heading, state.pitch).multiplyScalar(state.speed);
    velocity.y -= sink;
    state.verticalSpeed = velocity.y;
    state.pos.addScaledVector(velocity, dt);
    state.distanceFlown += velocity.length() * dt;
    state.time += dt;

    // Takeoff.
    if (state.onGround && state.speed > STALL_SPEED * 1.08 && pitchInput > 0.25) {
      state.onGround = false;
      state.pos.y = RUNWAY_ELEVATION + GEAR_HEIGHT + 0.5;
      events.push({ type: EVENT_TAKEOFF });
    }

    const ground = terrainHeight(state.pos.x, state.pos.z);
    const overRunway = onRunwayRect(state.pos.x, state.pos.z);
    const overStrip = stripAt(state.pos.x, state.pos.z, strips);

    if (!state.onGround) {
      if (state.pos.y - ground <= GEAR_HEIGHT) {
        if (
          (overRunway || overStrip) &&
          Math.abs(state.roll) < 0.25 &&
          Math.abs(state.pitch) < 0.18 &&
          state.verticalSpeed > -7
        ) {
          const strip = overStrip;
          const elev = strip ? strip.elevation : RUNWAY_ELEVATION;
          const centreZ = strip ? strip.z : RUNWAY_CENTRE_Z;
          state.onGround = true;
          state.pos.y = elev + GEAR_HEIGHT;
          state.pitch = 0;
          state.roll *= 0.4;
          events.push({
            type: EVENT_TOUCHDOWN,
            verticalSpeed: state.verticalSpeed,
            centreOffset: Math.abs(state.pos.z - centreZ),
            speed: state.speed,
            strip: strip ? strip.id : null,
          });
        } else if (ground > 0.5) {
          state.crashed = true;
          state.crashReason =
            state.verticalSpeed < -7 ? 'hard impact with the ground' : 'flew into the terrain';
          events.push({ type: EVENT_CRASH, reason: state.crashReason });
          return events;
        } else {
          state.crashed = true;
          state.crashReason = 'ditched in the sea';
          events.push({ type: EVENT_CRASH, reason: state.crashReason });
          return events;
        }
      } else if (state.pos.y < 0.8 && ground <= 0.5) {
        state.crashed = true;
        state.crashReason = 'ditched in the sea';
        events.push({ type: EVENT_CRASH, reason: state.crashReason });
        return events;
      }
    }

    if (state.onGround) {
      state.speed = Math.max(0, state.speed - (2.2 + state.speed * 0.12) * dt);
      const strip = overStrip;
      if (strip) {
        state.pos.y = strip.elevation + GEAR_HEIGHT;
      } else if (overRunway) {
        state.pos.y = RUNWAY_ELEVATION + GEAR_HEIGHT;
      } else {
        state.pos.y = Math.max(state.pos.y, ground + GEAR_HEIGHT);
      }
      state.groundTime += dt;
    } else {
      state.groundTime = 0;
    }

    // Which strip (if any) the plane sits on, while on the ground.
    state.stripId = state.onGround && overStrip ? overStrip.id : null;

    // Out of bounds: fire once per crossing.
    const distFromCentre = Math.hypot(state.pos.x, state.pos.z);
    if (distFromCentre > OUT_OF_BOUNDS_RADIUS) {
      if (!state.outOfBounds) {
        state.outOfBounds = true;
        events.push({ type: EVENT_OUT_OF_BOUNDS });
      }
    } else {
      state.outOfBounds = false;
    }

    // Ring / gate passes.
    checkPasses(events);

    // Scoop water: low, fast, over the sea for 2 s.
    if (!state.onGround && state.water < 1 && ground <= 0.5 && state.pos.y < 6 && state.speed > 40) {
      state.scoopProgress += dt;
      if (state.scoopProgress >= 2) {
        state.water = 1;
        state.scoopProgress = 0;
        events.push({ type: EVENT_SCOOP });
      }
    } else {
      state.scoopProgress = Math.max(0, state.scoopProgress - dt);
    }

    // Drop water on the fire.
    if (!state.onGround && state.water > 0 && fireZone) {
      const horizontalDist = Math.hypot(state.pos.x - fireZone.x, state.pos.z - fireZone.z);
      if (horizontalDist < fireZone.radius && state.pos.y < 120) {
        state.water = 0;
        events.push({ type: EVENT_DROP, x: state.pos.x, z: state.pos.z, inZone: true });
      }
    }

    return events;
  }

  resetOnRunway();

  return { state, step, resetOnRunway, readouts, onRunwayRect };
}
