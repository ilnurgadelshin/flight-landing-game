// The same interpreted land-cover mask drives ground materials and woodland placement.
// Keep it optional: existing photographed terrain and planting are the fallback.
import * as THREE from 'three';
import {upperSlopeBlend,validateUpperSlopes} from './upper-slopes.js';

export function corridorUniforms(fallback){
 return {uCorridor:{value:fallback},uCorridorRect:{value:new THREE.Vector4(2100,180,2000,850)},uCorridorReady:{value:0},uCorridorInfluence:{value:1},
  uCorridorMainHeight:{value:1},uHillsRect:{value:new THREE.Vector4(0,0,1,1)},uHillsAtlas:{value:new THREE.Vector2()},uHillsReady:{value:0},
  uOppositeHillsRect:{value:new THREE.Vector4(0,0,1,1)},uOppositeHillsAtlas:{value:new THREE.Vector3()},uOppositeHillsReady:{value:0},
  uUpperSlopesReady:{value:0},uUpperSlopeRect:{value:[new THREE.Vector4(),new THREE.Vector4()]},uUpperSlopeAtlas:{value:[new THREE.Vector3(),new THREE.Vector3()]}};
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

// The baked join stays opaque for the adjoining high-tier hill tile. When that
// tile is absent, taper the close map back to the photograph over several crowns.
// Edit the decoded pixels once so placement and the filtered GPU mask agree.
export function featherMissingHills(rgba,manifest){
 const {bounds:[x0,z0,width,depth],width:cols,height:rows,hills}=manifest;
 const [hx,,hw]=hills.bounds,fade=160,edge=z0+depth;
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const firstRow=Math.max(0,Math.floor((depth-fade)/depth*rows));
 const firstCol=Math.max(0,Math.floor((hx-fade-x0)/width*cols));
 const lastCol=Math.min(cols,Math.ceil((hx+hw+fade-x0)/width*cols));
 for(let j=firstRow;j<rows;j++){
  const z=z0+(j+.5)*depth/rows,along=smooth((edge-z)/fade);
  for(let i=firstCol;i<lastCol;i++){
   const x=x0+(i+.5)*width/cols;
   // Blend the ends into the neighbouring, already feathered map edge too.
   const across=smooth((x-hx+fade)/fade)*smooth((hx+hw+fade-x)/fade);
   const weight=1-across*(1-along),p=(j*cols+i)*4;
   for(let c=0;c<3;c++)rgba[p+c]=Math.round(rgba[p+c]*weight);
  }
 }
}

// High's new north tile continues into the first 30 m of the close map. Join the
// decoded pixels once, before CPU packing and GPU upload, so planting and surface
// cover agree. Low never calls this: its older edge and tree allocation are intact.
export function joinOppositeHills(rgba,manifest,hillRGBA){
 const h=manifest.oppositeHills,[x0,z0,width,depth]=manifest.bounds;
 const [hx,,hw]=h.bounds,rows=Math.min(manifest.height,Math.ceil(30/depth*manifest.height));
 for(let j=0;j<rows;j++){
  const distance=(j+.5)*depth/manifest.height,t=Math.max(0,Math.min(1,(30-distance)/20)),blend=t*t*(3-2*t);
  for(let i=0;i<manifest.width;i++){
   const x=x0+(i+.5)*width/manifest.width,hi=Math.floor((x-hx)/hw*h.width);
   if(hi<0||hi>=h.width)continue;
   const p=(j*manifest.width+i)*4,q=((h.height-1)*h.width+hi)*4;
   for(let c=0;c<3;c++)rgba[p+c]=Math.round(rgba[p+c]*(1-blend)+hillRGBA[q+c]*blend);
  }
 }
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
 const hills=manifest.hills,textureHeight=manifest.textureHeight??manifest.height;
 if(!Number.isInteger(textureHeight)||textureHeight<manifest.height||textureHeight>1536||manifest.width*textureHeight>4500000)
  throw new Error('Invalid approach land-cover atlas dimensions');
 if(hills){
  // The hill tile sits below the close map, after a short gutter of repeated edge rows.
  const b=hills.bounds,zones=hills.plantingZones;
  if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0||
   !Number.isInteger(hills.width)||hills.width<1||hills.width>1024||hills.width>manifest.width||
   !Number.isInteger(hills.height)||hills.height<1||hills.height>256||
   !Array.isArray(hills.atlas)||hills.atlas.length!==2||hills.atlas[0]!==0||!Number.isInteger(hills.atlas[1])||
   hills.atlas[1]<manifest.height||hills.atlas[1]>manifest.height+16||textureHeight!==hills.atlas[1]+hills.height||
   b[1]<manifest.bounds[1]+manifest.bounds[3]||!Array.isArray(zones)||zones.length!==1||zones.some(z=>
    !Array.isArray(z.bounds)||z.bounds.length!==4||!z.bounds.every((v,i)=>v===b[i])||!Number.isInteger(z.seed)||
    !Number.isInteger(z.highLimit)||z.highLimit<1||z.highLimit>8000||!Number.isInteger(z.lowLimit)||z.lowLimit<0||z.lowLimit>1000||
    !Number.isFinite(z.highSpacing)||z.highSpacing<12||!Number.isFinite(z.lowSpacing)||z.lowSpacing<32||z.uniform!==true||
    (z.taper!==undefined&&(!Number.isFinite(z.taper)||z.taper<=0||z.taper>1000||!Number.isFinite(z.taperFloor)||z.taperFloor<=0||z.taperFloor>1))))
   throw new Error('Invalid hillside land-cover allocation');
 }else if(textureHeight!==manifest.height)throw new Error('Missing hillside atlas data');
 const opposite=manifest.oppositeHills;
 if(opposite){
  const b=opposite.bounds,zones=opposite.plantingZones;
  if(!hills||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0||
   b[1]+b[3]!==manifest.bounds[1]||b[0]<manifest.bounds[0]||b[0]+b[2]>manifest.bounds[0]+manifest.bounds[2]||
   !Number.isInteger(opposite.width)||opposite.width<1||opposite.width>1024||opposite.height!==hills.height||
   !Array.isArray(opposite.atlas)||opposite.atlas.length!==2||!Number.isInteger(opposite.atlas[0])||
   opposite.atlas[0]<hills.width+6||opposite.atlas[0]+opposite.width>manifest.width||opposite.atlas[1]!==hills.atlas[1]||
   !Array.isArray(zones)||zones.length!==1||zones.some(z=>
    !Array.isArray(z.bounds)||z.bounds.length!==4||!z.bounds.every((v,i)=>v===b[i])||!Number.isInteger(z.seed)||
    !Number.isInteger(z.highLimit)||z.highLimit<1||z.highLimit>6000||z.lowLimit!==0||
    !Number.isFinite(z.highSpacing)||z.highSpacing<12||!Number.isFinite(z.lowSpacing)||z.lowSpacing<32||z.uniform!==true||
    !Number.isFinite(z.taper)||z.taper<=0||z.taper>1000||!Number.isFinite(z.taperFloor)||z.taperFloor<=0||z.taperFloor>1||z.taperSide!=='south'))
   throw new Error('Invalid opposite hillside land-cover allocation');
 }
 validateUpperSlopes(manifest);
 const texture=await new THREE.TextureLoader().loadAsync(url('png'));
 if(texture.image.width!==manifest.width||texture.image.height!==textureHeight){texture.dispose();throw new Error('Approach land-cover image does not match its manifest');}
 texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const canvas=document.createElement('canvas');canvas.width=manifest.width;canvas.height=textureHeight;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);
 // The hillside is used only by a tier with trees allotted to it (high): a tier without keeps
 // the photograph, its background trees, and a texture of just the close map.
 const low=world.lowDetail||world.quality==='low';
 const activeHills=hills&&hills.plantingZones.some(z=>(low?z.lowLimit:z.highLimit)>0)?hills:null;
 const activeOpposite=!low&&opposite?opposite:null;
 const upperSlopes=low?[]:manifest.upperSlopes||[];
 const upperCover=upperSlopes.map(t=>packCover(context.getImageData(...t.atlas,t.width,t.height).data,t.width*t.height));
 const rows=activeHills?textureHeight:manifest.height;
 // Keep the full 2 m mask for placement clearances (packed: 7 MB, not 14). The low tier
 // only needs a smaller, filtered ground-colour mask; never exceed the device texture limit.
 const close=context.getImageData(0,0,manifest.width,manifest.height);
 if(hills&&!activeHills){
  featherMissingHills(close.data,manifest);
  context.putImageData(close,0,0);
 }
 let oppositeCover;
 if(activeOpposite){
  const rgba=context.getImageData(...opposite.atlas,opposite.width,opposite.height).data;
  oppositeCover=packCover(rgba,opposite.width*opposite.height);
  joinOppositeHills(close.data,manifest,rgba);
  context.putImageData(close,0,0);
  // TextureLoader's image is otherwise the original file, not our joined canvas.
  texture.image=context.canvas;texture.needsUpdate=true;
 }
 const cover=packCover(close.data,manifest.width*manifest.height);
 let hillCover;
 if(activeHills){
  const rgba=context.getImageData(...hills.atlas,hills.width,hills.height).data;
  hillCover=packCover(rgba,hills.width*hills.height);
 }
 const maxSize=Math.min(world.renderer.capabilities.maxTextureSize,low?2048:4096);
 if(Math.max(manifest.width,rows)>maxSize||rows!==textureHeight){
  const scale=Math.min(1,maxSize/Math.max(manifest.width,rows));
  const reduced=document.createElement('canvas');
  reduced.width=Math.round(manifest.width*scale);reduced.height=Math.round(rows*scale);
  reduced.getContext('2d').drawImage(canvas,0,0,manifest.width,rows,0,0,reduced.width,reduced.height);
  texture.image=reduced;texture.needsUpdate=true;
 }
 // Keep the joined high image alive; release temporary decoding canvases.
 if(texture.image!==canvas)canvas.width=canvas.height=0;
 const [x0,z0,width,depth]=manifest.bounds;
 const baseSample=(x,z)=>{
  const i=Math.floor((x-x0)/width*manifest.width),j=Math.floor((z-z0)/depth*manifest.height);
  if(i>=0&&j>=0&&i<manifest.width&&j<manifest.height)return cover(j*manifest.width+i);
  if(activeHills){
   const [hx,hz,hw,hd]=hills.bounds,hi=Math.floor((x-hx)/hw*hills.width),hj=Math.floor((z-hz)/hd*hills.height);
   if(hi>=0&&hj>=0&&hi<hills.width&&hj<hills.height)return hillCover(hj*hills.width+hi);
  }
  if(activeOpposite){
   const [hx,hz,hw,hd]=opposite.bounds,hi=Math.floor((x-hx)/hw*opposite.width),hj=Math.floor((z-hz)/hd*opposite.height);
   if(hi>=0&&hj>=0&&hi<opposite.width&&hj<opposite.height)return oppositeCover(hj*opposite.width+hi);
  }
  return [0,0,0];
 };
 const sample=(x,z)=>{
  const base=baseSample(x,z);
  for(let k=0;k<upperSlopes.length;k++){
   const t=upperSlopes[k],blend=upperSlopeBlend(t,x,z);if(!blend)continue;
   const [tx,tz,tw,td]=t.bounds,i=Math.floor((x-tx)/tw*t.width),j=Math.floor((z-tz)/td*t.height),cover=upperCover[k](j*t.width+i);
   return base.map((v,c)=>v+(cover[c]-v)*blend);
  }
  return base;
 };
 world.groundUniforms.uCorridor.value=texture;
 world.groundUniforms.uCorridorRect.value.fromArray(manifest.bounds);
 world.groundUniforms.uCorridorMainHeight.value=manifest.height/rows;
 world.groundUniforms.uHillsReady.value=activeHills?1:0;
 world.groundUniforms.uOppositeHillsReady.value=activeOpposite?1:0;
 world.groundUniforms.uUpperSlopesReady.value=upperSlopes.length?1:0;
 upperSlopes.forEach((t,i)=>{
  world.groundUniforms.uUpperSlopeRect.value[i].fromArray(t.bounds);
  world.groundUniforms.uUpperSlopeAtlas.value[i].set(t.atlas[0]/manifest.width,t.width/manifest.width,t.height/rows);
 });
 if(activeOpposite){
  world.groundUniforms.uOppositeHillsRect.value.fromArray(opposite.bounds);
  world.groundUniforms.uOppositeHillsAtlas.value.set(opposite.atlas[0]/manifest.width,opposite.width/manifest.width,opposite.height/rows);
 }
 if(activeHills){
  world.groundUniforms.uHillsRect.value.fromArray(hills.bounds);
  world.groundUniforms.uHillsAtlas.value.set(hills.width/manifest.width,hills.height/textureHeight);
 }
 world.groundUniforms.uCorridorReady.value=1;
 return world.approachCorridor={manifest,texture,sample,hills:activeHills,oppositeHills:activeOpposite,upperSlopes};
}

