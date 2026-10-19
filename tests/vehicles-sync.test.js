import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import * as THREE from 'three';
import {DrivingPhysics,VEHICLES} from '../src/physics.js';
import {createCar} from '../src/car.js';
import {SharedTraffic} from '../src/sharedTraffic.js';
import {gridRoute} from '../src/route.js';
import {npcPose,cleanDents,damageNPC} from '../src/sharedTrafficRules.js';
import {isTwoWheeler, VEHICLE_CATEGORIES, categoryOf, matchesCategory} from '../src/vehicleModels.js';

for (const id of ['rider','swift','vesper']) test(`${id} wheelie raises the visible front wheel/rider, preserves the rear pivot and lands on release`,()=>{
  const physics=new DrivingPhysics(id),scene=new THREE.Scene(),car=createCar(scene);car.setProfile(VEHICLES[id]);
  for(let i=0;i<720;i++)physics.step({forward:true,wheelie:true});
  assert.ok(physics.forwardSpeed>5);assert.ok(physics.wheelie>.5);assert.ok(physics.chassis.position.y>0&&physics.chassis.position.y<2);
  car.sync(physics);assert.equal(car.wheels.filter(w=>w.visible).length,2);
  const rear=car.wheels[2].position.clone(),front=car.wheels[0].position.clone();
  car.visualPose(0);assert.ok(front.y-car.wheels[0].position.y>.7);assert.ok(rear.distanceTo(car.wheels[2].position)<.001);
  for(let i=0;i<240;i++)physics.step({});assert.ok(physics.wheelie<.001);
  physics.setVehicle('tempest');physics.step({forward:true,wheelie:true});assert.equal(physics.wheelie,0);car.dispose();
});

test('local and remote vehicle meshes have low draw counts and replay/clear visible dents',()=>{
  for(const id of ['rider','swift','vesper','tempest','formula','veloce']) {
    const scene=new THREE.Scene(),local=createCar(scene),remote=createCar(scene,{simple:true});local.setProfile(VEHICLES[id]);remote.setProfile(VEHICLES[id]);
    let meshes=0;remote.root.traverse(n=>{if(n.isMesh)meshes++;});remote.wheels.forEach(w=>w.traverse(n=>{if(n.isMesh)meshes++;}));assert.ok(meshes<=28,`${id}: ${meshes} meshes`);
    const panel=remote.root.children[0].children.find(n=>n.material===remote.paint),before=panel.geometry.attributes.position.array.slice();
    local.deform({x:.2,y:.3,z:isTwoWheeler(id)?-.7:-1.8},.6);remote.applyDamage(local.damageSnapshot());
    assert.notDeepEqual(panel.geometry.attributes.position.array,before,'visible deformation relayed');
    const damaged=panel.geometry.attributes.position.array.slice();remote.applyDamage(local.damageSnapshot());assert.deepEqual(panel.geometry.attributes.position.array,damaged,'no repeated deformation');
    local.repair();remote.applyDamage(local.damageSnapshot());assert.deepEqual(panel.geometry.attributes.position.array,before,'repair shared');local.dispose();remote.dispose();assert.equal(scene.children.length,0);
  }
});

test('vehicle categories cover every model once and keep both scooters distinct from motorcycles',()=>{
  const expected={cars:5,racing:4,bikes:1,scooters:2,aircraft:3};
  for(const [category,count] of Object.entries(expected)) {
    assert.ok(VEHICLE_CATEGORIES[category]);
    assert.equal(Object.keys(VEHICLES).filter(id=>matchesCategory(id,category)).length,count);
  }
  for(const id of Object.keys(VEHICLES)) {
    assert.equal(Object.keys(expected).filter(category=>matchesCategory(id,category)).length,1);
    assert.ok(matchesCategory(id,'all'));assert.ok(matchesCategory(id,categoryOf(id)));
  }
  assert.equal(categoryOf('rider'),'bikes');
  for(const id of ['swift','vesper']){assert.equal(categoryOf(id),'scooters');assert.ok(isTwoWheeler(id));}
});

test('shared NPC paths are identical at the same room time and keep stable IDs/paint across density changes',()=>{
  for(const map of ['portside','coastline'])for(let i=0;i<64;i++) {
    const a=npcPose(map,i,1000,12345),b=npcPose(map,i,1000,12345);assert.deepEqual(a,b);assert.equal(a.id,'npc-'+i);assert.ok(Number.isFinite(a.x+a.z));
    const next=npcPose(map,i,1000,12395);assert.ok(Math.hypot(a.x-next.x,a.z-next.z)<3);
  }
  assert.equal(npcPose('apex',0,0,1000),null);
});

