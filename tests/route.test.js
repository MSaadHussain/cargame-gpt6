import test from 'node:test';
import assert from 'node:assert/strict';
import { Route, ovalRoute, gridRoute } from '../src/route.js';

// A car's forward axis is -Z, so yaw and the geometry heading are opposites.
// Getting this wrong spawned every AI car facing into oncoming traffic.
function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

test('yaw orients a car along the road, heading orients geometry across it', () => {
  const route = ovalRoute({ straight: 400, radius: 120, lanes: 4, laneWidth: 4, speedLimit: 30 });
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const { yaw, heading, nx, nz } = route.sample(t);
    const forward = forwardFromYaw(yaw);
    assert.ok(forward.x * nx + forward.z * nz > 0.999, `yaw follows the road at t=${t}`);
    // The geometry convention is the opposite sign, and must stay that way.
    assert.ok(Math.abs(Math.sin(heading) - nx) < 1e-9);
    assert.ok(Math.abs(Math.cos(heading) - nz) < 1e-9);
  }
});

test('lanes sit side by side across the road, centred on the middle', () => {
  const route = ovalRoute({ straight: 400, radius: 120, lanes: 4, laneWidth: 4.2, speedLimit: 30 });
  const centre = route.sample(0.25);
  const offsets = [0, 1, 2, 3].map(lane => {
    const p = route.sample(0.25, lane);
    return Math.hypot(p.x - centre.x, p.z - centre.z);
  });
  assert.equal(route.width, 16.8);
  // Outer lanes are further from the centreline than inner ones.
  assert.ok(offsets[0] > offsets[1] && offsets[3] > offsets[2]);
  for (let lane = 0; lane < 4; lane++) {
    const p = route.sample(0.25, lane);
    assert.equal(route.laneOf(p.x, p.z), lane, `lane ${lane} round-trips`);
  }
});

test('a point well off the road belongs to no lane', () => {
  const route = ovalRoute({ straight: 400, radius: 120, lanes: 4, laneWidth: 4.2, speedLimit: 30 });
  const p = route.sample(0.25);
  assert.equal(route.laneOf(p.x + 400, p.z), -1);
});

test('nearest recovers the position it was sampled from', () => {
  const route = ovalRoute({ straight: 520, radius: 150, lanes: 4, laneWidth: 4.2, speedLimit: 34 });
  for (const t of [0.05, 0.3, 0.5, 0.77, 0.95]) {
    const p = route.sample(t);
    const found = route.nearest(p.x, p.z);
    assert.ok(found.distance < 0.6, `t=${t} lands on the path`);
    const delta = Math.min(Math.abs(found.t - t), 1 - Math.abs(found.t - t));
    assert.ok(delta < 0.02, `t=${t} recovers its own position, got ${found.t}`);
  }
});

test('the oval closes on itself with no duplicated joints', () => {
  const route = ovalRoute({ straight: 300, radius: 100, lanes: 3, laneWidth: 4, speedLimit: 30 });
  assert.ok(route.total > 0);
  for (let i = 0; i < route.points.length; i++) {
    const a = route.points[i], b = route.points[(i + 1) % route.points.length];
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.4, 'no zero-length segment');
  }
  // Wrapping past the end returns to the start rather than running off.
  const start = route.sample(0), wrapped = route.sample(1);
  assert.ok(Math.hypot(start.x - wrapped.x, start.z - wrapped.z) < 1e-6);
});

test('t wraps in both directions so lookahead never falls off the path', () => {
  const route = gridRoute([-84, 84], { lanes: 2, laneWidth: 4.4, speedLimit: 21 });
  for (const t of [-0.4, -0.01, 1.3, 2.7]) {
    const p = route.sample(t);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `t=${t} is finite`);
  }
});
