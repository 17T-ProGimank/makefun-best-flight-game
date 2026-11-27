// Deterministic screenshot staging for "NUSA SKY RUN — Island Air Post" (round 2).
// main.js imports SHOT_NAMES, applyShot and colourRings from this module.
// applyShot stages one named scene and returns 'play'; main.js then paints
// three frames and sets window.__shotReady. Every shot is a real frame of the
// game code (same flight model, world, HUD) with a frozen, hand-placed plane.

export const SHOT_NAMES = ['cover', 'cockpit', 'landing', 'islands'];

const DEG = Math.PI / 180;

const COLOURS = {
  next: { hex: '#ffc21a', opacity: 0.95 },
  passed: { hex: '#37d67a', opacity: 0.45 },
  idle: { hex: '#2fb3e6', opacity: 0.7 },
};

function placePlane(flight, x, y, z, headingDeg, pitchDeg, rollDeg, speed, throttle) {
  const st = flight.state;
  st.pos.set(x, y, z);
  st.heading = headingDeg * DEG;
  st.pitch = pitchDeg * DEG;
  st.roll = rollDeg * DEG;
  st.speed = speed;
  st.throttle = throttle;
  st.onGround = false;
  st.fuel = 72;
  st.time = 42;
  st.distanceFlown = 1840;
  st.verticalSpeed = 0;
  st.crashed = false;
  st.crashReason = null;
}

function stageMission(game, id, fields) {
  game.setMissionForShot(id);
  // missionApi is a getter on gameForShots — read it fresh every time, never
  // hold a stale reference across a setMissionForShot call.
  Object.assign(game.missionApi.mission, fields);
}

export function applyShot(name, game) {
  const { flight, world } = game;
  if (name === 'cover') {
    // FIRE ATTACK: chase view, banking over the Nusa Selatan fire, one drop done.
    // Staged close to the fire zone (720, 1560) so the smoke columns and the
    // orange ground glow are in frame, not hidden behind the ridge.
    game.setView('chase');
    world.setDusk(false);
    stageMission(game, 'fire', { drops: 1, elapsed: 96, score: 1350 });
    world.fire.setRemaining(2);
    placePlane(flight, 680, 110, 1470, 165, -3, -20, 58, 0.62);
    flight.state.water = 0.5;
    game.banner('FIRE DROP 2/3', 6);
  } else if (name === 'cockpit') {
    // NIGHT MAIL: cockpit view on final to runway 09 at dusk, edge lights + PAPI lit.
    game.setView('cockpit');
    world.setDusk(true);
    stageMission(game, 'nightmail', { gatesPassed: 3, gateIndex: 3, elapsed: 150, score: 4500 });
    placePlane(flight, -560, 32, 320, 90, -3, 0, 46, 0.42);
    game.banner('FINAL — RWY 09', 6);
  } else if (name === 'landing') {
    // MEDEVAC: flaring over the threshold onto runway 09, patient aboard.
    game.setView('chase');
    world.setDusk(false);
    stageMission(game, 'medevac', { patientPickedUp: true, patientCondition: 82, elapsed: 210, score: 2800 });
    placePlane(flight, -380, 26, 318, 90, -2, 2, 38, 0.3);
    game.banner('MEDEVAC — RWY 09 — FLARE', 6);
  } else if (name === 'islands') {
    // ISLAND HOPPER: banking turn over the sea, lighthouse islet off the wing.
    game.setView('chase');
    world.setDusk(false);
    stageMission(game, 'hopper', { stopsVisited: 1, stopIndex: 1, elapsed: 120, score: 1450 });
    placePlane(flight, -610, 150, 55, 324, 1, -25, 58, 0.62);
    game.banner('STOP 2/3 — NUSA SELATAN', 6);
  } else {
    throw new Error(`unknown shot: ${name}`);
  }
  return 'play';
}

// Recolour the ring / gate hoops for the active sortie: the next objective is
// gold, passed ones are green, everything else stays idle blue. Only the
// rings and mail sorties colour their hoops; other sorties leave them idle.
export function colourRings(world, missionState) {
  if (!missionState || !world) return;
  const paint = (mesh, kind) => {
    const ud = mesh && mesh.userData;
    if (!ud || !ud.material || !ud.columnMaterial) return;
    const c = COLOURS[kind];
    ud.material.color.set(c.hex);
    ud.material.opacity = c.opacity;
    ud.columnMaterial.color.set(c.hex);
    ud.columnMaterial.opacity = c.opacity * 0.08;
  };
  if (missionState.id === 'rings' && Array.isArray(world.ringMeshes)) {
    world.ringMeshes.forEach((mesh, i) => {
      paint(mesh, i < (missionState.ringIndex || 0) ? 'passed' : i === (missionState.ringIndex || 0) ? 'next' : 'idle');
    });
  }
  if ((missionState.id === 'mail' || missionState.id === 'nightmail') && Array.isArray(world.gateMeshes)) {
    world.gateMeshes.forEach((mesh, i) => {
      paint(mesh, i < (missionState.gateIndex || 0) ? 'passed' : i === (missionState.gateIndex || 0) ? 'next' : 'idle');
    });
  }
}
