/**
 * Viewer construction + scene setup (Phase 0 core, extracted so feature
 * modules in later phases can build on a ready viewer).
 */
import { Viewer, Cartesian3, Math as CesiumMath, Color } from 'cesium';

import { config } from './config.js';
import {
  configureIon,
  createTerrainProvider,
  createImageryProvider,
} from './dataSources.js';
import { readViewFromUrl } from './util/viewState.js';

/**
 * Boot a CesiumJS viewer with free terrain + imagery, lighting and atmosphere.
 * @returns {Promise<{viewer: Viewer, terrainName: string, imageryName: string}>}
 */
export async function createViewer(onStatus = () => {}) {
  configureIon();
  onStatus('Connecting to free terrain & imagery…');

  const [terrain, imagery] = await Promise.all([
    createTerrainProvider(config.terrain).catch((err) => {
      console.error('[viewer] terrain failed, falling back to ellipsoid', err);
      return createTerrainProvider('ellipsoid');
    }),
    Promise.resolve(createImageryProvider(config.imagery)),
  ]);

  const viewer = new Viewer('cesiumContainer', {
    terrainProvider: terrain.provider,
    baseLayerPicker: false,
    geocoder: false, // we provide our own keyless Nominatim search
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  // Swap in the free imagery layer.
  const layers = viewer.imageryLayers;
  layers.removeAll();
  layers.addImageryProvider(imagery.provider);

  // Scene look: lighting, atmosphere, fog.
  const { scene } = viewer;
  const { globe } = scene;
  globe.enableLighting = config.enableLighting;
  scene.skyAtmosphere.show = config.enableAtmosphere;
  globe.showGroundAtmosphere = config.enableAtmosphere;
  scene.fog.enabled = config.enableFog;
  globe.depthTestAgainstTerrain = true;
  scene.backgroundColor = Color.fromCssColorString('#01030a');

  // Performance/free-service hygiene: a generous terrain tile cache reduces
  // re-fetches, and not preloading siblings keeps requests lean.
  globe.tileCacheSize = 220;
  globe.preloadSiblings = false;

  // Sightseeing-tuned camera: gentle inertia, sensible zoom limits.
  const ctrl = scene.screenSpaceCameraController;
  ctrl.inertiaSpin = 0.92;
  ctrl.inertiaTranslate = 0.92;
  ctrl.inertiaZoom = 0.85;
  ctrl.minimumZoomDistance = 1.5; // let people get close to the ground
  ctrl.maximumZoomDistance = 30_000_000;
  ctrl.enableCollisionDetection = true; // don't let the camera sink underground

  // Initial view: a shared URL view if present, otherwise the establishing shot.
  const urlView = readViewFromUrl();
  if (urlView) {
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(urlView.lng, urlView.lat, urlView.height),
      orientation: {
        heading: CesiumMath.toRadians(urlView.heading),
        pitch: CesiumMath.toRadians(urlView.pitch),
        roll: 0,
      },
    });
  } else {
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        config.home.longitude,
        config.home.latitude,
        config.home.height,
      ),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    });
  }

  window.viewer = viewer;
  console.info(
    `[Real Earth] terrain="${terrain.name}", imagery="${imagery.name}" — all free, no key required.`,
  );

  return { viewer, terrainName: terrain.name, imageryName: imagery.name };
}
