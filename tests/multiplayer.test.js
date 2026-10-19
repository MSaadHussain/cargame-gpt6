import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { WebSocket } from 'ws';
import { DrivingPhysics, VEHICLES, FIXED_STEP } from '../src/physics.js';
import { RemoteCollisions } from '../src/remoteCollisions.js';
import { modelOf, isAircraft } from '../src/vehicleModels.js';
import { createCar, createCarGeometry } from '../src/car.js';
import { playerName } from '../src/playerName.js';

test('driver names reject blanks and invisible characters, and preserve typed names', () => {
  for (const value of ['', '   ', '\u200b\u200e', '<>','\n',null,{}]) assert.equal(playerName(value),'');
  assert.equal(playerName('  Ali   Khan  '),'Ali Khan');
  assert.equal(playerName('علی'),'علی');
  assert.equal(playerName('a'.repeat(20)).length,16);
});

test('fifteen models have finite geometry and stable driving or flight physics', () => {
  assert.equal(Object.keys(VEHICLES).length,15);
  const counts = new Set();
  for (const id of Object.keys(VEHICLES)) {
    const p = new DrivingPhysics(id);
    for (let i=0;i<360;i++) p.step({forward:true});
    assert.ok(p.forwardSpeed > 3,id+' drives forward');
    assert.ok(p.chassis.position.y > 0 && p.chassis.position.y < (isAircraft(id)?1800:2),id+' stays in valid altitude');
    assert.equal(p.chassis.shapes[0].halfExtents.z,modelOf(id).length/2);
    const geometry = createCarGeometry({model:id,interior:false,detail:false});
    counts.add(createHash('sha256').update(Buffer.from(geometry.body.paint.attributes.position.array.buffer)).digest('hex'));
    for (const geo of [...Object.values(geometry.body),...Object.values(geometry.wheel)]) {
      assert.ok([...geo.attributes.position.array].every(Number.isFinite)); geo.dispose();
    }
  }
  assert.ok(counts.size >= 6,'five new models have distinct geometry');
});
test('switching all fifteen rendered vehicles preserves cockpit, wheels and damage handling', () => {
  const previous = globalThis.document;
  globalThis.document = {createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const scene=new THREE.Scene(), p=new DrivingPhysics();
  try {
    const car=createCar(scene);
    car.setCockpit(true);
    for (const spec of [...Object.values(VEHICLES), VEHICLES.veloce]) {
      p.setVehicle(spec.id); car.setProfile(spec); car.sync(p); car.deform({x:0,y:.5,z:-1.5},.4); car.repair();
      assert.equal(car.wheels.length,4);
      assert.ok(car.root.children.length > 0);
      car.root.traverse(node=>{if(node.geometry) assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));});
    }
    car.dispose(); assert.equal(scene.children.length,0);
  } finally { globalThis.document=previous; }
});
const packet = overrides => ({id:'peer',ready:true,vehicle:'veloce',x:-5.2,y:.56,z:15,qx:0,qy:0,qz:0,qw:1,vx:0,vy:0,vz:0,...overrides});
test('browser player collision blocks passage and produces real damage', () => {
  const p = new DrivingPhysics(); p.chassis.collisionFilterGroup = 2;
  const collisions = new RemoteCollisions(p);
  for (let i=0;i<720;i++) {
    const now=i*1000*FIXED_STEP;
    if(i%6===0) collisions.receive(packet(),now);
    collisions.beforeStep(now); p.step({forward:true});
  }
  assert.ok(p.chassis.position.z > 17,'does not pass through parked player');
  assert.ok(p.damage > 0,'collision enters existing damage system');
  assert.ok(p.impacts.length > 0);
});
test('moving remote player transfers momentum to an idle local car', () => {
  const p = new DrivingPhysics(); p.chassis.collisionFilterGroup=2;
  for(let i=0;i<240;i++) p.step({});
  const collisions=new RemoteCollisions(p);
  for(let i=0;i<120;i++) {
    const now=i*1000*FIXED_STEP;
    if(i%6===0) collisions.receive(packet({z:24+i*FIXED_STEP*12,vz:12}),now);
    collisions.beforeStep(now); p.step({});
  }
  assert.ok(p.chassis.position.z > 34.5,'impact pushes the stationary player');
  assert.ok(p.damage > 0);
});
test('spawn overlaps, stale packets, profile changes and departures are safe', () => {
  const p=new DrivingPhysics(); p.chassis.collisionFilterGroup=2;
  const c=new RemoteCollisions(p); c.receive(packet({z:34}),0); c.beforeStep(0);
  assert.equal(c.peers.get('peer').body.collisionFilterMask,0);
  c.receive(packet({z:15}),100); c.beforeStep(100);
  assert.equal(c.peers.get('peer').body.collisionFilterMask,2);
  c.beforeStep(900); assert.equal(c.peers.get('peer').body.collisionFilterMask,0);
  c.receive(packet({vehicle:'hauler'}),1000); c.beforeStep(1000);
  assert.equal(c.peers.get('peer').body.mass,VEHICLES.hauler.mass);
  c.protectSpawn(); assert.equal(c.peers.get('peer').body.collisionFilterMask,0);
  const size=p.world.bodies.length; c.clear(); assert.equal(p.world.bodies.length,size-1);
});

