/**
 * Car: drives over the real terrain, following ground height and tilting on
 * slopes. Buildings stay scenery (collision is deliberately light).
 *
 * Controls:  W/S accel / brake-reverse · ← → steer
 */
import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { modelMatrix, forwardVector, compassHeading } from './frame.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const MAX_SPEED = 55; // m/s (~200 km/h)
const MAX_REVERSE = 12;
const ACCEL = 18;
const BRAKE = 30;
const FRICTION = 8;
const STEER_RATE = CesiumMath.toRadians(70); // at reference speed
const REF_SPEED = 18;
const MAX_BANK = CesiumMath.toRadians(7);
const RIDE_HEIGHT = 1.0;
const SLOPE_SAMPLE = 4; // metres fore/aft for slope estimate

export class Car {
  static SPAWN_AGL = 1.0;

  constructor({ position, heading }) {
    this.position = position;
    this.heading = heading ?? 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this._M = modelMatrix(position, this.heading, 0, 0);
    this._fwd = new Cartesian3();
    this._compass = 0;
  }

  get label() {
    return 'Car';
  }
  get modelMatrixRef() {
    return this._M;
  }
  cameraParams() {
    return { chase: { back: 13, up: 5, lookAhead: 20 }, cockpit: { x: 0.6, y: 0, z: 1.7 } };
  }

  meshBoxes() {
    const body = '#c2402f';
    const dark = '#1c1c20';
    return [
      { min: [-2.2, -0.9, 0.1], max: [2.2, 0.9, 0.9], color: body }, // chassis
      { min: [-1.0, -0.8, 0.9], max: [1.1, 0.8, 1.5], color: '#2a3a4a' }, // cabin
      { min: [-1.9, -1.0, 0.0], max: [-1.1, -0.8, 0.5], color: dark }, // wheels
      { min: [-1.9, 0.8, 0.0], max: [-1.1, 1.0, 0.5], color: dark },
      { min: [1.1, -1.0, 0.0], max: [1.9, -0.8, 0.5], color: dark },
      { min: [1.1, 0.8, 0.0], max: [1.9, 1.0, 0.5], color: dark },
    ];
  }

  update(dt, scene) {
    const accelIn = input.axis('KeyS', 'KeyW'); // +forward
    const steerIn = input.axis('ArrowLeft', 'ArrowRight'); // +right

    // Longitudinal dynamics.
    if (accelIn > 0) this.speed += ACCEL * dt;
    else if (accelIn < 0) this.speed -= (this.speed > 0 ? BRAKE : ACCEL) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), FRICTION * dt);
    this.speed = clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    // Steering scales with speed (and reverses when going backward).
    const speedFactor = clamp(this.speed / REF_SPEED, -1, 1);
    this.heading += steerIn * STEER_RATE * dt * speedFactor;

    // Advance along flat heading forward.
    const flat = modelMatrix(this.position, this.heading, 0, 0, this._M);
    forwardVector(flat, this._fwd);
    this.position = Cartesian3.add(
      this.position,
      Cartesian3.multiplyByScalar(this._fwd, this.speed * dt, new Cartesian3()),
      new Cartesian3(),
    );

    // Stick to the ground.
    const carto = Cartographic.fromCartesian(this.position);
    const ground = scene.globe.getHeight(carto);
    if (ground != null) {
      carto.height = ground + RIDE_HEIGHT;
      this.position = Cartographic.toCartesian(carto);
    }

    // Pitch from local slope (sample fore/aft), bank into turns.
    const aheadH = sampleAhead(scene, this.position, this._fwd, SLOPE_SAMPLE);
    const behindH = sampleAhead(scene, this.position, this._fwd, -SLOPE_SAMPLE);
    if (aheadH != null && behindH != null) {
      this.pitch = Math.atan2(aheadH - behindH, 2 * SLOPE_SAMPLE);
    }
    const targetRoll = -steerIn * MAX_BANK * Math.abs(speedFactor);
    this.roll += (targetRoll - this.roll) * Math.min(dt * 4, 1);

    this._M = modelMatrix(this.position, this.heading, this.pitch, this.roll, this._M);
    this._compass = compassHeading(this.position, this._fwd);
  }

  hud() {
    return { speedKmh: this.speed * 3.6, heading: this._compass, altitude: null, throttle: null };
  }
}

// Sample terrain height a distance `d` along `fwd` from `world`.
function sampleAhead(scene, world, fwd, d) {
  const p = Cartesian3.add(world, Cartesian3.multiplyByScalar(fwd, d, new Cartesian3()), new Cartesian3());
  return scene.globe.getHeight(Cartographic.fromCartesian(p));
}
