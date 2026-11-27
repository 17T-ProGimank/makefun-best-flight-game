// NUSA SKY RUN — Island Air Post. Boot and the one loop: input is read every frame,
// the flight model advances in fixed 1/60 s steps, the mission consumes its events,
// and the renderer paints the world, the plane and the HUD. Screens: title, play,
// paused, over (debrief). ?shot=cover|cockpit|landing|islands stages a fixed scene
// for a screenshot instead of running the loop, and ?selftest=1 runs the physics
// headlessly and reports into #selftest.

import * as THREE from 'three';
import { BEST_KEY, MAIL_GATES, MISSIONS, PALETTE, RINGS, RUNWAY, WORLD } from './config.js';
import { buildWorld, terrainHeight } from './terrain.js';
import { buildPlane, updateStrobe } from './plane.js';
import { createFlight } from './flight.js';
import { createMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_VIEW, createInput,
} from './input.js';
import { SHOT_NAMES, applyShot, colourRings } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error));
  const el = document.getElementById('errors');
  if (el) el.textContent = window.__errors.join(' | ');
});
window.addEventListener('unhandledrejection', (event) => {
  window.__errors.push(String(event.reason));
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const titleEl = document.getElementById('title');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('over');
const overTitleEl = document.getElementById('over-title');
const overBodyEl = document.getElementById('over-body');
const bestEl = document.getElementById('best-line');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
camera.position.set(-40, 40, 320);

const world = buildWorld(RINGS, MAIL_GATES);
const planeParts = buildPlane();
world.scene.add(planeParts.group);
const flight = createFlight(RINGS, MAIL_GATES);
let missionApi = createMission('rings');
const hud = createHud(hudCanvas);
const audio = createAudio();
const input = createInput(glCanvas);

let screen = 'title';
let view = 'chase';
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}
if (bestEl) bestEl.textContent = best > 0 ? `Best score so far: ${best}` : 'First flight — set the score to beat.';

const banners = [];
function banner(text, seconds = 3, color = PALETTE.hudAmber, size = 34) {
  banners.push({ text, until: missionApi.mission.elapsed + seconds, color, size, alpha: 1 });
}

function setView(next) {
  view = next;
  // The cockpit camera sits where the pilot's head is: hide the plane mesh or the
  // view fills with fuselage. The chase view shows the whole aircraft again.
  planeParts.group.visible = next !== 'cockpit';
  camera.fov = next === 'cockpit' ? 68 : 62;
  camera.updateProjectionMatrix();
}

function setMissionForShot(id) {
  missionApi = createMission(id);
}

const gameForShots = {
  flight,
  get missionApi() { return missionApi; },
  world,
  setView,
  setMissionForShot,
  banner,
};

function showOnly(el) {
  for (const node of [titleEl, pauseEl, overEl]) {
    if (node) node.classList.toggle('hidden', node !== el);
  }
}

function startGame(missionId) {
  audio.ensure();
  missionApi = createMission(missionId);
  flight.resetOnRunway();
  input.setThrottle(0);
  banners.length = 0;
  screen = 'play';
  showOnly(null);
  banner(`${missionApi.mission.name} — ${missionApi.mission.tag}`, 4, PALETTE.hudCyan, 26);
  if (missionId === 'rings') banner('THROTTLE UP — LIFT OFF AT 55 KT', 4);
}

function endFlight(crashed) {
  screen = 'over';
  const debrief = missionApi.debrief();
  if (debrief.score > best) {
    best = debrief.score;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch { /* storage off: best lasts this visit only */ }
  }
  if (overTitleEl) overTitleEl.textContent = crashed ? 'FLIGHT OVER' : 'SORTIE COMPLETE';
  if (overBodyEl) {
    const landing = debrief.bestLanding;
    overBodyEl.innerHTML = [
      `<div class="debrief-row"><span>Mission</span><b>${debrief.mission}</b></div>`,
      `<div class="debrief-row"><span>Score</span><b>${debrief.score}</b></div>`,
      `<div class="debrief-row"><span>Flight time</span><b>${Math.floor(debrief.elapsed / 60)}:${String(Math.floor(debrief.elapsed % 60)).padStart(2, '0')}</b></div>`,
      `<div class="debrief-row"><span>Rings</span><b>${debrief.rings} / 8</b></div>`,
      `<div class="debrief-row"><span>Mail delivered</span><b>${debrief.gates} / 3</b></div>`,
      `<div class="debrief-row"><span>Landings</span><b>${debrief.landings}${landing ? ` — best grade ${landing.grade}` : ''}</b></div>`,
      crashed ? `<div class="debrief-row bad"><span>Outcome</span><b>Crashed — ${debrief.failReason}</b></div>`
        : `<div class="debrief-row good"><span>Outcome</span><b>${debrief.finished ? 'Mission complete' : 'Landed safe'}</b></div>`,
      `<div class="debrief-log">${debrief.events.slice(-6).map((e) => `• ${e}`).join('<br>')}</div>`,
    ].join('');
  }
  showOnly(overEl);
  if (bestEl) bestEl.textContent = `Best score so far: ${best}`;
}

function updateCamera(dt) {
  const f = flight.state;
  const forward = new THREE.Vector3(Math.sin(f.heading), 0, -Math.cos(f.heading));
  if (view === 'cockpit') {
    const target = f.pos.clone()
      .addScaledVector(forward, 2.2)
      .add(new THREE.Vector3(0, 1.05, 0));
    camera.position.lerp(target, Math.min(1, 18 * dt));
    const look = f.pos.clone()
      .addScaledVector(new THREE.Vector3(Math.sin(f.heading) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.heading) * Math.cos(f.pitch)), 120);
    camera.lookAt(look);
    // Roll around the camera's own forward axis: never touch rotation.z after
    // lookAt, it would rewrite the yaw/pitch lookAt just solved.
    camera.rotateZ(-f.roll * 0.85);
  } else {
    const behind = f.pos.clone()
      .addScaledVector(forward, -17)
      .add(new THREE.Vector3(0, 5.2, 0));
    camera.position.lerp(behind, Math.min(1, 5 * dt));
    const look = f.pos.clone().addScaledVector(forward, 34).add(new THREE.Vector3(0, 1.5, 0));
    camera.lookAt(look);
    // Stall buffet shakes the chase camera a touch.
    if (f.stalled) {
      camera.position.x += (Math.random() - 0.5) * 0.35;
      camera.position.y += (Math.random() - 0.5) * 0.35;
    }
  }
  const targetFov = (view === 'cockpit' ? 68 : 62) + Math.min(10, f.speed * 0.1);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
  }
}

