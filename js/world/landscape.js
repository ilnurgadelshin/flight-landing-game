// A continuous photographed region, with nested resolution around the airfield.
// All imagery is bundled: flying never calls a map service or needs an API key.
import * as THREE from 'three';
import { TERRAIN } from '../physics/terrain.js';
import { makeGroundTexture } from './textures.js';
import { addWoodland } from './woodland.js';

const source = (name) => new URL(`../../assets/scenery/${name}.jpg`, import.meta.url).href;

export function buildLandscape(world) {
  const low = world.lowDetail || world.quality === 'low';
  const fallback = makeGroundTexture(world.maxAniso);
  const uniforms = world.groundUniforms = {
    uRegion: { value: fallback }, uApproach: { value: fallback }, uAirport: { value: fallback }, uFinal: {value:fallback},
    uGrass: { value: fallback }, uReady: { value: 0 }, uWet: { value: 0 }, uAlbedo: { value: 0.82 },
  };
  world.groundTex = fallback;
  const material = world.groundMat = new THREE.MeshStandardMaterial({ map: fallback, roughness: 1 });
  const base = THREE.Material.prototype.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGroundXZ;
      uniform sampler2D uRegion, uApproach, uAirport, uFinal, uGrass;
      uniform float uReady, uWet, uAlbedo;
      vec2 aerialUV(vec2 center, float span) { return (vGroundXZ-center)*vec2(1.0,-1.0)/span+0.5; }
      float coverage(vec2 uv) { return 1.0-smoothstep(0.43,0.49,max(abs(uv.x-0.5),abs(uv.y-0.5))); }
    `).replace('#include <map_fragment>', `
      vec2 region = aerialUV(vec2(16000.0,0.0),80000.0);
      vec2 approach = aerialUV(vec2(5000.0,0.0),24000.0);
      vec2 airportUV = aerialUV(vec2(0.0),8000.0);
      vec2 finalUV = aerialUV(vec2(6000.0,0.0),8000.0);
      vec3 land = texture2D(uRegion,region).rgb;
      land = mix(land,texture2D(uApproach,approach).rgb,coverage(approach));
      land = mix(land,texture2D(uFinal,finalUV).rgb,coverage(finalUV));
      land = mix(land,texture2D(uAirport,airportUV).rgb,coverage(airportUV));
      // Uneven rough grass margins blend the maintained airfield into real fields.
      float margin=sin(vGroundXZ.x*.024)*8.0+sin(vGroundXZ.y*.035)*6.0;
      float airfield = (1.0-smoothstep(1590.0,1840.0,abs(vGroundXZ.x)+margin)) *
                      (1.0-smoothstep(330.0,530.0,abs(vGroundXZ.y-120.0)+margin));
      vec3 grass = texture2D(uGrass,vGroundXZ/18.0).rgb;
      // Ground detail remains visible on short final; mowing is very subtle at distance.
      float nearGround = 1.0-smoothstep(500.0,2200.0,length(vViewPosition));
      vec3 turf = mix(vec3(0.13,0.155,0.065),grass*vec3(0.75,0.9,0.65),nearGround*0.72);
      turf *= 0.97+0.03*sin(vGroundXZ.y*0.21);
      land = mix(land,turf,airfield*uReady);
      diffuseColor.rgb *= land * uAlbedo * mix(1.0,0.65,uWet);
    `);
  };
  // A 62.5 m grid near the airport and 250 m grid farther away follow the SAME
  // height query as the wheels. Patches allow countryside behind the aircraft to be culled.
  const terrain = world.ground = new THREE.Group();
  terrain.name = 'Photographic landscape';
  for (let x = -60000; x < 100000; x += 10000) for (let z = -55000; z < 55000; z += 10000) {
    const nearby=x>=-10000&&x<20000&&z>=-15000&&z<5000;
    const segments=nearby?(low?64:160):(low?16:40);
    const geometry = new THREE.PlaneGeometry(10000, 10000, segments, segments);
    geometry.rotateX(-Math.PI/2); geometry.translate(x+5000,0,z+5000);
    const p = geometry.attributes.position;
    for (let i=0;i<p.count;i++) p.setY(i,TERRAIN.heightAt(p.getX(i),p.getZ(i))-0.05);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry,material); mesh.receiveShadow=true; terrain.add(mesh);
  }
  world.scene.add(terrain);
  const loader = new THREE.TextureLoader();
  const load = (name, color = true, repeat = false) => loader.loadAsync(source(name)).then(tex => {
    if (color) tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=world.maxAniso;
    if(repeat) tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    return tex;
  });
  const suffix=low?'-low':'';
  const ready=Promise.all(['region','approach','airport','final-approach'].map(n=>load(n+suffix))).then(async([region,approach,airport,final])=>{
    uniforms.uRegion.value=region;uniforms.uApproach.value=approach;uniforms.uAirport.value=airport;
    uniforms.uFinal.value=final;
    uniforms.uReady.value=1;
    world.landscapeImages=[region,approach,airport,final];
    await addWoodland(world,airport.image,final.image);
  });
  const grass=load('grass-color',true,true).then(t=>uniforms.uGrass.value=t);
  world.assetJobs.push(ready,grass,load('grass-normal',false,true).then(tex=>{
    tex.repeat.set(10000/18,10000/18);material.normalMap=tex;material.normalScale.set(.22,.22);material.needsUpdate=true;
  }));
  // One surface set is shared by all pavement. World-space mapping keeps the size of
  // aggregate constant on a runway, a connector, and the apron.
  world.assetJobs.push(Promise.all([load('asphalt-color',true,true),load('asphalt-normal',false,true),load('asphalt-rough',false,true)])
    .then(([color,normal,rough])=>{
      world.pavementTextures={color,normal,rough};
      for(const mat of [world.runwayMat,...world.pavementMats]) detailPavement(mat,{color,normal,rough});
    }));
}

function detailPavement(mat, textures) {
  mat.normalMap=textures.normal;mat.normalScale.set(.3,.3);
  const previous=mat.onBeforeCompile;
  mat.onBeforeCompile=(sh,r)=>{
    previous.call(mat,sh,r);
    Object.assign(sh.uniforms,{uAsphalt:{value:textures.color},uAsphaltRough:{value:textures.rough}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vPavement;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvPavement=(modelMatrix*vec4(position,1.0)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vPavement; uniform sampler2D uAsphalt, uAsphaltRough;')
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec3 aggregate=texture2D(uAsphalt,vPavement/7.0).rgb;
        diffuseColor.rgb*=mix(vec3(0.65),vec3(1.18),clamp(aggregate*1.8,0.0,1.0));
        vec2 slab=floor(vPavement/6.0);
        float variation=fract(sin(dot(slab,vec2(12.9898,78.233)))*43758.5453);
        // Concrete apron slabs and expansion joints; retain the painted stand lines above.
        float apron=step(abs(vPavement.x),699.0)*step(151.0,vPavement.y)*step(vPavement.y,419.0);
        vec2 seam=abs(fract(vPavement/6.0)-.5);
        float joint=smoothstep(.485,.497,max(seam.x,seam.y));
        diffuseColor.rgb*=mix(1.0,(.96+variation*.08)*(1.0-joint*.15),apron);`)
      .replace('#include <normal_fragment_begin>', '#define vNormalMapUv (vPavement/7.0)\n#include <normal_fragment_begin>')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#undef vNormalMapUv')
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor*=0.78+0.22*texture2D(uAsphaltRough,vPavement/7.0).g;`);
  };
  mat.needsUpdate=true;
}
