import * as THREE from 'three';
import { ovalRoute, gridRoute } from './route.js';
import { buildRaceWorld } from './raceWorld.js';
import { gridSlot } from './circuit.js';
import { SceneryStream } from './sceneryStream.js';
import { StaticBatches } from './staticBatches.js';
import { buildFlightWorld } from './flightWorld.js';
import { flightSpawn } from './flight.js';

let seed = 921;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export const MAPS = {
  skyport: {
    id:'skyport',name:'Skyport Air Arena',kind:'Aircraft only · 9.6 km airspace',
    blurb:'Long airport runway, open skies and multiplayer dogfights. Fighter jets and 777-inspired airliners only.',
    location:'Skyport Air Arena',weather:'Clear skies · Flight ceiling 1,800 m',
    spawn:flightSpawn(),traffic:0,swatch:['#7ab1d0','#d9e5e7','#3e4b56'],
  },
  apex: {
    id: 'apex', name: 'Apex Grand Prix', kind: '5.4 km race circuit',
    blurb: 'Silverstone-inspired sweepers, technical esses, boost lanes and three-lap multiplayer racing.',
    location: 'Apex Grand Prix', weather: 'Race day · Clear',
    spawn: gridSlot(0), traffic: 0, swatch: ['#424b50', '#168d99', '#cf574b'],
  },
  portside: {
    id: 'portside', name: 'Portside District', kind: 'City circuit',
    blurb: 'Tight streets, curbs to clip and freight to dodge. The original sandbox.',
    location: 'Portside District', weather: 'Late afternoon',
    spawn: { x: -5.2, z: 34, heading: 0 }, traffic: 16,
    swatch: ['#c3bdad', '#697f6a', '#b28d74'],
  },
  coastline: {
    id: 'coastline', name: 'Cape Verde Highway', kind: 'Coastal highway',
    blurb: 'Four lanes, long sweepers and pine on both shoulders. Traffic runs fast and runs rude.',
    location: 'Cape Verde Highway', weather: 'Clear and bright',
    spawn: { x: 0, z: 0, heading: 0 }, traffic: 26,
    swatch: ['#6f8fa2', '#3f5f45', '#d8d2bc'],
  },
};

/**
 * Shared construction toolkit. Everything a map builds goes through here so the
 * whole map can be torn down in one call when the player switches.
 */
