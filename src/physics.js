import * as CANNON from 'cannon-es';

export const SPAWN = { x: -5.2, y: 1.05, z: 34 };
export const FIXED_STEP = 1 / 120;

export class DrivingPhysics {
  constructor() {
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
    this.chassis = new CANNON.Body({ mass: 1480, material: this.carMaterial, angularDamping: 0.2, linearDamping: 0.015 });
    this.chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.92, 0.27, 2.15)), new CANNON.Vec3(0, 0.26, 0));
    this.chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.78, 0.30, 0.94)), new CANNON.Vec3(0, 0.78, 0.03));
    this.vehicle = new CANNON.RaycastVehicle({ chassisBody: this.chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const [x, z] of [[-0.94, -1.43], [0.94, -1.43], [-0.94, 1.43], [0.94, 1.43]]) {
      this.vehicle.addWheel({
        radius: 0.36, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
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
    this.chassis.addEventListener('collide', (event) => this.onCollide(event));
    this.reset();
  }

  addBox(x, y, z, sx, sy, sz, options = {}) {
    const body = new CANNON.Body({ mass: options.mass || 0, material: this.groundMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(x, y, z);
    if (options.angle) body.quaternion.setFromEuler(0, options.angle, 0);
    if (options.pitch) body.quaternion.setFromEuler(options.pitch, 0, 0);
    this.world.addBody(body);
    return body;
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

  step(input, dt = FIXED_STEP) {
    this.time += dt;
    const speed = this.forwardSpeed;
    const absSpeed = this.chassis.velocity.length();
    const steerTarget = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (0.49 / (1 + absSpeed * 0.035));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    const reversing = input.backward && speed < 0.8;
    const serviceBrake = (input.backward && speed >= 0.8) || (input.forward && speed < -0.8);
    const throttle = input.forward && !serviceBrake ? 1 : reversing ? -0.55 : 0;
    this.throttle = throttle;
    this.braking = serviceBrake || input.handbrake;
    const torque = 3100 * Math.max(0.14, 1 - Math.max(0, absSpeed - 16) / 40) * (1 - this.damage * 0.005);
    for (let i = 0; i < 4; i++) {
      this.vehicle.setSteeringValue(i < 2 ? this.steer : 0, i);
      this.vehicle.applyEngineForce(i >= 2 ? throttle * torque : 0, i);
      this.vehicle.setBrake(serviceBrake ? 24 : input.handbrake && i >= 2 ? 38 : !throttle ? 0.35 : 0, i);
      this.vehicle.wheelInfos[i].frictionSlip = this.grip * (input.handbrake && i >= 2 ? 0.72 : i >= 2 ? 2.45 : 2.65);
    }
    // Quadratic aerodynamic drag, independent of frame rate.
    if (absSpeed > 0.01) this.chassis.applyForce(this.chassis.velocity.scale(-0.43 * absSpeed));
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
    this.impacts.length = 0;
    for (let i = 0; i < 4; i++) {
      this.vehicle.setSteeringValue(0, i);
      this.vehicle.applyEngineForce(0, i);
      this.vehicle.setBrake(0, i);
      this.vehicle.wheelInfos[i].rotation = 0;
    }
    if (repair) this.damage = 0;
  }
}
