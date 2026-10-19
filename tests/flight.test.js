import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import * as THREE from 'three';
import {DrivingPhysics,VEHICLES} from '../src/physics.js';
import {AirCombat,flightSpawn,shotDirection} from '../src/airCombatRules.js';
import {vehicleForMap} from '../src/vehicleModels.js';
import {createCar,createCarGeometry} from '../src/car.js';
import {createAirEffects} from '../src/dogfight.js';
import {buildWorld} from '../src/world.js';
import {orbitPose} from '../src/cameraOrbit.js';

test('aircraft-only map policy applies to joins and profile changes',()=>{
  assert.equal(vehicleForMap('rider','skyport'),'kestrel');assert.equal(vehicleForMap('skyliner','skyport'),'skyliner');
  assert.equal(vehicleForMap('kestrel','apex'),'veloce');assert.equal(vehicleForMap('swift','portside'),'swift');
  assert.equal(vehicleForMap('bogus','skyport'),'kestrel');
});

test('fighter and airliner fly, climb, bank, stall and return safely to car physics',()=>{
  for(const id of ['kestrel','skyliner','sparrow']) {
    const p=new DrivingPhysics(id);assert.equal(p.world.bodies.length,2);
    for(let i=0;i<240;i++)p.step({forward:true,pitchAxis:.25,yawAxis:-.25,rollAxis:-.2});
    assert.ok(p.chassis.position.y>275);assert.ok(p.chassis.velocity.length()>70);assert.ok(p.flight.heading<0);
    assert.ok(Number.isFinite(p.chassis.quaternion.w));
    const bank=p.flight.roll;for(let i=0;i<240;i++)p.step({});assert.equal(p.flight.roll,bank,'attitude is preserved without input');
    p.placeAt(0,0,0,3);p.chassis.quaternion.setFromEuler(-.8,0,0);p.flight.speed=180;for(let i=0;i<4;i++)p.step({});assert.equal(p.flight.crashed,true);assert.equal(p.damage,100);
    p.damage=0;p.placeAt(0,0,0,260);assert.equal(p.flight.crashed,false);
    p.flight.throttle=0;p.flight.speed=5;for(let i=0;i<120;i++)p.step({});assert.ok(p.chassis.position.y<250,'slow aircraft stalls');
    p.setVehicle('veloce');for(let i=0;i<360;i++)p.step({forward:true});assert.ok(p.forwardSpeed>3);assert.ok(p.chassis.position.y<2);assert.equal(p.world.bodies.length,2);
    p.setVehicle(id);assert.equal(p.world.bodies.length,2);assert.ok(p.chassis.position.y>200);
  }
});

test('flight controls use a 3D cannon direction and an aircraft-sized chase camera',()=>{
  const p=new DrivingPhysics('kestrel');for(let i=0;i<240;i++)p.step({pitchAxis:.5,yawAxis:-.5});
  const q=p.chassis.quaternion,d=shotDirection({qx:q.x,qy:q.y,qz:q.z,qw:q.w});
  const expected=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
  assert.ok(expected.distanceTo(new THREE.Vector3(d.x,d.y,d.z))<1e-6);assert.ok(d.y>0&&d.x>0);
  const pose=orbitPose(p.chassis.position,q,{aircraftLength:64});assert.ok(pose.position.distanceTo(p.chassis.position)>80);
});

const position=(id,z,vehicle='kestrel',now=6000)=>({id,name:id,vehicle,x:0,y:300,z,qx:0,qy:0,qz:0,qw:1,ready:true,stateAt:now});
test('cannon checks range/direction/cooldown, shields, airliner weapons and server-owned health',()=>{
  const combat=new AirCombat();combat.join('a','Pilot A',0);combat.join('b','Pilot B',0);
  const peers=new Map([['a',position('a',0)],['b',position('b',-200)]]);
  assert.equal(combat.fire('a',peers,500),null,'stale future state rejected');
  peers.get('a').stateAt=100;peers.get('b').stateAt=100;
  assert.equal(combat.fire('a',peers,100).hit,null,'spawn shield');
  for(const v of peers.values())v.stateAt=6000;
  const shot=combat.fire('a',peers,6000);assert.equal(shot.hit,'b');assert.equal(combat.pilots.get('b').hp,75);
  assert.equal(combat.fire('a',peers,6100),null,'fire rate');
  for(const now of [6250,6500,6750]){for(const v of peers.values())v.stateAt=now;const event=combat.fire('a',peers,now);if(now===6750)assert.equal(event.destroyed.id,'b');}
  assert.equal(combat.pilots.get('a').kills,1);assert.equal(combat.pilots.get('b').deaths,1);
  assert.equal(combat.respawn('b',7000),null);assert.deepEqual(combat.respawn('b',10750),flightSpawn(1));assert.equal(combat.pilots.get('b').hp,100);
  peers.get('a').vehicle='skyliner';peers.get('a').stateAt=11000;assert.equal(combat.fire('a',peers,11000),null,'airliner is unarmed');
  peers.get('a').vehicle='kestrel';peers.get('b').z=200;for(const v of peers.values())v.stateAt=17000;
  assert.equal(combat.fire('a',peers,17000).hit,null,'behind shooter');
  peers.get('b').z=-1600;for(const v of peers.values())v.stateAt=18000;assert.equal(combat.fire('a',peers,18000).hit,null,'out of range');
});