function createBuilder(scene, physics, spatial = false) {
  const batches = new Map();
  const materials = new Map();
  const owned = { meshes: [], geometries: [], materials: [], textures: [] };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const spatialBatches = spatial ? new StaticBatches(boxGeometry) : null;
  const temp = new THREE.Object3D();
  owned.geometries.push(boxGeometry);

  function material(color, roughness = 0.83) {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness });
      materials.set(key, mat); owned.materials.push(mat);
    }
    return materials.get(key);
  }
  function box(x, y, z, w, h, d, color, collision = false, angle = 0) {
    temp.position.set(x, y, z); temp.rotation.set(0, angle, 0); temp.scale.set(w, h, d); temp.updateMatrix();
    if(spatialBatches) spatialBatches.add(temp.matrix,color,h>=1.5);
    else { if (!batches.has(color)) batches.set(color, []); batches.get(color).push(temp.matrix.clone()); }
    if (collision) physics.addBox(x, y, z, w, h, d, { angle });
  }
  function attach(mesh) { scene.add(mesh); owned.meshes.push(mesh); return mesh; }
  function sign(text, x, y, z, w, h, bg = '#e3ddc9', fg = '#35423b', angle = 0) {
    const canvas = document.createElement('canvas'); canvas.width = spatial ? 512 : 1024; canvas.height = spatial ? 128 : 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${spatial?50:100}px Arial`;
    ctx.fillText(text, canvas.width/2, canvas.height*.516, canvas.width*.928);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
    owned.textures.push(texture); owned.geometries.push(geo); owned.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z); mesh.rotation.y = angle;
    return attach(mesh);
  }

  // Trees are instanced rather than one mesh per canopy, which is where the
  // old build spent most of its draw calls.
  const treeSpots = [];
  function tree(x, z, scale = 1, collision = true, shadow = true) {
    treeSpots.push({ x, z, scale, shadow, rotation: random() * Math.PI * 2 });
    box(x, 0.35 * scale, z, 3.3 * scale, 0.3, 3.3 * scale, '#8a9581', collision);
    box(x, 2.1 * scale, z, 0.35 * scale, 3.7 * scale, 0.35 * scale, '#787768', collision);
  }
  // Trees go out in spatially coherent chunks. One instanced mesh for a whole
  // treeline can never be frustum-culled, so a long highway would draw every
  // tree behind the camera as well; chunking lets most of them drop out.
  const TREE_CHUNK = 48;
  function flushTrees() {
    if (!treeSpots.length) return;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    owned.geometries.push(geo);
    const chunks=[];
    if(spatial) {
      const cells=new Map();
      for(const spot of treeSpots) {const key=`${Math.floor(spot.x/128)},${Math.floor(spot.z/128)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(spot);}
      chunks.push(...cells.values());
    } else for(let start=0;start<treeSpots.length;start+=TREE_CHUNK)chunks.push(treeSpots.slice(start,start+TREE_CHUNK));
    for (const chunk of chunks) {
      const castShadow = chunk.some(spot => spot.shadow);
      for (const [layer, tint] of [[0, '#6b805c'], [1, '#7d8d65'], [2, '#6b805c']]) {
        const mesh = new THREE.InstancedMesh(geo, material(tint, 0.88), chunk.length);
        chunk.forEach((spot, i) => {
          temp.position.set(spot.x + (layer - 1) * 0.7 * spot.scale, (4.3 + layer * 0.48) * spot.scale, spot.z);
          temp.rotation.set(0, spot.rotation + layer, 0);
          temp.scale.set(1.7 * spot.scale, 2.0 * spot.scale, 1.6 * spot.scale);
          temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix);
        });
        mesh.castShadow = castShadow; mesh.receiveShadow = true;
        mesh.computeBoundingSphere(); attach(mesh);
      }
    }
    treeSpots.length = 0;
  }
  function lamp(x, z, side) {
    box(x, 4.6, z, 0.16, 9, 0.16, '#676d66', true);
    box(x + side * 1.6, 9, z, 3.4, 0.16, 0.16, '#676d66');
    box(x + side * 2.8, 8.91, z, 1, 0.17, 0.45, '#ded5b6');
    box(x, 0.5, z, 0.5, 0.8, 0.5, '#8f9486');
  }
  function flushBatches() {
    if(spatialBatches) {spatialBatches.flush(attach,own);return;}
    for (const [color, matrices] of batches) {
      const mesh = new THREE.InstancedMesh(boxGeometry, material(color), matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); attach(mesh);
    }
    batches.clear();
  }
  function asphaltTexture(repeat) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#71736e'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 45000; i++) {
      const l = 80 + random() * 65;
      ctx.fillStyle = `rgba(${l},${l},${l - 3},0.25)`;
      ctx.fillRect(random() * 512, random() * 512, 1.4, 1.4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat, repeat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
    owned.textures.push(texture);
    return texture;
  }
  function own(...things) {
    for (const thing of things) {
      if (thing.isBufferGeometry) owned.geometries.push(thing);
      else if (thing.isMaterial) owned.materials.push(thing);
      else if (thing.isTexture) owned.textures.push(thing);
    }
  }
  return { box, sign, tree, flushTrees, lamp, flushBatches, material, attach, asphaltTexture, own, owned };
}

