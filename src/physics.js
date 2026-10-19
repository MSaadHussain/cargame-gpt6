import * as CANNON from 'cannon-es';
import { modelOf, isTwoWheeler, isAircraft } from './vehicleModels.js';
import { resetFlight, stepFlight, flightSpawn } from './flight.js';

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

for (const spec of [
  {id:'sparrow',name:'Sparrow',badge:'S-2',mass:900,peakTorque:250,engine:'Radial prop',drivetrain:'THRUST',paint:'#e6a82f',paintName:'Sunburst yellow',blurb:'Agile aerobatic biplane with twin wings and a spinning propeller. Full loops/rolls; H gear, X rear view, G flares. Unarmed.'},
  {id:'kestrel',name:'Kestrel',badge:'F-27',mass:12000,peakTorque:1000,engine:'Jet turbine',drivetrain:'THRUST',paint:'#778c99',paintName:'Storm grey',blurb:'Low-poly fighter with swept wings and twin tails. Skyport only. Mouse aim, Mouse 1 cannon, W/S thrust, A/D bank, Shift afterburner.'},
  {id:'skyliner',name:'Skyliner',badge:'777',mass:180000,peakTorque:1000,engine:'Twin turbofan',drivetrain:'THRUST',paint:'#e7ecf1',paintName:'Airline white',blurb:'Boeing 777-inspired twin-engine airliner with swept wings and cabin windows. Skyport only; unarmed, slower turning and heavy.'},
  {id:'swift',name:'Swift',badge:'GT 350',mass:270,peakTorque:72,engine:'Scooter single',drag:.25,final:4.1,engineBrake:7,brakeFront:8,brakeRear:5,handbrake:12,suspensionStiffness:35,rollInfluence:.04,transferGain:.08,gripFront:3.2,gripRear:3.5,paint:'#aeb7c4',paintName:'Satin silver',blurb:'Sporty maxi scooter with silver fairings, twin lamps, windscreen and stepped seat. Seated rider; hold B with throttle to wheelie.'},
  {id:'vesper',name:'Vesper',badge:'125',mass:220,peakTorque:54,engine:'Scooter single',drag:.23,final:4.4,engineBrake:6,brakeFront:7,brakeRear:4,handbrake:10,suspensionStiffness:35,rollInfluence:.04,transferGain:.08,gripFront:3.2,gripRear:3.5,paint:'#008eaf',paintName:'Lagoon blue',blurb:'Rounded retro scooter with blue leg shield, handlebar headlamp, black bench and classic mirrors. Seated rider; B + throttle for wheelies.'},
  {id:'tempest',name:'Tempest',badge:'V12',mass:1480,peakTorque:610,engine:'V12',drag:.4,final:3.9,suspensionStiffness:38,gripFront:3.2,gripRear:3.5,paint:'#e3c32b',blurb:'Lamborghini-inspired wedge supercar. Wide intakes, low cockpit and a V12 soundtrack.'},
  {id:'formula',name:'Formula',badge:'R1',mass:820,peakTorque:380,engine:'V6 race',drag:.48,final:3.7,suspensionStiffness:42,gripFront:3.8,gripRear:4.1,brakeFront:28,brakeRear:18,paint:'#cb3434',blurb:'Open-wheel, single-seat racer with front wing, rear wing and helmeted driver.'},
  {id:'rider',name:'Rider',badge:'900',mass:300,peakTorque:90,engine:'I3 bike',drag:.23,final:3.8,engineBrake:8,brakeFront:8,brakeRear:5,handbrake:12,suspensionStiffness:35,rollInfluence:.04,transferGain:.08,gripFront:3.2,gripRear:3.5,paint:'#303638',blurb:'Low-poly classic motorcycle: round lamp, spoked wheels, chrome exhaust and seated rider. Hold B with throttle for a wheelie.'},
  { id: 'comet', name: 'Comet Hatch', badge: 'S', mass: 1080, peakTorque: 225, engine: 'I4 turbo', drag: .48, final: 4.6, gripRear: 3.1, paint: '#dab453', paintName: 'Sunburst', blurb: 'Short wheelbase, light body, quick changes of direction. A compact street hatch.' },
  { id: 'viper', name: 'Viper Coupe', badge: 'GT', mass: 1360, peakTorque: 410, engine: 'V6 turbo', suspensionStiffness: 34, gripFront: 2.9, gripRear: 3.3, drag: .43, final: 4.3, paint: '#3b79a5', paintName: 'Ocean blue', blurb: 'Low roof, wide stance, front splitter and rear wing. Built for the coastal straights.' },
  { id: 'nomad', name: 'Nomad SUV', badge: 'LX', mass: 2180, peakTorque: 490, engine: 'V8', suspensionStiffness: 38, brakeFront: 49, brakeRear: 30, drag: .85, final: 5.5, paint: '#56634d', paintName: 'Forest green', blurb: 'A tall, squared-off utility body with roof rails and a rear spare. Heavy but composed.' },
  { id: 'hauler', name: 'Hauler Pickup', badge: 'XT', mass: 2320, peakTorque: 540, engine: 'V8', suspensionStiffness: 40, brakeFront: 52, brakeRear: 30, drag: .9, final: 5.7, paint: '#b07545', paintName: 'Copper', blurb: 'A long-wheelbase truck with a separate cab and open cargo bed. Give it space to turn.' },
  { id: 'falcon', name: 'Falcon Rally', badge: 'RS', mass: 1230, peakTorque: 335, engine: 'I4 turbo', suspensionStiffness: 30, gripFront: 2.85, gripRear: 3.2, final: 5.3, paint: '#d5dbd7', paintName: 'Rally white', blurb: 'Short gearing, hood scoop, spotlights and a rally wing. Rear-drive and ready to slide.' },
]) VEHICLES[spec.id] = { ...VEHICLES.veloce, ...spec };

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
    const airborne=isAircraft(spec.id);
    if(airborne&&!this.flightMode){this.vehicle.removeFromWorld(this.world);this.world.addBody(this.chassis);}
    else if(!airborne&&this.flightMode){this.world.removeBody(this.chassis);this.vehicle.addToWorld(this.world);}
    this.flightMode=airborne;
    this.chassis.type=airborne?CANNON.Body.KINEMATIC:CANNON.Body.DYNAMIC;
    this.chassis.collisionFilterMask=airborne?0:-1;
    this.spec = spec;
    const model = modelOf(spec.id);
    const shape = this.chassis.shapes[0];
    shape.halfExtents.set(model.width / 2, .27, model.length / 2);
    shape.updateConvexPolyhedronRepresentation(); shape.updateBoundingSphereRadius();
    const cabin = this.chassis.shapes[1];
    cabin.halfExtents.set(model.width * .4, (model.roof - .48) / 2, (model.cabinRear + 1.14) / 2);
    cabin.updateConvexPolyhedronRepresentation(); cabin.updateBoundingSphereRadius();
    this.chassis.shapeOffsets[1].set(0, (model.roof + .48) / 2, (model.cabinRear - 1.14) / 2);
    this.chassis.updateBoundingRadius(); this.chassis.aabbNeedsUpdate = true;
    this.chassis.mass = spec.mass;
    this.chassis.updateMassProperties();
    for (const [i, wheel] of this.vehicle.wheelInfos.entries()) {
      wheel.chassisConnectionPointLocal.set((i % 2 ? 1 : -1) * model.width * .492, .08, (i < 2 ? -1 : 1) * model.wheelbase / 2);
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
    if(this.flightMode){stepFlight(this,input,dt);return;}
    const spec = this.spec;
    const { steer: steerAxis, throttle: throttleAxis, brake: brakeAxis, handbrake } = DrivingPhysics.axes(input);
    const speed = this.forwardSpeed;
    const absSpeed = this.chassis.velocity.length();
    const wheelieTarget=isTwoWheeler(spec.id)&&input.wheelie&&throttleAxis>0&&speed>3&&!brakeAxis ? .65:0;
    this.wheelie+=(wheelieTarget-this.wheelie)*Math.min(1,dt*(wheelieTarget?3:5));

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
    if (!isTwoWheeler(spec.id) && Math.abs(accel) > 0.05) {
      const right = this.chassis.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      const magnitude = clamp(accel, -12, 12) * this.chassis.mass * 0.24;
      this.chassis.torque.x += right.x * magnitude;
      this.chassis.torque.y += right.y * magnitude;
      this.chassis.torque.z += right.z * magnitude;
    }

    // Quadratic aerodynamic drag, independent of frame rate.
    if (absSpeed > 0.01) this.chassis.applyForce(this.chassis.velocity.scale(-spec.drag * absSpeed));
    if(isTwoWheeler(spec.id)) {
      // Arcade balance assist: hidden paired tyre rays keep the lightweight bike
      // stable. The rider/front-wheel lift is rendered around the rear contact.
      const f=this.chassis.quaternion.vmult(new CANNON.Vec3(0,0,-1));
      this.chassis.quaternion.setFromEuler(0,Math.atan2(-f.x,-f.z),0);
      this.chassis.angularVelocity.x=0;this.chassis.angularVelocity.z=0;
      this.chassis.torque.x=0;this.chassis.torque.z=0;
    }
    this.world.step(dt);
    this.distance += absSpeed * dt;
    if (this.chassis.position.y < -8) this.reset(false);
  }

  reset(repair = true) {
    resetFlight(this);
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
    this.wheelie = 0;
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
    if(this.flightMode){const p=flightSpawn();this.chassis.position.set(p.x,p.y,p.z);}
  }

  // Used when a map defines its own start line.
  placeAt(x, z, heading = 0, y) {
    this.reset(false);
    this.chassis.position.set(x, y ?? (this.flightMode?260:SPAWN.y), z);
    this.chassis.quaternion.setFromEuler(0, heading, 0);
    this.flight.heading=heading;
    this.chassis.previousPosition.copy(this.chassis.position);
    this.chassis.interpolatedPosition.copy(this.chassis.position);
    this.chassis.previousQuaternion.copy(this.chassis.quaternion);
    this.chassis.interpolatedQuaternion.copy(this.chassis.quaternion);
    this.chassis.aabbNeedsUpdate = true;
  }
}
