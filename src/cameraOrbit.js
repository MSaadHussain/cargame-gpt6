import * as THREE from 'three';

// World-up orbit: a rolled car must not roll the chase camera with it.
export function orbitPose(position,quaternion,{yaw=0,pitch=0,zoom=1,speed=0,aircraftLength=0}={}) {
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(quaternion);
  const heading=Math.atan2(-forward.x,-forward.z);
  const elevation=THREE.MathUtils.clamp(.32+pitch,.08,1.4);
  const distance=(aircraftLength?aircraftLength*1.8:12+Math.min(speed*.06,2))*THREE.MathUtils.clamp(zoom,.4,3);
  const angle=heading+yaw+(aircraftLength?0:.25),flat=Math.cos(elevation)*distance;
  const target=new THREE.Vector3(position.x,position.y+.6,position.z);
  if(aircraftLength)target.addScaledVector(forward,aircraftLength*.5);
  return {target,position:new THREE.Vector3(target.x+Math.sin(angle)*flat,target.y+Math.sin(elevation)*distance,target.z+Math.cos(angle)*flat)};
}
