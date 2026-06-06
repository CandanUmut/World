/**
 * Shareable location URLs.
 *
 * Encodes the camera view (lng/lat/height/heading/pitch) into the query string
 * so any view can be reopened exactly on another machine — the "free and
 * available to everyone" sharing hook. Also used to restore a view on load.
 */
import { Cartographic, Math as CesiumMath } from 'cesium';

const KEYS = { lng: 'lng', lat: 'lat', height: 'h', heading: 'hd', pitch: 'p' };

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Read a view from the current URL, or null if not present/invalid. */
export function readViewFromUrl() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has(KEYS.lng) || !p.has(KEYS.lat)) return null;
  const lng = parseFloat(p.get(KEYS.lng));
  const lat = parseFloat(p.get(KEYS.lat));
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return {
    lng,
    lat,
    height: parseFloat(p.get(KEYS.height)) || 1000,
    heading: parseFloat(p.get(KEYS.heading)) || 0,
    pitch: Number.isFinite(parseFloat(p.get(KEYS.pitch))) ? parseFloat(p.get(KEYS.pitch)) : -30,
  };
}

/** Extract the current camera view as a plain object (degrees + metres). */
export function getCameraView(viewer) {
  const { camera } = viewer;
  const carto = Cartographic.fromCartesian(camera.positionWC);
  return {
    lng: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    height: carto.height,
    heading: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
  };
}

/** Build a shareable absolute URL string for a given view. */
export function buildShareUrl(view) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(KEYS.lng, round(view.lng, 6));
  url.searchParams.set(KEYS.lat, round(view.lat, 6));
  url.searchParams.set(KEYS.height, round(view.height, 1));
  url.searchParams.set(KEYS.heading, round(view.heading, 1));
  url.searchParams.set(KEYS.pitch, round(view.pitch, 1));
  return url.toString();
}

/**
 * Keep the address bar in sync with the camera (throttled via moveEnd) so the
 * current page URL is always shareable. Preserves unrelated params.
 */
export function syncUrlToCamera(viewer) {
  const update = () => {
    const v = getCameraView(viewer);
    const url = new URL(window.location.href);
    url.searchParams.set(KEYS.lng, round(v.lng, 6));
    url.searchParams.set(KEYS.lat, round(v.lat, 6));
    url.searchParams.set(KEYS.height, round(v.height, 1));
    url.searchParams.set(KEYS.heading, round(v.heading, 1));
    url.searchParams.set(KEYS.pitch, round(v.pitch, 1));
    window.history.replaceState(null, '', url.toString());
  };
  viewer.camera.moveEnd.addEventListener(update);
  return update;
}
