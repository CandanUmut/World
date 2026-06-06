/**
 * Famous-places menu + in-world landmark labels — gives exploring a set of
 * hooks. Clicking a place flies there with a nice oblique arrival; labels for
 * each landmark appear in the world when you're within range.
 */
import {
  LabelCollection,
  Cartesian3,
  Cartesian2,
  Math as CesiumMath,
  HeightReference,
  DistanceDisplayCondition,
  VerticalOrigin,
  Color,
} from 'cesium';
import { config } from '../config.js';

export function createPlaces(viewer) {
  const { scene } = viewer;

  // In-world labels for each landmark (clamped to ground, shown within range).
  const labels = scene.primitives.add(new LabelCollection({ scene }));
  for (const p of config.landmarks) {
    labels.add({
      position: Cartesian3.fromDegrees(p.lon, p.lat, 0),
      text: p.name,
      font: '600 15px system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#04101f'),
      outlineWidth: 3,
      style: 2, // FILL_AND_OUTLINE
      heightReference: HeightReference.CLAMP_TO_GROUND,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -8),
      distanceDisplayCondition: new DistanceDisplayCondition(0, 60_000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  }

  function flyTo(p) {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      orientation: {
        heading: CesiumMath.toRadians(p.heading ?? 0),
        pitch: CesiumMath.toRadians(p.pitch ?? -20),
        roll: 0,
      },
      duration: 3.5,
    });
  }

  const toggle = document.createElement('button');
  toggle.id = 'placesToggle';
  toggle.className = 'icon-btn';
  toggle.title = 'Famous places';
  toggle.innerHTML = '📍';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'placesPanel';
  panel.className = 'panel';
  panel.hidden = true;
  document.body.appendChild(panel);

  function render() {
    panel.innerHTML = `
      <div class="panel-head"><span>Famous places</span><button class="panel-close" title="Close">×</button></div>
      <div class="panel-body"></div>`;
    const body = panel.querySelector('.panel-body');
    for (const p of config.landmarks) {
      const btn = document.createElement('button');
      btn.className = 'bm-go';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        flyTo(p);
        panel.hidden = true;
      });
      body.appendChild(btn);
    }
    panel.querySelector('.panel-close').addEventListener('click', () => (panel.hidden = true));
  }

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });

  return { flyTo };
}
