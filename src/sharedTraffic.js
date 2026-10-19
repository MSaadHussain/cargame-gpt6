import * as THREE from 'three';
import {Traffic} from './traffic.js';
import {RemoteCollisions} from './remoteCollisions.js';
import {npcPose} from './sharedTrafficRules.js';

export class SharedTraffic {
  constructor(scene,physics,route,room,onHit) {
    this.physics=physics;this.map=room.map;this.epoch=room.trafficEpoch;this.offset=room.serverNow-Date.now();this.damage=room.npcDamage||[];
    this.visual=new Traffic(scene,physics,route,0,64);this.proxies=new RemoteCollisions(physics);this.cars=[];this.enabled=true;this.onHit=onHit;this.lastHits=new Map();
    this.dentMaterials=[];this.color=new THREE.Color();this.q=new THREE.Quaternion();this.offsetWheel=new THREE.Vector3();
    for(const mesh of Object.values(this.visual.bodyMeshes)) {
      const attribute=new THREE.InstancedBufferAttribute(new Float32Array(64),1);mesh.geometry.setAttribute('npcDamage',attribute);
      mesh.material=mesh.material.clone();this.dentMaterials.push(mesh.material);
      mesh.material.onBeforeCompile=shader=>{shader.vertexShader='attribute float npcDamage;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat dent=npcDamage*.01; transformed.z-=sign(transformed.z)*dent*.45*smoothstep(.8,2.2,abs(transformed.z)); transformed.y+=sin(transformed.x*19.0+transformed.z*13.0)*dent*.055;');};
      mesh.material.customProgramCacheKey=()=> 'shared-npc-damage-v1';
    }
    this.listener=e=>{const id=e.body.npcIndex;if(!Number.isInteger(id))return;const now=Date.now();if(Math.abs(e.contact.getImpactVelocityAlongNormal())>3&&now-(this.lastHits.get(id)||0)>750){this.lastHits.set(id,now);this.onHit(id);}};
    physics.chassis.addEventListener('collide',this.listener);this.setDensity(room.density);
  }
  setDensity(count) {
    this.count=Math.max(0,Math.min(64,Math.round(count)));this.cars.length=this.count;
    for(let i=0;i<this.count;i++)this.cars[i]??={body:{position:new THREE.Vector3()}};
    for(const id of this.proxies.peers.keys())if(Number(id.slice(4))>=this.count)this.proxies.remove(id);
    this.update(0);
  }
  setEnabled(value){this.enabled=value;}
  reset(){this.proxies.protectSpawn();} // A local reset never rewinds shared traffic.
  sync(packet){if(packet.npcDamage)this.damage=packet.npcDamage;}
  beforeStep(){this.proxies.beforeStep();}
  update(dt,position=this.physics.chassis.position) {
    const time=Date.now()+this.offset,v=this.visual,t=v.temp;let visible=0;
    for(let i=0;i<this.count;i++) {
      const pose=npcPose(this.map,i,this.epoch,time);if(!pose)continue;
      this.cars[i].body.position.set(pose.x,pose.y,pose.z);
      const distance=Math.hypot(pose.x-position.x,pose.z-position.z);
      if(this.enabled&&distance<85){this.proxies.receive(pose);this.proxies.peers.get(pose.id).body.npcIndex=i;}else this.proxies.remove(pose.id);
      if(!this.enabled||distance>260)continue;
      t.position.set(pose.x,pose.y,pose.z);t.quaternion.set(pose.qx,pose.qy,pose.qz,pose.qw);this.q.copy(t.quaternion);t.scale.set(1,1,1);t.updateMatrix();
      const damage=this.damage[i]||0;
      for(const mesh of Object.values(v.bodyMeshes)){mesh.setMatrixAt(visible,t.matrix);mesh.geometry.attributes.npcDamage.setX(visible,damage);}
      this.color.set(pose.paint).multiplyScalar(1-damage*.0045);v.bodyMeshes.paint?.setColorAt(visible,this.color);
      for(let w=0;w<4;w++) {
        this.offsetWheel.set((w%2?1:-1)*.94,-.25,w<2?-1.43:1.43).applyQuaternion(this.q);
        t.position.set(pose.x+this.offsetWheel.x,pose.y+this.offsetWheel.y,pose.z+this.offsetWheel.z);t.quaternion.copy(this.q);t.rotateX(-(time-this.epoch)/1000*Math.hypot(pose.vx,pose.vz)/.36);t.updateMatrix();
        for(const mesh of Object.values(v.wheelMeshes))mesh.setMatrixAt(visible*4+w,t.matrix);
      }
      visible++;
    }
    for(const mesh of Object.values(v.bodyMeshes)){mesh.count=visible;mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.npcDamage.needsUpdate=true;}
    for(const mesh of Object.values(v.wheelMeshes)){mesh.count=visible*4;mesh.instanceMatrix.needsUpdate=true;}
    if(v.bodyMeshes.paint?.instanceColor)v.bodyMeshes.paint.instanceColor.needsUpdate=true;
  }
  dispose(){this.physics.chassis.removeEventListener('collide',this.listener);this.proxies.clear();this.visual.dispose();this.dentMaterials.forEach(m=>m.dispose());this.cars=[];}
}
