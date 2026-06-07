/**
 * Tile decoder worker.
 *
 * Runs entirely off the main thread: holds the PMTiles archive, fetches tiles
 * via HTTP range requests, decodes the MVT, and converts each feature's
 * tile-local coordinates into absolute Web-Mercator METERS. The main thread
 * turns mercator meters into small world coordinates against the current
 * floating-origin anchor, so all heavy parsing/geometry math stays here.
 *
 * Geometry is returned as flat Float64Arrays (mercator x,y interleaved) whose
 * backing ArrayBuffers are transferred (zero-copy) to the main thread.
 */
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { tileTopLeftMerc } from '../data/tiles.js';
import { buildTileMeshes } from './geometry.js';

let archive = null;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    archive = new PMTiles(msg.url);
    try {
      const h = await archive.getHeader();
      self.postMessage({ type: 'ready', minZoom: h.minZoom, maxZoom: h.maxZoom });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
    return;
  }

  if (msg.type === 'tile') {
    const { id, z, x, y, lod } = msg;
    try {
      const res = await archive.getZxy(z, x, y);
      if (!res || !res.data) {
        self.postMessage({ type: 'tile', id, z, x, y, ok: true, empty: true });
        return;
      }
      const decoded = decodeTile(new Uint8Array(res.data), z, x, y, lod || 0);
      self.postMessage(
        { type: 'tile', id, z, x, y, ok: true, ...decoded.payload },
        decoded.transfer,
      );
    } catch (err) {
      self.postMessage({ type: 'tile', id, z, x, y, ok: false, error: String(err) });
    }
  }
};

function decodeTile(bytes, z, x, y, lod) {
  const tile = new VectorTile(new Protobuf(bytes));
  const { mx: mx0, my: my0, size } = tileTopLeftMerc(z, x, y);
  const transfer = []; // unused for raw rings; kept for helper signatures

  // Project a tile-local point [0..extent] (y down) -> mercator meters.
  const project = (extent, px, py) => [
    mx0 + (px / extent) * size,
    my0 - (py / extent) * size,
  ];

  // --- polygon layers: collect exterior + hole rings as Float64Arrays ---
  function polygons(layerName, mapProps) {
    const layer = tile.layers[layerName];
    if (!layer) return [];
    const out = [];
    const ext = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const geom = f.loadGeometry(); // array of rings of {x,y}
      const rings = [];
      for (const ring of geom) {
        const arr = new Float64Array(ring.length * 2);
        for (let k = 0; k < ring.length; k++) {
          const m = project(ext, ring[k].x, ring[k].y);
          arr[k * 2] = m[0];
          arr[k * 2 + 1] = m[1];
        }
        rings.push(arr);
        transfer.push(arr.buffer);
      }
      if (rings.length) out.push({ rings, ...(mapProps ? mapProps(f.properties) : {}) });
    }
    return out;
  }

  // --- line layers: collect each part as a flat Float64Array ---
  function lines(layerName, mapProps) {
    const layer = tile.layers[layerName];
    if (!layer) return [];
    const out = [];
    const ext = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const geom = f.loadGeometry();
      const props = mapProps ? mapProps(f.properties) : {};
      for (const part of geom) {
        if (part.length < 2) continue;
        const arr = new Float64Array(part.length * 2);
        for (let k = 0; k < part.length; k++) {
          const m = project(ext, part[k].x, part[k].y);
          arr[k * 2] = m[0];
          arr[k * 2 + 1] = m[1];
        }
        out.push({ pts: arr, ...props });
        transfer.push(arr.buffer);
      }
    }
    return out;
  }

  const payload = {
    buildings: polygons('building', (p) => ({
      height: numOr(p.render_height, 8),
      minHeight: numOr(p.render_min_height, 0),
      colour: p.colour || null,
      hide3d: p.hide_3d === true || p.hide_3d === 'true',
    })),
    roads: lines('transportation', (p) => ({
      klass: p.class || 'minor',
      subclass: p.subclass || null,
      oneway: p.oneway === 1 || p.oneway === '1' || p.oneway === true,
      brunnel: p.brunnel || null,
    })),
    water: polygons('water', null),
    waterways: lines('waterway', (p) => ({ klass: p.class || 'stream' })),
    landuse: polygons('landuse', (p) => ({ klass: p.class || null })),
    landcover: polygons('landcover', (p) => ({ klass: p.class || null })),
    parks: polygons('park', null),
  };

  // Build stylized meshes in the worker (tile-center mercator as local origin).
  const mcx = mx0 + size / 2;
  const mcy = my0 - size / 2;
  const meshes = buildTileMeshes(payload, mcx, mcy, { lod });

  // Transfer only the final mesh buffers (raw rings stay and are GC'd).
  const out = { center: meshes.center };
  const meshTransfer = [];
  for (const key of ['ground', 'roads', 'buildings']) {
    const m = meshes[key];
    if (!m) { out[key] = null; continue; }
    out[key] = m;
    meshTransfer.push(m.positions.buffer, m.normals.buffer, m.colors.buffer);
  }
  out.trees = meshes.trees;
  if (meshes.trees) meshTransfer.push(meshes.trees.buffer);
  return { payload: out, transfer: meshTransfer };
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
