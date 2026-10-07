// A continuous photographed region, with nested resolution around the airfield.
// All imagery is bundled: flying never calls a map service or needs an API key.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRAIN } from '../physics/terrain.js';
import { makeGroundTexture } from './textures.js';
import { addWoodland } from './woodland.js';
import { addApproachBuildings } from './approach-buildings.js';
import { addApproachRoads } from './approach-roads.js';
import { GROUND_DETAIL_GLSL, groundDetailUniforms, loadGroundDetail } from './ground-detail.js';
import {CORRIDOR_GLSL,corridorUniforms,loadApproachCorridor} from './approach-corridor.js';

const source = (name) => new URL(`../../assets/scenery/${name}.${/^(region|approach|airport|final-approach)(-low|-preview)?$/.test(name)?'webp':'jpg'}`, import.meta.url).href;

export function buildLandscape(world) {
  const low = world.lowDetail || world.quality === 'low';
  world.groundLowDetail=low;
  const fallback = makeGroundTexture(world.maxAniso);
  const uniforms = world.groundUniforms = {
    uRegion: { value: fallback }, uApproach: { value: fallback }, uAirport: { value: fallback }, uFinal: {value:fallback},
    uGrass: { value: fallback }, uGrassRough: {value:fallback}, uSurfaceDetail:{value:1},
    uReady: { value: 0 }, uWet: { value: 0 }, uAlbedo: { value: 0.82 },
    ...groundDetailUniforms(fallback),
    ...corridorUniforms(fallback),
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
      uniform sampler2D uRegion, uApproach, uAirport, uFinal, uGrass, uGrassRough;
      uniform float uReady, uWet, uAlbedo, uSurfaceDetail;
      ${GROUND_DETAIL_GLSL}
      ${CORRIDOR_GLSL}
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
      land=detailTile(land,uDetail0,uDetailRect0,vGroundXZ);
      land=detailTile(land,uDetail1,uDetailRect1,vGroundXZ);
      land=detailTile(land,uDetail2,uDetailRect2,vGroundXZ);
      land=detailTile(land,uDetail3,uDetailRect3,vGroundXZ);
      // Uneven rough grass margins blend the maintained airfield into real fields.
      float margin=sin(vGroundXZ.x*.024)*8.0+sin(vGroundXZ.y*.035)*6.0;
      float airfield = (1.0-smoothstep(1590.0,1840.0,abs(vGroundXZ.x)+margin)) *
                      (1.0-smoothstep(330.0,530.0,abs(vGroundXZ.y-120.0)+margin));
      vec3 grass = texture2D(uGrass,vGroundXZ/18.0).rgb;
      // Ground detail remains visible on short final; mowing is very subtle at distance.
      float nearGround = 1.0-smoothstep(500.0,2200.0,length(vViewPosition));
      // Keep the photo's field boundaries and colour; reconstruct the missing small
      // surface frequencies from the bundled scan, fading before they can shimmer.
      float green=max(0.0,land.g-(land.r+land.b)*.5);
      float vegetation=smoothstep(.006,.032,green);
      float soil=smoothstep(.008,.05,land.r-land.b)*(1.0-smoothstep(.0,.025,land.g-land.r));
      float surfaceMask=max(vegetation,soil*.65)*(1.0-smoothstep(.22,.40,max(land.r,max(land.g,land.b))));
      float closeSurface=(1.0-smoothstep(90.0,650.0,length(vViewPosition)))*uSurfaceDetail;
      vec3 fineGrass=texture2D(uGrass,vGroundXZ/6.0).rgb;
      vec3 rotatedGrass=texture2D(uGrass,mat2(.8,-.6,.6,.8)*vGroundXZ/10.7+vec2(.37,.61)).rgb;
      float grain=clamp(dot(mix(fineGrass,rotatedGrass,.38),vec3(.25,.5,.25))*7.5,.45,1.75);
      land*=mix(1.0,grain,surfaceMask*closeSurface*.82);
      // Reconstruct continuous field/forest surfaces, not the photographed crowns
      // and shadows. Keep parcel boundaries, with broad weathering and metre-scale grain.
      vec3 cover=corridorCover(vGroundXZ);
      float coverTotal=dot(cover,vec3(1.0));
      if(coverTotal>.001){
        float coverReach=1.0-smoothstep(1300.0,3200.0,length(vViewPosition));
        float fieldVariation=.96+.06*sin(vGroundXZ.x*.031+sin(vGroundXZ.y*.013))*.5+.04*cos(vGroundXZ.y*.047);
        float fieldGrain=mix(1.0,clamp(grain,.65,1.35),.65*(1.0-smoothstep(180.0,1200.0,length(vViewPosition))));
        vec3 meadow=vec3(.105,.145,.056)*fieldVariation*fieldGrain;
        vec3 stubble=vec3(.195,.153,.084)*fieldVariation*fieldGrain;
        // Subtle cultivation bands follow the long axis of the photographed fields.
        stubble*=1.0+.035*sin(dot(vGroundXZ,vec2(.34,-.21)));
        vec3 floorCover=vec3(.052,.070,.029)*fieldVariation*fieldGrain;
        vec3 reconstructed=(meadow*cover.r+stubble*cover.g+floorCover*cover.b)/max(.001,coverTotal);
        land=mix(land,reconstructed,coverTotal*coverReach*.86);
      }
      surfaceMask=max(surfaceMask,coverTotal);
      vec3 turf = mix(vec3(0.13,0.155,0.065),grass*vec3(0.75,0.9,0.65),nearGround*0.72);
      turf *= 0.97+0.03*sin(vGroundXZ.y*0.21);
      land = mix(land,turf,airfield*uReady);
      diffuseColor.rgb *= land * uAlbedo * mix(1.0,0.65,uWet);
    `).replace('#include <normal_fragment_begin>', '#define vNormalMapUv (vGroundXZ/6.0)\n#include <normal_fragment_begin>')
      .replace('#include <normal_fragment_maps>',`vec3 groundBaseNormal=normal;
        #include <normal_fragment_maps>
        #undef vNormalMapUv
        normal=normalize(mix(groundBaseNormal,normal,max(surfaceMask,airfield)*closeSurface));`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.72+.28*texture2D(uGrassRough,vGroundXZ/6.0).g,
          max(surfaceMask,airfield)*closeSurface);`);
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
    // Sample the same normal on both sides of a patch boundary. Deriving it
    // independently from differently sized edge triangles leaves visible seams.
    const normals=geometry.attributes.normal,probe=24;
    for(let i=0;i<p.count;i++){
      const px=p.getX(i),pz=p.getZ(i);
      const nx=TERRAIN.heightAt(px-probe,pz)-TERRAIN.heightAt(px+probe,pz);
      const nz=TERRAIN.heightAt(px,pz-probe)-TERRAIN.heightAt(px,pz+probe);
      const length=Math.hypot(nx,2*probe,nz);normals.setXYZ(i,nx/length,2*probe/length,nz/length);
    }
    const mesh = new THREE.Mesh(geometry,material); mesh.receiveShadow=true; terrain.add(mesh);
    // Neighbouring patches use different resolutions. Hide their T-junction
    // gaps with buried skirts; no extra ground layer covers the sampled surface.
    const edge=[];
    for(let i=0;i<segments;i++)edge.push(i);
    for(let i=0;i<segments;i++)edge.push(i*(segments+1)+segments);
    for(let i=segments;i>0;i--)edge.push(segments*(segments+1)+i);
    for(let i=segments;i>0;i--)edge.push(i*(segments+1));
    const skirtP=[],skirtN=[],indices=[];
    for(const i of edge){
      skirtP.push(p.getX(i),p.getY(i),p.getZ(i),p.getX(i),p.getY(i)-200,p.getZ(i));
      for(let j=0;j<2;j++)skirtN.push(normals.getX(i),normals.getY(i),normals.getZ(i));
    }
    for(let i=0;i<edge.length;i++){const a=i*2,b=((i+1)%edge.length)*2;indices.push(a,a+1,b,b,a+1,b+1);}
    const skirtGeo=new THREE.BufferGeometry();
    skirtGeo.setAttribute('position',new THREE.Float32BufferAttribute(skirtP,3));
    skirtGeo.setAttribute('normal',new THREE.Float32BufferAttribute(skirtN,3));
    skirtGeo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(edge.length*4),2));
    skirtGeo.setIndex(indices);
    mesh.geometry=mergeGeometries([geometry,skirtGeo]);geometry.dispose();skirtGeo.dispose();
  }
  world.scene.add(terrain);
  const loader = new THREE.TextureLoader();
  const load = (name, color = true, repeat = false) => loader.loadAsync(source(name)).then(tex => {
    if (color) tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=world.maxAniso;
    if(repeat) tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    return tex;
  });
  const photos=async suffix=>{
    const images=await Promise.all(['region','approach','airport','final-approach'].map(n=>load(n+suffix)));
    const previous=world.landscapeImages;
    [uniforms.uRegion.value,uniforms.uApproach.value,uniforms.uAirport.value,uniforms.uFinal.value]=images;
    uniforms.uReady.value=1;world.landscapeImages=images;
    previous?.forEach(t=>t.dispose());return images;
  };
  // Small regional photographs make the initial view useful. Full-resolution
  // imagery, planting and detailed scenery are not part of the startup barrier.
  world.assetJobs.push(photos('-preview'));
  world.sceneryJobs.push(async()=>{
    const low=world.lowDetail||world.quality==='low';
    // Load footprints before planting: crowns must not grow through the houses.
    const buildings=addApproachBuildings(world);
    const roads=addApproachRoads(world);
    const detail=loadGroundDetail(world,uniforms,fallback);
    const corridor=loadApproachCorridor(world);
    const ready=photos(low?'-low':'').then(async([region,approach,airport,final])=>{
      await Promise.allSettled([buildings,roads,corridor]); // imagery still works if vector data is missing
      await addWoodland(world,airport.image,final.image);
    });
    const grass=load('grass-color',true,true).then(t=>uniforms.uGrass.value=t);
    const jobs=[buildings,roads,ready,detail,corridor,grass,load('grass-rough',false,true).then(tex=>uniforms.uGrassRough.value=tex),load('grass-normal',false,true).then(tex=>{
      material.normalMap=tex;material.normalScale.set(.48,.48);material.needsUpdate=true;
    })];
    // One surface set is shared by all pavement. World-space mapping keeps the size of
    // aggregate constant on a runway, a connector, and the apron.
    jobs.push(Promise.all([load('asphalt-color',true,true),load('asphalt-normal',false,true),load('asphalt-rough',false,true)])
      .then(async([color,normal,rough])=>{
        world.pavementTextures={color,normal,rough};
        await roads.catch(()=>{});
        for(const mat of [world.runwayMat,...world.pavementMats,world.approachRoadMaterial].filter(Boolean)) detailPavement(mat,{color,normal,rough});
      }));
    const progress=world.sceneryProgress;progress.total+=jobs.length;   // the loading screen's finer steps
    const results=await Promise.allSettled(jobs.map(job=>job.finally(()=>progress.done++)));
    if(world.valleyRoadMaterial&&world.pavementTextures)detailPavement(world.valleyRoadMaterial,world.pavementTextures);
    world.assetErrors.push(...results.filter(r=>r.status==='rejected').map(r=>String(r.reason)));
  });
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