// ---------------------------------------------------------------------------
// Portside District: the original street grid, freight yard and harbour.
// ---------------------------------------------------------------------------
function buildPortside(scene, physics, b) {
  const mapBuildings = [];
  const dynamics = [];
  const { box, sign, tree, lamp, material, attach } = b;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ map: b.asphaltTexture(90), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  b.own(ground.geometry, ground.material); attach(ground);

  const roads = [-168, -84, 0, 84, 168];
  for (const x of roads) {
    for (let z = -213; z <= 213; z += 8) {
      if (roads.some(k => Math.abs(z - k) < 15)) continue;
      box(x - 0.16, 0.019, z, 0.09, 0.018, 4, '#e5c983');
      box(x + 0.16, 0.019, z, 0.09, 0.018, 4, '#e5c983');
      box(z, 0.018, x - 0.16, 4, 0.018, 0.09, '#e5c983');
      box(z, 0.018, x + 0.16, 4, 0.018, 0.09, '#e5c983');
      for (const side of [-10.8, 10.8]) {
        box(x + side, 0.02, z, 0.1, 0.02, 7.8, '#cecec0');
        box(z, 0.02, x + side, 7.8, 0.02, 0.1, '#cecec0');
      }
    }
  }
  for (const x of roads) for (const z of roads) {
    for (const side of [-1, 1]) {
      for (let i = -5; i <= 5; i++) {
        box(x + i * 1.7, 0.027, z + side * 15.5, 0.85, 0.02, 3.2, '#dcdacb');
        box(x + side * 15.5, 0.027, z + i * 1.7, 3.2, 0.02, 0.85, '#dcdacb');
      }
      box(x + side * 7, 0.03, z + side * 19, 9, 0.015, 0.25, '#e3ded0');
    }
  }

  function building(x, z, w, d, height, color, name) {
    box(x, height / 2 + 0.18, z, w, height, d, color, true);
    mapBuildings.push({ x, z, w, d });
    box(x, height + 0.35, z, w + 0.45, 0.35, d + 0.45, '#ccc8b9');
    box(x, 0.65, z, w + 0.15, 0.8, d + 0.15, '#9a9d92');
    box(x, height + 0.7, z, w * 0.28, 0.7, d * 0.35, '#939c93');
    for (const side of [-1, 1]) {
      for (let floor = 2.8; floor < height - 1.5; floor += 3.2) {
        for (let wx = -w / 2 + 2.1; wx < w / 2 - 1; wx += 3.4) {
          box(x + wx, floor, z + side * (d / 2 + 0.035), 1.8, 1.75, 0.08, '#536e70');
          box(x + wx, floor, z + side * (d / 2 + 0.09), 0.055, 1.75, 0.04, '#c6c8b9');
          box(x + wx, floor - 0.91, z + side * (d / 2 + 0.18), 2, 0.13, 0.4, '#e1dbca');
        }
        for (let wz = -d / 2 + 2; wz < d / 2 - 1; wz += 3.4) {
          box(x + side * (w / 2 + 0.035), floor, z + wz, 0.08, 1.75, 1.8, '#536e70');
          box(x + side * (w / 2 + 0.14), floor - 0.91, z + wz, 0.3, 0.13, 2, '#e1dbca');
        }
      }
    }
    if (name) sign(name, x, Math.min(height - 1.6, 6), z + d / 2 + 0.13, w * 0.84, 1.5);
  }
  function container(x, z, y, color) {
    box(x, y + 1.5, z, 18, 3, 6.2, color, true);
    for (let i = -8.5; i < 9; i += 0.65) {
      box(x + i, y + 1.5, z + 3.16, 0.11, 2.8, 0.12, color);
      box(x + i, y + 1.5, z - 3.16, 0.11, 2.8, 0.12, color);
    }
    sign('P O R T S I D E', x, y + 1.65, z + 3.23, 10, 0.6, color, '#e5ddc9');
  }

  for (let ix = 0; ix < roads.length - 1; ix++) for (let iz = 0; iz < roads.length - 1; iz++) {
    const x = roads[ix] + 42, z = roads[iz] + 42;
    box(x, 0.12, z, 57, 0.24, 57, '#bcbcaf', true);
    for (const side of [-1, 1]) {
      box(x + side * 28.8, 0.12, z, 0.35, 0.25, 58, '#e1dccd', true);
      box(x, 0.12, z + side * 28.8, 58, 0.25, 0.35, '#e1dccd', true);
    }
    if (ix === 2 && iz === 2) {
      building(x + 3, z - 8, 39, 26, 9.4, '#b8bdb0', 'PORTSIDE MOTOR WORKS');
      for (let i = 0; i < 3; i++) {
        box(x - 10 + i * 12, 2.05, z + 5.08, 9.5, 3.5, 0.15, '#666f65');
        for (let j = 0; j < 8; j++) box(x - 10 + i * 12, 0.5 + j * 0.43, z + 5.18, 9.3, 0.055, 0.1, '#92988b');
      }
      sign('SERVICE  /  REPAIR  /  RESTORE', x + 2, 4.5, z + 5.25, 31, 0.65, '#b8bdb0');
      for (let i = 0; i < 5; i++) box(x - 20 + i * 9, 0.26, z + 17, 0.12, 0.02, 9, '#e5dfcb');
    } else if (ix === 1 && iz === 2) {
      building(x - 5, z - 1, 34, 37, 15.5, '#b2937b', 'NORTH DOCK STORAGE');
      box(x - 5, 4.5, z + 18.61, 34, 0.45, 0.25, '#e7d7b7');
      for (let n = 0; n < 4; n++) box(x + 17, 1.6, z - 14 + n * 8, 5.8, 3, 6.4, '#8b9690', true);
    } else if (ix === 2 && iz === 1) {
      for (let i = 0; i < 5; i++) container(x + 10, z - 17 + i * 8, 0.26, i % 2 ? '#8a9b91' : '#ba7758');
      container(x + 10, z - 17, 3.26, '#b89365');
      box(x - 15, 0.9, z + 11, 7, 1.1, 12, '#a0a091', true);
      const rampGeo = new THREE.BoxGeometry(7, 0.35, 12);
      const ramp = new THREE.Mesh(rampGeo, material('#aeb2a5'));
      ramp.position.set(x - 15, 1.13, z + 20.5); ramp.rotation.x = 0.17;
      ramp.castShadow = true; ramp.receiveShadow = true; b.own(rampGeo); attach(ramp);
      physics.addBox(x - 15, 1.13, z + 20.5, 7, 0.35, 12, { pitch: 0.17 });
    } else {
      const color = ['#c8c7b5', '#b1b8ac', '#c8b49b', '#b7b9b0'][Math.floor(random() * 4)];
      const h = 9 + Math.floor(random() * 5) * 3.2;
      building(x - 11, z, 23, 41, h, color, ix === 1 && iz === 1 ? 'WESTERN FREIGHT CO.' : undefined);
      building(x + 16, z - 6, 17, 29, h * 0.8, '#bbb9a9');
    }
    for (const side of [-1, 1]) {
      tree(x + side * 24, z + 22);
      lamp(x + side * 26.5, z - 24, side < 0 ? -1 : 1);
    }
  }

  // Crash-test lane: props with real mass that can be pushed over.
  const coneGeo = new THREE.ConeGeometry(0.28, 0.85, 16);
  const baseGeo = new THREE.BoxGeometry(0.6, 0.1, 0.6);
  const stripeGeo = new THREE.CylinderGeometry(0.105, 0.15, 0.15, 16);
  b.own(coneGeo, baseGeo, stripeGeo);
  for (let i = 0; i < 10; i++) {
    const x = 7.6 + (i % 2) * 2.1, z = -29 - Math.floor(i / 2) * 5;
    const body = physics.addBox(x, 0.52, z, 0.55, 1.02, 0.55, { mass: 9 });
    const group = new THREE.Group();
    const cone = new THREE.Mesh(coneGeo, material('#da6b3d'));
    const base = new THREE.Mesh(baseGeo, material('#39443d')); base.position.y = -0.45;
    const stripe = new THREE.Mesh(stripeGeo, material('#f2e8d1')); stripe.position.y = 0.07;
    group.add(cone, base, stripe); attach(group);
    dynamics.push({ body, mesh: group, origin: body.position.clone() });
  }
  for (let i = 0; i < 6; i++) {
    const x = -9, z = -29 - i * 4;
    box(x, 0.56, z, 1.3, 1.12, 2.6, '#babba9', true);
    box(x + 0.657, 0.63, z, 0.025, 0.35, 2.3, i % 2 ? '#dfd7b7' : '#cf794c');
  }

  box(0, 14, -202, 450, 1.9, 15, '#a4aa9d', true);
  for (let x = -204; x <= 204; x += 34) {
    box(x, 7, -202, 2.3, 14, 7, '#b9bdb0', true);
    box(x, 15.45, -209, 30, 1.15, 0.3, '#c5c8b7');
    box(x, 15.45, -195, 30, 1.15, 0.3, '#c5c8b7');
  }
  for (const x of [114, 180, -142]) {
    const z = -229;
    for (const side of [-1, 1]) box(x + side * 6, 16, z, 0.9, 32, 1, '#b7835c');
    box(x, 31, z, 14, 1.1, 2.4, '#b7835c');
    box(x - 8, 34, z, 52, 1, 1.1, '#b7835c');
    box(x + 10, 33, z, 7, 4, 4, '#8d9282');
    box(x - 28, 26, z, 0.1, 16, 0.1, '#657569');
    for (let y = 4; y < 30; y += 5) box(x, y, z, 12, 0.2, 0.3, '#b7835c');
  }
  addMountains(b, 24, -340, 6);

  for (const side of [-1, 1]) {
    box(side * 228, 1.1, 0, 1.2, 2.2, 458, '#a1a799', true);
    box(0, 1.1, side * 228, 458, 2.2, 1.2, '#a1a799', true);
  }

  const route = gridRoute([-84, 84], { lanes: 2, laneWidth: 4.4, speedLimit: 21 });
  return { mapBuildings, roads, dynamics, route, fog: { color: '#b9c9c3', near: 95, far: 355 }, sky: '#b8ccce' };
}

