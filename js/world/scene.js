// The outside world: renderer, sky, lighting, terrain, airport, runway,
// airfield lights, weather (fog, clouds, rain, lightning).
//
// Lighting is physically based: one atmosphere model (sky.js) gives the sky, the haze, the colour
// of the sunlight and the sky's own light; the sky is captured into an environment map (PMREM) that
// lights and is reflected by every surface, outside and in the cockpit. The sun casts shadows: a
// static map over the airport, and a small map around the flight deck that follows the aircraft
// (window-frame shadows sweeping over the panel). On the 'high' quality tier (desktops) the world
// is drawn into a floating-point buffer with 4× MSAA and goes through a bloom pass (the sun, the
// runway lights at night) before tone mapping; phones ('low') draw straight to the screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RUNWAY, DEG } from '../config.js';
import { TERRAIN } from '../physics/terrain.js';
import { makeRng } from '../physics/atmosphere.js';
import { makeRunwayTexture, makeTaxiwayTexture, makeGroundTexture, makeMacroTexture, makeDetailTexture, makeCloudTexture, makeOvercastTexture, makeBuildingTexture, makeTreeTexture } from './textures.js';
import { AirfieldLights } from './lights.js';
import { Atmosphere, SKY_GLSL, installHaze, sceneColor } from './sky.js';
import { Cumulus } from './clouds.js';
import { addAirportDetail, addWater } from './airport-detail.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const SKY_VERT = /* glsl */`
  varying vec3 vWorldDir;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vWorldDir = position;                 // the dome is centred on the eye
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const SKY_FRAG = /* glsl */`
  varying vec3 vWorldDir;
  uniform vec3 uSunDisc;        // radiance of the sun's disc (0: hidden)
  uniform float uSunCos;        // cos of the disc's angular radius
  uniform float uStars;
  uniform float uHorizonFog;    // how quickly the haze band over the horizon thins upwards
  uniform vec3 uGround;         // the ground's radiance below the horizon (used in the environment map)
  uniform float uGroundMix;
  ${SKY_GLSL}
  #include <logdepthbuf_pars_fragment>
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vWorldDir);
    float h = dir.y;
    vec3 col = skyScatter(dir) + skyNight(h);
    float c = dot(dir, skySunDir);
    col += uSunDisc * smoothstep(uSunCos, mix(uSunCos, 1.0, 0.3), c);
    if (uStars > 0.0 && h > 0.02) {
      vec3 p = floor(dir * 520.0);
      float s = hash(p);
      col += vec3(step(0.9985, s) * uStars * smoothstep(0.02, 0.2, h) * (0.3 + 0.7 * hash(p + 1.0)) * 1.4);
    }
    col = mix(col, skyOvercastColor, skyOvercast) + skyFlash;
    // the haze band over the horizon, and below it the ground seen through the haze
    vec3 haze = hazeColor(dir);
    col = mix(col, haze, exp(-max(h, 0.0) * uHorizonFog));
    if (h < 0.0) col = mix(haze, uGround, smoothstep(0.0, -0.25, h) * uGroundMix);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RAIN_VERT = /* glsl */`
  attribute float seed;
  attribute vec3 anchor;          // the start of this drop's streak: both ends wrap together
  uniform float uTime; uniform vec3 uBox; uniform vec3 uVel;
  varying float vA;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    // each drop falls with the relative velocity (camera space); wrap inside the box
    vec3 d = uVel * (uTime + seed * 100.0);
    vec3 a = mod(anchor + d + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 p = a + (position - anchor);
    vA = 0.35 + 0.3 * seed;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const RAIN_FRAG = /* glsl */`
  varying float vA;
  uniform float uIntensity;
  uniform vec3 uColor;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(uColor, vA * uIntensity * 0.45);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Sun positions and air for each time of day. Colours are given as they should look on screen.
const TOD = {
  // day: 40° up, 70° right of the final approach track: the landscape ahead is lit from the side,
  // the terminal's runway-facing side is in the sun, and it shines in through the right-hand windows
  day: { sun: [-0.26, 0.643, -0.72], turbidity: 2.2, rayleigh: 2.5, scale: 0.1, sunIrr: 6.0, sunWhite: 0.55, cockpitEnv: 0.25, fill: 0.9, lights: 0.8, stars: 0 },
  dusk: { sun: [-0.85, 0.12, 0.5], turbidity: 4, rayleigh: 2.5, scale: 0.1, sunIrr: 5.0, sunWhite: 0.2, cockpitEnv: 0.3, fill: 0.5, lights: 2.5, stars: 0.3 },
  night: { sun: [0.3, -0.4, 0.5], moon: [0.35, 0.55, -0.45], turbidity: 3, rayleigh: 2.5, scale: 0.1, sunIrr: 0, sunWhite: 1, cockpitEnv: 1, fill: 0.02, lights: 3, stars: 1, nightZenith: 0x03060f, nightHorizon: 0x111a2a },
};

export class World {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.lowDetail = !!opts.lowDetail;
    // 'high': shadows, floating-point frame with MSAA and bloom. 'low' (phones): straight to the screen.
    this.quality = opts.quality || (this.lowDetail ? 'low' : 'high');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowDetail, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    // the high tier needs floating-point render targets
    if (this.quality === 'high' && !renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) this.quality = 'low';
    const high = this.quality === 'high';
    this.pixelRatio = opts.pixelRatio || (this.lowDetail ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = high;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    this.atmo = new Atmosphere();
    installHaze(this.atmo);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.env = { above: null, below: null };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 60000);
    this.scene.fog = new THREE.FogExp2(0xbfd0e0, 0.00005);   // its colour is not used: see sky.js
    // The flight deck is rendered in a second pass with its own lights, so the sun only reaches
    // it through the windows (its own shadow map) and the world's shadows never fall inside it.
    this.cockpitScene = new THREE.Scene();
    // the sky seen through the windows lights it (environment map); light bounced around the
    // flight deck is a neutral, warm-grey fill
    this.cockpitFill = new THREE.HemisphereLight(0xe4e0da, 0x3a3632, 0.9);
    this.cockpitScene.add(this.cockpitFill);
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
    if (high) this.buildPost();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Render resolution relative to CSS pixels (the dynamic resolution scaler adjusts it on phones). */
  setPixelRatio(r) {
    this.pixelRatio = r;
    this.renderer.setPixelRatio(r);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      // the world's floating-point, multisampled frame is capped at about 2560×1440 pixels (on a
      // bigger or denser screen it is scaled up; the flight deck is still drawn at full resolution)
      const pr = Math.min(this.renderer.getPixelRatio(), Math.sqrt(3.7e6 / (w * h)));
      this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ lighting
  buildLighting() {
    // the sun (the moon at night); the sky's light comes from the environment map
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.position.set(-3000, 4000, 2000);
    this.sun.target.position.set(0, 0, 200);
    this.scene.add(this.sun, this.sun.target);
    if (this.quality === 'high') {
      // one static shadow map over the airport (the buildings, hangars and airliners never move)
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(4096, 2048);
      s.bias = -0.0004; s.normalBias = 0.6; s.radius = 2;
      s.autoUpdate = false;
    }
    // the same sun for the flight deck, with a small shadow map that follows the aircraft
    this.cockpitSun = new THREE.DirectionalLight(0xffffff, 3);
    this.cockpitSunTarget = new THREE.Object3D();
    this.cockpitSun.target = this.cockpitSunTarget;
    this.cockpitScene.add(this.cockpitSun, this.cockpitSunTarget);
    if (this.quality === 'high') {
      this.cockpitSun.castShadow = true;
      const s = this.cockpitSun.shadow;
      s.mapSize.set(2048, 2048);
      Object.assign(s.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 30 });
      s.camera.updateProjectionMatrix();
      s.bias = -0.0002; s.normalBias = 0.008; s.radius = 3;
    } else {
      // without shadows the sun would shine through the roof: only a trace of it inside
      this.cockpitSunScale = 0.12;
    }
  }

  /** Let the flight deck cast and receive the sun's shadow (called once the cockpit is built). */
  setupCockpit(root) {
    if (this.quality !== 'high') return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.transparent || m.isMeshBasicMaterial) return;
      o.castShadow = true; o.receiveShadow = true;
    });
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(30000, 48, 24);
    const own = () => ({
      uSunDisc: { value: new THREE.Color(0, 0, 0) }, uSunCos: { value: Math.cos(0.35 * DEG) }, uStars: { value: 0 },
      uHorizonFog: { value: 20 }, uGround: { value: new THREE.Color(0.05, 0.06, 0.04) }, uGroundMix: { value: 0 },
    });
    const skyMaterial = (uniforms) => new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: Object.assign(uniforms, this.atmo.uniforms),
    });
    this.skyMat = skyMaterial(own());
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // the environment map is captured from a copy of the dome with the ground below the horizon
    this.envSkyMat = skyMaterial(own());
    this.envSkyMat.uniforms.uGroundMix.value = 1;
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envSkyMat));
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
    // A photographic-scale agricultural tile covers six kilometres.
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, pos.getX(i) / 6000, pos.getZ(i) / 6000);
    this.groundTex = makeGroundTexture(this.maxAniso, false);
    this.groundTexNight = null;
    // a standard (lit, shadowed, fogged) material whose colour is built from three textures: the
    // 2 km field patchwork, a large-scale variation, and close-up grass detail; high ground is rock and snow
    const gu = this.groundUniforms = { uMacro: { value: makeMacroTexture() }, uDetail: { value: makeDetailTexture() }, uWet: { value: 0 }, uAlbedo: { value: 0.92 } };
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1, metalness: 0 });
    const base = THREE.Material.prototype.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      base.call(mat, sh, r);
      Object.assign(sh.uniforms, gu);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vHeight; varying vec2 vGroundXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeight = position.y; vGroundXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHeight; varying vec2 vGroundXZ;\nuniform sampler2D uMacro; uniform sampler2D uDetail; uniform float uWet; uniform float uAlbedo;')
        .replace('#include <map_fragment>', /* glsl */`
          vec3 base = texture2D(map, vMapUv).rgb;
          // Keep fields and pictured farmhouses outside the airport's maintained grass verge.
          float airport = (1.0-smoothstep(1660.0,1900.0,abs(vGroundXZ.x))) * (1.0-smoothstep(470.0,630.0,abs(vGroundXZ.y-130.0)));
          float grassNoise = texture2D(uMacro,vGroundXZ/650.0).r;
          float mowing = 0.97 + 0.03*sin(vGroundXZ.y*0.18);
          base = mix(base,vec3(0.105,0.145,0.061)*(0.8+grassNoise*0.4)*mowing,airport);
          float macro = texture2D(uMacro, vMapUv * 0.1).r * 2.0;
          // close-up grass / soil detail (fades out beyond ~1.5 km so it never sparkles at range)
          float detail = texture2D(uDetail, vMapUv * 180.0).r * 2.0;
          float detailW = 1.0 - smoothstep(300.0, 1500.0, length(vViewPosition));
          base *= mix(1.0, mix(0.82, 1.18, detail * 0.5), detailW);
          // rocky / snowy high ground
          float hi = smoothstep(250.0, 700.0, vHeight);
          base = mix(base, vec3(0.45, 0.42, 0.38), hi * 0.8);
          base = mix(base, vec3(0.9), smoothstep(650.0, 900.0, vHeight));
          base *= mix(0.85, 1.15, macro * 0.5);
          base *= mix(1.0, 0.7, uWet) * uAlbedo;
          diffuseColor.rgb *= base;
        `);
    };
    this.groundMat = mat;
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -0.05;
    ground.frustumCulled = false;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    // Keep a procedural fallback if the local texture cannot load. Boot waits for this
    // promise so the first flight and visual tests never capture an unfinished surface.
    this.assetsReady = new Promise((resolve) => {
      new THREE.TextureLoader().load(new URL('../../assets/textures/countryside.jpg', import.meta.url).href, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.anisotropy = this.maxAniso;
        this.groundTex.dispose(); this.groundTex = tex; mat.map = tex; mat.needsUpdate = true;
        resolve();
      }, undefined, () => resolve());
    });
  }

  // ------------------------------------------------------------------ airport
  buildAirport() {
    const L = RUNWAY.length, W = RUNWAY.width, halfL = L / 2;
    const aniso = this.maxAniso;
    const std = (p) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, p));
    const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; this.scene.add(m); return m; };
    // runway surface
    this.runwayTex = makeRunwayTexture(aniso, this.renderer.capabilities.maxTextureSize);
    const asphalt = makeDetailTexture(); asphalt.repeat.set(900, 16); asphalt.anisotropy = aniso;
    const rwMat = std({ map: this.runwayTex, bumpMap: asphalt, bumpScale: 0.018, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(L, W), rwMat);
    rw.rotation.x = -Math.PI / 2;
    rw.position.y = 0.02;
    add(rw, false);
    this.runwayMat = rwMat;
    // blast pads / stopways at each end (60 m, chevrons omitted)
    const padMat = std({ color: 0x4a4a4c, roughness: 1 });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(60, W), padMat); p.rotation.x = -Math.PI / 2; p.position.set(sx * (halfL + 30), 0.01, 0); add(p, false); }
    // parallel taxiway (z 120..150) and connectors, apron
    const twTex = makeTaxiwayTexture(aniso, L, 30);
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(L, 30), std({ map: twTex, roughness: 1 }));
    tw.rotation.x = -Math.PI / 2; tw.position.set(0, 0.015, 135); add(tw, false);
    const conTex = makeTaxiwayTexture(aniso, 120, 30);
    const conMat = std({ map: conTex, roughness: 1 });
    for (const cx of [-1450, -700, 0, 700, 1450]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(30, 100), conMat);
      c.rotation.x = -Math.PI / 2; c.rotation.z = Math.PI / 2; c.position.set(cx, 0.012, 72); add(c, false);
    }
    this.pavementMats = [padMat, tw.material, conMat];
    this.texturedPavement = [tw.material, conMat];
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(1400, 270), std({ color: 0x55565a, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.014, 285); add(apron, false);
    this.pavementMats.push(apron.material);

    // buildings: terminal, hangars, tower
    this.buildingTex = makeBuildingTexture(false);
    const bMat = std({ map: this.buildingTex, color: 0xb8b8b8, roughness: 0.8 });
    const roofMat = std({ color: 0x777a80, roughness: 0.7, metalness: 0.2 });
    this.buildingMats = [bMat];
    const box = (w, h, d, x, z, mat = bMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
      m.position.set(x, h / 2, z); return add(m);
    };
    this.buildingTex.repeat.set(4, 1);
    box(420, 22, 60, 0, 460);                    // terminal
    box(120, 16, 60, -400, 470); box(120, 16, 60, 420, 470);
    const hangarMat = std({ color: 0x8e9298, roughness: 0.6, metalness: 0.3 });
    for (let i = 0; i < 3; i++) box(90, 24, 70, 700 + i * 110, 300, hangarMat); // hangars
    // control tower
    const towerMat = std({ color: 0xb8bcc4, roughness: 0.8 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 52, 12), towerMat); shaft.position.set(-250, 26, 330); add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(11, 9, 9, 12), std({ color: 0x1a2530, roughness: 0.1, metalness: 0.6 })); cab.position.set(-250, 56, 330); add(cab);
    // jet bridges + parked aircraft on the apron
    for (let i = 0; i < 5; i++) this.addParkedAirliner(-320 + i * 160, 380, Math.PI);
    // localizer antenna array beyond the 09 end, glideslope mast near the TDZ
    const antMat = std({ color: 0xdddddd, roughness: 0.6 });
    for (let i = -7; i <= 7; i++) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 2.5), antMat); a.position.set(-halfL - 300, 1.5, i * 3.2); add(a); }
    const gsMast = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), antMat); gsMast.position.set(halfL - 320, 6, -120); add(gsMast);
    // wind sock
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), antMat); pole.position.set(halfL - 500, 4, -90); add(pole);
    this.sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 8, 1, true), std({ color: 0xff6a00, side: THREE.DoubleSide }));
    this.sock.position.set(halfL - 500, 8, -90); add(this.sock);
    // approach light towers (the ALS is on frangible masts over the grass) — thin posts
    const postMat = std({ color: 0x999999, roughness: 0.6 });
    for (let d = 30; d <= 900; d += 30) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 4.4), postMat); p.position.set(RUNWAY.thresholdX + d, 0.35, 0); add(p); }
    // perimeter road
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6000, 8), std({ color: 0x555555, roughness: 1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 620); add(road, false);
    // forests + villages around (instanced trees)
    this.buildVegetation();
    addWater(this.scene);
    addAirportDetail(this.scene, this.lowDetail);
    // a town under the approach (rows of small buildings) for scale & lights
    this.buildTown();
  }

  addParkedAirliner(x, z, yaw) {
    const g = new THREE.Group();
    const white = this.airlinerWhite || (this.airlinerWhite = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.35, metalness: 0.1 }));
    const blue = this.airlinerBlue || (this.airlinerBlue = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.35 }));
    const grey = this.airlinerGrey || (this.airlinerGrey = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.7 }));
    const part = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const fus = part(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 38, 16), white)); fus.rotation.x = Math.PI / 2; fus.position.y = 3.2;
    const wing = part(new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 5), white)); wing.position.set(0, 2.6, 1);
    const tail = part(new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), blue)); tail.position.set(0, 7, 16);
    const htail = part(new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3), white)); htail.position.set(0, 4, 17);
    for (const sx of [-1, 1]) { const e = part(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 12), grey)); e.rotation.x = Math.PI / 2; e.position.set(sx * 5.7, 1.8, -1); }
    g.position.set(x, 0, z); g.rotation.y = yaw; this.scene.add(g);
  }

  buildVegetation() {
    const tex = makeTreeTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
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
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x74685a, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const count = this.lowDetail ? 300 : 900;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4), roofMat, count);
    const colors = [0xd1c9b9, 0xb5b5a8, 0xc0b4a0, 0xa4a89c, 0xcbc9c0];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    // a town ~6–9 km east of the threshold, south of the extended centreline, plus a suburb north
    for (let i = 0; i < count; i++) {
      const east = i < count * 0.7;
      const col = i % 28, row = Math.floor(i / 28);
      const cx = (east ? 7200 : -6500) + col * 55 + (rng() - 0.5) * 12;
      const cz = (east ? 1500 : -2800) + row * 65 + (rng() - 0.5) * 12;
      const h = 5 + rng() * (rng() < 0.08 ? 26 : 7);
      const w = 11 + rng() * 12, d = 12 + rng() * 14;
      p.set(cx, h / 2, cz); s.set(w, h, d); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(colors[Math.floor(rng() * colors.length)]));
      const roofH = Math.min(w, d) * 0.28;
      p.y = h + roofH / 2; s.set(w + 1.2, roofH, d + 1.2); m.compose(p, q, s); roofs.setMatrixAt(i, m);
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
    this.scene.add(roofs);
    this.townMat = mat;
    this.buildingMats.push(mat);
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
    if (this.quality === 'high') this.cumulus = new Cumulus(this.scene, this.atmo);
    // overcast deck
    const ovTex = makeOvercastTexture();
    ovTex.repeat.set(30, 30);
    this.overcast = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshBasicMaterial({ map: ovTex, side: THREE.DoubleSide, transparent: true, opacity: 0.97, fog: true, depthWrite: false }));
    this.overcast.rotation.x = Math.PI / 2;
    this.overcast.visible = false;
    this.overcast.renderOrder = 2;
    this.scene.add(this.overcast);
    // the top of the deck, seen when flying above it: sunlit, bright
    const ovTopTex = makeOvercastTexture(true); ovTopTex.repeat.set(30, 30);
    this.overcastTop = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshBasicMaterial({ map: ovTopTex, side: THREE.DoubleSide, fog: true }));
    this.overcastTop.rotation.x = Math.PI / 2;
    this.overcastTop.visible = false;
    this.overcastTop.renderOrder = 2;
    this.scene.add(this.overcastTop);
    // rain: line segments in camera space
    const n = this.lowDetail ? 900 : 2600;
    const pos = new Float32Array(n * 2 * 3), anchor = new Float32Array(n * 2 * 3), seed = new Float32Array(n * 2);
    const box = new THREE.Vector3(44, 30, 40);
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * box.x, y = (rng() - 0.5) * box.y, z = (rng() - 0.5) * box.z;
      const sd = rng();
      pos.set([x, y, z, x, y - 0.22, z + 0.45], i * 6);   // ~0.5 m streak: what a drop covers in a 60 Hz frame
      anchor.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = sd; seed[i * 2 + 1] = sd;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('anchor', new THREE.BufferAttribute(anchor, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uBox: { value: box }, uVel: { value: new THREE.Vector3(0, -9, 3) }, uIntensity: { value: 0 }, uColor: { value: new THREE.Color(0.72, 0.78, 0.88) } },
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

  // ------------------------------------------------------------------ post-processing (high tier)
  buildPost() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // only really bright things glow: the sun, its glint on water and wet tarmac, lights at night
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ------------------------------------------------------------------ scenario
  applyScenario(scenario, night = false) {
    this.scenario = scenario;
    this.night = night;
    const tod = night ? 'night' : scenario.timeOfDay;
    this.tod = tod;
    const P = TOD[tod];
    const storm = scenario.id === 'storm';
    this.visibility = scenario.visibility;
    this.cloudBase = scenario.cloudBase * 0.3048;
    this.cloudTop = this.cloudBase + (scenario.cloudThickness || 99999) * 0.3048;
    this.hasDeck = scenario.cloudBase < 5000;

    // ---- the air: hazier with lower visibility
    const sunDir = new THREE.Vector3(...P.sun).normalize();
    const turbidity = P.turbidity + clamp((40000 - scenario.visibility) / 8000, 0, 3);
    const nightZ = sceneColor(P.nightZenith || 0x000000), nightH = sceneColor(P.nightHorizon || 0x000000);
    // the grey of the cloud deck's underside, and of the murk inside cloud or rain
    const ocDisplay = storm ? (tod === 'night' ? 0x0a0b0f : 0x5d6168) : (tod === 'night' ? 0x141821 : (tod === 'dusk' ? 0x6a6068 : 0xa9afb7));
    this.overcastColor = sceneColor(ocDisplay);
    this.atmo.set({ sunDir, turbidity, rayleigh: P.rayleigh, scale: P.scale, nightZenith: nightZ, nightHorizon: nightH, overcast: 0, overcastColor: this.overcastColor, sunE: tod === 'night' ? 0 : undefined });
    // overcast: the whole sky in a storm; under a cloud deck (applied with the altitude in update())
    this.baseOvercast = storm ? 1 : 0;
    this.deckOvercast = this.hasDeck ? 0.85 : 0;

    // ---- sunlight (moonlight at night): through the air, a little whiter than the model says
    const sl = this.atmo.sunlight();
    const sunColor = new THREE.Color(1, 1, 1).lerp(sl.color, 1 - P.sunWhite);
    let sunI = P.sunIrr * sl.strength;
    const lightDir = sunDir.clone();
    if (tod === 'night') { lightDir.set(...P.moon).normalize(); sunColor.set(0x9fb4d8); sunI = 0.35; }
    this.sunColor = sunColor; this.sunI = sunI; this.lightDir = lightDir;
    this.sun.color.copy(sunColor);
    this.cockpitSun.color.copy(sunColor);
    this.placeSunShadow(lightDir);

    // ---- the sky dome
    const u = this.skyMat.uniforms;
    u.uSunDisc.value.copy(sl.color).multiplyScalar(tod === 'night' ? 0 : 60 * sl.strength);
    u.uStars.value = storm ? 0 : P.stars;
    u.uHorizonFog.value = Math.max(0.8, Math.min(25, scenario.visibility / 1500));
    this.envSkyMat.uniforms.uHorizonFog.value = u.uHorizonFog.value;

    // ---- the environment (sky light and reflections): clear above a deck, overcast below it
    const groundAlbedo = new THREE.Color(0.09, 0.12, 0.06);
    const envFor = (overcast) => {
      this.atmo.set({ overcast });
      const sky = this.atmo.skyLight();
      const sunOnGround = Math.max(lightDir.y, 0) * sunI * (1 - 0.9 * overcast) / Math.PI;
      this.envSkyMat.uniforms.uGround.value.copy(groundAlbedo).multiply(new THREE.Color(sunColor).multiplyScalar(sunOnGround).add(sky));
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1000, { size: this.quality === 'high' ? 256 : 128 });
      return rt;
    };
    for (const k of ['above', 'below']) if (this.env[k]) { this.env[k].dispose(); this.env[k] = null; }
    if (storm) this.env.below = envFor(1);
    else {
      this.env.above = envFor(0);
      if (this.hasDeck) this.env.below = envFor(this.deckOvercast);
    }
    this.atmo.set({ overcast: this.baseOvercast });
    this.envKey = null;
    this.scene.environment = this.cockpitScene.environment = (this.env.above || this.env.below).texture;
    this.cockpitScene.environmentIntensity = P.cockpitEnv;
    this.cockpitFill.intensity = P.fill * (storm ? 0.6 : 1);

    // ---- surfaces
    this.groundUniforms.uWet.value = scenario.wet ? 1 : 0;
    // the pavement textures were painted light: under full sunlight and sky light asphalt is dark
    this.runwayMat.color.set(tod === 'night' ? 0x777777 : 0xc4c4c4);
    for (const m of this.texturedPavement) m.color.set(tod === 'night' ? 0x777777 : 0xc4c4c4);
    this.runwayMat.roughness = scenario.wet ? 0.3 : 0.95;
    for (const m of this.pavementMats) m.roughness = scenario.wet ? 0.35 : 1;
    this.lights.material.uniforms.uIntensity.value = P.lights;
    this.daylight = (tod === 'day' ? 1 : tod === 'dusk' ? 0.35 : 0) * (storm ? 0.5 : 1);
    // clouds
    this.overcast.visible = this.hasDeck;
    this.overcast.position.y = this.cloudBase;
    this.overcast.material.opacity = storm ? 0.98 : 0.9;
    this.overcast.material.color.set(storm ? (tod === 'night' ? 0x101216 : 0x55595f) : (tod === 'night' ? 0x1a1e26 : 0x9aa0a8));
    this.overcastTop.visible = this.hasDeck && this.cloudTop < 6000;
    this.overcastTop.position.y = this.cloudTop;
    this.overcastTop.material.color.set(tod === 'night' ? 0x262a33 : (tod === 'dusk' ? 0xd8b090 : 0xffffff));
    const cumulus = scenario.id !== 'storm' && scenario.id !== 'clear';
    this.cloudGroup.visible = cumulus || scenario.id === 'clear';
    if (this.cumulus) {
      this.cumulus.configure(scenario, tod === 'night', lightDir, sunColor);
      if (scenario.id === 'clear') this.cloudGroup.visible = false;
    }
    this.cloudGroup.children.forEach((sp) => {
      sp.position.y = (scenario.id === 'clear' ? 1600 : this.cloudBase - 150) + (this.rng() - 0.5) * 200;
      sp.material.opacity = scenario.id === 'clear' ? 0.55 : 0.9;
      // scud under a deck is in its shade: grey; fair-weather cumulus are sunlit
      sp.material.color.set(tod === 'night' ? 0x223 : (tod === 'dusk' ? 0xa08070 : (this.hasDeck ? 0x8e949c : 0xffffff)));
    });
    // rain
    this.rainMat.uniforms.uIntensity.value = scenario.rain;
    this.rainMat.uniforms.uColor.value.set(tod === 'night' ? 0x5a6070 : 0xb8c4d8);
    this.rain.visible = scenario.rain > 0;
    this.lightningEnabled = !!scenario.lightning;
    // building windows glow at night
    this.buildingTex.dispose();
    this.buildingTex = makeBuildingTexture(tod !== 'day');
    this.buildingTex.repeat.set(4, 1);
    for (const m of this.buildingMats) {
      m.map = this.buildingTex;
      m.emissiveMap = tod !== 'day' ? this.buildingTex : null;
      m.emissive.set(tod !== 'day' ? 0xffffff : 0x000000);
      m.emissiveIntensity = tod === 'night' ? 0.55 : 0.25;
      m.needsUpdate = true;
    }
    // Day and night share surface albedo; illumination supplies the time of day.
    this.groundMat.map = this.groundTex;
    // the airport's shadows are drawn once for this sun
    if (this.sun.castShadow) this.sun.shadow.needsUpdate = true;
  }

  /** Aim the sun and fit its static shadow map tightly around the airport. */
  placeSunShadow(dir) {
    const target = new THREE.Vector3(0, 0, 200);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(dir, 4000);
    this.sun.updateMatrixWorld(); this.sun.target.updateMatrixWorld();
    if (!this.sun.castShadow) return;
    const cam = this.sun.shadow.camera;
    cam.position.copy(this.sun.position); cam.lookAt(target); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const halfL = RUNWAY.length / 2 + 350;
    for (const x of [-halfL, halfL]) for (const y of [0, 70]) for (const z of [-200, 660]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    Object.assign(cam, { left: x0, right: x1, bottom: y0, top: y1, near: Math.max(1, -z1 - 50), far: -z0 + 50 });
    cam.updateProjectionMatrix();
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
    let inCloudF = 0, under = this.baseOvercast;
    if (this.hasDeck) {
      inCloudF = Math.max(0, Math.min(1, (alt - this.cloudBase) / 60, (this.cloudTop - alt) / 60));
      vis = vis * (1 - inCloudF) + 120 * inCloudF;
      // inside the deck neither sheet is drawn (a sheet seen edge-on would leave a false horizon line)
      this.overcast.visible = alt < this.cloudTop - 20 && inCloudF < 0.97;
      this.overcastTop.visible = this.cloudTop < 6000 && alt > this.cloudBase + 20 && inCloudF < 0.97;
      // how far down through the deck: 0 at its top (clear sky, sunshine), 1 at its base (overcast)
      under = Math.max(under, clamp((this.cloudTop - alt) / Math.max(this.cloudTop - this.cloudBase, 1), 0, 1));
    }
    const density = 1.73 / Math.max(vis, 50);
    this.scene.fog.density = density;
    if (this.cumulus) this.cumulus.update(this.time, density);
    // in fog or heavy rain the sky and the ground merge into the same murk: no horizon line
    const murk = vis < 1500 ? 1 : (vis < 5000 ? (5000 - vis) / 3500 : 0);
    const au = this.atmo.uniforms;
    au.skyOvercast.value = Math.max(this.baseOvercast, under * this.deckOvercast, inCloudF, murk);
    // the sun is hidden by the deck: its light and shadows fade on the way down through it
    const sunF = 1 - 0.92 * Math.max(under, inCloudF);
    this.sun.intensity = this.sunI * sunF;
    this.cockpitSun.intensity = this.sunI * sunF * (this.cockpitSunScale || 0.6);
    if (this.sun.castShadow) { this.sun.shadow.intensity = sunF; this.cockpitSun.shadow.intensity = sunF; }
    const envKey = this.env.above && (!this.env.below || under < 0.5) ? 'above' : 'below';
    if (envKey !== this.envKey) {
      this.envKey = envKey;
      this.scene.environment = this.env[envKey].texture;
      this.cockpitScene.environment = this.env[envKey].texture;
    }
    // lightning lights up the murk
    au.skyFlash.value.setRGB(0, 0, 0);
    if (this.lightningFlash > 0) {
      au.skyFlash.value.setScalar(Math.min(1, this.lightningFlash * 0.7) * 0.8);
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 6);
    }
    if (this.lightningEnabled) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) { this.lightningTimer = 6 + this.rng() * 14; this.lightningFlash = 1; this.onLightning && this.onLightning(); }
    }
    // the sky dome is centred on the camera so it can never be clipped by the far plane
    this.sky.position.copy(eye);
    // the flight deck's sun follows the aircraft
    this.cockpitSunTarget.position.copy(eye);
    this.cockpitSun.position.copy(eye).addScaledVector(this.lightDir, 12);
    this.cockpitSunTarget.updateMatrixWorld();
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
    if (this.composer) this.composer.render();
    else r.render(this.scene, this.camera);
    // the flight deck on top, straight to the screen (its displays keep their exact colours);
    // the head-up view has none (drawCockpit false)
    if (this.drawCockpit === false) return;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.cockpitScene, this.camera);
    r.autoClear = true;
  }
}
