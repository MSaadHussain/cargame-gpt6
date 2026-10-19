import * as THREE from 'three';
import { AirCombat } from './airCombatRules.js';
import { createFlightEffects } from './flightEffects.js';
import { aircraftSpec } from './aircraftSpecs.js';
import { MissileWarning } from './missileWarning.js';

export function createAirEffects(scene) {
  const group=new THREE.Group();scene.add(group);
  const geometry=new THREE.IcosahedronGeometry(1,0),tracerGeometry=new THREE.CylinderGeometry(.13,.13,1,5);
  const sparks=new THREE.MeshBasicMaterial({color:'#ffae39',toneMapped:false}),smoke=new THREE.MeshBasicMaterial({color:'#42494c'}),tracer=new THREE.MeshBasicMaterial({color:'#fff29a',toneMapped:false});
  const particles=[],shots=[];
  function remove(list,index){list[index].mesh.removeFromParent();list.splice(index,1);}
  return {
    shot(event) {
      if(shots.length>=24)remove(shots,0);
      const mesh=new THREE.Mesh(tracerGeometry,tracer),dir=new THREE.Vector3(event.direction.x,event.direction.y,event.direction.z),length=event.length;
      mesh.position.set(event.origin.x,event.origin.y,event.origin.z).addScaledVector(dir,length/2);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);mesh.scale.y=length;group.add(mesh);shots.push({mesh,life:.11});
    },
    explode(position) {
      for(let i=0;i<32;i++) {
        if(particles.length>=128)remove(particles,0);
        const mesh=new THREE.Mesh(geometry,i%3? sparks:smoke);mesh.position.set(position.x,position.y,position.z);mesh.scale.setScalar(1+i%4);group.add(mesh);
        particles.push({mesh,life:1.6+i%4*.2,velocity:new THREE.Vector3(Math.sin(i*2.4)*25,Math.cos(i*1.6)*25,Math.cos(i*2.4)*25)});
      }
    },
    update(dt) {
      for(let i=shots.length-1;i>=0;i--){shots[i].life-=dt;if(shots[i].life<=0)remove(shots,i);}
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){remove(particles,i);continue;}p.velocity.y-=10*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.multiplyScalar(1+dt*.5);}
    },
    clear(){group.clear();particles.length=0;shots.length=0;},
    stats:()=>({airParticles:particles.length,airTracers:shots.length}),
    dispose(){group.removeFromParent();geometry.dispose();tracerGeometry.dispose();sparks.dispose();smoke.dispose();tracer.dispose();},
  };
}

