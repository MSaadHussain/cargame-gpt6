import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingPhysics, SPAWN, FIXED_STEP } from '../src/physics.js';

function advance(p, seconds, input = {}) { for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) p.step(input); }

test('suspension supports the car at a stable ride height on all four wheels', () => {
  const p = new DrivingPhysics(); advance(p, 4);
  assert.ok(p.chassis.position.y > 0.45 && p.chassis.position.y < 0.7);
  assert.ok(Math.abs(p.chassis.velocity.y) < 0.01);
  assert.ok(p.vehicle.wheelInfos.every(w => w.isInContact && w.suspensionForce > 0));
});

test('engine accelerates forward, service brakes slow down, and reverse engages after stopping', () => {
  const p = new DrivingPhysics(); advance(p, 5, { forward: true });
  assert.ok(p.forwardSpeed > 15); assert.ok(p.chassis.position.z < SPAWN.z - 35);
  advance(p, 1.5, { backward: true }); assert.ok(p.forwardSpeed < 8);
  advance(p, 4, { backward: true }); assert.ok(p.forwardSpeed < -1);
});

test('steering produces left and right turns in the expected directions', () => {
  for (const [input, sign] of [[{ left: true }, -1], [{ right: true }, 1]]) {
    const p = new DrivingPhysics(); advance(p, 3, { forward: true }); advance(p, 1, { forward: true, ...input });
    assert.ok((p.chassis.position.x - SPAWN.x) * sign > 3);
    assert.ok(Math.abs(p.chassis.quaternion.z) < 0.25, 'car does not immediately roll over');
  }
});

test('solid wall stops the car and impact damage is recorded near the front', () => {
  const p = new DrivingPhysics(); p.addBox(SPAWN.x, 2, -10, 20, 4, 2);
  advance(p, 7, { forward: true });
  assert.ok(p.chassis.position.z > -9, 'no tunneling through the wall');
  assert.ok(p.damage > 10); assert.ok(p.impacts.some(i => i.point.z < -1 && i.severity > 0));
});

test('disabling damage preserves collisions and does not reduce body condition', () => {
  const p = new DrivingPhysics(); p.damageEnabled = false; p.addBox(SPAWN.x, 2, -10, 20, 4, 2);
  advance(p, 7, { forward: true }); assert.equal(p.damage, 0); assert.ok(p.chassis.position.z > -9);
  assert.ok(p.impacts.length > 0); assert.ok(p.impacts.every(i => i.severity === 0));
});

test('handbrake lowers rear grip and applies rear-only braking', () => {
  const p = new DrivingPhysics(); advance(p, 3, { forward: true }); p.step({ handbrake: true });
  assert.ok(p.vehicle.wheelInfos[2].frictionSlip < p.vehicle.wheelInfos[0].frictionSlip);
  assert.equal(p.vehicle.wheelInfos[2].brake, 38); assert.equal(p.vehicle.wheelInfos[0].brake, 0.35);
});

test('repair restores spawn, body condition, velocity, orientation, and steering', () => {
  const p = new DrivingPhysics(); advance(p, 2, { forward: true, right: true }); p.damage = 60;
  p.reset(); assert.equal(p.damage, 0); assert.equal(p.chassis.position.z, SPAWN.z);
  assert.equal(p.chassis.velocity.length(), 0); assert.equal(p.chassis.angularVelocity.length(), 0);
  assert.equal(p.chassis.quaternion.w, 1); assert.equal(p.steer, 0);
});

test('identical fixed-step inputs produce reproducible motion', () => {
  const a = new DrivingPhysics(), b = new DrivingPhysics();
  for (let i = 0; i < 720; i++) { const input = { forward: true, right: i > 300 && i < 420 }; a.step(input); b.step(input); }
  assert.ok(a.chassis.position.distanceTo(b.chassis.position) < 1e-8);
});
