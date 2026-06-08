import * as THREE from 'three';

/**
 * Name labels (streets, places, shops/POIs) as camera-facing DOM chips. They're
 * LOD'd by kind (streets only when close, places visible far), priority-sorted,
 * decluttered with a coarse screen grid, and capped to a small pool — so they
 * never clutter or cost. Positions come from the streamed tiles each frame
 * (rebase-safe via tile group offsets).
 */
const POOL = 30;
const RANGE = { place: 1600, street: 240, shop: 200, food: 200, civic: 320, poi: 150 };

export function createLabels(camera, cityTiles) {
  const container = document.getElementById('labels');
  if (!container) return { update() {} };

  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('div');
    el.className = 'label';
    el.style.display = 'none';
    container.appendChild(el);
    pool.push(el);
  }

  const v = new THREE.Vector3();
  const cand = [];

  function update() {
    const w = window.innerWidth, h = window.innerHeight;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    cand.length = 0;

    for (const rec of cityTiles.labelTiles()) {
      const gx = rec.group.position.x, gz = rec.group.position.z;
      for (const L of rec.labels) {
        const wx = gx + L.x, wz = gz + L.z;
        const dx = wx - cx, dz = wz - cz;
        const dist = Math.hypot(dx, dz);
        if (dist > (RANGE[L.kind] || 200)) continue;
        cand.push({ L, wx, wz, dist });
      }
    }
    // Priority: rank first, then nearest.
    cand.sort((a, b) => (a.L.rank - b.L.rank) || (a.dist - b.dist));

    const occupied = new Set();
    let used = 0;
    for (let i = 0; i < cand.length && used < POOL; i++) {
      const c = cand[i];
      v.set(c.wx, 2 + (c.L.kind === 'place' ? 30 : 6), c.wz).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const cell = `${Math.round(sx / 84)},${Math.round(sy / 30)}`;
      if (occupied.has(cell)) continue;
      occupied.add(cell);

      const el = pool[used++];
      el.textContent = c.L.name;
      el.className = `label k-${c.L.kind}`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.opacity = String(Math.max(0.25, 1 - c.dist / (RANGE[c.L.kind] || 200)));
      el.style.display = 'block';
    }
    for (let i = used; i < POOL; i++) pool[i].style.display = 'none';
  }

  return { update };
}
