// Bake an independent optional high-tier mask; keep all earlier maps byte-identical.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {airportCountryside as source} from './airport-countryside.mjs';
import {protectedScenery} from '../js/world/scenery-ground.js';
function distance(x,z,points){
 let inside=false,d=Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-9,dx*dx+dz*dz)));
  d=Math.min(d,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside?d:-d;
}
const buildings=[...JSON.parse(await fs.readFile('assets/scenery/approach-buildings.json')).buildings,...JSON.parse(await fs.readFile('assets/scenery/approach-infill.json')).buildings];
const roads=JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads;
const cells=new Map(),index=(rect,item)=>{
 for(let x=Math.floor(rect[0]/64);x<=Math.floor(rect[2]/64);x++)for(let z=Math.floor(rect[1]/64);z<=Math.floor(rect[3]/64);z++){
  const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);
 }
};
for(const b of buildings){const r=Math.hypot(b.w,b.d)/2+24;index([b.x-r,b.z-r,b.x+r,b.z+r],{b});}
for(const r of roads)for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i];index([Math.min(a[0],b[0])-16,Math.min(a[1],b[1])-16,Math.max(a[0],b[0])+16,Math.max(a[1],b[1])+16],{segment:[a,b]});
}
const {width,height,bounds:[x0,z0,w,d]}=source,pixels=new Uint8Array(width*height*3),counts=[0,0,0];
const areas=source.areas.map(a=>({...a,rect:[Math.min(...a.points.map(p=>p[0])),Math.min(...a.points.map(p=>p[1])),Math.max(...a.points.map(p=>p[0])),Math.max(...a.points.map(p=>p[1]))]}));
for(let j=0;j<height;j++)for(let i=0;i<width;i++){
 const x=x0+(i+.5)*w/width,z=z0+(j+.5)*d/height;
 if(protectedScenery(x,z,24))continue;
 // Let woodland thin over a few crowns beside the fictional earthworks, not
 // stop at the rectangle's exact boundary. The inner 24m clearance stays empty.
 const outside=(cx,cz,hw,hd)=>Math.hypot(Math.max(0,Math.abs(x-cx)-hw),Math.max(0,Math.abs(z-cz)-hd));
 const edge=Math.min(outside(0,120,2124,724),outside(2450,0,974,204));
 const t=Math.min(1,edge/110);let clearance=t*t*(3-2*t);
 for(const item of cells.get(`${Math.floor(x/64)}:${Math.floor(z/64)}`)||[]){
  if(item.b){const b=item.b,dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
   const dist=Math.hypot(Math.max(0,Math.abs(dx*c+dz*s)-b.w/2),Math.max(0,Math.abs(-dx*s+dz*c)-b.d/2));
   clearance=Math.min(clearance,Math.max(0,Math.min(1,(dist-12)/12)));
  }else{const [a,b]=item.segment,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-9,dx*dx+dz*dz)));
   clearance=Math.min(clearance,Math.max(0,Math.min(1,(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)-8)/8)));
  }
 }
 // Feather the photograph-facing bounds. The east edge is the runtime overlap.
 const boundary=Math.max(0,Math.min(1,(x-x0)/180,(z-z0)/180,(z0+d-z)/180));
 const weights=[0,0,0];
 for(const a of areas){if(x<a.rect[0]||z<a.rect[1]||x>a.rect[2]||z>a.rect[3])continue;
  const c=['meadow','stubble','woodland'].indexOf(a.type),edge=Math.min(distance(x,z,a.points),...(a.holes||[]).map(h=>-distance(x,z,h)));
  weights[c]=Math.max(weights[c],Math.max(0,Math.min(1,edge/(c===2?18:9))));
 }
 weights[1]*=(1-weights[2])*(1-weights[0]);weights[0]*=1-weights[2];
 for(let c=0;c<3;c++){const value=Math.round(weights[c]*clearance*boundary*255);pixels[(j*width+i)*3+c]=value;counts[c]+=value/255;}
}
const {areas:outlines,...metadata}=source;
metadata.hectares=counts.map(v=>Number((v*w*d/width/height/10000).toFixed(2)));
metadata.licence='Original interpreted boundaries from bundled public-domain USDA NAIP / USGS airport.webp. Not a land-use survey.';
await sharp(pixels,{raw:{width,height,channels:3}}).png({compressionLevel:9,adaptiveFiltering:true}).toFile('assets/scenery/airport-countryside.png');
await fs.writeFile('assets/scenery/airport-countryside.json',JSON.stringify(metadata,null,2)+'\n');
console.log({hectares:metadata.hectares,bytes:(await fs.stat('assets/scenery/airport-countryside.png')).size});
