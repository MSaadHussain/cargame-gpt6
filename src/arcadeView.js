import * as THREE from 'three';
import {BREAKABLES,PICKUPS,ITEM_NAMES,HAZARD_LIMIT,hazardPosition} from './arcadeRules.js';

// Bounded, client-only visuals: no debris rigid bodies, particle emitters or lights.
export function createArcadeView(scene,physics,toast) {
  const root=new THREE.Group();root.visible=false;scene.add(root);
  const resources=[],temp=new THREE.Object3D(),hidden=new Set();let data=null,enabled=false,active=false,self='solo',seen=0,raceId=0,clock=0,particles=[],lastDraw=-Infinity;
  function instances(geometry,material,count) {
    resources.push(geometry,material);const mesh=new THREE.InstancedMesh(geometry,material,count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;root.add(mesh);return mesh;
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#794cbb';ctx.fillRect(0,0,128,128);ctx.fillStyle='#fff4b8';ctx.font='bold 96px sans-serif';ctx.textAlign='center';ctx.fillText('?',64,99);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;resources.push(texture);
  const boxes=instances(new THREE.BoxGeometry(1.8,1.8,1.8),new THREE.MeshStandardMaterial({map:texture,emissive:'#5a3686',emissiveIntensity:.4,roughness:.45}),PICKUPS.length);
  const crates=instances(new THREE.BoxGeometry(1.5,1.5,1.5),new THREE.MeshStandardMaterial({color:'#bf9259',roughness:.9}),BREAKABLES.length);
  const braces=instances(new THREE.BoxGeometry(1.9,.13,.13),new THREE.MeshStandardMaterial({color:'#6d492e'}),BREAKABLES.length*2);
  const cones=instances(new THREE.ConeGeometry(.65,1.35,7),new THREE.MeshStandardMaterial({color:'#ff7949'}),BREAKABLES.length);
  const bases=instances(new THREE.BoxGeometry(1.2,.13,1.2),new THREE.MeshStandardMaterial({color:'#283847'}),BREAKABLES.length);
  const bolts=instances(new THREE.IcosahedronGeometry(.65,1),new THREE.MeshBasicMaterial({color:'#ffdb6c'}),HAZARD_LIMIT);
  const oils=instances(new THREE.CylinderGeometry(3.8,3.8,.03,16),new THREE.MeshBasicMaterial({color:'#543775',transparent:true,opacity:.8,depthWrite:false}),HAZARD_LIMIT);
  const shields=instances(new THREE.SphereGeometry(2.9,12,8),new THREE.MeshBasicMaterial({color:'#73e2ff',wireframe:true,transparent:true,opacity:.5,depthWrite:false}),8);
  const debris=instances(new THREE.BoxGeometry(.25,.25,.25),new THREE.MeshBasicMaterial({color:'#ffe3a4'}),64);
  const meshes=[boxes,crates,braces,cones,bases,bolts,oils,shields,debris];
  function put(mesh,x,y,z,rx=0,ry=0,rz=0,scale=1) {temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.setScalar(scale);temp.updateMatrix();mesh.setMatrixAt(mesh.count++,temp.matrix);}
  function burst(x,z,color) {
    if(Math.hypot(x-physics.chassis.position.x,z-physics.chassis.position.z)>180)return;
    for(let i=0;i<8;i++){if(particles.length>=64)particles.shift();const angle=i*Math.PI/4;particles.push({x,z,y:1,vx:Math.sin(angle)*5,vz:Math.cos(angle)*5,vy:3+(i%3),life:1.3,color});}
  }
  function receive(snapshot,id,reset=false) {
    self=id;clock=snapshot.serverNow-Date.now();active=snapshot.startAt>0&&snapshot.phase!=='finished';
    if(reset||raceId!==snapshot.id){seen=0;particles=[];}raceId=snapshot.id;data=snapshot.arcade;
    if(!data)return;
    hidden.clear();data.broken.forEach(id=>hidden.add(id));
    for(const event of data.events) {
      if(event.seq<=seen)continue;
      if(event.type==='break') {burst(event.x,event.z,'#e3ad68');if(event.owner===self)toast('SMASH! +10 points');}
      if(event.type==='pickup'&&event.owner===self)toast(`${ITEM_NAMES[event.item]} ready · E or Use item`);
      if(event.type==='hit') {
        burst(event.x,event.z,event.blocked?'#73e2ff':'#ffda75');
        if(event.target===self) {
          if(event.blocked)toast('Shield blocked the hit!');
          else {
            const body=physics.chassis;body.wakeUp();
            body.velocity.x*=event.weapon==='oil'?.58:.7;body.velocity.z*=event.weapon==='oil'?.58:.7;
            body.velocity.x+=(event.dx||0)*5;body.velocity.z+=(event.dz||0)*5;
            body.angularVelocity.y=Math.max(-3,Math.min(3,body.angularVelocity.y+(event.weapon==='oil'?1.6:.5)));
            toast(event.weapon==='oil'?'Oil trap! Grip lost.':'Pulse hit! Keep racing.');
          }
        } else if(event.owner===self)toast(event.blocked?'Opponent shielded the hit.':'Clean hit! +75 points');
      }
    }
    seen=data.seq;
  }
  return {
    stats(){return {arcadeParticles:particles.length,arcadeHazards:data?.hazards.length||0,heldItem:data?.players[self]?.item||null};},
    map(id){enabled=id==='apex';root.visible=enabled;data=null;active=false;seen=0;raceId=0;particles=[];hidden.clear();lastDraw=-Infinity;meshes.forEach(m=>m.count=0);},
    receive,
    clear(){data=null;active=false;particles=[];hidden.clear();seen=0;raceId=0;lastDraw=-Infinity;},
    update(dt,positions=[]) {
      if(!enabled)return;
      const time=Date.now()+clock,p=physics.chassis.position,near=o=>(o.x-p.x)**2+(o.z-p.z)**2<300**2;
      if(!active&&physics.chassis.velocity.length()>4&&p.y<3)for(const prop of BREAKABLES)if(!hidden.has(prop.id)&&Math.hypot(p.x-prop.x,p.z-prop.z)<2.2){hidden.add(prop.id);burst(prop.x,prop.z,'#e3ad68');}
      for(const bit of particles){bit.life-=dt;bit.vy-=10*dt;bit.x+=bit.vx*dt;bit.z+=bit.vz*dt;bit.y+=bit.vy*dt;if(bit.y<.15){bit.y=.15;bit.vy=Math.abs(bit.vy)*.25;}}
      particles=particles.filter(p=>p.life>0);
      if(time-lastDraw<30)return;lastDraw=time;meshes.forEach(m=>m.count=0);
      if(active)for(const box of PICKUPS)if((data?.pickups[box.id]||0)<=time&&near(box))put(boxes,box.x,1.8+Math.sin(time*.003+box.id)*.22,box.z,.12,time*.001+box.id,0);
      for(const prop of BREAKABLES)if(!hidden.has(prop.id)&&near(prop)) {
        if(prop.type==='crate') {
          put(crates,prop.x,.8,prop.z,0,prop.yaw);
          for(const sign of [-1,1])put(braces,prop.x-Math.sin(prop.yaw)*.8,.8,prop.z-Math.cos(prop.yaw)*.8,0,prop.yaw,sign*.75);
        } else {put(cones,prop.x,.74,prop.z);put(bases,prop.x,.1,prop.z);}
      }
      if(active)for(const h of data?.hazards||[])if(h.expires>time){const pos=hazardPosition(h,time);if(near(pos))put(h.type==='oil'?oils:bolts,pos.x,h.type==='oil'?.065:1,pos.z,0,time*.009);}
      if(active)for(const player of [{id:self,x:p.x,y:p.y,z:p.z},...positions])if(shields.count<8&&near(player)&&data?.players[player.id]?.shieldUntil>time)put(shields,player.x,player.y+.5,player.z,0,time*.001);
      for(const bit of particles){put(debris,bit.x,bit.y,bit.z,bit.life*4,bit.life*3,0,Math.min(1,bit.life*3));debris.setColorAt(debris.count-1,new THREE.Color(bit.color));}
      for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;if(debris.instanceColor)debris.instanceColor.needsUpdate=true;
    },
    dispose(){root.removeFromParent();for(const resource of resources)resource.dispose();},
  };
}
