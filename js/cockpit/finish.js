// Close-range surfaces and fittings for the flight deck. All labels are artwork;
// flight information continues to come from the live instrument canvases.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRng } from '../physics/atmosphere.js';

export function surfaceGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), image = g.createImageData(256, 256), rng = makeRng(62);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 105 + rng() * 48;
    image.data.set([v, v, v, 255], i);
  }
  g.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); t.anisotropy = 4;
  return t;
}

export function rounded(w, h, d, radius = 0.008) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4));
}

export function detailFlightDeck(cockpit) {
  const { root, panelGroup: panel, mat: M } = cockpit;
  const existing = new Set(); root.traverse((o) => existing.add(o));
  const metal = new THREE.MeshStandardMaterial({ color: 0x929691, metalness: 0.75, roughness: 0.42 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x737971, roughness: 0.72, metalness: 0.18 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x131715, roughness: 0.95 });
  const fasteners = [], slots = [];
  const screw = (parent, x, y, z, scale = 1) => {
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    m.scale(new THREE.Vector3(scale, scale, scale)); m.setPosition(x, y, z);
    // Panel and shell parts have different parents; flatten into root coordinates once.
    parent.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
    const transform = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(parent.matrixWorld).multiply(m);
    fasteners.push(transform);
    const slit = new THREE.Matrix4().makeTranslation(0, 0.0015, 0);
    slots.push(transform.clone().multiply(slit));
  };
  const label = (parent, text, x, y, z, w, h = 0.022) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#c9ccbf'; g.font = '500 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 40);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.8, emissive: 0xc9ccbf, emissiveMap: tex, emissiveIntensity: 0.12 }));
    m.position.set(x, y, z); parent.add(m);
  };
  const knob = (parent, x, y, z, radius = 0.016) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.2, radius * 1.2, 0.006, 24), rubber);
    base.rotation.x = Math.PI / 2; base.position.set(x, y, z); parent.add(base);
    const k = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 0.025, 16), trim);
    k.rotation.x = Math.PI / 2; k.position.set(x, y, z + 0.012); parent.add(k);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.006, 0.018), rubber);
      grip.position.set(x + Math.sin(angle) * radius, y + Math.cos(angle) * radius, z + 0.014);
      grip.rotation.z = -angle; parent.add(grip);
    }
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.002, radius * 0.7, 0.001), M.white);
    tick.position.set(x, y + radius * 0.3, z + 0.025); parent.add(tick);
  };
  // Real seams, recessed fasteners and display controls interrupt the broad panel face.
  for (const x of [-1.05, -0.88, -0.34, 0.23, 0.88, 1.05]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.48, 0.001), rubber);
    seam.position.set(x, 0, 0.022); panel.add(seam);
    for (const y of [-0.235, 0.235]) screw(panel, x + 0.012, y, 0.025);
  }
  for (const x of [-0.70, -0.46, 0, 0.46, 0.70]) {
    for (const dx of [-0.109, 0.109]) for (const dy of [-0.109, 0.109]) screw(panel, x + dx, 0.14 + dy, 0.039, 0.6);
    knob(panel, x - 0.075, -0.003, 0.028, 0.012);
    label(panel, 'BRT', x - 0.032, -0.004, 0.027, 0.035, 0.01);
  }
  // Lower display-selection / lighting panels, below the main instruments.
  for (const side of [-1, 1]) {
    const x = side * 0.63;
    const plate = new THREE.Mesh(rounded(0.39, 0.13, 0.016), M.panel);
    plate.position.set(x, -0.16, 0.027); panel.add(plate);
    label(panel, 'MAIN PANEL  ·  DISPLAY', x, -0.115, 0.037, 0.24, 0.014);
    for (const dx of [-0.13, -0.04, 0.05, 0.14]) knob(panel, x + dx, -0.17, 0.039, 0.011);
    for (const dx of [-0.18, 0.18]) for (const dy of [-0.05, 0.05]) screw(panel, x + dx, -0.16 + dy, 0.039, 0.65);
  }
  // The MCP's flat lettering is retained as a live face, with a selector knob under each window.
  // Knobs and panels stay on the glareshield's face (y -0.20 to -0.15): from the pilot's eye
  // anything lower hangs in front of the tops of the displays.
  for (const x of [-0.36, -0.19, -0.025, 0.145]) knob(root, x, -0.1885, -0.672, 0.008);
  for (const side of [-1, 1]) {
    const x = side * 0.73;
    const p = new THREE.Mesh(rounded(0.30, 0.052, 0.012), M.panel);
    p.position.set(x, -0.175, -0.669); root.add(p);
    label(root, 'EFIS CONTROL', x, -0.156, -0.6625, 0.14, 0.009);
    // minimums (fixed), the mode selector and the range knob: the last two turn with the
    // navigation display's settings, so they stay out of the static batches
    cockpit.efisKnobs = cockpit.efisKnobs || { mode: [], range: [] };
    for (const [dx, role] of [[-0.105, null], [0, 'mode'], [0.105, 'range']]) {
      if (!role) { knob(root, x + dx, -0.18, -0.663, 0.009); continue; }
      const grp = new THREE.Group(); grp.position.set(x + dx, -0.18, -0.663); grp.userData.keep = true; root.add(grp);
      knob(grp, 0, 0, 0, 0.009);
      cockpit.efisKnobs[role].push(grp);
    }
  }
  // Leather edge piping on the glareshield; small ventilation slots on its top.
  const piping = new THREE.Mesh(rounded(2.27, 0.014, 0.017, 0.006), rubber);
  piping.position.set(0, -0.137, -0.696); root.add(piping);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.075), rubber);
      vent.position.set(side * 0.72 + i * 0.008, -0.123, -0.9); root.add(vent);
    }
    label(root, 'WESTHAVEN  /  737-800', side * 0.88, -0.28, -0.667, 0.24, 0.016);
  }
  const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 12), metal, fasteners.length);
  const slits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.005, 0.001, 0.0008), rubber, slots.length);
  fasteners.forEach((m, i) => screws.setMatrixAt(i, m)); slots.forEach((m, i) => slits.setMatrixAt(i, m));
  root.add(screws, slits);
  batchFittings(root, existing);
}

// Hundreds of screws and knob ribs should not require hundreds of draw calls.
// Only new, static decorations are merged; animated controls retain their pivots.
function batchFittings(root, existing) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), batches = new Map(), meshes = [];
  const kept = (o) => { for (let p = o.parent; p; p = p.parent) if (p.userData.keep) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || existing.has(o) || kept(o)) return;
    const key = o.material.id;
    if (!batches.has(key)) batches.set(key, { material: o.material, pieces: [] });
    let geometry = o.geometry.clone();
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    batches.get(key).pieces.push(geometry); meshes.push(o);
  });
  for (const { material, pieces } of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const size = name === 'uv' ? 2 : 3;
      const count = pieces.reduce((sum, g) => sum + g.attributes[name].array.length, 0);
      const data = new Float32Array(count); let offset = 0;
      for (const g of pieces) { data.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    root.add(new THREE.Mesh(geometry, material));
    pieces.forEach((g) => g.dispose());
  }
  for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
}