function updatePlaneMesh(dt, elapsed) {
  const f = flight.state;
  planeParts.group.position.copy(f.pos);
  planeParts.group.rotation.order = 'YXZ';
  planeParts.group.rotation.y = Math.PI - f.heading;
  planeParts.group.rotation.x = -f.pitch;
  planeParts.group.rotation.z = -f.roll;
  const propSpeed = 4 + f.throttle * 26 + f.speed * 0.25;
  planeParts.propeller.rotation.z += propSpeed * dt;
  updateStrobe(planeParts.strobe, elapsed);
}

function updatePapi() {
  const papi = world.runway.userData.papi;
  if (!papi) return;
  const f = flight.state;
  const thresholdX = RUNWAY.centreX - RUNWAY.length / 2;
  const distToThreshold = thresholdX - f.pos.x;
  const approaching = distToThreshold > 0 && distToThreshold < 1400
    && Math.abs(f.pos.z - RUNWAY.centreZ) < 160
    && Math.abs(((f.heading * 180) / Math.PI % 360 + 360) % 360 - 90) < 25
    && f.pos.y > RUNWAY.elevation + 5 && f.pos.y < RUNWAY.elevation + 260;
  let whites = 2;
  if (approaching) {
    const angle = Math.atan2(f.pos.y - RUNWAY.elevation, distToThreshold) * 180 / Math.PI;
    whites = angle > 3.4 ? 4 : angle > 3.1 ? 3 : angle > 2.9 ? 2 : angle > 2.6 ? 1 : 0;
  }
  papi.children.forEach((lamp, i) => {
    lamp.material.color.set(i < whites ? '#ffffff' : '#ff2d2d');
  });
}

