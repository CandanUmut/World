# Real Earth — Free & Open

Explore the **real Earth** in your browser — real terrain, real satellite
imagery, real cities — and (in later phases) drive, sail and fly to visit real
places. **100% free to build and to run for everyone:** a static site on GitHub
Pages using only free / open data. No paid APIs, no billing accounts, no API
key required in the default configuration. Built on [CesiumJS](https://cesium.com/platform/cesiumjs/).

> **Status: Phase 0 complete** — the real globe renders with real terrain
> relief, satellite imagery, atmosphere and sun lighting, with correct
> attribution and no API key.

## Quick start

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Open the dev URL Vite prints. You should see the real globe with shaded terrain
and satellite imagery.

> **Note on restricted networks:** the live data comes from public tile/API
> services (EOX, Esri, OpenStreetMap). If you run this behind a network that
> allowlists hosts, those tile hosts must be reachable or the globe will appear
> blank. End users on the open internet are unaffected.

## How it works

CesiumJS handles the hard geospatial parts for free: the WGS84 globe,
terrain/imagery streaming, level-of-detail, and planet-scale precision. We feed
it free data.

### Data-source abstraction (swappable providers)

Every provider is chosen by a string id in [`src/config.js`](src/config.js) and
resolved in [`src/dataSources.js`](src/dataSources.js). **No provider is
hardcoded deep in the app** — if one goes down or rate-limits, change the id (or
use the URL query param) and everything else keeps working.

You can switch providers live via the URL:

- `?terrain=arcgis` (default) · `ion-world` · `ellipsoid`
- `?imagery=sentinel2` (default) · `esri` · `osm`

### The free data stack

| Layer       | Default (keyless)                                   | Alternatives                          |
| ----------- | --------------------------------------------------- | ------------------------------------- |
| Engine      | CesiumJS (Apache-2.0)                               | —                                     |
| Terrain     | Esri WorldElevation3D (keyless LERC)                | Cesium World Terrain (free ion token) |
| Imagery     | EOX Sentinel-2 cloudless (~10m, keyless)            | Esri World Imagery · OSM raster       |
| _Phase 2+_  | OpenStreetMap (buildings, roads, water, land use)   | Overpass API · OSM vector tiles       |
| _Phase 1+_  | Nominatim geocoding (keyless)                       | —                                     |

The default configuration is **fully keyless**. An optional free
[Cesium ion](https://cesium.com/ion/) token unlocks higher-quality terrain and
global OSM buildings; set it via `.env` (`VITE_CESIUM_ION_TOKEN`, see
[`.env.example`](.env.example)). The app degrades gracefully without it.

**Good-citizen behavior:** these are free, rate-limited public services. Cesium
caches tiles and fetches only what the camera needs. Later phases add explicit
back-off and per-region fetching for the Overpass / Nominatim APIs.

## Deployment (GitHub Pages)

Pushing to the configured branch triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds and
publishes `dist/` to GitHub Pages. Enable Pages → "GitHub Actions" in the repo
settings once.

The Vite `base` is **relative (`./`)**, so the build works under any repo path
(`/world/`), a custom domain, or a fork — and it sidesteps the most common
Cesium-on-static-hosting bug (Cesium's Workers/Assets are copied to `dist/cesium/`
and referenced relative to the page, so they always resolve).

## Attribution & licenses

Attribution is mandatory and always visible via Cesium's built-in credit display.
**Never strip it** — it is what keeps the app legal and free.

- **CesiumJS** — Apache License 2.0
- **Esri WorldElevation3D / World Imagery** — © Esri, Maxar, Earthstar Geographics; free for use with attribution
- **Sentinel-2 cloudless** — by EOX IT Services GmbH; contains modified Copernicus Sentinel data ([s2maps.eu](https://s2maps.eu)); CC BY-NC-SA 4.0 with attribution
- **OpenStreetMap** — © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)

## Roadmap

- **Phase 0 — Globe & free data stack** ✅
- **Phase 1 — Navigate & visit places** (Nominatim search, fly-to, shareable URLs, bookmarks)
- **Phase 2 — World detail** (3D buildings, OSM roads/water/land use, procedural trees)
- **Phase 3 — Flight** (arcade flight model, HUD)
- **Phase 4 — Driving & sailing**
- **Phase 5 — Living world** (time, weather, ambient life, audio)
- **Phase 6 — Hardening & ship** (resilience, performance, free-usage hygiene)