test('relay preserves models/velocities, traffic permissions and public matchmaking', {timeout:12000}, async t => {
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>server.kill());
  const port=await new Promise((resolve,reject)=>{
    server.once('error',reject); server.stderr.on('data',data=>reject(Error(String(data))));
    server.stdout.on('data',data=>{ const m=String(data).match(/listening on (\d+)/); if(m) resolve(m[1]); });
  });
  async function client() {
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`), queue=[], waiting=[];
    ws.on('message',raw=>{const p=JSON.parse(raw); const waiter=waiting.shift(); if(waiter) waiter(p); else queue.push(p);});
    t.after(()=>ws.terminate());
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    return {send:p=>ws.send(JSON.stringify(p)),next:()=>queue.length ? Promise.resolve(queue.shift()) : new Promise(r=>waiting.push(r))};
  }
  const unnamed=await client();
  for (const type of ['quick','create','join']) {
    unnamed.send({t:type,room:'ABC123',name:' \u200b '});
    assert.equal((await unnamed.next()).t,'error','name required for '+type);
  }
  const admin=await client(); admin.send({t:'create',map:'portside',name:'Owner',vehicle:'hauler'});
  const welcome=await admin.next(); assert.equal(welcome.isAdmin,true); assert.equal(welcome.density,15); assert.equal(welcome.name,'Owner');
  const guest=await client(); guest.send({t:'join',room:welcome.room,name:'Guest',vehicle:'viper'});
  assert.equal((await guest.next()).isAdmin,false); await admin.next();
  guest.send({t:'traffic',density:63});
  guest.send({t:'state',vehicle:'viper',vx:11,vz:-13,wx:.4,x:4,y:1,z:2,qw:1,paint:'#ffffff'});
  const state=await admin.next(); assert.equal(state.t,'state'); assert.equal(state.player.vehicle,'viper'); assert.equal(state.player.vz,-13); assert.equal(state.player.name,'Guest');
  admin.send({t:'traffic',density:22});
  assert.equal((await admin.next()).density,22); assert.equal((await guest.next()).density,22);
  const late=await client(); late.send({t:'join',room:welcome.room,name:'Late driver'}); assert.equal((await late.next()).density,22);
  const a=await client(); a.send({t:'quick',map:'coastline',name:'A'}); const aw=await a.next(); assert.equal(aw.isAdmin,false);
  a.send({t:'traffic',density:0});
  const b=await client(); b.send({t:'quick',map:'coastline',name:'B'}); const bw=await b.next(); assert.equal(bw.room,aw.room); assert.equal(bw.density,15);
});
