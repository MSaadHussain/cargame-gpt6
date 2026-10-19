import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import * as THREE from 'three';
import {Arcade,PICKUPS,BREAKABLES,HAZARD_LIMIT} from '../src/arcadeRules.js';
import {Race} from '../src/raceRules.js';
import {createArcadeView} from '../src/arcadeView.js';
import {DrivingPhysics} from '../src/physics.js';
const drivers=()=>new Map(['a','b'].map(id=>[id,{id,name:id,passed:0,points:0,finishMs:null,dnf:false,boostUntil:0}]));
const state=(x,z,extra={})=>({x,y:1,z,qx:0,qy:0,qz:0,qw:1,vx:0,vz:0,...extra});

test('swept pickups award one item, share cooldowns and do not accept teleport collection',()=>{
  const a=new Arcade(()=>.6),d=drivers(),box=PICKUPS[0];
  a.update('a',state(box.x-4,box.z),d,1000);a.update('a',state(box.x+4,box.z),d,1100);
  assert.equal(a.player('a').item,'bolt');assert.equal(a.pickups[0],9100);
  a.update('b',state(box.x,box.z),d,1150);assert.equal(a.player('b').item,null);
  a.update('a',state(PICKUPS[2].x,PICKUPS[2].z),d,1200);assert.equal(a.pickups[2],0,'held item cannot be overwritten');
  a.update('b',state(box.x,box.z),d,9200);assert.equal(a.player('b').item,'bolt');
  const c=new Arcade();c.update('a',state(box.x-100,box.z),d,1000);c.update('a',state(box.x+100,box.z),d,1100);assert.equal(c.pickups[0],0);
});

test('items reject stale positions, consume once, expire and respect the shared hazard cap',()=>{
  const a=new Arcade(),d=drivers();a.update('a',state(0,0),d,1000);a.player('a').item='boost';
  assert.equal(a.use('a',d,1900),false);assert.equal(a.player('a').item,'boost');
  a.update('a',state(0,0),d,2000);assert.ok(a.use('a',d,2000));assert.equal(a.player('a').boostUntil,4500);assert.equal(a.use('a',d,2001),false);
  for(let i=0;i<HAZARD_LIMIT;i++){a.player('a').item='oil';assert.ok(a.use('a',d,2010+i));}
  a.player('a').item='bolt';assert.equal(a.use('a',d,2050),false);assert.equal(a.player('a').item,'bolt');
  a.update('a',state(0,0),d,12000);assert.equal(a.hazards.length,0);
});

test('pulse bolts hit once, shields consume the hit, and recovery grants brief immunity',()=>{
  for(const mode of ['normal','shield','recovery']) {
    const a=new Arcade(),d=drivers();a.update('a',state(0,0),d,1000);a.update('b',state(0,-30),d,1000);
    a.player('a').item='bolt';assert.ok(a.use('a',d,1000));
    if(mode==='shield')a.player('b').shieldUntil=7000;
    if(mode==='recovery')a.recover('b',1100);
    a.update('b',state(0,-30),d,1280);
    const hits=a.events.filter(e=>e.type==='hit');
    if(mode==='recovery'){assert.equal(hits.length,0);continue;}
    assert.equal(hits.length,1);assert.equal(hits[0].blocked,mode==='shield');
    assert.equal(d.get('a').points,mode==='shield'?0:75);assert.equal(a.hazards.length,0);
    a.update('b',state(0,-30),d,1350);assert.equal(a.events.filter(e=>e.type==='hit').length,1);
  }
});

test('oil drops behind the car, cannot hit its owner and catches a crossing opponent',()=>{
  const a=new Arcade(),d=drivers();a.update('a',state(0,0),d,1000);a.player('a').item='oil';a.use('a',d,1000);
  assert.equal(a.hazards[0].z,5);a.update('a',state(0,5),d,1300);assert.equal(a.hazards.length,1);
  a.update('b',state(0,5,{vx:20}),d,1350);assert.equal(a.hazards.length,0);assert.equal(a.events.at(-1).weapon,'oil');
});

