import * as CANNON from 'cannon-es';

export const SPAWN = { x: -5.2, y: 1.05, z: 34 };
export const FIXED_STEP = 1 / 120;
const WHEEL_RADIUS = 0.36;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Drivetrain presets. `gears` are gearbox ratios; `final` is the differential.
export const VEHICLES = {
  veloce: {
    id: 'veloce', name: 'Veloce 240', badge: 'RS', drivetrain: 'RWD', engine: 'I6',
    mass: 1480, peakTorque: 306, idleRpm: 850, maxRpm: 7100, redline: 6750,
    shiftUp: 6250, shiftDown: 2550, gears: [3.36, 2.07, 1.43, 1.09, 0.87], reverse: 3.15, final: 5.12,
    engineBrake: 34, brakeFront: 37, brakeRear: 20, handbrake: 64, drag: 0.56,
    suspensionStiffness: 27, dampingRelaxation: 4.6, dampingCompression: 2.7, rollInfluence: 0.42,
    gripFront: 2.5, gripRear: 2.95, steerLock: 0.46, steerFalloff: 0.075, transferGain: 0.22,
    paint: '#67877d', paintName: 'Sage metallic',
    blurb: 'A boxy classic with a heavy right foot. Soft springs, rear-wheel drive, and a little more character in every corner.',
  },
  marlin: {
    id: 'marlin', name: 'Marlin GT', badge: 'V8', drivetrain: 'RWD', engine: 'V8',
    mass: 1710, peakTorque: 486, idleRpm: 700, maxRpm: 6300, redline: 6000,
    shiftUp: 5500, shiftDown: 2100, gears: [2.97, 1.78, 1.26, 1.0, 0.78], reverse: 2.9, final: 4.76,
    engineBrake: 46, brakeFront: 41, brakeRear: 23, handbrake: 72, drag: 0.62,
    suspensionStiffness: 23, dampingRelaxation: 4.1, dampingCompression: 2.35, rollInfluence: 0.52,
    gripFront: 2.42, gripRear: 2.78, steerLock: 0.43, steerFalloff: 0.082, transferGain: 0.28,
    paint: '#8d3f33', paintName: 'Ember red',
    blurb: 'Long bonnet, lazy torque, and a tail that leaves before you do. Heavier, softer, and far easier to light up.',
  },
};

// Normalized torque curve: peaks past mid-range, still pulling at the top.
function torqueCurve(x) { return clamp(1.04 - 1.55 * (x - 0.6) ** 2, 0, 1.1); }

