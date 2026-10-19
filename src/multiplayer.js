import * as THREE from 'three';
import { createCar } from './car.js';
import { VEHICLES } from './physics.js';
import { modelOf, isAircraft } from './vehicleModels.js';
import { RemoteCollisions } from './remoteCollisions.js';
import { playerName } from './playerName.js';
import { aircraftTagScale } from './aircraftSpecs.js';

function nameTag(name) {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(18,29,27,.82)'; ctx.beginPath(); ctx.roundRect(8,8,304,56,18); ctx.fill();
  ctx.fillStyle = '#f5f2e8'; ctx.font = '600 29px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name,160,37,285);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, depthTest: false,
    fog: false, toneMapped: false, sizeAttenuation: false,
  }));
  sprite.renderOrder = 1000;
  sprite.scale.set(.15,.03375,1); return sprite;
}

function disposeTag(tag) {
  if (!tag) return;
  tag.removeFromParent(); tag.material.map.dispose(); tag.material.dispose();
}

export function createMultiplayer(scene, physics, callbacks = {}) {
  const remotes = new Map(), collisions = new RemoteCollisions(physics);
  let socket, selfId, room, localTag, lastSent = 0,lastClock=0,airHealth=new Map();
  const status = (message, active = false) => callbacks.onStatus?.(message, room, active);
  function remove(id) {
    const remote = remotes.get(id);
    if (remote) { disposeTag(remote.tag); remote.car.dispose(); remotes.delete(id); }
    collisions.remove(id);
  }
  function clear() { [...remotes.keys()].forEach(remove); collisions.clear(); disposeTag(localTag); localTag = null; selfId = null;airHealth.clear(); }
  function updateRemote(data) {
    if (!data?.ready || data.id === selfId) return;
    let remote = remotes.get(data.id);
    if (!remote) {
      const car = createCar(scene,{simple:true}), tag = nameTag(data.name || 'Driver'); scene.add(tag);
      remote = { car, tag, target: new THREE.Vector3(), targetQ: new THREE.Quaternion(), vehicle: null, received: 0 };
      car.root.position.set(data.x,data.y,data.z); remotes.set(data.id, remote);
    }
    if (remote.vehicle !== data.vehicle) {
      remote.car.setProfile(VEHICLES[data.vehicle] || VEHICLES.veloce); remote.vehicle = data.vehicle;
    }
    remote.car.paint.color.set(data.paint || '#67877d'); remote.data = data; remote.received = performance.now();
    remote.airHP=airHealth.get(data.id)??(isAircraft(data.vehicle)?100-(data.damage||0):100);
    remote.car.applyDamage(data.dents||[]);remote.car.paint.color.multiplyScalar(1-(data.damage||0)*.0015);
    remote.target.set(data.x,data.y,data.z); remote.targetQ.set(data.qx,data.qy,data.qz,data.qw).normalize();
    if (remote.car.root.position.distanceTo(remote.target) > 12) remote.car.root.position.copy(remote.target);
    if(!isAircraft(data.vehicle))collisions.receive(data, remote.received);else collisions.remove(data.id);
  }
  function connect(type, getMeta, code = '') {
    const meta = getMeta(); meta.name = playerName(meta.name);
    if (!meta.name) { callbacks.onError?.('Enter your driver name before joining.'); return; }
    const old = socket; socket = null; old?.close(); clear(); status('OFFLINE');
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    socket = ws; status('CONNECTING');
    ws.addEventListener('open', () => { if (socket === ws) ws.send(JSON.stringify({t:type,room:code,...meta})); });
    ws.addEventListener('message', event => {
      if (socket !== ws) return;
      let p; try { p = JSON.parse(event.data); } catch { return; }
      if (p.t === 'welcome') {
        selfId = p.id; room = p.room; lastSent = 0; status('ROOM ' + room,true);
        disposeTag(localTag); localTag = nameTag(p.name || meta.name); scene.add(localTag);
        callbacks.onRoom?.(p); callbacks.onJoined?.(room,p.public); p.players.forEach(updateRemote);
      } else if (p.t === 'join' || p.t === 'state') updateRemote(p.player);
      else if (p.t.startsWith('air')) callbacks.onAir?.(p);
      else if (p.t === 'traffic') callbacks.onTraffic?.(p.density);
      else if (p.t === 'npcDamage') callbacks.onNPCDamage?.(p);
      else if (p.t === 'clock') callbacks.onClock?.(p.now-(p.sent+Date.now())/2);
      else if (p.t === 'raceStart' || p.t === 'raceState') callbacks.onRace?.(p);
      else if (p.t === 'recover') callbacks.onRecover?.(p);
      else if (p.t === 'leave') remove(p.id);
      else if (p.t === 'error') { clear(); status('OFFLINE'); callbacks.onError?.(p.message); ws.close(); }
    });
    ws.addEventListener('close', () => { if (socket === ws) { clear(); socket = null; status('OFFLINE'); } });
    ws.addEventListener('error', () => { if (socket === ws) { status('OFFLINE'); callbacks.onError?.('Could not connect to multiplayer.'); ws.close(); } });
  }
  const send = p => { if (socket?.readyState === WebSocket.OPEN && selfId && socket.bufferedAmount < 16384) socket.send(JSON.stringify(p)); };
  const offsets = new THREE.Vector3();
  return {
    quick: meta => connect('quick',meta), create: meta => connect('create',meta),
    join: (code,meta) => connect('join',meta,code.trim().toUpperCase()),
    setTraffic: density => send({t:'traffic',density}),
    startRace: () => send({t:'raceStart'}), recover: raceId => send({t:'recover',raceId}),
    useItem: raceId => send({t:'useItem',raceId}),
    npcHit: index=>send({t:'npcHit',index}),
    airFire:aim=>send({t:'airFire',aim}),airRespawn:()=>send({t:'airRespawn'}),airCrash:()=>send({t:'airCrash'}),
    airLock:target=>send({t:'airLock',target}),airLaunch:()=>send({t:'airLaunch'}),airFlare:()=>send({t:'airFlare'}),
    setAirState(snapshot){airHealth=new Map((snapshot?.pilots||[]).map(p=>[p.id,p.hp]));for(const p of snapshot?.pilots||[]){const remote=remotes.get(p.id);if(remote)remote.airHP=p.hp;}},
    positions:()=>[...remotes.values()].filter(r=>r.car.root.visible).map(r=>({id:r.data.id,name:r.data.name,vehicle:r.vehicle,q:r.car.root.quaternion,x:r.car.root.position.x,y:r.car.root.position.y,z:r.car.root.position.z,radius:r.vehicle==='skyliner'?22:7})),
    beforeStep: () => collisions.beforeStep(), protectSpawn: () => collisions.protectSpawn(),
    update(local, dt) {
      if (localTag) {localTag.position.set(local.x,local.y+modelOf(local.vehicle).roof+1.2,local.z);const air=isAircraft(local.vehicle),size=air?aircraftTagScale(0,true):.15;localTag.scale.set(size,size*.225,1);localTag.center.set(.5,air?0:.5);}
      if (performance.now()-lastSent >= 50) { lastSent = performance.now(); send({t:'state',...local}); }
      if(selfId&&Date.now()-lastClock>5000){lastClock=Date.now();send({t:'clock',sent:lastClock});}
      for (const remote of remotes.values()) {
        const {car,data} = remote;
        const age = Math.max(0,(performance.now()-remote.received)/1000);
        car.root.visible = age < .75 && (remote.airHP??100)>0; car.wheels.forEach(w => w.visible = car.root.visible);
        const ahead = Math.min(age,.15);
        remote.target.set(data.x+data.vx*ahead,data.y+data.vy*ahead,data.z+data.vz*ahead);
        car.root.position.lerp(remote.target,1-Math.exp(-dt*22)); car.root.quaternion.slerp(remote.targetQ,1-Math.exp(-dt*22));
        const model = modelOf(remote.vehicle);
        remote.tag.position.copy(car.root.position); remote.tag.position.y += model.roof + .8;
        const air=isAircraft(remote.vehicle),size=air?aircraftTagScale(car.root.position.distanceTo(physics.chassis.position)):.15;
        remote.tag.scale.set(size,size*.225,1);remote.tag.center.set(.5,air?0:.5);
        remote.wheelie=(remote.wheelie||0)+((data.wheelie||0)-(remote.wheelie||0))*(1-Math.exp(-dt*12));
        car.visualPose(remote.wheelie,data.steer||0,Math.hypot(data.vx,data.vz),dt);
        car.flightVisual(data.landingGear||0,dt,Math.hypot(data.vx,data.vy,data.vz));
        if(remote.car.root.position.distanceTo(physics.chassis.position)>(isAircraft(data.vehicle)?5000:350)){car.root.visible=false;car.wheels.forEach(w=>w.visible=false);}
        remote.tag.visible=car.root.visible;
        car.materials.red.emissiveIntensity = data.braking ? 2.2 : .32;
      }
    },
  };
}
