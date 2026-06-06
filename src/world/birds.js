/**
 * Ambient life: a small flock of birds that lazily circle near the camera when
 * you're down low. Pure procedural billboards — cheap, and they make a place
 * feel alive rather than empty.
 */
import {
  BillboardCollection,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';

function birdSprite() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,24,30,0.9)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(4, 18);
  g.quadraticCurveTo(12, 8, 16, 16);
  g.quadraticCurveTo(20, 8, 28, 18);
  g.stroke();
  return c;
}

export function createBirds(viewer, count = 14) {
  const { scene } = viewer;
  const collection = scene.primitives.add(new BillboardCollection({ scene }));
  const sprite = birdSprite();

  const birds = [];
  for (let i = 0; i < count; i++) {
    const b = {
      angle: Math.random() * Math.PI * 2,
      radius: 120 + Math.random() * 400,
      speed: (0.1 + Math.random() * 0.15) * (Math.random() < 0.5 ? -1 : 1),
      alt: 60 + Math.random() * 160,
      phase: Math.random() * Math.PI * 2,
    };
    b.bb = collection.add({ image: sprite, position: Cartesian3.fromDegrees(0, 0, 0), scale: 0.8, show: false });
    birds.push(b);
  }

  let enabled = true;
  let t = 0;

  function update() {
    const carto = viewer.camera.positionCartographic;
    const visible = enabled && carto.height < 2500;
    if (!visible) {
      for (const b of birds) b.bb.show = false;
      return;
    }
    t += 0.016;
    const lon0 = CesiumMath.toDegrees(carto.longitude);
    const lat0 = CesiumMath.toDegrees(carto.latitude);
    const ground = scene.globe.getHeight(carto) ?? 0;
    const mPerDegLat = 111_320;
    const mPerDegLon = 111_320 * Math.cos(carto.latitude);

    for (const b of birds) {
      b.angle += b.speed * 0.016;
      const dx = Math.cos(b.angle) * b.radius;
      const dy = Math.sin(b.angle) * b.radius;
      const bob = Math.sin(t + b.phase) * 6;
      b.bb.position = Cartesian3.fromDegrees(
        lon0 + dx / mPerDegLon,
        lat0 + dy / mPerDegLat,
        ground + b.alt + bob,
      );
      b.bb.show = true;
    }
  }

  const remover = scene.preRender.addEventListener(update);

  return {
    setEnabled(v) {
      enabled = v;
      if (!v) for (const b of birds) b.bb.show = false;
    },
    destroy() {
      scene.preRender.removeEventListener(remover);
      scene.primitives.remove(collection);
    },
  };
}
