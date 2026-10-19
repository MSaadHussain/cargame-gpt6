import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {CIRCUIT,GATES,BOOSTS,gridSlot,checkpointSpawn,crossedGate} from '../src/circuit.js';
import {Race} from '../src/raceRules.js';
import {buildWorld} from '../src/world.js';
import {DrivingPhysics} from '../src/physics.js';
import {orbitPose} from '../src/cameraOrbit.js';
import {createRacing} from '../src/racing.js';

const at=(gate,d,side=0)=>({x:gate.x+gate.nx*d-gate.nz*side,y:1,z:gate.z+gate.nz*d+gate.nx*side,vx:gate.nx*25,vz:gate.nz*25});
const players=[{id:'a',name:'Ali'},{id:'b',name:'Zain'}];
function cross(race,id,gate,time) {race.update(id,at(gate,-2),time);return race.update(id,at(gate,2),time+100);}

test('5.4 km circuit closes, has eight correctly oriented grid slots and safe recovery locations',()=>{
  assert.ok(Math.abs(CIRCUIT.total-5400)<.001);
  assert.deepEqual(CIRCUIT.sample(0),CIRCUIT.sample(1));
  assert.equal(GATES.length,24);assert.equal(BOOSTS.length,4);
  for(let i=0;i<8;i++) {
    const p=gridSlot(i),v=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),p.heading);
    assert.ok(v.x*p.nx+v.z*p.nz>.999);
    assert.ok(CIRCUIT.nearest(p.x,p.z).distance<5);
    for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-gridSlot(j).x,p.z-gridSlot(j).z)>6);
  }
  for(let i=0;i<24;i++)assert.ok(CIRCUIT.nearest(checkpointSpawn(i).x,checkpointSpawn(i).z).distance<5);
});

test('gates require forward, road-width crossings and reject airborne cars and teleports',()=>{
  const gate=GATES[1];
  assert.ok(crossedGate(at(gate,-2),at(gate,2),gate));
  assert.ok(!crossedGate(at(gate,2),at(gate,-2),gate));
  assert.ok(!crossedGate(at(gate,-2,20),at(gate,2,20),gate));
  assert.ok(!crossedGate(at(gate,-50),at(gate,50),gate));
  assert.ok(!crossedGate(at(gate,-2),{...at(gate,2),y:10},gate));
});

test('race countdown, ordered checkpoints, points, finish ranking and full restart',()=>{
  const race=new Race();let time=10000;race.start(players,time);
  assert.equal(race.phase(time),'countdown');assert.equal(cross(race,'a',GATES[1],time+500),false);
  time+=5000;
  assert.equal(cross(race,'a',GATES[2],time),false,'skipping next gate rejected');
  for(let n=1;n<=72;n++) {time+=2000;assert.equal(cross(race,'a',GATES[n%24],time),true);}
  let a=race.snapshot(time+100).drivers[0];assert.equal(a.passed,72);assert.equal(a.points,9700);assert.ok(a.finishMs>0);
  assert.equal(race.phase(time+100),'running','remaining player can still finish');
  race.leave('b');assert.equal(race.phase(time+100),'finished');
  const reset=race.start(players,time+200);assert.equal(reset.id,2);assert.equal(reset.phase,'countdown');
  assert.ok(reset.drivers.every(p=>p.passed===0&&p.points===0&&p.finishMs===null));
});

test('boosts are single-use per lap; checkpoint recovery preserves progress and removes boost',()=>{
  const race=new Race();race.start(players,10000);
  const boost=BOOSTS[0];assert.ok(race.update('a',at(boost,0),15000));
  assert.equal(race.drivers.get('a').points,25);assert.equal(race.update('a',at(boost,0),15100),false);
  assert.equal(race.drivers.get('a').boostUntil,17300);
  assert.ok(cross(race,'a',GATES[1],16000));
  const spawn=race.recover('a',17000);assert.deepEqual(spawn,checkpointSpawn(1,0));
  assert.equal(race.drivers.get('a').passed,1);assert.equal(race.drivers.get('a').boostUntil,0);
  assert.equal(race.recover('a',17200),null,'recovery throttled');
  assert.equal(cross(race,'a',GATES[1],18000),false,'cannot farm previous gate');
  let time=18000;for(let n=2;n<=24;n++){time+=2000;cross(race,'a',GATES[n%24],time);}
  assert.ok(race.update('a',at(boost,0),time+1000),'boost returns on next lap');
});

test('chase camera orbits 360 degrees, zooms and stays above ground when car rolls',()=>{
  const position=new THREE.Vector3(0,1,0),q=new THREE.Quaternion();
  const a=orbitPose(position,q),b=orbitPose(position,q,{yaw:Math.PI});
  assert.ok(Math.abs(a.position.x+b.position.x)<.001);assert.ok(Math.abs(a.position.z+b.position.z)<.001);
  assert.ok(orbitPose(position,q,{zoom:2}).position.distanceTo(a.target)>a.position.distanceTo(a.target)*1.9);
  q.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  assert.ok(orbitPose(position,q).position.y>position.y);
});

