import * as THREE from 'three';

const palettes = { concrete: '#c3bdad', light: '#ded8c7', brick: '#b28d74', charcoal: '#454b48', green: '#697f6a', rust: '#bb6745' };
let seed = 921;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function buildWorld(scene, physics) {
  const batches = new Map();
  const mapBuildings = [];
  const dynamics = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const temp = new THREE.Object3D();
  const materials = new Map();
  function material(color, roughness = 0.83) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness }));
    return materials.get(color);
  }
  function box(x, y, z, w, h, d, color, collision = false, angle = 0) {
    const key = color;
    if (!batches.has(key)) batches.set(key, []);
    temp.position.set(x, y, z); temp.rotation.set(0, angle, 0); temp.scale.set(w, h, d); temp.updateMatrix();
    batches.get(key).push(temp.matrix.clone());
    if (collision) physics.addBox(x, y, z, w, h, d, { angle });
  }
  function sign(text, x, y, z, w, h, bg = '#e3ddc9', fg = '#35423b', angle = 0) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 100px Arial';
    ctx.fillText(text, 512, 132, 950);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    mesh.position.set(x, y, z); mesh.rotation.y = angle; scene.add(mesh);
  }

  const asphalt = document.createElement('canvas'); asphalt.width = asphalt.height = 512;
  const ac = asphalt.getContext('2d');
  ac.fillStyle = '#71736e'; ac.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 45000; i++) {
    const l = 80 + random() * 65;
    ac.fillStyle = `rgba(${l},${l},${l - 3},0.25)`;
    ac.fillRect(random() * 512, random() * 512, 1.4, 1.4);
  }
  const roadTexture = new THREE.CanvasTexture(asphalt);
  roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(90, 90);
  roadTexture.colorSpace = THREE.SRGBColorSpace; roadTexture.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const roads = [-168, -84, 0, 84, 168];
  const intersections = roads;
  for (const x of roads) {
    for (let z = -213; z <= 213; z += 8) {
      if (intersections.some(k => Math.abs(z - k) < 15)) continue;
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

  for (let ix = 0; ix < roads.length - 1; ix++) for (let iz = 0; iz < roads.length - 1; iz++) {
    const x = roads[ix] + 42, z = roads[iz] + 42;
    // Raised islands leave generous intersecting streets; every raised surface has a collider.
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
      // Open freight yard, with movable props and a driveable ramp.
      for (let i = 0; i < 5; i++) container(x + 10, z - 17 + i * 8, 0.26, i % 2 ? '#8a9b91' : '#ba7758');
      container(x + 10, z - 17, 3.26, '#b89365');
      box(x - 15, 0.9, z + 11, 7, 1.1, 12, '#a0a091', true);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 12), material('#aeb2a5'));
      ramp.position.set(x - 15, 1.13, z + 20.5); ramp.rotation.x = 0.17; ramp.castShadow = true; ramp.receiveShadow = true; scene.add(ramp);
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

  function container(x, z, y, color) {
    box(x, y + 1.5, z, 18, 3, 6.2, color, true);
    for (let i = -8.5; i < 9; i += 0.65) {
      box(x + i, y + 1.5, z + 3.16, 0.11, 2.8, 0.12, color);
      box(x + i, y + 1.5, z - 3.16, 0.11, 2.8, 0.12, color);
    }
    sign('P O R T S I D E', x, y + 1.65, z + 3.23, 10, 0.6, color, '#e5ddc9');
  }
  function tree(x, z) {
    box(x, 0.35, z, 3.3, 0.3, 3.3, '#8a9581', true);
    box(x, 2.1, z, 0.35, 3.7, 0.35, '#787768', true);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const mesh = new THREE.Mesh(g, material(i % 2 ? '#7d8d65' : '#6b805c'));
      mesh.position.set(x + (i - 1) * 0.7, 4.3 + i * 0.48, z); mesh.scale.set(1.7, 2.0, 1.6); mesh.castShadow = true; scene.add(mesh);
    }
  }
  function lamp(x, z, side) {
    box(x, 4.6, z, 0.16, 9, 0.16, '#676d66', true);
    box(x + side * 1.6, 9, z, 3.4, 0.16, 0.16, '#676d66');
    box(x + side * 2.8, 8.91, z, 1, 0.17, 0.45, '#ded5b6');
    box(x, 0.5, z, 0.5, 0.8, 0.5, '#8f9486');
  }

  // Crash-test lane along the main road: props have real mass and can be pushed over.
  for (let i = 0; i < 10; i++) {
    const x = 7.6 + (i % 2) * 2.1, z = -29 - Math.floor(i / 2) * 5;
    const body = physics.addBox(x, 0.52, z, 0.55, 1.02, 0.55, { mass: 9 });
    const group = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 16), material('#da6b3d'));
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), material('#39443d')); base.position.y = -0.45;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.15, 0.15, 16), material('#f2e8d1')); stripe.position.y = 0.07;
    group.add(cone, base, stripe); scene.add(group); dynamics.push({ body, mesh: group, origin: body.position.clone() });
  }
  for (let i = 0; i < 6; i++) {
    const x = -9, z = -29 - i * 4;
    box(x, 0.56, z, 1.3, 1.12, 2.6, '#babba9', true);
    box(x + 0.657, 0.63, z, 0.025, 0.35, 2.3, i % 2 ? '#dfd7b7' : '#cf794c');
  }

  // Distant elevated road and the harbour cranes give the district a clear silhouette.
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
  for (let i = 0; i < 24; i++) {
    const x = -400 + i * 36;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(65 + random() * 45, 30 + random() * 45, 5), material('#92a9a3'));
    mountain.position.set(x, 6, -340 - random() * 60); mountain.scale.z = 0.8; scene.add(mountain);
  }

  // Boundary collision walls are visible, so the entire drivable area is contained.
  for (const side of [-1, 1]) {
    box(side * 228, 1.1, 0, 1.2, 2.2, 458, '#a1a799', true);
    box(0, 1.1, side * 228, 458, 2.2, 1.2, '#a1a799', true);
  }
  for (const [color, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(boxGeometry, material(color), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  }
  return { mapBuildings, roads, dynamics, resetProps() {
    for (const p of dynamics) { p.body.position.copy(p.origin); p.body.quaternion.set(0, 0, 0, 1); p.body.velocity.setZero(); p.body.angularVelocity.setZero(); p.body.aabbNeedsUpdate = true; }
  } };
}
