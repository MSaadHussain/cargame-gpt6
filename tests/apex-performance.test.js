import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {DrivingPhysics} from '../src/physics.js';
import {SceneryStream} from '../src/sceneryStream.js';
import {buildWorld} from '../src/world.js';
import {CIRCUIT} from '../src/circuit.js';

test('static streaming preserves dynamic bodies, preloads collider bounds and handles distant teleports',()=>{
  const physics=new DrivingPhysics(),dynamic=physics.addBox(0,2,0,1,1,1,{mass:10});
  const a=physics.addBox(0,1,0,2,2,2),b=physics.addBox(1000,1,0,2,2,2);
  const long=physics.addBox(300,1,0,400,2,2); // Bound enters radius despite centre being outside it.
  const stream=new SceneryStream(physics.world,[a,b,long]);
  stream.update({x:0,z:0});assert.ok(stream.active.has(a));assert.ok(stream.active.has(long));assert.ok(!stream.active.has(b));
  const previous=stream.active;stream.update({x:10,z:0});assert.equal(stream.active,previous,'small moves do not churn bodies');
  stream.update({x:1000,z:0});assert.ok(stream.active.has(b));assert.ok(!stream.active.has(a));
  for(const body of [physics.chassis,physics.floor,dynamic])assert.equal(body.world,physics.world);
  stream.dispose();assert.ok(!physics.world.bodies.includes(b));assert.equal(dynamic.world,physics.world);
});

test('Apex retains nearby solid walls around the entire circuit with a bounded active physics set',()=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const scene=new THREE.Scene(),physics=new DrivingPhysics();
  try {
    const world=buildWorld(scene,physics,'apex');const all=[...physics.scenery];let maxActive=0;
    for(let i=0;i<180;i++) {
      const p=CIRCUIT.sample(i/180);world.update(p);
      const active=new Set(physics.world.bodies);maxActive=Math.max(maxActive,active.size);
      for(const body of all) {
        const a=body.aabb.lowerBound,b=body.aabb.upperBound;
        if(a.x<p.x+100&&b.x>p.x-100&&a.z<p.z+100&&b.z>p.z-100)assert.ok(active.has(body),'nearby obstacle must be live');
      }
      const hit=new CANNON.RaycastResult();
      assert.ok(physics.world.raycastClosest(new CANNON.Vec3(p.x,.6,p.z),new CANNON.Vec3(p.x-p.nz*32,.6,p.z+p.nx*32),{collisionFilterMask:1},hit),`solid runoff barrier ${i}`);
    }
    assert.ok(all.length>1400,'full original obstacle set retained');
    assert.ok(maxActive<450,`active bodies budget, measured ${maxActive}`);
    world.dispose();physics.clearScenery();assert.equal(physics.world.bodies.length,2);assert.equal(scene.children.length,0);
  } finally {globalThis.document=old;}
});

test('Apex geometry uses cullable tiles, small signs and no track-wide shadow batches',()=>{
  const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const scene=new THREE.Scene(),physics=new DrivingPhysics();
  try {
    const world=buildWorld(scene,physics,'apex');let roadChunks=0,staticChunks=0;
    scene.traverse(mesh=>{
      if(mesh.userData.roadChunk){roadChunks++;assert.ok(mesh.geometry.boundingSphere.radius<100);assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite));}
      if(mesh.userData.staticChunk){staticChunks++;assert.ok(mesh.geometry.boundingSphere.radius<180);assert.ok(mesh.geometry.attributes.color);}
      if(mesh.material?.map?.image)assert.ok(mesh.material.map.image.width<=512);
      if(mesh.castShadow)assert.ok(!mesh.isInstancedMesh,'decorative treetops do not cast shadows');
    });
    assert.ok(roadChunks>20);assert.ok(staticChunks>20);
    world.dispose();physics.clearScenery();
  } finally {globalThis.document=old;}
});