test('aircraft geometry and Skyport remain low-detail and dispose cleanly',()=>{
  const scene=new THREE.Scene(),p=new DrivingPhysics('kestrel'),world=buildWorld(scene,p,'skyport');
  let meshes=0;scene.traverse(n=>{if(n.isMesh)meshes++;if(n.geometry)assert.ok([...n.geometry.attributes.position.array].every(Number.isFinite));});
  assert.ok(meshes<180);assert.equal(p.scenery.length,0);assert.equal(world.map.traffic,0);world.dispose();assert.equal(scene.children.length,0);
  const shapes=[];
  for(const id of ['kestrel','skyliner']) {
    const geo=createCarGeometry({model:id,detail:false});const count=Object.values(geo.body).reduce((s,g)=>s+g.attributes.position.count/3,0);assert.ok(count<10000,`${id}: ${count} triangles`);shapes.push(count);Object.values(geo.body).forEach(g=>g.dispose());Object.values(geo.wheel).forEach(g=>g.dispose());
    const car=createCar(scene);car.setProfile(VEHICLES[id]);car.visualPose();assert.equal(car.wheels.filter(w=>w.visible).length,0);car.dispose();
  }
  assert.notEqual(shapes[0],shapes[1]);assert.equal(scene.children.length,0);
});

test('air explosions and cannon tracers have strict caps and expire without physics bodies',()=>{
  const scene=new THREE.Scene(),fx=createAirEffects(scene);
  for(let i=0;i<100;i++){fx.explode({x:0,y:100,z:0});fx.shot({origin:{x:0,y:100,z:0},direction:{x:0,y:0,z:-1},length:900});}
  assert.deepEqual(fx.stats(),{airParticles:128,airTracers:24});for(let i=0;i<180;i++)fx.update(1/60);
  assert.deepEqual(fx.stats(),{airParticles:0,airTracers:0});fx.dispose();assert.equal(scene.children.length,0);
});

test('real relay enforces aircraft rooms, high-altitude sync and cannon destruction/respawn',{timeout:15000},async t=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());
  const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve(m[1]);});});
  async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiting=[];ws.on('message',raw=>{const p=JSON.parse(raw);waiting.length?waiting.shift()(p):queue.push(p);});t.after(()=>ws.terminate());await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {send:p=>ws.send(JSON.stringify(p)),async until(type){for(;;){const p=queue.length?queue.shift():await new Promise(r=>waiting.push(r));if(p.t===type)return p;}}};}
  const a=await client();a.send({t:'create',map:'skyport',vehicle:'veloce',name:'Ace'});const aw=await a.until('welcome');assert.equal(aw.vehicle,'kestrel');assert.equal(aw.density,0);assert.ok(aw.airSpawn.y>100);
  const b=await client();b.send({t:'join',room:aw.room,vehicle:'kestrel',name:'Wing'});const bw=await b.until('welcome');assert.equal(bw.map,'skyport');assert.notEqual(aw.airSpawn.x,bw.airSpawn.x);
  const state=(z)=>({t:'state',x:0,y:500,z,qx:0,qy:0,qz:0,qw:1,vehicle:'kestrel',vx:0,vy:0,vz:-220,damage:100});
  a.send(state(0));const received=await b.until('state');assert.equal(received.player.y,500);assert.equal(received.player.vz,-220);assert.equal(received.player.damage,0,'health cannot be overwritten by client');
  await new Promise(r=>setTimeout(r,5100));
  for(let i=0;i<4;i++){a.send(state(0));b.send({...state(-200),x:60});await a.until('state');await b.until('state');a.send({t:'airFire',aim:{x:60,y:500,z:-200},target:'fake',damage:999});const shot=await a.until('airShot');await b.until('airShot');assert.equal(shot.hit,bw.id);assert.ok(shot.direction.x>0,'relay uses cursor-ray aim, not just nose');if(i===3){assert.equal(shot.destroyed.id,bw.id);assert.equal(shot.air.pilots.find(p=>p.id===aw.id).kills,1);}if(i<3)await new Promise(r=>setTimeout(r,270));}
  const late=await client();late.send({t:'join',room:aw.room,vehicle:'skyliner',name:'Airliner'});const lw=await late.until('welcome');assert.equal(lw.vehicle,'skyliner');assert.equal(lw.air.pilots.find(p=>p.id===bw.id).hp,0);
  await new Promise(r=>setTimeout(r,4050));b.send({t:'airRespawn'});const respawn=await b.until('airRespawn');assert.ok(respawn.spawn.y>100);
});
