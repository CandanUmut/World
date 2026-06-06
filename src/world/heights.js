/**
 * Centralized ground-height sampling.
 *
 * Two things every placement in the app must agree on:
 *  1. Vertical exaggeration — Cesium renders terrain as h' = h * exag (with the
 *     relative height pinned to 0). Buildings, vehicles and the player must sit
 *     on that *exaggerated* surface, not the true one, or they float/sink.
 *  2. Whether tiles are actually loaded — synchronous `globe.getHeight` returns
 *     null over unloaded terrain (the old car-spawns-underground bug). For
 *     placement we await the real elevation with `sampleTerrainMostDetailed`.
 */
import { Cartographic, sampleTerrainMostDetailed } from 'cesium';
import { config } from '../config.js';

/** Apply the configured vertical exaggeration (relative height = 0). */
export function exaggerate(trueHeight) {
  return trueHeight * config.verticalExaggeration;
}

/**
 * Fast, best-effort ground height from currently-loaded tiles (may be null).
 * Use in per-frame hot paths (vehicle terrain-follow) where awaiting is too
 * expensive; callers handle null by keeping their previous height.
 */
export function groundHeightSync(scene, carto) {
  const h = scene.globe.getHeight(carto);
  return h == null ? null : exaggerate(h);
}

/**
 * Accurate ground height — awaits the most detailed terrain tile for this point.
 * Use for spawning / teleporting so we never place below the surface.
 * @returns {Promise<number>} exaggerated ground height in metres.
 */
export async function groundHeightDetailed(scene, lon, lat) {
  const carto = Cartographic.fromDegrees(lon, lat);
  try {
    await sampleTerrainMostDetailed(scene.terrainProvider, [carto]);
  } catch {
    /* fall through to whatever we have */
  }
  const h = Number.isFinite(carto.height) ? carto.height : scene.globe.getHeight(carto) ?? 0;
  return exaggerate(h);
}
