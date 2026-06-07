import * as THREE from 'three';

/**
 * Free-look debug fly camera. WASD to move on the view plane, Q/E down/up,
 * drag the mouse to look, Shift to boost. Used in Phase 0 to inspect the
 * scene before the car exists.
 */
export function createFreeCamera(camera, input) {
  let yaw = Math.PI;   // face -Z (north) initially
  let pitch = -0.25;
  const LOOK_SPEED = 0.0024;
  const BASE_SPEED = 120;   // m/s
  const BOOST = 6;

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
    if (input.down('KeyE')) move.y += 1;
    if (input.down('KeyQ')) move.y -= 1;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);

    camera.lookAt(
      camera.position.x + dir.x,
      camera.position.y + dir.y,
      camera.position.z + dir.z,
    );
  }

  return { update };
}
