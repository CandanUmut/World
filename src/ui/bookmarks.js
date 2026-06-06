/**
 * Saved places (bookmarks), persisted in localStorage. Each bookmark stores a
 * full camera view so reopening it restores the exact framing.
 */
import { Cartesian3, Math as CesiumMath } from 'cesium';
import { getCameraView, buildShareUrl } from '../util/viewState.js';
import { toast } from './toast.js';

const STORAGE_KEY = 'realEarth.bookmarks.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function createBookmarks(viewer) {
  let list = load();

  const panel = document.createElement('div');
  panel.id = 'bookmarksPanel';
  panel.className = 'panel';
  panel.hidden = true;
  document.body.appendChild(panel);

  const toggle = document.createElement('button');
  toggle.id = 'bookmarksToggle';
  toggle.className = 'icon-btn';
  toggle.title = 'Saved places';
  toggle.innerHTML = '★';
  document.body.appendChild(toggle);

  function flyTo(b) {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(b.lng, b.lat, b.height),
      orientation: {
        heading: CesiumMath.toRadians(b.heading),
        pitch: CesiumMath.toRadians(b.pitch),
        roll: 0,
      },
      duration: 2.5,
    });
  }

  function render() {
    panel.innerHTML = `
      <div class="panel-head">
        <span>Saved places</span>
        <button class="panel-close" title="Close">×</button>
      </div>
      <div class="panel-body"></div>
      <div class="panel-foot">
        <button id="bmAdd" class="btn-primary">＋ Save current view</button>
        <button id="bmShare" class="btn">Copy share link</button>
      </div>`;
    const body = panel.querySelector('.panel-body');
    if (!list.length) {
      body.innerHTML = '<p class="muted">No saved places yet. Fly somewhere and save it.</p>';
    } else {
      list.forEach((b, i) => {
        const row = document.createElement('div');
        row.className = 'bm-row';
        row.innerHTML = `<button class="bm-go" title="Fly here">${escapeHtml(b.name)}</button>
                         <button class="bm-del" title="Delete">×</button>`;
        row.querySelector('.bm-go').addEventListener('click', () => flyTo(b));
        row.querySelector('.bm-del').addEventListener('click', () => {
          list.splice(i, 1);
          save(list);
          render();
        });
        body.appendChild(row);
      });
    }
    panel.querySelector('.panel-close').addEventListener('click', () => (panel.hidden = true));
    panel.querySelector('#bmAdd').addEventListener('click', addCurrent);
    panel.querySelector('#bmShare').addEventListener('click', shareCurrent);
  }

  function addCurrent() {
    const view = getCameraView(viewer);
    const name = prompt('Name this place:', defaultName(view));
    if (!name) return;
    list.unshift({ name: name.trim(), ...roundView(view) });
    save(list);
    render();
    toast('Saved.', { type: 'info', duration: 1600 });
  }

  async function shareCurrent() {
    const url = buildShareUrl(getCameraView(viewer));
    try {
      await navigator.clipboard.writeText(url);
      toast('Share link copied to clipboard.', { type: 'info' });
    } catch {
      // Clipboard may be blocked; show the URL so the user can copy manually.
      prompt('Copy this share link:', url);
    }
  }

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });

  render();
  return { addCurrent, shareCurrent };
}

function roundView(v) {
  const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    lng: r(v.lng, 6),
    lat: r(v.lat, 6),
    height: r(v.height, 1),
    heading: r(v.heading, 1),
    pitch: r(v.pitch, 1),
  };
}
function defaultName(v) {
  return `${v.lat.toFixed(3)}, ${v.lng.toFixed(3)}`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
