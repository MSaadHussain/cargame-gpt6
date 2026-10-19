import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {DrivingPhysics,VEHICLES} from '../src/physics.js';
import {toggleLandingGear} from '../src/flight.js';
import {aircraftSpec,aircraftTagScale} from '../src/aircraftSpecs.js';
import {flightCameraPose} from '../src/aircraftVisual.js';
import {createCar} from '../src/car.js';
import {AirCombat} from '../src/airCombatRules.js';
import {createFlightEffects} from '../src/flightEffects.js';
import {engineSoundProfile} from '../src/audio.js';

test('all aircraft complete full quaternion loops and barrel rolls without attitude clamps',()=>{
  for(const id of ['kestrel','skyliner','sparrow'])for(const axis of ['pitch','roll']) {
    const p=new DrivingPhysics(id);p.placeAt(0,0,0,600);const rate=aircraftSpec(id)[`${axis}Rate`],steps=Math.ceil(2*Math.PI/rate*120);let inverted=false;
    for(let i=0;i<steps;i++){p.step({[`${axis}Axis`]:1});const q=p.chassis.quaternion;assert.ok(Number.isFinite(q.w));if(1-2*(q.x*q.x+q.z*q.z)<-.9)inverted=true;}
    assert.ok(inverted,`${id} ${axis} goes inverted`);assert.ok(Math.abs(p.chassis.quaternion.w)>.999);assert.equal(p.flight.crashed,false);
  }
});

test('H gear supports runway landing, ground braking and takeoff; gear-up landing crashes',()=>{
  for(const id of ['kestrel','skyliner','sparrow']) {
    const p=new DrivingPhysics(id),s=aircraftSpec(id);p.placeAt(0,0,0,s.gearHeight+.1);p.flight.speed=s.landingSpeed*.65;p.flight.throttle=p.flight.speed/s.maxSpeed;p.chassis.quaternion.setFromEuler(-.05,0,0);
    assert.equal(toggleLandingGear(p),true);p.flight.gear=1;
    for(let i=0;i<120&&!p.flight.grounded;i++)p.step({});assert.ok(p.flight.grounded,id);assert.equal(p.damage,0);assert.equal(toggleLandingGear(p),false);
    for(let i=0;i<600;i++)p.step({backward:true});assert.ok(p.flight.speed<.5);
    for(let i=0;i<1600&&p.flight.grounded;i++)p.step({forward:true,pitchAxis:.4});assert.equal(p.flight.grounded,false);assert.ok(p.chassis.position.y>s.gearHeight);assert.equal(toggleLandingGear(p),true);
    p.placeAt(0,0,0,s.gearHeight+.01);p.flight.speed=s.landingSpeed*.7;p.chassis.quaternion.setFromEuler(-.05,0,0);for(let i=0;i<10;i++)p.step({});assert.equal(p.flight.crashed,true);
  }
});

test('gear meshes animate locally/remotely and Sparrow propeller rotates',()=>{
  const scene=new THREE.Scene(),car=createCar(scene);
  for(const id of ['kestrel','skyliner','sparrow']) {
    car.setProfile(VEHICLES[id]);const gear=car.root.getObjectByName('landing-gear');assert.ok(gear);
    car.flightVisual(.5,.1,90);assert.equal(gear.visible,true);assert.equal(gear.scale.y,.5);
    car.flightVisual(0,.1,90);assert.equal(gear.visible,false);
    if(id==='sparrow')assert.notEqual(car.root.getObjectByName('propeller').rotation.z,0);
  }
  car.setProfile(VEHICLES.veloce);assert.equal(car.root.getObjectByName('landing-gear'),undefined);car.dispose();assert.equal(scene.children.length,0);
});

test('rear camera is on the opposite side and follows inverted aircraft; labels stay compact',()=>{
  const p=new THREE.Vector3(0,500,0),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.4,Math.PI));
  const normal=flightCameraPose(p,q),rear=flightCameraPose(p,q,{rear:true});const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);
  assert.ok(normal.position.clone().sub(p).dot(forward)<0);assert.ok(rear.position.clone().sub(p).dot(forward)>0);assert.ok(rear.up.y<0);
  assert.equal(aircraftTagScale(0,true),.063);assert.equal(aircraftTagScale(120),.084);
  assert.equal(aircraftTagScale(0),aircraftTagScale(120));
  assert.ok(aircraftTagScale(1500)<aircraftTagScale(120));assert.equal(aircraftTagScale(1e9),.0168);
});

function setup(){const c=new AirCombat();c.join('a','A',0);c.join('b','B',0);const peers=new Map([['a',{x:0,y:500,z:0,qx:0,qy:0,qz:0,qw:1,ready:true,vehicle:'kestrel',stateAt:6000}],['b',{x:0,y:500,z:-1200,qx:0,qy:0,qz:0,qw:1,ready:true,vehicle:'kestrel',stateAt:6000}]]);return {c,peers};}
function tick(c,peers,now){for(const p of peers.values())p.stateAt=now;return c.weapons.tick(peers,now);}
test('missiles require a maintained lock, spend ammo, and home onto a moving target',()=>{
  const {c,peers}=setup();assert.equal(c.weapons.launch('a',peers,6000),null);assert.ok(c.weapons.lock('a','b',peers,6000));tick(c,peers,7100);assert.equal(c.weapons.launch('a',peers,7100),null);tick(c,peers,7250);
  const launch=c.weapons.launch('a',peers,7250);assert.ok(launch);assert.equal(c.pilots.get('a').missiles,3);let destroyed=false;
  for(let now=7300;now<18000;now+=50){peers.get('b').x+=5;peers.get('b').y+=1;const result=tick(c,peers,now);if(result.events.some(e=>e.destroyed?.id==='b')){destroyed=true;break;}}
  assert.ok(destroyed,'turning target is followed, not a fixed launch coordinate');assert.equal(c.pilots.get('a').kills,1);assert.equal(c.pilots.get('b').hp,0);
});

