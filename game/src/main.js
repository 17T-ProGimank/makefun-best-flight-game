import * as THREE from 'three';
import {
  BEST_KEY, LOGBOOK_KEY, MAIL_GATES, MISSIONS, PALETTE,
  RINGS, RUNWAY, WORLD, FIRE_ZONE, STRIPS,
} from './config.js';
import { buildWorld, terrainHeight } from './terrain.js';
import { buildPlane, updateStrobe, setTankLevel, createDropEffect } from './plane.js';
import { createFlight } from './flight.js';
import { createMission } from './missions.js';
import { createRecorder } from './recorder.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_VIEW, ACTION_MUTE, ACTION_RESTART, createInput,
} from './input.js';
import { SHOT_NAMES, applyShot, colourRings } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;
const MISSION_ORDER = ['rings', 'mail', 'landing', 'free', 'fire', 'medevac', 'nightmail', 'hopper'];
const GRADE_RANK = { S: 4, A: 3, B: 2, C: 1, '': 0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapDeg = (d) => ((d + 540) % 360) - 180;
const normDeg = (d) => ((d % 360) + 360) % 360;
const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

window.__errors = [];
const errorsEl = document.getElementById('errors');
const selftestEl = document.getElementById('selftest');
function reportError(msg) {
  window.__errors.push(String(msg));
  if (errorsEl) errorsEl.textContent = window.__errors.slice(-5).join('\n');
}
window.addEventListener('error', (e) => reportError(e.message || 'error'));
window.addEventListener('unhandledrejection', (e) => reportError(String(e.reason || 'rejection')));

const params = new URLSearchParams(location.search);
const shotParam = params.get('shot');
const selftestParam = params.get('selftest');
const missiontestParam = params.get('missiontest');

// ---- Renderer / scene ----
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);

const world = buildWorld(RINGS, MAIL_GATES, { dusk: false });
const planeParts = buildPlane();
world.scene.add(planeParts.group);
const dropEffect = createDropEffect(world.scene);
const flight = createFlight(RINGS, MAIL_GATES, { fireZone: FIRE_ZONE, strips: STRIPS });
let missionApi = createMission('rings');
const recorder = createRecorder();
const hud = createHud(hudCanvas);
const audio = createAudio();
const input = createInput(glCanvas);

flight.resetOnRunway();

// ---- Persistent best / logbook ----
let best = {};
try {
  const raw = localStorage.getItem(BEST_KEY);
  if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') best = p; }
} catch (_) { best = {}; }
let logbook = { best: {}, flights: 0, rings: 0, mail: 0, bestGrade: '' };
try {
  const raw = localStorage.getItem(LOGBOOK_KEY);
  if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') logbook = { ...logbook, ...p, best: { ...(p.best || {}) } }; }
} catch (_) { /* keep defaults */ }

const titleEl = document.getElementById('title');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('over');
const bestLineEl = document.getElementById('best-line');
const logbookLineEl = document.getElementById('logbook-line');
const overTitleEl = document.getElementById('over-title');
const overBodyEl = document.getElementById('over-body');
const mapCanvas = document.getElementById('debrief-map');
const barsCanvas = document.getElementById('landing-bars');

function renderBestLine() {
  if (!bestLineEl) return;
  const entries = MISSION_ORDER.filter((id) => best[id] != null);
  if (!entries.length) {
    bestLineEl.textContent = 'No flights yet — set the score to beat.';
    return;
  }
  bestLineEl.textContent = 'Best scores: ' + entries
    .map((id) => `${(MISSIONS[id] && MISSIONS[id].name ? MISSIONS[id].name : id).toUpperCase()} ${best[id]}`)
    .join(' · ');
}

function renderLogbookLine() {
  if (!logbookLineEl) return;
  if (!logbook.flights) {
    logbookLineEl.textContent = 'First flight — set the score to beat.';
    return;
  }
  const ringBest = logbook.best && logbook.best.rings != null ? logbook.best.rings : 0;
  logbookLineEl.textContent =
    `Logbook: ${logbook.flights} flight${logbook.flights === 1 ? '' : 's'} · best ring score ${ringBest} · best landing ${logbook.bestGrade || '—'}`;
}

