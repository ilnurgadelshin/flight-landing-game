// Bounded, ray-marched cumulus volumes for the desktop tier. The low tier keeps
// the sprite clouds. Density is sampled in 3D, so these hold their shape as the
// aircraft moves past or above them; the dark bases come from self-shadowing.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { SKY_GLSL } from './sky.js';

const vertexShader = /* glsl */`
  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vLocal = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const fragmentShader = /* glsl */`
  varying vec3 vLocal;
  uniform vec3 uEye;
  uniform vec3 uScale;
  uniform vec3 uSun;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform float uSeed;
  uniform float uFog;
  ${SKY_GLSL}
  #include <logdepthbuf_pars_fragment>
  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.17, 0.31, 0.47)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float density(vec3 p) {
    float shape = max(1.0-length((p-vec3(-0.12,-0.03,0.0))*vec3(3.4,3.0,3.7)),
                  max(1.0-length((p-vec3(0.16,0.02,0.03))*vec3(4.6,3.3,4.3)),
                      1.0-length((p-vec3(0.0,0.16,-0.04))*vec3(4.4,4.0,4.5))));
    vec3 n = p * 10.0 + uSeed;
    float erosion = noise3(n)*0.24 + noise3(n*2.07)*0.13 + noise3(n*4.11)*0.065;
    return max(0.0, shape - erosion - 0.035) * smoothstep(-0.30,-0.17,p.y) * 4.0;
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 rd = normalize(vLocal-uEye);
    vec3 inv = 1.0 / (rd + vec3(0.000001));
    vec3 a = (-0.5-uEye)*inv, b = (0.5-uEye)*inv;
    vec3 lo = min(a,b), hi = max(a,b);
    float enter = max(max(lo.x,lo.y),lo.z), leave = min(min(hi.x,hi.y),hi.z);
    enter = max(enter,0.0);
    if (leave <= enter) discard;
    float stepSize = (leave-enter)/36.0;
    float jitter = fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
    float trans = 1.0; vec3 light = vec3(0.0);
    for (int i=0;i<36;i++) {
      vec3 p = uEye + rd*(enter + (float(i)+jitter)*stepSize);
      float d = density(p);
      if (d > 0.005) {
        float shadow = density(p+uSun*0.065)*0.65 + density(p+uSun*0.16)*0.35;
        float sun = exp(-shadow*2.4);
        float alpha = 1.0-exp(-d*stepSize*14.0);
        vec3 col = mix(uShade, uLit, sun);
        light += trans*alpha*col; trans *= 1.0-alpha;
        if (trans < 0.025) break;
      }
    }
    float alpha = 1.0-trans;
    if (alpha < 0.01) discard;
    vec3 worldRay = normalize(rd*uScale);
    float distanceM = length((rd*enter)*uScale);
    float fog = 1.0-exp(-uFog*uFog*distanceM*distanceM);
    gl_FragColor = vec4(mix(light/alpha, hazeColor(worldRay),fog),alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Cumulus {
  constructor(scene, atmosphere) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, side: THREE.BackSide, transparent: true, depthWrite: false,
      uniforms: { ...atmosphere.uniforms, uEye: { value: new THREE.Vector3() }, uScale: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3() }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uSeed: { value: 0 }, uFog: { value: 0 } },
    });
    const rng = makeRng(481), geo = new THREE.BoxGeometry(1,1,1);
    for (let i=0;i<26;i++) {
      const mesh = new THREE.Mesh(geo, this.material);
      const width = 1400 + rng()*1900;
      mesh.scale.set(width, 550+rng()*500, width*(0.65+rng()*0.4));
      mesh.position.set(-15000+rng()*65000, 2000+rng()*350, (rng()-0.5)*35000);
      mesh.userData.x = mesh.position.x; mesh.userData.seed = rng()*100;
      mesh.userData.height = rng()*200;
      // A few nearby fair-weather towers give the final approach a readable depth scale.
      if (i < 6) {
        mesh.position.set([-5000,-13000,3000,-8000,16000,25000][i], 2000, [-5500,3000,4500,9000,-4000,7000][i]);
        mesh.scale.set(3800+i*170, 1050+(i%3)*130, 2600);
        mesh.userData.x = mesh.position.x;
      }
      mesh.onBeforeRender = (renderer, world, camera) => {
        const u = this.material.uniforms;
        camera.getWorldPosition(u.uEye.value); mesh.worldToLocal(u.uEye.value);
        u.uScale.value.copy(mesh.scale); u.uSeed.value = mesh.userData.seed;
        this.material.uniformsNeedUpdate = true;
      };
      this.group.add(mesh);
    }
  }
  configure(scenario, night, lightDir, color) {
    this.group.visible = scenario.id === 'clear';
    const u = this.material.uniforms;
    u.uSun.value.copy(lightDir).normalize();
    u.uLit.value.copy(color).multiplyScalar(night ? 0.11 : 2.6);
    u.uShade.value.set(night ? 0x151e30 : 0x738ba2);
    for (const m of this.group.children) m.position.y = 2000 + m.userData.height;
  }
  update(time, fog) {
    this.material.uniforms.uFog.value = fog;
    if (this.group.visible) for (const m of this.group.children) m.position.x = m.userData.x + time*2;
  }
}
