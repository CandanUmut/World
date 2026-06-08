/**
 * Tiny synthesized audio: a speed-pitched engine drone + a low ambient city
 * pad, all from WebAudio oscillators (no asset files). Starts on the first user
 * gesture (autoplay policy) and is wrapped so a missing AudioContext never
 * breaks the game. Mute with the returned toggle.
 */
export function createAudio() {
  let ctx = null, engOsc = null, engGain = null, subOsc = null, ambGain = null;
  let started = false, muted = false;

  function start() {
    if (started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      // engine: sawtooth through a lowpass
      engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 60;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
      engGain = ctx.createGain(); engGain.gain.value = 0.0;
      engOsc.connect(lp); lp.connect(engGain); engGain.connect(master); engOsc.start();

      // ambient pad
      subOsc = ctx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 70;
      ambGain = ctx.createGain(); ambGain.gain.value = 0.04;
      subOsc.connect(ambGain); ambGain.connect(master); subOsc.start();

      started = true;
    } catch { /* ignore */ }
  }

  // Resume/start on the first gesture.
  const kick = () => { start(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', kick, { once: false });
  window.addEventListener('keydown', kick, { once: false });

  function setEngine(speed01) {
    if (!started || muted) return;
    const t = ctx.currentTime;
    engOsc.frequency.setTargetAtTime(55 + speed01 * 210, t, 0.08);
    engGain.gain.setTargetAtTime(0.03 + speed01 * 0.06, t, 0.1);
  }

  function toggleMute() {
    muted = !muted;
    if (started) {
      const t = ctx.currentTime;
      engGain.gain.setTargetAtTime(muted ? 0 : 0.03, t, 0.05);
      ambGain.gain.setTargetAtTime(muted ? 0 : 0.04, t, 0.05);
    }
    return muted;
  }

  return { setEngine, toggleMute };
}
