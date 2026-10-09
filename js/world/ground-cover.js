// Dense photographed grass close to the eye, in a fixed tile/instance pool.
// Shared land-cover and pavement exclusions keep it out of fields' roads and runways.
import * as THREE from 'three';
import {RUNWAY} from '../config.js';
import {TERRAIN} from '../physics/terrain.js';
import {sceneryGroundHeight} from './scenery-ground.js';

const TILE=10,CONNECTORS=[-1450,-700,0,700,1450];
const hash=(x,z,seed)=>{let h=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const wrap=(x,n)=>(x%n+n)%n;
export function groundCoverKind(world,x,z){
 const half=RUNWAY.length/2;
 if(Math.abs(x)<half+160&&Math.abs(z)<110){
  // Include the full aggregate shoulder, blast pads and both physical/rendered connector extents.
  if(Math.abs(x)<half+RUNWAY.padLength+2&&Math.abs(z)<RUNWAY.width/2+8)return 0;
  if(CONNECTORS.some(cx=>Math.abs(x-cx)<54&&Math.abs(z-72)<20))return 0;
  for(const dx of [-1.2,1.2])for(const dz of [-1.2,1.2])if(TERRAIN.surfaceAt(x+dx,z+dz)!=='grass')return 0;
  return 1;
 }
 if(!world.approachCorridor||world.approachCorridor.sample(x,z)[0]<.72)return 0;
 if(world.approachSiteExcludes?.(x,z)||world.approachBuildingExcludes?.(x,z)||world.approachRoadExcludes?.(x,z))return 0;
 return 2;
}

export async function addGroundCover(world){
 const low=world.lowDetail||world.quality==='low',grid=9;let cells=low?14:20,perTile=cells*cells;const maxInstances=grid*grid*perTile;
 const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/scenery/grass-patches${low?'-low':''}.webp`,import.meta.url).href);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(world.maxAniso,4);
 const uniforms={uGrassTufts:{value:texture},uGroundGrass:world.groundUniforms.uGrass,uGrassTime:{value:0},uGrassRadius:{value:low?36:40},uGrassWet:world.groundUniforms.uWet};
 const geometry=new THREE.InstancedBufferGeometry();
 const positions=[],uvs=[],indices=[];
 for(let card=0;card<2;card++){
  const c=Math.cos(card*Math.PI/2),s=Math.sin(card*Math.PI/2),start=positions.length/3;
  for(const [x,y,u,v] of [[-.52,0,0,0],[.52,0,1,0],[-.52,.4,0,1],[.52,.4,1,1]]){positions.push(x*c,y,x*s);uvs.push(u,v);}
  indices.push(start,start+1,start+2,start+2,start+1,start+3);
 }
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:positions.length/3},()=>[0,1,0]).flat(),3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.instanceCount=maxInstances;
 const roots=new THREE.InstancedBufferAttribute(new Float32Array(maxInstances*3),3),patches=new THREE.InstancedBufferAttribute(new Float32Array(maxInstances*4),4),births=new THREE.InstancedBufferAttribute(new Float32Array(maxInstances),1);
 for(const a of [roots,patches,births])a.setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('grassRoot',roots);geometry.setAttribute('grassPatch',patches);geometry.setAttribute('grassBirth',births);
 const material=new THREE.MeshStandardMaterial({roughness:1,side:THREE.DoubleSide,alphaTest:.35,alphaToCoverage:true});
 material.onBeforeCompile=(shader,renderer)=>{
  THREE.Material.prototype.onBeforeCompile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute vec3 grassRoot;attribute vec4 grassPatch;attribute float grassBirth;
   uniform float uGrassTime,uGrassRadius;varying vec2 vGrassUv;varying vec3 vGrassRoot;varying float vGrassKind,vGrassHeight,vGrassFade;`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vGrassRoot=grassRoot;vGrassKind=grassPatch.w;vGrassHeight=uv.y;
    float frame=floor(grassPatch.z*8.);vGrassUv=(uv*.992+.004+vec2(mod(frame,4.),floor(frame/4.)))/vec2(4.,2.);
    float distanceFade=1.-smoothstep(uGrassRadius*.62,uGrassRadius,length(cameraPosition-grassRoot));
    float grow=smoothstep(0.,.45,uGrassTime-grassBirth);vGrassFade=distanceFade*grow;
    float angle=grassPatch.x,c=cos(angle),s=sin(angle);
    transformed.xz=mat2(c,-s,s,c)*transformed.xz*(.9+grassPatch.z*.2);
    transformed.y*=grassPatch.y*distanceFade*grow;
    transformed.xz+=uv.y*uv.y*transformed.y*.14*vec2(sin(uGrassTime*1.6+grassRoot.x*.71),cos(uGrassTime*1.3+grassRoot.z*.57));
    transformed+=grassRoot;
   `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D uGrassTufts,uGroundGrass;uniform float uGrassWet;
   varying vec2 vGrassUv;varying vec3 vGrassRoot;varying float vGrassKind,vGrassHeight,vGrassFade;`)
   .replace('#include <map_fragment>',`float grassDither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
    if(vGrassFade<grassDither)discard;
    vec4 blade=texture2D(uGrassTufts,vGrassUv);diffuseColor.a*=blade.a;
    vec3 scan=texture2D(uGroundGrass,vGrassRoot.xz/18.).rgb;
    vec3 turf=mix(vec3(.13,.155,.065),scan*vec3(.75,.9,.65),.72);
    vec3 cover=mix(turf,vec3(.105,.145,.056),step(1.5,vGrassKind));
    vec3 photographed=clamp(blade.rgb/vec3(.0831,.1001,.02725),.35,2.2);
    vec3 vegetation=cover*mix(vec3(1.),photographed,.72);
    diffuseColor.rgb*=vegetation*.82*mix(.68,1.22,vGrassHeight)*mix(1.,.65,uGrassWet);`)
   .replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
    // Grass receives broad sky/sun light like the ground; crossed card normals must not expose the planes.
    normal=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);`);
 };
 material.customProgramCacheKey=()=> 'near-ground-photographed-grass-v1';
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Dense near-ground grass';mesh.frustumCulled=false;mesh.visible=false;world.scene.add(mesh);
 let slots=Array.from({length:grid*grid},()=>({key:'',count:0}));let queue=[],key='',activeCount=0;
 const fill=(tile,settled)=>{
  const {ix,iz,slot}=tile,offset=slot*perTile;let count=0;
  for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
   const gx=ix*cells+i,gz=iz*cells+j,x=ix*TILE+(i+.1+hash(gx,gz,1)*.8)*TILE/cells,z=iz*TILE+(j+.1+hash(gx,gz,2)*.8)*TILE/cells,k=offset+j*cells+i;
   const kind=groundCoverKind(world,x,z),height=kind===1?.38+hash(gx,gz,3)*.22:.65+hash(gx,gz,3)*.35;
   roots.setXYZ(k,x,kind?sceneryGroundHeight(x,z,world.groundLowDetail)+.005:0,z);
   patches.setXYZW(k,hash(gx,gz,4)*Math.PI*2,kind?height:0,hash(gx,gz,5),kind);births.setX(k,world.time-(settled?1:0));if(kind)count++;
  }
  activeCount+=count-slots[slot].count;slots[slot]={key:`${ix}:${iz}`,count};
  for(const [a,n] of [[roots,3],[patches,4],[births,1]]){a.addUpdateRange(offset*n,perTile*n);a.needsUpdate=true;}
 };
 const update=(eye,settled=false)=>{
  uniforms.uGrassTime.value=world.time;
  const altitude=eye.y-sceneryGroundHeight(eye.x,eye.z,world.groundLowDetail);
  if(altitude>uniforms.uGrassRadius.value||altitude<-.5){mesh.visible=false;return;}
  const ix=Math.floor(eye.x/TILE),iz=Math.floor(eye.z/TILE),next=`${ix}:${iz}`;
  if(next!==key){
   key=next;queue=[];const half=(grid-1)/2;
   for(let x=ix-half;x<=ix+half;x++)for(let z=iz-half;z<=iz+half;z++){
    const slot=wrap(x,grid)*grid+wrap(z,grid);if(slots[slot].key===`${x}:${z}`)continue;
    queue.push({ix:x,iz:z,slot,distance:(x*TILE+TILE/2-eye.x)**2+(z*TILE+TILE/2-eye.z)**2});
   }queue.sort((a,b)=>a.distance-b.distance);
  }
  const count=settled?queue.length:2;for(let i=0;i<count&&queue.length;i++)fill(queue.shift(),settled);
  mesh.visible=activeCount>0;
  // Hidden meshes are not uploaded, so the renderer cannot consume their dirty ranges.
  // Retain one full upload for the next visible frame instead of accumulating tile ranges.
  if(!mesh.visible)for(const a of [roots,patches,births]){a.clearUpdateRanges();a.addUpdateRange(0,a.array.length);}
 };
 const cover=world.groundCover={mesh,uniforms,roots,patches,births,update,settle:eye=>update(eye,true),maxInstances,
  get activeCount(){return activeCount;},get queued(){return queue.length;},get grid(){return grid;},
  reduceQuality(){
   if(cells===14)return;cells=14;perTile=cells*cells;uniforms.uGrassRadius.value=36;geometry.instanceCount=grid*grid*perTile;
   patches.array.fill(0);patches.clearUpdateRanges();patches.addUpdateRange(0,patches.array.length);patches.needsUpdate=true;slots=Array.from({length:grid*grid},()=>({key:'',count:0}));activeCount=0;key='';queue=[];mesh.visible=false;
  },texture};
 // A timed-out Start can reduce quality while the optional atlas is still arriving.
 if(world.lowDetail||world.quality==='low')cover.reduceQuality();
 return cover;
}
