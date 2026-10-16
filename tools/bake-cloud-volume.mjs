// Original procedural cloud density, not downloaded imagery. Resolve billows and
// erosion offline so richer shapes retain the same runtime sampling budget.
import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {CUMULUS_SIZE as size,CUMULUS_VARIANTS as layers,CUMULUS_DIMENSIONS as dimensions,CUMULUS_BYTES} from '../js/world/cumulus-layout.js';
const seeds=[13,37,61,89,113,151],data=new Uint8Array(CUMULUS_BYTES);
const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
function hash(x,y,z){x=fract(x*.3183099+.17)*17;y=fract(y*.3183099+.31)*17;z=fract(z*.3183099+.47)*17;return fract(x*y*z*(x+y+z));}
function noise(x,y,z){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
 x-=ix;y-=iy;z-=iz;x=x*x*(3-2*x);y=y*y*(3-2*y);z=z*z*(3-2*z);
 return mix(mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),x),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),x),y),
  mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),x),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),x),y),z);
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Distinct silhouettes: spreading low cloud, leaning tower, paired turrets,
// compact growth, an uneven broken bank and a broad low bank. No repeated stack.
const bodies=[
 [[-.13,-.12,0,.23,.14,.24],[.15,-.10,.03,.20,.15,.20],[-.05,.02,-.02,.17,.15,.17]],
 [[0,-.14,0,.31,.13,.25],[-.10,.04,0,.20,.23,.20],[-.15,.22,.015,.145,.17,.15]],
 [[0,-.14,0,.33,.13,.23],[-.18,.04,.015,.16,.21,.18],[.15,.12,-.02,.16,.26,.17]],
 [[0,-.13,0,.28,.15,.26],[.06,.07,-.02,.22,.25,.22],[.11,.24,0,.14,.16,.15]],
 [[-.20,-.12,-.07,.20,.15,.21],[.13,-.10,.08,.22,.19,.22],[-.05,-.08,.04,.15,.11,.13]],
 [[-.15,-.14,0,.24,.115,.25],[.16,-.14,0,.22,.12,.23],[.01,-.035,-.08,.17,.15,.18]]
];
const shapes=bodies.map((body,variant)=>{
 let state=seeds[variant];const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const lobes=body.map(p=>[...p]);
 // Smaller connected billows on each parent, with unique azimuth/height. Their
 // signed distances share metre-like units so small lobes do not erase parents.
 for(const [cx,cy,cz,rx,ry,rz] of body)for(let i=0;i<18;i++){
  const azimuth=random()*Math.PI*2,elevation=-.15+random()*1.5;
  const radial=.84+random()*.14,r=.043+random()*.035;
  lobes.push([cx+Math.cos(azimuth)*Math.cos(elevation)*rx*radial,cy+Math.sin(elevation)*ry*radial,
   cz+Math.sin(azimuth)*Math.cos(elevation)*rz*radial,r*(.9+random()*.3),r*(.85+random()*.4),r]);
 }
 return lobes;
});
function density(x,y,z,variant){
 if(y<-.29)return 0;
 const seed=seeds[variant],edge=(1-smooth(.44,.49,Math.abs(x)))*(1-smooth(.44,.49,Math.abs(z)))*(1-smooth(.43,.49,y));
 const base=smooth(-.29,-.235,y);
 const nx=x+(noise(x*7+seed,y*7+seed,z*7+seed)-.5)*.032;
 z+=(noise(x*7-seed,y*7-seed,z*7-seed)-.5)*.032;x=nx;
 let shape=-1;
 for(const [cx,cy,cz,rx,ry,rz] of shapes[variant]){
  const lobe=(1-Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz))*Math.min(rx,ry,rz);
  const blend=Math.max(0,.014-Math.abs(shape-lobe));
  shape=Math.max(shape,lobe)+blend*blend/(4*.014);
 }
 if(shape<=0)return 0;
 x=x*13+seed;y=y*13+seed;z=z*13+seed;
 const erosion=noise(x,y,z)*.014+noise(x*2.07,y*2.07,z*2.07)*.008+noise(x*4.11,y*4.11,z*4.11)*.0035;
 return Math.max(0,shape-erosion)*base*edge*31;
}
for(let layer=0;layer<layers;layer++)for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const d=density(x/(size-1)-.5,y/(size-1)-.5,z/(size-1)-.5,layer);
 const px=(layer%2)*size+x,pz=Math.floor(layer/2)*size+z;
 data[(pz*dimensions[1]+y)*dimensions[0]+px]=Math.round(Math.min(1,d/5)*255);
}
await fs.mkdir('assets/weather',{recursive:true});
const compressed=gzipSync(data,{level:9});
await fs.writeFile('assets/weather/cumulus-density.bin.gz',compressed);
console.log(`Baked ${layers} original ${size}³ density fields: ${compressed.byteLength} transfer bytes, ${data.byteLength} decoded`);
