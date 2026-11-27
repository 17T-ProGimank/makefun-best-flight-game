// The sorties: four missions with different goals over the same archipelago.
// Ring Run races 8 rings against the clock; Mail Run drops mail at three island
// strips and lands home; Landing Challenge grades one takeoff-climb-landing;
// Free Flight has no score. A mission owns its objectives, its score and its
// debrief — the flight model only reports raw events.

import { MAIL_GATES, MISSIONS, RINGS } from './config.js';

export const MISSION_RINGS = 'rings';
export const MISSION_MAIL = 'mail';
export const MISSION_LANDING = 'landing';
export const MISSION_FREE = 'free';

export function createMission(id) {
  const def = MISSIONS[id] ?? MISSIONS.free;
  const mission = {
    id: def.id,
    name: def.name,
    tag: def.tag,
    score: 0,
    timeLeft: def.timeLimit ?? Infinity,
    ringIndex: 0,
    ringsPassed: 0,
    gatesPassed: 0,
    gateIndex: 0,
    climbed: false,
    landed: false,
    finished: false,
    failed: false,
    failReason: '',
    landings: [],
    events: [],
    startTime: 0,
    elapsed: 0,
  };

  function log(text) {
    mission.events.push(text);
  }

  function gradeLanding(verticalSpeed, centreOffset, speed) {
    // verticalSpeed is negative (m/s down). Gentle + centred + slow = S.
    const softness = Math.max(0, 1 - Math.max(0, -verticalSpeed - 1) / 5);
    const centre = Math.max(0, 1 - centreOffset / 18);
    const speedScore = Math.max(0, 1 - Math.max(0, speed - 34) / 30);
    const quality = softness * 0.55 + centre * 0.3 + speedScore * 0.15;
    const grade = quality > 0.88 ? 'S' : quality > 0.72 ? 'A' : quality > 0.55 ? 'B' : 'C';
    return { quality, grade, softness, centre, speedScore };
  }

  /** Feed a flight event in; returns banner lines for the HUD (may be empty). */
  function onEvent(event, flight) {
    const banners = [];
    if (mission.finished || mission.failed) return banners;
    if (event.type === 'ring') {
      if (mission.id === MISSION_RINGS && event.index === mission.ringIndex) {
        mission.ringsPassed += 1;
        mission.ringIndex += 1;
        mission.score += MISSIONS.rings.ringPoints;
        mission.timeLeft += MISSIONS.rings.ringBonusSeconds;
        banners.push(`RING ${mission.ringsPassed}/8  +${MISSIONS.rings.ringPoints}  +${MISSIONS.rings.ringBonusSeconds}s`);
        log(`Ring ${mission.ringsPassed} of 8`);
        if (mission.ringsPassed === RINGS.length) {
          mission.finished = true;
          mission.score += Math.round(mission.timeLeft) * 20;
          banners.push(`COURSE COMPLETE — TIME BONUS +${Math.round(mission.timeLeft) * 20}`);
          log('Course complete');
        }
      }
    } else if (event.type === 'gate') {
      if (mission.id === MISSION_MAIL && event.index === mission.gateIndex) {
        mission.gatesPassed += 1;
        mission.gateIndex += 1;
        mission.score += MISSIONS.mail.gatePoints;
        banners.push(`MAIL DROPPED — ${MAIL_GATES[event.index].name}  +${MISSIONS.mail.gatePoints}`);
        log(`Mail dropped at ${MAIL_GATES[event.index].name}`);
        if (mission.gatesPassed === MAIL_GATES.length) {
          banners.push('ALL MAIL DELIVERED — LAND BACK HOME');
          log('All mail delivered — return home');
        }
      }
    } else if (event.type === 'touchdown') {
      const grading = gradeLanding(event.verticalSpeed, event.centreOffset, event.speed);
      mission.landings.push({ ...grading, verticalSpeed: event.verticalSpeed, centreOffset: event.centreOffset, speed: event.speed });
      if (mission.id === MISSION_MAIL && mission.gatesPassed === MAIL_GATES.length) {
        mission.score += MISSIONS.mail.landingPoints;
        mission.finished = true;
        banners.push(`HOME SAFE — LANDING GRADE ${grading.grade}  +${MISSIONS.mail.landingPoints}`);
        log(`Landed home, grade ${grading.grade}`);
      } else if (mission.id === MISSION_LANDING && mission.climbed) {
        mission.score += Math.round(MISSIONS.landing.landingPoints * grading.quality);
        mission.finished = true;
        banners.push(`TOUCHDOWN — GRADE ${grading.grade}  +${Math.round(MISSIONS.landing.landingPoints * grading.quality)}`);
        log(`Landing graded ${grading.grade}`);
      } else if (mission.id === MISSION_LANDING) {
        banners.push('TOUCHDOWN — BUT YOU NEVER REACHED 800 FT');
        log('Landed before climbing to 800 ft');
      } else {
        // Refuel and repair on any safe runway landing.
        flight.state.fuel = 100;
        banners.push(`LANDED — GRADE ${grading.grade} — REFUELLED`);
        log(`Landed, grade ${grading.grade}, refuelled`);
      }
      mission.landed = true;
    } else if (event.type === 'crash') {
      mission.failed = true;
      mission.failReason = event.reason;
      log(`Crashed: ${event.reason}`);
    } else if (event.type === 'fuelEmpty') {
      banners.push('FUEL EMPTY — GLIDE TO THE RUNWAY');
      log('Fuel empty');
    } else if (event.type === 'takeoff') {
      log('Takeoff');
    }
    return banners;
  }

  /** Per-frame mission bookkeeping: clock, climb target, timeout. Returns banners. */
  function update(dt, flight) {
    const banners = [];
    if (mission.finished || mission.failed) return banners;
    mission.elapsed += dt;
    if (mission.id === MISSION_RINGS) {
      mission.timeLeft -= dt;
      if (mission.timeLeft <= 0) {
        mission.failed = true;
        mission.failReason = 'out of time on the ring course';
        banners.push('OUT OF TIME');
        log('Out of time');
      }
    }
    if (mission.id === MISSION_LANDING && !mission.climbed) {
      const altFt = (flight.state.pos.y - 8) * 3.28084;
      if (altFt >= MISSIONS.landing.climbTargetFt && !flight.state.onGround) {
        mission.climbed = true;
        banners.push('800 FT — NOW BRING HER HOME');
        log('Reached 800 ft');
      }
    }
    return banners;
  }

  /** Next objective for the HUD arrow: { x, y, z, label } or null. */
  function nextTarget() {
    if (mission.id === MISSION_RINGS && mission.ringIndex < RINGS.length) {
      const ring = RINGS[mission.ringIndex];
      return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${mission.ringIndex + 1}/8` };
    }
    if (mission.id === MISSION_MAIL) {
      if (mission.gateIndex < MAIL_GATES.length) {
        const gate = MAIL_GATES[mission.gateIndex];
        return { x: gate.x, y: gate.y, z: gate.z, label: `MAIL ${mission.gateIndex + 1}/3` };
      }
      return { x: 0, y: 40, z: 320, label: 'LAND HOME — RWY 09' };
    }
    if (mission.id === MISSION_LANDING) {
      if (!mission.climbed) return { x: 0, y: 260, z: 320, label: 'CLIMB TO 800 FT' };
      return { x: 0, y: 40, z: 320, label: 'LAND — RWY 09' };
    }
    return null;
  }

  function debrief() {
    const bestLanding = mission.landings.reduce(
      (best, landing) => (best === null || landing.quality > best.quality ? landing : best),
      null,
    );
    return {
      mission: mission.name,
      score: mission.score,
      elapsed: mission.elapsed,
      rings: mission.ringsPassed,
      gates: mission.gatesPassed,
      landings: mission.landings.length,
      bestLanding,
      finished: mission.finished,
      failed: mission.failed,
      failReason: mission.failReason,
      events: mission.events,
    };
  }

  return { mission, onEvent, update, nextTarget, debrief, gradeLanding };
}
