/**
 * Real Earth — Phase 0: globe & free data stack.
 *
 * Boots a CesiumJS viewer with keyless free terrain + Sentinel-2 imagery,
 * sun lighting, atmosphere and always-visible attribution. No API key needed.
 */
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  Color,
} from 'cesium';
// Note: vite-plugin-cesium injects Widgets/widgets.css automatically, so we do
// not import it here (avoids bundling it twice).

import { config } from './config.js';
import {
  configureIon,
  createTerrainProvider,
  createImageryProvider,
} from './dataSources.js';

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const errorBanner = document.getElementById('errorBanner');

function setLoading(text) {
  if (loadingText) loadingText.textContent = text;
}

function hideLoading() {
  loadingOverlay?.classList.add('hidden');
}

function showError(message) {
  if (!errorBanner) return;
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

async function boot() {
  configureIon();

  setLoading('Connecting to free terrain & imagery…');

  // Resolve providers through the abstraction. Imagery is sync; terrain is
  // async (network metadata). Resolve them in parallel.
  const [terrain, imagery] = await Promise.all([
    createTerrainProvider(config.terrain).catch((err) => {
      console.error('[main] terrain failed, falling back to ellipsoid', err);
      showError('Terrain provider unavailable — showing flat globe. Imagery still loads.');
      return createTerrainProvider('ellipsoid');
    }),
    Promise.resolve(createImageryProvider(config.imagery)),
  ]);

  // Build the viewer. We strip the stock widgets that imply paid/ion features
  // or that we'll replace with our own UI in later phases. The credit display
  // (attribution) is kept — it is mandatory and never disabled.
  const viewer = new Viewer('cesiumContainer', {
    terrainProvider: terrain.provider,
    baseLayerPicker: false,
    geocoder: false, // Phase 1 adds a keyless Nominatim search instead
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: undefined, // keep the default on-screen credit display
  });

  // Replace the default Bing/ion base imagery layer with our free provider.
  const layers = viewer.imageryLayers;
  layers.removeAll();
  layers.addImageryProvider(imagery.provider);

  // --- Scene: lighting, atmosphere, fog ------------------------------------
  const scene = viewer.scene;
  const globe = scene.globe;

  globe.enableLighting = config.enableLighting;
  scene.skyAtmosphere.show = config.enableAtmosphere;
  globe.showGroundAtmosphere = config.enableAtmosphere;
  scene.fog.enabled = config.enableFog;
  globe.depthTestAgainstTerrain = true;

  // A calm dark space backdrop.
  scene.backgroundColor = Color.fromCssColorString('#01030a');

  // NOTE: we deliberately leave Cesium's credit display untouched. The CesiumJS
  // engine credit plus the data attributions (EOX/Sentinel-2, terrain, and OSM
  // in later phases) must all stay visible — this is what keeps the app legal
  // and free. Never strip attribution.

  // --- Establishing camera position ----------------------------------------
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(
      config.home.longitude,
      config.home.latitude,
      config.home.height,
    ),
    orientation: {
      heading: 0.0,
      pitch: CesiumMath.toRadians(-90),
      roll: 0.0,
    },
  });

  // Reveal the globe once the first frame with tiles has rendered.
  const removeListener = scene.postRender.addEventListener(() => {
    hideLoading();
    removeListener();
  });

  // Expose for debugging / later phases.
  window.viewer = viewer;
  console.info(
    `[Real Earth] terrain="${terrain.name}", imagery="${imagery.name}" — all free, no key required.`,
  );
}

boot().catch((err) => {
  console.error('[main] fatal boot error', err);
  setLoading('Something went wrong loading the globe.');
  showError(`Failed to start: ${err?.message ?? err}`);
});