function handleFlightEvents(events) {
  for (const event of events) {
    const lines = missionApi.onEvent(event, flight);
    for (const line of lines) banner(line, 3.5);
    if (event.type === 'ring' || event.type === 'gate') audio.chime();
    else if (event.type === 'touchdown') audio.thud();
    else if (event.type === 'crash') {
      audio.crashSound();
      endFlight(true);
      return;
    }
  }
  if (missionApi.mission.finished) endFlight(false);
}

function hudState(elapsed) {
  const f = flight.state;
  const readouts = flight.readouts();
  const target = missionApi.nextTarget();
  let targetInfo = null;
  if (target) {
    const dx = target.x - f.pos.x;
    const dy = target.y - f.pos.y;
    const dz = target.z - f.pos.z;
    const bearingDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
    targetInfo = { label: target.label, distance: Math.hypot(dx, dy, dz), bearingDeg };
  }
  const warnings = [];
  if (f.stalled) warnings.push({ text: 'STALL — NOSE DOWN, THROTTLE UP', color: PALETTE.hudRed, blink: true });
  if (f.fuel < 20 && f.fuel > 0) warnings.push({ text: 'LOW FUEL', color: PALETTE.hudAmber, blink: true });
  if (f.fuel === 0) warnings.push({ text: 'FUEL EMPTY — GLIDING', color: PALETTE.hudRed, blink: true });
  if (f.outOfBounds) warnings.push({ text: 'TURN BACK — LEAVING THE ISLANDS', color: PALETTE.hudAmber, blink: false });
  const liveBanners = banners
    .filter((b) => b.until > missionApi.mission.elapsed)
    .map((b) => ({ ...b, alpha: Math.min(1, (b.until - missionApi.mission.elapsed) / 0.8) }));
  return {
    inFlight: screen === 'play' || screen === 'paused',
    readouts,
    mission: missionApi.mission,
    timeLeft: missionApi.mission.timeLeft,
    score: missionApi.mission.score,
    elapsed: missionApi.mission.elapsed,
    view,
    target: targetInfo,
    warnings,
    banners: liveBanners,
    pitchDeg: (f.pitch * 180) / Math.PI,
    rollRad: f.roll,
  };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  elapsed += dt;
  const actions = input.takeActions();
  const missionKey = input.takeMissionKey();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    banner(muted ? 'SOUND OFF' : 'SOUND ON', 1.5);
  }
  if (screen === 'title') {
    const missionIds = ['rings', 'mail', 'landing', 'free'];
    if (missionKey >= 1 && missionKey <= 4) startGame(missionIds[missionKey - 1]);
    else if (actions & ACTION_CONFIRM) startGame('rings');
  } else if (screen === 'play') {
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      showOnly(pauseEl);
    } else if (actions & ACTION_VIEW) setView(view === 'chase' ? 'cockpit' : 'chase');
    else if (actions & ACTION_RESTART) startGame(missionApi.mission.id);
  } else if (screen === 'paused') {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
      screen = 'play';
      showOnly(null);
    } else if (actions & ACTION_RESTART) startGame(missionApi.mission.id);
  } else if (screen === 'over') {
    if (actions & ACTION_CONFIRM) {
      screen = 'title';
      showOnly(titleEl);
    } else if (actions & ACTION_RESTART) startGame(missionApi.mission.id);
  }

  if (screen === 'play') {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const steer = input.steering();
      const throttle = input.updateThrottle(STEP);
      const events = flight.step(STEP, { roll: steer.roll, pitch: steer.pitch, throttle, rudder: steer.rudder });
      const missionBanners = missionApi.update(STEP, flight);
      for (const line of missionBanners) banner(line, 3.5);
      handleFlightEvents(events);
      if (screen !== 'play') break;
    }
  }

  const f = flight.state;
  world.update(dt, elapsed, f.pos);
  updatePlaneMesh(dt, elapsed);
  updateCamera(dt);
  updatePapi();
  colourRings(world, missionApi.mission);
  // Pulse the next ring so the pilot can spot it at a glance.
  const nextRing = world.ringMeshes[missionApi.mission.ringIndex];
  if (nextRing && missionApi.mission.id === 'rings') {
    const s = 1 + 0.05 * Math.sin(elapsed * 4);
    nextRing.scale.setScalar(s);
  }
  audio.setFlight(f.throttle, f.speed, f.onGround);
  hud.draw(hudState(elapsed));
  renderer.render(world.scene, camera);
}

