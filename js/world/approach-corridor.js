// The same interpreted land-cover mask drives ground materials and woodland placement.
// Keep it optional: existing photographed terrain and planting are the fallback.
import * as THREE from 'three';

export function corridorUniforms(fallback){
 return {uCorridor:{value:fallback},uCorridorRect:{value:new THREE.Vector4(2100,180,2000,850)},uCorridorReady:{value:0},uCorridorInfluence:{value:1}};
}

/**
 * The decoded mask kept for placement, exactly, in half the memory of its RGBA pixels (alpha is
 * unused). Each pixel holds one class and its weight; the few pixels where classes blend (about
 * 0.2%) keep all three weights in a side table. Returns i => [r, g, b] in 0..1.
 */
export function packCover(rgba,count){
 const MIXED=0xffff,packed=new Uint16Array(count),mixed=new Map();
 for(let i=0;i<count;i++){
  const p=i*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
  if((r>0)+(g>0)+(b>0)>1){packed[i]=MIXED;mixed.set(i,[r/255,g/255,b/255]);}
  else packed[i]=r?r:g?256|g:b?512|b:0;
 }
 return i=>{
  const v=packed[i];if(v===MIXED)return mixed.get(i).slice();
  const out=[0,0,0];out[v>>8]=(v&255)/255;return out;
 };
}

export async function loadApproachCorridor(world){
 const url=name=>new URL('../../assets/scenery/approach-corridor.'+name,import.meta.url).href;
 const response=await fetch(url('json'));if(!response.ok)throw new Error(`Approach corridor: HTTP ${response.status}`);
 const manifest=await response.json();
 if(!Array.isArray(manifest.bounds)||manifest.bounds.length!==4||!manifest.bounds.every(Number.isFinite)||
   manifest.bounds[2]<=0||manifest.bounds[3]<=0||!Number.isInteger(manifest.width)||!Number.isInteger(manifest.height)||
   manifest.width<1||manifest.height<1||manifest.width>4096||manifest.height>2048||manifest.width*manifest.height>4096*1024)throw new Error('Invalid approach land-cover dimensions');
 if(manifest.plantingZones){
  const zones=manifest.plantingZones;
  if(!Array.isArray(zones)||zones.length<1||zones.length>5||zones.some(zone=>
   !zone||!Array.isArray(zone.bounds)||zone.bounds.length!==4||!zone.bounds.every(Number.isFinite)||
   zone.bounds[2]<=0||zone.bounds[3]<=0||!Number.isInteger(zone.seed)||
   zone.bounds[0]<manifest.bounds[0]||zone.bounds[1]<manifest.bounds[1]||
   zone.bounds[0]+zone.bounds[2]>manifest.bounds[0]+manifest.bounds[2]||
   zone.bounds[1]+zone.bounds[3]>manifest.bounds[1]+manifest.bounds[3]||
   !Number.isInteger(zone.highLimit)||zone.highLimit<1||!Number.isInteger(zone.lowLimit)||zone.lowLimit<1||
   [zone.highSpacing,zone.lowSpacing].some(s=>s!==undefined&&(!Number.isFinite(s)||s<9||s>40)))||
   zones.reduce((n,z)=>n+z.highLimit,0)>40700||zones.reduce((n,z)=>n+z.lowLimit,0)>12700)throw new Error('Invalid approach planting allocation');
 }
 const texture=await new THREE.TextureLoader().loadAsync(url('png'));
 if(texture.image.width!==manifest.width||texture.image.height!==manifest.height){texture.dispose();throw new Error('Approach land-cover image does not match its manifest');}
 texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const canvas=document.createElement('canvas');canvas.width=manifest.width;canvas.height=manifest.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);
 // Keep the full 2 m mask for placement clearances (packed: 7 MB, not 14). The low tier
 // only needs a smaller, filtered ground-colour mask; never exceed the device texture limit.
 const cover=packCover(context.getImageData(0,0,manifest.width,manifest.height).data,manifest.width*manifest.height);
 const low=world.lowDetail||world.quality==='low';
 const maxSize=Math.min(world.renderer.capabilities.maxTextureSize,low?2048:4096);
 if(Math.max(manifest.width,manifest.height)>maxSize){
  const scale=Math.min(1,maxSize/Math.max(manifest.width,manifest.height));
  const reduced=document.createElement('canvas');
  reduced.width=Math.round(manifest.width*scale);reduced.height=Math.round(manifest.height*scale);
  reduced.getContext('2d').drawImage(canvas,0,0,reduced.width,reduced.height);
  texture.image=reduced;texture.needsUpdate=true;
 }
 // Release the full-size canvas now rather than at collection (iOS budgets canvas memory).
 canvas.width=canvas.height=0;
 const [x0,z0,width,depth]=manifest.bounds;
 const sample=(x,z)=>{
  const i=Math.floor((x-x0)/width*manifest.width),j=Math.floor((z-z0)/depth*manifest.height);
  if(i<0||j<0||i>=manifest.width||j>=manifest.height)return [0,0,0];
  return cover(j*manifest.width+i);
 };
 world.groundUniforms.uCorridor.value=texture;
 world.groundUniforms.uCorridorRect.value.fromArray(manifest.bounds);
 world.groundUniforms.uCorridorReady.value=1;
 return world.approachCorridor={manifest,texture,sample};
}

export const CORRIDOR_GLSL=`
uniform sampler2D uCorridor;
uniform vec4 uCorridorRect;
uniform float uCorridorReady,uCorridorInfluence;
vec3 corridorCover(vec2 position){
 vec2 uv=(position-uCorridorRect.xy)/uCorridorRect.zw;
 if(uCorridorReady<.5||min(uv.x,uv.y)<0.0||max(uv.x,uv.y)>1.0)return vec3(0.0);
 return texture2D(uCorridor,vec2(uv.x,1.0-uv.y)).rgb*uCorridorInfluence;
}`;
