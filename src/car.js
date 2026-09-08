import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createCar(scene) {
  const root = new THREE.Group(); scene.add(root);
  const deformables = [];
  const paint = new THREE.MeshPhysicalMaterial({ color: '#67877d', metalness: 0.65, roughness: 0.29, clearcoat: 1, clearcoatRoughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#202b29', roughness: 0.55, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: '#283632', roughness: 0.26, metalness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#bec6ba', roughness: 0.2, metalness: 0.92 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#6a9396', metalness: 0.35, roughness: 0.13, transparent: true, opacity: 0.73, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1e2423', roughness: 0.93 });
  const red = new THREE.MeshStandardMaterial({ color: '#972b23', emissive: '#ff3722', emissiveIntensity: 0.32, roughness: 0.3 });
  const headlight = new THREE.MeshStandardMaterial({ color: '#efe8c8', emissive: '#ffedb1', emissiveIntensity: 0.55, roughness: 0.25 });
  function part(w, h, d, x, y, z, mat, round = 0, damageable = false) {
    const geo = round ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d, damageable ? 9 : 1, damageable ? 3 : 1, damageable ? 12 : 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    if (damageable) deformables.push({ mesh, original: geo.attributes.position.array.slice() });
    return mesh;
  }

  // Separate high-density body panels retain their dents after impact.
  part(1.91, 0.44, 4.38, 0, 0.22, 0, paint, 0.11, true);
  part(1.83, 0.18, 1.34, 0, 0.51, -1.44, paint, 0.07, true);
  part(1.85, 0.18, 0.85, 0, 0.51, 1.7, paint, 0.06, true);
  part(1.52, 0.1, 1.81, 0, 1.11, 0.08, paint, 0.055, true);
  part(1.86, 0.09, 4.05, 0, 0.04, 0, dark, 0.025);
  // Cabin glass uses a trapezoid profile, with pillars on top rather than a solid box.
  function windowQuad(points) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, glass); root.add(mesh);
    deformables.push({ mesh, original: geo.attributes.position.array.slice() });
    return mesh;
  }
  const frontGlass = windowQuad([[-0.84, 0.6, -1.14], [0.84, 0.6, -1.14], [0.72, 1.075, -0.8], [-0.72, 1.075, -0.8]]);
  const rearGlass = windowQuad([[0.84, 0.6, 1.24], [-0.84, 0.6, 1.24], [-0.72, 1.075, 0.92], [0.72, 1.075, 0.92]]);
  function beam(a, b, width, mat) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, from.distanceTo(to), width), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    mesh.castShadow = true; root.add(mesh); return mesh;
  }
  for (const s of [-1, 1]) {
    windowQuad([[s * 0.85, 0.59, -1.1], [s * 0.85, 0.59, 1.18], [s * 0.735, 1.07, 0.88], [s * 0.735, 1.07, -0.77]]);
    beam([s * 0.85, 0.57, -1.14], [s * 0.74, 1.11, -0.8], 0.075, paint);
    beam([s * 0.85, 0.57, 1.26], [s * 0.74, 1.11, 0.92], 0.105, paint);
    beam([s * 0.86, 0.59, 0.05], [s * 0.75, 1.095, 0.05], 0.072, trim);
    part(0.026, 0.035, 2.52, s * 0.944, 0.575, 0.06, chrome);
    part(0.045, 0.056, 3.96, s * 0.961, 0.245, 0, trim);
    part(0.022, 0.025, 0.28, s * 0.966, 0.47, -0.04, chrome, 0.009);
    part(0.022, 0.025, 0.28, s * 0.966, 0.47, 0.91, chrome, 0.009);
    // Door panel gaps, side mirrors and fender indicators.
    part(0.007, 0.34, 0.012, s * 0.962, 0.37, 0.2, dark);
    part(0.007, 0.31, 0.012, s * 0.962, 0.36, 1.18, dark);
    part(0.007, 0.31, 0.012, s * 0.962, 0.36, -1.05, dark);
    part(0.25, 0.16, 0.31, s * 1.01, 0.69, -0.85, paint, 0.06);
    part(0.19, 0.10, 0.02, s * 1.024, 0.7, -0.686, chrome, 0.025);
    part(0.018, 0.053, 0.14, s * 0.963, 0.46, -1.29, headlight);
    part(0.68, 0.18, 0.065, s * 0.53, 0.4, -2.171, headlight, 0.025, true);
    part(0.66, 0.16, 0.075, s * 0.56, 0.42, 2.175, red, 0.025, true);
    part(0.6, 0.027, 0.08, s * 0.56, 0.40, 2.19, chrome);
    part(0.17, 0.12, 0.12, s * 0.66, 0.12, -2.18, headlight, 0.025);
  }
  part(0.42, 0.19, 0.05, 0, 0.4, -2.2, trim, 0.02);
  for (let i = -3; i <= 3; i++) part(0.013, 0.14, 0.06, i * 0.05, 0.4, -2.23, chrome);
  part(1.82, 0.085, 0.12, 0, 0.21, -2.2, trim, 0.03, true);
  part(1.82, 0.085, 0.12, 0, 0.20, 2.2, trim, 0.03, true);
  part(0.8, 0.095, 0.055, 0, 0.07, -2.16, dark);
  part(0.15, 0.12, 0.26, -0.65, -0.01, 2.17, chrome, 0.05);

  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 96;
  const ctx = plateCanvas.getContext('2d'); ctx.fillStyle = '#e7e3d0'; ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#384941'; ctx.font = 'bold 43px monospace'; ctx.textAlign = 'center'; ctx.fillText('OVR-1986', 128, 61);
  const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace;
  part(0.58, 0.21, 0.026, 0, 0.37, 2.216, new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.5 }));
  // A real cabin stays visible in first person, including seats, dash, and steering wheel.
  for (const x of [-0.43, 0.43]) {
    part(0.55, 0.15, 0.57, x, 0.37, 0.12, dark, 0.06);
    const seat = part(0.55, 0.55, 0.13, x, 0.65, 0.41, dark, 0.05); seat.rotation.x = -0.12;
    part(0.27, 0.18, 0.12, x, 0.99, 0.44, dark, 0.05);
  }
  part(1.49, 0.35, 0.25, 0, 0.64, 0.99, dark, 0.06);
  const dash = part(1.6, 0.16, 0.45, 0, 0.58, -0.88, dark, 0.055);
  part(1.5, 0.04, 0.04, 0, 0.565, -0.63, chrome);
  part(0.24, 0.28, 0.57, 0, 0.33, -0.4, dark, 0.03);
  const steering = new THREE.Group(); steering.position.set(-0.43, 0.68, -0.59); steering.rotation.x = -0.24; root.add(steering);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 32), dark); steering.add(ring);
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.048, 0.06), dark); steering.add(hub);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.04), chrome); spoke.position.y = -0.09; steering.add(spoke);
  const instrument = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.12), new THREE.MeshBasicMaterial({ color: '#25352d' }));
  instrument.position.set(-0.43, 0.655, -0.658); root.add(instrument);
  for (const x of [-0.51, -0.36]) {
    const gauge = new THREE.Mesh(new THREE.RingGeometry(0.043, 0.047, 24), chrome); gauge.position.set(x, 0.65, -0.651); root.add(gauge);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.235, 32, 1), rubber); tire.rotation.z = Math.PI / 2; wheel.add(tire);
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.018, 32), chrome);
      rim.rotation.z = Math.PI / 2; rim.position.x = side * 0.124; wheel.add(rim);
      const inset = new THREE.Mesh(new THREE.CylinderGeometry(0.208, 0.208, 0.019, 32), dark);
      inset.rotation.z = Math.PI / 2; inset.position.x = side * 0.137; wheel.add(inset);
      for (let j = 0; j < 8; j++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.405, 0.045), chrome);
        spoke.position.x = side * 0.15; spoke.rotation.x = j * Math.PI / 8; wheel.add(spoke);
      }
      const center = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.027, 16), chrome);
      center.rotation.z = Math.PI / 2; center.position.x = side * 0.16; wheel.add(center);
      const sidewall = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.006, 4, 32), trim);
      sidewall.rotation.y = Math.PI / 2; sidewall.position.x = side * 0.12; wheel.add(sidewall);
    }
    wheel.traverse(o => { if (o.isMesh) o.castShadow = true; });
    wheels.push(wheel); scene.add(wheel);
  }

  function deform(point, severity) {
    if (!severity) return;
    const hit = new THREE.Vector3(point.x, point.y, point.z);
    const inward = new THREE.Vector3(-hit.x, 0.07, -hit.z).normalize();
    for (const { mesh } of deformables) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const local = new THREE.Vector3().fromBufferAttribute(positions, i);
        const carPoint = mesh.localToWorld(local.clone()); root.worldToLocal(carPoint);
        const dist = carPoint.distanceTo(hit);
        const influence = Math.max(0, 1 - dist / 1.6) ** 2;
        if (influence > 0) {
          const wave = Math.sin(carPoint.x * 24 + carPoint.z * 17) * 0.12;
          local.addScaledVector(inward, influence * severity);
          local.y += influence * severity * wave;
          positions.setXYZ(i, local.x, local.y, local.z);
        }
      }
      positions.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    }
  }
  return {
    root, wheels, steering, paint,
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
    setCockpit(enabled) { frontGlass.visible = !enabled; },
    deform,
    repair() {
      for (const { mesh, original } of deformables) {
        mesh.geometry.attributes.position.array.set(original); mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
      }
    },
  };
}
