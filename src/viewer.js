/**
 * Viewer construction + scene setup.
 *
 * Default render mode is STYLIZED geometry: no satellite imagery (that's what
 * caused the permanent blur). The globe is a clean flat-shaded base color, lit
 * by the sun and shaped by real terrain; OSM geometry (buildings/roads/water/
 * trees) is drawn on top crisply. A low oblique default camera makes it read as
 * 3D immediately. `?mode=imagery` restores the old photoreal base.
 */
import { Viewer, Cartesian3, Math as CesiumMath, Color, Credit } from 'cesium';

import { config } from './config.js';
import { configureIon, createTerrainProvider, createImageryProvider } from './dataSources.js';
import { readViewFromUrl } from './util/viewState.js';

export async function createViewer(onStatus = () => {}) {
  configureIon();
  onStatus('Loading real terrain…');

  const terrain = await createTerrainProvider(config.terrain).catch((err) => {
    console.error('[viewer] terrain failed, falling back to ellipsoid', err);
    return createTerrainProvider('ellipsoid');
  });

  const viewer = new Viewer('cesiumContainer', {
    terrainProvider: terrain.provider,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  const { scene } = viewer;
  const { globe } = scene;
  const stylized = config.renderMode !== 'imagery';
  let imageryName = 'Stylized geometry (no imagery)';

  viewer.imageryLayers.removeAll();
  if (stylized) {
    // No imagery: the globe shows its base color, flat-shaded by terrain + sun.
    globe.baseColor = Color.fromCssColorString(config.style.ground);
    globe.showGroundAtmosphere = config.enableAtmosphere;
    // Hide the brown "underground" by tinting it like the ground.
    globe.undergroundColor = Color.fromCssColorString(config.style.ground).darken(0.4, new Color());
  } else {
    const imagery = createImageryProvider(config.imagery);
    viewer.imageryLayers.addImageryProvider(imagery.provider);
    imageryName = imagery.name;
  }

  // Lighting, atmosphere, fog.
  globe.enableLighting = config.enableLighting;
  scene.skyAtmosphere.show = config.enableAtmosphere;
  scene.fog.enabled = config.enableFog;
  globe.depthTestAgainstTerrain = true;
  scene.backgroundColor = Color.fromCssColorString(config.style.space);

  // Vertical exaggeration so hills read as 3D. Placement code (world/heights.js)
  // multiplies sampled heights by the same factor, with relative height pinned
  // to 0, so buildings and vehicles stay glued to the exaggerated surface.
  scene.verticalExaggeration = config.verticalExaggeration;
  scene.verticalExaggerationRelativeHeight = 0.0;

  // Performance/free-service hygiene.
  globe.tileCacheSize = 220;
  globe.preloadSiblings = false;

  // Camera tuned for low-altitude sightseeing.
  const ctrl = scene.screenSpaceCameraController;
  ctrl.inertiaSpin = 0.92;
  ctrl.inertiaTranslate = 0.92;
  ctrl.inertiaZoom = 0.85;
  ctrl.minimumZoomDistance = 1.5;
  ctrl.maximumZoomDistance = 30_000_000;
  ctrl.enableCollisionDetection = true;

  // Initial view: shared URL view if present, else a low OBLIQUE home shot.
  const urlView = readViewFromUrl();
  const h = config.home;
  viewer.camera.setView(
    urlView
      ? {
          destination: Cartesian3.fromDegrees(urlView.lng, urlView.lat, urlView.height),
          orientation: {
            heading: CesiumMath.toRadians(urlView.heading),
            pitch: CesiumMath.toRadians(urlView.pitch),
            roll: 0,
          },
        }
      : {
          destination: Cartesian3.fromDegrees(h.longitude, h.latitude, h.height),
          orientation: {
            heading: CesiumMath.toRadians(h.heading ?? 0),
            pitch: CesiumMath.toRadians(h.pitch ?? -90),
            roll: 0,
          },
        },
  );

  // Mandatory OSM attribution (ODbL). In stylized mode there is no imagery
  // layer to carry it, so add it as a persistent static credit. Never remove.
  try {
    scene.frameState.creditDisplay.addStaticCredit(
      new Credit(
        'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors (ODbL)',
        true,
      ),
    );
  } catch (err) {
    console.warn('[viewer] could not add OSM credit', err);
  }

  window.viewer = viewer;
  console.info(
    `[World] mode="${config.renderMode}", terrain="${terrain.name}", imagery="${imageryName}".`,
  );

  return { viewer, terrainName: terrain.name, imageryName, stylized };
}
