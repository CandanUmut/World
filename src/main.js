/**
 * Real Earth — application entry point.
 *
 * Phase 0: globe & free data stack.
 * Phase 1: place search, shareable URLs, bookmarks.
 */
import { createViewer } from './viewer.js';
import { syncUrlToCamera } from './util/viewState.js';
import { createSearchBox } from './ui/searchBox.js';
import { createBookmarks } from './ui/bookmarks.js';
import { initRegionLoader } from './world/regionLoader.js';
import { toast } from './ui/toast.js';

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
  const { viewer } = await createViewer(setLoading);

  // Phase 1 — navigation & sharing.
  createSearchBox(viewer);
  createBookmarks(viewer);
  syncUrlToCamera(viewer);

  // Phase 2 — world detail (buildings, roads, water, trees) streamed per-region.
  initRegionLoader(viewer).catch((err) => console.error('[main] region loader', err));

  // Reveal the globe once the first frame renders.
  const remove = viewer.scene.postRender.addEventListener(() => {
    hideLoading();
    remove();
  });

  // First-visit hint.
  if (!localStorage.getItem('realEarth.seenHint')) {
    setTimeout(() => toast('Search any place, then drag to look around.', { duration: 5000 }), 1200);
    localStorage.setItem('realEarth.seenHint', '1');
  }
}

boot().catch((err) => {
  console.error('[main] fatal boot error', err);
  setLoading('Something went wrong loading the globe.');
  showError(`Failed to start: ${err?.message ?? err}`);
});
