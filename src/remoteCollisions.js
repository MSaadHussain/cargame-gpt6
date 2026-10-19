import * as CANNON from 'cannon-es';
import { modelOf } from './vehicleModels.js';
import { VEHICLES } from './physics.js';

// Browser-only proxy bodies. The relay never steps physics.
export class RemoteCollisions {
  constructor(physics) { this.physics = physics; this.peers = new Map(); }
  remove(id) {
    const peer = this.peers.get(id);
    if (peer) this.physics.world.removeBody(peer.body);
    this.peers.delete(id);
  }
  clear() { for (const id of this.peers.keys()) this.remove(id); }
  protectSpawn() { for (const peer of this.peers.values()) { peer.ready = false; peer.body.collisionFilterMask = 0; } }
  receive(data, now = performance.now()) {
    if (!data.ready) return;
    let peer = this.peers.get(data.id);
    if (peer && peer.vehicle !== data.vehicle) { this.remove(data.id); peer = null; }
    if (!peer) {
      const m = modelOf(data.vehicle);
      const body = new CANNON.Body({ mass: VEHICLES[data.vehicle]?.mass || 1480,
        material: this.physics.carMaterial, collisionFilterGroup: 4, collisionFilterMask: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(m.width/2,.27,m.length/2)), new CANNON.Vec3(0,.26,0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(m.width*.4,(m.roof-.48)/2,(m.cabinRear+1.14)/2)), new CANNON.Vec3(0,(m.roof+.48)/2,(m.cabinRear-1.14)/2));
      this.physics.world.addBody(body);
      peer = { body, vehicle: data.vehicle, ready: false }; this.peers.set(data.id, peer);
    }
    if (peer.data && Math.hypot(data.x-peer.data.x,data.z-peer.data.z) > 12) peer.ready = false;
    peer.data = data; peer.received = now;
  }
  beforeStep(now = performance.now()) {
    const local = this.physics.chassis, localModel = modelOf(this.physics.spec.id);
    for (const peer of this.peers.values()) {
      const { body, data } = peer;
      const age = Math.max(0,(now-peer.received)/1000);
      if (age > .75) { body.collisionFilterMask = 0; body.velocity.setZero(); peer.ready = false; continue; }
      const ahead = Math.min(age,.15);
      body.position.set(data.x+(data.vx||0)*ahead,data.y+(data.vy||0)*ahead,data.z+(data.vz||0)*ahead);
      body.quaternion.set(data.qx,data.qy,data.qz,data.qw); body.quaternion.normalize();
      body.velocity.set(data.vx||0,data.vy||0,data.vz||0); body.angularVelocity.set(data.wx||0,data.wy||0,data.wz||0);
      body.force.set(0,body.mass*9.81,0); body.torque.setZero(); body.aabbNeedsUpdate = true; body.wakeUp();
      const safeDistance = (modelOf(peer.vehicle).length+localModel.length)/2+.5;
      if (!peer.ready && body.position.distanceTo(local.position) > safeDistance) peer.ready = true;
      body.collisionFilterMask = peer.ready ? 2 : 0;
    }
  }
}
