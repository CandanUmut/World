/**
 * Procedural audio via the Web Audio API — no sound files, so the app stays a
 * self-contained free static site. Provides a per-vehicle engine tone (pitch
 * tracks speed/throttle), ambient wind/water, rain, and a light UI blip.
 *
 * Browsers require a user gesture before audio can start; call `resume()` from
 * the first click/keypress.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('realEarth.muted') === '1';
    this.started = false;
  }

  resume() {
    if (this.muted) return;
    this._ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  _ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    // Shared noise buffer (2s of white noise) for wind/rain.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    this._buildAmbient();
    this.started = true;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  _buildAmbient() {
    // Gentle wind bed, always present at low level.
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    src.connect(filter).connect(gain).connect(this.master);
    this.windGain = gain;
    this.windFilter = filter;

    // Rain bed (off by default).
    const rsrc = this._noiseSource();
    const rfilter = this.ctx.createBiquadFilter();
    rfilter.type = 'highpass';
    rfilter.frequency.value = 1800;
    const rgain = this.ctx.createGain();
    rgain.gain.value = 0;
    rsrc.connect(rfilter).connect(rgain).connect(this.master);
    this.rainGain = rgain;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('realEarth.muted', m ? '1' : '0');
    if (!this.ctx) {
      if (!m) this.resume();
      return;
    }
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  setRain(level) {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(level * 0.18, this.ctx.currentTime, 0.4);
  }

  // --- Engine ---------------------------------------------------------------
  engineOn(type = 'Plane') {
    this._ensure();
    if (!this.ctx) return;
    this.engineOff();
    const base = type === 'Ship' ? 45 : type === 'Car' ? 70 : 95;
    this._engBase = base;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.detune.value = -12;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(lp);
    osc2.connect(lp);
    lp.connect(gain).connect(this.master);
    osc1.frequency.value = base;
    osc2.frequency.value = base / 2;
    osc1.start();
    osc2.start();
    this._engine = { osc1, osc2, gain, lp };
  }

  updateEngine({ speedKmh = 0, throttle = 0 } = {}) {
    if (!this.ctx || !this._engine) return;
    const spd = Math.min(Math.abs(speedKmh) / 300, 1);
    const drive = Math.max(spd, Math.abs(throttle) * 0.7);
    const f = this._engBase * (1 + drive * 2.2);
    const t = this.ctx.currentTime;
    this._engine.osc1.frequency.setTargetAtTime(f, t, 0.08);
    this._engine.osc2.frequency.setTargetAtTime(f / 2, t, 0.08);
    this._engine.gain.gain.setTargetAtTime(0.05 + drive * 0.12, t, 0.1);
    this._engine.lp.frequency.setTargetAtTime(500 + drive * 2500, t, 0.1);
    // Wind rises with speed.
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.04 + spd * 0.1, t, 0.2);
  }

  engineOff() {
    if (!this._engine || !this.ctx) {
      this._engine = null;
      return;
    }
    const { osc1, osc2, gain } = this._engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.1);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.04, t, 0.3);
    this._engine = null;
  }

  blip() {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(this.master);
    const t = this.ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

export const audio = new AudioEngine();

// Kick the audio context off the first user gesture (autoplay policy).
function unlock() {
  audio.resume();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
