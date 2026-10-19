import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCarGeometry, carMaterials } from './car.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const COLORS = ['#b8483a', '#3d5f7d', '#c9b57e', '#5a6b57', '#8d8f93', '#a8623c', '#454b52', '#95a3ac'];
const WHEEL_OFFSETS = [[-0.94, -1.43], [0.94, -1.43], [-0.94, 1.43], [0.94, 1.43]];

let seed = 4517;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
export function reseedTraffic(value = 4517) { seed = value; }

/**
 * Rash traffic driving the same car as the player.
 *
 * Each AI runs a real cannon RaycastVehicle with the player's suspension, so it
 * rolls in corners, dives under braking and can be spun, shunted or rolled by a
 * hit. The driver only gets the same three controls the player has: steering,
 * throttle and brakes.
 *
 * All of them are drawn from instanced copies of the player's merged car
 * geometry, so twenty-six cars cost about ten draw calls instead of one per
 * body panel.
 */
export class Traffic {
  constructor(scene, physics, route, count = 14, max = 64) {
    this.scene = scene;
    this.physics = physics;
    this.route = route;
    this.cars = [];
    this.enabled = true;
    this.nearMiss = 0;
    this.max = Math.max(max, count);
    this.temp = new THREE.Object3D();
    this.buildMeshes(this.max);
    this.setDensity(count);
  }

  // Density changes add or retire cars from a fixed instance pool, so the
  // slider never has to rebuild geometry or reallocate the meshes.
  setDensity(count) {
    const target = Math.max(0, Math.min(this.max, Math.round(count)));
    while (this.cars.length > target) {
      const car = this.cars.pop();
      car.vehicle.removeFromWorld(this.physics.world);
      this.physics.world.removeBody(car.body);
      const stored=this.physics.scenery.indexOf(car.body);if(stored>=0)this.physics.scenery.splice(stored,1);
    }
    while (this.cars.length < target) this.spawn(this.cars.length / Math.max(1, target));
    for (const mesh of Object.values(this.bodyMeshes)) mesh.count = target;
    for (const mesh of Object.values(this.wheelMeshes)) mesh.count = target * 4;
    this.syncAll();
    return target;
  }

