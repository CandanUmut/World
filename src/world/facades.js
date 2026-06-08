import * as THREE from 'three';

/**
 * Procedural facade textures — the cheap trick that transforms the look. A
 * tiling window atlas (one repeat = FACADE_M_X x FACADE_M_Y meters, matching
 * the UVs the worker writes) plus a matching night EMISSIVE map where a random
 * subset of windows is lit warm. The wall is left near-white so the per-building
 * vertex color tints it to brick/sandstone/glass; only the windows read dark.
 *
 * Two textures, shared by every building in the city — one draw per tile, and
 * the glow is free until the single bloom pass amplifies it at night.
 */
export function makeFacadeTextures() {
  const S = 256;       // atlas size
  const G = 4;         // windows per axis per repeat
  const cell = S / G;  // 64px
  const inset = cell * 0.16;
  const ww = cell - inset * 2;

  // Deterministic PRNG so the lit pattern is stable run to run.
  let seed = 1234;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // --- day color map ---
  const dc = document.createElement('canvas'); dc.width = dc.height = S;
  const d = dc.getContext('2d');
  d.fillStyle = '#dcdcd6'; d.fillRect(0, 0, S, S);              // wall (tinted later)
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = gx * cell + inset, y = gy * cell + inset;
      d.fillStyle = '#3a4654'; d.fillRect(x - 2, y - 2, ww + 4, ww + 4); // frame
      const b = 0.55 + rnd() * 0.3;
      d.fillStyle = `rgb(${Math.round(70 * b)},${Math.round(96 * b)},${Math.round(120 * b)})`;
      d.fillRect(x, y, ww, ww);                                  // glass
    }
  }

  // --- night emissive map ---
  seed = 1234;
  const nc = document.createElement('canvas'); nc.width = nc.height = S;
  const n = nc.getContext('2d');
  n.fillStyle = '#000'; n.fillRect(0, 0, S, S);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = gx * cell + inset, y = gy * cell + inset;
      const r = rnd();
      if (r < 0.42) {
        const warm = rnd();
        n.fillStyle = warm < 0.8
          ? `rgb(255,${200 + Math.round(warm * 50)},150)`        // warm
          : 'rgb(200,225,255)';                                  // cool
        n.fillRect(x, y, ww, ww);
      }
    }
  }

  const colorTex = wrap(new THREE.CanvasTexture(dc), THREE.SRGBColorSpace);
  const nightTex = wrap(new THREE.CanvasTexture(nc), THREE.SRGBColorSpace);
  return { colorTex, nightTex };
}

function wrap(tex, colorSpace) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = colorSpace;
  return tex;
}