renderBestLine();
renderLogbookLine();

// ---- Screen / view state ----
let screen = 'title';
let view = 'chase';
let currentMissionId = 'rings';
let banners = [];
let elapsed = 0;
let lastNow = performance.now();
let acc = 0;
let sampleTimer = 0;

function showOnly(el) {
  for (const o of [titleEl, pauseEl, overEl]) {
    if (o) o.classList.toggle('hidden', o !== el);
  }
}

function banner(text, seconds = 3, color = PALETTE.hudAmber, size = 34) {
  banners.push({ text, until: (missionApi.mission.elapsed || 0) + seconds, color, size, alpha: 1 });
}

function setView(next) {
  view = next;
  planeParts.group.visible = next !== 'cockpit';
  camera.fov = next === 'cockpit' ? 68 : 62;
  camera.updateProjectionMatrix();
}

function setMissionForShot(id) {
  missionApi = createMission(id);
  currentMissionId = id;
}

const gameForShots = {
  flight,
  get missionApi() { return missionApi; },
  world,
  setView,
  setMissionForShot,
  banner,
};

// ---- Game flow ----
function startGame(missionId) {
  audio.ensure();
  missionApi = createMission(missionId);
  currentMissionId = missionId;
  flight.resetOnRunway();
  recorder.start();
  world.setDusk(missionId === 'nightmail');
  if (world.runway && world.runway.userData && world.runway.userData.edgeLights) {
    world.runway.userData.edgeLights.setLit(missionId === 'nightmail');
  }
  if (world.strips) {
    for (const s of world.strips) {
      if (s.setFlare) s.setFlare(missionId === 'nightmail');
    }
  }
  input.setThrottle(0);
  banners.length = 0;
  acc = 0;
  sampleTimer = 0;
  screen = 'play';
  showOnly(null);
  const m = missionApi.mission;
  banner(`${m.name} — ${m.tag}`, 4, PALETTE.hudCyan, 26);
  if (missionId === 'rings') banner('THROTTLE UP — LIFT OFF AT 55 KT', 4, PALETTE.hudAmber, 26);
}

