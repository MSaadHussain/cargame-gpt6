const TAU = Math.PI * 2;

/**
 * A closed lane-based path. Traffic follows it, and the highway map builds its
 * road surface, markings, barriers and tree lines directly from it, so the
 * geometry and the AI can never disagree about where the road is.
 */
export class Route {
  constructor({ points, lanes = 3, laneWidth = 4, speedLimit = 30, name = 'route' }) {
    this.points = points;
    this.lanes = lanes;
    this.laneWidth = laneWidth;
    this.speedLimit = speedLimit;
    this.name = name;
    this.lengths = [0];
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      total += Math.hypot(b.x - a.x, b.z - a.z);
      this.lengths.push(total);
    }
    this.total = total;
  }

  get width() { return this.lanes * this.laneWidth; }

  // Centre offset for a lane index, so lane 0 is the outside edge.
  laneOffset(lane) { return (lane - (this.lanes - 1) / 2) * this.laneWidth; }

  segmentAt(t) {
    const distance = ((t % 1) + 1) % 1 * this.total;
    let lo = 0, hi = this.lengths.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.lengths[mid] <= distance) lo = mid; else hi = mid;
    }
    const a = this.points[lo % this.points.length];
    const b = this.points[(lo + 1) % this.points.length];
    const span = this.lengths[lo + 1] - this.lengths[lo] || 1;
    return { a, b, f: (distance - this.lengths[lo]) / span };
  }

  // Position on the centreline, or offset into a lane, plus the heading there.
  sample(t, lane = null) {
    const { a, b, f } = this.segmentAt(t);
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    let x = a.x + dx * f, z = a.z + dz * f;
    if (lane !== null) {
      const offset = this.laneOffset(lane);
      x += -nz * offset;
      z += nx * offset;
    }
    // `heading` rotates a box to lie along the road (geometry convention).
    // `yaw` orients a car to drive along it: a car's forward is its -Z axis,
    // so its yaw is the opposite sign. Mixing the two makes traffic drive
    // backwards into itself.
    return { x, z, heading: Math.atan2(nx, nz), yaw: Math.atan2(-nx, -nz), nx, nz };
  }

  // Closest point on the path, as a normalized distance plus lateral offset.
  nearest(x, z) {
    let best = { t: 0, distance: Infinity, lateral: 0 };
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i], b = this.points[(i + 1) % this.points.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz || 1;
      const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq));
      const px = a.x + dx * f, pz = a.z + dz * f;
      const distance = Math.hypot(x - px, z - pz);
      if (distance < best.distance) {
        const len = Math.sqrt(lenSq);
        best = {
          t: (this.lengths[i] + f * len) / this.total,
          distance,
          // Signed to match laneOffset: sample() displaces a lane by
          // offset * (-nz, nx), so this must return +offset for that point.
          lateral: ((z - pz) * (dx / len) - (x - px) * (dz / len)),
        };
      }
    }
    return best;
  }

  // Which lane a world position sits in, or -1 when it is off the road.
  laneOf(x, z) {
    const { lateral } = this.nearest(x, z);
    const lane = Math.round(lateral / this.laneWidth + (this.lanes - 1) / 2);
    return lane >= 0 && lane < this.lanes ? lane : -1;
  }
}

// A rounded rectangle circuit: two long straights joined by sweeping bends.
export function ovalRoute({ straight, radius, lanes, laneWidth, speedLimit, segments = 26, centerZ = 0 }) {
  const points = [];
  const half = straight / 2;
  const arc = (cx, cz, from) => {
    for (let i = 0; i <= segments; i++) {
      const angle = from + (i / segments) * Math.PI;
      points.push({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });
    }
  };
  arc(0, centerZ - half, Math.PI);       // top bend, right to left
  arc(0, centerZ + half, 0);             // bottom bend, left to right
  // Drop the duplicate joint points the two arcs share.
  const deduped = points.filter((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    return Math.hypot(p.x - prev.x, p.z - prev.z) > 0.5;
  });
  return new Route({ points: deduped, lanes, laneWidth, speedLimit, name: 'oval' });
}

// A loop that follows the city street grid, for traffic in the port district.
export function gridRoute(coords, { lanes, laneWidth, speedLimit }) {
  const [lo, hi] = coords;
  const points = [];
  const push = (x, z) => points.push({ x, z });
  const step = 12;
  for (let z = lo; z < hi; z += step) push(lo, z);
  for (let x = lo; x < hi; x += step) push(x, hi);
  for (let z = hi; z > lo; z -= step) push(hi, z);
  for (let x = hi; x > lo; x -= step) push(x, lo);
  return new Route({ points, lanes, laneWidth, speedLimit, name: 'grid' });
}

export { TAU };
