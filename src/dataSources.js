/**
 * Data-source abstraction layer.
 *
 * Resolves the string ids from `config.js` into concrete CesiumJS providers.
 * Every provider here is FREE. The default ids ('arcgis' terrain, 'sentinel2'
 * imagery) are fully keyless. Adding a new free source = one entry in the
 * relevant map; the rest of the app never changes.
 *
 * Good-citizen note: these are public, rate-limited services. Cesium already
 * caches tiles and only fetches what the camera needs (level-of-detail), which
 * keeps us polite by default. Later phases add explicit back-off for the
 * Overpass / Nominatim APIs we call directly.
 */
import {
  ArcGISTiledElevationTerrainProvider,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  Terrain,
  Ion,
  IonResource,
  UrlTemplateImageryProvider,
  Credit,
  WebMercatorTilingScheme,
} from 'cesium';
import { CESIUM_ION_TOKEN } from './config.js';

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

const ARCGIS_ELEVATION_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

/**
 * Build a terrain provider for the given id. Async because the modern Cesium
 * terrain providers resolve metadata over the network via `fromUrl`.
 *
 * @returns {Promise<{provider: TerrainProvider, name: string}>}
 */
export async function createTerrainProvider(id) {
  switch (id) {
    case 'ellipsoid':
      return { provider: new EllipsoidTerrainProvider(), name: 'Ellipsoid (no elevation)' };

    case 'ion-world': {
      // Cesium World Terrain — only available with a (free) ion token.
      if (!CESIUM_ION_TOKEN) {
        console.warn(
          '[dataSources] terrain "ion-world" requested but no VITE_CESIUM_ION_TOKEN set; ' +
            'falling back to keyless "arcgis".',
        );
        return createTerrainProvider('arcgis');
      }
      const provider = await CesiumTerrainProvider.fromUrl(IonResource.fromAssetId(1), {
        requestVertexNormals: true,
        requestWaterMask: true,
      });
      return { provider, name: 'Cesium World Terrain (ion)' };
    }

    case 'arcgis':
    default: {
      // Keyless LERC-encoded global terrain. No account required.
      const provider = await ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_ELEVATION_URL);
      return { provider, name: 'Esri WorldElevation3D (keyless)' };
    }
  }
}

// ---------------------------------------------------------------------------
// Imagery
// ---------------------------------------------------------------------------

// EOX Sentinel-2 cloudless layer. The "g" tile matrix set is GoogleMapsCompatible
// (EPSG:3857), i.e. standard WebMercator XYZ tiles, so the REST endpoint behaves
// like a normal {z}/{y}/{x} template. Bump the year here if EOX retires a mosaic.
const SENTINEL2_LAYER = 's2cloudless-2020_3857';

/**
 * EOX Sentinel-2 cloudless — free, global ~10m satellite mosaic, keyless.
 * Uses the RESTful tile endpoint (more reliable than KVP WMTS for static apps).
 * Attribution is mandatory and carried by the Credit below.
 */
function sentinel2Provider() {
  return new UrlTemplateImageryProvider({
    url: `https://tiles.maps.eox.at/wmts/1.0.0/${SENTINEL2_LAYER}/default/g/{z}/{y}/{x}.jpg`,
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel: 16,
    credit: new Credit(
      'Sentinel-2 cloudless 2020 by <a href="https://s2maps.eu" target="_blank">EOX IT Services GmbH</a> ' +
        '(Contains modified Copernicus Sentinel data 2020)',
      true,
    ),
  });
}

/** Esri World Imagery — keyless ArcGIS tile service. */
function esriProvider() {
  return new UrlTemplateImageryProvider({
    url:
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: new Credit(
      'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
      true,
    ),
  });
}

/** OpenStreetMap raster tiles — stylized map look, keyless. */
function osmProvider() {
  return new UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maximumLevel: 19,
    credit: new Credit(
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      true,
    ),
  });
}

/**
 * Build an imagery provider for the given id.
 * @returns {{provider: ImageryProvider, name: string}}
 */
export function createImageryProvider(id) {
  switch (id) {
    case 'esri':
      return { provider: esriProvider(), name: 'Esri World Imagery' };
    case 'osm':
      return { provider: osmProvider(), name: 'OpenStreetMap' };
    case 'sentinel2':
    default:
      return { provider: sentinel2Provider(), name: 'Sentinel-2 cloudless (EOX)' };
  }
}

// ---------------------------------------------------------------------------
// ion token wiring (optional)
// ---------------------------------------------------------------------------

/** Apply the optional free ion token if the user supplied one. */
export function configureIon() {
  if (CESIUM_ION_TOKEN) {
    Ion.defaultAccessToken = CESIUM_ION_TOKEN;
  } else {
    // Prevent Cesium from using its bundled demo token / phoning home.
    Ion.defaultAccessToken = undefined;
  }
}

// Re-export so callers can build a Terrain wrapper if they prefer.
export { Terrain };