function endFlight(crashed) {
  screen = 'over';
  const debrief = missionApi.debrief();
  const rec = recorder.finish();
  const stats = recorder.getStats();
  // Persist best + logbook.
  const prevBest = best[currentMissionId] || 0;
  if (debrief.score > prevBest) best[currentMissionId] = debrief.score;
  logbook.flights = (logbook.flights || 0) + 1;
  logbook.best = logbook.best || {};
  if (debrief.score > (logbook.best[currentMissionId] || 0)) logbook.best[currentMissionId] = debrief.score;
  logbook.rings = (logbook.rings || 0) + (debrief.rings || 0);
  logbook.mail = (logbook.mail || 0) + (debrief.gates || 0);
  const g = debrief.bestLanding && debrief.bestLanding.grade;
  if (g && (GRADE_RANK[g] || 0) > (GRADE_RANK[logbook.bestGrade] || 0)) logbook.bestGrade = g;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
    localStorage.setItem(LOGBOOK_KEY, JSON.stringify(logbook));
  } catch (_) { /* storage may be unavailable */ }

  if (overTitleEl) overTitleEl.textContent = crashed ? 'FLIGHT OVER' : 'SORTIE COMPLETE';
  const rows = [];
  const row = (label, value, cls = '') => `<div class="debrief-row ${cls}"><span class="lbl">${label}</span><b>${value}</b></div>`;
  rows.push(row('Mission', debrief.mission && debrief.mission.name ? debrief.mission.name : currentMissionId));
  rows.push(row('Score', debrief.score));
  rows.push(row('Flight time', fmtTime(debrief.elapsed)));
  rows.push(row('Rings', `${debrief.rings || 0}/8`));
  rows.push(row('Mail', `${debrief.gates || 0}/3`));
  if (currentMissionId === 'fire') rows.push(row('Fire drops', `${debrief.drops || 0}/3`));
  if (currentMissionId === 'medevac') {
    rows.push(row('Patient', debrief.patientPickedUp ? 'Picked up' : 'Not picked up'));
    rows.push(row('Patient condition', `${Math.round(debrief.patientCondition ?? 100)}%`));
  }
  if (currentMissionId === 'hopper') rows.push(row('Stops', `${debrief.stopsVisited || 0}/3`));
  const bestGrade = debrief.bestLanding && debrief.bestLanding.grade ? debrief.bestLanding.grade : '—';
  rows.push(row('Landings', `${debrief.landings || 0} · best ${bestGrade}`));
  const outcome = crashed
    ? (debrief.failReason || 'Crashed')
    : (debrief.finished ? 'Sortie complete' : 'Sortie ended');
  rows.push(row('Outcome', outcome, crashed ? 'bad' : 'good'));

  let html = rows.join('');
  if (debrief.scoreLines && debrief.scoreLines.length) {
    html += '<h3>SCORE BREAKDOWN</h3>';
    for (const l of debrief.scoreLines) {
      const lab = l.label ?? l.text ?? '';
      const pts = l.points ?? l.value ?? '';
      html += `<div class="debrief-row"><span class="lbl">${lab}</span><b>${pts}</b></div>`;
    }
  }
  html += `<div class="debrief-row"><span class="lbl">Max alt ${Math.round(stats.maxAltFt || 0)} ft · Max speed ${Math.round(stats.maxSpeedKt || 0)} kt · Distance ${((stats.distanceFlown || 0) / 1000).toFixed(1)} km</span><b></b></div>`;
  const evs = (debrief.events || []).slice(-8).map((e) => (typeof e === 'string' ? e : (e.text || e.type || '')));
  if (evs.length) html += `<h3>FLIGHT LOG</h3><div class="debrief-log">${evs.join('\n')}</div>`;
  if (overBodyEl) overBodyEl.innerHTML = html;

  // Recorder visuals.
  const samples = (rec && rec.samples) || recorder.samples || [];
  const last = samples.length ? samples[samples.length - 1] : null;
  if (mapCanvas) {
    recorder.drawMap(mapCanvas, { crash: crashed && last ? { x: last.x, z: last.z } : null });
  }
  if (barsCanvas) {
    if (debrief.bestLanding) {
      barsCanvas.style.display = '';
      recorder.drawLandingBars(barsCanvas, debrief.bestLanding);
    } else {
      barsCanvas.style.display = 'none';
    }
  }
  showOnly(overEl);
  renderBestLine();
  renderLogbookLine();
}

// ---- Per-frame world updates ----
function updateCamera(dt) {
  const st = flight.state;
  const h = st.heading;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const speed = st.speed || 0;
  const fovTarget = (view === 'cockpit' ? 68 : 62) + Math.min(10, speed * 0.1);
  camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  if (view === 'cockpit') {
    camera.position.set(
      st.pos.x + fx * 2.2,
      st.pos.y + 1.05,
      st.pos.z + fz * 2.2,
    );
    const look = new THREE.Vector3(
      st.pos.x + fx * 120,
      st.pos.y + Math.tan(st.pitch || 0) * 120,
      st.pos.z + fz * 120,
    );
    camera.lookAt(look);
    camera.rotateZ(-(st.roll || 0) * 0.85);
  } else {
    let bx = st.pos.x - fx * 17;
    let by = st.pos.y + 5.2;
    let bz = st.pos.z - fz * 17;
    if (st.stalled) {
      bx += (Math.random() - 0.5) * 0.35;
      by += (Math.random() - 0.5) * 0.3;
      bz += (Math.random() - 0.5) * 0.35;
    }
    const k = 1 - Math.exp(-8 * Math.max(dt, 0.001));
    camera.position.x += (bx - camera.position.x) * k;
    camera.position.y += (by - camera.position.y) * k;
    camera.position.z += (bz - camera.position.z) * k;
    camera.lookAt(st.pos.x + fx * 34, st.pos.y + 1, st.pos.z + fz * 34);
  }
}

function updatePlaneMesh(dt, t) {
  const st = flight.state;
  planeParts.group.position.set(st.pos.x, st.pos.y, st.pos.z);
  planeParts.group.rotation.order = 'YXZ';
  planeParts.group.rotation.y = Math.PI - st.heading;
  planeParts.group.rotation.x = -(st.pitch || 0);
  planeParts.group.rotation.z = -(st.roll || 0);
  planeParts.propeller.rotation.z += (4 + (st.throttle || 0) * 26 + (st.speed || 0) * 0.25) * dt;
  updateStrobe(planeParts.strobe, t);
}

