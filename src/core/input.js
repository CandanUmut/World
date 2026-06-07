/** Minimal keyboard + pointer input. Tracks held keys and mouse-look deltas. */
export function createInput(domElement) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, dragging: false };

  const norm = (e) => e.code || e.key;
  window.addEventListener('keydown', (e) => {
    // Don't swallow browser shortcuts with modifiers.
    if (e.metaKey || e.ctrlKey) return;
    keys.add(norm(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(norm(e)));
  window.addEventListener('blur', () => keys.clear());

  domElement.addEventListener('pointerdown', (e) => {
    mouse.dragging = true;
    domElement.setPointerCapture(e.pointerId);
  });
  domElement.addEventListener('pointerup', (e) => {
    mouse.dragging = false;
    try { domElement.releasePointerCapture(e.pointerId); } catch {}
  });
  domElement.addEventListener('pointermove', (e) => {
    if (!mouse.dragging) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });

  return {
    keys,
    down: (code) => keys.has(code),
    /** Consume accumulated mouse-look delta since last call. */
    takeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    },
  };
}
