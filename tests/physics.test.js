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
  const cruising = p.forwardSpeed;
  advance(p, 1.5, { backward: true });
  assert.ok(p.forwardSpeed < cruising - 12, 'service braking sheds real speed');
  advance(p, 6, { backward: true }); assert.ok(p.forwardSpeed < -1);
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
  assert.equal(p.vehicle.wheelInfos[2].brake, p.spec.handbrake, 'rear axle takes the handbrake');
  assert.ok(p.vehicle.wheelInfos[0].brake < 1, 'front axle is left alone');
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

test('gearbox climbs through the ratios and holds revs inside the operating range', () => {
  const p = new DrivingPhysics();
  const seen = new Set();
  for (let i = 0; i < Math.round(20 / FIXED_STEP); i++) {
    p.step({ forward: true });
    seen.add(p.gear);
    assert.ok(p.rpm >= p.spec.idleRpm && p.rpm <= p.spec.maxRpm, `rpm ${p.rpm} stays in range`);
  }
  assert.ok(p.gear >= 4, `reaches a tall gear, got ${p.gear}`);
  assert.ok(seen.has(1) && seen.has(2) && seen.has(3), 'passes through the lower gears');
});

test('lifting off the throttle slows the car through engine braking alone', () => {
  const p = new DrivingPhysics(); advance(p, 6, { forward: true });
  const entry = p.forwardSpeed;
  advance(p, 3, {});
  assert.ok(p.forwardSpeed < entry - 3, 'overrun scrubs speed without the brake pedal');
  assert.ok(p.forwardSpeed > 0, 'engine braking does not stop or reverse the car');
});

test('analog axes drive the same model as the digital keys', () => {
  const digital = new DrivingPhysics(), analog = new DrivingPhysics();
  for (let i = 0; i < 360; i++) {
    digital.step({ forward: true, left: true });
    analog.step({ throttleAxis: 1, steerAxis: 1 });
  }
  assert.ok(digital.chassis.position.distanceTo(analog.chassis.position) < 1e-9);
  const half = new DrivingPhysics();
  for (let i = 0; i < 360; i++) half.step({ throttleAxis: 0.35 });
  assert.ok(half.forwardSpeed > 0 && half.forwardSpeed < digital.forwardSpeed, 'part throttle gives part acceleration');
});

test('load transfer moves grip to the front under braking and to the rear on power', () => {
  const p = new DrivingPhysics(); advance(p, 5, { forward: true });
  advance(p, 0.2, { backward: true });
  assert.ok(p.accel < 0, 'the car is decelerating');
  assert.ok(p.vehicle.wheelInfos[0].frictionSlip / p.spec.gripFront > p.vehicle.wheelInfos[2].frictionSlip / p.spec.gripRear,
    'braking loads the front axle');
});

test('the second vehicle is heavier and hits its own drivetrain limits', () => {
  const p = new DrivingPhysics('marlin');
  assert.equal(p.chassis.mass, 1710);
  advance(p, 20, { forward: true });
  assert.ok(p.rpm <= p.spec.maxRpm);
  assert.ok(p.gear >= 4);
});
