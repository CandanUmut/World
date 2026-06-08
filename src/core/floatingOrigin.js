import { GeoAnchor } from './geo.js';

/**
 * Floating origin.
 *
 * Real-world coordinates in meters are far too large for 32-bit floats: a few
 * hundred km out and vertices jitter visibly. The fix is to keep the rendered
 * world centered near the player — every piece of content is positioned in
 * world meters relative to a movable ANCHOR (a lon/lat). When the player
 * wanders past a threshold from the anchor, we re-anchor at their current
 * lon/lat and shift everything by the delta, keeping coordinates small.
 *
 * Streamed content registers itself; on rebase we translate every registered
 * object. Long-lived systems can also subscribe to the rebase event to adjust
 * their own bookkeeping (e.g. tile world positions).
 */
export class FloatingOrigin {
  /**
   * @param {number} lon initial anchor longitude
   * @param {number} lat initial anchor latitude
   * @param {number} threshold meters from anchor before rebasing
   */
  constructor(lon, lat, threshold = 3000) {
    this.anchor = new GeoAnchor(lon, lat);
    this.threshold = threshold;
    /** @type {Set<import('three').Object3D>} */
    this.tracked = new Set();
    /** @type {Array<(dx:number,dz:number,anchor:GeoAnchor)=>void>} */
    this.listeners = [];
  }

  /** Register an Object3D whose position should shift on rebase. */
  track(obj) { this.tracked.add(obj); return obj; }
  untrack(obj) { this.tracked.delete(obj); }

  /** Subscribe to rebase events: (dx, dz, newAnchor). */
  onRebase(fn) { this.listeners.push(fn); }

  /** Convert a lon/lat to current world meters. */
  toWorld(lon, lat) { return this.anchor.toWorld(lon, lat); }
  toLonLat(x, z) { return this.anchor.toLonLat(x, z); }
  /** Convert absolute mercator meters to current world meters. */
  mercToWorld(mx, my) { return this.anchor.mercToWorld(mx, my); }

  /**
   * Given the player's current world position, rebase the origin to that
   * point if it has strayed past the threshold. Returns true if a rebase
   * happened. The player object is NOT shifted here — pass it in `keep` (it
   * will be moved back toward origin by the delta) or move it yourself.
   */
  maybeRebase(playerWorldX, playerWorldZ, keep = []) {
    const dist = Math.hypot(playerWorldX, playerWorldZ);
    if (dist < this.threshold) return false;

    // New anchor is the player's current geographic location.
    const ll = this.anchor.toLonLat(playerWorldX, playerWorldZ);
    const next = new GeoAnchor(ll.lon, ll.lat);

    // Everything currently placed against the old anchor must move by:
    //   newWorld = oldWorld - (player offset)
    // i.e. shift the world so the player lands back at (≈0,0).
    const dx = -playerWorldX;
    const dz = -playerWorldZ;

    for (const obj of this.tracked) {
      obj.position.x += dx;
      obj.position.z += dz;
    }
    for (const obj of keep) {
      obj.position.x += dx;
      obj.position.z += dz;
    }

    this.anchor = next;
    for (const fn of this.listeners) fn(dx, dz, next);
    return true;
  }
}
