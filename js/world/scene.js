// The outside world: renderer, sky, lighting, terrain, airport, runway,
// airfield lights, weather (fog, clouds, rain, lightning).
import * as THREE from 'three';
import { RUNWAY, DEG } from '../config.js';
import { TERRAIN } from '../physics/terrain.js';
import { makeRng } from '../physics/atmosphere.js';
import { makeRunwayTexture, makeTaxiwayTexture, makeGroundTexture, makeMacroTexture, makeDetailTexture, makeCloudTexture, makeOvercastTexture, makeBuildingTexture, makeTreeTexture } from './textures.js';
import { AirfieldLights } from './lights.js';

const SKY_VERT = /* glsl */`
  varying vec3 vWorldDir;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vWorldDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const SKY_FRAG = /* glsl */`
  varying vec3 vWorldDir;
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
  uniform float uStars;
  uniform vec3 uFogColor; uniform float uFogMix; uniform float uHorizonFog;
  #include <logdepthbuf_pars_fragment>
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    #include <logdepthbuf_fragment>
    float h = vWorldDir.y;
    vec3 col;
    if (h >= 0.0) {
      // the pilot mostly sees the lowest 20° of sky: keep real blue there, haze only right at the horizon
      float t = pow(clamp(h, 0.0, 1.0), 0.32);
      col = mix(uHorizon, uZenith, t);
    } else {
      col = mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
    }
    float sd = dot(vWorldDir, uSunDir);
    float sun = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.3, sd);
    float glow = pow(max(sd, 0.0), 24.0) * 0.35 + pow(max(sd, 0.0), 4.0) * 0.12;
    col += uSunColor * (sun * 1.2 + glow);
    if (uStars > 0.0 && h > 0.02) {
      vec3 p = floor(vWorldDir * 260.0);
      float s = hash(p);
      float star = step(0.995, s) * uStars * smoothstep(0.02, 0.2, h);
      col += vec3(star * (0.6 + 0.4 * hash(p + 1.0)));
    }
    // the sky blends into the fog colour near the horizon (haze) and completely inside cloud
    float fb = clamp(uFogMix + (1.0 - uFogMix) * exp(-max(h, 0.0) * uHorizonFog), 0.0, 1.0);
    fb = max(fb, smoothstep(0.0, -0.04, h));
    col = mix(col, uFogColor, fb);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GROUND_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying float vHeight;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vNormalW = normalize(normalMatrix * normal);
    vHeight = position.y;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <logdepthbuf_vertex>
  }
`;
const GROUND_FRAG = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying float vHeight;
  uniform sampler2D uMap; uniform sampler2D uMacro; uniform sampler2D uDetail;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient;
  uniform float uRepeat; uniform float uWet;
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 base = texture2D(uMap, vUv).rgb;
    float macro = texture2D(uMacro, vUv * 0.1).r * 2.0;
    // close-up grass / soil detail (fades out beyond ~1.5 km so it never sparkles at range)
    float detail = texture2D(uDetail, vUv * 60.0).r * 2.0;
    float detailW = 1.0 - smoothstep(300.0, 1500.0, vFogDepth);
    base *= mix(1.0, mix(0.82, 1.18, detail * 0.5), detailW);
    // rocky/snowy tint on the high ground
    float hi = smoothstep(250.0, 700.0, vHeight);
    base = mix(base, vec3(0.45, 0.42, 0.38), hi * 0.8);
    base = mix(base, vec3(0.9), smoothstep(650.0, 900.0, vHeight));
    base *= mix(0.85, 1.15, macro * 0.5);
    base *= mix(1.0, 0.7, uWet);
    vec3 n = normalize(vNormalW);
    float diff = max(dot(n, uSunDir), 0.0);
    vec3 col = base * (uAmbient + uSunColor * diff);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RAIN_VERT = /* glsl */`
  attribute float seed;
  uniform float uTime; uniform vec3 uBox; uniform vec3 uVel;
  varying float vA;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    // each drop falls with the relative velocity (camera space); wrap inside the box
    vec3 p = position;
    vec3 d = uVel * (uTime + seed * 100.0);
    p = mod(p + d + uBox * 0.5, uBox) - uBox * 0.5;
    vA = 0.35 + 0.3 * seed;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const RAIN_FRAG = /* glsl */`
  varying float vA;
  uniform float uIntensity;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(0.72, 0.78, 0.88, vA * uIntensity * 0.45);
    #include <colorspace_fragment>
  }
`;

