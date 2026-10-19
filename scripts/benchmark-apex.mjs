// CPU-only, reproducible local comparison; this is not a browser/GPU FPS benchmark.
import * as THREE from 'three';
import { DrivingPhysics } from '../src/physics.js';
import { buildWorld } from '../src/world.js';
import { CIRCUIT } from '../src/circuit.js';

globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
const full=process.argv.includes('--full-scenery');
const physics=new DrivingPhysics(),scene=new THREE.Scene(),world=buildWorld(scene,physics,'apex');
if(full)for(const body of physics.scenery)if(body.world!==physics.world)physics.world.addBody(body);
const measurements=[];
for(const t of [0,.2,.4,.6,.8]) {
  const p=CIRCUIT.sample(t);physics.placeAt(p.x,p.z,p.yaw);if(!full)world.update(p);
  for(let i=0;i<120;i++)physics.step({});
  const start=performance.now();
  for(let i=0;i<360;i++) {if(!full)world.update(physics.chassis.position);physics.step({forward:true});}
  measurements.push({trackPosition:t,bodies:physics.world.bodies.length,msPerStep:Number(((performance.now()-start)/360).toFixed(3))});
}
console.log(JSON.stringify({mode:full?'all-static-bodies':'nearby-static-bodies',sceneryTotal:physics.scenery.length,measurements},null,2));
world.dispose();physics.clearScenery();