function updatePapi() {
  const papi = world.runway && world.runway.userData ? world.runway.userData.papi : null;
  if (!papi || !papi.length) return;
  const cx = RUNWAY.x ?? 0;
  const cz = RUNWAY.z ?? 320;
  const elev = RUNWAY.elevation ?? 8;
  const len = RUNWAY.length ?? 620;
  const tx = cx - len / 2;
  const tz = cz;
  const st = flight.state;
  const dx = st.pos.x - tx;
  const dz = st.pos.z - tz;
  const dist = Math.hypot(dx, dz);
  const hdgDeg = normDeg((st.heading * 180) / Math.PI);
  const approaching = dist > 0 && dist <= 1400 && Math.abs(dz) < 160
    && Math.abs(wrapDeg(hdgDeg - 90)) <= 25
    && st.pos.y >= elev + 5 && st.pos.y <= elev + 260;
  let whites = 2;
  if (approaching) {
    const angle = Math.atan2(st.pos.y - elev, Math.max(dist, 1)) * 180 / Math.PI;
    whites = angle > 3.4 ? 4 : angle > 3.1 ? 3 : angle > 2.9 ? 2 : angle > 2.6 ? 1 : 0;
  }
  papi.forEach((lamp, i) => {
    const white = i < whites;
    if (lamp.material) {
      lamp.material.color.set(white ? 0xffffff : 0xff2a2a);
      if ('emissive' in lamp.material) lamp.material.emissive.set(white ? 0xffffff : 0xff2a2a);
    }
  });
}

function handleFlightEvents(events) {
  for (const event of events) {
    let lines = [];
    try { lines = missionApi.onEvent(event, flight) || []; } catch (e) { reportError(e); }
    for (const line of lines) banner(line, 3.5);
    const kind = event.type;
    if (kind === 'ring' || kind === 'gate' || kind === 'drop' || kind === 'pickup'
      || kind === 'touchdown' || kind === 'crash') {
      recorder.event(lines[0] || kind, missionApi.mission.elapsed);
    }
    if (kind === 'ring' || kind === 'gate') audio.chime();
    if (kind === 'touchdown') audio.thud();
    if (kind === 'scoop') audio.splash();
    if (kind === 'drop') {
      dropEffect.drop(event.x, flight.state.pos.y, event.z);
      audio.splash();
    }
    if (kind === 'crash') {
      audio.crashSound();
      endFlight(true);
      return;
    }
  }
  if (missionApi.mission.finished) endFlight(false);
}

function hudState(t) {
  const st = flight.state;
  const m = missionApi.mission;
  const target = missionApi.nextTarget ? missionApi.nextTarget(flight) : null;
  let targetInfo = null;
  if (target) {
    const dx = target.x - st.pos.x;
    const dy = (target.y || 0) - st.pos.y;
    const dz = target.z - st.pos.z;
    targetInfo = {
      label: target.label || 'TARGET',
      distance: Math.hypot(dx, dy, dz),
      bearingDeg: normDeg((Math.atan2(dx, -dz) * 180) / Math.PI),
    };
  }
  const warnings = [];
  if (st.stalled) warnings.push({ text: 'STALL — NOSE DOWN, THROTTLE UP', color: '#ff5252', blink: true });
  if (st.fuel <= 0) warnings.push({ text: 'FUEL EMPTY', color: '#ff5252', blink: true });
  else if (st.fuel < 20) warnings.push({ text: 'LOW FUEL', color: '#ffc21a', blink: true });
  if (st.outOfBounds) warnings.push({ text: 'OUT OF BOUNDS — TURN BACK', color: '#ffc21a', blink: true });
  return {
    inFlight: screen === 'play' || screen === 'paused',
    readouts: flight.readouts(),
    mission: m,
    timeLeft: m.timeLeft,
    score: m.score,
    elapsed: m.elapsed,
    view,
    target: targetInfo,
    warnings,
    banners: banners.filter((b) => b.until > (m.elapsed || 0)),
    pitchDeg: ((st.pitch || 0) * 180) / Math.PI,
    rollRad: st.roll || 0,
    water: st.water || 0,
    dusk: currentMissionId === 'nightmail',
  };
}