// ---------------------------------------------------------------------------
// Cape Verde Highway: a four-lane coastal circuit lined with pine.
// ---------------------------------------------------------------------------
function buildCoastline(scene, physics, b) {
  const mapBuildings = [];
  const dynamics = [];
  const { box, sign, tree, material, attach } = b;
  const route = ovalRoute({ straight: 520, radius: 150, lanes: 4, laneWidth: 4.2, speedLimit: 34, segments: 30 });
  const halfWidth = route.width / 2;

  // Grass plain under everything, with the sea beyond the outer treeline.
  const groundGeo = new THREE.PlaneGeometry(1500, 1500);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#7f8f66', roughness: 0.97 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  b.own(groundGeo, groundMat); attach(ground);

  const seaGeo = new THREE.PlaneGeometry(2600, 900);
  const seaMat = new THREE.MeshStandardMaterial({ color: '#5f87a0', roughness: 0.24, metalness: 0.35 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, -900);
  b.own(seaGeo, seaMat); attach(sea);

  // --- Road surface built as a ribbon along the route ---------------------
  const steps = 420;
  const positions = [], uvs = [], indices = [];
  const shoulderPositions = [], shoulderUvs = [], shoulderIndices = [];
  const shoulder = 3.4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, z, nx, nz } = route.sample(t);
    const px = -nz, pz = nx;
    positions.push(x + px * halfWidth, 0.02, z + pz * halfWidth);
    positions.push(x - px * halfWidth, 0.02, z - pz * halfWidth);
    uvs.push(0, t * 150, 1, t * 150);
    shoulderPositions.push(x + px * (halfWidth + shoulder), 0.005, z + pz * (halfWidth + shoulder));
    shoulderPositions.push(x - px * (halfWidth + shoulder), 0.005, z - pz * (halfWidth + shoulder));
    shoulderUvs.push(0, t * 150, 1, t * 150);
    if (i < steps) {
      // Wound counter-clockwise seen from above, so the surface normal is +Y
      // and the road takes the sun rather than being lit from underneath.
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      shoulderIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices); roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ color: '#8f918c', map: b.asphaltTexture(1), roughness: 0.95 });
  roadMat.map.repeat.set(2, 1);
  const road = new THREE.Mesh(roadGeo, roadMat); road.receiveShadow = true;
  b.own(roadGeo, roadMat); attach(road);

  const shoulderGeo = new THREE.BufferGeometry();
  shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoulderPositions, 3));
  shoulderGeo.setAttribute('uv', new THREE.Float32BufferAttribute(shoulderUvs, 2));
  shoulderGeo.setIndex(shoulderIndices); shoulderGeo.computeVertexNormals();
  const shoulderMesh = new THREE.Mesh(shoulderGeo, material('#8c8878', 0.95));
  shoulderMesh.receiveShadow = true; b.own(shoulderGeo); attach(shoulderMesh);

  // --- Markings, barriers, roadside trees and furniture -------------------
  const markStep = 1 / 620;
  for (let t = 0; t < 1; t += markStep) {
    const { x, z, nx, nz, heading } = route.sample(t);
    const px = -nz, pz = nx;
    // Dashed lane dividers between each pair of lanes.
    for (let lane = 1; lane < route.lanes; lane++) {
      const offset = route.laneOffset(lane) - route.laneWidth / 2;
      if (Math.floor(t * 620) % 2 === 0) {
        box(x + px * offset, 0.035, z + pz * offset, 0.16, 0.02, 2.6, '#e6e1cd', false, heading);
      }
    }
    // Solid edge lines.
    for (const side of [-1, 1]) {
      box(x + px * side * (halfWidth - 0.35), 0.035, z + pz * side * (halfWidth - 0.35),
        0.2, 0.02, 2.6, side > 0 ? '#e9c97f' : '#eae5d1', false, heading);
    }
  }

  // Guardrails: drawn finely, but collided as a few long segments. One static
  // body per rail post would put well over a thousand shapes in the broadphase.
  const barrierStep = 1 / 300;
  for (let t = 0; t < 1; t += barrierStep) {
    const { x, z, nx, nz, heading } = route.sample(t);
    const px = -nz, pz = nx;
    for (const side of [-1, 1]) {
      const d = halfWidth + shoulder - 0.5;
      box(x + px * side * d, 0.62, z + pz * side * d, 0.18, 0.42, 4.2, '#cfcabb', false, heading);
      box(x + px * side * d, 0.28, z + pz * side * d, 0.16, 0.56, 0.16, '#8d9188', false, heading);
    }
  }
  const barrierCollisionStep = 1 / 64;
  const segmentLength = route.total / 64 + 2;
  for (let t = 0; t < 1; t += barrierCollisionStep) {
    const { x, z, nx, nz, heading } = route.sample(t + barrierCollisionStep / 2);
    const px = -nz, pz = nx;
    for (const side of [-1, 1]) {
      const d = halfWidth + shoulder - 0.5;
      physics.addBox(x + px * side * d, 0.62, z + pz * side * d, 0.5, 0.9, segmentLength, { angle: heading });
    }
  }

  // Pine on both shoulders, in staggered rows so the treeline reads with depth.
  const treeStep = 1 / 150;
  let index = 0;
  for (let t = 0; t < 1; t += treeStep, index++) {
    const { x, z, nx, nz } = route.sample(t);
    const px = -nz, pz = nx;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        const jitter = random() * 7;
        const d = halfWidth + shoulder + 5 + row * 11 + jitter;
        // The guardrail already stops the car, so trees are scenery: only every
        // sixth trunk of the near row is solid, and only that row casts shadows.
        tree(x + px * side * d, z + pz * side * d, 0.75 + random() * 0.7,
          row === 0 && index % 6 === 0, row === 0);
      }
    }
    // Lamp masts down the straights, solid only every other mast.
    if (index % 5 === 0) {
      for (const side of [-1, 1]) {
        const d = halfWidth + shoulder + 1.6;
        box(x + px * side * d, 4.8, z + pz * side * d, 0.18, 9.4, 0.18, '#6e746c', index % 10 === 0);
        box(x + px * side * (d - 1.4), 9.3, z + pz * side * (d - 1.4), 3, 0.16, 0.16, '#6e746c');
        box(x + px * side * (d - 2.6), 9.2, z + pz * side * (d - 2.6), 1, 0.16, 0.42, '#ded5b6');
      }
    }
  }

  // Overhead gantries, service buildings and a distant headland.
  for (const t of [0.03, 0.28, 0.53, 0.78]) {
    const { x, z, nx, nz, heading } = route.sample(t);
    const px = -nz, pz = nx;
    const d = halfWidth + 1.2;
    for (const side of [-1, 1]) box(x + px * side * d, 3.4, z + pz * side * d, 0.5, 6.8, 0.5, '#8b9089', true, heading);
    box(x, 6.9, z, route.width + 3.4, 0.45, 0.5, '#8b9089', false, heading);
    sign('CAPE VERDE  ·  KEEP RIGHT', x, 5.9, z, 11, 1.4, '#2f5741', '#e9efe6', heading);
  }
  for (const t of [0.14, 0.64]) {
    const { x, z, nx, nz, heading } = route.sample(t);
    const px = -nz, pz = nx;
    const d = halfWidth + shoulder + 26;
    const bx = x + px * d, bz = z + pz * d;
    box(bx, 3.2, bz, 26, 6.4, 15, '#c6bfa8', true, heading);
    box(bx, 6.6, bz, 27, 0.5, 16, '#a8a290', false, heading);
    sign('FUEL  ·  COFFEE  ·  AIR', bx, 4.4, bz + 8.1, 18, 1.5, '#c6bfa8', '#3a463d', heading);
    mapBuildings.push({ x: bx, z: bz, w: 26, d: 15 });
  }

  addMountains(b, 20, -760, 20, 110, 70);
  const routeSpawn = route.sample(0.005, 1);
  MAPS.coastline.spawn = { x: routeSpawn.x, z: routeSpawn.z, heading: routeSpawn.yaw };

  return { mapBuildings, roads: [], dynamics, route, fog: { color: '#c3d3d6', near: 140, far: 620 }, sky: '#a9c6d4' };
}

