// Deterministic screenshot staging: ?shot=cover|cockpit|landing|islands puts the
// game into a fixed, good-looking state — the same seed always gives the same frame
// — so the screenshots are real renders of the game's own code. Each shot starts
// from a fresh flight on the runway, then overrides the plane and mission state.
// NOTE: the mission object is read through game.missionApi every time, because
// setMissionForShot replaces it — a destructured copy would go stale.

export const SHOT_NAMES = ['cover', 'cockpit', 'landing', 'islands'];

function placePlane(flight, x, y, z, headingDeg, pitchDeg, rollDeg, speed, throttle) {
  const f = flight.state;
  f.pos.set(x, y, z);
  f.heading = (headingDeg * Math.PI) / 180;
  f.pitch = (pitchDeg * Math.PI) / 180;
  f.roll = (rollDeg * Math.PI) / 180;
  f.speed = speed;
  f.throttle = throttle;
  f.onGround = false;
  f.fuel = 72;
  f.time = 42;
  f.distanceFlown = 1840;
}

function stageMission(game, id, fields) {
  game.setMissionForShot(id);
  Object.assign(game.missionApi.mission, fields);
}

export function applyShot(name, game) {
  const { flight } = game;
  flight.resetOnRunway();

  if (name === 'cockpit') {
    // Final approach: cockpit view, runway 09 ahead, PAPI lights, gear down feel.
    game.setView('cockpit');
    stageMission(game, 'landing', { climbed: true, elapsed: 96, score: 0 });
    placePlane(flight, -560, 32, 320, 90, -3, 0, 46, 0.42);
    game.banner('FINAL — RWY 09', 6);
    return 'play';
  }
  if (name === 'landing') {
    // Just over the threshold, flaring onto runway 09.
    game.setView('chase');
    stageMission(game, 'landing', { climbed: true, elapsed: 128, score: 0 });
    placePlane(flight, -380, 26, 318, 90, -2, 2, 38, 0.3);
    game.banner('RWY 09 — FLARE', 6);
    return 'play';
  }
  if (name === 'islands') {
    // Banking turn over the sea, ring 7 low ahead, lighthouse islet off the left wing.
    game.setView('chase');
    stageMission(game, 'rings', {
      ringsPassed: 6, ringIndex: 6, elapsed: 74, score: 6200, timeLeft: 96,
    });
    placePlane(flight, -610, 150, 55, 324, 1, -25, 58, 0.62);
    game.banner('RING 7/8', 6);
    return 'play';
  }
  // cover: chasing ring 3 over the coast, town and runway behind, HUD alive.
  game.setView('chase');
  stageMission(game, 'rings', {
    ringsPassed: 2, ringIndex: 2, elapsed: 42, score: 2400, timeLeft: 118,
  });
  placePlane(flight, 900, 170, -550, 35, 0, 10, 64, 0.68);
  game.banner('RING 3/8', 6);
  return 'play';
}

/** Ring/gate mesh colouring: next gold, passed green, the rest idle blue. */
export function colourRings(world, missionState) {
  const rings = world.ringMeshes;
  rings.forEach((mesh, i) => {
    const mat = mesh.userData.material;
    const col = mesh.userData.columnMaterial;
    if (missionState.id === 'rings') {
      if (i < missionState.ringIndex) {
        mat.color.set('#37d67a');
        col.color.set('#37d67a');
        mat.opacity = 0.45;
      } else if (i === missionState.ringIndex) {
        mat.color.set('#ffc21a');
        col.color.set('#ffc21a');
        mat.opacity = 0.95;
      } else {
        mat.color.set('#2fb3e6');
        col.color.set('#2fb3e6');
        mat.opacity = 0.7;
      }
    }
  });
  world.gateMeshes.forEach((mesh, i) => {
    const mat = mesh.userData.material;
    const col = mesh.userData.columnMaterial;
    if (missionState.id === 'mail') {
      if (i < missionState.gateIndex) {
        mat.color.set('#37d67a');
        col.color.set('#37d67a');
        mat.opacity = 0.45;
      } else if (i === missionState.gateIndex) {
        mat.color.set('#ffc21a');
        col.color.set('#ffc21a');
        mat.opacity = 0.95;
      } else {
        mat.color.set('#2fb3e6');
        col.color.set('#2fb3e6');
        mat.opacity = 0.7;
      }
    }
  });
}
