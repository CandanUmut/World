import './style.css';
import * as THREE from 'three';
import { config } from './config.js';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { FloatingOrigin } from './core/floatingOrigin.js';
import { createFreeCamera } from './camera/freeCamera.js';
import { createChaseCamera } from './camera/chaseCamera.js';
import { createOverlay } from './ui/overlay.js';
import { createMinimap } from './ui/minimap.js';
import { createLabels } from './ui/labels.js';
import { createAudio } from './ui/audio.js';
import { createTileStreamer } from './data/tileStreamer.js';
import { createCityTiles } from './world/cityTiles.js';
import { createCollision } from './world/collision.js';
import { createSignals } from './world/signals.js';
import { createTraffic } from './world/traffic.js';
import { createPedestrians } from './world/pedestrians.js';
import { createCar } from './vehicle/car.js';
import { createPlane } from './vehicle/plane.js';
import { createShip } from './vehicle/ship.js';

const { renderer, scene, camera, composer, setTimeOfDay } = createEngine();
const input = createInput(renderer.domElement);
const overlay = createOverlay();
const minimap = createMinimap();
const audio = createAudio();

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
const collision = createCollision();
const cityTiles = createCityTiles(scene, origin, collision);
const streamer = createTileStreamer({
  url: config.pmtilesUrl,
  z: STREAM_Z,
  onTile: (msg) => cityTiles.addTile(msg),
  onDrop: (key) => cityTiles.dropTile(key),
  onReady: () => console.log('[tiles] archive ready'),
});

// --- Living city (Phase 6): traffic lights, ambient cars, pedestrians ---
const signals = createSignals(scene, cityTiles);
const traffic = createTraffic(scene, cityTiles, signals);
const pedestrians = createPedestrians(scene, cityTiles);
const labels = createLabels(camera, cityTiles);

// --- Vehicles: car (Phase 4) + plane + ship, swap with V ---
const car = createCar(7);
const plane = createPlane();
const ship = createShip();
const vehicles = [car, plane, ship];
const VEHICLE_NAMES = ['car', 'plane', 'ship'];
for (const v of vehicles) { scene.add(v.group); v.setPose(0, 0, Math.PI); }
plane.group.visible = false;
ship.group.visible = false;
let vIdx = 0;
const vehicle = () => vehicles[vIdx];

// --- Cameras ---
const chase = createChaseCamera(camera, car);
const fly = createFreeCamera(camera, input);                       // free fly
const walk = createFreeCamera(camera, input, { baseSpeed: 9, lockY: 1.8 }); // street walk
const tmpFwd = new THREE.Vector3();

const MODES = ['chase', 'cockpit', 'free', 'walk'];
let modeIdx = 0;
const mode = () => MODES[modeIdx];
const isDriving = () => mode() === 'chase' || mode() === 'cockpit';

const TIME_HELP = ' · <b>[ ]</b> time · <b>T</b> auto';
const HELP = {
  chase: '<b>Drive</b> · W/S accel/brake · A/D steer · Space drift · <b>C</b> cam · <b>M</b> map · <b>V</b> vehicle' + TIME_HELP,
  cockpit: '<b>Cockpit</b> · W/S accel/brake · A/D steer · Space drift · <b>C</b> cam · <b>V</b> vehicle' + TIME_HELP,
  free: '<b>Fly cam</b> · WASD move · Q/E down/up · drag look · Shift boost · <b>C</b> cam' + TIME_HELP,
  walk: '<b>Walk</b> · WASD move · drag look · Shift jog · <b>C</b> cam' + TIME_HELP,
};

function enterMode() {
  const m = mode();
  const v = vehicle();
  if (m === 'chase' || m === 'cockpit') {
    chase.setMode(m);
  } else if (m === 'free') {
    v.forward(tmpFwd);
    const p = v.position;
    camera.position.set(p.x - tmpFwd.x * 14, p.y + 8, p.z - tmpFwd.z * 14);
    fly.setLook(v.heading, -0.32);
  } else if (m === 'walk') {
    v.forward(tmpFwd);
    const p = v.position;
    camera.position.set(p.x + tmpFwd.z * 3, 1.8, p.z - tmpFwd.x * 3);
    walk.setLook(v.heading - 0.4, -0.03);
  }
  overlay.setHelp(HELP[m]);
}

function switchVehicle() {
  const cur = vehicle();
  const px = cur.position.x, pz = cur.position.z, h = cur.heading;
  cur.group.visible = false;
  vIdx = (vIdx + 1) % vehicles.length;
  const next = vehicle();
  next.setPose(px, pz, h);
  next.group.visible = true;
  chase.setTarget(next);
}

