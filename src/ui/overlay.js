/** HUD overlay: FPS, location, speedometer/gear, and the controls hint. */
export function createOverlay() {
  const fpsEl = document.getElementById('fps');
  const locEl = document.getElementById('loc');
  const speedEl = document.getElementById('speed-val');
  const gearEl = document.getElementById('gear');
  const helpEl = document.getElementById('help');

  let frames = 0;
  let acc = 0;
  let fps = 0;

  return {
    /** Call once per frame with dt (seconds). */
    tick(dt) {
      frames++;
      acc += dt;
      if (acc >= 0.5) {
        fps = Math.round(frames / acc);
        if (fpsEl) fpsEl.textContent = `${fps} fps`;
        frames = 0;
        acc = 0;
      }
    },
    setLocation(text) { if (locEl) locEl.textContent = text; },
    setSpeed(kmh, gear) {
      if (speedEl) speedEl.textContent = String(Math.round(kmh));
      if (gearEl) gearEl.textContent = gear;
    },
    setHelp(html) { if (helpEl) helpEl.innerHTML = html; },
    get fps() { return fps; },
  };
}
