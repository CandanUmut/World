import './style.css';
import * as THREE from 'three';
import { config } from './config.js';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { FloatingOrigin } from './core/floatingOrigin.js';
import { createFreeCamera } from './camera/freeCamera.js';
import { createOverlay } from './ui/overlay.js';
import { createTileStreamer } from './data/tileStreamer.js';
import { createCityTiles } from './world/cityTiles.js';

const { renderer, scene, camera } = createEngine();
const input = createInput(renderer.domElement);
const overlay = createOverlay();

// Floating origin anchored at the start location.
const origin = new FloatingOrigin(config.start.lon, config.start.lat, config.rebaseThreshold);

// A neutral base ground so gaps between land-use fills read as urban ground.
const ground = origin.track(new THREE.Mesh(
  new THREE.PlaneGeometry(20000, 20000),
  new THREE.MeshStandardMaterial({ color: 0x8f928c, roughness: 1 }),
));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

// --- Procedural city tiles (Phase 1 stream + Phase 2 geometry) ---
const STREAM_Z = 14; // PMTiles maxzoom; buildings + roads present here
const cityTiles = createCityTiles(scene, origin);
const streamer = createTileStreamer({
  url: config.pmtilesUrl,
  z: STREAM_Z,
  onTile: (msg) => cityTiles.addTile(msg),
  onDrop: (key) => cityTiles.dropTile(key),
  onReady: () => console.log('[tiles] archive ready'),
});

// Re-anchor tile streaming on rebase is automatic (geography-based).
origin.onRebase(() => { streamUpdate.force = true; });

// Survey camera start, looking down at the streets.
camera.position.set(0, 350, 350);
const cam = createFreeCamera(camera, input);

const clock = new THREE.Clock();

// Throttle streaming updates.
const streamUpdate = { t: 0, force: true };
function maybeStream(lon, lat, dt) {
  streamUpdate.t -= dt;
  if (streamUpdate.t > 0 && !streamUpdate.force) return;
  streamUpdate.t = 0.25;
  streamUpdate.force = false;
  streamer.update(lon, lat, config.tileRadius);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  cam.update(dt);
  origin.maybeRebase(camera.position.x, camera.position.z, [camera]);

  const ll = origin.toLonLat(camera.position.x, camera.position.z);
  maybeStream(ll.lon, ll.lat, dt);

  const s = streamer.stats();
  overlay.setLocation(
    `lat ${ll.lat.toFixed(5)}  lon ${ll.lon.toFixed(5)}\n` +
    `alt ${camera.position.y.toFixed(0)} m  ·  tiles ${cityTiles.count} (${s.pending} loading)`,
  );

  renderer.render(scene, camera);
  overlay.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (config.debug) {
  window.__world = { scene, camera, renderer, origin, streamer, cityTiles, cam, THREE };
}
