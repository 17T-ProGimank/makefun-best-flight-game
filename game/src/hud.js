// The 2D overlay: HUD readouts, compass tape, the lit instrument cluster (attitude,
// airspeed, altimeter, heading, fuel, throttle), the next-objective pointer, warnings
// and banners. Drawn every frame on a canvas above the WebGL canvas; the DOM menus
// (title, pause, debrief) live in index.html. All text uses the game font.

import { FONT, PALETTE } from './config.js';

function wrapDeg(deg) {
  return ((deg + 540) % 360) - 180;
}

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 1280;
  let height = 720;
  let scale = 1;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scale = Math.min(width / 1280, height / 720);
  }
  window.addEventListener('resize', resize);
  resize();

  function text(value, x, y, size, color, align = 'left', weight = '600') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(8, 14, 20, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127, 231, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawCompassTape(headingDeg) {
    const cx = width / 2;
    const pxPerDeg = 3.2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 260, 6, 520, 44);
    ctx.clip();
    panel(cx - 260, 6, 520, 44, 0.5);
    for (let d = -180; d <= 180; d += 5) {
      const rel = wrapDeg(d - headingDeg);
      if (Math.abs(rel) > 80) continue;
      const x = cx + rel * pxPerDeg;
      const major = d % 45 === 0;
      const label = ((d % 360) + 360) % 360;
      ctx.strokeStyle = major ? PALETTE.hudCyan : 'rgba(127,231,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, major ? 28 : 22);
      ctx.stroke();
      if (major) {
        const name = label === 0 ? 'N' : label === 90 ? 'E' : label === 180 ? 'S' : label === 270 ? 'W' : String(label).padStart(3, '0');
        text(name, x, 45, 13, PALETTE.hudCyan, 'center', '700');
      }
    }
    ctx.restore();
    // Centre caret.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 6);
    ctx.lineTo(cx + 7, 6);
    ctx.lineTo(cx, 16);
    ctx.closePath();
    ctx.fill();
  }

  function drawReadoutBlock(readouts) {
    panel(14, 14, 344, 108, 0.55);
    text('SPD', 28, 38, 12, 'rgba(127,231,255,0.8)', 'left', '700');
    text(String(readouts.speedKt), 28, 74, 30, '#ffffff', 'left', '800');
    text('KT', 84, 74, 13, PALETTE.hudCyan, 'left', '700');
    text('ALT', 138, 38, 12, 'rgba(127,231,255,0.8)', 'left', '700');
    text(String(readouts.altitudeFt), 138, 74, 30, '#ffffff', 'left', '800');
    text('FT', 214, 74, 13, PALETTE.hudCyan, 'left', '700');
    text('HDG', 250, 38, 12, 'rgba(127,231,255,0.8)', 'left', '700');
    text(String(readouts.headingDeg).padStart(3, '0'), 250, 74, 30, '#ffffff', 'left', '800');
    text(`V/S ${readouts.verticalSpeedFpm >= 0 ? '+' : ''}${readouts.verticalSpeedFpm} FPM`, 28, 102, 13, 'rgba(255,255,255,0.75)', 'left', '600');
  }

  function drawMissionBlock(mission, timeLeft, score, elapsed) {
    const x = width - 314;
    panel(x, 14, 300, 96, 0.55);
    text(mission.name, x + 16, 38, 16, PALETTE.hudAmber, 'left', '800');
    const clock = mission.id === 'rings'
      ? `TIME ${Math.max(0, Math.ceil(timeLeft))}s`
      : `TIME ${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
    text(clock, x + 16, 68, 22, '#ffffff', 'left', '800');
    text(`SCORE ${score}`, x + 16, 96, 14, PALETTE.hudCyan, 'left', '700');
    const progress = mission.id === 'rings' ? `RINGS ${mission.ringsPassed}/8`
      : mission.id === 'mail' ? `MAIL ${mission.gatesPassed}/3`
      : mission.id === 'landing' ? (mission.climbed ? 'CLIMBED ✓' : 'CLIMB 800 FT')
      : 'FREE FLIGHT';
    text(progress, x + 284, 38, 12, '#ffffff', 'right', '700');
  }

  function drawGauge(x, y, radius, label, drawFace) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1218';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,231,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    drawFace(x, y, radius);
    ctx.restore();
    text(label, x, y + radius + 18, 12, 'rgba(127,231,255,0.85)', 'center', '700');
  }

  function drawAttitude(x, y, radius, pitchDeg, rollRad) {
    drawGauge(x, y, radius, 'ATTITUDE', (cx, cy, r) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rollRad);
      const pitchPx = Math.max(-r, Math.min(r, pitchDeg * 1.6));
      ctx.translate(0, pitchPx);
      ctx.fillStyle = '#3f8fd2';
      ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(-r * 2, 0, r * 4, r * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 2, 0);
      ctx.lineTo(r * 2, 0);
      ctx.stroke();
      ctx.restore();
      // Fixed wings marker.
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.55, y);
      ctx.lineTo(x - radius * 0.2, y);
      ctx.moveTo(x + radius * 0.2, y);
      ctx.lineTo(x + radius * 0.55, y);
      ctx.stroke();
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawDial(x, y, radius, label, value, max, unit, ticks) {
    drawGauge(x, y, radius, label, (cx, cy, r) => {
      for (let i = 0; i <= ticks; i += 1) {
        const angle = (-225 + (i / ticks) * 270) * Math.PI / 180;
        const major = i % (ticks / 4) === 0;
        const x1 = cx + Math.cos(angle) * (r - 6);
        const y1 = cy + Math.sin(angle) * (r - 6);
        const x2 = cx + Math.cos(angle) * (r - (major ? 16 : 11));
        const y2 = cy + Math.sin(angle) * (r - (major ? 16 : 11));
        ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      const angle = (-225 + Math.max(0, Math.min(1, value / max)) * 270) * Math.PI / 180;
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * (r - 14), cy + Math.sin(angle) * (r - 14));
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      text(unit, cx, cy + r * 0.45, 13, '#ffffff', 'center', '800');
    });
  }

  function drawHeadingDial(x, y, radius, headingDeg) {
    drawGauge(x, y, radius, 'HEADING', (cx, cy, r) => {
      for (let d = 0; d < 360; d += 15) {
        const angle = (d - headingDeg) * Math.PI / 180;
        const major = d % 90 === 0;
        const x1 = cx + Math.sin(angle) * (r - 6);
        const y1 = cy - Math.cos(angle) * (r - 6);
        const x2 = cx + Math.sin(angle) * (r - (major ? 18 : 11));
        const y2 = cy - Math.cos(angle) * (r - (major ? 18 : 11));
        ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (major) {
          const name = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : 'W';
          text(name, cx + Math.sin(angle) * (r - 28), cy - Math.cos(angle) * (r - 28) + 4, 12, PALETTE.hudCyan, 'center', '700');
        }
      }
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - r + 4);
      ctx.lineTo(cx + 6, cy - r + 4);
      ctx.lineTo(cx, cy - r + 14);
      ctx.closePath();
      ctx.fill();
      // Little plane silhouette in the middle.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 4, cy + 8);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx - 4, cy + 8);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawThrottleFuel(readouts, x, y) {
    panel(x, y, 190, 96, 0.55);
    text('THR', x + 14, y + 22, 12, 'rgba(127,231,255,0.8)', 'left', '700');
    const thrW = 110;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 52, y + 12, thrW, 12);
    ctx.fillStyle = PALETTE.hudGreen;
    ctx.fillRect(x + 52, y + 12, thrW * readouts.throttle, 12);
    text(`${Math.round(readouts.throttle * 100)}%`, x + 168, y + 23, 12, '#ffffff', 'left', '700');
    text('FUEL', x + 14, y + 52, 12, 'rgba(127,231,255,0.8)', 'left', '700');
    const fuelW = 110;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 52, y + 42, fuelW, 12);
    ctx.fillStyle = readouts.fuel < 20 ? PALETTE.hudRed : readouts.fuel < 45 ? PALETTE.hudAmber : PALETTE.hudGreen;
    ctx.fillRect(x + 52, y + 42, fuelW * (readouts.fuel / 100), 12);
    text(`${Math.round(readouts.fuel)}%`, x + 168, y + 53, 12, '#ffffff', 'left', '700');
    text('SHIFT/CTRL or WHEEL — THROTTLE', x + 14, y + 82, 11, 'rgba(255,255,255,0.6)', 'left', '600');
  }

  function drawTargetPointer(target, headingDeg) {
    if (!target) return;
    const rel = wrapDeg(target.bearingDeg - headingDeg);
    const dist = Math.round(target.distance);
    const x = Math.max(90, Math.min(width - 90, width / 2 + (rel / 90) * (width / 2 - 60)));
    const y = 132;
    const pointing = Math.abs(rel) < 25;
    ctx.fillStyle = pointing ? PALETTE.hudGreen : PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 11, y + 8);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - 11, y + 8);
    ctx.closePath();
    ctx.fill();
    text(`${target.label}  •  ${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`}`, x, y + 30, 14, pointing ? PALETTE.hudGreen : '#ffffff', 'center', '800');
  }

  function drawWarnings(warnings, elapsed) {
    const blink = Math.floor(elapsed * 3) % 2 === 0;
    let y = 170;
    for (const warning of warnings) {
      if (warning.blink && !blink) continue;
      text(warning.text, width / 2, y, 24, warning.color, 'center', '800');
      y += 32;
    }
  }

  function drawBanners(banners) {
    let y = height * 0.38;
    for (const banner of banners) {
      ctx.globalAlpha = Math.max(0, Math.min(1, banner.alpha));
      text(banner.text, width / 2, y, banner.size ?? 34, banner.color ?? PALETTE.hudAmber, 'center', '800');
      ctx.globalAlpha = 1;
      y += 46;
    }
  }

  function drawCockpitFrame(readouts, pitchDeg, rollRad, headingDeg) {
    // A dark console across the bottom of the screen with the lit gauges inside it,
    // so the cockpit view reads as a flown panel rather than a floating HUD.
    const panelH = 168;
    const y0 = height - panelH;
    const grad = ctx.createLinearGradient(0, y0, 0, height);
    grad.addColorStop(0, '#141c22');
    grad.addColorStop(1, '#05090c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, width, panelH);
    ctx.strokeStyle = 'rgba(127,231,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(width, y0);
    ctx.stroke();
    const cy = y0 + 78;
    const gap = 150;
    const cx = width / 2;
    drawAttitude(cx - gap * 1.5, cy, 52, pitchDeg, rollRad);
    drawDial(cx - gap * 0.5, cy, 52, 'AIRSPEED', readouts.speedKt, 130, `${readouts.speedKt} KT`, 12);
    drawDial(cx + gap * 0.5, cy, 52, 'ALTITUDE', readouts.altitudeFt % 1000, 1000, `${readouts.altitudeFt} FT`, 10);
    drawHeadingDial(cx + gap * 1.5, cy, 52, headingDeg);
    drawThrottleFuel(readouts, 16, y0 + 36);
    text('NUSA SKY RUN', width - 30, y0 + 60, 15, 'rgba(255,255,255,0.55)', 'right', '800');
    text('V — CHASE VIEW', width - 30, y0 + 84, 12, 'rgba(255,255,255,0.45)', 'right', '600');
  }

  function drawChaseInstruments(readouts, pitchDeg, rollRad, headingDeg) {
    const cy = height - 78;
    const gap = 132;
    const cx = width / 2;
    ctx.fillStyle = 'rgba(8,14,20,0.45)';
    ctx.beginPath();
    ctx.roundRect(cx - gap * 2 - 70, cy - 74, gap * 4 + 140, 148, 12);
    ctx.fill();
    drawAttitude(cx - gap * 1.5, cy, 46, pitchDeg, rollRad);
    drawDial(cx - gap * 0.5, cy, 46, 'AIRSPEED', readouts.speedKt, 130, `${readouts.speedKt} KT`, 12);
    drawDial(cx + gap * 0.5, cy, 46, 'ALTITUDE', readouts.altitudeFt % 1000, 1000, `${readouts.altitudeFt} FT`, 10);
    drawHeadingDial(cx + gap * 1.5, cy, 46, headingDeg);
    drawThrottleFuel(readouts, 16, height - 112);
  }

  /** Paint one frame of the overlay. `s` carries everything the HUD needs. */
  function draw(s) {
    ctx.clearRect(0, 0, width, height);
    if (!s.inFlight) return;
    drawCompassTape(s.readouts.headingDeg);
    drawReadoutBlock(s.readouts);
    drawMissionBlock(s.mission, s.timeLeft, s.score, s.elapsed);
    drawTargetPointer(s.target, s.readouts.headingDeg);
    drawWarnings(s.warnings, s.elapsed);
    if (s.view === 'cockpit') drawCockpitFrame(s.readouts, s.pitchDeg, s.rollRad, s.readouts.headingDeg);
    else drawChaseInstruments(s.readouts, s.pitchDeg, s.rollRad, s.readouts.headingDeg);
    drawBanners(s.banners);
    // Controls hint, centred under the compass tape, clear of the instruments.
    text('← → ROLL   ↑ ↓ PITCH   SHIFT/CTRL THROTTLE   Q/E RUDDER   V VIEW   P PAUSE', width / 2, 66, 12, 'rgba(255,255,255,0.55)', 'center', '600');
  }

  return { draw, resize };
}
