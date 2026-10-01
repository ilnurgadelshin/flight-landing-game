// Original procedural density data, not downloaded imagery. Bake once instead of
// evaluating five octaves of noise for every view and shadow step on every frame.
import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const size=64,layers=4,seeds=[13,37,61,89],data=new Uint8Array(size**3*layers);
const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
function hash(x,y,z){x=fract(x*.3183099+.17)*17;y=fract(y*.3183099+.31)*17;z=fract(z*.3183099+.47)*17;return fract(x*y*z*(x+y+z));}
function noise(x,y,z){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  x-=ix;y-=iy;z-=iz;x=x*x*(3-2*x);y=y*y*(3-2*y);z=z*z*(3-2*z);
  return mix(mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),x),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),x),y),
    mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),x),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),x),y),z);
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Different connected turrets over a common condensation base. Density is
// baked, so extra silhouette detail does not add shader work at flight time.
const shapes=seeds.map((seed,variant)=>{
  let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const lobes=[];
  // A connected body with irregular peripheral billows, rather than repeated
  // vertical stacks of spheres. Each variant grows in a different direction.
  const lean=(variant-1.5)*.055;
  lobes.push([0,-.08,0,.32,.19,.26]);
  lobes.push([lean,.07,0,.24,.23,.23]);
  for(let i=0;i<16;i++){
    const angle=random()*Math.PI*2,radius=.12+random()*.11;
    const x=Math.cos(angle)*radius+lean*.5,z=Math.sin(angle)*radius*.8;
    const y=-.04+random()*(variant%2?.28:.20);
    const r=.095+random()*.075;
    lobes.push([x,y,z,r*(.9+random()*.3),r*(.8+random()*.4),r]);
  }
  return lobes;
});
function density(x,y,z,seed){
  if(y<-.29)return 0;
  const edge=(1-smooth(.44,.49,Math.abs(x)))*(1-smooth(.44,.49,Math.abs(z)))*(1-smooth(.43,.49,y));
  const base=smooth(-.29,-.205,y);
  const nx=x+(noise(x*5+seed,y*5+seed,z*5+seed)*.055-.0275);
  z+=noise(x*5-seed,y*5-seed,z*5-seed)*.055-.0275;x=nx;
  let shape=-1;
  for(const [cx,cy,cz,rx,ry,rz] of shapes[seeds.indexOf(seed)]){
    const lobe=1-Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz);
    const blend=Math.max(0,.18-Math.abs(shape-lobe));
    shape=Math.max(shape,lobe)+blend*blend/(4*.18);
  }
  if(shape<=.035)return 0;
  x=x*10+seed;y=y*10+seed;z=z*10+seed;
  const erosion=noise(x,y,z)*.24+noise(x*2.07,y*2.07,z*2.07)*.14+noise(x*4.11,y*4.11,z*4.11)*.065;
  return Math.max(0,shape-erosion)*base*edge*5;
}
for(let layer=0;layer<layers;layer++)for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const d=density(x/(size-1)-.5,y/(size-1)-.5,z/(size-1)-.5,seeds[layer]);
  data[((layer*size+z)*size+y)*size+x]=Math.round(Math.min(1,d/5)*255);
}
await fs.mkdir('assets/weather',{recursive:true});
const compressed=gzipSync(data,{level:9});
await fs.writeFile('assets/weather/cumulus-density.bin.gz',compressed);
console.log(`Baked ${layers} original ${size}³ density fields: ${compressed.byteLength} transfer bytes, ${data.byteLength} decoded`);
