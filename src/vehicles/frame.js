/**
 * Reference-frame helpers shared by all vehicles.
 *
 * Vehicle state is position + heading/pitch/roll. These helpers turn that into
 * a world model matrix and extract the body axes, plus a *true* compass heading
 * derived from the actual forward vector (so the HUD reads correctly regardless
 * of Cesium's internal HPR axis convention).
 */
import {
  Transforms,
  HeadingPitchRoll,
  Matrix4,
  Cartesian3,
  Cartesian4,
  Math as CesiumMath,
} from 'cesium';

const scratchHpr = new HeadingPitchRoll();
const UNIT_X = Object.freeze(new Cartesian3(1, 0, 0));
const UNIT_Z = Object.freeze(new Cartesian3(0, 0, 1));

export function modelMatrix(position, heading, pitch, roll, result) {
  scratchHpr.heading = heading;
  scratchHpr.pitch = pitch;
  scratchHpr.roll = roll;
  return Transforms.headingPitchRollToFixedFrame(position, scratchHpr, undefined, undefined, result);
}

export function forwardVector(M, result = new Cartesian3()) {
  return Cartesian3.normalize(Matrix4.multiplyByPointAsVector(M, UNIT_X, result), result);
}

export function upVector(M, result = new Cartesian3()) {
  return Cartesian3.normalize(Matrix4.multiplyByPointAsVector(M, UNIT_Z, result), result);
}

/** Transform a LOCAL offset (body coords) to a WORLD point. */
export function localToWorld(M, x, y, z, result = new Cartesian3()) {
  return Matrix4.multiplyByPoint(M, new Cartesian3(x, y, z), result);
}

/** Compass heading (deg, 0=N, 90=E) of a world forward vector at a position. */
export function compassHeading(position, forward) {
  const enu = Transforms.eastNorthUpToFixedFrame(position);
  const east = Cartesian4.clone(Matrix4.getColumn(enu, 0, new Cartesian4()));
  const north = Cartesian4.clone(Matrix4.getColumn(enu, 1, new Cartesian4()));
  const e = Cartesian3.dot(forward, new Cartesian3(east.x, east.y, east.z));
  const n = Cartesian3.dot(forward, new Cartesian3(north.x, north.y, north.z));
  let deg = CesiumMath.toDegrees(Math.atan2(e, n));
  if (deg < 0) deg += 360;
  return deg;
}
