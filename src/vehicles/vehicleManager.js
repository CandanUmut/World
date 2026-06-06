/**
 * Owns the active vehicle: spawns it, runs the per-frame update loop, drives the
 * visual mesh, the chase/cockpit camera and the HUD, and handles getting in/out.
 * Vehicle types (Plane, Car, Ship) plug in via a small common interface.
 */
import { Cartesian3, Cartographic, Matrix4, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { forwardVector, upVector, localToWorld } from './frame.js';
import { createBoxMesh } from './mesh.js';
import { createHud } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { audio } from '../audio/audio.js';

const HINTS = {
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
  let tickRemover = null;
  const smoothCamPos = new Cartesian3();
  let haveSmooth = false;

  function spawnPosition(spawnAgl) {
    const carto = Cartographic.clone(viewer.camera.positionCartographic);
    const ground = scene.globe.getHeight(carto) ?? 0;
    carto.height = ground + spawnAgl;
    return Cartographic.toCartesian(carto);
  }

  function enter(VehicleClass) {
    if (vehicle) exit();
    const position = spawnPosition(VehicleClass.SPAWN_AGL ?? 0);
    vehicle = new VehicleClass({ position, heading: viewer.camera.heading });

    mesh = createBoxMesh(vehicle.meshBoxes());
    scene.primitives.add(mesh);

    input.setActive(true);
    scene.screenSpaceCameraController.enableInputs = false;
    haveSmooth = false;
    cameraMode = 'chase';
    hud.show(vehicle.label, HINTS[vehicle.label] || '');
    audio.blip();
    audio.engineOn(vehicle.label);
    toast(`Entered ${vehicle.label}. Press V to exit.`, { duration: 2600 });

    lastTime = performance.now();
    tickRemover = scene.preRender.addEventListener(tick);
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

    let camPos;
    if (cameraMode === 'cockpit') {
      const c = params.cockpit;
      camPos = localToWorld(M, c.x, c.y, c.z, new Cartesian3());
      haveSmooth = false;
      viewer.camera.setView({ destination: camPos, orientation: { direction: fwd, up } });
      return;
    }

    // Chase: behind (-X) and above (+Z) in body frame, smoothed for a nice feel.
    const ch = params.chase;
    const target = localToWorld(M, -ch.back, 0, ch.up, new Cartesian3());
    if (!haveSmooth) {
      Cartesian3.clone(target, smoothCamPos);
      haveSmooth = true;
    } else {
      const t = Math.min(dt * 6, 1); // smoothing rate
      Cartesian3.lerp(smoothCamPos, target, t, smoothCamPos);
    }
    viewer.camera.setView({
      destination: smoothCamPos,
      orientation: { direction: fwd, up },
    });
  }

  function exit() {
    if (!vehicle) return;
    const lastPos = vehicle.position;
    scene.preRender.removeEventListener(tick);
    tickRemover = null;
    scene.primitives.remove(mesh);
    mesh = null;
    vehicle = null;

    input.setActive(false);
    scene.screenSpaceCameraController.enableInputs = true;
    hud.hide();
    audio.engineOff();

    // Pull back to a pleasant external view of where we left off.
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

  // Manager-level keys (only meaningful while in a vehicle).
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
