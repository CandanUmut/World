# World — a stylized, real-world simulation from OpenStreetMap

A browser world whose **structure is the real world** — real buildings, roads,
water, trees and terrain from **OpenStreetMap** — rendered in a crisp, stylized
"old-game" look you can freely **walk, drive, sail and fly** through. Free for
everyone, static-hostable on GitHub Pages, using only free/open data (OSM + free
terrain). No Google, no paid APIs. Built on [CesiumJS](https://cesium.com/platform/cesiumjs/).

> **Why stylized?** Earlier versions draped ~10m satellite imagery (permanently
> blurry) and streamed OSM live from Overpass (slow, rate-limited, "never
> loads"). We now render the world as **geometry** — crisp at any distance — fed
> by **fast vector tiles**. Imagery and live-Overpass are no longer the look or
> the pipeline.

## Controls

- **Search** (top) — type a place, fly there. **📍** famous places · **★** saved
  places · **⚙** settings (sound, time of day, weather, quality).
- **Move** (bottom bar): Walk / Plane / Car / Ship — get in at your current spot.
  - **Walk:** `W`/`S` walk · `←`/`→` turn · `A`/`D` strafe · `Shift` run
  - **Plane:** `W`/`S` throttle · `↑`/`↓` pitch · `←`/`→` roll · `A`/`D` rudder
  - **Car:** `W`/`S` accel/brake · `←`/`→` steer
  - **Ship:** `W`/`S` throttle · `←`/`→` steer
  - `C` chase/cockpit camera · `V` or `Esc` to exit.

## Quick start

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Out of the box (no data configured) the app renders stylized terrain and uses
the slow **Overpass fallback** for a small area around you. For the real
experience — fast geometry you can roam — point it at a **vector-tile source**
(below).

## How it works

CesiumJS provides the free WGS84 globe, real terrain streaming, level-of-detail
and planet-scale precision. We render OSM **geometry** on top:

- **Stylized base ground** — no satellite imagery. The globe is a flat-shaded
  base color, lit by the sun, shaped by real terrain (with a slight vertical
  exaggeration), painted by **OSM land use** (greens for parks/forest/grass, tan
  for farmland, gray for urban) as draped polygons.
- **Buildings** — OSM footprints extruded by `height`/levels, blocky and
  per-building color-varied.
- **Roads** — ground-clamped ribbons, width/color by class.
- **Water** — lakes/rivers/coast as ground-classified polygons.
- **Trees** — billboards scattered into real OSM vegetation polygons, LOD'd.

All of it streams in tiles around the player, pooled and unloaded by distance.
`?mode=imagery` restores the old photoreal base if you ever want it.

### The data pipeline (fast vector tiles)

The world geometry comes from **Mapbox Vector Tiles (MVT)**, read client-side
(`src/services/vectorTiles.js`) and adapted into the existing builders. Choose a
source via config / env (`src/config.js`):

| Source | Config | Roam | Notes |
| --- | --- | --- | --- |
| **PMTiles archive** | `VITE_PMTILES_URL` | within the baked extent | Static file, HTTP range requests. **Recommended.** |
| **XYZ MVT service** | `VITE_MVT_URL` | anywhere the service covers | `https://…/{z}/{x}/{y}.pbf` |
| **Overpass (fallback)** | _(none set)_ | tiny area only | Slow/keyless; a safety net, not the main path. |

Schema: **OpenMapTiles** (what Planetiler produces). The adapter maps its
`building` / `transportation` / `water` / `landcover` / `landuse` / `park`
layers onto OSM tags.

## Roam anywhere: bake & host your own data (free)

The whole planet is too big for a repo, but you can bake an extract — a city, a
country, even a continent — into one **PMTiles** file and host it for free.

### 1. Bake a PMTiles archive with Planetiler

[Planetiler](https://github.com/onthegomap/planetiler) turns an OSM extract into an
OpenMapTiles-schema PMTiles archive:

```bash
# Download a region extract from https://download.geofabrik.de (e.g. a country)
# then (needs Java 21+):
java -Xmx8g -jar planetiler.jar \
  --download --area=monaco \         # or a path to a .osm.pbf you downloaded
  --output=region.pmtiles
```

Swap `--area` for your region. Bigger extents → bigger files and more RAM.

### 2. Host it (range requests required)

PMTiles reads via HTTP **range requests**, so the host must support them:

- **GitHub Releases** — up to **2GB per asset**, range-capable, free. Upload
  `region.pmtiles` as a release asset; the asset URL works directly. Great for a
  country/continent extract.
- **`/public` folder** — drop small archives in `public/` (served at e.g.
  `/world/region.pmtiles`). Watch GitHub's 100MB per-file repo limit.
- **Cloudflare R2 / S3 / Source Cooperative** — for the full planet (~100GB),
  use object storage with range support; point `VITE_PMTILES_URL` at it.

### 3. Point the app at it

```bash
# .env
VITE_PMTILES_URL=https://github.com/<you>/world/releases/download/data/region.pmtiles
```

or at runtime: `?pmtiles=<url>`. That's it — roam the baked region at full speed.

## Deployment (GitHub Pages)

Pushing to the configured branch triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds and
publishes `dist/`. Enable **Settings → Pages → Source: GitHub Actions** once.

The Vite `base` is **relative (`./`)**, so the build works under any repo path,
a custom domain, or a fork — sidestepping the most common Cesium static-hosting
bug (Workers/Assets copied to `dist/cesium/` and referenced relative to the page).

## Attribution & licenses

Attribution is mandatory and always visible via Cesium's credit display.
**Never strip it.**

- **OpenStreetMap** — Map data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). This is the world's structure and the legal basis for the "bake once, self-host" model.
- **CesiumJS** — Apache License 2.0.
- **Terrain** — Esri WorldElevation3D (© Esri, Maxar, Earthstar Geographics) by default; optional Cesium World Terrain with a free ion token.
- **PMTiles / Planetiler / OpenMapTiles schema** — open-source (BSD/Apache); the tiles you bake are OSM data under ODbL.

## Resilience & free-usage hygiene

- **Graceful degradation:** terrain falls back to a flat ellipsoid if its
  provider is down; tile failures are caught and warned (never white-screen);
  Overpass fallback rotates endpoints and backs off.
- **Polite & performant:** capped tile concurrency, nearest-first loading,
  distance-based unload, per-tile caching, quality presets (mobile auto-Low).
- **Optional tokens:** if you add a Cesium ion token, restrict it by
  **referrer/origin**. The app never requires one.

## Re-architecture priorities (this version)

- **P0 — stylized geometry over imagery** ✅ (kills the blur)
- **P1 — vector-tile pipeline (PMTiles/MVT)** ✅ (kills "never loads"; Overpass demoted to fallback)
- **P2 — free-roam & vehicle fixes** ✅ (async terrain spawn, descend transition, walk mode, ship water-find)
- **P3 — stylize & exploring hooks** ✅ (palette, famous-places menu, landmark labels)
- **P4 — free & static hardening** ✅ (bake/host docs, OSM attribution, performance, mobile)
