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

  // ---- the tug: a low tractor with a cab and a towbar, in airport yellow
  const tug = new THREE.Group(); tug.name = 'Pushback tug';
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.2, metalness: 0.3 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; tug.add(b); return b; };
  box(2.6, 0.9, 5.2, paint, 0, 0.85, 0);                       // body (nose along -z, like the aircraft)
  box(1.5, 0.9, 1.5, paint, -0.45, 1.75, -1.2); box(1.4, 0.55, 1.4, glass, -0.45, 1.85, -1.2).scale.set(1.04, 1, 1.04);   // cab
  box(0.16, 0.16, 3.4, dark, 0, 0.55, 4.2);                    // towbar, towards the aircraft's nose gear
  for (const [x, z] of [[-1.25, -1.6], [1.25, -1.6], [-1.25, 1.6], [1.25, 1.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); tug.add(w);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa000 })); beacon.position.set(-0.45, 2.32, -1.2); tug.add(beacon);
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
