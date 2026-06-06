/**
 * Resilience: never let a flaky free service break the app.
 *
 * Imagery providers occasionally go down or rate-limit. We watch the active
 * layer's error rate and, if a provider appears to be failing wholesale (errors
 * climbing fast with no recovery), automatically switch to the next free
 * provider in the chain. Occasional single-tile 404s are ignored.
 */
import { createImageryProvider } from '../dataSources.js';
import { config } from '../config.js';
import { toast } from './../ui/toast.js';

const CHAIN = ['sentinel2', 'esri', 'osm'];

export function installImageryResilience(viewer) {
  const tried = new Set();
  let currentId = config.imagery;
  tried.add(currentId);

  let errorCount = 0;
  let lastChecked = 0;

  function attach() {
    const layer = viewer.imageryLayers.get(0);
    if (!layer) return;
    errorCount = 0;
    lastChecked = 0;
    layer.imageryProvider.errorEvent.addEventListener(() => {
      errorCount++;
    });
  }

  function nextId() {
    for (const id of CHAIN) if (!tried.has(id)) return id;
    return null;
  }

  function switchProvider() {
    const id = nextId();
    if (!id) return; // exhausted — leave as-is rather than thrash
    tried.add(id);
    currentId = id;
    const { provider, name } = createImageryProvider(id);
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(provider);
    toast(`Imagery source switched to ${name} (previous was unavailable).`, { type: 'warn' });
    attach();
  }

  attach();

  // Poll the error rate. A healthy provider produces few errors between checks;
  // a dead one keeps piling them up.
  setInterval(() => {
    const delta = errorCount - lastChecked;
    lastChecked = errorCount;
    if (delta > 14) switchProvider();
  }, 2500);
}

/** Catch otherwise-unhandled failures so a single bad fetch never white-screens. */
export function installGlobalGuards() {
  let warned = false;
  const note = () => {
    if (warned) return;
    warned = true;
    toast('A background request failed — retrying as needed.', { type: 'warn' });
    setTimeout(() => (warned = false), 10_000);
  };
  window.addEventListener('unhandledrejection', (e) => {
    console.warn('[guard] unhandled rejection', e.reason);
    note();
    e.preventDefault();
  });
  window.addEventListener('error', (e) => {
    // Resource (img/tile) load errors bubble here; swallow quietly.
    if (e?.target && e.target !== window) {
      e.preventDefault?.();
    }
  }, true);
}
