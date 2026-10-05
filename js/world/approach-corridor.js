// The same interpreted land-cover mask drives ground materials and woodland placement.
// Keep it optional: existing photographed terrain and planting are the fallback.
import * as THREE from 'three';

export function corridorUniforms(fallback){
 return {uCorridor:{value:fallback},uCorridorRect:{value:new THREE.Vector4(2100,180,2000,850)},uCorridorReady:{value:0},uCorridorInfluence:{value:1}};
}

export async function loadApproachCorridor(world){
 const url=name=>new URL('../../assets/scenery/approach-corridor.'+name,import.meta.url).href;
 const response=await fetch(url('json'));if(!response.ok)throw new Error(`Approach corridor: HTTP ${response.status}`);
 const manifest=await response.json();
 if(!Array.isArray(manifest.bounds)||manifest.bounds.length!==4||!manifest.bounds.every(Number.isFinite)||
   manifest.bounds[2]<=0||manifest.bounds[3]<=0||!Number.isInteger(manifest.width)||!Number.isInteger(manifest.height)||
   manifest.width<1||manifest.height<1||manifest.width*manifest.height>1024*1024)throw new Error('Invalid approach land-cover dimensions');
 const texture=await new THREE.TextureLoader().loadAsync(url('png'));
 if(texture.image.width!==manifest.width||texture.image.height!==manifest.height){texture.dispose();throw new Error('Approach land-cover image does not match its manifest');}
 texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const canvas=document.createElement('canvas');canvas.width=manifest.width;canvas.height=manifest.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);
 const pixels=context.getImageData(0,0,manifest.width,manifest.height).data;
 const [x0,z0,width,depth]=manifest.bounds;
 const sample=(x,z)=>{
  const i=Math.floor((x-x0)/width*manifest.width),j=Math.floor((z-z0)/depth*manifest.height);
  if(i<0||j<0||i>=manifest.width||j>=manifest.height)return [0,0,0];
  const p=(j*manifest.width+i)*4;return [pixels[p]/255,pixels[p+1]/255,pixels[p+2]/255];
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
