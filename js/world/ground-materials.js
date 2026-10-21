// Nearby surface frequencies only. The aerial tiles and reviewed cover own the
// field boundaries/large-scale colour; these scans do not claim survey accuracy.
import * as THREE from 'three';

export function groundMaterialUniforms(){
 const blank=new THREE.DataArrayTexture(new Uint8Array(16).fill(128),1,1,4);blank.needsUpdate=true;
 return {uGroundColor:{value:blank},uGroundSurface:{value:blank},uGroundMaterialsReady:{value:0},uGroundMaterialsInfluence:{value:1}};
}

export async function loadGroundMaterials(world){
 const low=world.lowDetail||world.quality==='low',size=low?256:512,suffix=low?'-low':'';
 const load=async kind=>{
  const layers=kind==='color'?3:4;
  const response=await fetch(new URL(`../../assets/scenery/ground-${kind}${suffix}.webp`,import.meta.url));
  if(!response.ok)throw new Error(`Ground ${kind}: ${response.status}`);
  const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  try{
   if(bitmap.width!==size||bitmap.height!==size*layers)throw new Error('Invalid ground material layer dimensions');
   const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size*layers;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
   const tex=new THREE.DataArrayTexture(ctx.getImageData(0,0,size,size*layers).data,size,size,layers);
   if(kind==='color')tex.colorSpace=THREE.SRGBColorSpace;
   tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.generateMipmaps=true;
   tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
   tex.anisotropy=world.maxAniso;tex.needsUpdate=true;return tex;
  }finally{bitmap.close();}
 };
 const loaded=await Promise.allSettled(['color','surface'].map(load));
 if(loaded.some(r=>r.status==='rejected')){
  loaded.forEach(r=>{if(r.status==='fulfilled')r.value.dispose();});
  throw loaded.find(r=>r.status==='rejected').reason;
 }
 const u=world.groundUniforms,blank=u.uGroundColor.value;
 u.uGroundColor.value=loaded[0].value;u.uGroundSurface.value=loaded[1].value;u.uGroundMaterialsReady.value=1;blank.dispose();
 world.groundMaterials={size,layers:3,textures:loaded.map(r=>r.value)};
}

export const GROUND_MATERIAL_GLSL=`
 uniform highp sampler2DArray uGroundColor,uGroundSurface;
 uniform float uGroundMaterialsReady,uGroundMaterialsInfluence;
 vec2 groundOffset(vec2 cell){
  return fract(sin(vec2(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3))))*43758.5453);
 }
 void groundSample(vec2 uv,vec2 dx,vec2 dy,vec2 cell,float layer,out vec3 colour,out vec3 surface){
  vec2 seed=groundOffset(cell);
  // Quarter turns preserve the scan scale without per-sample trigonometry.
  float turn=floor(fract(seed.x+seed.y)*4.);
  vec2 axis=turn<1.?vec2(1.,0.):turn<2.?vec2(0.,1.):turn<3.?vec2(-1.,0.):vec2(0.,-1.);
  mat2 rotation=mat2(axis.x,axis.y,-axis.y,axis.x);
  vec3 p=vec3(rotation*uv+seed,layer);
  colour=textureGrad(uGroundColor,p,rotation*dx,rotation*dy).rgb;
  surface=textureGrad(uGroundSurface,p,rotation*dx,rotation*dy).rgb;
  // Bring the sampled tangent normal back into the common world-X / -Z frame.
  surface.rg=transpose(rotation)*(surface.rg*2.-1.);
 }
 // Three overlapping, rotated samples on a triangular lattice break repeated
 // rows. Neighbours share corner seeds, so their boundaries remain continuous.
 // Explicit gradients preserve the scan mip level, not the random offset's derivative.
 void groundMaterial(vec2 p,vec2 dpdx,vec2 dpdy,float layer,out vec3 colour,out vec3 surface){
  float span=layer<.5?2.51:layer<1.5?1.30:2.0;
  vec2 uv=p*vec2(1.,-1.)/span;
  vec2 lattice=vec2(uv.x+uv.y*.57735027,uv.y*1.15470054);
  vec2 cell=floor(lattice),f=fract(lattice),a,b,c;vec3 weights;
  if(f.x+f.y<1.){a=cell;b=cell+vec2(1.,0.);c=cell+vec2(0.,1.);weights=vec3(1.-f.x-f.y,f.x,f.y);}
  else{a=cell+1.;b=cell+vec2(0.,1.);c=cell+vec2(1.,0.);weights=vec3(f.x+f.y-1.,1.-f.x,1.-f.y);}
  weights=weights*weights*(3.-2.*weights);weights/=max(dot(weights,vec3(1.)),.001);
  vec2 dx=dpdx*vec2(1.,-1.)/span,dy=dpdy*vec2(1.,-1.)/span;
  vec3 ca,cb,cc,sa,sb,sc;
  groundSample(uv,dx,dy,a,layer,ca,sa);
  groundSample(uv,dx,dy,b,layer,cb,sb);
  groundSample(uv,dx,dy,c,layer,cc,sc);
  vec3 mean=layer<.5?vec3(.15756,.11856,.04877):layer<1.5?vec3(.11468,.09580,.07338):vec3(.17304,.07636,.03536);
  // Keep the mean stable as grazing-angle filtering averages away scan detail.
  // Variance compensation here exposes the lattice when mip colours differ
  // slightly from the source mean.
  colour=clamp((ca*weights.x+cb*weights.y+cc*weights.z)/mean,vec3(.3),vec3(2.4));
  surface=sa*weights.x+sb*weights.y+sc*weights.z;
 }
`;
