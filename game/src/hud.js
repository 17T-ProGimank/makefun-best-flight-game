import { FONT, PALETTE } from './config.js';

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fmtClock(timeLeft, missionId, elapsed = 0) {
  // Untimed sorties carry timeLeft = Infinity: show elapsed flight time
  // instead of formatting Infinity (which rendered as "Infinity:NaN").
  if (typeof timeLeft !== 'number' || !Number.isFinite(timeLeft)) {
    const t = Math.max(0, elapsed ?? 0);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (missionId === 'rings' || missionId === 'nightmail') {
    return `TIME ${Math.max(0, Math.ceil(timeLeft))}s`;
  }
  const t = Math.max(0, timeLeft);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function panel(x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(4, 18, 26, ${alpha})`;
    ctx.strokeStyle = PALETTE.hudCyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function gauge(x, y, r, label, drawFace) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(4, 18, 26, 0.78)';
    ctx.strokeStyle = PALETTE.hudCyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.clip();
    drawFace(r);
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, 0, r + 13);
    ctx.restore();
  }

  function dialTicks(r, majorEvery, labelFn) {
    ctx.strokeStyle = PALETTE.hudCyan;
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const major = deg % majorEvery === 0;
      const r0 = major ? r - 9 : r - 5;
      ctx.lineWidth = major ? 1.5 : 0.7;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
      ctx.lineTo(Math.sin(a) * (r - 2), -Math.cos(a) * (r - 2));
      ctx.stroke();
      if (major && labelFn) {
        const lab = labelFn(deg);
        if (lab) ctx.fillText(lab, Math.sin(a) * (r - 17), -Math.cos(a) * (r - 17));
      }
    }
  }

  function needle(angleRad, len, color, width = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(angleRad) * len, -Math.cos(angleRad) * len);
    ctx.stroke();
  }

  function drawCompass(s) {
    const cx = W / 2;
    const y = 18;
    const half = 170;
    const hdg = s.readouts.headingDeg;
    panel(cx - half - 12, 6, half * 2 + 24, 46, 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, 6, half * 2, 46);
    ctx.clip();
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const pxPerDeg = 3.2;
    for (let d = -60; d <= 60; d += 5) {
      let deg = Math.round(hdg) + d;
      deg = ((deg % 360) + 360) % 360;
      const x = cx + d * pxPerDeg;
      const major = deg % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.hudAmber : PALETTE.hudCyan;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 22);
      ctx.lineTo(x, y + (major ? 32 : 27));
      ctx.stroke();
      if (major) {
        const lab = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
        ctx.fillStyle = PALETTE.hudAmber;
        ctx.fillText(lab, x, y + 2);
      }
    }
    ctx.restore();
    // Centre caret + heading readout.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx - 6, 52);
    ctx.lineTo(cx + 6, 52);
    ctx.lineTo(cx, 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, 60);
    // Controls hint under the compass tape.
    ctx.fillStyle = 'rgba(127, 231, 255, 0.75)';
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS/WASD fly · SHIFT/CTRL throttle · Q/E rudder · V view · P pause · R restart · M sound', cx, 80);
  }

  function drawReadouts(s) {
    const r = s.readouts;
    panel(12, 12, 218, 108, 0.55);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`${Math.round(r.speedKt)}`, 24, 48);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('KT', 92, 48);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`${Math.round(r.altitudeFt)}`, 24, 84);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('FT', 120, 84);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 14px ${FONT}`;
    const vs = r.verticalSpeedFpm;
    ctx.fillText(`HDG ${String(Math.round(r.headingDeg)).padStart(3, '0')}°   V/S ${vs >= 0 ? '+' : ''}${Math.round(vs)} FPM`, 24, 110);
  }

  function objectiveLines(s) {
    const m = s.mission;
    if (!m) return ['FREE FLIGHT'];
    switch (m.id) {
      case 'rings': return [`RINGS ${m.ringsPassed ?? 0}/8`];
      case 'mail': case 'nightmail': return [`MAIL ${m.gatesPassed ?? 0}/3`];
      case 'landing': return [m.climbed ? 'CLIMBED ✓' : 'CLIMB 800 FT', m.landed ? 'LANDED ✓' : 'LAND ON RUNWAY 09'];
      case 'free': return ['FREE FLIGHT'];
      case 'fire': {
        const water = s.water >= 0.99 ? 'FULL' : s.water > 0.01 ? 'PART' : 'EMPTY';
        return [`FIRE ${m.drops ?? 0}/${m.dropsNeeded ?? 3}`, `WATER: ${water}`];
      }
      case 'medevac': {
        const patient = m.patientPickedUp ? 'ABOARD' : 'ON ISLET';
        return [`PATIENT: ${patient}`, `CONDITION ${Math.round(m.patientCondition ?? 100)}%`];
      }
      case 'hopper': return [`STOPS ${m.stopsVisited ?? 0}/3`];
      default: return [];
    }
  }

  function drawMission(s) {
    const m = s.mission;
    const lines = objectiveLines(s);
    const h = 78 + lines.length * 18;
    panel(W - 252, 12, 240, h, 0.55);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText((m ? m.name : 'FREE FLIGHT').toUpperCase(), W - 238, 36);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(fmtClock(s.timeLeft, m ? m.id : 'free', s.elapsed), W - 238, 58);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`SCORE ${Math.round(s.score ?? 0)}`, W - 238, 78);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 13px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, W - 238, 98 + i * 18));
  }

  function drawTarget(s, now) {
    const t = s.target;
    if (!t) return;
    const hdg = s.readouts.headingDeg;
    let diff = ((t.bearingDeg - hdg + 540) % 360) - 180;
    const cx = W / 2;
    const cy = H * 0.32;
    const near = Math.abs(diff) <= 25;
    const col = near ? '#7dff9a' : PALETTE.hudAmber;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((diff * Math.PI) / 180);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(16, 10);
    ctx.lineTo(0, 2);
    ctx.lineTo(-16, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = col;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const dist = t.distance >= 1000 ? `${(t.distance / 1000).toFixed(1)} KM` : `${Math.round(t.distance)} M`;
    ctx.fillText(`${t.label}  ·  ${dist}`, cx, cy + 56);
  }

  function drawWarnings(s, now) {
    const list = s.warnings || [];
    list.forEach((w, i) => {
      if (w.blink && Math.floor(now * 2.5) % 2 === 0) return;
      ctx.fillStyle = w.color || '#ff5252';
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(w.text, W / 2, H * 0.42 + i * 28);
    });
  }

  function drawBanners(s) {
    const list = s.banners || [];
    list.forEach((b, i) => {
      const remain = b.until - s.elapsed;
      if (remain <= 0) return;
      const alpha = clamp(remain < 1 ? remain : 1, 0, 1) * (b.alpha ?? 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = b.color || PALETTE.hudAmber;
      ctx.font = `700 ${b.size || 34}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(b.text, W / 2, H * 0.24 + i * 44);
      ctx.restore();
    });
  }

  function drawInstruments(s) {
    const dusk = !!s.dusk;
    const glow = dusk ? 12 : 0;
    const rim = dusk ? '#bfefff' : PALETTE.hudCyan;
    const r = s.readouts;
    const pitch = (s.pitchDeg || 0) * (Math.PI / 180);
    const roll = s.rollRad || 0;
    const speedKt = r.speedKt;
    const altFt = r.altitudeFt;
    const hdg = r.headingDeg;
    const cockpit = s.view === 'cockpit';
    const cy = cockpit ? H - 62 : H - 58;
    const gap = 96;
    const cx0 = W / 2 - gap * 1.5;

    if (cockpit) {
      ctx.fillStyle = 'rgba(3, 10, 16, 0.92)';
      ctx.fillRect(0, H - 128, W, 128);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H - 128);
      ctx.lineTo(W, H - 128);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(4, 18, 26, 0.5)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 210, H - 118, 420, 106, 10);
      ctx.fill();
    }

    ctx.save();
    if (dusk) { ctx.shadowColor = rim; ctx.shadowBlur = glow; }

    // Attitude indicator.
    gauge(cx0, cy, 44, 'ATT', (gr) => {
      ctx.save();
      ctx.translate(0, clamp(pitch * gr * 1.4, -gr, gr) * -1);
      ctx.rotate(-roll);
      ctx.fillStyle = '#2f7fc2';
      ctx.fillRect(-gr, -gr * 2, gr * 2, gr * 2);
      ctx.fillStyle = '#7a4a22';
      ctx.fillRect(-gr, 0, gr * 2, gr * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-gr, 0);
      ctx.lineTo(gr, 0);
      ctx.stroke();
      ctx.restore();
      // Fixed wings marker.
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-gr + 8, 0);
      ctx.lineTo(-10, 0);
      ctx.moveTo(10, 0);
      ctx.lineTo(gr - 8, 0);
      ctx.stroke();
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Airspeed dial.
    gauge(cx0 + gap, cy, 44, 'KT', (gr) => {
      dialTicks(gr, 90, (deg) => {
        const kt = Math.round((deg / 360) * 200);
        return kt % 50 === 0 ? String(kt) : '';
      });
      const a = clamp(speedKt, 0, 200) / 200 * Math.PI * 2;
      needle(a, gr - 12, PALETTE.hudAmber, 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(speedKt)), 0, gr - 22);
    });

    // Altimeter dial.
    gauge(cx0 + gap * 2, cy, 44, 'ALT FT', (gr) => {
      dialTicks(gr, 90, (deg) => String((deg / 90) * 250));
      const frac = (altFt % 1000) / 1000;
      needle(frac * Math.PI * 2, gr - 12, PALETTE.hudAmber, 2.5);
      const thousands = Math.floor(altFt / 1000);
      needle((thousands % 10) / 10 * Math.PI * 2, gr - 24, '#ffffff', 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(altFt)), 0, gr - 22);
    });

    // Heading dial.
    gauge(cx0 + gap * 3, cy, 44, 'HDG', (gr) => {
      dialTicks(gr, 90, (deg) => (deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : ''));
      ctx.save();
      ctx.rotate((hdg * Math.PI) / 180);
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.moveTo(0, -gr + 14);
      ctx.lineTo(7, -gr + 26);
      ctx.lineTo(-7, -gr + 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), 0, gr - 22);
    });

    ctx.restore();

    // Throttle / fuel bars panel.
    const bx = W / 2 + 216;
    const by = cockpit ? H - 116 : H - 108;
    panel(bx, by, 150, 92, 0.6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText('THR', bx + 10, by + 20);
    ctx.fillStyle = '#12303e';
    ctx.fillRect(bx + 52, by + 9, 88, 12);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(bx + 52, by + 9, 88 * clamp(r.throttle ?? 0, 0, 1), 12);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.fillText('FUEL', bx + 10, by + 44);
    const fuel = clamp(r.fuel ?? 0, 0, 100) / 100;
    ctx.fillStyle = '#12303e';
    ctx.fillRect(bx + 52, by + 33, 88, 12);
    ctx.fillStyle = fuel < 0.2 ? '#ff5252' : '#7dff9a';
    ctx.fillRect(bx + 52, by + 33, 88 * fuel, 12);
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`FUEL ${Math.round(r.fuel ?? 0)}%`, bx + 10, by + 66);
    ctx.fillText(`THR ${Math.round((r.throttle ?? 0) * 100)}%`, bx + 10, by + 84);
  }

  function draw(s) {
    ctx.clearRect(0, 0, W, H);
    if (!s.inFlight) return;
    const now = (s.elapsed ?? 0);
    drawCompass(s);
    drawReadouts(s);
    drawMission(s);
    drawTarget(s, now);
    drawWarnings(s, now);
    drawBanners(s);
    drawInstruments(s);
  }

  return { draw, resize };
}
