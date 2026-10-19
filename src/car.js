import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineCarBody, defineWheel } from './carBody.js';
import { modelOf, isTwoWheeler, isAircraft } from './vehicleModels.js';
import { createAircraftParts } from './aircraftVisual.js';

export function carMaterials(paintColor = '#67877d') {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: paintColor, metalness: 0.65, roughness: 0.29, clearcoat: 1, clearcoatRoughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: '#202b29', roughness: 0.55, metalness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: '#283632', roughness: 0.26, metalness: 0.8 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#bec6ba', roughness: 0.2, metalness: 0.92 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#6a9396', metalness: 0.35, roughness: 0.13, transparent: true, opacity: 0.73, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1e2423', roughness: 0.93 }),
    red: new THREE.MeshStandardMaterial({ color: '#972b23', emissive: '#ff3722', emissiveIntensity: 0.32, roughness: 0.3 }),
    headlight: new THREE.MeshStandardMaterial({ color: '#efe8c8', emissive: '#ffedb1', emissiveIntensity: 0.55, roughness: 0.25 }),
  };
}

function partGeometry(w, h, d, round, damageable, roundSegments = 3) {
  return round
    ? new RoundedBoxGeometry(w, h, d, roundSegments, round)
    : new THREE.BoxGeometry(w, h, d, damageable ? 9 : 1, damageable ? 3 : 1, damageable ? 12 : 1);
}
function quadGeometry(points) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
  return geo;
}
function beamTransform(a, b, width) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const geo = new THREE.BoxGeometry(width, from.distanceTo(to), width);
  const position = from.clone().add(to).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return { geo, position, quaternion };
}

/**
 * Merged, material-grouped geometry for the same car. Traffic instances these,
 * so every AI car is the player's model rather than a stand-in box.
 */
export function createCarGeometry(options = {}) {
  const buckets = new Map();
  // RoundedBoxGeometry is non-indexed while BoxGeometry is indexed, and
  // mergeGeometries refuses to mix the two. Normalise everything to
  // non-indexed with just the attributes the merge needs.
  const normalize = (geo) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
    }
    if (!flat.attributes.uv) {
      flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    }
    flat.clearGroups();
    return flat;
  };
  const push = (key, geo) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(normalize(geo));
  };
  const matrix = new THREE.Matrix4();
  defineCarBody({
    part(w, h, d, x, y, z, key, round = 0, damageable = false, extra = {}) {
      const geo = extra.cylinder ? new THREE.CylinderGeometry(w/2,w/2,d,12).rotateX(Math.PI/2) : partGeometry(w, h, d, round, damageable && options.damageDetail, 1);
      matrix.identity();
      if (extra.rotateX) matrix.makeRotationX(extra.rotateX);
      matrix.setPosition(x, y, z);
      geo.applyMatrix4(matrix);
      push(key, geo);
    },
    beam(a, b, width, key) {
      const { geo, position, quaternion } = beamTransform(a, b, width);
      geo.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)));
      push(key, geo);
    },
    windowQuad(points) { push('glass', quadGeometry(points)); },
    panel(points,key) {
      // Both faces: wings remain visible from above and below without global double-sided paint.
      push(key,quadGeometry(points));push(key,quadGeometry([...points].reverse()));
    },
  }, options);

  const body = {};
  for (const [key, list] of buckets) {
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (merged) body[key] = merged;
  }

  const wheelBuckets = new Map();
  const wheelPush = (key, geo) => {
    if (!wheelBuckets.has(key)) wheelBuckets.set(key, []);
    wheelBuckets.get(key).push(geo);
  };
  defineWheel({
    cylinder(rt, rb, h, seg, key, x) {
      const geo = new THREE.CylinderGeometry(rt, rb, h, seg); geo.rotateZ(Math.PI / 2); geo.translate(x, 0, 0); wheelPush(key, geo);
    },
    box(w, h, d, x, rotation, key) {
      const geo = new THREE.BoxGeometry(w, h, d); geo.rotateX(rotation); geo.translate(x, 0, 0); wheelPush(key, geo);
    },
    torus(r, tube, rs, ts, key, x) {
      const geo = new THREE.TorusGeometry(r, tube, rs, ts); geo.rotateY(Math.PI / 2); geo.translate(x, 0, 0); wheelPush(key, geo);
    },
  }, options);
  const wheel = {};
  for (const [key, list] of wheelBuckets) {
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (merged) wheel[key] = merged;
  }
  return { body, wheel };
}

