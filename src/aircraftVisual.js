import * as THREE from 'three';
import { aircraftSpec } from './aircraftSpecs.js';
export function createAircraftParts(id,materials) {
  const root=new THREE.Group(),gear=new THREE.Group(),propeller=new THREE.Group();root.add(gear,propeller);
  root.name='aircraft-parts';gear.name='landing-gear';propeller.name='propeller';
  const s=aircraftSpec(id),legHeight=s.gearHeight-s.gearRadius;
  const strutGeo=new THREE.CylinderGeometry(.07,.09,legHeight,6),wheelGeo=new THREE.CylinderGeometry(s.gearRadius,s.gearRadius,s.gearRadius*.65,10);wheelGeo.rotateZ(Math.PI/2);
  for(const [x,z] of [[0,s.gearFront],[-s.gearWidth,s.gearRear],[s.gearWidth,s.gearRear]]) {
    const strut=new THREE.Mesh(strutGeo,materials.chrome);strut.position.set(x,-legHeight/2,z);gear.add(strut);
    const wheel=new THREE.Mesh(wheelGeo,materials.rubber);wheel.position.set(x,-legHeight,z);wheel.castShadow=true;gear.add(wheel);
  }
  if(id==='sparrow') {
    propeller.position.set(0,.55,-3.32);
    const bladeGeo=new THREE.BoxGeometry(.15,2.9,.09);
    for(const angle of [0,Math.PI/2]){const blade=new THREE.Mesh(bladeGeo,materials.dark);blade.rotation.z=angle;propeller.add(blade);}
  }
  gear.visible=false;
  return {root,gear,propeller,update(extension,dt,speed){gear.visible=extension>.01;gear.scale.y=Math.max(.001,extension);propeller.rotation.z+=dt*(35+Math.abs(speed)*.3);}};
}
export function flightCameraPose(position,quaternion,{length=17,yaw=0,pitch=0,zoom=1,rear=false}={}) {
  const q=new THREE.Quaternion(quaternion.x,quaternion.y,quaternion.z,quaternion.w),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const d=length*1.8*THREE.MathUtils.clamp(zoom,.4,3),angle=yaw+(rear?Math.PI:0);
  const local=new THREE.Vector3(Math.sin(angle)*Math.cos(pitch)*d,(.32+Math.sin(pitch))*d,Math.cos(angle)*Math.cos(pitch)*d);
  const point=new THREE.Vector3(position.x,position.y,position.z);
  return {position:local.applyQuaternion(q).add(point),target:new THREE.Vector3(0,0,(rear?1:-1)*length*.6).applyQuaternion(q).add(point),up};
}
