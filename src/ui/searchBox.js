/**
 * Place search UI. Keyless Nominatim search → animated fly-to.
 * Handles rate limits and no-results gracefully.
 */
import { Rectangle, Cartesian3, Math as CesiumMath } from 'cesium';
import { searchPlaces } from '../services/geocoding.js';
import { debounce } from '../util/throttle.js';
import { toast } from './toast.js';

/**
 * Fly the camera to a search result. Uses the bounding box to frame the place
 * when available, otherwise a sensible altitude above the point.
 */
export function flyToPlace(viewer, place, { duration = 3 } = {}) {
  if (place.bbox) {
    const [south, north, west, east] = place.bbox;
    // Pad the rectangle a touch and tilt slightly for a nicer arrival.
    const rect = Rectangle.fromDegrees(west, south, east, north);
    viewer.camera.flyTo({
      destination: rect,
      duration,
      complete: () => tilt(viewer),
    });
  } else {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(place.lng, place.lat, 4000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
      duration,
    });
  }
}

// Gentle tilt after arriving at a top-down rectangle so it doesn't feel flat.
function tilt(viewer) {
  const c = viewer.camera;
  c.flyTo({
    destination: c.positionWC,
    orientation: { heading: c.heading, pitch: CesiumMath.toRadians(-55), roll: 0 },
    duration: 1.2,
  });
}

export function createSearchBox(viewer) {
  const wrap = document.createElement('div');
  wrap.id = 'searchBox';
  wrap.innerHTML = `
    <div class="search-row">
      <input id="searchInput" type="text" autocomplete="off" spellcheck="false"
             placeholder="Search any place — e.g. Mount Fuji" aria-label="Search places" />
      <button id="searchClear" title="Clear" aria-label="Clear" hidden>×</button>
    </div>
    <ul id="searchResults" role="listbox"></ul>
  `;
  document.body.appendChild(wrap);

  const input = wrap.querySelector('#searchInput');
  const clearBtn = wrap.querySelector('#searchClear');
  const list = wrap.querySelector('#searchResults');

  let activeController = null;
  let results = [];
  let highlighted = -1;

  function renderResults() {
    list.innerHTML = '';
    if (!results.length) {
      list.classList.remove('open');
      return;
    }
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.role = 'option';
      li.className = i === highlighted ? 'highlight' : '';
      li.innerHTML = `<span class="r-name">${escapeHtml(primaryName(r.name))}</span>
                      <span class="r-sub">${escapeHtml(secondaryName(r.name))}</span>`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(i);
      });
      list.appendChild(li);
    });
    list.classList.add('open');
  }

  function choose(i) {
    const place = results[i];
    if (!place) return;
    input.value = primaryName(place.name);
    results = [];
    highlighted = -1;
    renderResults();
    flyToPlace(viewer, place);
  }

  const run = debounce(async (q) => {
    if (activeController) activeController.abort();
    activeController = new AbortController();
    try {
      results = await searchPlaces(q, { signal: activeController.signal });
      highlighted = -1;
      if (!results.length) {
        list.innerHTML = '<li class="empty">No places found.</li>';
        list.classList.add('open');
      } else {
        renderResults();
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      toast(err.message || 'Search failed.', { type: 'warn' });
    }
  }, 450);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.hidden = q.length === 0;
    if (q.length < 2) {
      results = [];
      renderResults();
      return;
    }
    run(q);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      highlighted = Math.min(highlighted + 1, results.length - 1);
      renderResults();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      highlighted = Math.max(highlighted - 1, 0);
      renderResults();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      choose(highlighted >= 0 ? highlighted : 0);
    } else if (e.key === 'Escape') {
      input.blur();
      results = [];
      renderResults();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    results = [];
    renderResults();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      results = [];
      renderResults();
    }
  });

  return { focus: () => input.focus() };
}

// Nominatim returns "Eiffel Tower, Paris, France" — split head from tail.
function primaryName(displayName) {
  return displayName.split(',')[0];
}
function secondaryName(displayName) {
  return displayName.split(',').slice(1).join(',').trim();
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
