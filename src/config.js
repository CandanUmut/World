/** Static config + URL-param overrides. */
const params = new URLSearchParams(location.search);

function num(name, fallback) {
  const v = params.get(name);
  return v == null ? fallback : Number(v);
}

export const config = {
  // Where the player drops in. Defaults to Midtown Manhattan — the NY PMTiles
  // archive covers it. Override with ?lon=&lat=.
  start: {
    lon: num('lon', -73.9857),
    lat: num('lat', 40.7484),
  },

  // OSM data feed. The baked New York PMTiles archive lives in /public.
  // Override with ?pmtiles= or VITE_PMTILES_URL. Resolved to an ABSOLUTE URL
  // against the document so the decoder worker (whose own base URL is the
  // /src/workers/ script path) fetches it from the site root, not relative to
  // itself.
  pmtilesUrl: new URL(
    params.get('pmtiles') || import.meta.env.VITE_PMTILES_URL || './new-york.pmtiles',
    location.href,
  ).href,

  // Floating-origin rebase threshold (meters).
  rebaseThreshold: num('rebase', 3000),

  // Streaming radius in tiles around the player (Phase 1+).
  tileRadius: num('radius', 3),

  // Show developer overlays.
  debug: params.has('debug'),
};