test('only target flares divert missiles, with finite bursts/cooldown and no recovery ammo refill',()=>{
  const {c,peers}=setup();c.weapons.lock('a','b',peers,6000);tick(c,peers,7300);c.weapons.launch('a',peers,7300);
  assert.ok(c.weapons.flare('a',peers,7300));assert.equal(c.weapons.missiles[0].diverted,false,'attacker flare cannot divert its own weapon');
  const flare=c.weapons.flare('b',peers,7300);assert.ok(flare);assert.equal(c.weapons.missiles[0].diverted,true);assert.equal(c.pilots.get('b').flares,2);assert.equal(c.weapons.flare('b',peers,7400),null);
  for(let now=7350;now<11000;now+=50)tick(c,peers,now);assert.equal(c.pilots.get('b').hp,100);assert.equal(c.weapons.missiles.length,0);
  for(const now of [11000,13100]){tick(c,peers,now);assert.ok(c.weapons.flare('b',peers,now));}tick(c,peers,15500);assert.equal(c.weapons.flare('b',peers,15500),null);assert.equal(c.pilots.get('b').flares,0);
  c.respawn('b',16000);assert.equal(c.pilots.get('b').flares,0,'recovering alive does not refill ammunition');c.die('b',peers.get('b'),17000);c.respawn('b',21000);assert.equal(c.pilots.get('b').flares,3);
});

test('flight trails/flares/missiles have fixed caps and aircraft sound profiles differ',()=>{
  const scene=new THREE.Scene(),fx=createFlightEffects(scene),q=new THREE.Quaternion(),planes=Array.from({length:8},(_,i)=>({x:i*40,y:500,z:0,vehicle:'kestrel',q}));
  for(let i=0;i<100;i++){fx.burst({x:0,y:500,z:0});fx.update(.1,planes);}assert.ok(fx.stats().contrails<=256);assert.ok(fx.stats().flares<=96);
  fx.clear();assert.deepEqual(fx.stats(),{contrails:0,flares:0,missiles:0});fx.dispose();assert.equal(scene.children.length,0);
  const jet=engineSoundProfile('kestrel',3000,.8,200),prop=engineSoundProfile('sparrow',3000,.8,80),car=engineSoundProfile('veloce',3000,.8,30);assert.notDeepEqual(jet,prop);assert.equal(car.noise,0);assert.ok(jet.noise>prop.noise);
});

test('real relay shares deployed gear, target locks, flare diversion and missile kills',{timeout:25000},async t=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());
  const port=await new Promise((r,j)=>{server.once('error',j);server.stderr.on('data',d=>j(Error(String(d))));server.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)r(m[1]);});});
  async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiting=[];ws.on('message',raw=>{const p=JSON.parse(raw);waiting.length?waiting.shift()(p):queue.push(p);});t.after(()=>ws.terminate());await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {send:p=>ws.send(JSON.stringify(p)),async until(type,condition=()=>true){for(;;){const p=queue.length?queue.shift():await new Promise(r=>waiting.push(r));if(p.t===type&&condition(p))return p;}}};}
  const a=await client();a.send({t:'create',map:'skyport',vehicle:'kestrel',name:'Ace'});const aw=await a.until('welcome');const b=await client();b.send({t:'join',room:aw.room,vehicle:'kestrel',name:'Wing'});const bw=await b.until('welcome');
  const state=z=>({t:'state',vehicle:'kestrel',x:0,y:500,z,qx:0,qy:0,qz:0,qw:1,landingGear:1});
  const interval=setInterval(()=>{a.send(state(0));b.send(state(-1200));},100);t.after(()=>clearInterval(interval));
  const synced=await a.until('state');assert.equal(synced.player.landingGear,1);await new Promise(r=>setTimeout(r,5100));
  a.send({t:'airLock',target:bw.id});await a.until('airState',p=>p.air.pilots.find(x=>x.id===aw.id)?.lockReady);a.send({t:'airLaunch'});const missile=await a.until('airMissile');assert.equal(missile.missile.target,bw.id);
  b.send({t:'airRespawn'});await b.until('airNotice',p=>p.message.includes('Incoming'));
  b.send({t:'airFlare'});const flare=await a.until('airFlare');assert.equal(flare.air.pilots.find(x=>x.id===bw.id).flares,2);assert.equal(flare.air.missiles[0].diverted,true);
  await new Promise(r=>setTimeout(r,2700));a.send({t:'airLock',target:bw.id});await a.until('airState',p=>p.air.pilots.find(x=>x.id===aw.id)?.lockReady);a.send({t:'airLaunch'});await a.until('airMissile');
  const hit=await a.until('airMissileHit');assert.equal(hit.destroyed.id,bw.id);assert.equal(hit.air.pilots.find(x=>x.id===aw.id).kills,1);
});