export class DrivingPhysics {
  constructor(vehicleId = 'veloce') {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 14;
    this.world.defaultContactMaterial.friction = 0.55;
    this.world.defaultContactMaterial.restitution = 0.08;
    this.groundMaterial = new CANNON.Material('asphalt');
    this.carMaterial = new CANNON.Material('car');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMaterial, this.carMaterial, {
      friction: 0.45, restitution: 0.08, contactEquationStiffness: 1e8, contactEquationRelaxation: 4,
    }));
    const floor = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);
    this.floor = floor;
    this.spec = VEHICLES[vehicleId] || VEHICLES.veloce;
    this.chassis = new CANNON.Body({ mass: this.spec.mass, material: this.carMaterial, angularDamping: 0.2, linearDamping: 0.015 });
    this.chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.92, 0.27, 2.15)), new CANNON.Vec3(0, 0.26, 0));
    this.chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.78, 0.30, 0.94)), new CANNON.Vec3(0, 0.78, 0.03));
    this.vehicle = new CANNON.RaycastVehicle({ chassisBody: this.chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const [x, z] of [[-0.94, -1.43], [0.94, -1.43], [-0.94, 1.43], [0.94, 1.43]]) {
      this.vehicle.addWheel({
        radius: WHEEL_RADIUS, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(x, 0.08, z), isFrontWheel: z < 0,
        suspensionStiffness: 27, suspensionRestLength: 0.38, frictionSlip: 2.65,
        dampingRelaxation: 4.6, dampingCompression: 2.7, maxSuspensionForce: 85000,
        rollInfluence: 0.42, maxSuspensionTravel: 0.25, customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
      });
    }
    this.vehicle.addToWorld(this.world);
    this.damage = 0;
    this.impacts = [];
    this.steer = 0;
    this.time = 0;
    this.lastImpact = -1;
    this.distance = 0;
    this.grip = 1;
    this.damageEnabled = true;
    this.scenery = [];
    this.chassis.addEventListener('collide', (event) => this.onCollide(event));
    this.applySpec(this.spec);
    this.reset();
  }

  // Swapping cars reuses the same body, so world references and listeners stay valid.
  applySpec(spec) {
    this.spec = spec;
    this.chassis.mass = spec.mass;
    this.chassis.updateMassProperties();
    for (const wheel of this.vehicle.wheelInfos) {
      wheel.suspensionStiffness = spec.suspensionStiffness;
      wheel.dampingRelaxation = spec.dampingRelaxation;
      wheel.dampingCompression = spec.dampingCompression;
      wheel.rollInfluence = spec.rollInfluence;
    }
  }

  setVehicle(id) {
    const spec = VEHICLES[id];
    if (!spec || spec === this.spec) return this.spec;
    this.applySpec(spec);
    this.reset();
    return spec;
  }

  addBox(x, y, z, sx, sy, sz, options = {}) {
    const body = new CANNON.Body({ mass: options.mass || 0, material: this.groundMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(x, y, z);
    if (options.angle) body.quaternion.setFromEuler(0, options.angle, 0);
    if (options.pitch) body.quaternion.setFromEuler(options.pitch, 0, 0);
    this.world.addBody(body);
    this.scenery.push(body);
    return body;
  }

  // Map switching tears down every body the world builder added, keeping car and floor.
  clearScenery() {
    for (const body of this.scenery) this.world.removeBody(body);
    this.scenery.length = 0;
  }

  onCollide({ contact }) {
    const impact = Math.abs(contact.getImpactVelocityAlongNormal());
    if (impact < 2.6 || this.time - this.lastImpact < 0.14) return;
    this.lastImpact = this.time;
    const isA = contact.bi === this.chassis;
    const relative = isA ? contact.ri : contact.rj;
    const worldPoint = this.chassis.position.vadd(relative);
    const point = this.chassis.pointToLocalFrame(worldPoint);
    const severity = Math.min(0.72, (impact - 2) * 0.034);
    if (this.damageEnabled) this.damage = Math.min(100, this.damage + severity * 48);
    this.impacts.push({ point, severity: this.damageEnabled ? severity : 0, speed: impact });
  }

  get forwardSpeed() {
    const forward = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
    return this.chassis.velocity.dot(forward);
  }

  // Angle between where the car points and where it is actually travelling.
  get slipAngle() {
    const v = this.chassis.velocity;
    if (v.lengthSquared() < 4) return 0;
    const forward = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
    const right = this.chassis.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    return Math.atan2(v.dot(right), Math.abs(v.dot(forward)));
  }

  gearRatio(gear) {
    if (gear < 0) return -this.spec.reverse;
    if (gear === 0) return 0;
    return this.spec.gears[gear - 1];
  }

  // Analog axes when a pad supplies them, digital keys otherwise.
  static axes(input) {
    const steer = input.steerAxis !== undefined
      ? clamp(input.steerAxis, -1, 1)
      : (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const throttle = input.throttleAxis !== undefined
      ? clamp(input.throttleAxis, 0, 1)
      : (input.forward ? 1 : 0);
    const brake = input.brakeAxis !== undefined
      ? clamp(input.brakeAxis, 0, 1)
      : (input.backward ? 1 : 0);
    return { steer, throttle, brake, handbrake: input.handbrake ? 1 : 0 };
  }

  step(input, dt = FIXED_STEP) {
    this.time += dt;
    const spec = this.spec;
    const { steer: steerAxis, throttle: throttleAxis, brake: brakeAxis, handbrake } = DrivingPhysics.axes(input);
    const speed = this.forwardSpeed;
    const absSpeed = this.chassis.velocity.length();

    const steerTarget = steerAxis * (spec.steerLock / (1 + absSpeed * spec.steerFalloff));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);

    const reversing = brakeAxis > 0 && speed < 0.8;
    const serviceBrake = (brakeAxis > 0 && speed >= 0.8) || (throttleAxis > 0 && speed < -0.8);
    const brakePedal = serviceBrake ? (brakeAxis > 0 ? brakeAxis : 1) : 0;
    const throttle = throttleAxis > 0 && !serviceBrake ? throttleAxis : reversing ? -brakeAxis : 0;
    this.throttle = throttle;
    this.braking = serviceBrake || handbrake > 0;

    // --- Gearbox --------------------------------------------------------
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (reversing) this.gear = -1;
    else if (this.gear < 0 && speed >= -0.2) this.gear = 1;
    else if (this.gear === 0 && (throttle > 0 || speed > 1)) this.gear = 1;

    const ratio = this.gearRatio(this.gear);
    const wheelRpm = (Math.abs(speed) / (2 * Math.PI * WHEEL_RADIUS)) * 60;
    this.rpm = clamp(wheelRpm * Math.abs(ratio) * spec.final, spec.idleRpm, spec.maxRpm);

    this.shifted = 0;
    if (this.shiftTimer === 0 && this.gear > 0) {
      if (this.rpm > spec.shiftUp && this.gear < spec.gears.length && throttle > 0.05) {
        this.gear++; this.shiftTimer = 0.26; this.shifted = 1;
      } else if (this.rpm < spec.shiftDown && this.gear > 1) {
        this.gear--; this.shiftTimer = 0.2; this.shifted = -1;
      }
    }
    const cut = this.shiftTimer > 0 || this.rpm >= spec.redline;

    // --- Engine force ---------------------------------------------------
    const damageLoss = 1 - this.damage * 0.005;
    let driveForce = 0;
    if (throttle !== 0 && !cut) {
      const nm = spec.peakTorque * torqueCurve(this.rpm / spec.maxRpm) * Math.abs(throttle) * damageLoss;
      driveForce = Math.sign(throttle) * nm * Math.abs(ratio) * spec.final / WHEEL_RADIUS;
    } else if (throttle === 0 && this.gear > 0 && speed > 0.5) {
      // Overrun braking scales with revs, so lifting off actually slows the car.
      driveForce = -spec.engineBrake * (this.rpm / spec.maxRpm) * Math.abs(ratio) * spec.final / WHEEL_RADIUS;
    }

    // Soft traction limit: back off the engine when the driven axle is already
    // sliding, so first and second gear cannot snap the tail out on their own.
    // The handbrake bypasses it, because breaking traction is the point there.
    const rearSkid = Math.min(this.vehicle.wheelInfos[2].skidInfo, this.vehicle.wheelInfos[3].skidInfo);
    if (driveForce > 0 && rearSkid < 1 && !handbrake) driveForce *= clamp(0.3 + rearSkid * 0.7, 0.3, 1);

    // --- Longitudinal load transfer --------------------------------------
    const accel = (speed - this.lastSpeed) / dt;
    this.lastSpeed = speed;
    this.accel = accel;
    const transfer = clamp(accel / 9.5, -1, 1);
    const frontLoad = 1 - transfer * spec.transferGain;
    const rearLoad = 1 + transfer * spec.transferGain;

    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      this.vehicle.setSteeringValue(front ? this.steer : 0, i);
      this.vehicle.applyEngineForce(front ? 0 : driveForce / 2, i);
      const brake = brakePedal * (front ? spec.brakeFront : spec.brakeRear)
        + (front ? 0 : handbrake * spec.handbrake);
      this.vehicle.setBrake(brake || (throttle === 0 ? 0.35 : 0), i);
      const base = front ? spec.gripFront : spec.gripRear;
      const load = clamp(front ? frontLoad : rearLoad, 0.55, 1.4);
      this.vehicle.wheelInfos[i].frictionSlip = this.grip * base * load * (!front && handbrake ? 0.29 : 1);
    }

    // Pitch the body so the suspension visibly dives under braking and squats on power.
    if (Math.abs(accel) > 0.05) {
      const right = this.chassis.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      const magnitude = clamp(accel, -12, 12) * this.chassis.mass * 0.24;
      this.chassis.torque.x += right.x * magnitude;
      this.chassis.torque.y += right.y * magnitude;
      this.chassis.torque.z += right.z * magnitude;
    }

    // Quadratic aerodynamic drag, independent of frame rate.
    if (absSpeed > 0.01) this.chassis.applyForce(this.chassis.velocity.scale(-spec.drag * absSpeed));
    this.world.step(dt);
    this.distance += absSpeed * dt;
    if (this.chassis.position.y < -8) this.reset(false);
  }

  reset(repair = true) {
    this.chassis.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.chassis.quaternion.set(0, 0, 0, 1);
    this.chassis.velocity.setZero();
    this.chassis.angularVelocity.setZero();
    this.chassis.force.setZero();
    this.chassis.torque.setZero();
    this.chassis.previousPosition.copy(this.chassis.position);
    this.chassis.interpolatedPosition.copy(this.chassis.position);
    this.chassis.previousQuaternion.copy(this.chassis.quaternion);
    this.chassis.interpolatedQuaternion.copy(this.chassis.quaternion);
    this.chassis.aabbNeedsUpdate = true;
    this.chassis.wakeUp();
    this.steer = 0;
    this.gear = 0;
    this.rpm = this.spec.idleRpm;
    this.shiftTimer = 0;
    this.shifted = 0;
    this.throttle = 0;
    this.braking = false;
    this.lastSpeed = 0;
    this.accel = 0;
    this.impacts.length = 0;
    for (let i = 0; i < 4; i++) {
      this.vehicle.setSteeringValue(0, i);
      this.vehicle.applyEngineForce(0, i);
      this.vehicle.setBrake(0, i);
      this.vehicle.wheelInfos[i].rotation = 0;
    }
    if (repair) this.damage = 0;
  }

  // Used when a map defines its own start line.
  placeAt(x, z, heading = 0) {
    this.reset(false);
    this.chassis.position.set(x, SPAWN.y, z);
    this.chassis.quaternion.setFromEuler(0, heading, 0);
    this.chassis.previousPosition.copy(this.chassis.position);
    this.chassis.interpolatedPosition.copy(this.chassis.position);
    this.chassis.previousQuaternion.copy(this.chassis.quaternion);
    this.chassis.interpolatedQuaternion.copy(this.chassis.quaternion);
    this.chassis.aabbNeedsUpdate = true;
  }
}
