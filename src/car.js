import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineCarBody, defineWheel } from './carBody.js';

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
      const geo = partGeometry(w, h, d, round, false, 1);
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

export function createCar(scene) {
  const root = new THREE.Group(); scene.add(root);
  const deformables = [];
  const materials = carMaterials();
  const { paint, dark, trim, chrome, glass, rubber, red, headlight } = materials;
  const pick = key => materials[key];

  function part(w, h, d, x, y, z, key, round = 0, damageable = false, extra = {}) {
    const geo = partGeometry(w, h, d, round, damageable);
    const mesh = new THREE.Mesh(geo, pick(key));
    mesh.position.set(x, y, z);
    if (extra.rotateX) mesh.rotation.x = extra.rotateX;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    if (damageable) deformables.push({ mesh, original: geo.attributes.position.array.slice() });
    return mesh;
  }
  const windows = {};
  function windowQuad(points, name) {
    const geo = quadGeometry(points);
    const mesh = new THREE.Mesh(geo, glass); root.add(mesh);
    deformables.push({ mesh, original: geo.attributes.position.array.slice() });
    if (name) windows[name] = mesh;
    return mesh;
  }
  function beam(a, b, width, key) {
    const { geo, position, quaternion } = beamTransform(a, b, width);
    const mesh = new THREE.Mesh(geo, pick(key));
    mesh.position.copy(position); mesh.quaternion.copy(quaternion);
    mesh.castShadow = true; root.add(mesh); return mesh;
  }
  defineCarBody({ part, beam, windowQuad });

  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 96;
  const ctx = plateCanvas.getContext('2d');
  function drawPlate(text) {
    ctx.fillStyle = '#e7e3d0'; ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#384941'; ctx.font = 'bold 43px monospace'; ctx.textAlign = 'center';
    ctx.fillText(text, 128, 61);
  }
  drawPlate('OVR-1986');
  const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.21, 0.026), new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.5 }));
  plate.position.set(0, 0.37, 2.216); root.add(plate);

  // Instrument panel and steering wheel, visible from the cockpit camera.
  const steering = new THREE.Group(); steering.position.set(-0.43, 0.68, -0.59); steering.rotation.x = -0.24; root.add(steering);
  steering.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 32), dark));
  steering.add(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.048, 0.06), dark));
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.04), chrome); spoke.position.y = -0.09; steering.add(spoke);
  const instrument = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.12), new THREE.MeshBasicMaterial({ color: '#25352d' }));
  instrument.position.set(-0.43, 0.655, -0.658); root.add(instrument);
  for (const x of [-0.51, -0.36]) {
    const gauge = new THREE.Mesh(new THREE.RingGeometry(0.043, 0.047, 24), chrome); gauge.position.set(x, 0.65, -0.651); root.add(gauge);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Group();
    defineWheel({
      cylinder(rt, rb, h, seg, key, x) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), pick(key));
        mesh.rotation.z = Math.PI / 2; mesh.position.x = x; wheel.add(mesh);
      },
      box(w, h, d, x, rotation, key) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(key));
        mesh.position.x = x; mesh.rotation.x = rotation; wheel.add(mesh);
      },
      torus(r, tube, rs, ts, key, x) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, rs, ts), pick(key));
        mesh.rotation.y = Math.PI / 2; mesh.position.x = x; wheel.add(mesh);
      },
    });
    wheel.traverse(o => { if (o.isMesh) o.castShadow = true; });
    wheels.push(wheel); scene.add(wheel);
  }

  // Deformation works on cached local-space vertices, so an impact costs one
  // pass over the panels with no per-vertex matrix work or allocation.
  for (const entry of deformables) {
    entry.mesh.updateMatrix();
    const count = entry.mesh.geometry.attributes.position.count;
    entry.carSpace = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(entry.mesh.geometry.attributes.position, i).applyMatrix4(entry.mesh.matrix);
      entry.carSpace[i * 3] = v.x; entry.carSpace[i * 3 + 1] = v.y; entry.carSpace[i * 3 + 2] = v.z;
    }
  }

  const hit = new THREE.Vector3();
  const inward = new THREE.Vector3();
  function deform(point, severity) {
    if (!severity) return;
    hit.set(point.x, point.y, point.z);
    inward.set(-hit.x, 0.07, -hit.z).normalize();
    for (const entry of deformables) {
      const positions = entry.mesh.geometry.attributes.position;
      const cached = entry.carSpace;
      let touched = false;
      for (let i = 0; i < positions.count; i++) {
        const cx = cached[i * 3], cy = cached[i * 3 + 1], cz = cached[i * 3 + 2];
        const dist = Math.hypot(cx - hit.x, cy - hit.y, cz - hit.z);
        if (dist >= 1.6) continue;
        const influence = (1 - dist / 1.6) ** 2;
        if (influence <= 0) continue;
        const wave = Math.sin(cx * 24 + cz * 17) * 0.12;
        positions.setXYZ(i,
          positions.getX(i) + inward.x * influence * severity,
          positions.getY(i) + inward.y * influence * severity + influence * severity * wave,
          positions.getZ(i) + inward.z * influence * severity);
        touched = true;
      }
      if (touched) {
        positions.needsUpdate = true;
        entry.mesh.geometry.computeVertexNormals();
        entry.mesh.geometry.computeBoundingSphere();
      }
    }
  }

  return {
    root, wheels, steering, paint, materials,
    // The heavier car sits lower and longer, so the two read differently from
    // the chase camera without a second hand-built model.
    setProfile(spec) {
      const longer = spec.id === 'marlin';
      root.scale.set(longer ? 1.04 : 1, longer ? 0.96 : 1, longer ? 1.06 : 1);
      for (const wheel of wheels) wheel.scale.setScalar(longer ? 1.04 : 1);
      drawPlate(longer ? 'MRL-455' : 'OVR-1986');
      plateTexture.needsUpdate = true;
    },
    sync(physics) {
      root.position.copy(physics.chassis.position); root.quaternion.copy(physics.chassis.quaternion);
      for (let i = 0; i < 4; i++) {
        physics.vehicle.updateWheelTransform(i);
        const transform = physics.vehicle.wheelInfos[i].worldTransform;
        wheels[i].position.copy(transform.position); wheels[i].quaternion.copy(transform.quaternion);
      }
      steering.rotation.z = physics.steer * 2.4;
      red.emissiveIntensity = physics.braking ? 2.2 : 0.32;
      root.updateMatrixWorld(true);
    },
    setCockpit(enabled) { windows.front.visible = !enabled; },
    deform,
    repair() {
      for (const { mesh, original } of deformables) {
        mesh.geometry.attributes.position.array.set(original);
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
      }
    },
  };
}
