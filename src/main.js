import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DrivingPhysics, FIXED_STEP, VEHICLES } from './physics.js';
import { buildWorld, MAPS } from './world.js';
import { Traffic, reseedTraffic } from './traffic.js';
import { SharedTraffic } from './sharedTraffic.js';
import { createCar } from './car.js';
import { createUI, icon } from './ui.js';
import { EngineAudio } from './audio.js';
import { createMultiplayer } from './multiplayer.js';
import { playerName } from './playerName.js';
import { createRacing } from './racing.js';
import { createArcadeView } from './arcadeView.js';
import { CIRCUIT } from './circuit.js';
import { orbitPose } from './cameraOrbit.js';
import { isTwoWheeler, isAircraft, modelOf, vehicleForMap, VEHICLE_CATEGORIES, categoryOf, matchesCategory } from './vehicleModels.js';
import { createDogfight } from './dogfight.js';
import { createFlightMouse, flightAimPoint } from './flightMouse.js';
import { flightClipPlanes } from './flightGround.js';
import { toggleLandingGear } from './flight.js';
import { flightCameraPose } from './aircraftVisual.js';
import './style.css';

const ui = createUI();
const { $ } = ui;
try { await startGame(); } catch (error) {
  console.error(error);
  $('loading').innerHTML = '<strong>The engine couldn’t start.</strong><span>This game needs a browser with WebGL 2 enabled.</span><button class="primary-button" style="width:auto" onclick="location.reload()">Try again</button>';
}

