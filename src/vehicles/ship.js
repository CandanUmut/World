/**
 * Ship: sails the real coastlines, seas and large rivers at sea level, with a
 * gentle bob for life. Water vs land is judged by terrain height (≤ ~0 = sea);
 * like buildings, land is scenery rather than a hard wall.
 *
 * Controls:  W/S throttle · ← → steer
 */
import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { modelMatrix, forwardVector, compassHeading } from './frame.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const MAX_SPEED = 22; // m/s (~43 knots, arcade)
const ACCEL = 6;
const THROTTLE_RATE = 0.5;
const STEER_RATE = CesiumMath.toRadians(28);
const REF_SPEED = 8;
const SEA_LEVEL = 0;

export class Ship {
  static SPAWN_AGL = 0;

  constructor({ position, heading }) {
    // Force spawn to sea level.
    const carto = Cartographic.fromCartesian(position);
    carto.height = SEA_LEVEL;
    this.position = Cartographic.toCartesian(carto);
    this.heading = heading ?? 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this._t = 0;
    this._M = modelMatrix(this.position, this.heading, 0, 0);
    this._fwd = new Cartesian3();
    this._compass = 0;
  }

  get label() {
    return 'Ship';
  }
  get modelMatrixRef() {
    return this._M;
  }
  cameraParams() {
    return { chase: { back: 42, up: 18, lookAhead: 60 }, cockpit: { x: 6, y: 0, z: 7 } };
  }

  meshBoxes() {
    const hull = '#26303a';
    const deck = '#9aa3ab';
    return [
      { min: [-12, -3, -1.5], max: [12, 3, 1.5], color: hull }, // hull
      { min: [12, -1.6, -0.5], max: [15, 1.6, 1.5], color: hull }, // bow
      { min: [-6, -2.4, 1.5], max: [3, 2.4, 4], color: deck }, // superstructure
      { min: [-2, -1, 4], max: [1, 1, 6.5], color: '#c9ced3' }, // bridge tower
      { min: [-4, -0.7, 4], max: [-2.5, 0.7, 7], color: '#b04a35' }, // funnel
    ];
  }

  update(dt, scene) {
    this.throttle = clamp(this.throttle + input.axis('KeyS', 'KeyW') * THROTTLE_RATE * dt, -0.4, 1);
    const steerIn = input.axis('ArrowLeft', 'ArrowRight');

    const target = this.throttle * MAX_SPEED;
    this.speed += clamp(target - this.speed, -ACCEL * dt, ACCEL * dt);

    const speedFactor = clamp(this.speed / REF_SPEED, -1, 1);
    this.heading += steerIn * STEER_RATE * dt * speedFactor;

    // Advance, then pin to sea level.
    const flat = modelMatrix(this.position, this.heading, 0, 0, this._M);
    forwardVector(flat, this._fwd);
    const moved = Cartesian3.add(
      this.position,
      Cartesian3.multiplyByScalar(this._fwd, this.speed * dt, new Cartesian3()),
      new Cartesian3(),
    );
    const carto = Cartographic.fromCartesian(moved);
    carto.height = SEA_LEVEL;
    this.position = Cartographic.toCartesian(carto);

    // Gentle bob (pitch & roll oscillation), stronger at speed.
    this._t += dt;
    const sea = 0.5 + speedFactor * 0.5;
    this.pitch = CesiumMath.toRadians(1.6 * sea) * Math.sin(this._t * 0.9);
    this.roll =
      CesiumMath.toRadians(2.2 * sea) * Math.sin(this._t * 0.7 + 1) -
      steerIn * CesiumMath.toRadians(4) * Math.abs(speedFactor);

    this._M = modelMatrix(this.position, this.heading, this.pitch, this.roll, this._M);
    this._compass = compassHeading(this.position, this._fwd);
  }

  hud(scene) {
    const ground = scene.globe.getHeight(Cartographic.fromCartesian(this.position));
    return {
      speedKmh: this.speed * 3.6,
      heading: this._compass,
      altitude: null,
      throttle: this.throttle,
      onWater: ground == null || ground <= 0.5,
    };
  }
}
