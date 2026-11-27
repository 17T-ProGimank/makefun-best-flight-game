export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let windSource = null;
  let windFilter = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    try {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // Engine: two detuned oscillators through a lowpass.
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc1.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 90;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();

      // Wind: looped noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buf;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
    } catch (_) { /* audio never throws */ }
    return ctx;
  }

  function setFlight(throttle, speed, onGround) {
    try {
      if (!ctx || !engineOsc1) return;
      const t = ctx.currentTime;
      const freq = 55 + throttle * 110 + speed * 0.55;
      engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.5, t, 0.08);
      const engineLevel = onGround && throttle < 0.03 ? 0 : 0.05 + throttle * 0.11;
      engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
      const windLevel = Math.min(0.22, Math.max(0, (speed - 18) / 96) * 0.22);
      windGain.gain.setTargetAtTime(windLevel, t, 0.15);
      windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.15);
    } catch (_) { /* ignore */ }
  }

  function tone(freq, dur, type, gainVal, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, filterType, freq, gainVal) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  function chime() {
    try {
      ensure();
      if (!ctx) return;
      tone(880, 0.35, 'sine', 0.22);
      tone(1318.5, 0.5, 'sine', 0.18, 0.12);
    } catch (_) { /* ignore */ }
  }

  function thud() {
    try {
      ensure();
      if (!ctx) return;
      tone(70, 0.28, 'sine', 0.5);
      noiseBurst(0.18, 'lowpass', 300, 0.4);
    } catch (_) { /* ignore */ }
  }

  function crashSound() {
    try {
      ensure();
      if (!ctx) return;
      noiseBurst(0.7, 'lowpass', 900, 0.6);
      tone(55, 0.8, 'sawtooth', 0.4);
      tone(40, 0.9, 'sine', 0.5, 0.05);
    } catch (_) { /* ignore */ }
  }

  function beep() {
    try {
      ensure();
      if (!ctx) return;
      tone(1200, 0.09, 'square', 0.12);
    } catch (_) { /* ignore */ }
  }

  function splash() {
    try {
      ensure();
      if (!ctx) return;
      noiseBurst(0.5, 'bandpass', 1200, 0.35);
    } catch (_) { /* ignore */ }
  }

  function toggleMute() {
    muted = !muted;
    try {
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    } catch (_) { /* ignore */ }
    return muted;
  }

  return { ensure, setFlight, chime, thud, crashSound, beep, toggleMute, splash };
}
