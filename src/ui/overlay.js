/** Lightweight HUD overlay: FPS readout and a location line. */
export function createOverlay() {
  const fpsEl = document.getElementById('fps');
  const locEl = document.getElementById('loc');

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
        fpsEl.textContent = `${fps} fps`;
        frames = 0;
        acc = 0;
      }
    },
    setLocation(text) {
      locEl.textContent = text;
    },
    get fps() { return fps; },
  };
}