export const CORRIDOR_GLSL=`
uniform sampler2D uCorridor;
uniform vec4 uCorridorRect;
uniform float uCorridorReady,uCorridorInfluence,uCorridorMainHeight,uHillsReady;
uniform vec4 uHillsRect;
uniform vec2 uHillsAtlas;
uniform float uOppositeHillsReady;
uniform vec4 uOppositeHillsRect;
uniform vec3 uOppositeHillsAtlas;
uniform float uUpperSlopesReady;
uniform vec4 uUpperSlopeRect[2];
uniform vec3 uUpperSlopeAtlas[2];
vec3 corridorBaseCover(vec2 position){
 if(uCorridorReady<.5)return vec3(0.0);
 vec2 uv=(position-uCorridorRect.xy)/uCorridorRect.zw;
 if(min(uv.x,uv.y)>=0.0&&max(uv.x,uv.y)<1.0)
  return texture2D(uCorridor,vec2(uv.x,1.0-uv.y*uCorridorMainHeight)).rgb*uCorridorInfluence;
 vec2 hills=(position-uHillsRect.xy)/uHillsRect.zw;
 if(uHillsReady>.5&&min(hills.x,hills.y)>=0.0&&max(hills.x,hills.y)<1.0)
  return texture2D(uCorridor,vec2(hills.x,1.0-hills.y)*uHillsAtlas).rgb*uCorridorInfluence;
 vec2 opposite=(position-uOppositeHillsRect.xy)/uOppositeHillsRect.zw;
 if(uOppositeHillsReady<.5||min(opposite.x,opposite.y)<0.0||max(opposite.x,opposite.y)>=1.0)return vec3(0.0);
 return texture2D(uCorridor,vec2(uOppositeHillsAtlas.x+opposite.x*uOppositeHillsAtlas.y,(1.0-opposite.y)*uOppositeHillsAtlas.z)).rgb*uCorridorInfluence;
}
vec3 corridorCover(vec2 position){
 if(uCorridorReady>.5&&uUpperSlopesReady>.5){
  // The two strips are disjoint in Z. Select one explicitly, avoiding dynamic
  // uniform-array indexing and a second texture read outside the narrow join.
  bool north=position.y<0.0;
  vec4 rect=north?uUpperSlopeRect[0]:uUpperSlopeRect[1];
  vec2 offset=position-rect.xy,uv=offset/rect.zw;
  if(min(uv.x,uv.y)>=0.0&&max(uv.x,uv.y)<1.0){
   float blend=smoothstep(0.0,180.0,offset.x)*smoothstep(0.0,180.0,north?rect.w-offset.y:offset.y);
   vec3 atlas=north?uUpperSlopeAtlas[0]:uUpperSlopeAtlas[1];
   vec3 cover=texture2D(uCorridor,vec2(atlas.x+uv.x*atlas.y,(1.0-uv.y)*atlas.z)).rgb*uCorridorInfluence;
   if(blend>=1.0)return cover;
   return mix(corridorBaseCover(position),cover,blend);
  }
 }
 return corridorBaseCover(position);
}`;