export function createDogfight(scene,physics,car,hooks) {
  const fx=createAirEffects(scene),flightFx=createFlightEffects(scene),panel=document.createElement('section'),reticle=document.createElement('div');
  panel.className='air-panel';panel.hidden=true;reticle.className='air-reticle';reticle.hidden=true;
  panel.innerHTML='<div class="air-eyebrow">SKYPORT · AIR ARENA</div><h2>Flight control</h2><p class="air-stats"></p><p class="air-status"></p><p class="air-weapons"></p><ol class="air-board"></ol><button type="button">Recover / respawn · R</button><small>Click: capture · Esc: release · Mouse 1: cannon<br>Q: target lock · E: missile · F: flares (3)<br>H: landing gear · hold X: rear camera<br>W/S: thrust / brake · A/D: full rolls<br>Mouse / arrows: loops · Shift: afterburner<br>C: cockpit · Z: centre aim · M: sound</small>';
  document.querySelector('#game').append(panel,reticle);
  const stats=panel.querySelector('.air-stats'),status=panel.querySelector('.air-status'),board=panel.querySelector('.air-board');
  const solo=new AirCombat();let enabled=false,online=false,self='solo',snapshot=null,lastShot=0,lastCrash=0,lastPaint=0,lastRespawn=0,offset=0;
  const warning=new MissileWarning(()=>hooks.sound?.('warning',physics.chassis.position));
  const mine=()=>snapshot?.pilots.find(p=>p.id===self);
  const now=()=>Date.now()+offset;
  function accept(air){if(!air)return;snapshot=air;offset=air.serverNow-Date.now();hooks.state(air);flightFx.missiles(air.missiles);}
  function place(spawn){hooks.place(spawn);car.root.visible=true;physics.damage=0;lastCrash=0;}
  function recover(){if(!enabled)return false;if(online)hooks.respawn();else {const spawn=solo.respawn(self);if(spawn){place(spawn);accept(solo.snapshot());}else hooks.toast('Recovery cooling down. Wait a few seconds.');}return true;}
  panel.querySelector('button').onclick=recover;
  function receive(event){if(!enabled)return;if(event.t==='airNotice'){hooks.toast(event.message);return;}if(event.t==='airRespawn'){place(event.spawn);return;}accept(event.air);if(event.t==='airShot'){fx.shot(event);hooks.sound?.('cannon',event.origin);if(event.hit===self)hooks.toast('Cannon hit!');if(event.hit&&event.shooter===self)hooks.toast(event.destroyed?'Aircraft destroyed! +1 kill':'Hit confirmed');}if(event.t==='airFlare'){flightFx.burst(event);hooks.sound?.('flare',event);}if(event.t==='airMissile')hooks.sound?.('missile',event.missile);if(event.destroyed){fx.explode(event.destroyed);hooks.sound?.('explosion',event.destroyed);}}
  function localPositions(){const q=physics.chassis.quaternion;return new Map([[self,{ready:true,stateAt:Date.now(),vehicle:physics.spec.id,...physics.chassis.position,qx:q.x,qy:q.y,qz:q.z,qw:q.w}]]);}
  function flare(){if(!enabled)return;if(online)hooks.flare();else{const event=solo.weapons.flare(self,localPositions());if(event)receive(event);else hooks.toast('Flares empty or cooling down.');}}
  function lock(){if(!enabled)return;const target=hooks.target();if(!online||!target){hooks.toast('Aim at another player, then press Q.');return;}hooks.lock(target);}
  function launch(){if(!enabled)return;if(online)hooks.launch();else hooks.toast('Join multiplayer to lock onto another pilot.');}
  return {
    map(id){enabled=id==='skyport';online=false;self='solo';snapshot=null;fx.clear();flightFx.clear();panel.hidden=!enabled;reticle.hidden=!enabled;car.root.visible=true;document.querySelector('#game').classList.toggle('flight-map',enabled);if(enabled){solo.pilots.clear();solo.weapons.missiles=[];solo.join(self,'Solo pilot');accept(solo.snapshot());}},
    joined(room){if(!enabled)return;online=true;self=room.id;accept(room.air);if(room.airSpawn)place(room.airSpawn);},
    offline(){if(!enabled)return;online=false;self='solo';solo.pilots.clear();const spawn=solo.join(self,'Solo pilot');accept(solo.snapshot());place(spawn);},
    receive,recover,flare,lock,launch,
    update(dt,input,camera,paused) {
      fx.update(dt);if(!enabled){warning.reset();return;}
      const pos=physics.chassis.position;flightFx.update(dt,[...(car.root.visible&&!physics.flight.grounded?[{...pos,q:car.root.quaternion,vehicle:physics.spec.id}]:[]),...hooks.targets()]);
      const p=mine();
      if(physics.flight.crashed&&(p?.hp??100)>0&&Date.now()-lastCrash>500){lastCrash=Date.now();if(online)hooks.crash();else{const destroyed=solo.die(self,physics.chassis.position);receive({t:'airCrash',destroyed,air:solo.snapshot()});}}
      physics.damage=100-(mine()?.hp??100);car.root.visible=physics.damage<100;
      if(physics.damage>=100&&now()>=(mine()?.respawnAt??Infinity)&&Date.now()-lastRespawn>700){lastRespawn=Date.now();recover();}
      const aim=hooks.aim(camera);
      if(!paused&&input.fire&&physics.spec.id==='kestrel'&&physics.damage<100&&Date.now()-lastShot>=250){lastShot=Date.now();if(online)hooks.fire(aim.point);else{const q=physics.chassis.quaternion,v={id:self,ready:true,stateAt:Date.now(),vehicle:'kestrel',...physics.chassis.position,qx:q.x,qy:q.y,qz:q.z,qw:q.w};const event=solo.fire(self,new Map([[self,v]]),Date.now(),aim.point);if(event)receive(event);}}
      const visible=car.root.visible&&!paused&&!input.rearView;
      reticle.hidden=!visible;reticle.style.left=`${(aim.screen.x*.5+.5)*100}%`;reticle.style.top=`${(-aim.screen.y*.5+.5)*100}%`;
      const incoming=warning.update(snapshot,self,{enabled,paused});
      panel.classList.toggle('incoming',incoming);
      if(Date.now()-lastPaint<100)return;lastPaint=Date.now();
      stats.textContent=`ALT ${Math.round(physics.chassis.position.y)} m · THR ${Math.round(physics.flight.throttle*100)}% · HULL ${mine()?.hp??100}% · GEAR ${physics.flight.gear>.95?'DOWN':physics.flight.gear<.01?'UP':'MOVING'}`;
      const pilot=mine();
      const targetName=snapshot?.pilots.find(p=>p.id===pilot?.lockTarget)?.name||'target';
      panel.querySelector('.air-weapons').textContent=`${incoming?'⚠ MISSILE INBOUND — F FLARES! · ':''}Missiles ${pilot?.missiles??4}/4 · Flares ${pilot?.flares??3}/3 · ${pilot?.lockTarget?(pilot.lockReady?`LOCKED: ${targetName} — E to launch`:`LOCKING: ${targetName}...`):'Q to lock'}`;
      const wait=Math.max(0,Math.ceil(((mine()?.respawnAt||0)-now())/1000));
      status.textContent=physics.damage>=100?`Destroyed · respawn in ${wait}s`:input.rearView?'REAR VIEW · release X to return':physics.flight.grounded?'LANDED · S brakes · W thrust + pitch up to take off':physics.flight.speed<aircraftSpec(physics.spec.id).stallSpeed?'STALL · increase thrust':physics.spec.id!=='kestrel'?'Unarmed aircraft · F flares / H gear':(mine()?.protectedUntil??0)>now()?'Spawn shield · firing ends protection':online?'Mouse 1 cannon · Q lock / E missile':'Solo flight · join multiplayer for dogfights';
      board.replaceChildren();for(const pilot of [...(snapshot?.pilots||[])].sort((a,b)=>b.kills-a.kills)){const li=document.createElement('li');li.textContent=`${pilot.name}: ${pilot.kills} kills / ${pilot.deaths} losses`;board.append(li);}
    },
    stats:()=>({...fx.stats(),...flightFx.stats()}),
  };
}
