/**
 * Roads and water from OSM, draped on the real terrain.
 *  - Roads: ground-clamped polylines, width/color by highway class.
 *  - Water: ground-classified polygons, translucent blue.
 */
import {
  GroundPolylinePrimitive,
  GroundPolylineGeometry,
  GroundPrimitive,
  GeometryInstance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  Color,
  Cartesian3,
} from 'cesium';
import { roadStyle, isWater } from './osmParse.js';

function toColor([r, g, b, a]) {
  return new Color(r, g, b, a);
}

/** Build a single ground-clamped primitive for all roads in a tile. */
export function buildRoads(scene, ways) {
  const instances = [];
  for (const w of ways) {
    const tags = w.tags || {};
    if (!tags.highway) continue;
    const pts = w.geometry?.filter((p) => p && p.lat != null);
    if (!pts || pts.length < 2) continue;

    const style = roadStyle(tags);
    const positions = Cartesian3.fromDegreesArray(pts.flatMap((p) => [p.lon, p.lat]));
    let geometry;
    try {
      geometry = new GroundPolylineGeometry({ positions, width: style.width });
    } catch {
      continue;
    }
    instances.push(
      new GeometryInstance({
        geometry,
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(toColor(style.color)) },
      }),
    );
  }
  if (!instances.length) return null;
  return new GroundPolylinePrimitive({
    geometryInstances: instances,
    appearance: new PolylineColorAppearance(),
    asynchronous: true,
  });
}

/** Build a single ground-classified primitive for all water bodies in a tile. */
export function buildWater(scene, ways) {
  const water = new Color(0.16, 0.38, 0.6, 0.62);
  const instances = [];
  for (const w of ways) {
    const tags = w.tags || {};
    if (!isWater(tags)) continue;
    const ring = w.geometry?.filter((p) => p && p.lat != null);
    if (!ring || ring.length < 3) continue;
    const positions = Cartesian3.fromDegreesArray(ring.flatMap((p) => [p.lon, p.lat]));
    let geometry;
    try {
      geometry = new PolygonGeometry({ polygonHierarchy: new PolygonHierarchy(positions) });
    } catch {
      continue;
    }
    instances.push(
      new GeometryInstance({
        geometry,
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(water) },
      }),
    );
  }
  if (!instances.length) return null;
  return new GroundPrimitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
    asynchronous: true,
  });
}
