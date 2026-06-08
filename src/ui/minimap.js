/**
 * Cheap heading-up minimap. Draws nearby building footprints (the same data the
 * collision system already holds — no extra streaming) as light blocks in the
 * car's local frame, with the car as an arrow at the center. Redraws at ~12 Hz
 * and caps the block count, so it never threatens the frame budget. Toggle with M.
 */
export function createMinimap() {
  const canvas = document.getElementById('minimap');
  if (!canvas) return { update() {}, toggle() {} };
  const ctx = canvas.getContext('2d');
  const SIZE = 168;
  const RANGE = 230; // meters from car shown to the edge
  canvas.width = SIZE;
  canvas.height = SIZE;

  let enabled = true;
  let acc = 0;

  function toggle() {
    enabled = !enabled;
    canvas.style.display = enabled ? 'block' : 'none';
  }

  function update(dt, collision, car) {
    if (!enabled) return;
    acc += dt;
    if (acc < 0.083) return;
    acc = 0;

    const rects = collision.snapshot(car.position.x, car.position.z, RANGE);
    const s = SIZE / (RANGE * 2); // px per meter
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h);   // forward
    const rx = Math.cos(h), rz = -Math.sin(h);  // right

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(18, 24, 32, 0.78)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = 'rgba(190, 198, 210, 0.85)';
    for (let i = 0; i < rects.length; i += 4) {
      const dx = rects[i], dz = rects[i + 1];
      const lf = dx * fx + dz * fz;  // local forward
      const lr = dx * rx + dz * rz;  // local right
      const sx = SIZE / 2 + lr * s;
      const sy = SIZE / 2 - lf * s;  // forward = up
      const w = Math.max(2, (rects[i + 2] + rects[i + 3]) * s);
      ctx.fillRect(sx - w / 2, sy - w / 2, w, w);
    }
    ctx.restore();

    // Car arrow (always pointing up).
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(SIZE / 2, SIZE / 2 - 7);
    ctx.lineTo(SIZE / 2 - 5, SIZE / 2 + 6);
    ctx.lineTo(SIZE / 2 + 5, SIZE / 2 + 6);
    ctx.closePath();
    ctx.fill();

    // Ring border.
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  return { update, toggle };
}