// ---- Main loop ----
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastNow) / 1000, MAX_FRAME);
  lastNow = now;
  elapsed += dt;

  const actions = input.takeActions();
  const missionKey = input.takeMissionKey();
  if (actions & ACTION_MUTE) audio.toggleMute();

  if (screen === 'title') {
    if (missionKey >= 1 && missionKey <= 8) startGame(MISSION_ORDER[missionKey - 1]);
    else if (actions & ACTION_CONFIRM) startGame('rings');
  } else if (screen === 'play') {
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      showOnly(pauseEl);
    } else if (actions & ACTION_VIEW) {
      setView(view === 'chase' ? 'cockpit' : 'chase');
    } else if (actions & ACTION_RESTART) {
      startGame(currentMissionId);
    }
  } else if (screen === 'paused') {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
      screen = 'play';
      showOnly(null);
    } else if (actions & ACTION_RESTART) {
      startGame(currentMissionId);
    }
  } else if (screen === 'over') {
    if (actions & ACTION_CONFIRM) {
      screen = 'title';
      showOnly(titleEl);
    } else if (actions & ACTION_RESTART) {
      startGame(currentMissionId);
    }
  }

  if (screen === 'play') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 20) {
      acc -= STEP;
      guard += 1;
      const steer = input.steering();
      const throttle = input.updateThrottle(STEP);
      const events = flight.step(STEP, { ...steer, throttle });
      let missionBanners = [];
      try { missionBanners = missionApi.update(STEP, flight) || []; } catch (e) { reportError(e); }
      for (const line of missionBanners) banner(line, 3.5);
      handleFlightEvents(events);
      if (screen !== 'play') break;
    }
    sampleTimer += dt;
    if (sampleTimer >= 1) {
      sampleTimer -= 1;
      const st = flight.state;
      recorder.sample({
        t: missionApi.mission.elapsed, alt: st.pos.y, speed: st.speed,
        heading: st.heading, x: st.pos.x, z: st.pos.z,
        throttle: st.throttle, fuel: st.fuel,
      });
    }
  }

  const st = flight.state;
  world.update(dt, elapsed, st.pos);
  updatePlaneMesh(dt, elapsed);
  updateCamera(dt);
  updatePapi();
  colourRings(world, missionApi.mission);
  if (currentMissionId === 'rings' && world.ringMeshes && missionApi.mission.ringIndex < world.ringMeshes.length) {
    const mesh = world.ringMeshes[missionApi.mission.ringIndex];
    if (mesh) {
      const s = 1 + 0.05 * Math.sin(elapsed * 4);
      mesh.scale.set(s, s, s);
    }
  }
  if (currentMissionId === 'fire' && world.fire) {
    world.fire.setRemaining((missionApi.mission.dropsNeeded || 3) - (missionApi.mission.drops || 0));
  }
  setTankLevel(planeParts.tank, st.water || 0);
  dropEffect.update(dt);
  audio.setFlight(st.throttle || 0, st.speed || 0, st.onGround);
  hud.draw(hudState(elapsed));
  renderer.render(world.scene, camera);
}

