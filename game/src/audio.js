// WebAudio synth only: engine hum, police siren, gunshots, crashes, pickups,
// mission fanfare and a tiny bass loop. Created lazily on first user input so a
// suspended AudioContext can never break the game.
export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    musicGain: null,
    musicStep: 0,
    musicTimer: 0,
    muted: false,
  };
}

export function ensureAudio(audio) {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(ctx.destination);

    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineFilter = ctx.createBiquadFilter();
    audio.engineFilter.type = 'lowpass';
    audio.engineFilter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(audio.engineFilter);
    audio.engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();

    audio.sirenOsc = ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 750;
    audio.sirenLfo = ctx.createOscillator();
    audio.sirenLfo.type = 'square';
    audio.sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    audio.sirenLfo.connect(lfoGain);
    lfoGain.connect(audio.sirenOsc.frequency);
    audio.sirenGain = ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.sirenLfo.start();

    audio.musicGain = ctx.createGain();
    audio.musicGain.gain.value = 0.11;
    audio.musicGain.connect(audio.master);
  } catch (err) {
    audio.ctx = null;
  }
}

export function updateEngineSound(audio, speedKmh, inCar) {
  if (!audio.ctx || !audio.engineGain) return;
  const t = audio.ctx.currentTime;
  const target = inCar ? 0.05 + Math.min(0.09, speedKmh / 122 * 0.09) : 0;
  audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
  audio.engineOsc.frequency.setTargetAtTime(52 + speedKmh * 1.6, t, 0.1);
}

export function updateSirenSound(audio, wanted) {
  if (!audio.ctx || !audio.sirenGain) return;
  audio.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.045 : 0, audio.ctx.currentTime, 0.2);
}

export function noiseBurst(audio, duration, filterFreq, volume) {
  if (!audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start();
  } catch (err) { /* audio is best-effort */ }
}

export function playGunshot(audio) {
  noiseBurst(audio, 0.14, 2600, 0.5);
}

export function playCrash(audio, strength) {
  noiseBurst(audio, 0.12 + strength * 0.18, 700, 0.25 + strength * 0.25);
}

export function playPickup(audio) {
  if (!audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch (err) { /* audio is best-effort */ }
}

export function playMissionComplete(audio) {
  if (!audio.ctx) return;
  try {
    const ctx = audio.ctx;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  } catch (err) { /* audio is best-effort */ }
}

// 8-step bass loop, one note every 0.42 s.
const BASS_NOTES = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];

export function updateMusic(audio, dt) {
  if (!audio.ctx || !audio.musicGain) return;
  audio.musicTimer += dt;
  while (audio.musicTimer >= 0.42) {
    audio.musicTimer -= 0.42;
    const freq = BASS_NOTES[audio.musicStep % BASS_NOTES.length];
    audio.musicStep++;
    try {
      const ctx = audio.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audio.musicGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
    } catch (err) { /* audio is best-effort */ }
  }
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}
