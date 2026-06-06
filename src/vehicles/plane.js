/**
 * Arcade flight model. Forgiving, stable, fun — not a study sim.
 *
 * Controls:
 *   W / S            throttle up / down
 *   ↑ / ↓            pitch (climb / dive)
 *   ← / →            roll (bank) — banking turns the plane
 *   A / D            rudder yaw (left / right)
 */
import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { modelMatrix, forwardVector, compassHeading } from './frame.js';
import { groundHeightSync } from '../world/heights.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const MAX_SPEED = 240; // m/s (~860 km/h, arcade fast)
const ACCEL = 60; // m/s² toward target speed
const THROTTLE_RATE = 0.5; // per second
const PITCH_RATE = CesiumMath.toRadians(45); // rad/s
const ROLL_RATE = CesiumMath.toRadians(95);
const YAW_RATE = CesiumMath.toRadians(25);
const MAX_PITCH = CesiumMath.toRadians(65);
const MAX_ROLL = CesiumMath.toRadians(75);
const BANK_TURN_GAIN = CesiumMath.toRadians(45); // turn rate at full bank

export class Plane {
  static SPAWN_AGL = 350; // spawn airborne so you start flying

  constructor({ position, heading }) {
    this.position = position;
    this.heading = heading ?? 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 80;
    this.throttle = 0.5;
    this._M = modelMatrix(position, this.heading, this.pitch, this.roll);
    this._fwd = new Cartesian3();
    this._compass = 0;
  }

  get label() {
    return 'Plane';
  }

  cameraParams() {
    return { chase: { back: 28, up: 9, lookAhead: 40 }, cockpit: { x: 3.2, y: 0, z: 1.1 } };
  }

  meshBoxes() {
    const body = '#d8dde3';
    const wing = '#b7c0c9';
    const accent = '#3a6ea5';
    return [
      { min: [-4, -0.6, -0.6], max: [4.5, 0.6, 0.6], color: body }, // fuselage
      { min: [4.5, -0.25, -0.25], max: [5.6, 0.25, 0.25], color: accent }, // nose
      { min: [-0.6, -5.5, -0.1], max: [1.2, 5.5, 0.1], color: wing }, // main wing
      { min: [-3.8, -2.2, -0.08], max: [-3.0, 2.2, 0.08], color: wing }, // tailplane
      { min: [-3.9, -0.08, 0], max: [-3.1, 0.08, 1.6], color: accent }, // tail fin
      { min: [-1.5, -0.5, 0.5], max: [0.5, 0.5, 1.1], color: '#243447' }, // canopy
    ];
  }

  update(dt, scene) {
    // --- Inputs ---
    this.throttle = clamp(
      this.throttle + input.axis('KeyS', 'KeyW') * THROTTLE_RATE * dt,
      0,
      1,
    );
    const pitchIn = input.axis('ArrowDown', 'ArrowUp'); // +up = climb
    const rollIn = input.axis('ArrowLeft', 'ArrowRight'); // +right = bank right
    const yawIn = input.axis('KeyA', 'KeyD');

    // --- Attitude ---
    this.pitch = clamp(this.pitch + pitchIn * PITCH_RATE * dt, -MAX_PITCH, MAX_PITCH);
    this.roll = clamp(this.roll + rollIn * ROLL_RATE * dt, -MAX_ROLL, MAX_ROLL);
    // Gentle auto-level for stability when hands-off.
    if (pitchIn === 0) this.pitch *= 1 - Math.min(0.6 * dt, 0.5);
    if (rollIn === 0) this.roll *= 1 - Math.min(2.2 * dt, 0.7);

    // Banking turns the nose; rudder adds a little yaw.
    this.heading += Math.sin(this.roll) * BANK_TURN_GAIN * dt;
    this.heading += yawIn * YAW_RATE * dt;

    // --- Speed ---
    const target = this.throttle * MAX_SPEED;
    this.speed += clamp(target - this.speed, -ACCEL * dt, ACCEL * dt);

    // --- Integrate position along the real forward vector ---
    this._M = modelMatrix(this.position, this.heading, this.pitch, this.roll, this._M);
    forwardVector(this._M, this._fwd);
    const step = this.speed * dt;
    this.position = Cartesian3.add(
      this.position,
      Cartesian3.multiplyByScalar(this._fwd, step, new Cartesian3()),
      new Cartesian3(),
    );

    // --- Keep above terrain (no crash, arcade-friendly) ---
    const carto = Cartographic.fromCartesian(this.position);
    const ground = groundHeightSync(scene, carto);
    if (ground != null && carto.height < ground + 3) {
      carto.height = ground + 3;
      this.position = Cartographic.toCartesian(carto);
      if (this.pitch < 0) this.pitch *= 0.3; // bounce the nose up a touch
    }

    this._M = modelMatrix(this.position, this.heading, this.pitch, this.roll, this._M);
    this._compass = compassHeading(this.position, this._fwd);
  }

  get modelMatrixRef() {
    return this._M;
  }

  hud(scene) {
    const carto = Cartographic.fromCartesian(this.position);
    const ground = groundHeightSync(scene, carto);
    return {
      altitude: carto.height,
      agl: ground != null ? carto.height - ground : null,
      speedKmh: this.speed * 3.6,
      heading: this._compass,
      throttle: this.throttle,
    };
  }
}
