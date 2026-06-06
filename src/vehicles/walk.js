/**
 * Walk / first-person mode. Stroll the stylized world on foot, terrain-following
 * at eye height. Defaults to a first-person (cockpit) camera; press C for a
 * third-person view.
 *
 * Controls:  W/S walk · ← → turn · A/D strafe
 */
import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { input } from './input.js';
import { modelMatrix, forwardVector, compassHeading } from './frame.js';
import { groundHeightSync } from '../world/heights.js';

const WALK_SPEED = 3.2; // m/s
const RUN_SPEED = 7.0;
const TURN_RATE = CesiumMath.toRadians(110);
const EYE_HEIGHT = 1.7;

export class Walker {
  static SPAWN_AGL = 1.7;

  constructor({ position, heading }) {
    this.position = position;
    this.heading = heading ?? 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.defaultCamera = 'cockpit';
    this._M = modelMatrix(position, this.heading, 0, 0);
    this._fwd = new Cartesian3();
    this._right = new Cartesian3();
    this._compass = 0;
    this._height = Cartographic.fromCartesian(position).height;
  }

  get label() {
    return 'Walk';
  }
  get modelMatrixRef() {
    return this._M;
  }
  cameraParams() {
    return { chase: { back: 6, up: 3, lookAhead: 10 }, cockpit: { x: 0.25, y: 0, z: EYE_HEIGHT } };
  }

  meshBoxes() {
    return [
      { min: [-0.2, -0.25, 0], max: [0.2, 0.25, 1.35], color: '#3b6ea5' }, // body
      { min: [-0.16, -0.16, 1.35], max: [0.16, 0.16, 1.68], color: '#e6c8a8' }, // head
    ];
  }

  update(dt, scene) {
    const fwdIn = input.axis('KeyS', 'KeyW');
    const strafeIn = input.axis('KeyA', 'KeyD');
    const turnIn = input.axis('ArrowLeft', 'ArrowRight');
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    this.heading += turnIn * TURN_RATE * dt;
    const maxSpeed = run ? RUN_SPEED : WALK_SPEED;
    this.speed = (fwdIn !== 0 ? maxSpeed : 0);

    const M = modelMatrix(this.position, this.heading, 0, 0, this._M);
    forwardVector(M, this._fwd);
    // Right vector for strafing = forward × up (up = geodetic surface normal).
    Cartesian3.normalize(
      Cartesian3.cross(this._fwd, upAt(this.position), this._right),
      this._right,
    );

    const move = new Cartesian3();
    Cartesian3.add(move, Cartesian3.multiplyByScalar(this._fwd, fwdIn * maxSpeed * dt, new Cartesian3()), move);
    if (strafeIn !== 0) {
      Cartesian3.add(move, Cartesian3.multiplyByScalar(this._right, strafeIn * WALK_SPEED * dt, new Cartesian3()), move);
    }
    this.position = Cartesian3.add(this.position, move, new Cartesian3());

    // Terrain-follow at eye height (keep previous height if tiles not loaded).
    const carto = Cartographic.fromCartesian(this.position);
    const ground = groundHeightSync(scene, carto);
    if (ground != null) this._height = ground + EYE_HEIGHT;
    carto.height = this._height;
    this.position = Cartographic.toCartesian(carto);

    this._M = modelMatrix(this.position, this.heading, 0, 0, this._M);
    this._compass = compassHeading(this.position, this._fwd);
  }

  hud() {
    return { speedKmh: this.speed * 3.6, heading: this._compass, altitude: null, throttle: null };
  }
}

// Local up (geodetic surface normal) at a world position.
function upAt(position) {
  return Cartesian3.normalize(position, new Cartesian3());
}
