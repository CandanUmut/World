import * as THREE from 'three';

/**
 * Chase + cockpit cameras that follow the car. Chase trails behind with smoothed
 * position/look and pulls back a little with speed for a sense of pace; cockpit
 * is rigidly attached at the driver's eye. Both derive from the car each frame,
 * so they stay continuous across floating-origin rebases (the smoothed look
 * point is shifted explicitly via shift()).
 */
export function createChaseCamera(camera, car) {
  const fwd = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookT = new THREE.Vector3();
  const curLook = new THREE.Vector3();
  let inited = false;
  let mode = 'chase';
  let target = car; // the followed vehicle (retargetable)

  function update(dt) {
    target.forward(fwd);
    const p = target.position;
    const car = target; // local alias used below

    if (mode === 'cockpit') {
      camera.position.set(p.x + fwd.x * 0.1, p.y + 1.55, p.z + fwd.z * 0.1);
      lookT.set(p.x + fwd.x * 40, p.y + 1.3, p.z + fwd.z * 40);
      camera.lookAt(lookT);
      curLook.copy(lookT);
      inited = true;
      return;
    }

    const sp = car.speed;
    const dist = 9 + Math.min(sp * 0.12, 5);
    const height = 4.3 + Math.min(sp * 0.03, 1.6);
    desired.set(p.x - fwd.x * dist, p.y + height, p.z - fwd.z * dist);
    lookT.set(p.x + fwd.x * 7, p.y + 1.2, p.z + fwd.z * 7);

    if (!inited) { camera.position.copy(desired); curLook.copy(lookT); inited = true; }
    camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
    curLook.lerp(lookT, 1 - Math.exp(-10 * dt));
    camera.lookAt(curLook);
  }

  return {
    update,
    setMode(m) { mode = m; inited = false; },
    setTarget(v) { target = v; inited = false; },
    shift(dx, dz) { curLook.x += dx; curLook.z += dz; },
    reset() { inited = false; },
  };
}
