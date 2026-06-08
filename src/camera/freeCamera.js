import * as THREE from 'three';

/**
 * Free-look fly camera. WASD to move on the view plane, Q/E down/up, drag the
 * mouse to look, Shift to boost. With `opts.lockY` set it becomes a walk
 * controller: y is pinned to eye height and Q/E are ignored, so you stroll the
 * streets instead of flying.
 */
export function createFreeCamera(camera, input, opts = {}) {
  let yaw = Math.PI;   // face -Z (north) initially
  let pitch = -0.25;
  const LOOK_SPEED = 0.0024;
  const BASE_SPEED = opts.baseSpeed ?? 120;   // m/s
  const BOOST = 6;
  const lockY = opts.lockY ?? null;           // walk mode: pinned eye height

  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();

  function update(dt) {
    const m = input.takeMouse();
    yaw -= m.dx * LOOK_SPEED;
    pitch -= m.dy * LOOK_SPEED;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));

    dir.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).normalize();
    right.crossVectors(dir, up).normalize();

    let speed = BASE_SPEED * (input.down('ShiftLeft') || input.down('ShiftRight') ? BOOST : 1);
    move.set(0, 0, 0);
    if (input.down('KeyW')) move.addScaledVector(dir, 1);
    if (input.down('KeyS')) move.addScaledVector(dir, -1);
    if (input.down('KeyD')) move.addScaledVector(right, 1);
    if (input.down('KeyA')) move.addScaledVector(right, -1);
    if (lockY == null) {
      if (input.down('KeyE')) move.y += 1;
      if (input.down('KeyQ')) move.y -= 1;
    } else {
      move.y = 0; // walk: stay on the ground plane
    }
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);
    if (lockY != null) camera.position.y = lockY;

    camera.lookAt(
      camera.position.x + dir.x,
      camera.position.y + dir.y,
      camera.position.z + dir.z,
    );
  }

  return {
    update,
    setLook(y, p) { yaw = y; pitch = Math.max(-1.5, Math.min(1.5, p)); },
  };
}