// Time of day: 0 = midnight, 0.5 = noon. Start late afternoon so dusk is near.
let tod = 0.62;
let autoCycle = true;
const DAY_LENGTH = 180; // seconds for a full cycle when auto

// --- UI controls: place picker + time slider ---
const gotoEl = document.getElementById('goto');
if (gotoEl) gotoEl.addEventListener('change', () => {
  const val = gotoEl.value;
  if (!val) return;
  const [lon, lat] = val.split(',');
  location.href = `?lon=${lon}&lat=${lat}`;
});
const timeSlider = document.getElementById('time-slider');
if (timeSlider) timeSlider.addEventListener('input', () => {
  tod = Number(timeSlider.value) / 1000;
  autoCycle = false;
});

// Edge-triggered hotkeys.
let cHeld = false, mHeld = false, tHeld = false, vHeld = false, pHeld = false;
function handleHotkeys(dt) {
  const c = input.down('KeyC');
  if (c && !cHeld) { modeIdx = (modeIdx + 1) % MODES.length; enterMode(); }
  cHeld = c;
  const v = input.down('KeyV');
  if (v && !vHeld) { switchVehicle(); enterMode(); }
  vHeld = v;
  const m = input.down('KeyM');
  if (m && !mHeld) minimap.toggle();
  mHeld = m;
  const t = input.down('KeyT');
  if (t && !tHeld) autoCycle = !autoCycle;
  tHeld = t;
  const p = input.down('KeyP');
  if (p && !pHeld) audio.toggleMute();
  pHeld = p;
  // Scrub time with [ and ].
  if (input.down('BracketLeft')) { tod = (tod - dt * 0.06 + 1) % 1; }
  if (input.down('BracketRight')) { tod = (tod + dt * 0.06) % 1; }
}

function fmtTime(t) {
  const mins = Math.floor(t * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Re-anchor streaming + keep camera framing and dynamic entities continuous
// across rebases.
origin.onRebase((dx, dz) => {
  streamUpdate.force = true;
  chase.shift(dx, dz);
  signals.onRebase(dx, dz);
  traffic.onRebase(dx, dz);
  pedestrians.onRebase(dx, dz);
});

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

function gearOf() {
  const f = vehicle().forwardSpeed;
  if (f > 0.6) return 'D';
  if (f < -0.6) return 'R';
  return 'N';
}

enterMode();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  handleHotkeys(dt);

  if (autoCycle) tod = (tod + dt / DAY_LENGTH) % 1;
  const night = setTimeOfDay(tod);
  cityTiles.setNight(night);
  if (timeSlider && autoCycle) timeSlider.value = String(Math.round(tod * 1000));

  if (isDriving()) vehicle().update(dt, input, collision);

  const m = mode();
  if (m === 'chase' || m === 'cockpit') chase.update(dt);
  else if (m === 'free') fly.update(dt);
  else walk.update(dt);

  // Focus everything (rebase, streaming) on whoever is being controlled.
  const focus = isDriving() ? vehicle().position : camera.position;
  origin.maybeRebase(focus.x, focus.z, [car.group, plane.group, ship.group, camera]);

  const ll = origin.toLonLat(focus.x, focus.z);
  maybeStream(ll.lon, ll.lat, dt);

  // Living city updates around the player.
  signals.update(dt, focus.x, focus.z);
  traffic.update(dt, focus.x, focus.z);
  pedestrians.update(dt, focus.x, focus.z);

  const s = streamer.stats();
  const v = vehicle();
  overlay.setSpeed(v.speedKmh, gearOf());
  const alt = vIdx === 1 ? `  ·  alt ${v.altitude.toFixed(0)} m` : '';
  overlay.setLocation(
    `lat ${ll.lat.toFixed(5)}  lon ${ll.lon.toFixed(5)}\n` +
    `${fmtTime(tod)} ${autoCycle ? '↻' : '·'}  ·  ${VEHICLE_NAMES[vIdx]}${alt}  ·  ${m}  ·  tiles ${cityTiles.count} (${s.pending})`,
  );
  minimap.update(dt, collision, v);
  labels.update();
  audio.setEngine(Math.min(v.speed / 40, 1));

  composer.render();
  overlay.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (config.debug) {
  window.__world = { scene, camera, renderer, origin, streamer, cityTiles, collision, vehicles, chase, traffic, signals, THREE };
}