export class World {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.lowDetail = !!opts.lowDetail;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowDetail, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this.lowDetail ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 60000);
    this.scene.fog = new THREE.FogExp2(0xbfd0e0, 0.00005);
    // The flight deck is rendered in a second pass with its own lights, so the
    // sun never shines through the fuselage onto the seats and consoles.
    this.cockpitScene = new THREE.Scene();
    this.cockpitHemi = new THREE.HemisphereLight(0xb8c8d8, 0x30333a, 1.0);
    this.cockpitScene.add(this.cockpitHemi);
    this.cockpitAmbient = new THREE.AmbientLight(0xffffff, 0.2);
    this.cockpitScene.add(this.cockpitAmbient);
    this.time = 0;
    this.night = false;
    this.rng = makeRng(21);

    this.buildLighting();
    this.buildSky();
    this.buildTerrain();
    this.townLightEntries = [];
    this.buildAirport();
    this.lights = new AirfieldLights(this.scene, this.townLightEntries);
    this.buildWeather();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ lighting
  buildLighting() {
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6a45, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-3000, 4000, 2000);
    this.scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(this.ambient);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(30000, 48, 24);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x2a63c9) }, uHorizon: { value: new THREE.Color(0xc9dcee) }, uGround: { value: new THREE.Color(0x7b8a6a) },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.4).normalize() }, uSunColor: { value: new THREE.Color(0xfff2d0) }, uSunSize: { value: 0.0008 },
        uStars: { value: 0 },
        uFogColor: { value: new THREE.Color(0xc4d5e6) }, uFogMix: { value: 0 }, uHorizonFog: { value: 20 },
      },
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  // ------------------------------------------------------------------ terrain
  buildTerrain() {
    const sizeX = 160000, sizeZ = 110000, seg = this.lowDetail ? 100 : 200;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, seg, Math.round(seg * sizeZ / sizeX));
    geo.rotateX(-Math.PI / 2);
    geo.translate(12000, 0, 0);           // the approach comes from the east: extend that way
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, TERRAIN.heightAt(x, z));
    }
    geo.computeVertexNormals();
    this.groundTex = makeGroundTexture(this.maxAniso, false);
    this.groundTexNight = null;
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uMap: { value: null }, uMacro: { value: null },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.4).normalize() }, uSunColor: { value: new THREE.Color(0xffffff) }, uAmbient: { value: new THREE.Color(0x667788) },
        uRepeat: { value: 1 }, uWet: { value: 0 }, uDetail: { value: null },
      }]),
    });
    this.groundMat.uniforms.uMap.value = this.groundTex;
    this.groundMat.uniforms.uMacro.value = makeMacroTexture();
    this.groundMat.uniforms.uDetail.value = makeDetailTexture();
    // uv is scaled so one tile = 2 km regardless of the plane size
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, pos.getX(i) / 2000, pos.getZ(i) / 2000);
    const ground = new THREE.Mesh(geo, this.groundMat);
    ground.position.y = -0.05;
    ground.frustumCulled = false;
    this.scene.add(ground);
    this.ground = ground;
  }

  // ------------------------------------------------------------------ airport
  buildAirport() {
    const L = RUNWAY.length, W = RUNWAY.width, halfL = L / 2;
    const aniso = this.maxAniso;
    // runway surface
    this.runwayTex = makeRunwayTexture(aniso, this.renderer.capabilities.maxTextureSize);
    const rwMat = new THREE.MeshStandardMaterial({ map: this.runwayTex, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(L, W), rwMat);
    rw.rotation.x = -Math.PI / 2;
    rw.position.y = 0.02;
    this.scene.add(rw);
    this.runwayMat = rwMat;
    // blast pads / stopways at each end (60 m, chevrons omitted)
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: 1 });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(60, W), padMat); p.rotation.x = -Math.PI / 2; p.position.set(sx * (halfL + 30), 0.01, 0); this.scene.add(p); }
    // parallel taxiway (z 120..150) and connectors, apron
    const twTex = makeTaxiwayTexture(aniso, L, 30);
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(L, 30), new THREE.MeshStandardMaterial({ map: twTex, roughness: 1 }));
    tw.rotation.x = -Math.PI / 2; tw.position.set(0, 0.015, 135); this.scene.add(tw);
    const conTex = makeTaxiwayTexture(aniso, 120, 30);
    for (const cx of [-1450, -700, 0, 700, 1450]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(30, 100), new THREE.MeshStandardMaterial({ map: conTex, roughness: 1 }));
      c.rotation.x = -Math.PI / 2; c.rotation.z = Math.PI / 2; c.position.set(cx, 0.012, 72); this.scene.add(c);
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(1400, 270), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.014, 285); this.scene.add(apron);

    // buildings: terminal, hangars, tower
    this.buildingTex = makeBuildingTexture(false);
    const bMat = new THREE.MeshLambertMaterial({ map: this.buildingTex });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x777a80 });
    const box = (w, h, d, x, z, mat = bMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
      m.position.set(x, h / 2, z); this.scene.add(m); return m;
    };
    this.buildingTex.repeat.set(4, 1);
    box(420, 22, 60, 0, 460);                    // terminal
    box(120, 16, 60, -400, 470); box(120, 16, 60, 420, 470);
    for (let i = 0; i < 3; i++) box(90, 24, 70, 700 + i * 110, 300, new THREE.MeshLambertMaterial({ color: 0xaeb2b8 })); // hangars
    // control tower
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 52, 12), towerMat); shaft.position.set(-250, 26, 330); this.scene.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(11, 9, 9, 12), new THREE.MeshLambertMaterial({ color: 0x2a3a4a })); cab.position.set(-250, 56, 330); this.scene.add(cab);
    // jet bridges + parked aircraft on the apron
    for (let i = 0; i < 5; i++) this.addParkedAirliner(-320 + i * 160, 380, Math.PI);
    // localizer antenna array beyond the 09 end, glideslope mast near the TDZ
    const antMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (let i = -7; i <= 7; i++) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 2.5), antMat); a.position.set(-halfL - 300, 1.5, i * 3.2); this.scene.add(a); }
    const gsMast = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), antMat); gsMast.position.set(halfL - 320, 6, -120); this.scene.add(gsMast);
    // wind sock
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), antMat); pole.position.set(halfL - 500, 4, -90); this.scene.add(pole);
    this.sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a00, side: THREE.DoubleSide }));
    this.sock.position.set(halfL - 500, 8, -90); this.scene.add(this.sock);
    // approach light towers (the ALS is on frangible masts over the grass) — thin posts
    const postMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    for (let d = 30; d <= 900; d += 30) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 4.4), postMat); p.position.set(RUNWAY.thresholdX + d, 0.35, 0); this.scene.add(p); }
    // perimeter road
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6000, 8), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 620); this.scene.add(road);
    // forests + villages around (instanced trees)
    this.buildVegetation();
    // a river and a lake to help orientation
    const water = new THREE.MeshStandardMaterial({ color: 0x3d6f9a, roughness: 0.2, metalness: 0.1 });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(90, 26000), water); river.rotation.x = -Math.PI / 2; river.rotation.z = 0.18; river.position.set(6500, 0.005, 0); this.scene.add(river);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1400, 32), water); lake.rotation.x = -Math.PI / 2; lake.position.set(-9000, 0.006, -6000); this.scene.add(lake);
    // a town under the approach (rows of small buildings) for scale & lights
    this.buildTown();
  }

  addParkedAirliner(x, z, yaw) {
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 38, 12), white); fus.rotation.x = Math.PI / 2; fus.position.y = 3.2; g.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 5), white); wing.position.set(0, 2.6, 1); g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), new THREE.MeshLambertMaterial({ color: 0x2255aa })); tail.position.set(0, 7, 16); g.add(tail);
    const htail = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3), white); htail.position.set(0, 4, 17); g.add(htail);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: 0x999999 })); e.rotation.x = Math.PI / 2; e.position.set(sx * 5.7, 1.8, -1); g.add(e); }
    g.position.set(x, 0, z); g.rotation.y = yaw; this.scene.add(g);
  }

  buildVegetation() {
    const tex = makeTreeTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const count = this.lowDetail ? 1200 : 3500;
    const geo = new THREE.PlaneGeometry(9, 12);
    const mesh = new THREE.InstancedMesh(geo, mat, count * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const rng = this.rng;
    let i = 0;
    // forest patches (avoid the runway strip and the approach corridor within 1.2 km of the centreline)
    const patches = [];
    for (let k = 0; k < 40; k++) {
      let x, z;
      do { x = (rng() - 0.5) * 30000; z = (rng() - 0.5) * 24000; } while (Math.abs(z) < 900 || (Math.abs(x) < 2200 && Math.abs(z) < 1400));
      patches.push({ x, z, r: 250 + rng() * 700 });
    }
    for (const pt of patches) {
      const n = Math.floor(count / patches.length);
      for (let k = 0; k < n && i < count; k++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * pt.r;
        p.set(pt.x + Math.cos(a) * r, 0, pt.z + Math.sin(a) * r);
        p.y = TERRAIN.heightAt(p.x, p.z) + 6;
        const sc = 0.8 + rng() * 0.8;
        s.set(sc, sc, sc);
        for (const rot of [0, Math.PI / 2]) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
          m.compose(p, q, s); mesh.setMatrixAt(i * 2 + (rot === 0 ? 0 : 1), m);
        }
        i++;
      }
    }
    mesh.count = i * 2;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildTown() {
    const rng = this.rng;
    const tex = makeBuildingTexture(false);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const count = this.lowDetail ? 300 : 900;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    // a town ~6–9 km east of the threshold, south of the extended centreline, plus a suburb north
    for (let i = 0; i < count; i++) {
      const east = i < count * 0.7;
      const cx = east ? 8000 + (rng() - 0.5) * 3500 : -6000 + (rng() - 0.5) * 2500;
      const cz = east ? 1800 + (rng() - 0.5) * 2200 : -2600 + (rng() - 0.5) * 1600;
      const h = 6 + rng() * (rng() < 0.1 ? 40 : 14);
      const w = 12 + rng() * 20, d = 12 + rng() * 20;
      p.set(cx, h / 2, cz); s.set(w, h, d); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() < 0.5 ? 0 : Math.PI / 2);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      // street light next to every other building, warm white / sodium orange
      if (i % 2 === 0) this.townLightEntries.push({ x: cx + w * 0.7, y: 6, z: cz + d * 0.7, color: rng() < 0.6 ? [1, 0.75, 0.4] : [0.95, 0.95, 1], size: 1.4, group: 'town' });
    }
    // scattered farm / village lights across the plain and along the perimeter road
    for (let i = 0; i < 260; i++) {
      const x = (rng() - 0.5) * 36000 + 6000, z = (rng() - 0.5) * 22000;
      if (Math.abs(z) < 700 && Math.abs(x) < 3000) continue;
      this.townLightEntries.push({ x, y: 4, z, color: rng() < 0.7 ? [1, 0.78, 0.45] : [0.9, 0.95, 1], size: 1.1, group: 'town' });
    }
    for (let x = -3000; x <= 3000; x += 120) this.townLightEntries.push({ x, y: 8, z: 640, color: [1, 0.7, 0.35], size: 1.2, group: 'town' });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.townMat = mat;
  }

  // ------------------------------------------------------------------ weather
  buildWeather() {
    // scattered cumulus (sprites) — placed away from the airport; visible from the approach
    const cloudTex = makeCloudTexture();
    this.cloudGroup = new THREE.Group();
    const rng = this.rng;
    for (let i = 0; i < 80; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(mat);
      const sc = 500 + rng() * 900;
      sp.scale.set(sc, sc * 0.45, 1);
      sp.position.set((rng() - 0.5) * 40000, 0, (rng() - 0.5) * 40000);
      sp.userData.baseX = sp.position.x; sp.userData.baseZ = sp.position.z;
      this.cloudGroup.add(sp);
    }
    this.scene.add(this.cloudGroup);
    // overcast deck
    const ovTex = makeOvercastTexture();
    ovTex.repeat.set(30, 30);
    this.overcast = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshBasicMaterial({ map: ovTex, side: THREE.DoubleSide, transparent: true, opacity: 0.97, fog: true, depthWrite: false }));
    this.overcast.rotation.x = Math.PI / 2;
    this.overcast.visible = false;
    this.overcast.renderOrder = 2;
    this.scene.add(this.overcast);
    // the top of the deck, seen when flying above it: sunlit, bright
    this.overcastTop = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshBasicMaterial({ map: ovTex, side: THREE.DoubleSide, transparent: true, opacity: 0.97, fog: true, depthWrite: false }));
    this.overcastTop.rotation.x = Math.PI / 2;
    this.overcastTop.visible = false;
    this.overcastTop.renderOrder = 2;
    this.scene.add(this.overcastTop);
    // rain: line segments in camera space
    const n = this.lowDetail ? 900 : 2600;
    const pos = new Float32Array(n * 2 * 3), seed = new Float32Array(n * 2);
    const box = new THREE.Vector3(44, 30, 40);
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * box.x, y = (rng() - 0.5) * box.y, z = (rng() - 0.5) * box.z;
      const sd = rng();
      pos.set([x, y, z, x, y - 0.22, z + 0.45], i * 6);   // ~0.5 m streak: what a drop covers in a 60 Hz frame
      seed[i * 2] = sd; seed[i * 2 + 1] = sd;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uBox: { value: box }, uVel: { value: new THREE.Vector3(0, -9, 3) }, uIntensity: { value: 0 } },
    });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.position.set(0, 0, -27);     // the whole box sits well outside the windshield (7..47 m)
    // the rain rig copies the camera transform every frame (the camera itself lives in the cockpit scene)
    this.rainRig = new THREE.Object3D();
    this.rainRig.add(this.rain);
    this.scene.add(this.rainRig);
    this.lightningTimer = 4;
    this.lightningFlash = 0;
  }

  // ------------------------------------------------------------------ scenario
  applyScenario(scenario, night = false) {
    this.scenario = scenario;
    this.night = night;
    const tod = night ? 'night' : scenario.timeOfDay;
    this.tod = tod;
    // sky + lighting presets
    const presets = {
      day: { zenith: 0x1e56c0, horizon: 0x9cbfe4, ground: 0x7b8a6a, sun: [-0.45, 0.62, 0.35], sunColor: 0xfff2d0, sunI: 1.7, hemiI: 1.3, hemiSky: 0xe2e9f2, ambient: 0x556677, fogColor: 0xc4d5e6, stars: 0, daylight: 1 },
      dusk: { zenith: 0x1b2a4a, horizon: 0x8a6a5a, ground: 0x2a2a2a, sun: [-0.85, 0.08, 0.5], sunColor: 0xff9a55, sunI: 0.5, hemiI: 0.45, hemiSky: 0x8090b0, ambient: 0x303848, fogColor: 0x6a6a72, stars: 0.3, daylight: 0.35 },
      night: { zenith: 0x03060f, horizon: 0x101828, ground: 0x050608, sun: [0.3, -0.4, 0.5], sunColor: 0x000000, sunI: 0.0, hemiI: 0.12, hemiSky: 0x223355, ambient: 0x0c1018, fogColor: 0x0a0d14, stars: 1, daylight: 0 },
    };
    const p = presets[tod];
    const storm = scenario.id === 'storm';
    const u = this.skyMat.uniforms;
    u.uZenith.value.set(storm ? 0x30363f : p.zenith);
    u.uHorizon.value.set(storm ? 0x5a5e66 : p.horizon);
    u.uGround.value.set(p.ground);
    u.uSunDir.value.set(...p.sun).normalize();
    u.uSunColor.value.set(storm ? 0x554433 : p.sunColor);
    u.uStars.value = storm ? 0 : p.stars;
    if (tod === 'night' && storm) { u.uZenith.value.set(0x05060a); u.uHorizon.value.set(0x12141a); }
    this.sun.intensity = storm ? p.sunI * 0.35 : p.sunI;
    this.sun.position.set(p.sun[0] * 5000, p.sun[1] * 5000, p.sun[2] * 5000);
    this.sun.color.set(storm ? 0x8899aa : p.sunColor);
    this.hemi.intensity = storm ? p.hemiI * 0.6 : p.hemiI;
    this.hemi.color.set(p.hemiSky);
    this.ambient.color.set(p.ambient); this.ambient.intensity = storm ? 0.25 : 0.15;
    const gu = this.groundMat.uniforms;
    gu.uSunDir.value.copy(u.uSunDir.value);
    gu.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.42);
    gu.uAmbient.value.set(p.ambient).multiplyScalar(tod === 'night' ? 0.6 : 1.0);
    if (storm) gu.uAmbient.value.multiplyScalar(0.9);
    gu.uWet.value = scenario.wet ? 1 : 0;
    this.runwayMat.color.set(tod === 'night' ? 0x777777 : 0xffffff);
    this.runwayMat.roughness = scenario.wet ? 0.35 : 0.95;
    // fog: density such that contrast falls to ~5 % at the visibility range
    this.baseFogColor = new THREE.Color(storm ? (tod === 'night' ? 0x090a0e : 0x6f7378) : p.fogColor);
    this.scene.fog.color.copy(this.baseFogColor);
    this.visibility = scenario.visibility;
    this.cloudBase = scenario.cloudBase * 0.3048;
    this.cloudTop = this.cloudBase + (scenario.cloudThickness || 99999) * 0.3048;
    this.hasDeck = scenario.cloudBase < 5000;
    this.daylight = p.daylight * (storm ? 0.5 : 1);
    this.cockpitHemi.intensity = tod === 'night' ? 0.05 : (storm ? 0.5 : (tod === 'dusk' ? 0.4 : 1.0));
    this.cockpitHemi.color.set(tod === 'dusk' ? 0xd0a080 : 0xb8c8d8);
    this.cockpitAmbient.intensity = tod === 'night' ? 0.03 : 0.2;
    // clouds
    this.overcast.visible = this.hasDeck;
    this.overcast.position.y = this.cloudBase;
    this.overcast.material.opacity = storm ? 0.98 : 0.85;
    this.overcast.material.color.set(storm ? (tod === 'night' ? 0x101216 : 0x55595f) : (tod === 'night' ? 0x1a1e26 : 0x9aa0a8));
    this.overcastTop.visible = this.hasDeck && this.cloudTop < 6000;
    this.overcastTop.position.y = this.cloudTop;
    this.overcastTop.material.opacity = 0.97;
    this.overcastTop.material.color.set(tod === 'night' ? 0x262a33 : (tod === 'dusk' ? 0xc9a58a : 0xeef1f4));
    const cumulus = scenario.id !== 'storm' && scenario.id !== 'clear';
    this.cloudGroup.visible = cumulus || scenario.id === 'clear';
    this.cloudGroup.children.forEach((sp) => {
      sp.position.y = (scenario.id === 'clear' ? 1600 : this.cloudBase - 150) + (this.rng() - 0.5) * 200;
      sp.material.opacity = scenario.id === 'clear' ? 0.55 : 0.9;
      sp.material.color.set(tod === 'night' ? 0x223 : (tod === 'dusk' ? 0xa08070 : 0xffffff));
    });
    // rain
    this.rainMat.uniforms.uIntensity.value = scenario.rain;
    this.rain.visible = scenario.rain > 0;
    this.lightningEnabled = !!scenario.lightning;
    // building windows glow at night
    this.buildingTex.dispose();
    this.buildingTex = makeBuildingTexture(tod !== 'day');
    this.buildingTex.repeat.set(4, 1);
    this.scene.traverse((o) => { if (o.material && o.material.map && o.material.map.image && o.material.map.image.width === 128 && o.material.map !== this.buildingTex) { o.material.map = this.buildingTex; o.material.needsUpdate = true; } });
    if (this.townMat) { this.townMat.map = this.buildingTex; this.townMat.needsUpdate = true; }
    // ground texture at night
    if (tod === 'night') { if (!this.groundTexNight) this.groundTexNight = makeGroundTexture(this.maxAniso, true); this.groundMat.uniforms.uMap.value = this.groundTexNight; }
    else this.groundMat.uniforms.uMap.value = this.groundTex;
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param dt seconds
   * @param state aircraft state (for altitude-dependent fog, wind sock)
   * @param eye world position of the pilot's eye
   */
  update(dt, state, eye) {
    this.time += dt;
    // fog density: in cloud above the base, thick; below: visibility
    const alt = state.alt;
    let vis = this.visibility;
    // inside the deck (between its base and its top, with a 60 m transition at each edge) the
    // visibility collapses; above the top it is clear again with the deck seen from above
    let inCloudF = 0;
    if (this.hasDeck) {
      inCloudF = Math.max(0, Math.min(1, (alt - this.cloudBase) / 60, (this.cloudTop - alt) / 60));
      vis = vis * (1 - inCloudF) + 120 * inCloudF;
      this.overcast.visible = alt < this.cloudTop - 20;
      this.overcastTop.visible = this.cloudTop < 6000 && alt > this.cloudBase + 20;
    }
    const density = 1.73 / Math.max(vis, 50);
    this.scene.fog.density = density;
    this.skyMat.uniforms.uFogMix.value = Math.max(inCloudF, vis < 1500 ? 0.6 : 0);
    this.skyMat.uniforms.uHorizonFog.value = Math.max(0.8, Math.min(25, this.visibility / 1500));
    this.skyMat.uniforms.uFogColor.value.copy(this.scene.fog.color);
    // fog colour brightens slightly with a lightning flash
    this.scene.fog.color.copy(this.baseFogColor);
    if (this.lightningFlash > 0) {
      this.scene.fog.color.lerp(new THREE.Color(0xffffff), Math.min(1, this.lightningFlash * 0.7));
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 6);
    }
    this.skyMat.uniforms.uFogColor.value.copy(this.scene.fog.color);
    if (this.lightningEnabled) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) { this.lightningTimer = 6 + this.rng() * 14; this.lightningFlash = 1; this.onLightning && this.onLightning(); }
    }
    // the sky dome is centred on the camera so it can never be clipped by the far plane
    this.sky.position.copy(eye);
    // clouds drift with the wind
    if (this.cloudGroup.visible) {
      const drift = this.time * 2.0;
      this.cloudGroup.children.forEach((sp, i) => { sp.position.x = sp.userData.baseX + drift * (0.7 + (i % 5) * 0.1); });
    }
    // overcast layer follows the camera horizontally so it never ends
    if (this.overcast.visible) { this.overcast.position.x = eye.x; this.overcast.position.z = eye.z; this.overcast.material.map.offset.set(eye.x / 80000 * 30 + this.time * 0.002, -eye.z / 80000 * 30); }
    if (this.overcastTop.visible) { this.overcastTop.position.x = eye.x; this.overcastTop.position.z = eye.z; }
    // rain in camera space: relative velocity = fall + aircraft speed (approx along the view axis)
    this.camera.getWorldQuaternion(this.rainRig.quaternion);
    this.rainRig.position.copy(eye);
    if (this.rain.visible) {
      this.rainMat.uniforms.uTime.value = this.time;
      const gs = state.groundSpeed;
      this.rainMat.uniforms.uVel.value.set(0, -9, Math.min(gs, 90) * 0.8);
    }
    // wind sock points downwind
    if (this.sock) {
      const wdir = (state.windDirDeg + 180) * DEG;
      this.sock.rotation.set(Math.PI / 2 - 0.25 - Math.min(state.windKts / 25, 1) * 0.9, wdir, 0, 'YXZ');
    }
    // airfield lights
    this.lights.update(dt, eye, density, this.daylight, this.renderer.getPixelRatio());
  }

  render() {
    this.cockpitScene.updateMatrixWorld(true);   // the camera hangs in here: keep both passes in sync
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    r.autoClear = false;
    r.render(this.cockpitScene, this.camera);
    r.autoClear = true;
  }
}