async function startGame() {
  const renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8ccce'); scene.fog = new THREE.Fog('#b9c9c3', 95, 355);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.55;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#e0ece6', '#858573', 2.7));
  const sun = new THREE.DirectionalLight('#fff0ca', 3.6); sun.position.set(-70, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -65; sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65; sun.shadow.camera.near = 1; sun.shadow.camera.far = 230;
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(49, 1, 0.065, 1600);
  const physics = new DrivingPhysics();
  const car = createCar(scene);
  const audio = new EngineAudio();
  const keys = new Set(), touch = new Set();
  let flightMouse=null;
  const state = {
    camera: 'chase', paused: false, units: 'kmh',
    shake: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    yaw: 0, pitch: 0, zoom: 1, shakeAmount: 0, mode: 'free', running: false,
    checkpoint: 0, trialTime: 0, hasDriven: false, map: 'portside', vehicle: 'veloce',
    paint: VEHICLES.veloce.paint, trafficEnabled: true, pad: false, density: null,
  };
  let multiplayerActive = false, multiplayerAdmin = false;
  const arcadeView=createArcadeView(scene,physics,message=>ui.toast(message));
  const racing = createRacing(physics, {
    place(spawn) {
      multiplayer.protectSpawn(); physics.placeAt(spawn.x,spawn.z,spawn.heading);
      world?.update(physics.chassis.position);
      physics.damage=0;car.repair();car.sync(physics);clearInputs();accumulator=0;updateCamera(1,true);
    },
    start:()=>multiplayer.startRace(), recover:id=>multiplayer.recover(id),
    useItem:id=>multiplayer.useItem(id),arcade:arcadeView,
    name:()=>playerName($('mp-player-name').value), toast:message=>ui.toast(message),
  });
  const multiplayer = createMultiplayer(scene, physics, {
    onStatus(message, room, live) {
      $('multiplayer-status').textContent = message;
      $('multiplayer-button').classList.toggle('live', live);
      $('mp-room-status').textContent = live ? `Connected to room ${room}. Share the invite link with friends.` : message;
      if (message === 'OFFLINE') {
        multiplayerActive = false; multiplayerAdmin = false;
        racing.offline();
        dogfight.offline();
        $('density').disabled = false; $('hud-density').disabled = false; $('mp-density').disabled = true;
        $('traffic-setting').disabled = false;
        if(traffic instanceof SharedTraffic){traffic.dispose();traffic=new Traffic(scene,physics,world.route,['apex','skyport'].includes(state.map)?0:(state.density??15),64);}
      }
    },
    onJoined(room, isPublic) {
      $('mp-room-code').value = room;
      ui.toast(`Joined ${isPublic ? 'public' : 'private'} room ${room}.`);
    },
    onError(message) { ui.toast(message); },
    onRoom(room) {
      const { density, isAdmin, public: isPublic, map } = room;
      multiplayerActive = false;
      if (map !== state.map && MAPS[map]) loadMap(map);
      multiplayerActive = true; multiplayerAdmin = isAdmin;
      traffic?.dispose();traffic=new SharedTraffic(scene,physics,world.route,room,index=>multiplayer.npcHit(index));
      racing.joined(room);
      if(room.vehicle&&room.vehicle!==state.vehicle)applyVehicle(room.vehicle,false);
      dogfight.joined(room);
      state.trafficEnabled = true; $('traffic-setting').checked = true; $('traffic-setting').disabled = true;
      traffic?.setEnabled(true);
      applyDensity(density);
      $('density').disabled = true; $('hud-density').disabled = true;
      $('mp-density').value = String(density); $('mp-density-value').textContent = String(density);
      $('mp-density').disabled = !isAdmin || ['apex','skyport'].includes(map);
      $('mp-density-note').textContent = isAdmin ? 'You are the room admin. This changes traffic for everyone.' : isPublic ? 'Public rooms use a fixed 15 cars.' : 'Only the room creator can change traffic.';
      if(map==='apex') $('mp-density-note').textContent='Race circuit: no AI traffic. The race host controls starts and restarts.';
      if(map==='skyport') $('mp-density-note').textContent='Aircraft-only airspace: road traffic is disabled.';
    },
    onTraffic(density) {
      applyDensity(density); $('mp-density').value = String(density); $('mp-density-value').textContent = String(density);
    },
    onNPCDamage:packet=>{if(traffic instanceof SharedTraffic)traffic.sync(packet);},
    onClock:offset=>{if(traffic instanceof SharedTraffic)traffic.offset=offset;},
    onRace:packet=>racing.receive(packet),
    onRecover:packet=>racing.recovered(packet),
    onAir:packet=>dogfight.receive(packet),
  });
  const dogfight=createDogfight(scene,physics,car,{
    fire:aim=>multiplayer.airFire(aim),respawn:()=>multiplayer.airRespawn(),crash:()=>multiplayer.airCrash(),
    lock:target=>multiplayer.airLock(target),launch:()=>multiplayer.airLaunch(),flare:()=>multiplayer.airFlare(),targets:()=>multiplayer.positions(),
    sound:(kind,point)=>audio.aircraftEvent(kind,Math.max(.03,1-physics.chassis.position.distanceTo(point)/1800)),
    target(){const aim=flightMouse?.aim??{x:0,y:0};let best=null,distance=.3;for(const p of multiplayer.positions()){const point=new THREE.Vector3(p.x,p.y,p.z).project(camera);const d=Math.hypot(point.x-aim.x,point.y-aim.y);if(point.z<1&&d<distance){best=p.id;distance=d;}}return best;},
    aim(camera){const screen=flightMouse?.aim??{x:0,y:0};return {screen,point:flightAimPoint(camera,screen,multiplayer.positions())};},
    state:air=>multiplayer.setAirState(air),toast:message=>ui.toast(message),
    place(spawn){physics.placeAt(spawn.x,spawn.z,spawn.heading,spawn.y);physics.damage=0;car.repair();car.sync(physics);world?.update(physics.chassis.position);clearInputs();accumulator=0;updateCamera(1,true);},
  });
  try { $('mp-player-name').value = localStorage.getItem('oversteer-driver-name') || ''; } catch { /* Optional storage. */ }
  const multiplayerMeta = () => {
    const name = playerName($('mp-player-name').value);
    try { localStorage.setItem('oversteer-driver-name', name); } catch { /* Optional storage. */ }
    return { name, map: state.map, vehicle: state.vehicle, paint: state.paint };
  };
  const drift = { active: false, score: 0, banked: 0, multiplier: 1, idle: 0, best: 0 };
  $('shake-setting').checked = state.shake;

  let world = null, traffic = null, checkpoints = [];
  let fpsTime = 0, fpsFrames = 0, accumulator = 0, lastTime = performance.now(), uiClock = 0, rpm = 850;
  const cameraPosition = new THREE.Vector3(), cameraTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3();
  const localCamera = new THREE.Vector3(), forward = new THREE.Vector3();
  const rayResult = new CANNON.RaycastResult();
  physics.chassis.collisionFilterGroup = 2;
  const marks = [];
  const skidGeometry = new THREE.PlaneGeometry(0.2, 0.65);
  const skidMaterial = new THREE.MeshBasicMaterial({ color: '#343b36', transparent: true, opacity: 0.32, depthWrite: false });
  let skidIndex = 0, skidTick = 0;
  for (let i = 0; i < 220; i++) {
    const mark = new THREE.Mesh(skidGeometry, skidMaterial); mark.rotation.x = -Math.PI / 2; mark.visible = false; scene.add(mark); marks.push(mark);
  }

  const gate = new THREE.Group(); gate.visible = false; scene.add(gate);
  const gateMat = new THREE.MeshBasicMaterial({ color: '#ff8a46', transparent: true, opacity: 0.78 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.7, 0.24), gateMat); post.position.set(side * 5.8, 2.85, 0); gate.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.08, 24), gateMat); base.position.set(side * 5.8, 0.04, 0); gate.add(base);
  }
  const gateTop = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.24, 0.24), gateMat); gateTop.position.y = 5.7; gate.add(gateTop);
  const gateArrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.65, 3), gateMat); gateArrow.rotation.z = Math.PI; gateArrow.position.y = 4.7; gate.add(gateArrow);

  const bestTimes = {};
  for (const id of Object.keys(MAPS)) {
    try { bestTimes[id] = Number(localStorage.getItem(`oversteer-best-${id}`)) || null; } catch { bestTimes[id] = null; }
  }
  try { drift.best = Number(localStorage.getItem('oversteer-drift')) || 0; } catch { /* Storage is optional. */ }

  function formatTime(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`; }

  // --- Map loading --------------------------------------------------------
  function loadMap(id, notify = true) {
    if (multiplayerActive && id !== state.map) { ui.toast('Room members share one map. Reload to leave the room first.'); return; }
    if (traffic) traffic.dispose();
    if (world) world.dispose();
    physics.clearScenery();
    reseedTraffic();
    state.map = id;
    flightMouse?.release();
    racing.map(id);
    dogfight.map(id);
    world = buildWorld(scene, physics, id);
    applyRenderQuality();
    const definition = world.map;
    scene.background.set(definition.sky ?? world.sky ?? '#b8ccce');
    scene.fog.color.set(world.fog.color); scene.fog.near = world.fog.near; scene.fog.far = world.fog.far;
    const density = ['apex','skyport'].includes(id)?0:(state.density ?? definition.traffic);
    traffic = new Traffic(scene, physics, world.route, density, 64);
    traffic.setEnabled(state.trafficEnabled);
    setDensityDisplay(density);
    checkpoints = buildCheckpoints();
    $('weather-label').textContent = physics.grip < 1 ? 'Slippery roads' : definition.weather;
    $('location-name').textContent = definition.location;
    document.querySelector('.map-top span').innerHTML = `${icon('pin')} ${definition.name.toUpperCase()}`;
    document.querySelectorAll('.map-choice').forEach(node => {
      const active = node.dataset.map === id;
      node.classList.toggle('active', active); node.setAttribute('aria-pressed', String(active));
    });
    setMode(['apex','skyport'].includes(id)?'free':state.mode, false);
    $('trial-mode').innerHTML=id==='apex'?'Start race':'Time trial <span class="tiny-tag">01</span>';
    $('minimap').setAttribute('aria-label',`Live map of ${definition.name}`);
    document.querySelector('.map-bottom>span:last-child').textContent=id==='apex'?'5.4 km':id==='coastline'?'Highway':'220 m';
    $('density').disabled=['apex','skyport'].includes(id)||multiplayerActive;$('hud-density').disabled=['apex','skyport'].includes(id)||multiplayerActive;
    $('trial-mode').disabled=id==='skyport';
    const actionButton=document.querySelector('[data-control="handbrake"]');
    actionButton.dataset.roadLabel??=actionButton.innerHTML;
    actionButton.innerHTML=id==='skyport'?'FIRE':actionButton.dataset.roadLabel;
    actionButton.setAttribute('aria-label',id==='skyport'?'Hold to fire aircraft cannon':'Handbrake');
    document.querySelector('.map-bottom>span:last-child').textContent=id==='skyport'?'Air radar':document.querySelector('.map-bottom>span:last-child').textContent;
    const allowed=vehicleForMap(state.vehicle,id);
    if(allowed!==state.vehicle)applyVehicle(allowed,false);
    resetCar(false);
    if (notify) ui.toast(`${definition.name} · ${definition.kind}.`);
  }

  // Trial gates: the city keeps its hand-placed loop, the highway derives them
  // from the route so they always sit on the road.
  function buildCheckpoints() {
    if (state.map === 'portside') {
      return [new THREE.Vector3(-5.2, 0, 4), new THREE.Vector3(-5.2, 0, -84), new THREE.Vector3(84, 0, -84),
        new THREE.Vector3(84, 0, 0), new THREE.Vector3(84, 0, 84), new THREE.Vector3(0, 0, 84), new THREE.Vector3(-5.2, 0, 34)];
    }
    const list = [];
    for (let i = 1; i <= 7; i++) {
      const point = world.route.sample((i / 7) % 1, (world.route.lanes - 1) / 2);
      list.push(new THREE.Vector3(point.x, 0, point.z));
    }
    return list;
  }

  function spawnPoint() {
    const definition = MAPS[state.map];
    return definition.spawn;
  }
  function resetCar(notify = true) {
    multiplayer.protectSpawn();
    const spawn = spawnPoint();
    physics.placeAt(spawn.x, spawn.z, spawn.heading || 0, spawn.y);
    world.update(physics.chassis.position);
    physics.damage = 0;
    car.repair(); world.resetProps(); if (traffic) traffic.reset();
    marks.forEach(m => m.visible = false);
    car.sync(physics); state.shakeAmount = 0; clearInputs(); updateCamera(1, true);
    drift.score = 0; drift.multiplier = 1; drift.active = false; drift.idle = 0;
    if (state.mode === 'trial') {
      state.running = false; state.checkpoint = 0; state.trialTime = 0; gate.visible = true; moveGate();
      $('checkpoint-count').textContent = `0 / ${checkpoints.length - 1} GATES`;
      $('trial-instruction').textContent = 'Drive through the orange gate to start.';
    }
    if (notify) ui.toast(`Good as new. Back at the ${MAPS[state.map].name} start.`);
  }

  function moveGate() {
    gate.position.copy(checkpoints[state.checkpoint]);
    const spawn = spawnPoint();
    const prev = state.checkpoint > 0 ? checkpoints[state.checkpoint - 1] : new THREE.Vector3(spawn.x, 0, spawn.z);
    const delta = checkpoints[state.checkpoint].clone().sub(prev);
    gate.rotation.y = Math.atan2(delta.x, delta.z);
  }
  function setMode(mode, notify = true) {
    if(state.map==='apex' && mode==='trial') { racing.start(); return; }
    state.mode = mode; state.running = false; state.checkpoint = 0; state.trialTime = 0;
    $('free-mode').classList.toggle('selected', mode === 'free'); $('trial-mode').classList.toggle('selected', mode === 'trial');
    $('trial-panel').hidden = mode !== 'trial'; gate.visible = mode === 'trial';
    document.querySelector('.live-label').innerHTML = mode === 'trial'
      ? '<span></span> TIME TRIAL <i>Find your fastest line.</i>'
      : '<span></span> FREE ROAM <i>Nothing to chase. Everything to feel.</i>';
    if (mode === 'trial') {
      resetCar(false); moveGate();
      const best = bestTimes[state.map];
      $('trial-instruction').textContent = best ? `Drive through the gate. Best: ${formatTime(best)}` : 'Drive through the orange gate to start.';
      $('checkpoint-count').textContent = `0 / ${checkpoints.length - 1} GATES`;
      if (notify) ui.toast(`${MAPS[state.map].name} trial · Drive through the orange gate to start.`);
    } else if (notify) ui.toast('Free roam · The road is yours.');
  }
  function updateTrial(dt) {
    if (state.mode !== 'trial' || !gate.visible) return;
    if (state.running) state.trialTime += dt;
    const p = physics.chassis.position, target = checkpoints[state.checkpoint];
    if (Math.hypot(p.x - target.x, p.z - target.z) < 9) {
      if (state.checkpoint === 0) { state.running = true; state.trialTime = 0; ui.toast('Clock is running. Make it a good one.'); }
      state.checkpoint++;
      $('checkpoint-count').textContent = `${Math.max(0, state.checkpoint - 1)} / ${checkpoints.length - 1} GATES`;
      if (state.checkpoint === checkpoints.length) {
        state.running = false; gate.visible = false;
        const best = bestTimes[state.map];
        const record = !best || state.trialTime < best;
        if (record) {
          bestTimes[state.map] = state.trialTime;
          try { localStorage.setItem(`oversteer-best-${state.map}`, state.trialTime); } catch { /* Optional storage. */ }
        }
        $('trial-instruction').textContent = `${record ? 'New personal best! ' : ''}Click Time trial to race again.`;
        ui.toast(`Loop complete · ${formatTime(state.trialTime)}${record ? ' · New personal best!' : ''}`);
      } else { moveGate(); $('trial-instruction').textContent = `Follow the orange gate. ${checkpoints.length - state.checkpoint} to go.`; }
    }
  }

  // --- Input --------------------------------------------------------------
  function padAxes() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dead = v => (Math.abs(v) < 0.14 ? 0 : v);
      const steer = dead(-(pad.axes[0] ?? 0));
      const throttle = pad.buttons[7]?.value ?? 0;
      const brake = pad.buttons[6]?.value ?? 0;
      const handbrake = (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed) ?? false;
      const wheelie=pad.buttons[3]?.pressed||keys.has('KeyB')||touch.has('wheelie');
      if (Math.abs(steer) > 0 || throttle > 0.02 || brake > 0.02 || handbrake) {
        return { steerAxis: steer, throttleAxis: throttle, brakeAxis: brake, handbrake,wheelie };
      }
    }
    return null;
  }
  function inputState() {
    if(state.map==='skyport') {
      const pad=padAxes();
      return {forward:keys.has('KeyW')||touch.has('forward')||(pad?.throttleAxis>.1),backward:keys.has('KeyS')||touch.has('backward')||(pad?.brakeAxis>.1),
        pitchAxis:(flightMouse?.looking?0:flightMouse?.aim.y||0)+(keys.has('ArrowDown')||touch.has('pitch-up')?1:0)-(keys.has('ArrowUp')||touch.has('pitch-down')?1:0),
        rollAxis:(keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right')?1:0)+(pad?.steerAxis||0),
        yawAxis:flightMouse?.looking?0:-(flightMouse?.aim.x||0),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),rearView:keys.has('KeyX')||touch.has('rear-view'),fire:!(keys.has('KeyX')||touch.has('rear-view'))&&(flightMouse?.fire||touch.has('handbrake')||!!pad?.handbrake)};
    }
    const keyboard = {
      forward: keys.has('KeyW') || keys.has('ArrowUp') || touch.has('forward'),
      backward: keys.has('KeyS') || keys.has('ArrowDown') || touch.has('backward'),
      left: keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left'),
      right: keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right'),
      handbrake: keys.has('Space') || touch.has('handbrake'),
      wheelie:keys.has('KeyB')||touch.has('wheelie'),
    };
    const anyKey = keyboard.forward || keyboard.backward || keyboard.left || keyboard.right || keyboard.handbrake;
    if (!anyKey) {
      const pad = padAxes();
      if (pad) { state.pad = true; return pad; }
    }
    state.pad = false;
    return keyboard;
  }
  function clearInputs() { keys.clear(); touch.clear();flightMouse?.reset(); document.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed')); }

  function setCamera(mode) {
    state.camera = mode; state.yaw = 0; state.pitch = 0; car.setCockpit(mode === 'cockpit');
    $('game').classList.toggle('cockpit', mode === 'cockpit');
    for (const [id, value] of [['chase-camera', 'chase'], ['cockpit-camera', 'cockpit']]) {
      $(id).classList.toggle('active', mode === value); $(id).setAttribute('aria-pressed', String(mode === value));
    }
    camera.fov = mode === 'cockpit' ? 76 : 49; camera.near=state.map==='skyport'?flightClipPlanes(mode==='cockpit').near:.065;camera.updateProjectionMatrix();
    updateCamera(1, true);
  }
  function showDialog(id) { clearInputs(); state.paused = true;flightMouse?.release(); $(id).showModal(); updatePauseButton(); }
  function updatePauseButton() { $('pause-button').innerHTML = icon(state.paused ? 'play' : 'pause'); $('pause-button').setAttribute('aria-label', state.paused ? 'Resume driving' : 'Pause driving'); }
  function resume() {
    document.querySelectorAll('dialog[open]').forEach(d => d.close()); state.paused = false; accumulator = 0; clearInputs(); updatePauseButton();
  }
  function togglePause() { if (state.paused) resume(); else showDialog('pause-dialog'); }
  async function toggleSound() {
    try { const on = await audio.toggle(); $('sound-button').innerHTML = icon(on ? 'sound' : 'mute'); $('sound-button').setAttribute('aria-label', on ? 'Mute engine audio' : 'Enable engine audio'); }
    catch { ui.toast('Audio is unavailable in this browser.'); }
  }

  // --- Map and vehicle pickers -------------------------------------------
  $('map-choices').innerHTML = Object.values(MAPS).map(m => `
    <button class="map-choice" data-map="${m.id}" aria-pressed="false">
      <span class="swatch">${m.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="map-choice-body"><em>${m.kind}</em><strong>${m.name}</strong><span>${m.blurb}</span></span>
    </button>`).join('');
  document.querySelectorAll('.map-choice').forEach(node => {
    node.onclick = () => { if (node.dataset.map !== state.map) loadMap(node.dataset.map); resume(); };
  });
  const categoryBar = document.createElement('div');
  categoryBar.className = 'vehicle-categories';
  categoryBar.setAttribute('role', 'group');
  categoryBar.setAttribute('aria-label', 'Vehicle category');
  categoryBar.innerHTML = Object.entries(VEHICLE_CATEGORIES).map(([id, label]) =>
    `<button type="button" data-category="${id}" aria-pressed="${id === 'all'}">${label} <small>${Object.keys(VEHICLES).filter(v => matchesCategory(v, id)).length}</small></button>`).join('');
  $('vehicle-choices').before(categoryBar);
  let selectedCategory = 'all';
  function filterVehicles(category) {
    selectedCategory = category;
    categoryBar.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    $('vehicle-choices').querySelectorAll('.vehicle-choice').forEach(button => {
      button.hidden = !matchesCategory(button.dataset.vehicle, category);
    });
  }
  categoryBar.querySelectorAll('button').forEach(button => { button.onclick = () => filterVehicles(button.dataset.category); });
  $('vehicle-choices').innerHTML = Object.values(VEHICLES).map(v => `
    <button type="button" class="vehicle-choice" data-vehicle="${v.id}" aria-pressed="false">
      <strong>${v.name} ${v.badge}</strong><span>${v.mass.toLocaleString()} kg · ${v.engine} · ${v.drivetrain}</span>
    </button>`).join('');
  function applyVehicle(id, notify = true) {
    if(racing.active) { ui.toast('Change your car before the race starts.'); return; }
    if(isAircraft(id)!==(state.map==='skyport')) {
      if(multiplayerActive){ui.toast('Aircraft fly in Skyport only; road vehicles use the road maps. Leave this room to switch maps.');return;}
      loadMap(isAircraft(id)?'skyport':'portside',false);
    }
    multiplayer.protectSpawn();
    const spec = physics.setVehicle(id);
    if((isTwoWheeler(id)||isAircraft(id)||['tempest','formula'].includes(id))&&state.vehicle!==id){state.paint=spec.paint;$('paint-name').textContent=id==='rider'?'Graphite':id==='tempest'?'Solar yellow':id==='formula'?'Race red':spec.paintName;document.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('active',b.dataset.color===state.paint);b.setAttribute('aria-pressed',String(b.dataset.color===state.paint));});}
    state.vehicle = spec.id;
    if (!matchesCategory(spec.id, selectedCategory)) filterVehicles(categoryOf(spec.id));
    car.setProfile(spec);
    car.paint.color.set(state.paint);
    $('garage-name').innerHTML = `${spec.name} <em>${spec.badge}</em>`;
    $('garage-blurb').textContent = spec.blurb;
    $('spec-mass').innerHTML = `${spec.mass.toLocaleString()}<small>kg</small>`;
    $('spec-drive').textContent = spec.drivetrain;
    $('spec-engine').textContent = spec.engine;
    document.querySelector('.car-ident h2').innerHTML = `${spec.name} <span>${spec.badge}</span>`;
    document.querySelector('.drivetrain').textContent = spec.drivetrain;
    document.querySelectorAll('.vehicle-choice').forEach(node => {
      const active = node.dataset.vehicle === spec.id;
      node.classList.toggle('active', active); node.setAttribute('aria-pressed', String(active));
    });
    const spawn = spawnPoint();
    physics.placeAt(spawn.x, spawn.z, spawn.heading || 0, spawn.y);
    world.update(physics.chassis.position);
    car.sync(physics); updateCamera(1, true);
    if (notify) ui.toast(`${spec.name} ${spec.badge} · ${spec.mass.toLocaleString()} kg of ${spec.drivetrain}.`);
  }
  document.querySelectorAll('.vehicle-choice').forEach(node => {
    node.onclick = () => applyVehicle(node.dataset.vehicle);
  });

  $('chase-camera').onclick = () => setCamera('chase'); $('cockpit-camera').onclick = () => setCamera('cockpit');
  $('free-mode').onclick = () => setMode('free'); $('trial-mode').onclick = () => setMode('trial');
  $('settings-button').onclick = () => showDialog('settings-dialog');
  $('garage-button').onclick = () => showDialog('garage-dialog');
  $('map-button').onclick = () => showDialog('map-dialog');
  $('help-button').onclick = () => showDialog('help-dialog');
  $('pause-button').onclick = togglePause; $('resume-button').onclick = resume;
  function recoverCar() { if(!dogfight.recover()&&!racing.recover()) resetCar(); }
  $('repair-button').onclick = recoverCar;
  for (const id of ['pause-reset', 'garage-repair']) $(id).onclick = () => { recoverCar(); resume(); };
  $('sound-button').onclick = toggleSound;
  $('multiplayer-button').onclick = () => showDialog('multiplayer-dialog');
  const nameField = $('mp-player-name');
  nameField.required = true;
  nameField.oninput = () => { nameField.setCustomValidity(''); $('mp-name-error').textContent = ''; };
  function startMultiplayer(action) {
    if (!playerName(nameField.value)) {
      const message = 'Enter your name before joining multiplayer.';
      $('mp-name-error').textContent = message;
      nameField.setCustomValidity(message); nameField.focus(); nameField.reportValidity();
      return;
    }
    nameField.setCustomValidity(''); $('mp-name-error').textContent = '';
    nameField.value = playerName(nameField.value);
    action(); resume();
  }
  $('mp-quick').onclick = () => startMultiplayer(() => multiplayer.quick(multiplayerMeta));
  $('mp-create').onclick = () => startMultiplayer(() => multiplayer.create(multiplayerMeta));
  $('mp-join').onclick = () => {
    const code = $('mp-room-code').value.trim();
    if (!code) return ui.toast('Enter a room code first.');
    startMultiplayer(() => multiplayer.join(code, multiplayerMeta));
  };
  $('mp-density').oninput = () => {
    if (!multiplayerActive || !multiplayerAdmin) return;
    const density = Number($('mp-density').value);
    $('mp-density-value').textContent = String(density);
    applyDensity(density); multiplayer.setTraffic(density);
  };
  $('fullscreen-button').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('game').requestFullscreen(); }
    catch { ui.toast('Fullscreen isn’t available. You can still keep driving.'); }
  };
  document.addEventListener('fullscreenchange', () => $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = resume);
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('cancel', e => { e.preventDefault(); resume(); });
    d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) resume(); } });
  });
  function applyRenderQuality() {
    const quality = $('quality').value;
    const apex=state.map==='apex';
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? (apex?1.25:1.75) : quality === 'medium' ? (apex?1:1.15) : .85));
    renderer.shadowMap.enabled = quality !== 'low';
    const shadowSize=apex||quality!=='high'?1024:2048;
    if(sun.shadow.mapSize.x!==shadowSize) {sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);}
    camera.near=state.map==='skyport'?flightClipPlanes(state.camera==='cockpit').near:.065;
    camera.far=state.map==='skyport'?flightClipPlanes(false).far:apex?900:1600;camera.updateProjectionMatrix();resize();
  }
  $('quality').onchange = () => {
    applyRenderQuality(); ui.toast(`Graphics set to ${$('quality').selectedOptions[0].textContent.toLowerCase()}.`);
  };
  $('units').onchange = () => { state.units = $('units').value; $('speed-unit').textContent = state.units === 'mph' ? 'MPH' : 'KM/H'; };
  $('grip').onchange = () => { physics.grip = Number($('grip').value); $('weather-label').textContent = physics.grip < 1 ? 'Slippery roads' : MAPS[state.map].weather; };
  $('damage-setting').onchange = () => physics.damageEnabled = $('damage-setting').checked;
  $('shake-setting').onchange = () => state.shake = $('shake-setting').checked;
  $('traffic-setting').onchange = () => {
    if (multiplayerActive) { $('traffic-setting').checked = true; return; }
    state.trafficEnabled = $('traffic-setting').checked;
    if (traffic) traffic.setEnabled(state.trafficEnabled);
    ui.toast(state.trafficEnabled ? 'Traffic is back on the road.' : 'Roads cleared. Just you now.');
  };
  // The HUD slider and the settings slider are two views of one value.
  function setDensityDisplay(value) {
    $('density').value = String(value); $('hud-density').value = String(value);
    $('density-value').textContent = String(value); $('hud-density-value').textContent = String(value);
  }
  function applyDensity(value) {
    if(['apex','skyport'].includes(state.map)) {setDensityDisplay(0);traffic?.setDensity(0);return;}
    state.density = Number(value);
    setDensityDisplay(state.density);
    if (traffic) traffic.setDensity(state.density);
  }
  $('density').oninput = () => applyDensity($('density').value);
  $('hud-density').oninput = () => applyDensity($('hud-density').value);
  $('volume').oninput = () => audio.volume = Number($('volume').value) / 100;
  document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => {
    state.paint = button.dataset.color;
    car.paint.color.set(state.paint); $('paint-name').textContent = button.dataset.name;
    document.querySelectorAll('[data-color]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  });
  const driveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyB', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space','ShiftLeft','ShiftRight','KeyX'];
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { if (!document.querySelector('dialog[open]')) { e.preventDefault(); togglePause(); } return; }
    if (state.paused || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (driveKeys.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyC') setCamera(state.camera === 'chase' ? 'cockpit' : 'chase');
    if (e.code === 'KeyR') recoverCar();
    if (e.code === 'KeyE') {if(state.map==='skyport')dogfight.launch();else racing.useItem();}
    if (e.code === 'KeyF') {if(state.map==='skyport')dogfight.flare();else resetLook();}
    if (e.code === 'KeyQ'&&state.map==='skyport')dogfight.lock();
    if (e.code === 'KeyH'&&state.map==='skyport') {if(toggleLandingGear(physics)){audio.aircraftEvent('gear');ui.toast(physics.flight.gearDown?'Landing gear extending.':'Landing gear retracting.');}else ui.toast('Landing gear stays down while on the runway.');}
    if (e.code === 'KeyZ'&&state.map==='skyport')resetLook();
    if (e.code === 'KeyM') toggleSound();
    if (e.code === 'KeyV') { const ids = Object.keys(VEHICLES).filter(id=>isAircraft(id)===(state.map==='skyport')); applyVehicle(ids[(ids.indexOf(state.vehicle)+1)%ids.length]); }
    if (e.code === 'KeyN') {const ids=Object.keys(MAPS);loadMap(ids[(ids.indexOf(state.map)+1)%ids.length]);}
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { clearInputs(); if (!state.paused) showDialog('pause-dialog'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !state.paused) showDialog('pause-dialog'); });
  const wheelieButton=document.createElement('button');wheelieButton.dataset.control='wheelie';wheelieButton.textContent='B';wheelieButton.title='Bike wheelie (hold while accelerating)';wheelieButton.setAttribute('aria-label','Hold for bike wheelie');document.querySelector('.touch-controls>div').append(wheelieButton);
  for(const [control,label] of [['pitch-up','UP'],['pitch-down','DOWN'],['rear-view','REAR']]){const b=document.createElement('button');b.dataset.control=control;b.className='flight-touch';b.textContent=label;b.setAttribute('aria-label',`Aircraft ${control}`);document.querySelector('.touch-controls>div').append(b);}
  document.querySelectorAll('[data-control]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (state.paused) return; b.setPointerCapture(e.pointerId); touch.add(b.dataset.control); b.classList.add('pressed'); });
    const release = () => { touch.delete(b.dataset.control); b.classList.remove('pressed'); };
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
  });
  const lookPointers=new Map();
  function resetLook() {state.yaw=0;state.pitch=0;state.zoom=1;flightMouse?.reset();updateCamera(1,true);}
  flightMouse=createFlightMouse($('world'),{
    enabled:()=>state.map==='skyport'&&!state.paused,
    engage:()=>{if(!audio.context)toggleSound();},
    error:message=>ui.toast(message),
    unlock:()=>{clearInputs();if(state.map==='skyport'&&!state.paused)showDialog('pause-dialog');},
    change:locked=>$('game').classList.toggle('flight-mouse-locked',locked),
    look:(dx,dy)=>{state.yaw=(state.yaw-dx*.005)%(Math.PI*2);state.pitch=THREE.MathUtils.clamp(state.pitch-dy*.004,state.camera==='chase'?-.24:-1.1,1.05);},
    lookEnd:resetLook,
  });
  const cameraHelp=document.createElement('div');cameraHelp.className='camera-help';
  cameraHelp.innerHTML='Drag: look · wheel / pinch: zoom <button type="button">Recenter (flight: Z / road: F)</button>';
  cameraHelp.querySelector('button').onclick=resetLook;document.querySelector('.camera-panel').append(cameraHelp);
  $('world').style.touchAction='none';
  $('world').addEventListener('contextmenu',e=>e.preventDefault());
  $('world').addEventListener('dblclick',()=>{if(state.map!=='skyport')resetLook();});
  $('world').addEventListener('pointerdown',e=>{if(state.paused||(state.map==='skyport'&&e.pointerType==='mouse'))return;lookPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});$('world').setPointerCapture(e.pointerId);});
  $('world').addEventListener('pointermove',e=>{
    if(state.map==='skyport'&&e.pointerType==='mouse')return;
    const previous=lookPointers.get(e.pointerId);if(!previous || state.paused)return;
    const next={x:e.clientX,y:e.clientY};
    if(lookPointers.size===2) {
      const other=[...lookPointers.entries()].find(([id])=>id!==e.pointerId)[1];
      const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);
      if(after>5)state.zoom=THREE.MathUtils.clamp(state.zoom*before/after,.4,3);
    } else {
      state.yaw=(state.yaw-(next.x-previous.x)*.005)%(Math.PI*2);
      state.pitch=THREE.MathUtils.clamp(state.pitch-(next.y-previous.y)*.004,state.camera==='chase'?-.24:-1.1,1.05);
    }
    lookPointers.set(e.pointerId,next);
  });
  const endLook=e=>lookPointers.delete(e.pointerId);
  for(const event of ['pointerup','pointercancel','lostpointercapture']) $('world').addEventListener(event,endLook);
  $('world').addEventListener('wheel',e=>{if(state.paused)return;e.preventDefault();state.zoom=THREE.MathUtils.clamp(state.zoom*Math.exp(e.deltaY*.001),.4,3);},{passive:false});

  function updateCamera(dt, snap = false) {
    const air=isAircraft(state.vehicle),rear=air&&(keys.has('KeyX')||touch.has('rear-view'));
    if (state.camera === 'chase'||rear) {
      const pose=air?flightCameraPose(car.root.position,car.root.quaternion,{...state,length:modelOf(state.vehicle).length,rear}):orbitPose(car.root.position,car.root.quaternion,{...state,speed:physics.chassis.velocity.length()});
      camera.up.copy(pose.up??new THREE.Vector3(0,1,0));
      desiredCamera.copy(pose.position);cameraTarget.copy(pose.target);
      const from = new CANNON.Vec3(cameraTarget.x, Math.max(cameraTarget.y, 0.5), cameraTarget.z);
      const to = new CANNON.Vec3(desiredCamera.x, desiredCamera.y, desiredCamera.z);
      rayResult.reset();
      if (physics.world.raycastClosest(from, to, { collisionFilterMask: 1, skipBackfaces: true }, rayResult)) {
        desiredCamera.copy(cameraTarget).lerp(new THREE.Vector3().copy(rayResult.hitPointWorld), 0.85);
      }
      desiredCamera.y = Math.max(0.35, desiredCamera.y);
      if (snap||air) cameraPosition.copy(desiredCamera); else cameraPosition.lerp(desiredCamera, 1 - Math.exp(-dt * 5));
      camera.position.copy(cameraPosition); camera.lookAt(cameraTarget);
      if(camera.fov!==49){camera.fov=49;camera.updateProjectionMatrix();}
    } else {
      localCamera.set(isTwoWheeler(state.vehicle)||state.vehicle==='formula'?0:-.43,isTwoWheeler(state.vehicle)?1.6:.94,isTwoWheeler(state.vehicle)?-.36:-.03); camera.position.copy(localCamera).applyQuaternion(car.root.quaternion).add(car.root.position);
      if(isAircraft(state.vehicle)){localCamera.set(0,state.vehicle==='skyliner'?4.4:2,state.vehicle==='skyliner'?-30:-3.5);camera.position.copy(localCamera).applyQuaternion(car.root.quaternion).add(car.root.position);}
      camera.quaternion.copy(car.root.quaternion);
      const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(state.pitch - 0.08, state.yaw, 0, 'YXZ'));
      camera.quaternion.multiply(look);
      const fov=THREE.MathUtils.clamp(76*state.zoom,42,105);
      if(camera.fov!==fov) {camera.fov=fov;camera.updateProjectionMatrix();}
    }
    if (state.shake && state.shakeAmount > 0.001) {
      camera.position.x += (Math.random() - 0.5) * state.shakeAmount;
      camera.position.y += (Math.random() - 0.5) * state.shakeAmount * 0.5;
    }
    state.shakeAmount *= Math.exp(-dt * 8);
  }

  // --- Drift scoring ------------------------------------------------------
  function updateDrift(dt) {
    const speed = physics.chassis.velocity.length();
    const slip = Math.abs(physics.slipAngle);
    const sliding = speed > 7.5 && slip > 0.2 && slip < 1.35;
    if (sliding) {
      drift.active = true; drift.idle = 0;
      drift.score += slip * speed * dt * 7.5 * drift.multiplier;
      drift.multiplier = Math.min(5, drift.multiplier + dt * 0.42);
    } else if (drift.active) {
      drift.idle += dt;
      if (drift.idle > 1.1) {
        // A clean exit banks the run; the multiplier starts over.
        if (drift.score > 40) {
          drift.banked += Math.round(drift.score);
          ui.toast(`Drift banked · ${Math.round(drift.score).toLocaleString()} points`);
          if (drift.banked > drift.best) {
            drift.best = drift.banked;
            try { localStorage.setItem('oversteer-drift', drift.best); } catch { /* Optional storage. */ }
          }
        }
        drift.active = false; drift.score = 0; drift.multiplier = 1;
      }
    }
    const panel = $('drift-panel');
    panel.hidden = !drift.active && drift.banked === 0;
    if (!panel.hidden) {
      $('drift-score').textContent = Math.round(drift.score).toLocaleString();
      $('drift-multiplier').textContent = `×${drift.multiplier.toFixed(1)}`;
      $('drift-fill').style.width = `${Math.min(100, (slip / 1.1) * 100)}%`;
      $('drift-banked').textContent = `BANKED ${drift.banked.toLocaleString()}`;
      panel.classList.toggle('banked', drift.active);
    }
  }
  // A crash costs the run in progress.
  function loseDrift() {
    if (drift.active && drift.score > 40) ui.toast(`Drift lost · ${Math.round(drift.score).toLocaleString()} points gone`);
    drift.active = false; drift.score = 0; drift.multiplier = 1;
  }

  const map = $('minimap'), ctx = map.getContext('2d');
  function drawMap() {
    const w = map.width, h = map.height;
    const highway = state.map !== 'portside';
    const raceMap=state.map==='apex';
    const scale = state.map==='skyport'?.024:raceMap ? .23 : highway ? 0.42 : 1.4;
    const p = physics.chassis.position;
    const center=state.map==='skyport'?{x:0,z:0}:raceMap?{x:-25,z:55}:p;
    ctx.fillStyle = highway ? '#cfd9c8' : '#dbe0d0'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(scale, scale); ctx.translate(-center.x, -center.z);
    if (highway) {
      const route = world.route;
      ctx.strokeStyle = '#f1f0e5'; ctx.lineWidth = route.width; ctx.lineJoin = 'round'; ctx.beginPath();
      route.points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.z) : ctx.moveTo(pt.x, pt.z));
      ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = '#c8cbba'; ctx.lineWidth = 1.6; ctx.stroke();
    } else {
      ctx.fillStyle = '#f1f0e5';
      for (const r of world.roads) { ctx.fillRect(r - 12, -245, 24, 490); ctx.fillRect(-245, r - 12, 490, 24); }
    }
    ctx.fillStyle = '#b4c0ac'; ctx.strokeStyle = '#aebb9f'; ctx.lineWidth = 0.6;
    for (const b of world.mapBuildings) { ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); ctx.strokeRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); }
    if (traffic && traffic.enabled) {
      ctx.fillStyle = '#7d8a93';
      const r = highway ? 5 : 2.4;
      for (const c of traffic.cars) { ctx.beginPath(); ctx.arc(c.body.position.x, c.body.position.z, r, 0, Math.PI * 2); ctx.fill(); }
    }
    if (state.mode === 'trial' && gate.visible) {
      ctx.strokeStyle = '#db956b'; ctx.lineWidth = highway ? 5 : 2; ctx.setLineDash(highway ? [10, 8] : [4, 3]); ctx.beginPath();
      ctx.moveTo(p.x, p.z); for (let i = state.checkpoint; i < checkpoints.length; i++) ctx.lineTo(checkpoints[i].x, checkpoints[i].z); ctx.stroke(); ctx.setLineDash([]);
      const cp = checkpoints[state.checkpoint]; ctx.fillStyle = '#e96036'; ctx.beginPath(); ctx.arc(cp.x, cp.z, highway ? 12 : 5, 0, Math.PI * 2); ctx.fill();
    }
    if(raceMap) {const cp=racing.nextGate;ctx.fillStyle='#e96036';ctx.beginPath();ctx.arc(cp.x,cp.z,18,0,Math.PI*2);ctx.fill();}
    if(state.map==='skyport'){ctx.fillStyle='#b13f31';for(const other of multiplayer.positions()){ctx.beginPath();ctx.arc(other.x,other.z,90,0,Math.PI*2);ctx.fill();}}
    ctx.restore();
    forward.set(0, 0, -1).applyQuaternion(car.root.quaternion);
    ctx.save(); ctx.translate(w / 2+(p.x-center.x)*scale, h / 2+(p.z-center.z)*scale); if(raceMap)ctx.scale(.65,.65);ctx.rotate(Math.atan2(forward.x, -forward.z));
    ctx.fillStyle = '#e9603620'; ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e96036'; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 11); ctx.lineTo(0, 7); ctx.lineTo(-9, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function updateUI(dt) {
    const speed = physics.chassis.velocity.length();
    const value = Math.round(speed * (state.units === 'mph' ? 2.23694 : 3.6));
    $('speed').textContent = String(value).padStart(3, '0');
    const gear = physics.gear < 0 ? 'R' : speed < 0.4 && physics.gear <= 0 ? 'N' : Math.max(1, physics.gear);
    $('gear').textContent = state.map==='skyport'?'AIR':gear;
    rpm += (physics.rpm - rpm) * Math.min(1, dt * 12);
    $('rpm-fill').style.width = `${Math.min(100, rpm / physics.spec.maxRpm * 100)}%`;
    const condition = Math.max(0, Math.round(100 - physics.damage));
    $('condition-value').textContent = `${condition}%`; $('condition-fill').style.width = `${condition}%`;
    $('condition-fill').style.background = condition > 50 ? '#6e876b' : '#dc704a';
    $('trial-time').textContent = formatTime(state.trialTime);
    const p = physics.chassis.position;
    if(state.map==='apex') {
      const cp=racing.nextGate; gate.visible=true;gate.position.set(cp.x,0,cp.z);gate.rotation.y=cp.heading;gate.scale.x=1.7;
    } else gate.scale.x=1;
    if(state.map==='skyport'){
      $('street-label').textContent='Skyport · Mouse aim / Mouse 1 fire';
    } else if (state.map === 'portside') {
      $('street-label').textContent = Math.abs(p.x) < 16 ? 'Foundry Avenue' : Math.abs(p.z) < 16 ? 'Harbour Street' : p.z < -40 ? 'Freightway' : p.x > 45 ? 'East Dock Road' : 'Portside District';
    } else if(state.map==='apex') {
      const distance=CIRCUIT.nearest(p.x,p.z).distance;
      $('street-label').textContent=distance>12?'Runoff · R to recover':'Apex Grand Prix · 5.4 km';
    } else {
      const lane = world.route.laneOf(p.x, p.z);
      $('street-label').textContent = lane < 0 ? 'Off the highway' : `Lane ${lane + 1} of ${world.route.lanes}`;
    }
    drawMap();
  }
  function resize() {
    const width = $('game').clientWidth, height = $('game').clientHeight;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  loadMap('portside', false);
  applyVehicle('veloce', false);
  for (let i = 0; i < 180; i++) physics.step({});
  car.sync(physics); updateCamera(1, true); updateUI(0.1);
  renderer.render(scene, camera);
  $('loading').classList.add('finished');
  const inviteCode = new URL(location.href).searchParams.get('room');
  if (inviteCode) { $('mp-room-code').value = inviteCode; showDialog('multiplayer-dialog'); }

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
    if(traffic instanceof SharedTraffic)traffic.update(dt,physics.chassis.position);
    if (!state.paused) {
      world.update(physics.chassis.position);
      const input = racing.locked ? {handbrake:true,backward:physics.forwardSpeed>1} : inputState();
      if (!state.hasDriven && (input.forward || input.backward || input.throttleAxis > 0)) { state.hasDriven = true; $('driving-hint').style.opacity = '0'; }
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 12) { multiplayer.beforeStep();traffic.beforeStep?.(); racing.beforeStep(); physics.step(input); updateTrial(FIXED_STEP); accumulator -= FIXED_STEP; steps++; }
      car.sync(physics);
      car.flightVisual(physics.flight?.gear||0,dt,physics.forwardSpeed);
      if(!(traffic instanceof SharedTraffic))traffic.update(dt, physics.chassis.position);
      if(state.map!=='skyport')updateDrift(dt);
      for (const object of world.dynamics) { object.mesh.position.copy(object.body.position); object.mesh.quaternion.copy(object.body.quaternion); }
      for (const impact of physics.impacts.splice(0)) {
        car.deform(impact.point, impact.severity); state.shakeAmount = Math.min(0.45, impact.speed / 45); audio.impact(impact.speed);
        if (impact.speed > 6) loseDrift();
        if (impact.speed > 7) ui.toast(impact.severity > 0 ? 'That left a mark. Press R to repair & reset.' : 'Impact absorbed. Body damage is switched off.');
      }
      skidTick += dt;
      if (skidTick > 0.045) {
        skidTick = 0;
        if (physics.chassis.velocity.length() > 4) for (let i = 2; i < 4; i++) {
          const wheel = physics.vehicle.wheelInfos[i];
          if (wheel.isInContact && (input.handbrake || wheel.skidInfo < 0.82)) {
            const mark = marks[skidIndex++ % marks.length]; mark.visible = true;
            mark.position.copy(wheel.raycastResult.hitPointWorld); mark.position.y += 0.014;
            forward.set(0, 0, -1).applyQuaternion(car.root.quaternion); mark.rotation.set(-Math.PI / 2, 0, Math.atan2(forward.x, forward.z));
          }
        }
      }
      updateCamera(dt);
      const p = physics.chassis.position;
      sun.position.set(p.x - 70, (state.map==='skyport'?p.y:0)+90, p.z + 40); sun.target.position.set(p.x,state.map==='skyport'?p.y:0,p.z);
    }
    multiplayer.update({
      landingGear:physics.flight?.gear||0,
      raceId:racing.id,
      wheelie:physics.wheelie||0,steer:physics.steer,damage:physics.damage,dents:car.damageSnapshot(),
      x: physics.chassis.position.x, y: physics.chassis.position.y, z: physics.chassis.position.z,
      qx: physics.chassis.quaternion.x, qy: physics.chassis.quaternion.y,
      qz: physics.chassis.quaternion.z, qw: physics.chassis.quaternion.w,
      vx: state.paused ? 0 : physics.chassis.velocity.x, vy: state.paused ? 0 : physics.chassis.velocity.y, vz: state.paused ? 0 : physics.chassis.velocity.z,
      wx: state.paused ? 0 : physics.chassis.angularVelocity.x, wy: state.paused ? 0 : physics.chassis.angularVelocity.y, wz: state.paused ? 0 : physics.chassis.angularVelocity.z,
      braking: physics.braking, vehicle: state.vehicle, paint: state.paint,
    }, dt);
    racing.update();
    dogfight.update(dt,inputState(),camera,state.paused);
    if(state.map==='apex')arcadeView.update(dt,multiplayer.positions());
    uiClock += dt; fpsTime += dt; fpsFrames++;
    if (uiClock > 0.07) { updateUI(uiClock); uiClock = 0; }
    if (fpsTime > 0.8) { $('fps-label').textContent = `${Math.round(fpsFrames / fpsTime)} FPS`; fpsTime = 0; fpsFrames = 0; }
    audio.update(rpm, physics.throttle, state.paused,state.vehicle,physics.chassis.velocity.length());
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Read-only diagnostics make browser smoke tests inspect the real simulation.
  window.__oversteer = {
    snapshot: () => ({
      position: { x: physics.chassis.position.x, y: physics.chassis.position.y, z: physics.chassis.position.z },
      speed: physics.forwardSpeed, damage: physics.damage, camera: state.camera, paused: state.paused,
      mode: state.mode, checkpoint: state.checkpoint, map: state.map, vehicle: state.vehicle,
      wheelie:physics.wheelie,sharedTraffic:traffic instanceof SharedTraffic,
      gear: physics.gear, rpm: physics.rpm, slipAngle: physics.slipAngle,
      traffic: traffic ? traffic.cars.length : 0, driftBanked: drift.banked,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      physicsBodies:physics.world.bodies.length,...world.performanceStats(),pixelRatio:renderer.getPixelRatio(),
      ...arcadeView.stats(),
      raceId:racing.id, raceActive:racing.active, cameraYaw:state.yaw,cameraPitch:state.pitch,cameraZoom:state.zoom,
    }),
    loadMap, applyVehicle,
    traffic: () => traffic,
    route: () => world.route,
  };
}