let last = performance.now();
let elapsed = 0;
let accumulator = 0;

function runShot(name) {
  applyShot(name, gameForShots);
  screen = 'play';
  showOnly(null);
  // Snap the chase/cockpit camera onto the staged plane before the first frame.
  updateCamera(1);
  let painted = 0;
  function paint() {
    const f = flight.state;
    world.update(0.016, 42, f.pos);
    updatePlaneMesh(0.016, 42);
    updateCamera(0.05);
    updatePapi();
    colourRings(world, missionApi.mission);
    hud.draw(hudState(42));
    renderer.render(world.scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

/** Headless play-test (?selftest=1): fly the physics without rendering. */
function runSelfTest() {
  const report = { errors: window.__errors, steps: 0, events: [] };
  try {
    startGame('rings');
    input.setThrottle(0.85);
    let pitch = 0;
    for (let i = 0; i < 60 * 40; i += 1) {
      const f = flight.state;
      // Rotate away from the runway heading after the climb-out so the flight
      // stays inside the islands instead of running out to sea.
      const roll = f.pos.x > 900 ? -0.5 : 0.12;
      if (!f.onGround) pitch = f.pos.y < 120 ? 0.35 : 0;
      else if (f.speed > 34) pitch = 0.5;
      const events = flight.step(STEP, { roll, pitch, throttle: 0.85, rudder: 0 });
      missionApi.update(STEP, flight);
      for (const e of events) {
        report.events.push(e.type);
        missionApi.onEvent(e, flight);
      }
      report.steps += 1;
      if (f.crashed || missionApi.mission.finished) break;
    }
    // Phase 2: teleport onto the ring course and prove a ring pass registers.
    const f2 = flight.state;
    f2.crashed = false;
    f2.onGround = false;
    f2.pos.set(100, 120, 320);
    f2.heading = Math.PI / 2;
    f2.pitch = 0;
    f2.roll = 0;
    f2.speed = 50;
    f2.throttle = 0.6;
    for (let i = 0; i < 60 * 12; i += 1) {
      const events = flight.step(STEP, { roll: 0, pitch: 0, throttle: 0.6, rudder: 0 });
      for (const e of events) {
        report.events.push(`ringPhase:${e.type}`);
        missionApi.onEvent(e, flight);
      }
      if (missionApi.mission.ringsPassed > 0) break;
    }
    const f = flight.state;
    report.final = {
      crashed: f.crashed,
      reason: f.crashReason,
      altitudeFt: Math.round((f.pos.y - RUNWAY.elevation) * 3.28084),
      speedKt: Math.round(f.speed * 1.94384),
      fuel: Math.round(f.fuel),
      score: missionApi.mission.score,
      rings: missionApi.mission.ringsPassed,
      distanceFlown: Math.round(f.distanceFlown),
    };
  } catch (err) {
    report.error = String(err && err.message ? err.message : err);
  }
  const el = document.getElementById('selftest');
  if (el) el.textContent = JSON.stringify(report);
  window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    showOnly(pauseEl);
  }
});

// Title-screen mission buttons.
document.querySelectorAll('[data-mission]').forEach((button) => {
  button.addEventListener('click', () => startGame(button.getAttribute('data-mission')));
});
document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.getAttribute('data-action');
    if (action === 'resume') {
      screen = 'play';
      showOnly(null);
    } else if (action === 'restart') startGame(missionApi.mission.id);
    else if (action === 'title') {
      screen = 'title';
      showOnly(titleEl);
    } else if (action === 'again') startGame(missionApi.mission.id);
  });
});
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

if (selftest) runSelfTest();
else if (shot && SHOT_NAMES.includes(shot)) runShot(shot);
else {
  showOnly(titleEl);
  requestAnimationFrame(frame);
}
