// The atmosphere. One scattering model of the daytime sky (Preetham, Shirley & Smits 1999, the
// formulation of three.js' Sky object) drives four things, so they always agree with each other:
//   - the sky dome;
//   - the haze between the eye and anything far away (aerial perspective): distant terrain fades
//     into the colour of the sky at the horizon in that direction, warm towards a low sun, blue
//     away from it;
//   - the colour of the sunlight (the sun seen through the air: yellow-white high, orange low);
//   - the light the sky itself sheds on the ground (its irradiance).
// At night the model is replaced by a dark gradient; under an overcast the sky and the haze go
// to a flat cloud grey.
//
// The fog of every three.js material is re-plumbed for this (installHaze): it is mixed in linear
// light before tone mapping (so it is the same whether the frame goes straight to the screen or
// through the post-processing chain), and its colour comes from the model per view direction.
import * as THREE from 'three';

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734, STEEPNESS = 1.5, EE = 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** GLSL shared by the sky dome and every fogged material. */
export const SKY_GLSL = /* glsl */`
  uniform vec3 skySunDir;
  uniform vec3 skyBetaR;
  uniform vec3 skyBetaM;
  uniform float skySunE;
  uniform float skyMieG;
  uniform float skyFade;
  uniform float skyScale;
  uniform vec3 skyNightZenith;
  uniform vec3 skyNightHorizon;
  uniform float skyOvercast;
  uniform vec3 skyOvercastColor;
  uniform vec3 skyFlash;
  float skyRPhase(float c) { return 0.05968310365946075 * (1.0 + c * c); }
  float skyHG(float c, float g) { float g2 = g * g; return 0.07957747154594767 * (1.0 - g2) / pow(max(1.0 - 2.0 * g * c + g2, 1e-4), 1.5); }
  // light scattered towards the eye along a ray leaving in direction dir (unit), from below the
  // horizon: the horizon value in that direction (what the far end of a long ray through haze shows)
  vec3 skyScatter(vec3 dir) {
    if (skySunE <= 0.0) return vec3(0.0);
    float za = acos(clamp(dir.y, 0.0, 1.0));
    float inv = 1.0 / (cos(za) + 0.15 * pow(93.885 - za * 57.29577951308232, -1.253));
    vec3 fex = exp(-(skyBetaR * 8.4e3 + skyBetaM * 1.25e3) * inv);
    float c = dot(dir, skySunDir);
    vec3 bt = skyBetaR * skyRPhase(c * 0.5 + 0.5) + skyBetaM * skyHG(c, skyMieG);
    vec3 r = skySunE * bt / (skyBetaR + skyBetaM);
    vec3 lin = pow(r * (1.0 - fex), vec3(1.5));
    lin *= mix(vec3(1.0), pow(r * fex, vec3(0.5)), skyFade);
    return (lin + 0.1 * fex) * 0.04 * skyScale;
  }
  vec3 skyNight(float h) { return mix(skyNightHorizon, skyNightZenith, pow(clamp(h, 0.0, 1.0), 0.32)); }
  // the colour distant air takes on when looking in direction dir (unit)
  vec3 hazeColor(vec3 dir) {
    vec3 c = skyScatter(dir) + skyNightHorizon;
    return mix(c, skyOvercastColor, skyOvercast) + skyFlash;
  }
`;

