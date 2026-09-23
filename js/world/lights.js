// Airfield lighting: ALSF-2 approach lights with sequenced flashers, threshold,
// edge, centreline and touchdown-zone lights, PAPI, REIL strobes and taxiway
// lights. All rendered as one THREE.Points with a custom shader so hundreds of
// lights cost one draw call. Light colour/intensity is updated per frame for
// the flashing elements and the PAPI (computed from the pilot's eye position).
import * as THREE from 'three';
import { RUNWAY, DEG } from '../config.js';

const VERT = /* glsl */`
  attribute vec3 color;
  attribute float size;
  attribute float bright;
  varying vec3 vColor;
  varying float vBright;
  varying float vDepth;
  uniform float uPixelRatio;
  uniform float uDaylight;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vColor = color;
    vBright = bright;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = length(mvPosition.xyz);
    vDepth = dist;
    // apparent size: lights stay visible at range (like real airfield lights)
    float s = size * uPixelRatio * clamp(1400.0 / max(dist, 1.0), 0.35, 3.0);
    gl_PointSize = clamp(s, 3.0 * uPixelRatio, 26.0 * uPixelRatio) * (bright > 0.01 ? 1.0 : 0.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vBright;
  varying float vDepth;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform float uDaylight;
  uniform float uIntensity;   // scene-linear brightness of a light's core (lights glow through the bloom pass)
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float core = smoothstep(1.0, 0.15, r);
    float halo = smoothstep(1.0, 0.0, r) * 0.35;
    float a = (core + halo) * vBright;
    // lights punch through fog better than terrain (Koschmieder-ish) but still fade
    float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth * 0.55);
    a *= mix(1.0, fog, 0.97);
    // by day the lights are dimmer relative to the scene
    a *= mix(1.0, 0.9, uDaylight);
    gl_FragColor = vec4(vColor * (1.0 + 0.6 * core) * mix(1.0, uIntensity, core), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const COL = {
  white: [1, 0.97, 0.9],
  red: [1, 0.12, 0.08],
  green: [0.15, 1, 0.35],
  amber: [1, 0.72, 0.1],
  blue: [0.25, 0.45, 1],
  pink: [1, 0.55, 0.55],
};

export class AirfieldLights {
  constructor(scene, extraEntries = []) {
    this.scene = scene;
    this.entries = [];   // { x, y, z, color, size, group, index }
    this.groups = {};    // name -> [indices]
    this.time = 0;
    this.extraEntries = extraEntries;
    this.build();
  }

  add(x, y, z, color, size = 1, group = 'static') {
    const idx = this.entries.length;
    this.entries.push({ x, y, z, color: COL[color] || color, size, group, bright: 1 });
    (this.groups[group] = this.groups[group] || []).push(idx);
    return idx;
  }

  build() {
    const L = RUNWAY.length, halfL = L / 2, halfW = RUNWAY.width / 2;
    const thr = RUNWAY.thresholdX;      // +x end = threshold of 27 (aircraft lands toward -x)
    const y = 0.35;
    // ---- approach lighting system (ALSF-2) for runway 27, extending +x from the threshold
    for (let d = 30; d <= 900; d += 30) {
      const x = thr + d;
      // centreline barrette: 5 lights, 1 m apart
      for (let i = -2; i <= 2; i++) this.add(x, y + 0.6, i * 1.0, 'white', 1.5, 'als');
      // red side barrettes in the inner 270 m
      if (d <= 270) for (let i = 0; i < 3; i++) { this.add(x, y + 0.4, -(9 + i * 1.5), 'red', 0.9); this.add(x, y + 0.4, 9 + i * 1.5, 'red', 0.9); }
      // sequenced flashers from 300 m outward
      if (d >= 300) this.add(x, y + 1.2, 0, 'white', 1.6, 'flasher');
    }
    // 1000 ft (300 m) crossbar and 500 ft (150 m) crossbar
    for (let z = -15; z <= 15; z += 1.5) this.add(thr + 300, y + 0.6, z, 'white', 1.3);
    for (let z = -9; z <= 9; z += 1.5) this.add(thr + 150, y + 0.6, z, 'white', 1.3);
    // ---- threshold: green bar across the runway width (+ wing bars), REIL strobes
    for (let z = -halfW; z <= halfW; z += 3) this.add(thr, y, z, 'green', 1.1);
    for (let z = halfW + 3; z <= halfW + 12; z += 3) { this.add(thr, y, z, 'green', 1.0); this.add(thr, y, -z, 'green', 1.0); }
    this.add(thr - 2, y + 0.8, halfW + 14, 'white', 2.2, 'reil'); this.add(thr - 2, y + 0.8, -halfW - 14, 'white', 2.2, 'reil');
    // ---- runway end (09 end, x = -halfL) shows red to a landing 27 aircraft
    for (let z = -halfW; z <= halfW; z += 3) this.add(-halfL, y, z, 'red', 1.1);
    // ---- edge lights every 60 m; amber for the last 600 m
    for (let x = -halfL + 30; x < halfL; x += 60) {
      const col = x < -halfL + 600 ? 'amber' : 'white';
      this.add(x, y, halfW + 1.5, col, 1.0); this.add(x, y, -halfW - 1.5, col, 1.0);
    }
    // ---- centreline lights every 15 m: white, alternating red/white 900..300 m from the end, red last 300 m
    for (let x = halfL - 7.5; x > -halfL; x -= 15) {
      const dEnd = x + halfL;
      let col = 'white';
      if (dEnd < 300) col = 'red';
      else if (dEnd < 900) col = Math.round(dEnd / 15) % 2 === 0 ? 'red' : 'white';
      this.add(x, y - 0.1, 0, col, 0.75);
    }
    // ---- touchdown zone lights: barrettes of 3 either side, every 30 m for 900 m
    for (let d = 30; d <= 900; d += 30) {
      for (let i = 0; i < 3; i++) { this.add(thr - d, y - 0.1, 11 + i * 1.5, 'white', 0.75); this.add(thr - d, y - 0.1, -11 - i * 1.5, 'white', 0.75); }
    }
    // ---- PAPI: 4 units on the left of 27 (left = +z when flying -x), 320 m from the threshold, 9 m spacing
    this.papi = [];
    const papiX = thr - RUNWAY.papiDistance;
    for (let i = 0; i < 4; i++) this.papi.push(this.add(papiX, 0.9, RUNWAY.papiOffset + i * 9, 'white', 3.4, 'papi'));
    this.papiAngles = [3.5, 3.1667, 2.8333, 2.5]; // nearest the runway first
    // ---- taxiway: blue edge lights along the parallel taxiway (z = 120..150) and connectors, green centreline
    for (let x = -halfL; x <= halfL; x += 50) { this.add(x, y, 118, 'blue', 0.7); this.add(x, y, 152, 'blue', 0.7); this.add(x + 25, y - 0.1, 135, 'green', 0.5); }
    for (const cx of [-1450, -700, 0, 700, 1450]) {
      for (let z = halfW + 10; z < 118; z += 20) { this.add(cx - 13, y, z, 'blue', 0.7); this.add(cx + 13, y, z, 'blue', 0.7); this.add(cx, y - 0.1, z + 10, 'green', 0.5); }
    }
    // ---- apron floodlights and the tower beacon
    // warm apron floodlights: bright up close, not a solid white block from miles away
    for (let x = -600; x <= 600; x += 200) this.add(x, 18, 400, [1, 0.86, 0.62], 1.8);
    this.beacon = this.add(-250, 62, 330, 'white', 4.0, 'beacon');
    // ---- obstruction lights (red) on the tower and buildings
    this.add(-250, 66, 330, 'red', 1.5, 'obst');
    // ---- town / road / farm lights (only lit at dusk and night)
    for (const e of this.extraEntries) this.add(e.x, e.y, e.z, e.color, e.size, e.group || 'town');

    // build the geometry
    const n = this.entries.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), bright = new Float32Array(n);
    this.entries.forEach((e, i) => {
      pos[i * 3] = e.x; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = e.z;
      col[i * 3] = e.color[0]; col[i * 3 + 1] = e.color[1]; col[i * 3 + 2] = e.color[2];
      size[i] = e.size; bright[i] = 1;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
    this.colAttr = geo.getAttribute('color');
    this.brightAttr = geo.getAttribute('bright');
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uPixelRatio: { value: 1 }, uFogDensity: { value: 0 }, uFogColor: { value: new THREE.Color(0x000000) }, uDaylight: { value: 1 }, uIntensity: { value: 1.5 } },
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
  }

  setColor(i, c) { this.colAttr.setXYZ(i, c[0], c[1], c[2]); }

  /**
   * @param dt seconds
   * @param eye THREE.Vector3 pilot eye position (world)
   * @param fogDensity current scene fog density
   * @param daylight 0..1
   */
  update(dt, eye, fogDensity, daylight, pixelRatio) {
    this.time += dt;
    const u = this.material.uniforms;
    u.uFogDensity.value = fogDensity; u.uDaylight.value = daylight; u.uPixelRatio.value = pixelRatio;
    // sequenced flashers: run toward the threshold twice per second
    const fl = this.groups.flasher || [];
    const phase = (this.time * 2) % 1;            // 0..1 per sequence
    fl.forEach((idx, k) => {
      // k=0 is the innermost (300 m); the rabbit runs from the far end inward
      const order = (fl.length - 1 - k) / fl.length;
      const on = Math.abs(phase - order) < 0.06 || Math.abs(phase - order - 1) < 0.06;
      this.brightAttr.setX(idx, on ? 1.5 : 0);
    });
    // REIL: two strobes flashing together twice per second
    const reilOn = (this.time * 2) % 1 < 0.08;
    for (const idx of this.groups.reil || []) this.brightAttr.setX(idx, reilOn ? 1.5 : 0);
    // beacon: white/green alternating
    const b = (this.time * 0.8) % 1;
    this.setColor(this.beacon, b < 0.5 ? COL.white : COL.green);
    this.brightAttr.setX(this.beacon, (b % 0.5) < 0.12 ? 1.3 : 0);
    // town lights come on at dusk
    const townOn = daylight < 0.6 ? 1 : 0;
    if (this._townOn !== townOn) { this._townOn = townOn; for (const idx of this.groups.town || []) this.brightAttr.setX(idx, townOn); }
    // PAPI from the pilot's eye
    if (eye) {
      for (let i = 0; i < 4; i++) {
        const e = this.entries[this.papi[i]];
        const dx = eye.x - e.x, dz = eye.z - e.z, dy = eye.y - e.y;
        const horiz = Math.hypot(dx, dz);
        const ang = Math.atan2(dy, Math.max(horiz, 1)) / DEG;
        const t = this.papiAngles[i];
        // ~0.1° transition band appears pink
        let c;
        if (ang > t + 0.08) c = COL.white; else if (ang < t - 0.08) c = COL.red; else c = COL.pink;
        // PAPI is only visible from ahead of the runway (within +-~15° azimuth of the approach)
        const azimuth = Math.atan2(-dz, dx) / DEG; // aircraft east of the PAPI: dx>0
        const visible = dx > 50 && Math.abs(azimuth) < 25;
        this.setColor(this.papi[i], c);
        this.brightAttr.setX(this.papi[i], visible ? 1.4 : 0);
      }
    }
    this.colAttr.needsUpdate = true;
    this.brightAttr.needsUpdate = true;
  }

  /** PAPI indication for the HUD/tests: number of white lights (0..4). */
  papiWhites(eye) {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const e = this.entries[this.papi[i]];
      const ang = Math.atan2(eye.y - e.y, Math.max(Math.hypot(eye.x - e.x, eye.z - e.z), 1)) / DEG;
      if (ang > this.papiAngles[i]) n++;
    }
    return n;
  }
}
