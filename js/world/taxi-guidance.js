// What a departure adds to the airport: the taxi route drawn on the pavement as a line to follow
// (a training aid, not a real marking) and the pushback tug, seen as it drives clear of the nose
// once it has disconnected.
import * as THREE from 'three';
import { taxiRoute } from '../taxi-route.js';

const NOSE = 16.5;           // m ahead of the centre of gravity: where the tug stands at the towbar

export function addTaxiGuidance(world) {
  const group = new THREE.Group(); group.name = 'Taxi guidance';
  // ---- the route: a flat ribbon just above the pavement, with chevrons along it
  const route = taxiRoute(), half = 0.45, pos = [], idx = [];
  for (let i = 0; i < route.length; i++) {
    const a = route[Math.max(0, i - 1)], b = route[Math.min(route.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    pos.push(route[i].x + nx * half, 0.06, route[i].z + nz * half, route[i].x - nx * half, 0.06, route[i].z - nz * half);
    // gaps make it read as a guide line, not paint: 6 m drawn, 2 m clear
    if (i && Math.floor(route[i].s / 8) === Math.floor(route[i - 1].s / 8) && route[i].s % 8 < 6) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5cf0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  line.name = 'Taxi route'; line.renderOrder = 2; line.visible = false; group.add(line);

  // ---- the tug: a conventional pushback tractor. Low and wide so it fits under a nose, the cab
  // offset to one side, deep wheel arches, a towbar to the nose gear, hazard stripes and a beacon.
  const tug = new THREE.Group(); tug.name = 'Pushback tug';
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9b520, roughness: 0.55, metalness: 0.1 }), dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.15, metalness: 0.4 }), steel = new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.5, metalness: 0.6 });
  const stripes = (() => {            // black and yellow chevrons for the ends
    const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
    g.fillStyle = '#e9b520'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#111';
    for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  })();
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; tug.add(b); return b; };
  // (the tug's nose is along -z, like the aircraft's; the towbar goes back, +z, to the nose gear)
  box(2.9, 0.55, 6.4, paint, 0, 0.72, 0);                        // the deck
  box(2.5, 0.3, 5.6, paint, 0, 1.12, 0);                         // the engine cover, a step in from the deck
  box(2.9, 0.36, 0.12, stripes, 0, 0.72, -3.24); box(2.9, 0.36, 0.12, stripes, 0, 0.72, 3.24);   // bumpers
  box(1.25, 0.95, 1.5, paint, -0.72, 1.74, -1.5);                // the cab, on the left
  box(1.29, 0.5, 1.2, glass, -0.72, 1.9, -1.5); box(1.0, 0.5, 1.54, glass, -0.72, 1.9, -1.5);   // its windows, front to back and side to side
  box(1.35, 0.08, 1.6, paint, -0.72, 2.25, -1.5);                // roof
  box(0.9, 0.5, 1.1, dark, 0.75, 1.45, 0.4);                     // the exhaust and air housing beside it
  box(0.1, 0.9, 0.1, steel, 1.1, 1.75, 1.6);                     // exhaust stack
  for (const [x, z] of [[-1.3, -1.9], [1.3, -1.9], [-1.3, 1.9], [1.3, 1.9]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.55, 18), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.62, z); w.castShadow = true; tug.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.58, 12), steel); hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.62, z); tug.add(hub);
    box(0.5, 0.2, 1.5, dark, x, 1.02, z);                        // the arch over it
  }
  for (const x of [-1.05, 1.05]) box(0.28, 0.16, 0.06, new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), x, 0.98, -3.22);   // headlights
  box(0.14, 0.14, 3.6, steel, 0, 0.5, 5.0); box(0.5, 0.2, 0.3, steel, 0, 0.5, 3.3);   // the towbar and its hitch
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa000 })); beacon.position.set(-0.72, 2.42, -1.5); tug.add(beacon);
  tug.visible = false; group.add(tug);
  world.scene.add(group);

  let leaving = -1;
  world.taxiGuidance = {
    line, tug, beacon,
    /** @param s { route (show the line), towed, pushed (the push has ended), x, z, heading (rad), dt } */
    update(s) {
      line.visible = !!s.route;
      const fx = Math.sin(s.heading), fz = -Math.cos(s.heading), rx = -fz, rz = fx;
      if (s.towed) { leaving = -1; tug.visible = true; tug.position.set(s.x + fx * (NOSE + 6), 0, s.z + fz * (NOSE + 6)); tug.rotation.y = -s.heading + Math.PI; }
      else if (s.pushed && leaving < 0 && tug.visible) { leaving = 0; tug.userData.from = { x: tug.position.x, z: tug.position.z, fx, fz, rx, rz, heading: s.heading }; }
      if (leaving >= 0) {
        // disconnected: it backs away from the nose, swings to the left and drives off across the apron
        leaving += s.dt; const f = tug.userData.from, t = leaving;
        const ahead = Math.min(t, 4) * 2.2, turn = Math.max(0, Math.min(1, (t - 3) / 4)), side = turn * turn * (3 - 2 * turn), away = Math.max(0, t - 5) * 5;
        tug.position.set(f.x + f.fx * ahead - f.rx * (side * 18 + away), 0, f.z + f.fz * ahead - f.rz * (side * 18 + away));
        tug.rotation.y = -f.heading + Math.PI + side * Math.PI / 2;
        if (t > 26) { tug.visible = false; leaving = -1; }
      }
      if (!s.towed && !s.pushed) { tug.visible = false; leaving = -1; }
      beacon.visible = tug.visible && Math.floor(performance.now() / 350) % 2 === 0;
    },
  };
  return world.taxiGuidance;
}
