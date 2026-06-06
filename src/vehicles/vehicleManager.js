/**
 * Owns the active vehicle: spawns it on the real surface (async terrain sample),
 * runs the per-frame update loop, drives the visual mesh, the chase/cockpit
 * camera and the HUD, and handles getting in/out. Vehicle types plug in via a
 * small common interface.
 */
import { Cartesian3, Cartographic, Matrix4, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { forwardVector, upVector, localToWorld } from './frame.js';
import { createBoxMesh } from './mesh.js';
import { createHud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { audio } from '../audio/audio.js';
import { groundHeightDetailed, groundHeightSync } from '../world/heights.js';

const HINTS = {
  Walk: 'W/S walk · ←→ turn · A/D strafe · Shift run · C camera · V exit',
  Plane: 'W/S throttle · ↑↓ pitch · ←→ roll · A/D rudder · C camera · V exit',
  Car: 'W/S accel/brake · ←→ steer · C camera · V exit',
  Ship: 'W/S throttle · ←→ steer · C camera · V exit',
};

export function createVehicleManager(viewer) {
  const { scene } = viewer;
  const hud = createHud();

  let vehicle = null;
  let mesh = null;
  let cameraMode = 'chase';
  let lastTime = 0;
  let spawning = false;
  const smoothCamPos = new Cartesian3();
  let haveSmooth = false;

  async function enter(VehicleClass) {
    if (vehicle || spawning) return;
    spawning = true;
    try {
      // Spawn point = ground under the current camera.
      const camCarto = viewer.camera.positionCartographic;
      let lon = CesiumMath.toDegrees(camCarto.longitude);
      let lat = CesiumMath.toDegrees(camCarto.latitude);
      const heading = viewer.camera.heading;

      toast('Descending to the surface…', { duration: 1500 });

      // Vehicle-specific spawn adjustment (e.g. Ship looks for water).
      if (VehicleClass.findSpawn) {
        const better = await VehicleClass.findSpawn(scene, lon, lat);
        if (better) {
          lon = better.lon;
          lat = better.lat;
        } else if (VehicleClass.label === 'Ship') {
          toast('No water found nearby — try near a coast, lake or river.', { type: 'warn' });
        }
      }

      // Await the TRUE ground elevation (tiles loaded) before placing anything.
      // This is the fix for vehicles spawning underground.
      const ground = await groundHeightDetailed(scene, lon, lat);
      const position = Cartesian3.fromDegrees(lon, lat, ground + (VehicleClass.SPAWN_AGL ?? 0));

      vehicle = new VehicleClass({ position, heading });
      mesh = createBoxMesh(vehicle.meshBoxes());
      scene.primitives.add(mesh);
      cameraMode = vehicle.defaultCamera || 'chase';

      // Smoothly descend the camera to the start view, then hand over control.
      await descendTo();

      input.setActive(true);
      scene.screenSpaceCameraController.enableInputs = false;
      haveSmooth = false;
      hud.show(vehicle.label, HINTS[vehicle.label] || '');
      audio.blip();
      audio.engineOn(vehicle.label);
      toast(`Entered ${vehicle.label}. Press V to exit.`, { duration: 2400 });

      lastTime = performance.now();
      scene.preRender.addEventListener(tick);
    } finally {
      spawning = false;
    }
  }

  function descendTo() {
    const M = vehicle.modelMatrixRef;
    const fwd = forwardVector(M, new Cartesian3());
    const up = upVector(M, new Cartesian3());
    const params = vehicle.cameraParams();
    const camPos =
      cameraMode === 'cockpit'
        ? localToWorld(M, params.cockpit.x, params.cockpit.y, params.cockpit.z, new Cartesian3())
        : localToWorld(M, -params.chase.back, 0, params.chase.up, new Cartesian3());
    return new Promise((resolve) => {
      viewer.camera.flyTo({
        destination: camPos,
        orientation: { direction: fwd, up },
        duration: 1.3,
        complete: resolve,
        cancel: resolve,
      });
    });
  }

  function tick() {
    if (!vehicle) return;
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    if (dt <= 0) return;

    vehicle.update(dt, scene);
    mesh.modelMatrix = Matrix4.clone(vehicle.modelMatrixRef, mesh.modelMatrix);
    updateCamera(dt);
    const data = vehicle.hud(scene);
    hud.update(data);
    audio.updateEngine(data);
  }

  function updateCamera(dt) {
    const M = vehicle.modelMatrixRef;
    const fwd = forwardVector(M, new Cartesian3());
    const up = upVector(M, new Cartesian3());
    const params = vehicle.cameraParams();

    if (cameraMode === 'cockpit') {
      const c = params.cockpit;
      const camPos = localToWorld(M, c.x, c.y, c.z, new Cartesian3());
      haveSmooth = false;
      viewer.camera.setView({ destination: camPos, orientation: { direction: fwd, up } });
      return;
    }

    // Chase: behind (-X) and above (+Z) in body frame, smoothed.
    const ch = params.chase;
    const target = localToWorld(M, -ch.back, 0, ch.up, new Cartesian3());
    if (!haveSmooth) {
      Cartesian3.clone(target, smoothCamPos);
      haveSmooth = true;
    } else {
      Cartesian3.lerp(smoothCamPos, target, Math.min(dt * 6, 1), smoothCamPos);
    }
    clampAboveGround(smoothCamPos);
    viewer.camera.setView({ destination: smoothCamPos, orientation: { direction: fwd, up } });
  }

  // Keep the chase camera from clipping below hills.
  function clampAboveGround(pos) {
    const carto = Cartographic.fromCartesian(pos);
    const g = groundHeightSync(scene, carto);
    if (g != null && carto.height < g + 2) {
      carto.height = g + 2;
      Cartographic.toCartesian(carto, pos);
    }
  }

  function exit() {
    if (!vehicle) return;
    const lastPos = vehicle.position;
    scene.preRender.removeEventListener(tick);
    scene.primitives.remove(mesh);
    mesh = null;
    vehicle = null;

    input.setActive(false);
    scene.screenSpaceCameraController.enableInputs = true;
    hud.hide();
    audio.engineOff();

    const carto = Cartographic.fromCartesian(lastPos);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        CesiumMath.toDegrees(carto.longitude),
        CesiumMath.toDegrees(carto.latitude),
        carto.height + 600,
      ),
      orientation: { heading: viewer.camera.heading, pitch: CesiumMath.toRadians(-35), roll: 0 },
      duration: 1.5,
    });
  }

  function toggleCamera() {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    haveSmooth = false;
  }

  window.addEventListener('keydown', (e) => {
    if (!vehicle) return;
    if (e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyC') toggleCamera();
    else if (e.code === 'KeyV' || e.code === 'Escape') exit();
  });

  return {
    enter,
    exit,
    isActive: () => vehicle != null,
    current: () => vehicle?.label ?? null,
  };
}
