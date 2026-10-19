import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {flightGroundTiles,flightClipPlanes} from '../src/flightGround.js';
import {createFlightMouse,moveFlightAim,flightAimPoint} from '../src/flightMouse.js';
import {AirCombat} from '../src/airCombatRules.js';
import {buildWorld} from '../src/world.js';
import {DrivingPhysics} from '../src/physics.js';

test('airport ground partitions cover the whole map without overlapping horizontal surfaces',()=>{
  const tiles=flightGroundTiles();assert.equal(tiles.reduce((area,t)=>area+t.w*t.d,0),14000**2);
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
    const a=tiles[i],b=tiles[j];
    assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.z-b.z)>=(a.d+b.d)/2,'no overlapping grass, runway, river or taxiway');
  }
  const scene=new THREE.Scene(),physics=new DrivingPhysics('kestrel'),world=buildWorld(scene,physics,'skyport');
  const markings=scene.children.find(n=>n.userData.airMarkings);assert.ok(markings.material.polygonOffset);assert.ok(markings.material.polygonOffsetUnits<0);
  assert.equal(flightClipPlanes(false).near,2);assert.equal(flightClipPlanes(true).near,.5);world.dispose();assert.equal(scene.children.length,0);
});

class Events {
  constructor(){this.listeners=new Map();}
  addEventListener(t,fn){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(fn);}
  removeEventListener(t,fn){this.listeners.get(t)?.delete(fn);}
  emit(t,e={}){for(const fn of this.listeners.get(t)||[])fn(e);}
}
test('pointer lock captures without firing, uses relative deltas, and releases without stuck fire',()=>{
  const canvas=new Events(),doc=new Events();canvas.clientWidth=1000;canvas.clientHeight=500;
  let requested=0,unlocks=0,looks=0,enabled=true;
  canvas.requestPointerLock=()=>{requested++;doc.pointerLockElement=canvas;doc.emit('pointerlockchange');};
  doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.emit('pointerlockchange');};
  const mouse=createFlightMouse(canvas,{enabled:()=>enabled,unlock:()=>unlocks++,look:()=>looks++},doc);
  canvas.emit('mousedown',{button:0});assert.equal(requested,1);assert.ok(mouse.locked());assert.equal(mouse.fire,false);
  doc.emit('mousemove',{movementX:100,movementY:-50,clientX:99999,clientY:99999});assert.equal(mouse.aim.x,.2);assert.equal(mouse.aim.y,.2);
  canvas.emit('mousedown',{button:0});assert.ok(mouse.fire);doc.emit('mouseup',{button:0});assert.equal(mouse.fire,false);
  canvas.emit('mousedown',{button:2});doc.emit('mousemove',{movementX:5,movementY:4});assert.equal(looks,1);assert.equal(mouse.aim.x,.2);doc.emit('mouseup',{button:2});
  canvas.emit('mousedown',{button:0});doc.exitPointerLock();assert.equal(mouse.fire,false);assert.equal(unlocks,1);assert.deepEqual(mouse.aim,{x:0,y:0});
  canvas.emit('mousedown',{button:0});mouse.release();assert.equal(unlocks,1,'programmatic menu release is not a second Escape');
  enabled=false;canvas.emit('mousedown',{button:0});assert.equal(requested,2);mouse.dispose();assert.equal(doc.listeners.get('mousemove').size,0);
});

test('pointer-lock denial and unsupported browsers leave mouse input inactive',async()=>{
  const canvas=new Events(),doc=new Events();let errors=0;
  const mouse=createFlightMouse(canvas,{enabled:()=>true,error:()=>errors++},doc);
  canvas.emit('mousedown',{button:0});assert.equal(errors,1);assert.equal(mouse.fire,false);
  canvas.requestPointerLock=()=>Promise.reject(Error('Denied'));canvas.emit('mousedown',{button:0});await Promise.resolve();assert.equal(errors,2);assert.equal(mouse.locked(),false);mouse.dispose();
});

test('relative virtual aim is pixel-accurate and bounded inside the viewport',()=>{
  const aim={x:0,y:0};moveFlightAim(aim,40,30,800,600);
  assert.ok(Math.abs((aim.x*.5+.5)*800-440)<1e-9);assert.ok(Math.abs((-aim.y*.5+.5)*600-330)<1e-9);
  moveFlightAim(aim,99999,-99999,800,600);assert.deepEqual(aim,{x:.9,y:.9});moveFlightAim(aim,NaN,Infinity,800,600);assert.deepEqual(aim,{x:.9,y:.9});
});

test('camera aim ray reprojects to the exact cursor and cannon converges on an off-nose target',()=>{
  const camera=new THREE.PerspectiveCamera(49,16/9,2,11000);camera.position.set(0,320,35);camera.lookAt(0,300,-300);camera.updateMatrixWorld();
  const target={x:85,y:315,z:-300,radius:7},projected=new THREE.Vector3(target.x,target.y,target.z).project(camera);
  const screen={x:projected.x,y:projected.y},point=flightAimPoint(camera,screen,[target]),back=point.clone().project(camera);
  assert.ok(Math.abs(back.x-screen.x)<1e-10);assert.ok(Math.abs(back.y-screen.y)<1e-10);
  const combat=new AirCombat();combat.join('a','A',0);combat.join('b','B',0);
  const peers=new Map([['a',{ready:true,vehicle:'kestrel',stateAt:6000,x:0,y:300,z:0,qx:0,qy:0,qz:0,qw:1}],['b',{...target,ready:true,vehicle:'kestrel',stateAt:6000}]]);
  const shot=combat.fire('a',peers,6000,point);assert.equal(shot.hit,'b');
  const hit=new THREE.Vector3(shot.origin.x,shot.origin.y,shot.origin.z).addScaledVector(new THREE.Vector3(shot.direction.x,shot.direction.y,shot.direction.z),shot.length).project(camera);
  assert.ok(Math.abs(hit.x-screen.x)<.002&&Math.abs(hit.y-screen.y)<.002,'muzzle parallax corrected at target');
  peers.get('a').stateAt=7000;
  for(const bad of [{x:NaN,y:300,z:0},{x:0,y:300,z:100},{x:0,y:300,z:-9000}])assert.equal(combat.fire('a',peers,7000,bad),null);
});
