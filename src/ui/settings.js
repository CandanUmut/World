/**
 * Settings panel: audio, time-of-day & weather, ambient life, render quality,
 * and a read-out of the active free data sources (with the swap-by-URL hint).
 */
import { audio } from '../audio/audio.js';

const QUALITY = {
  low: { resolutionScale: 0.6, fxaa: false, sse: 8 },
  medium: { resolutionScale: 1.0, fxaa: true, sse: 2 },
  high: { resolutionScale: Math.min(window.devicePixelRatio || 1, 2), fxaa: true, sse: 1.5 },
};

function applyQuality(viewer, level) {
  const q = QUALITY[level] || QUALITY.medium;
  viewer.resolutionScale = q.resolutionScale;
  if (viewer.scene.postProcessStages?.fxaa) viewer.scene.postProcessStages.fxaa.enabled = q.fxaa;
  viewer.scene.globe.maximumScreenSpaceError = q.sse;
  localStorage.setItem('realEarth.quality', level);
}

export function createSettings(viewer, environment, birds, sources = {}) {
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
  const defaultQuality = localStorage.getItem('realEarth.quality') || (isMobile ? 'low' : 'high');
  applyQuality(viewer, defaultQuality);

  const toggle = document.createElement('button');
  toggle.id = 'settingsToggle';
  toggle.className = 'icon-btn';
  toggle.title = 'Settings';
  toggle.innerHTML = '⚙';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'settingsPanel';
  panel.className = 'panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="panel-head"><span>Settings</span><button class="panel-close" title="Close">×</button></div>
    <div class="panel-body">
      <div class="set-group">
        <label class="set-row"><span>Sound</span>
          <input type="checkbox" id="setMute" ${audio.muted ? '' : 'checked'} /></label>
      </div>

      <div class="set-group">
        <div class="set-title">Time of day</div>
        <input type="range" id="setTime" min="0" max="24" step="0.25" value="13" />
        <label class="set-row"><span>Day/night cycle</span>
          <input type="checkbox" id="setCycle" /></label>
      </div>

      <div class="set-group">
        <div class="set-title">Weather</div>
        <div class="seg" id="setWeather">
          <button data-w="clear" class="active">Clear</button>
          <button data-w="cloudy">Cloudy</button>
          <button data-w="rain">Rain</button>
        </div>
      </div>

      <div class="set-group">
        <label class="set-row"><span>Ambient birds</span>
          <input type="checkbox" id="setBirds" checked /></label>
      </div>

      <div class="set-group">
        <div class="set-title">Quality</div>
        <div class="seg" id="setQuality">
          <button data-q="low">Low</button>
          <button data-q="medium">Medium</button>
          <button data-q="high">High</button>
        </div>
      </div>

      <div class="set-group set-sources">
        <div class="set-title">Data sources (all free)</div>
        <div class="muted">Terrain: ${escapeHtml(sources.terrainName || '—')}</div>
        <div class="muted">Imagery: ${escapeHtml(sources.imageryName || '—')}</div>
        <div class="muted">Buildings/roads/trees: OpenStreetMap · Search: Nominatim</div>
        <div class="muted">Swap any provider with <code>?terrain=</code> / <code>?imagery=</code> in the URL.</div>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const $ = (s) => panel.querySelector(s);

  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));
  $('.panel-close').addEventListener('click', () => (panel.hidden = true));

  $('#setMute').addEventListener('change', (e) => audio.setMuted(!e.target.checked));

  $('#setTime').addEventListener('input', (e) => {
    $('#setCycle').checked = false;
    environment.setDayCycle(false);
    environment.setTimeOfDay(parseFloat(e.target.value));
  });
  $('#setCycle').addEventListener('change', (e) => environment.setDayCycle(e.target.checked));

  segmented($('#setWeather'), 'w', (w) => environment.setWeather(w));
  segmented($('#setQuality'), 'q', (q) => applyQuality(viewer, q), defaultQuality);

  $('#setBirds').addEventListener('change', (e) => birds.setEnabled(e.target.checked));

  // Apply an initial time so lighting looks good on load.
  environment.setTimeOfDay(13);

  if (isMobile) {
    panel.querySelector('.set-sources').insertAdjacentHTML(
      'beforebegin',
      '<div class="muted" style="margin:6px 4px">Mobile detected — quality set to Low for smooth performance.</div>',
    );
  }
}

function segmented(container, attr, onChange, initial) {
  const buttons = [...container.querySelectorAll('button')];
  if (initial) {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset[attr] === initial));
  }
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    buttons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    onChange(btn.dataset[attr]);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
