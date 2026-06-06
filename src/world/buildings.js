/**
 * Keyless 3D buildings: extrude OSM building footprints fetched via Overpass.
 * All buildings in a tile are batched into a single Primitive for performance.
 */
import {
  Primitive,
  GeometryInstance,
  PolygonGeometry,
  PolygonHierarchy,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  Color,
  Cartesian3,
  Cartographic,
} from 'cesium';
import { buildingHeights } from './osmParse.js';
import { exaggerate } from './heights.js';

const PALETTE = [
  '#b9b2a6', '#c4bcae', '#a89f93', '#cbb9a0', '#b0a99c',
  '#9fa6ad', '#c8c2b6', '#aeb4b0', '#bdae9a', '#a7aeb5',
];

function colorFor(id, top) {
  // Mostly deterministic per building, nudged darker for taller ones.
  const base = Color.fromCssColorString(PALETTE[Math.abs(id) % PALETTE.length]);
  const shade = Math.max(0.7, 1 - top / 400);
  return Color.fromBytes(
    base.red * 255 * shade,
    base.green * 255 * shade,
    base.blue * 255 * shade,
    255,
  );
}

/** Min terrain height among a few ring vertices (so buildings don't float). */
function groundHeight(scene, ring) {
  let min = Infinity;
  const step = Math.max(1, Math.floor(ring.length / 4));
  for (let i = 0; i < ring.length; i += step) {
    const h = scene.globe.getHeight(
      Cartographic.fromDegrees(ring[i].lon, ring[i].lat),
    );
    if (h != null && h < min) min = h;
  }
  // Match the exaggerated render surface so buildings don't float/sink.
  return exaggerate(Number.isFinite(min) ? min : 0);
}

/**
 * @param {Scene} scene
 * @param {Array} ways Overpass building ways (with `geometry`).
 * @returns {Primitive|null}
 */
export function buildBuildings(scene, ways) {
  const instances = [];

  for (const w of ways) {
    const tags = w.tags || {};
    if (!tags.building && tags.building !== '') continue;
    const ring = w.geometry?.filter((p) => p && p.lat != null);
    if (!ring || ring.length < 3) continue;

    const { height, base } = buildingHeights(tags);
    const ground = groundHeight(scene, ring);
    const positions = Cartesian3.fromDegreesArray(
      ring.flatMap((p) => [p.lon, p.lat]),
    );

    let geometry;
    try {
      geometry = new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(positions),
        height: ground + base - 3, // sink base a touch to hide terrain gaps
        extrudedHeight: ground + height,
        closeTop: true,
        closeBottom: false,
      });
    } catch {
      continue; // skip degenerate footprints
    }

    instances.push(
      new GeometryInstance({
        geometry,
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(colorFor(w.id, height)),
        },
      }),
    );
  }

  if (!instances.length) return null;

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      flat: false, // lit, so buildings get sun shading
      translucent: false,
    }),
    asynchronous: true,
  });
}
