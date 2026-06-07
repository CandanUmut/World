import './style.css';
import * as THREE from 'three';
import { config } from './config.js';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { FloatingOrigin } from './core/floatingOrigin.js';
import { createFreeCamera } from './camera/freeCamera.js';
import { createOverlay } from './ui/overlay.js';
import { createGroundGrid } from './world/groundGrid.js';

const { renderer, scene, camera } = createEngine();
const input = createInput(renderer.domElement);
const overlay = createOverlay();

// Floating origin anchored at the start location. Streamed content (Phase 1+)
// will register with this so the world stays centered on the player.
const origin = new FloatingOrigin(config.start.lon, config.start.lat, config.rebaseThreshold);

// Phase 0 placeholder world.
const ground = origin.track(createGroundGrid());
scene.add(ground);

const cam = createFreeCamera(camera, input);

const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  cam.update(dt);

  // Keep the world centered on the camera while we have no vehicle yet.
  origin.maybeRebase(camera.position.x, camera.position.z, [camera]);

  const ll = origin.toLonLat(camera.position.x, camera.position.z);
  overlay.setLocation(
    `lat ${ll.lat.toFixed(5)}  lon ${ll.lon.toFixed(5)}\nalt ${camera.position.y.toFixed(0)} m`,
  );

  renderer.render(scene, camera);
  overlay.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for console debugging.
if (config.debug) {
  window.__world = { scene, camera, renderer, origin, THREE };
}
