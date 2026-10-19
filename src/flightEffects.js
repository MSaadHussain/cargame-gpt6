import * as THREE from 'three';
import { modelOf } from './vehicleModels.js';
export function createFlightEffects(scene) {
  const root=new THREE.Group();scene.add(root);
  const geo=new THREE.IcosahedronGeometry(1,0),trailMat=new THREE.MeshBasicMaterial({color:'#dae8ec',transparent:true,opacity:.35,depthWrite:false}),flareMat=new THREE.MeshBasicMaterial({color:'#ffcb58',toneMapped:false});
  const trailMesh=new THREE.InstancedMesh(geo,trailMat,256),flareMesh=new THREE.InstancedMesh(geo,flareMat,96);trailMesh.frustumCulled=false;flareMesh.frustumCulled=false;trailMesh.count=0;flareMesh.count=0;root.add(trailMesh,flareMesh);
  const missileGeo=new THREE.ConeGeometry(.7,4,6),missileMat=new THREE.MeshBasicMaterial({color:'#ff7135',toneMapped:false}),missiles=new Map();
  const trails=[],flares=[],dummy=new THREE.Object3D(),point=new THREE.Vector3();let clock=0;
  function burst(p){for(let i=0;i<18;i++){if(flares.length>=96)flares.shift();flares.push({x:p.x,y:p.y,z:p.z,vx:Math.sin(i*2.4)*25,vy:4+i%3*4,vz:Math.cos(i*2.4)*25,life:2.4});}}
  return {
    burst,
    missiles(list=[]) {
      const ids=new Set(list.map(m=>m.id));for(const [id,m] of missiles)if(!ids.has(id)){m.mesh.removeFromParent();missiles.delete(id);}
      for(const data of list.slice(0,16)){let m=missiles.get(data.id);if(!m){const mesh=new THREE.Mesh(missileGeo,missileMat);mesh.position.set(data.x,data.y,data.z);root.add(mesh);m={mesh,target:new THREE.Vector3()};missiles.set(data.id,m);}m.target.set(data.x,data.y,data.z);}
    },
    update(dt,aircraft=[]) {
      clock+=dt;if(clock>.08){clock=0;for(const a of aircraft.slice(0,8)){const model=modelOf(a.vehicle);for(const side of [-1,1]){point.set(side*model.width*.42,0,model.length*.15).applyQuaternion(a.q).add(new THREE.Vector3(a.x,a.y,a.z));if(trails.length>=256)trails.shift();trails.push({x:point.x,y:point.y,z:point.z,life:2.2});}}}
      for(const [list,mesh,isFlare] of [[trails,trailMesh,false],[flares,flareMesh,true]]) {
        for(let i=list.length-1;i>=0;i--){const p=list[i];p.life-=dt;if(p.life<=0){list.splice(i,1);continue;}if(isFlare){p.vy-=dt*12;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}}
        mesh.count=list.length;list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.quaternion.identity();dummy.scale.setScalar(isFlare?Math.min(1.2,p.life):Math.max(.2,(2.4-p.life)*1.5));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;
      }
      for(const m of missiles.values()){point.copy(m.target).sub(m.mesh.position);if(point.lengthSq()>.001)m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point.normalize());m.mesh.position.lerp(m.target,1-Math.exp(-dt*24));}
    },
    clear(){trails.length=0;flares.length=0;trailMesh.count=0;flareMesh.count=0;for(const m of missiles.values())m.mesh.removeFromParent();missiles.clear();},
    stats:()=>({contrails:trails.length,flares:flares.length,missiles:missiles.size}),
    dispose(){root.removeFromParent();geo.dispose();trailMat.dispose();flareMat.dispose();missileGeo.dispose();missileMat.dispose();},
  };
}
