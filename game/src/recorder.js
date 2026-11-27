import { ISLANDS, RUNWAY, STRIPS, RINGS } from './config.js';

const WORLD_HALF = 2100;

export function createRecorder() {
  let samples = [];
  let events = [];
  let startTime = 0;

  function start() {
    // Clear in place so the arrays returned by createRecorder() stay live.
    samples.length = 0;
    events.length = 0;
    startTime = 0;
  }

  function sample(state) {
    const copy = {
      t: state.t,
      alt: state.alt,
      speed: state.speed,
      heading: state.heading,
      x: state.x,
      z: state.z,
      throttle: state.throttle,
      fuel: state.fuel,
    };
    samples.push(copy);
    if (samples.length > 3600) samples.shift();
  }

  function event(text, t) {
    const time = t ?? (samples.length > 0 ? samples[samples.length - 1].t : 0);
    events.push({ t: time, text });
  }

  function getStats() {
    if (samples.length === 0) {
      return { maxAltFt: 0, maxSpeedKt: 0, distanceFlown: 0, durationS: 0, samples: 0 };
    }
    let maxAltFt = 0;
    let maxSpeedKt = 0;
    let distanceFlown = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      maxAltFt = Math.max(maxAltFt, (s.alt ?? 0) * 3.28084);
      maxSpeedKt = Math.max(maxSpeedKt, (s.speed ?? 0) * 1.94384);
      if (i > 0) {
        const prev = samples[i - 1];
        distanceFlown += Math.hypot(s.x - prev.x, s.z - prev.z);
      }
    }
    const firstT = samples[0].t ?? 0;
    const lastT = samples[samples.length - 1].t ?? 0;
    const durationS = Math.round(lastT - firstT) || Math.round(lastT);
    return {
      maxAltFt: Math.round(maxAltFt),
      maxSpeedKt: Math.round(maxSpeedKt),
      distanceFlown: Math.round(distanceFlown),
      durationS,
      samples: samples.length,
    };
  }

  function drawMap(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w, h) / (WORLD_HALF * 2);
    const toX = (x) => w / 2 + x * scale;
    const toY = (z) => h / 2 + z * scale; // north (-Z) is up

    // Sea.
    ctx.fillStyle = '#0b1c2c';
    ctx.fillRect(0, 0, w, h);

    // Islands.
    for (const island of ISLANDS ?? []) {
      ctx.beginPath();
      ctx.arc(toX(island.x), toY(island.z), Math.max(2, (island.r ?? island.radius ?? 0) * scale), 0, Math.PI * 2);
      ctx.fillStyle = '#4a6b3a';
      ctx.fill();
      ctx.strokeStyle = '#7a9a5a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Runway as a white line at (0, 320), length 620 m.
    const runwayLength = (RUNWAY.length ?? 620) * scale;
    const runwayX = toX(RUNWAY.centreX ?? 0);
    const runwayY = toY(RUNWAY.centreZ ?? 320);
    ctx.beginPath();
    ctx.moveTo(runwayX - runwayLength / 2, runwayY);
    ctx.lineTo(runwayX + runwayLength / 2, runwayY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Strips as amber ticks.
    ctx.strokeStyle = '#f5b942';
    ctx.lineWidth = 2;
    for (const strip of STRIPS ?? []) {
      const len = (strip.length ?? 300) * scale;
      const sx = toX(strip.x);
      const sy = toY(strip.z);
      ctx.beginPath();
      ctx.moveTo(sx - len / 2, sy);
      ctx.lineTo(sx + len / 2, sy);
      ctx.stroke();
    }

    // Rings as small cyan circles.
    ctx.strokeStyle = '#7fe7ff';
    ctx.lineWidth = 1.5;
    for (const ring of RINGS ?? []) {
      ctx.beginPath();
      ctx.arc(toX(ring.x), toY(ring.z), 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Flight path polyline.
    if (samples.length > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(samples[0].x), toY(samples[0].z));
      for (let i = 1; i < samples.length; i++) {
        ctx.lineTo(toX(samples[i].x), toY(samples[i].z));
      }
      ctx.strokeStyle = '#7fe7ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Start point: green dot.
    if (samples.length > 0) {
      ctx.beginPath();
      ctx.arc(toX(samples[0].x), toY(samples[0].z), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3ddc6a';
      ctx.fill();
    }

    // Crash point: red X.
    const crash = opts.crash ?? null;
    if (crash) {
      const cx = toX(crash.x);
      const cy = toY(crash.z);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 7);
      ctx.lineTo(cx + 7, cy + 7);
      ctx.moveTo(cx + 7, cy - 7);
      ctx.lineTo(cx - 7, cy + 7);
      ctx.stroke();
    }
  }

  function drawLandingBars(canvas, landing) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1c2c';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';

    if (!landing) {
      ctx.fillText('No landing recorded', 16, h / 2);
      return;
    }

    const rows = [
      { label: 'Softness', value: landing.softness ?? 0, text: `${(landing.verticalSpeed ?? 0).toFixed(1)} m/s` },
      { label: 'Centreline', value: landing.centre ?? 0, text: `${(landing.centreOffset ?? 0).toFixed(1)} m off` },
      { label: 'Speed', value: landing.speedScore ?? 0, text: `${(landing.speed ?? 0).toFixed(0)} m/s` },
    ];
    const barX = 110;
    const barWidth = Math.max(40, w - barX - 110);
    const rowHeight = h / 3;
    rows.forEach((row, i) => {
      const y = rowHeight * i + rowHeight / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(row.label, 12, y);
      // Track.
      ctx.fillStyle = '#22384a';
      ctx.fillRect(barX, y - 8, barWidth, 16);
      // Fill.
      const frac = Math.max(0, Math.min(1, row.value));
      ctx.fillStyle = frac >= 0.7 ? '#3ddc6a' : frac >= 0.4 ? '#f5b942' : '#ff4444';
      ctx.fillRect(barX, y - 8, barWidth * frac, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.round(frac * 100)}% ${row.text}`, barX + barWidth + 8, y);
    });

    // Grade letter big on the right.
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillStyle = '#7fe7ff';
    ctx.textAlign = 'right';
    ctx.fillText(landing.grade ?? '-', w - 12, h / 2);
    ctx.textAlign = 'left';
  }

  function finish() {
    return { samples, events, stats: getStats() };
  }

  return { start, sample, event, finish, samples, events, getStats, drawMap, drawLandingBars };
}