function addMountains(b, count, z, y, radius = 65, height = 30) {
  const geo = new THREE.ConeGeometry(1, 1, 5);
  b.own(geo);
  const mesh = new THREE.InstancedMesh(geo, b.material('#92a9a3', 0.95), count);
  const temp = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = radius + random() * 45;
    temp.position.set(-count * 18 + i * 36, y, z - random() * 60);
    temp.scale.set(r, height + random() * 45, r * 0.8);
    temp.rotation.set(0, random() * Math.PI, 0);
    temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix);
  }
  mesh.computeBoundingSphere(); b.attach(mesh);
}

export function buildWorld(scene, physics, mapId = 'portside') {
  seed = 921;
  const definition = MAPS[mapId] || MAPS.portside;
  const b = createBuilder(scene, physics, ['apex','skyport'].includes(definition.id));
  const built = definition.id === 'skyport' ? buildFlightWorld(b) : definition.id === 'apex' ? buildRaceWorld(b) : definition.id === 'coastline'
    ? buildCoastline(scene, physics, b)
    : buildPortside(scene, physics, b);
  b.flushTrees();
  b.flushBatches();
  const stream=definition.id==='apex'?new SceneryStream(physics.world,physics.scenery):null;
  stream?.update(definition.spawn,true);

  return {
    ...built,
    map: definition,
    update(position) {stream?.update(position);},
    performanceStats() {return {sceneryTotal:stream?.bodies.length??physics.scenery.length,sceneryActive:stream?.active.size??physics.scenery.length};},
    resetProps() {
      for (const p of built.dynamics) {
        p.body.position.copy(p.origin); p.body.quaternion.set(0, 0, 0, 1);
        p.body.velocity.setZero(); p.body.angularVelocity.setZero(); p.body.aabbNeedsUpdate = true;
      }
    },
    dispose() {
      stream?.dispose();
      for (const mesh of b.owned.meshes) scene.remove(mesh);
      for (const geometry of b.owned.geometries) geometry.dispose();
      for (const material of b.owned.materials) material.dispose();
      for (const texture of b.owned.textures) texture.dispose();
      b.owned.meshes.length = 0;
    },
  };
}
