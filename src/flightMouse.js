import * as THREE from 'three';

// A virtual cursor remains in the canvas while Pointer Lock hides the OS cursor.
export function moveFlightAim(aim,dx,dy,width,height) {
  const clamp=v=>Math.max(-.9,Math.min(.9,v));
  aim.x=clamp(aim.x+2*(Number.isFinite(dx)?dx:0)/Math.max(1,width));
  aim.y=clamp(aim.y-2*(Number.isFinite(dy)?dy:0)/Math.max(1,height));
  return aim;
}
export function flightAimPoint(camera,aim,targets=[]) {
  camera.updateMatrixWorld();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(aim.x,aim.y),camera);
  let distance=1400;
  const point=new THREE.Vector3();
  for(const target of targets) {
    const sphere=new THREE.Sphere(new THREE.Vector3(target.x,target.y,target.z),target.radius??7);
    if(ray.ray.intersectSphere(sphere,point)){const d=point.distanceTo(ray.ray.origin);if(d>15)distance=Math.min(distance,d);}
  }
  return ray.ray.at(distance,new THREE.Vector3());
}
export function createFlightMouse(canvas,hooks,doc=document) {
  const aim={x:0,y:0};let fire=false,look=false,wasLocked=false,pending=false,ignoreUnlock=false;
  const locked=()=>doc.pointerLockElement===canvas;
  const reset=()=>{aim.x=0;aim.y=0;fire=false;look=false;};
  const error=()=>{pending=false;fire=false;hooks.error?.('Mouse capture failed. Click the game to retry; check browser permissions.');};
  function down(e) {
    if(!hooks.enabled())return;
    if(!locked()) {
      if(e.button!==0||pending)return;
      pending=true;
      hooks.engage?.();
      try {if(!canvas.requestPointerLock)throw Error('Unavailable');const request=canvas.requestPointerLock();request?.catch(error);}catch{error();}
      return; // Capturing the mouse never also fires a round.
    }
    if(e.button===0)fire=true;
    if(e.button===2){look=true;fire=false;}
  }
  function up(e){if(e.button===0)fire=false;if(e.button===2&&look){look=false;hooks.lookEnd?.();}}
  function move(e){if(!locked()||!hooks.enabled())return;if(look)hooks.look?.(e.movementX,e.movementY);else moveFlightAim(aim,e.movementX,e.movementY,canvas.clientWidth,canvas.clientHeight);}
  function change(){pending=false;const active=locked();if(active&&!hooks.enabled()){ignoreUnlock=true;doc.exitPointerLock();return;}reset();hooks.change?.(active);if(!active&&wasLocked&&!ignoreUnlock)hooks.unlock?.();wasLocked=active;ignoreUnlock=false;}
  canvas.addEventListener('mousedown',down);doc.addEventListener('mouseup',up);doc.addEventListener('mousemove',move);doc.addEventListener('pointerlockchange',change);doc.addEventListener('pointerlockerror',error);
  return {aim,locked,reset,get fire(){return locked()&&!look&&hooks.enabled()&&fire;},get looking(){return look;},
    release(){reset();if(locked()){ignoreUnlock=true;doc.exitPointerLock();}},
    dispose(){this.release();canvas.removeEventListener('mousedown',down);doc.removeEventListener('mouseup',up);doc.removeEventListener('mousemove',move);doc.removeEventListener('pointerlockchange',change);doc.removeEventListener('pointerlockerror',error);},
  };
}
