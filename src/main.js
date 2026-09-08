import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DrivingPhysics, FIXED_STEP, VEHICLES } from './physics.js';
import { buildWorld, MAPS } from './world.js';
import { Traffic, reseedTraffic } from './traffic.js';
import { createCar } from './car.js';
import { createUI, icon } from './ui.js';
import { EngineAudio } from './audio.js';
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
  const camera = new THREE.PerspectiveCamera(49, 1, 0.065, 900);
  const physics = new DrivingPhysics();
  const car = createCar(scene);
  const audio = new EngineAudio();
  const keys = new Set(), touch = new Set();
  const state = {
    camera: 'chase', paused: false, units: 'kmh',
    shake: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    yaw: 0, pitch: 0, shakeAmount: 0, mode: 'free', running: false,
    checkpoint: 0, trialTime: 0, hasDriven: false, map: 'portside', vehicle: 'veloce',
    paint: VEHICLES.veloce.paint, trafficEnabled: true, pad: false, density: null,
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
    if (traffic) traffic.dispose();
    if (world) world.dispose();
    physics.clearScenery();
    reseedTraffic();
    state.map = id;
    world = buildWorld(scene, physics, id);
    const definition = world.map;
    scene.background.set(definition.sky ?? world.sky ?? '#b8ccce');
    scene.fog.color.set(world.fog.color); scene.fog.near = world.fog.near; scene.fog.far = world.fog.far;
    const density = state.density ?? definition.traffic;
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
    setMode(state.mode, false);
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
    const spawn = spawnPoint();
    physics.placeAt(spawn.x, spawn.z, spawn.heading || 0);
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
      if (Math.abs(steer) > 0 || throttle > 0.02 || brake > 0.02 || handbrake) {
        return { steerAxis: steer, throttleAxis: throttle, brakeAxis: brake, handbrake };
      }
    }
    return null;
  }
  function inputState() {
    const keyboard = {
      forward: keys.has('KeyW') || keys.has('ArrowUp') || touch.has('forward'),
      backward: keys.has('KeyS') || keys.has('ArrowDown') || touch.has('backward'),
      left: keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left'),
      right: keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right'),
      handbrake: keys.has('Space') || touch.has('handbrake'),
    };
    const anyKey = keyboard.forward || keyboard.backward || keyboard.left || keyboard.right || keyboard.handbrake;
    if (!anyKey) {
      const pad = padAxes();
      if (pad) { state.pad = true; return pad; }
    }
    state.pad = false;
    return keyboard;
  }
  function clearInputs() { keys.clear(); touch.clear(); document.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed')); }

  function setCamera(mode) {
    state.camera = mode; state.yaw = 0; state.pitch = 0; car.setCockpit(mode === 'cockpit');
    $('game').classList.toggle('cockpit', mode === 'cockpit');
    for (const [id, value] of [['chase-camera', 'chase'], ['cockpit-camera', 'cockpit']]) {
      $(id).classList.toggle('active', mode === value); $(id).setAttribute('aria-pressed', String(mode === value));
    }
    camera.fov = mode === 'cockpit' ? 76 : 49; camera.updateProjectionMatrix();
    updateCamera(1, true);
  }
  function showDialog(id) { clearInputs(); state.paused = true; $(id).showModal(); updatePauseButton(); }
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
  $('vehicle-choices').innerHTML = Object.values(VEHICLES).map(v => `
    <button class="vehicle-choice" data-vehicle="${v.id}" aria-pressed="false">
      <strong>${v.name} ${v.badge}</strong><span>${v.mass.toLocaleString()} kg · ${v.engine} · ${v.drivetrain}</span>
    </button>`).join('');
  function applyVehicle(id, notify = true) {
    const spec = physics.setVehicle(id);
    state.vehicle = spec.id;
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
    physics.placeAt(spawn.x, spawn.z, spawn.heading || 0);
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
  $('repair-button').onclick = () => resetCar();
  for (const id of ['pause-reset', 'garage-repair']) $(id).onclick = () => { resetCar(); resume(); };
  $('sound-button').onclick = toggleSound;
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
  $('quality').onchange = () => {
    const quality = $('quality').value;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.75 : quality === 'medium' ? 1.15 : 0.85));
    renderer.shadowMap.enabled = quality !== 'low'; resize(); ui.toast(`Graphics set to ${$('quality').selectedOptions[0].textContent.toLowerCase()}.`);
  };
  $('units').onchange = () => { state.units = $('units').value; $('speed-unit').textContent = state.units === 'mph' ? 'MPH' : 'KM/H'; };
  $('grip').onchange = () => { physics.grip = Number($('grip').value); $('weather-label').textContent = physics.grip < 1 ? 'Slippery roads' : MAPS[state.map].weather; };
  $('damage-setting').onchange = () => physics.damageEnabled = $('damage-setting').checked;
  $('shake-setting').onchange = () => state.shake = $('shake-setting').checked;
  $('traffic-setting').onchange = () => {
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
  const driveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { if (!document.querySelector('dialog[open]')) { e.preventDefault(); togglePause(); } return; }
    if (state.paused || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (driveKeys.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyC') setCamera(state.camera === 'chase' ? 'cockpit' : 'chase');
    if (e.code === 'KeyR') resetCar();
    if (e.code === 'KeyM') toggleSound();
    if (e.code === 'KeyV') applyVehicle(state.vehicle === 'veloce' ? 'marlin' : 'veloce');
    if (e.code === 'KeyN') loadMap(state.map === 'portside' ? 'coastline' : 'portside');
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { clearInputs(); if (!state.paused) showDialog('pause-dialog'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !state.paused) showDialog('pause-dialog'); });
  document.querySelectorAll('[data-control]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (state.paused) return; b.setPointerCapture(e.pointerId); touch.add(b.dataset.control); b.classList.add('pressed'); });
    const release = () => { touch.delete(b.dataset.control); b.classList.remove('pressed'); };
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
  });
  let looking = false, pointer = { x: 0, y: 0 };
  $('world').addEventListener('pointerdown', e => { if (state.camera !== 'cockpit' || state.paused) return; looking = true; pointer = { x: e.clientX, y: e.clientY }; $('world').setPointerCapture(e.pointerId); });
  $('world').addEventListener('pointermove', e => { if (!looking) return; state.yaw = THREE.MathUtils.clamp(state.yaw - (e.clientX - pointer.x) * 0.004, -1.3, 1.3); state.pitch = THREE.MathUtils.clamp(state.pitch - (e.clientY - pointer.y) * 0.003, -0.45, 0.4); pointer = { x: e.clientX, y: e.clientY }; });
  const endLook = () => { looking = false; }; $('world').addEventListener('pointerup', endLook); $('world').addEventListener('pointercancel', endLook);

  function updateCamera(dt, snap = false) {
    if (state.camera === 'chase') {
      const speed = physics.chassis.velocity.length();
      localCamera.set(6.7 - Math.min(speed * 0.15, 4.6), 4.5 + Math.min(speed * 0.025, 0.65), 9.7 + Math.min(speed * 0.055, 1.7));
      desiredCamera.copy(localCamera).applyQuaternion(car.root.quaternion).add(car.root.position);
      cameraTarget.set(0, 0.5, -3.1).applyQuaternion(car.root.quaternion).add(car.root.position);
      const from = new CANNON.Vec3(cameraTarget.x, Math.max(cameraTarget.y, 0.5), cameraTarget.z);
      const to = new CANNON.Vec3(desiredCamera.x, desiredCamera.y, desiredCamera.z);
      rayResult.reset();
      if (physics.world.raycastClosest(from, to, { collisionFilterMask: 1, skipBackfaces: true }, rayResult)) {
        desiredCamera.copy(cameraTarget).lerp(new THREE.Vector3().copy(rayResult.hitPointWorld), 0.85);
      }
      desiredCamera.y = Math.max(0.35, desiredCamera.y);
      if (snap) cameraPosition.copy(desiredCamera); else cameraPosition.lerp(desiredCamera, 1 - Math.exp(-dt * 5));
      camera.position.copy(cameraPosition); camera.lookAt(cameraTarget);
    } else {
      localCamera.set(-0.43, 0.94, -0.03); camera.position.copy(localCamera).applyQuaternion(car.root.quaternion).add(car.root.position);
      camera.quaternion.copy(car.root.quaternion);
      const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(state.pitch - 0.08, state.yaw, 0, 'YXZ'));
      camera.quaternion.multiply(look);
      if (!looking) { state.yaw *= Math.exp(-dt * 2); state.pitch *= Math.exp(-dt * 2); }
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
    const scale = highway ? 0.42 : 1.4;
    const p = physics.chassis.position;
    ctx.fillStyle = highway ? '#cfd9c8' : '#dbe0d0'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(scale, scale); ctx.translate(-p.x, -p.z);
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
    ctx.restore();
    forward.set(0, 0, -1).applyQuaternion(car.root.quaternion);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.atan2(forward.x, -forward.z));
    ctx.fillStyle = '#e9603620'; ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e96036'; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 11); ctx.lineTo(0, 7); ctx.lineTo(-9, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function updateUI(dt) {
    const speed = physics.chassis.velocity.length();
    const value = Math.round(speed * (state.units === 'mph' ? 2.23694 : 3.6));
    $('speed').textContent = String(value).padStart(3, '0');
    const gear = physics.gear < 0 ? 'R' : speed < 0.4 && physics.gear <= 0 ? 'N' : Math.max(1, physics.gear);
    $('gear').textContent = gear;
    rpm += (physics.rpm - rpm) * Math.min(1, dt * 12);
    $('rpm-fill').style.width = `${Math.min(100, rpm / physics.spec.maxRpm * 100)}%`;
    const condition = Math.max(0, Math.round(100 - physics.damage));
    $('condition-value').textContent = `${condition}%`; $('condition-fill').style.width = `${condition}%`;
    $('condition-fill').style.background = condition > 50 ? '#6e876b' : '#dc704a';
    $('trial-time').textContent = formatTime(state.trialTime);
    const p = physics.chassis.position;
    if (state.map === 'portside') {
      $('street-label').textContent = Math.abs(p.x) < 16 ? 'Foundry Avenue' : Math.abs(p.z) < 16 ? 'Harbour Street' : p.z < -40 ? 'Freightway' : p.x > 45 ? 'East Dock Road' : 'Portside District';
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

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
    if (!state.paused) {
      const input = inputState();
      if (!state.hasDriven && (input.forward || input.backward || input.throttleAxis > 0)) { state.hasDriven = true; $('driving-hint').style.opacity = '0'; }
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 12) { physics.step(input); updateTrial(FIXED_STEP); accumulator -= FIXED_STEP; steps++; }
      car.sync(physics);
      traffic.update(dt, physics.chassis.position);
      updateDrift(dt);
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
      sun.position.set(p.x - 70, 90, p.z + 40); sun.target.position.set(p.x, 0, p.z);
    }
    uiClock += dt; fpsTime += dt; fpsFrames++;
    if (uiClock > 0.07) { updateUI(uiClock); uiClock = 0; }
    if (fpsTime > 0.8) { $('fps-label').textContent = `${Math.round(fpsFrames / fpsTime)} FPS`; fpsTime = 0; fpsFrames = 0; }
    audio.update(rpm, physics.throttle, state.paused);
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
      gear: physics.gear, rpm: physics.rpm, slipAngle: physics.slipAngle,
      traffic: traffic ? traffic.cars.length : 0, driftBanked: drift.banked,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }),
    loadMap, applyVehicle,
    traffic: () => traffic,
    route: () => world.route,
  };
}