// the fog, as the first thing the tone-mapping chunk does (every material includes it right after
// its lighting); the stock fog chunk (after tone mapping and sRGB encoding) is emptied
const FOG_APPLY = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor( normalize( vFogDir ) ), fogFactor );
#endif
`;

let installed = null;
/**
 * Re-plumb three.js' fog for the atmosphere (once per page): linear, before tone mapping, coloured
 * by hazeColor() along the view direction. Every material gets the atmosphere's uniforms.
 */
export function installHaze(atmo) {
  if (installed) return;
  installed = atmo;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n  varying float vFogDepth;\n  varying vec3 vFogDir;\n#endif\n';
  C.fog_vertex = '#ifdef USE_FOG\n  vFogDepth = - mvPosition.z;\n  vFogDir = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif\n';
  C.fog_pars_fragment = '#ifdef USE_FOG\n  uniform vec3 fogColor;\n  varying float vFogDepth;\n  varying vec3 vFogDir;\n  #ifdef FOG_EXP2\n    uniform float fogDensity;\n  #else\n    uniform float fogNear;\n    uniform float fogFar;\n  #endif\n' + SKY_GLSL + '\n#endif\n';
  C.fog_fragment = '';
  C.tonemapping_fragment = FOG_APPLY + C.tonemapping_fragment;
  const shared = atmo.uniforms;
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (shader.uniforms) for (const k in shared) shader.uniforms[k] = shared[k];
  };
}

// ---------------------------------------------------------------- ACES (three.js' fit), for tuning
const A_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const A_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
const mul = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
/** three.js' ACESFilmicToneMapping of a linear colour [r,g,b] (display-linear result, 0..1). */
export function acesTonemap(c, exposure = 1) {
  const k = exposure / 0.6;
  const o = mul(A_OUT, mul(A_IN, [c[0] * k, c[1] * k, c[2] * k]).map(fit));
  return o.map((x) => clamp(x, 0, 1));
}
/**
 * The scene-linear colour that ACES tone-maps to the given display colour (a THREE.Color or hex,
 * given in sRGB like a CSS colour). Used to specify fog, cloud and night colours by how they look.
 */
export function sceneColor(display, exposure = 1, out = new THREE.Color()) {
  const t = new THREE.Color(display);            // THREE.Color stores linear (display-linear here)
  const target = [t.r, t.g, t.b].map((x) => clamp(x, 0.0005, 0.97));
  // damped fixed-point iteration (the curve's toe maps the darkest inputs to 0, so start above it)
  let x = target.map((v) => v + 0.005);
  for (let i = 0; i < 80; i++) {
    const y = acesTonemap(x, exposure);
    x = x.map((v, j) => clamp(v * Math.sqrt(target[j] / Math.max(y[j], 1e-4)), 1e-4, 64));
  }
  return out.setRGB(x[0], x[1], x[2]);
}

// ---------------------------------------------------------------- the model on the CPU
export class Atmosphere {
  constructor() {
    this.uniforms = {
      skySunDir: { value: new THREE.Vector3(0, 1, 0) },
      skyBetaR: { value: new THREE.Vector3() },
      skyBetaM: { value: new THREE.Vector3() },
      skySunE: { value: 0 },
      skyMieG: { value: 0.8 },
      skyFade: { value: 0 },
      skyScale: { value: 1 },
      skyNightZenith: { value: new THREE.Color(0, 0, 0) },
      skyNightHorizon: { value: new THREE.Color(0, 0, 0) },
      skyOvercast: { value: 0 },
      skyOvercastColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
      skyFlash: { value: new THREE.Color(0, 0, 0) },
    };
    this.set({});
  }

  /**
   * @param p { sunDir: Vector3 (towards the sun), turbidity, rayleigh, mie, mieG, scale,
   *            nightZenith, nightHorizon (Color, scene-linear), overcast 0..1, overcastColor }
   */
  set(p) {
    const u = this.uniforms;
    this.p = Object.assign({ sunDir: new THREE.Vector3(-0.5, 0.6, 0.4), turbidity: 3, rayleigh: 1.5, mie: 0.004, mieG: 0.8, scale: 1, sunE: undefined }, this.p || {}, p);
    const q = this.p;
    u.skySunDir.value.copy(q.sunDir).normalize();
    const s = u.skySunDir.value;
    u.skyBetaR.value.set(TOTAL_RAYLEIGH[0], TOTAL_RAYLEIGH[1], TOTAL_RAYLEIGH[2]).multiplyScalar(q.rayleigh);
    const mc = 0.434 * (0.2 * q.turbidity) * 10e-18 * q.mie;
    u.skyBetaM.value.set(MIE_CONST[0] * mc, MIE_CONST[1] * mc, MIE_CONST[2] * mc);
    u.skySunE.value = q.sunE !== undefined ? q.sunE : EE * Math.max(0, 1 - Math.exp(-(CUTOFF - Math.acos(clamp(s.y, -1, 1))) / STEEPNESS));
    u.skyMieG.value = q.mieG;
    u.skyFade.value = clamp(Math.pow(1 - s.y, 5), 0, 1);
    u.skyScale.value = q.scale;
    if (q.nightZenith) u.skyNightZenith.value.copy(q.nightZenith);
    if (q.nightHorizon) u.skyNightHorizon.value.copy(q.nightHorizon);
    if (q.overcast !== undefined) u.skyOvercast.value = q.overcast;
    if (q.overcastColor) u.skyOvercastColor.value.copy(q.overcastColor);
    return this;
  }

  /** skyScatter() of the shader. dir: unit [x,y,z]. Returns [r,g,b] scene-linear. */
  scatter(dir) {
    const u = this.uniforms;
    if (u.skySunE.value <= 0) return [0, 0, 0];
    const bR = u.skyBetaR.value, bM = u.skyBetaM.value, s = u.skySunDir.value, g = u.skyMieG.value;
    const za = Math.acos(clamp(dir[1], 0, 1));
    const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - za * 57.29577951308232, -1.253));
    const c = dir[0] * s.x + dir[1] * s.y + dir[2] * s.z;
    const rp = 0.05968310365946075 * (1 + (c * 0.5 + 0.5) ** 2);
    const hg = 0.07957747154594767 * (1 - g * g) / Math.pow(Math.max(1 - 2 * g * c + g * g, 1e-4), 1.5);
    const out = [];
    for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
      const fex = Math.exp(-(bR[k] * 8.4e3 + bM[k] * 1.25e3) * inv);
      const r = u.skySunE.value * (bR[k] * rp + bM[k] * hg) / (bR[k] + bM[k]);
      let lin = Math.pow(r * (1 - fex), 1.5);
      lin *= 1 + (Math.pow(r * fex, 0.5) - 1) * u.skyFade.value;
      out[i] = (lin + 0.1 * fex) * 0.04 * u.skyScale.value;
    }
    return out;
  }

  /** The sky's radiance in direction dir (unit [x,y,z]) without the sun disc, as the dome shows it. */
  sky(dir) {
    const u = this.uniforms, a = this.scatter(dir);
    const h = clamp(dir[1], 0, 1), t = Math.pow(h, 0.32);
    const nz = u.skyNightZenith.value, nh = u.skyNightHorizon.value, oc = u.skyOvercastColor.value, o = u.skyOvercast.value;
    const n = [nh.r + (nz.r - nh.r) * t, nh.g + (nz.g - nh.g) * t, nh.b + (nz.b - nh.b) * t];
    return [0, 1, 2].map((i) => (a[i] + n[i]) * (1 - o) + [oc.r, oc.g, oc.b][i] * o);
  }

  /** Transmittance of the air towards the sun: the sunlight's colour (Color, max component 1) and strength (0..1). */
  sunlight(out = new THREE.Color()) {
    const u = this.uniforms, s = u.skySunDir.value, bR = u.skyBetaR.value, bM = u.skyBetaM.value;
    if (s.y <= -0.02) return { color: out.setRGB(0, 0, 0), strength: 0 };
    const za = Math.acos(clamp(s.y, 0, 1));
    const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - za * 57.29577951308232, -1.253));
    const f = ['x', 'y', 'z'].map((k) => Math.exp(-(bR[k] * 8.4e3 + bM[k] * 1.25e3) * inv));
    const m = Math.max(...f, 1e-6);
    out.setRGB(f[0] / m, f[1] / m, f[2] / m);
    return { color: out, strength: m * clamp(s.y / 0.05 + 0.4, 0, 1) };
  }

  /** The sky's irradiance on a surface facing up, divided by π (so albedo × this = its radiance). */
  skyLight(out = new THREE.Color()) {
    let r = 0, g = 0, b = 0, w = 0;
    const N = 24, M = 8;
    for (let j = 0; j < M; j++) {
      const el = (j + 0.5) / M * Math.PI / 2, ce = Math.cos(el), se = Math.sin(el);
      for (let i = 0; i < N; i++) {
        const az = (i + 0.5) / N * Math.PI * 2;
        const c = this.sky([ce * Math.cos(az), se, ce * Math.sin(az)]);
        const wt = se * ce;          // cos(θ) × solid-angle element (sin of the polar angle)
        r += c[0] * wt; g += c[1] * wt; b += c[2] * wt; w += wt;
      }
    }
    return out.setRGB(r / w, g / w, b / w);
  }
}