test('shared traffic creates only nearby proxies, renders shared damage, never rewinds on player reset',()=>{
  const old=Date.now;Date.now=()=>12000;
  try {
    const route=gridRoute([-84,84],{lanes:2,laneWidth:4.4,speedLimit:21}),scene=new THREE.Scene(),physics=new DrivingPhysics();physics.chassis.collisionFilterGroup=2;
    const room={map:'portside',density:15,trafficEpoch:1000,serverNow:12000,npcDamage:Array(64).fill(0)},traffic=new SharedTraffic(scene,physics,route,room,()=>{});
    const p=npcPose('portside',0,1000,12000);physics.placeAt(p.x,p.z);traffic.update(.016);traffic.beforeStep();
    const poses=traffic.cars.map(c=>c.body.position.clone());traffic.reset();traffic.update(.016);assert.deepEqual(traffic.cars.map(c=>c.body.position),poses);
    room.npcDamage[0]=80;traffic.sync(room);traffic.update(.016);
    assert.equal(traffic.visual.bodyMeshes.paint.geometry.attributes.npcDamage.getX(0),80);
    const shader={vertexShader:'#include <begin_vertex>'};traffic.visual.bodyMeshes.paint.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/transformed.z-=sign/);
    traffic.setDensity(0);assert.equal(traffic.proxies.peers.size,0);assert.equal(physics.world.bodies.length,2);
    traffic.dispose();assert.equal(scene.children.length,0);
  } finally {Date.now=old;}
});

test('damage payloads are bounded and NPC damage requires a nearby, recent moving player',()=>{
  assert.equal(cleanDents(Array(100).fill({x:999,y:999,z:-999,s:99})).length,24);assert.deepEqual(cleanDents([{},null,{x:NaN}]),[]);
  const room={map:'portside',density:15,trafficEpoch:1000,npcDamage:Array(64).fill(0),npcHits:Array(64).fill(0)};
  const npc=npcPose(room.map,0,1000,2000),player={...npc,vx:npc.vx+10,stateAt:2000};
  assert.ok(damageNPC(room,player,0,2000));assert.ok(room.npcDamage[0]>0);assert.equal(damageNPC(room,player,0,2100),false);
  assert.equal(damageNPC(room,{...player,x:500},1,2200),false);assert.equal(damageNPC(room,player,99,2200),false);assert.equal(damageNPC(room,player,0,5000),false);
});

test('relay shares bike wheelies/dents, room NPC epoch/damage and repair with late joiners',{timeout:10000},async t=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());
  const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve(m[1]);});});
  async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiting=[];ws.on('message',raw=>{const p=JSON.parse(raw);waiting.length?waiting.shift()(p):queue.push(p);});t.after(()=>ws.terminate());await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {send:p=>ws.send(JSON.stringify(p)),next:()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>waiting.push(r))};}
  const host=await client();host.send({t:'create',map:'portside',name:'Host'});const hw=await host.next();
  const guest=await client();guest.send({t:'join',room:hw.room,name:'Biker',vehicle:'rider'});const gw=await guest.next();await host.next();assert.equal(gw.trafficEpoch,hw.trafficEpoch);
  const npc=npcPose('portside',0,hw.trafficEpoch,Date.now());
  guest.send({t:'state',...npc,vehicle:'rider',wheelie:.6,damage:35,dents:[{x:.2,y:.3,z:-.7,s:.4}],vx:npc.vx+12});
  const state=await host.next();assert.equal(state.player.vehicle,'rider');assert.equal(state.player.wheelie,.6);assert.equal(state.player.dents.length,1);assert.equal(state.player.damage,35);
  guest.send({t:'npcHit',index:0});const damage=await host.next();await guest.next();assert.equal(damage.t,'npcDamage');assert.ok(damage.npcDamage[0]>0);
  const late=await client();late.send({t:'join',room:hw.room,name:'Late'});const lw=await late.next();assert.deepEqual(lw.npcDamage,damage.npcDamage);assert.equal(lw.trafficEpoch,hw.trafficEpoch);assert.equal(lw.players.find(p=>p.name==='Biker').wheelie,.6);await host.next();await guest.next();
  for(const vehicle of ['swift','vesper']) {
    await new Promise(r=>setTimeout(r,50));
    guest.send({t:'state',...npc,vehicle,wheelie:.6,damage:20,dents:[{x:.2,y:.3,z:-.7,s:.4}]});
    const scooter=await host.next();assert.equal(scooter.player.vehicle,vehicle);assert.equal(scooter.player.wheelie,.6);assert.equal(scooter.player.dents.length,1);
    assert.equal(scooter.player.name,'Biker');
  }
  await new Promise(r=>setTimeout(r,50));guest.send({t:'state',...npc,vehicle:'formula',wheelie:.6,damage:0,dents:[]});const repaired=await host.next();assert.equal(repaired.player.wheelie,0);assert.deepEqual(repaired.player.dents,[]);
});