test('cars and bolts break props once and new races reset every item and broken asset',()=>{
  const a=new Arcade(),d=drivers(),prop=BREAKABLES[0];
  a.update('a',state(prop.x-3,prop.z,{vx:20}),d,1000);a.update('a',state(prop.x+3,prop.z,{vx:20}),d,1100);
  assert.ok(a.broken.has(prop.id));assert.equal(d.get('a').points,10);
  a.update('a',state(prop.x,prop.z,{vx:20}),d,1200);assert.equal(d.get('a').points,10);
  const b=new Arcade();b.update('a',state(prop.x,prop.z+20),d,2000);b.player('a').item='bolt';b.use('a',d,2000);
  b.update('a',state(prop.x,prop.z+20),d,2250);assert.ok(b.broken.has(prop.id));assert.equal(b.hazards.length,0);
  const race=new Race();race.start([...d.values()],10000);race.arcade=a;race.start([...d.values()],12000);
  assert.equal(race.arcade.broken.size,0);assert.equal(race.arcade.events.length,0);assert.equal(race.arcade.players.size,0);
  race.arcade.player('a').item='bolt';assert.equal(race.useItem('a',12050),false,'countdown cannot fire');
});

test('arcade rendering bounds particles, deduplicates hits, adds no physics bodies and disposes',()=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  try {
    const scene=new THREE.Scene(),physics=new DrivingPhysics(),bodyCount=physics.world.bodies.length;
    const view=createArcadeView(scene,physics,()=>{});view.map('apex');
    const time=Date.now(),p=physics.chassis.position;
    const events=Array.from({length:24},(_,i)=>({seq:i+1,type:'break',owner:'b',prop:i,x:p.x,z:p.z}));
    events.push({seq:25,type:'hit',owner:'b',target:'a',weapon:'bolt',blocked:false,x:p.x,z:p.z,dx:1,dz:0});
    const snapshot={id:1,startAt:time-1000,serverNow:time,phase:'running',arcade:{players:{a:{shieldUntil:time+5000}},pickups:[],broken:[],hazards:[],events,seq:25}};
    physics.chassis.velocity.set(10,0,0);view.receive(snapshot,'a',true);assert.equal(physics.chassis.velocity.x,12);
    view.receive(snapshot,'a');assert.equal(physics.chassis.velocity.x,12,'same network event is not applied twice');view.update(.016);
    scene.traverse(mesh=>{if(mesh.isInstancedMesh)assert.ok(mesh.count<=mesh.instanceMatrix.count);});
    assert.equal(physics.world.bodies.length,bodyCount);assert.equal(scene.children[0].children.at(-1).count,64);
    view.map('portside');assert.equal(scene.children[0].visible,false);view.dispose();assert.equal(scene.children.length,0);
  } finally {globalThis.document=old;}
});

test('relay synchronizes collected/used items and destruction without trusting client item or hit claims',{timeout:12000},async t=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());
  const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve(m[1]);});});
  async function client(){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiters=[];
    ws.on('message',raw=>{const packet=JSON.parse(raw);if(waiters.length)waiters.shift()(packet);else queue.push(packet);});t.after(()=>ws.terminate());
    await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
    const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>waiters.push(r));
    return {send:p=>ws.send(JSON.stringify(p)),next,async race(){let p;do{p=await next();}while(p.t!=='raceState');return p.race;}};
  }
  const host=await client();host.send({t:'create',map:'apex',name:'Host'});const welcome=await host.next();
  const guest=await client();guest.send({t:'join',room:welcome.room,name:'Guest'});const gw=await guest.next();await host.next();
  host.send({t:'raceStart'});const start=await host.next();await guest.next();
  await new Promise(r=>setTimeout(r,Math.max(0,start.race.startAt-Date.now()+100)));
  guest.send({t:'useItem',raceId:1,item:'bolt'});guest.send({t:'hit',target:welcome.id});
  guest.send({t:'state',raceId:1,...state(PICKUPS[0].x,PICKUPS[0].z)});
  const picked=await host.race(),shared=await guest.race();assert.deepEqual(picked.arcade,shared.arcade);assert.ok(picked.arcade.players[gw.id].item);
  assert.equal(picked.arcade.events.some(e=>e.type==='hit'),false);
  guest.send({t:'useItem',raceId:999});guest.send({t:'useItem',raceId:1});
  const used=await host.race();await guest.race();assert.equal(used.arcade.players[gw.id].item,null);
  assert.equal(used.arcade.events.filter(e=>e.type==='use').length,1);
  await new Promise(r=>setTimeout(r,50));const prop=BREAKABLES[0];guest.send({t:'state',raceId:1,...state(prop.x,prop.z,{vx:12})});
  const broken=await host.race();const mirrored=await guest.race();assert.ok(broken.arcade.broken.includes(prop.id));assert.deepEqual(broken.arcade.broken,mirrored.arcade.broken);
});
