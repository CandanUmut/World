/**
 * Real Earth — application entry point.
 *
 * Phase 0: globe & free data stack.
 * Phase 1: place search, shareable URLs, bookmarks.
 * Phase 2: world detail — buildings, roads, water, trees.
 * Phase 3-4: vehicles — fly, drive, sail.
 * Phase 5: living world — time, weather, ambient life, audio, settings.
 */
import { createViewer } from './viewer.js';
import { syncUrlToCamera } from './util/viewState.js';
import { createSearchBox } from './ui/searchBox.js';
import { createBookmarks } from './ui/bookmarks.js';
import { initRegionLoader } from './world/regionLoader.js';
import { createVehicleManager } from './vehicles/vehicleManager.js';
import { createVehicleBar } from './ui/vehicleBar.js';
import { Walker } from './vehicles/walk.js';
import { Plane } from './vehicles/plane.js';
import { Car } from './vehicles/car.js';
import { Ship } from './vehicles/ship.js';
import { createEnvironment } from './world/sky.js';
import { createBirds } from './world/birds.js';
import { createSettings } from './ui/settings.js';
import { maybeShowOnboarding } from './ui/onboarding.js';
import { installImageryResilience, installGlobalGuards } from './world/resilience.js';

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const errorBanner = document.getElementById('errorBanner');

const setLoading = (t) => loadingText && (loadingText.textContent = t);
const hideLoading = () => loadingOverlay?.classList.add('hidden');
function showError(message) {
  if (!errorBanner) return;
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

async function boot() {
  installGlobalGuards();
  const { viewer, terrainName, imageryName, stylized } = await createViewer(setLoading);

  // Auto-fallback if the imagery provider goes down (imagery mode only;
  // stylized mode has no imagery layer to guard).
  if (!stylized) installImageryResilience(viewer);

  // Phase 1 — navigation & sharing.
  createSearchBox(viewer);
  createBookmarks(viewer);
  syncUrlToCamera(viewer);

  // Phase 2 — world detail (buildings, roads, water, trees) streamed per-region.
  initRegionLoader(viewer).catch((err) => console.error('[main] region loader', err));

  // Phase 3 & 4 — vehicles: fly, drive and sail the real world.
  const vehicleManager = createVehicleManager(viewer);
  createVehicleBar(vehicleManager, [
    { label: 'Walk', icon: '🚶', cls: Walker },
    { label: 'Plane', icon: '✈', cls: Plane },
    { label: 'Car', icon: '🚗', cls: Car },
    { label: 'Ship', icon: '🚢', cls: Ship },
  ]);

  // Phase 5 — a living world.
  const environment = createEnvironment(viewer);
  const birds = createBirds(viewer);
  createSettings(viewer, environment, birds, { terrainName, imageryName });

  // Reveal the globe once the first frame renders.
  const remove = viewer.scene.postRender.addEventListener(() => {
    hideLoading();
    remove();
    maybeShowOnboarding();
  });
}

boot().catch((err) => {
  console.error('[main] fatal boot error', err);
  setLoading('Something went wrong loading the globe.');
  showError(`Failed to start: ${err?.message ?? err}`);
});