test('browser race controller locks the grid, applies boost locally, recovers and enforces host UI',()=>{
  class Element {
    constructor(){this.children=[];this.nodes=new Map();this.dataset={};this.classList={toggle(){}};}
    querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
    append(...nodes){this.children.push(...nodes);} replaceChildren(){this.children=[];} setAttribute(){}
  }
  const oldDocument=globalThis.document,oldNow=Date.now,root=new Element();let time=10000;
  globalThis.document={createElement:()=>new Element(),querySelector:()=>root};Date.now=()=>time;
  try {
    const physics=new DrivingPhysics();let requests=0,placed=0;
    const race=createRacing(physics,{place:p=>{placed++;physics.placeAt(p.x,p.z,p.heading);},start:()=>requests++,recover:()=>requests++,name:()=>'<Ali>',toast(){}});
    race.map('apex');race.start();assert.ok(race.locked);assert.equal(placed,1);
    physics.chassis.velocity.set(10,0,10);race.beforeStep();assert.equal(physics.chassis.velocity.x,0);assert.equal(physics.chassis.velocity.z,0);
    time=15000;assert.equal(race.locked,false);
    const boost=BOOSTS[0];physics.chassis.position.set(boost.x,1,boost.z);physics.chassis.velocity.set(boost.nx*20,0,boost.nz*20);
    race.update();race.beforeStep();assert.ok(physics.chassis.force.length()>1000,'boost is a browser physics force');
    race.recover();assert.equal(placed,2);
    physics.chassis.force.setZero();race.beforeStep();assert.equal(physics.chassis.force.length(),0,'recovery cancelled boost');
    race.offline();race.joined({id:'guest',raceHostId:'host',race:new Race().snapshot()});race.start();assert.equal(requests,0);
    race.receive({t:'raceState',raceHostId:'guest',race:new Race().snapshot()});race.start();assert.equal(requests,1);
    race.map('portside');assert.equal(race.recover(),false);
  } finally {globalThis.document=oldDocument;Date.now=oldNow;}
});

test('race world geometry is finite, centreline stays clear of scenery, and map disposes cleanly',()=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const scene=new THREE.Scene(),physics=new DrivingPhysics();
  try {
    const world=buildWorld(scene,physics,'apex');assert.equal(world.map.traffic,0);
    scene.traverse(node=>{if(node.geometry)assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));});
    for(let i=0;i<600;i++) for(const lane of [0,1.5,3]) {
      const p=CIRCUIT.sample(i/600,lane),hit=new CANNON.RaycastResult();
      world.update(p);
      const blocked=physics.world.raycastClosest(new CANNON.Vec3(p.x,4,p.z),new CANNON.Vec3(p.x,.15,p.z),{collisionFilterMask:1},hit);
      assert.equal(blocked,false,`blocked road at ${i}/600`);
    }
    world.dispose();physics.clearScenery();assert.equal(scene.children.length,0);
  } finally {globalThis.document=old;}
});

test('real relay restricts race controls, synchronizes restart/recovery, and isolates running public races',{timeout:15000},async t=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());
  const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve(m[1]);});});
  async function client(){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiters=[];
    ws.on('message',raw=>{const p=JSON.parse(raw);if(waiters.length)waiters.shift()(p);else queue.push(p);});
    t.after(()=>ws.terminate());await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
    return {send:p=>ws.send(JSON.stringify(p)),next:()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>waiters.push(r)),close:()=>ws.close()};
  }
  const host=await client();host.send({t:'create',map:'apex',name:'Host'});const welcome=await host.next();
  assert.equal(welcome.density,0);assert.equal(welcome.raceHostId,welcome.id);
  const guest=await client();guest.send({t:'join',room:welcome.room,name:'Guest'});const gw=await guest.next();await host.next();
  guest.send({t:'raceStart'});guest.send({t:'state',qw:1,x:0,y:1,z:0});
  assert.equal((await host.next()).t,'state','non-host start ignored');
  host.send({t:'traffic',density:15});host.send({t:'raceStart'});
  const started=await host.next(),gs=await guest.next();assert.equal(started.t,'raceStart');assert.deepEqual(started.race,gs.race);
  assert.equal(started.race.drivers.length,2);assert.equal(started.race.id,1);
  guest.send({t:'recover',raceId:1});assert.deepEqual((await guest.next()).spawn,gridSlot(1));await guest.next();await host.next();
  const late=await client();late.send({t:'join',room:welcome.room,name:'Late'});assert.equal((await late.next()).t,'error');
  await new Promise(r=>setTimeout(r,1550));host.send({t:'raceStart'});
  const restarted=await host.next();await guest.next();assert.equal(restarted.race.id,2);assert.ok(restarted.race.drivers.every(p=>p.passed===0));
  await new Promise(r=>setTimeout(r,Math.max(0,restarted.race.startAt-Date.now()+1000)));
  guest.send({t:'state',raceId:1,...at(GATES[1],-2),qw:1});assert.equal((await host.next()).t,'state');
  await new Promise(r=>setTimeout(r,45));
  guest.send({t:'state',raceId:1,...at(GATES[1],2),qw:1});assert.equal((await host.next()).t,'state','old race packets cannot score');
  await new Promise(r=>setTimeout(r,45));
  guest.send({t:'state',raceId:2,...at(GATES[1],-2),qw:1});assert.equal((await host.next()).t,'state');
  await new Promise(r=>setTimeout(r,45));
  guest.send({t:'state',raceId:2,...at(GATES[1],2),qw:1});
  const progress=await host.next();assert.equal(progress.t,'raceState');assert.equal(progress.race.drivers[0].passed,1);assert.equal(progress.race.drivers[0].id,gw.id);
  await host.next();await guest.next();
  host.close();assert.equal((await guest.next()).t,'leave');assert.equal((await guest.next()).raceHostId,gw.id,'remaining player becomes race host');
  const publicHost=await client();publicHost.send({t:'quick',map:'apex',name:'Public'});const pw=await publicHost.next();
  publicHost.send({t:'raceStart'});assert.equal((await publicHost.next()).t,'raceStart');
  const other=await client();other.send({t:'quick',map:'apex',name:'Other'});assert.notEqual((await other.next()).room,pw.room);
});
