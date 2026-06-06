/**
 * Central app configuration.
 *
 * The whole point of this module is that NO provider is ever hardcoded deep in
 * the app. Terrain, imagery, buildings, vector and geocoding sources are all
 * chosen here by string id, and resolved by `dataSources.js`. If a free service
 * goes down or rate-limits, switch the id here (or via URL `?terrain=` /
 * `?imagery=`) and everything else keeps working.
 *
 * NON-NEGOTIABLE: the DEFAULT configuration must work with NO API key, using
 * only free / keyless / open data. The optional Cesium ion paths exist for
 * users who supply their own free token, but are never required.
 */

// Optional, user-supplied Cesium ion token (build-time env). Leave empty for
// the fully keyless default. Set via a `.env` file: VITE_CESIUM_ION_TOKEN=...
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

const params = new URLSearchParams(window.location.search);

export const config = {
  // --- Terrain (elevation) -------------------------------------------------
  // 'arcgis'    : keyless LERC terrain from Esri WorldElevation3D (default).
  // 'ion-world' : Cesium World Terrain — higher quality, needs a free ion token.
  // 'ellipsoid' : flat WGS84 ellipsoid, no elevation (offline / last resort).
  terrain: params.get('terrain') ?? 'arcgis',

  // --- Imagery (ground texture) -------------------------------------------
  // 'sentinel2' : EOX Sentinel-2 cloudless, ~10m, keyless, global (default).
  // 'esri'      : Esri World Imagery, keyless.
  // 'osm'       : OpenStreetMap raster — stylized "map" look, keyless.
  imagery: params.get('imagery') ?? 'sentinel2',

  // --- Scene look ----------------------------------------------------------
  enableLighting: true, // sun-based terrain shading
  enableAtmosphere: true, // sky atmosphere + ground atmosphere
  enableFog: true,

  // Where the camera looks on first load when no shared view is present.
  // (Phase 1 will read lat/lon/etc. from the URL; for now this is a nice
  // establishing shot of the planet.)
  home: {
    longitude: 8.0,
    latitude: 25.0,
    height: 16_000_000,
  },
};
