import { MAIL_GATES, MISSIONS, RINGS, FIRE_ZONE, STRIPS } from './config.js';

export const MISSION_RINGS = 'rings';
export const MISSION_MAIL = 'mail';
export const MISSION_LANDING = 'landing';
export const MISSION_FREE = 'free';
export const MISSION_FIRE = 'fire';
export const MISSION_MEDEVAC = 'medevac';
export const MISSION_NIGHTMAIL = 'nightmail';
export const MISSION_HOPPER = 'hopper';

const HOME_TARGET = { x: 0, y: 40, z: 320, label: 'LAND HOME — RWY 09' };

export function createMission(id) {
  const def = MISSIONS[id] ?? {};
  const params = def.params ?? def;

  const mission = {
    id,
    name: def.name ?? id,
    tag: def.tag ?? '',
    score: 0,
    timeLeft: def.timeLimit ?? params.timeLimit ?? Infinity,
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
    drops: 0,
    dropsNeeded: params.dropsNeeded ?? def.dropsNeeded ?? 0,
    scoops: 0,
    patientPickedUp: false,
    patientCondition: 100,
    pickupTimer: 0,
    stopsVisited: 0,
    stopIndex: 0,
    scoreLines: [],
  };

  function log(text) {
    mission.events.push(text);
  }

  function gradeLanding(verticalSpeed, centreOffset, speed) {
    const softness = Math.max(0, 1 - Math.max(0, -verticalSpeed - 1) / 5);
    const centre = Math.max(0, 1 - centreOffset / 18);
    const speedScore = Math.max(0, 1 - Math.max(0, speed - 34) / 30);
    const quality = softness * 0.55 + centre * 0.3 + speedScore * 0.15;
    const grade = quality > 0.88 ? 'S' : quality > 0.72 ? 'A' : quality > 0.55 ? 'B' : 'C';
    return { quality, grade, softness, centre, speedScore };
  }

  function onEvent(event, flight) {
    if (mission.finished || mission.failed) return [];
    const banners = [];
    const type = event.type;

    if (type === 'ring') {
      if (mission.id === MISSION_RINGS && event.index === mission.ringIndex) {
        mission.ringsPassed++;
        mission.ringIndex++;
        const ringPoints = params.ringPoints ?? 1000;
        const bonusSeconds = params.ringBonusSeconds ?? 15;
        mission.score += ringPoints;
        mission.timeLeft += bonusSeconds;
        mission.scoreLines.push({ label: `Ring ${mission.ringsPassed}/8`, points: ringPoints });
        banners.push(`RING ${mission.ringsPassed}/8 +${ringPoints} +${bonusSeconds}s`);
        log(`Ring ${mission.ringsPassed}/8 +${ringPoints}`);
        if (mission.ringsPassed >= 8) {
          const bonus = Math.round(mission.timeLeft) * 20;
          mission.score += bonus;
          mission.scoreLines.push({ label: 'Time bonus', points: bonus });
          mission.finished = true;
          banners.push(`RING RUN COMPLETE — TIME BONUS +${bonus}`);
          log(`Ring run complete, time bonus +${bonus}`);
        }
      }
      return banners;
    }

    if (type === 'gate') {
      if (
        (mission.id === MISSION_MAIL || mission.id === MISSION_NIGHTMAIL) &&
        event.index === mission.gateIndex
      ) {
        mission.gatesPassed++;
        mission.gateIndex++;
        const gatePoints = params.gatePoints ?? 1500;
        mission.score += gatePoints;
        const gate = MAIL_GATES[mission.gateIndex - 1];
        const gateName = gate?.name ?? `Gate ${mission.gatesPassed}`;
        mission.scoreLines.push({ label: `Mail — ${gateName}`, points: gatePoints });
        banners.push(`MAIL DROPPED — ${gateName} +${gatePoints}`);
        log(`Mail dropped at ${gateName} +${gatePoints}`);
        if (mission.gatesPassed >= 3) {
          banners.push('ALL MAIL DELIVERED — LAND BACK HOME');
        }
      }
      return banners;
    }

    if (type === 'scoop') {
      if (mission.id === MISSION_FIRE) {
        mission.scoops++;
        const scoopPoints = params.scoopPoints ?? 150;
        mission.score += scoopPoints;
        mission.scoreLines.push({ label: 'Water scooped', points: scoopPoints });
        banners.push('WATER SCOOPED — TANK FULL');
        log(`Water scooped +${scoopPoints}`);
      }
      return banners;
    }

    if (type === 'drop') {
      if (mission.id === MISSION_FIRE && event.inZone) {
        mission.drops++;
        const dropPoints = params.dropPoints ?? 1200;
        mission.score += dropPoints;
        mission.scoreLines.push({ label: `Fire drop ${mission.drops}/3`, points: dropPoints });
        banners.push(`FIRE DROP ${mission.drops}/3 +${dropPoints}`);
        log(`Fire drop ${mission.drops}/3 +${dropPoints}`);
        if (mission.drops >= 3) {
          const bonus = Math.max(0, Math.round(240 - mission.elapsed)) * 10;
          mission.score += bonus;
          mission.scoreLines.push({ label: 'Fire-out time bonus', points: bonus });
          mission.finished = true;
          banners.push('FIRE OUT — RIDGE SAFE');
          log(`Fire out, time bonus +${bonus}`);
        }
      }
      return banners;
    }

    if (type === 'touchdown') {
      const grading = gradeLanding(event.verticalSpeed, event.centreOffset, event.speed);
      mission.landings.push({
        ...grading,
        verticalSpeed: event.verticalSpeed,
        centreOffset: event.centreOffset,
        speed: event.speed,
        strip: event.strip ?? null,
      });
      mission.landed = true;
      const stripId = event.strip ?? null;

      if (mission.id === MISSION_MAIL || mission.id === MISSION_NIGHTMAIL) {
        if (mission.gatesPassed >= 3 && stripId == null) {
          const landingPoints = params.landingPoints ?? 2000;
          mission.score += landingPoints;
          mission.scoreLines.push({ label: `Landing home — grade ${grading.grade}`, points: landingPoints });
          mission.finished = true;
          banners.push(`HOME SAFE — LANDING GRADE ${grading.grade} +${landingPoints}`);
          log(`Home safe, grade ${grading.grade} +${landingPoints}`);
          return banners;
        }
      } else if (mission.id === MISSION_LANDING) {
        if (mission.climbed) {
          const pts = Math.round((params.landingPoints ?? 3000) * grading.quality);
          mission.score += pts;
          mission.scoreLines.push({ label: `Landing — grade ${grading.grade}`, points: pts });
          mission.finished = true;
          banners.push(`TOUCHDOWN — GRADE ${grading.grade} +${pts}`);
          log(`Touchdown, grade ${grading.grade} +${pts}`);
          return banners;
        }
        banners.push('TOUCHDOWN — BUT YOU NEVER REACHED 800 FT');
        log('Touchdown without reaching 800 ft');
        return banners;
      } else if (mission.id === MISSION_MEDEVAC) {
        if (stripId === 'mercusuar' && !mission.patientPickedUp) {
          banners.push('ON THE ISLET — HOLD 5 S TO LIFT THE PATIENT');
          log('Landed on Mercusuar Islet, waiting to pick up the patient');
          return banners;
        }
        if (stripId == null && mission.patientPickedUp) {
          const pts = Math.round(
            (params.landingPoints ?? 2000) * grading.quality * (mission.patientCondition / 100),
          );
          mission.score += pts;
          mission.scoreLines.push({
            label: `Landing home — grade ${grading.grade} × condition ${Math.round(mission.patientCondition)}%`,
            points: pts,
          });
          mission.finished = true;
          banners.push(`PATIENT HOME — GRADE ${grading.grade} +${pts}`);
          log(`Patient home, grade ${grading.grade} +${pts}`);
          return banners;
        }
        if (stripId != null) {
          const targetStrip = STRIPS.find((s) => s.id === 'mercusuar');
          const nextName = mission.patientPickedUp
            ? 'RUNWAY 09'
            : targetStrip
              ? targetStrip.name
              : 'MERCUSUAR ISLET';
          banners.push(`WRONG STRIP — ${nextName}`);
          log(`Wrong strip ${stripId} on medevac`);
          return banners;
        }
      } else if (mission.id === MISSION_HOPPER) {
        const expected = STRIPS[mission.stopIndex];
        if (stripId != null && expected && stripId === expected.id) {
          mission.stopsVisited++;
          mission.stopIndex++;
          const pts = Math.round((params.stopPoints ?? 1200) * grading.quality);
          mission.score += pts;
          mission.scoreLines.push({
            label: `Stop ${mission.stopsVisited}/3 ${expected.name} — grade ${grading.grade}`,
            points: pts,
          });
          banners.push(`STOP ${mission.stopsVisited}/3 — GRADE ${grading.grade} +${pts}`);
          log(`Hopper stop ${mission.stopsVisited}/3 at ${expected.name}, grade ${grading.grade} +${pts}`);
          return banners;
        }
        if (stripId != null) {
          banners.push(`WRONG STRIP — FLY TO ${expected ? expected.name : 'HOME'}`);
          log(`Wrong strip ${stripId} on hopper`);
          return banners;
        }
        if (stripId == null && mission.stopsVisited === 3) {
          const pts = Math.round((params.landingPoints ?? 2000) * grading.quality);
          mission.score += pts;
          mission.scoreLines.push({ label: `Landing home — grade ${grading.grade}`, points: pts });
          mission.finished = true;
          banners.push(`HOME — ALL STOPS DONE — GRADE ${grading.grade} +${pts}`);
          log(`Hopper complete, grade ${grading.grade} +${pts}`);
          return banners;
        }
      }

      // Any other touchdown: refuel only on the home runway.
      if (stripId == null) {
        if (flight && flight.state) flight.state.fuel = 100;
        banners.push(`LANDED — GRADE ${grading.grade} — REFUELLED`);
        log(`Landed, grade ${grading.grade}, refuelled`);
      } else {
        banners.push(`LANDED — GRADE ${grading.grade}`);
        log(`Landed on ${stripId}, grade ${grading.grade}`);
      }
      return banners;
    }

    if (type === 'crash') {
      mission.failed = true;
      mission.failReason = event.reason ?? 'crashed';
      log(`Crashed — ${mission.failReason}`);
      return banners;
    }

    if (type === 'fuelEmpty') {
      banners.push('FUEL EMPTY — GLIDE TO THE RUNWAY');
      log('Fuel empty');
      return banners;
    }

    if (type === 'takeoff') {
      log('Takeoff');
      return banners;
    }

    return banners;
  }

  function nextTarget(flight) {
    if (mission.id === MISSION_RINGS) {
      if (mission.ringIndex >= RINGS.length) return null;
      const ring = RINGS[mission.ringIndex];
      return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${mission.ringIndex + 1}/8` };
    }
    if (mission.id === MISSION_MAIL || mission.id === MISSION_NIGHTMAIL) {
      if (mission.gateIndex >= MAIL_GATES.length) return HOME_TARGET;
      const gate = MAIL_GATES[mission.gateIndex];
      return { x: gate.x, y: gate.y, z: gate.z, label: `MAIL ${mission.gateIndex + 1}/3` };
    }
    if (mission.id === MISSION_LANDING) {
      if (mission.climbed) return HOME_TARGET;
      return { x: 0, y: 260, z: 320, label: 'CLIMB TO 800 FT' };
    }
    if (mission.id === MISSION_FIRE) {
      if (flight && flight.state && flight.state.water < 1) {
        return { x: 0, y: 2, z: 2000, label: 'SCOOP WATER — LOW OVER THE SEA' };
      }
      return { x: FIRE_ZONE.x, y: 90, z: FIRE_ZONE.z, label: `FIRE DROP ${mission.drops + 1}/3` };
    }
    if (mission.id === MISSION_MEDEVAC) {
      if (!mission.patientPickedUp) {
        return { x: -1680, y: 40, z: 640, label: 'MERCUSUAR ISLET — LAND & PICK UP' };
      }
      return HOME_TARGET;
    }
    if (mission.id === MISSION_HOPPER) {
      if (mission.stopIndex < 3) {
        const strip = STRIPS[mission.stopIndex];
        return { x: strip.x, y: strip.elevation + 30, z: strip.z, label: `STOP ${mission.stopIndex + 1}/3 — ${strip.name}` };
      }
      return HOME_TARGET;
    }
    return null;
  }

  function update(dt, flight) {
    if (mission.finished || mission.failed) return [];
    const banners = [];
    mission.elapsed += dt;

    if (mission.id === MISSION_RINGS) {
      mission.timeLeft -= dt;
      if (mission.timeLeft <= 0) {
        mission.timeLeft = 0;
        mission.failed = true;
        mission.failReason = 'out of time on the ring course';
        banners.push('OUT OF TIME ON THE RING COURSE');
        log('Out of time on the ring course');
        return banners;
      }
    }

    if (mission.id === MISSION_NIGHTMAIL) {
      mission.timeLeft -= dt;
      if (mission.timeLeft <= 0) {
        mission.timeLeft = 0;
        mission.failed = true;
        mission.failReason = 'out of time on the night mail';
        banners.push('OUT OF TIME ON THE NIGHT MAIL');
        log('Out of time on the night mail');
        return banners;
      }
    }

    if (mission.id === MISSION_LANDING && !mission.climbed && flight && flight.state) {
      const altFt = Math.max(0, Math.round((flight.state.pos.y - 8) * 3.28084));
      if (altFt >= 800 && !flight.state.onGround) {
        mission.climbed = true;
        banners.push('800 FT — NOW BRING HER HOME');
        log('Reached 800 ft');
      }
    }

    if (mission.id === MISSION_MEDEVAC && flight && flight.state) {
      if (
        !mission.patientPickedUp &&
        flight.state.onGround &&
        flight.state.stripId === 'mercusuar'
      ) {
        mission.pickupTimer += dt;
        if (mission.pickupTimer >= 5) {
          mission.patientPickedUp = true;
          const pickupPoints = params.pickupPoints ?? 800;
          mission.score += pickupPoints;
          mission.scoreLines.push({ label: 'Patient aboard', points: pickupPoints });
          banners.push('PATIENT ABOARD — FLY HER HOME GENTLY');
          log(`Patient aboard +${pickupPoints}`);
        }
      } else {
        mission.pickupTimer = 0;
      }

      // Patient condition decays with time and hard manoeuvres — but only
      // once the patient is aboard. Before pickup they are on the ground at
      // Mercusuar; the plane's banking en route cannot hurt them.
      if (mission.patientPickedUp) {
        mission.patientCondition -= dt * 0.15;
        if (Math.abs(flight.state.roll) > 0.785) mission.patientCondition -= dt * 6;
        if (flight.state.verticalSpeed < -6) mission.patientCondition -= dt * 4;
        mission.patientCondition = Math.max(0, Math.min(100, mission.patientCondition));
        if (mission.patientCondition <= 0) {
          mission.failed = true;
          mission.failReason = 'patient condition critical';
          banners.push('PATIENT CRITICAL');
          log('Patient condition critical');
        }
      }
    }

    return banners;
  }

  function debrief() {
    let bestLanding = null;
    for (const landing of mission.landings) {
      if (!bestLanding || landing.quality > bestLanding.quality) bestLanding = landing;
    }
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
      scoreLines: mission.scoreLines,
      drops: mission.drops,
      scoops: mission.scoops,
      patientPickedUp: mission.patientPickedUp,
      patientCondition: Math.round(mission.patientCondition),
      stopsVisited: mission.stopsVisited,
    };
  }

  return { mission, onEvent, update, nextTarget, debrief, gradeLanding };
}