  buildMeshes(count) {
    // Traffic skips the cockpit interior and the smallest trim: never visible,
    // and it roughly halves the merged vertex count.
    const { body, wheel } = createCarGeometry({ interior: false, detail: false });
    this.geometries = [...Object.values(body), ...Object.values(wheel)];
    const shared = carMaterials();
    this.materials = shared;
    this.bodyMeshes = {}; this.wheelMeshes = {};
    const make = (geo, material, instances) => {
      const mesh = new THREE.InstancedMesh(geo, material, instances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    for (const [key, geo] of Object.entries(body)) {
      // Per-car colour rides on the paint mesh only.
      const material = key === 'paint' ? shared.paint.clone() : shared[key];
      this.bodyMeshes[key] = make(geo, material, count);
      if (key === 'paint') this.paintMaterial = material;
    }
    for (const [key, geo] of Object.entries(wheel)) {
      this.wheelMeshes[key] = make(geo, shared[key], count * 4);
    }
  }

  spawn(t) {
    const index = this.cars.length;
    const spec = this.physics.spec;
    const lane = Math.floor(random() * this.route.lanes);
    const chassis = new CANNON.Body({
      mass: 1380,
      material: this.physics.carMaterial,
      angularDamping: 0.3,
      linearDamping: 0.02,
    });
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.92, 0.27, 2.15)), new CANNON.Vec3(0, 0.26, 0));
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.78, 0.30, 0.94)), new CANNON.Vec3(0, 0.78, 0.03));
    const vehicle = new CANNON.RaycastVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const [x, z] of WHEEL_OFFSETS) {
      vehicle.addWheel({
        radius: 0.36, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(x, 0.08, z), isFrontWheel: z < 0,
        suspensionStiffness: spec.suspensionStiffness, suspensionRestLength: 0.38, frictionSlip: 2.6,
        dampingRelaxation: spec.dampingRelaxation, dampingCompression: spec.dampingCompression,
        maxSuspensionForce: 85000, rollInfluence: spec.rollInfluence, maxSuspensionTravel: 0.25,
        customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true,
      });
    }
    vehicle.addToWorld(this.physics.world);
    const start = this.route.sample(t, lane);
    chassis.position.set(start.x, 1.05, start.z);
    chassis.quaternion.setFromEuler(0, start.yaw, 0);
    this.physics.scenery.push(chassis);

    this.bodyMeshes.paint?.setColorAt(index, new THREE.Color(COLORS[Math.floor(random() * COLORS.length)]));
    const car = {
      index, body: chassis, vehicle, lane, targetLane: lane, progress: t,
      // Rash drivers: high aggression means faster, closer and far more erratic.
      aggression: 0.55 + random() * 0.45,
      speed: this.route.speedLimit * (1.35 + random() * 0.85),
      decisionTimer: random() * 2,
      brakeTimer: 0, stunned: 0, braking: false, steer: 0, wrongWay: 0, passing: 0,
      spawn: { t, lane },
    };
    chassis.addEventListener('collide', (event) => {
      const other = event.body === chassis ? event.target : event.body;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 6 && other !== this.physics.floor) car.stunned = Math.min(1.4, impact * 0.09);
    });
    this.cars.push(car);
    return car;
  }

  reset() {
    for (const car of this.cars) {
      const start = this.route.sample(car.spawn.t, car.spawn.lane);
      car.body.position.set(start.x, 1.05, start.z);
      car.body.quaternion.setFromEuler(0, start.yaw, 0);
      car.body.velocity.setZero();
      car.body.angularVelocity.setZero();
      car.body.force.setZero(); car.body.torque.setZero();
      car.lane = car.spawn.lane; car.targetLane = car.spawn.lane;
      car.stunned = 0; car.braking = false; car.steer = 0;
      car.body.aabbNeedsUpdate = true; car.body.wakeUp();
    }
    this.syncAll();
  }

  dispose() {
    for (const car of this.cars) {
      car.vehicle.removeFromWorld(this.physics.world);
      this.physics.world.removeBody(car.body);
      const stored=this.physics.scenery.indexOf(car.body);if(stored>=0)this.physics.scenery.splice(stored,1);
    }
    for (const mesh of [...Object.values(this.bodyMeshes), ...Object.values(this.wheelMeshes)]) this.scene.remove(mesh);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.paintMaterial?.dispose();
    this.cars.length = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    for (const mesh of [...Object.values(this.bodyMeshes), ...Object.values(this.wheelMeshes)]) mesh.visible = enabled;
    for (const car of this.cars) {
      if (enabled) car.body.wakeUp();
      else { car.body.sleep(); }
    }
  }

  update(dt, playerPosition) {
    if (!this.enabled) return;
    this.nearMiss = 0;
    const forward = new CANNON.Vec3();
    const right = new CANNON.Vec3();
    for (const car of this.cars) {
      const { body, vehicle } = car;
      const pos = body.position;
      if (car.brakeTimer > 0) { car.brakeTimer -= dt; if (car.brakeTimer <= 0) car.braking = false; }

      body.quaternion.vmult(new CANNON.Vec3(0, 0, -1), forward);
      body.quaternion.vmult(new CANNON.Vec3(1, 0, 0), right);
      const speed = body.velocity.dot(forward);

      // A shunted driver loses the car for a moment: no steering, no throttle.
      if (car.stunned > 0) {
        car.stunned -= dt;
        for (let i = 0; i < 4; i++) { vehicle.applyEngineForce(0, i); vehicle.setBrake(2, i); }
        continue;
      }

      const nearest = this.route.nearest(pos.x, pos.z);
      car.progress = nearest.t;

      // --- Rash decision making -----------------------------------------
      car.decisionTimer -= dt;
      if (car.decisionTimer <= 0) {
        car.decisionTimer = 0.5 + random() * (3.2 - car.aggression * 2.4);
        if (random() < 0.28 + car.aggression * 0.45) {
          const dir = random() < 0.5 ? -1 : 1;
          car.targetLane = clamp(Math.round(car.lane) + dir, 0, this.route.lanes - 1);
        }
        // An occasional pointless stab of the brakes, straight out of real traffic.
        if (random() < car.aggression * 0.18) { car.braking = true; car.brakeTimer = 0.4 + random() * 0.5; }
      }

      // Dive for the gap when the player is alongside: cut them off, never yield.
      if (playerPosition) {
        const dx = pos.x - playerPosition.x, dz = pos.z - playerPosition.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 26) {
          this.nearMiss = Math.max(this.nearMiss, 1 - distance / 26);
          if (distance < 15 && car.aggression > 0.72) {
            const playerLane = this.route.laneOf(playerPosition.x, playerPosition.z);
            if (playerLane >= 0) car.targetLane = playerLane;
          }
        }
      }

      // --- Overtaking -----------------------------------------------------
      // Blocked by something slower? Take whichever adjacent lane is clear and
      // go around it, rather than sitting in the queue.
      car.passing = Math.max(0, car.passing - dt);
      const blocker = this.carAhead(car, pos, forward);
      if (blocker && car.passing === 0) {
        const blockerSpeed = blocker.car.body.velocity.dot(forward);
        const closing = speed - blockerSpeed;
        if (blockerSpeed < car.speed * 0.92 && (blocker.gap < 26 || closing > 4)) {
          const lane = Math.round(car.lane);
          const preferred = car.aggression > 0.5 ? 1 : -1;
          for (const dir of [preferred, -preferred]) {
            const candidate = lane + dir;
            if (candidate < 0 || candidate >= this.route.lanes) continue;
            if (this.laneClear(car, candidate, forward)) {
              car.targetLane = candidate;
              car.passing = 2.2 + random() * 1.5;
              break;
            }
          }
        }
      }
      car.lane += (car.targetLane - car.lane) * Math.min(1, dt * (1.2 + car.aggression * 2.4));

      // Recover a driver who has been spun round or shoved past the guardrail.
      const line = this.route.sample(nearest.t);
      const along = forward.x * line.nx + forward.z * line.nz;
      const strayed = nearest.distance > this.route.width / 2 + 5;
      car.wrongWay = (along < 0.25 || strayed) ? car.wrongWay + dt : 0;
      if (car.wrongWay > 1.2) {
        const home = this.route.sample(nearest.t, clamp(Math.round(car.lane), 0, this.route.lanes - 1));
        body.position.set(home.x, 1.05, home.z);
        body.quaternion.setFromEuler(0, home.yaw, 0);
        body.angularVelocity.setZero();
        const rejoin = this.route.sample(nearest.t);
        body.velocity.set(rejoin.nx * car.speed * 0.6, 0, rejoin.nz * car.speed * 0.6);
        car.wrongWay = 0; car.steer = 0;
      }

      // --- Steering: aim at a point down the road ------------------------
      const lookahead = 0.006 + Math.min(0.02, Math.abs(speed) * 0.0008);
      const target = this.route.sample(nearest.t + lookahead, car.lane);
      const heading = Math.atan2(-(target.x - pos.x), -(target.z - pos.z));
      const current = Math.atan2(-forward.x, -forward.z);
      let error = heading - current;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      // Same speed-sensitive steering limit the player's car has.
      const lock = 0.5 / (1 + Math.abs(speed) * 0.055);
      const wanted = clamp(error * 1.5, -lock, lock);
      car.steer += (wanted - car.steer) * Math.min(1, dt * 8);

      // --- Throttle and brakes -------------------------------------------
      const ahead = this.gapAhead(car, pos, forward);
      const following = 10 + (1 - car.aggression) * 24;
      let desired = car.speed;
      if (ahead < following) desired *= clamp(ahead / following, 0.1, 1);
      if (car.braking) desired *= 0.3;
      const error2 = desired - speed;
      const throttle = clamp(error2 * 0.5, 0, 1);
      const brake = error2 < -1.5 ? clamp(-error2 * 3.5, 0, 26) : 0;
      const engineForce = throttle * 5200;

      for (let i = 0; i < 4; i++) {
        vehicle.setSteeringValue(i < 2 ? car.steer : 0, i);
        vehicle.applyEngineForce(i >= 2 ? engineForce / 2 : 0, i);
        vehicle.setBrake(brake || (throttle === 0 ? 0.4 : 0), i);
      }
      car.braking = car.braking || brake > 6;

      // Recover a car that has been flipped onto its roof.
      const up = new CANNON.Vec3(0, 1, 0);
      body.quaternion.vmult(up, up);
      if (up.y < -0.2 && body.velocity.lengthSquared() < 1.5) {
        body.quaternion.setFromEuler(0, Math.atan2(-forward.x, -forward.z), 0);
        body.position.y = 1.05;
        body.angularVelocity.setZero();
      }
    }
    this.syncAll();
  }

  // The next car in front, with its gap, or null when the road is clear.
  carAhead(car, pos, forward) {
    let best = null, bestGap = Infinity;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.body.position.x - pos.x, dz = other.body.position.z - pos.z;
      const along = dx * forward.x + dz * forward.z;
      if (along <= 0 || along >= bestGap) continue;
      const side = Math.abs(dx * -forward.z + dz * forward.x);
      if (side < 2.6) { best = other; bestGap = along; }
    }
    return best ? { car: best, gap: bestGap } : null;
  }

  // Is there room to move into this lane: nothing close alongside or closing in.
  laneClear(car, lane, forward) {
    const offset = (lane - Math.round(car.lane)) * this.route.laneWidth;
    const pos = car.body.position;
    const tx = pos.x - forward.z * offset, tz = pos.z + forward.x * offset;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.body.position.x - tx, dz = other.body.position.z - tz;
      const along = dx * forward.x + dz * forward.z;
      const side = Math.abs(dx * -forward.z + dz * forward.x);
      if (side > 3) continue;
      if (along > -11 && along < 28) return false;
    }
    return true;
  }

  // Distance to the next car in front, along this car's own heading.
  gapAhead(car, pos, forward) {
    let best = 999;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.body.position.x - pos.x, dz = other.body.position.z - pos.z;
      const along = dx * forward.x + dz * forward.z;
      if (along <= 0 || along > best) continue;
      const side = Math.abs(dx * -forward.z + dz * forward.x);
      if (side < 2.6) best = along;
    }
    return best;
  }

  syncAll() {
    const t = this.temp;
    for (const car of this.cars) {
      t.position.copy(car.body.position);
      t.quaternion.copy(car.body.quaternion);
      t.scale.set(1, 1, 1);
      t.updateMatrix();
      for (const mesh of Object.values(this.bodyMeshes)) mesh.setMatrixAt(car.index, t.matrix);
      for (let i = 0; i < 4; i++) {
        car.vehicle.updateWheelTransform(i);
        const transform = car.vehicle.wheelInfos[i].worldTransform;
        t.position.copy(transform.position);
        t.quaternion.copy(transform.quaternion);
        t.scale.set(1, 1, 1);
        t.updateMatrix();
        for (const mesh of Object.values(this.wheelMeshes)) mesh.setMatrixAt(car.index * 4 + i, t.matrix);
      }
    }
    for (const mesh of Object.values(this.bodyMeshes)) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of Object.values(this.wheelMeshes)) mesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMeshes.paint?.instanceColor) this.bodyMeshes.paint.instanceColor.needsUpdate = true;
  }
}