// ---- Headless modes ----
function runShot(name) {
  applyShot(name, gameForShots);
  screen = 'play';
  showOnly(null);
  updateCamera(1);
  let painted = 0;
  const paint = () => {
    const st = flight.state;
    world.update(0.016, 42, st.pos);
    updatePlaneMesh(0.016, 42);
    updateCamera(0.05);
    updatePapi();
    colourRings(world, missionApi.mission);
    hud.draw(hudState(42));
    renderer.render(world.scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
}

function runSelfTest() {
  const report = { errors: window.__errors, steps: 0, events: [], final: {}, fire: { scooped: false, drops: 0 } };
  try {
    // Phase 1: rings — take off and climb.
    startGame('rings');
    input.setThrottle(0.85);
    let steps = 0;
    for (let i = 0; i < 2400; i++) {
      steps += 1;
      const st = flight.state;
      const pitch = st.onGround ? (st.speed > 34 ? 0.5 : 0) : (st.pos.y < 120 ? 0.35 : 0);
      const roll = st.pos.x > 900 ? -0.5 : 0.12;
      const events = flight.step(STEP, { roll, pitch, throttle: 0.85, rudder: 0 });
      try { missionApi.update(STEP, flight); } catch (_) { /* ignore */ }
      for (const ev of events) {
        report.events.push(ev.type);
        try { missionApi.onEvent(ev, flight); } catch (_) { /* ignore */ }
      }
      if (flight.state.crashed || missionApi.mission.finished) break;
    }
    report.steps += steps;
    // Phase 2: teleport near a ring and fly through it.
    const st2 = flight.state;
    st2.pos.set(100, 120, 320);
    st2.heading = Math.PI / 2;
    st2.pitch = 0;
    st2.roll = 0;
    st2.speed = 50;
    st2.throttle = 0.6;
    st2.onGround = false;
    st2.crashed = false;
    for (let i = 0; i < 720; i++) {
      report.steps += 1;
      const events = flight.step(STEP, { roll: 0, pitch: 0, throttle: 0.6, rudder: 0 });
      try { missionApi.update(STEP, flight); } catch (_) { /* ignore */ }
      for (const ev of events) {
        report.events.push(ev.type);
        try { missionApi.onEvent(ev, flight); } catch (_) { /* ignore */ }
      }
      if ((missionApi.mission.ringsPassed || 0) > 0) break;
      if (flight.state.crashed || missionApi.mission.finished) break;
    }
    // Phase 3: fire — scoop then drop.
    startGame('fire');
    const st3 = flight.state;
    st3.pos.set(0, 4, 2000);
    st3.heading = Math.PI;
    st3.speed = 50;
    st3.throttle = 0.6;
    st3.onGround = false;
    st3.crashed = false;
    for (let i = 0; i < 240; i++) {
      report.steps += 1;
      const events = flight.step(STEP, { roll: 0, pitch: 0, throttle: 0.6, rudder: 0 });
      try { missionApi.update(STEP, flight); } catch (_) { /* ignore */ }
      for (const ev of events) {
        report.events.push(ev.type);
        try { missionApi.onEvent(ev, flight); } catch (_) { /* ignore */ }
      }
      if (flight.state.water >= 1) { report.fire.scooped = true; break; }
      if (flight.state.crashed) break;
    }
    if (report.fire.scooped) {
      const st4 = flight.state;
      st4.pos.set(720, 90, 1560);
      st4.heading = Math.PI / 2;
      st4.speed = 50;
      st4.throttle = 0.6;
      st4.onGround = false;
      st4.crashed = false;
      for (let i = 0; i < 240; i++) {
        report.steps += 1;
        const events = flight.step(STEP, { roll: 0, pitch: 0, throttle: 0.6, rudder: 0 });
        try { missionApi.update(STEP, flight); } catch (_) { /* ignore */ }
        for (const ev of events) {
          report.events.push(ev.type);
          try { missionApi.onEvent(ev, flight); } catch (_) { /* ignore */ }
        }
        if ((missionApi.mission.drops || 0) >= 1) { report.fire.drops = missionApi.mission.drops; break; }
        if (flight.state.crashed) break;
      }
    }
    const fs = flight.state;
    report.final = {
      crashed: !!fs.crashed,
      reason: fs.crashReason || '',
      altitudeFt: Math.round((fs.pos.y || 0) * M_TO_FT),
      speedKt: Math.round((fs.speed || 0) * MS_TO_KT),
      fuel: Math.round(fs.fuel || 0),
      score: missionApi.mission.score,
      rings: missionApi.mission.ringsPassed || 0,
      distanceFlown: Math.round(fs.distanceFlown || 0),
    };
  } catch (e) {
    report.error = String(e && e.message ? e.message : e);
  }
  report.errors = window.__errors;
  if (selftestEl) selftestEl.textContent = JSON.stringify(report);
  window.__shotReady = true;
}

function runMissionTest(id) {
  const report = {
    mode: 'missiontest', mission: id, errors: window.__errors,
    steps: 0, seconds: 0, events: [], final: {},
  };
  try {
    startGame(id);
    const maxSteps = 300 * 60;
    for (let i = 0; i < maxSteps; i++) {
      report.steps += 1;
      const st = flight.state;
      const target = missionApi.nextTarget ? missionApi.nextTarget(flight) : null;
      let roll = 0;
      let pitch = 0;
      let throttle = 0.7;
      if (target) {
        const dx = target.x - st.pos.x;
        const dz = target.z - st.pos.z;
        const dist = Math.hypot(dx, dz);
        const bearing = normDeg((Math.atan2(dx, -dz) * 180) / Math.PI);
        const hdgDeg = normDeg((st.heading * 180) / Math.PI);
        const bearingDiff = wrapDeg(bearing - hdgDeg);
        roll = clamp(bearingDiff / 45, -1, 1);
        // Aim at the target's own altitude for rings/gates: a ring only
        // registers inside radius+2 m of its centre, so the old +30 m
        // offset flew the autopilot over every hoop without ever passing
        // through one. Other targets keep a +30 m approach cushion.
        // (Scoop/drop targets deliberately keep the cushion: diving to the
        // 2 m scoop altitude on departure flies the plane into terrain
        // before it reaches the sea — verified by missiontest.)
        const isHoop = /^(RING|MAIL)/.test(target.label || '');
        const desiredAlt = (target.y || 0) + (isHoop ? 0 : 30);
        pitch = st.onGround ? (st.speed > 34 ? 0.5 : 0) : clamp((desiredAlt - st.pos.y) / 60, -0.6, 0.6);
        if (/land|runway|strip/i.test(target.label || '') && dist < 600 && st.pos.y < 60) throttle = 0.3;
      } else {
        pitch = st.onGround ? (st.speed > 34 ? 0.5 : 0) : clamp((120 - st.pos.y) / 60, -0.6, 0.6);
      }
      const events = flight.step(STEP, { roll, pitch, throttle, rudder: 0 });
      try { missionApi.update(STEP, flight); } catch (_) { /* ignore */ }
      for (const ev of events) {
        report.events.push(ev.type);
        try { missionApi.onEvent(ev, flight); } catch (_) { /* ignore */ }
      }
      if (flight.state.crashed || missionApi.mission.finished || missionApi.mission.failed) break;
    }
    report.seconds = Math.round(report.steps / 60);
    const fs = flight.state;
    const m = missionApi.mission;
    report.final = {
      finished: !!m.finished,
      failed: !!m.failed,
      failReason: m.failReason || fs.crashReason || '',
      score: m.score,
      rings: m.ringsPassed || 0,
      gates: m.gatesPassed || 0,
      drops: m.drops || 0,
      stopsVisited: m.stopsVisited || 0,
      patientPickedUp: !!m.patientPickedUp,
      patientCondition: Math.round(m.patientCondition ?? 100),
      landings: m.landings || 0,
      altitudeFt: Math.round((fs.pos.y || 0) * M_TO_FT),
      speedKt: Math.round((fs.speed || 0) * MS_TO_KT),
      fuel: Math.round(fs.fuel || 0),
      distanceFlown: Math.round(fs.distanceFlown || 0),
    };
  } catch (e) {
    report.error = String(e && e.message ? e.message : e);
  }
  report.errors = window.__errors;
  if (selftestEl) selftestEl.textContent = JSON.stringify(report);
  window.__shotReady = true;
}

// ---- UI wiring ----
document.querySelectorAll('[data-mission]').forEach((btn) => {
  btn.addEventListener('click', () => startGame(btn.dataset.mission));
});
document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.action;
    if (a === 'resume') { screen = 'play'; showOnly(null); }
    else if (a === 'restart' || a === 'again') startGame(currentMissionId);
    else if (a === 'title') { screen = 'title'; showOnly(titleEl); }
  });
});
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  hud.resize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    showOnly(pauseEl);
  }
});

// ---- Boot ----
if (selftestParam === '1') {
  runSelfTest();
} else if (missiontestParam && MISSIONS[missiontestParam]) {
  runMissionTest(missiontestParam);
} else if (shotParam && SHOT_NAMES.includes(shotParam)) {
  runShot(shotParam);
} else {
  showOnly(titleEl);
  requestAnimationFrame(frame);
}