export function createCar(scene, { simple = false } = {}) {
  const root=new THREE.Group(),shell=new THREE.Group();root.add(shell);scene.add(root);
  const materials=carMaterials(),paint=materials.paint,wheels=[],deformables=[];
  let profileId='veloce',cockpit=false,dents=[],damageKey='',wheelAngle=0,aircraftParts=null;
  const steering=new THREE.Group();root.add(steering);
  const poseQ=new THREE.Quaternion(),offset=new THREE.Vector3(),pivot=new THREE.Vector3(),rotated=new THREE.Vector3();
  const hit=new THREE.Vector3(),inward=new THREE.Vector3();
  for(let i=0;i<4;i++){const wheel=new THREE.Group();wheels.push(wheel);scene.add(wheel);}
  function rebuild() {
    if(aircraftParts){const old=new Set();aircraftParts.root.traverse(n=>{if(n.geometry)old.add(n.geometry);});old.forEach(g=>g.dispose());aircraftParts.root.removeFromParent();aircraftParts=null;}
    const old=new Set();for(const object of [shell,...wheels]){object.traverse(n=>{if(n.geometry)old.add(n.geometry);});object.clear();}old.forEach(g=>g.dispose());
    deformables.length=0;dents=[];damageKey='';
    const geometry=createCarGeometry({model:profileId,interior:!simple,detail:!simple,damageDetail:true});
    for(const [key,geo] of Object.entries(geometry.body)){
      const mesh=new THREE.Mesh(geo,materials[key]);mesh.castShadow=true;mesh.receiveShadow=true;shell.add(mesh);
      if(key==='paint'||key==='chrome'||key==='trim'||key==='glass')deformables.push({mesh,original:geo.attributes.position.array.slice()});
    }
    for(const wheel of wheels)for(const [key,geo] of Object.entries(geometry.wheel)){const mesh=new THREE.Mesh(geo,materials[key]);mesh.castShadow=!simple;wheel.add(mesh);}
    if(isAircraft(profileId)){aircraftParts=createAircraftParts(profileId,materials);root.add(aircraftParts.root);}
    updateVisibility();
  }
  function updateVisibility() {
    for(const mesh of shell.children)if(mesh.material===materials.glass)mesh.visible=!cockpit;
    const bike=isTwoWheeler(profileId);wheels.forEach((w,i)=>{w.visible=!isAircraft(profileId)&&(!bike||i%2===0);w.scale.set(bike?.65:profileId==='formula'?1.5:1,1,1);});
  }
  function applyDent(point,severity) {
    if(!severity)return;hit.set(point.x,point.y,point.z);inward.set(-hit.x,.07,-hit.z).normalize();
    for(const entry of deformables){
      const positions=entry.mesh.geometry.attributes.position,base=entry.original;let touched=false;
      for(let i=0;i<positions.count;i++){
        const x=base[i*3],y=base[i*3+1],z=base[i*3+2],distance=Math.hypot(x-hit.x,y-hit.y,z-hit.z);
        if(distance>=1.6)continue;
        const amount=(1-distance/1.6)**2*severity;
        positions.setXYZ(i,positions.getX(i)+inward.x*amount,positions.getY(i)+amount*(.07+Math.sin(x*24+z*17)*.12),positions.getZ(i)+inward.z*amount);touched=true;
      }
      if(touched){positions.needsUpdate=true;entry.mesh.geometry.computeVertexNormals();entry.mesh.geometry.computeBoundingSphere();}
    }
  }
  function repair(){dents=[];damageKey='';for(const {mesh,original} of deformables){mesh.geometry.attributes.position.array.set(original);mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}}
  function visualPose(wheelie=0,steer=0,speed=0,dt=0) {
    const model=modelOf(profileId),bike=isTwoWheeler(profileId);wheelAngle+=speed*dt/.36;
    const angle=bike?THREE.MathUtils.clamp(wheelie,0,.7):0;
    poseQ.setFromEuler(new THREE.Euler(angle,0,bike?THREE.MathUtils.clamp(steer*speed*.025,-.22,.22):0));
    pivot.set(0,-.25,model.wheelbase/2);rotated.copy(pivot).applyQuaternion(poseQ);
    shell.position.copy(pivot).sub(rotated);shell.quaternion.copy(poseQ);
    for(let i=0;i<4;i++){
      const wheel=wheels[i];wheel.visible=root.visible&&!isAircraft(profileId)&&(!bike||i%2===0);
      offset.set(bike?0:(i%2?1:-1)*model.width*.492,-.25,(i<2?-1:1)*model.wheelbase/2);
      offset.sub(pivot).applyQuaternion(poseQ).add(pivot).applyQuaternion(root.quaternion).add(root.position);
      wheel.position.copy(offset);wheel.quaternion.copy(root.quaternion).multiply(poseQ);
      if(i<2)wheel.rotateY(steer);wheel.rotateX(wheelAngle);
    }
  }
  rebuild();
  return {
    root,wheels,steering,paint,materials,
    setProfile(spec){if(profileId!==spec.id){profileId=spec.id;rebuild();}},
    sync(physics){
      root.position.copy(physics.chassis.position);root.quaternion.copy(physics.chassis.quaternion);
      visualPose(physics.wheelie||0,physics.steer,physics.forwardSpeed,0);
      aircraftParts?.update(physics.flight?.gear||0,0,physics.forwardSpeed);
      if(!isTwoWheeler(profileId))for(let i=0;i<4;i++){physics.vehicle.updateWheelTransform(i);const t=physics.vehicle.wheelInfos[i].worldTransform;wheels[i].position.copy(t.position);wheels[i].quaternion.copy(t.quaternion);}
      else for(const i of [0,2])wheels[i].rotateX(physics.vehicle.wheelInfos[i].rotation);
      materials.red.emissiveIntensity=physics.braking?2.2:.32;
    },
    visualPose,
    flightVisual(gear,dt,speed){aircraftParts?.update(gear,dt,speed);},
    setCockpit(value){cockpit=value;updateVisibility();},
    deform(point,severity){if(!severity)return;const dent={x:+point.x.toFixed(3),y:+point.y.toFixed(3),z:+point.z.toFixed(3),s:+severity.toFixed(3)};dents.push(dent);if(dents.length>24)dents.shift();applyDent(point,severity);},
    damageSnapshot:()=>dents,
    applyDamage(history=[]){const key=JSON.stringify(history);if(key===damageKey)return;repair();history.forEach(d=>applyDent(d,d.s));damageKey=key;},
    repair,
    dispose(){const geometries=new Set();for(const object of [root,...wheels]){object.traverse(n=>{if(n.geometry)geometries.add(n.geometry);});object.removeFromParent();}geometries.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());},
  };
}
