// Taxiway signs, to the usual conventions (ICAO Annex 14 / FAA AIM 2-3): the parallel taxiway is
// A and its connectors A1 (west) to A5 (east, by the 27 threshold).
//  - at each holding point, left of the taxiway: the location (yellow on black) beside the runway
//    designation (white on red), the runway end nearer on that side first;
//  - on taxiway A before each connector, for both directions: the direction sign (black on yellow)
//    with its arrow.
// Internally lit, like the real ones, so they read at night.
import * as THREE from 'three';
import { TAXIWAY_CONNECTORS } from '../airport-layout.js';
import { TAXI } from '../taxi-route.js';

export const TAXIWAY_NAME = 'A';
export const connectorName = (i) => `${TAXIWAY_NAME}${i + 1}`;

const CELL_W = 256, CELL_H = 96, PANEL_H = 0.9;    // one sign panel in the atlas (px), and its height (m)

export function addTaxiSigns(world) {
  const n = TAXIWAY_CONNECTORS.length, panels = [];
  // each panel: { text, kind: 'location' | 'runway' | 'direction' }
  const panel = (text, kind) => { panels.push({ text, kind }); return panels.length - 1; };
  const signs = [];   // { x, z, yaw, panels: [index] }
  TAXIWAY_CONNECTORS.forEach((cx, i) => {
    const name = connectorName(i), runway = i === 0 ? '09' : i === n - 1 ? '27' : '09-27';
    // the holding point, seen by an aircraft taxiing north towards the runway
    signs.push({ x: cx - 19.5, z: TAXI.holdZ + 1.5, yaw: 0, panels: [panel(name, 'location'), panel(runway, 'runway')] });
    // on taxiway A, 70 m before the connector: eastbound (the connector to the left), westbound (to the right)
    signs.push({ x: cx - 70, z: 117.5, yaw: -Math.PI / 2, panels: [panel(`← ${name}`, 'direction'), panel(TAXIWAY_NAME, 'location')] });
    signs.push({ x: cx + 70, z: 117.5, yaw: Math.PI / 2, panels: [panel(TAXIWAY_NAME, 'location'), panel(`${name} →`, 'direction')] });
  });
  // ---- the atlas
  const cols = 4, rows = Math.ceil(panels.length / cols), canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W; canvas.height = rows * CELL_H;
  const g = canvas.getContext('2d');
  panels.forEach((p, k) => {
    const x = (k % cols) * CELL_W, y = Math.floor(k / cols) * CELL_H;
    const [back, ink] = p.kind === 'runway' ? ['#c8102e', '#ffffff'] : p.kind === 'location' ? ['#0c0c0c', '#ffd21f'] : ['#ffd21f', '#0c0c0c'];
    g.fillStyle = back; g.fillRect(x, y, CELL_W, CELL_H);
    if (p.kind === 'location') { g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, CELL_W - 14, CELL_H - 14); }
    g.fillStyle = ink; g.font = `bold ${p.text.length > 4 ? 58 : 68}px "DejaVu Sans", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.text, x + CELL_W / 2, y + CELL_H / 2 + 3);
  });
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = Math.min(8, world.maxAniso || 1);
  // ---- one mesh: every panel's face, a dark back and two legs
  const pos = [], uv = [], idx = [], dark = [], darkIdx = [], W = PANEL_H * CELL_W / CELL_H;
  const quad = (P, I, a, b, c, d) => { const k = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  for (const s of signs) {
    const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw), total = W * s.panels.length;
    const at = (lx, y, lz) => [s.x + lx * cs + lz * sn, y, s.z - lx * sn + lz * cs];   // local x along the sign, local z towards the reader
    s.panels.forEach((k, j) => {
      const x0 = -total / 2 + j * W, u0 = (k % cols) / cols, v1 = 1 - Math.floor(k / cols) / rows, v0 = v1 - 1 / rows;
      quad(pos, idx, at(x0, 0.55, 0.06), at(x0 + W, 0.55, 0.06), at(x0 + W, 0.55 + PANEL_H, 0.06), at(x0, 0.55 + PANEL_H, 0.06));
      uv.push(u0, v0, u0 + 1 / cols, v0, u0 + 1 / cols, v1, u0, v1);
    });
    quad(dark, darkIdx, at(total / 2, 0.55, -0.06), at(-total / 2, 0.55, -0.06), at(-total / 2, 0.55 + PANEL_H, -0.06), at(total / 2, 0.55 + PANEL_H, -0.06));
    for (const lx of [-total / 2 + 0.3, total / 2 - 0.3]) quad(dark, darkIdx, at(lx - 0.06, 0, 0), at(lx + 0.06, 0, 0), at(lx + 0.06, 0.55, 0), at(lx - 0.06, 0.55, 0));
  }
  const faces = new THREE.BufferGeometry();
  faces.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); faces.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); faces.setIndex(idx);
  const backs = new THREE.BufferGeometry();
  backs.setAttribute('position', new THREE.Float32BufferAttribute(dark, 3)); backs.setIndex(darkIdx);
  const group = new THREE.Group(); group.name = 'Taxiway signs';
  group.add(new THREE.Mesh(faces, new THREE.MeshBasicMaterial({ map, toneMapped: false })));
  group.add(new THREE.Mesh(backs, new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide })));
  world.scene.add(group);
  world.taxiSigns = { group, signs, panels };
  return world.taxiSigns;
}
