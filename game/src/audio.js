// Procedural sound, no audio files: an engine hum that follows throttle and speed,
// wind that follows airspeed, a chime for rings and mail, a thud for touchdown and
// a crash burst. Everything is WebAudio; the context is created on the first user
// gesture and stays muted until then.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      const noiseLength = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
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

      started = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Call every frame with the live flight state; silent until a gesture starts audio. */
  function setFlight(throttle, speed, onGround) {
    if (!started || !ctx) return;
    const now = ctx.currentTime;
    const rpm = 40 + throttle * 90 + speed * 0.35;
    engineOsc.frequency.setTargetAtTime(rpm, now, 0.1);
    engineOsc2.frequency.setTargetAtTime(rpm / 2, now, 0.1);
    const engineLevel = onGround && throttle < 0.05 ? 0.015 : 0.03 + throttle * 0.075;
    engineGain.gain.setTargetAtTime(muted ? 0 : engineLevel, now, 0.15);
    const windLevel = Math.min(0.16, (speed / 96) * 0.16);
    windGain.gain.setTargetAtTime(muted ? 0 : windLevel, now, 0.2);
    windFilter.frequency.setTargetAtTime(320 + speed * 9, now, 0.2);
  }

  function tone(frequency, startAt, duration, type, volume) {
    if (!started || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(muted ? 0 : volume, ctx.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + duration + 0.05);
  }

  function chime() {
    tone(880, 0, 0.35, 'sine', 0.22);
    tone(1318, 0.09, 0.4, 'sine', 0.18);
  }

  function thud() {
    if (!started || !ctx) return;
    tone(70, 0, 0.3, 'sine', 0.4);
    const noise = ctx.createBufferSource();
    noise.buffer = windSource.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(muted ? 0 : 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.3);
  }

  function crashSound() {
    if (!started || !ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = windSource.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 1);
    tone(55, 0, 0.8, 'sawtooth', 0.3);
  }

  function beep() {
    tone(1200, 0, 0.12, 'square', 0.08);
  }

  function toggleMute() {
    muted = !muted;
    return muted;
  }

  return { ensure, setFlight, chime, thud, crashSound, beep, toggleMute };
}
