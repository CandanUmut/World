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
  // --- Render mode ---------------------------------------------------------
  // 'stylized' (default): NO satellite imagery — the world is rendered as
  //   crisp stylized geometry (flat-shaded ground + extruded OSM). Kills blur.
  // 'imagery': legacy photoreal base (drapes satellite imagery). Opt-in only.
  renderMode: params.get('mode') ?? (params.get('imagery') ? 'imagery' : 'stylized'),

  // --- Terrain (elevation) -------------------------------------------------
  // 'arcgis'    : keyless LERC terrain from Esri WorldElevation3D (default).
  // 'ion-world' : Cesium World Terrain — higher quality, needs a free ion token.
  // 'ellipsoid' : flat WGS84 ellipsoid, no elevation (offline / last resort).
  terrain: params.get('terrain') ?? 'arcgis',

  // Slight vertical exaggeration so hills read as 3D in the stylized look.
  // All ground placement (buildings, vehicles) goes through world/heights.js so
  // geometry stays glued to the exaggerated terrain.
  verticalExaggeration: parseFloat(params.get('exag')) || 1.18,

  // --- Imagery (only used when renderMode === 'imagery') ------------------
  imagery: params.get('imagery') ?? 'sentinel2',

  // --- Place search / geocoding -------------------------------------------
  geocoding: {
    // Nominatim is the free, keyless OSM geocoder. Swappable if it rate-limits.
    nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  },

  // --- OSM vector data: the world's geometry ------------------------------
  // Primary path is fast vector tiles (PMTiles archive or XYZ MVT). Overpass is
  // kept ONLY as a small-area keyless fallback when no tile source is set.
  //
  //   pmtilesUrl     : URL of a baked PMTiles archive (OpenMapTiles schema).
  //                    Can be a GitHub Release asset (≤2GB, supports range
  //                    requests), a file in /public, or an external range-host.
  //                    Set via env VITE_PMTILES_URL or ?pmtiles= .
  //   mvtUrlTemplate : XYZ template "https://…/{z}/{x}/{y}.pbf" for go-anywhere
  //                    against a hosted vector-tile service.
  vector: {
    pmtilesUrl: params.get('pmtiles') ?? import.meta.env.VITE_PMTILES_URL ?? '',
    mvtUrlTemplate: params.get('mvt') ?? import.meta.env.VITE_MVT_URL ?? '',
    // Public Overpass endpoints (small-area fallback only).
    overpassUrls: [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ],
    enableTrees: true,
    maxTreesPerTile: 900,
  },

  // --- 3D buildings --------------------------------------------------------
  // 'osm'     : extrude OSM footprints from the vector source (default).
  // 'ion-osm' : Cesium OSM Buildings (global LOD1), needs a free ion token.
  // 'none'    : no buildings.
  buildings: params.get('buildings') ?? 'osm',

  // --- Stylized "old-game" palette ----------------------------------------
  style: {
    // Base ground where no land-use polygon covers it.
    ground: '#cdbd97', // warm tan
    groundUrban: '#bdb4a6',
    water: '#3f6fa3',
    sky: '#9ecbe6',
    space: '#0a1622',
  },

  // --- Scene look ----------------------------------------------------------
  enableLighting: true, // sun-based terrain shading
  enableAtmosphere: true, // sky atmosphere + ground atmosphere
  enableFog: true,

  // Default first-load view: a low OBLIQUE shot with the horizon in frame, so
  // the world looks 3D immediately (no more straight-down orbit shot).
  home: {
    longitude: -122.4194,
    latitude: 37.7749, // San Francisco — hilly, well-mapped, reads as 3D
    height: 1700,
    heading: 35,
    pitch: -16,
  },
};

