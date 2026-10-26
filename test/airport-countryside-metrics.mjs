// Compare an archived baseline with the working maps and matched captures.
// REVIEW_ROOT=/path/to/baseline node test/airport-countryside-metrics.mjs
import fs from 'node:fs/promises';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {packCover,joinOppositeHills} from '../js/world/approach-corridor.js';
import {airportCountryBlend} from '../js/world/airport-countryside.js';
import {upperSlopeBlend} from '../js/world/upper-slopes.js';
const root=process.env.REVIEW_ROOT;if(!root)throw new Error('Set REVIEW_ROOT to the archived baseline');
const load=async root=>{
 const path=root+'/assets/scenery/approach-corridor',m=JSON.parse(await fs.readFile(path+'.json'));
 const tiles=[{bounds:m.bounds,width:m.width,height:m.height,atlas:[0,0]},m.hills,m.oppositeHills,...(m.upperSlopes||[])];
 const rgba=await Promise.all(tiles.map(t=>sharp(path+'.png').extract({left:t.atlas[0],top:t.atlas[1],width:t.width,height:t.height}).ensureAlpha().raw().toBuffer()));
 const baked=rgba.map(p=>Buffer.from(p));joinOppositeHills(rgba[0],m,rgba[2]);
 const packed=rgba.map((p,i)=>packCover(p,tiles[i].width*tiles[i].height));
 const at=(k,x,z)=>{
  const t=tiles[k],[tx,tz,tw,td]=t.bounds,i=Math.floor((x-tx)/tw*t.width),j=Math.floor((z-tz)/td*t.height);
  return i<0||j<0||i>=t.width||j>=t.height?null:packed[k](j*t.width+i);
 };
 const sample=(x,z)=>{
  const base=at(0,x,z)||at(1,x,z)||at(2,x,z)||[0,0,0];
  for(let k=3;k<tiles.length;k++){
   const blend=upperSlopeBlend(tiles[k],x,z);if(!blend)continue;
   const c=at(k,x,z);return base.map((v,i)=>v+(c[i]-v)*blend);
  }return base;
 };
 return {m,baked,sample,bytes:(await fs.stat(path+'.png')).size+(await fs.stat(path+'.json')).size};
};
const [before,after]=await Promise.all([load(root),load(process.cwd())]);
const retained=before.baked.map((b,i)=>b.equals(after.baked[i]));assert.ok(retained.every(Boolean),'Older maps stay byte-identical');
const airport=JSON.parse(await fs.readFile('assets/scenery/airport-countryside.json'));
const airportData=await sharp('assets/scenery/airport-countryside.png').ensureAlpha().raw().toBuffer();
const airportCover=packCover(airportData,airport.width*airport.height);
const [x0,z0,w,d]=airport.bounds,delta=[0,0,0];
// Integrate the effective new contribution on a 2m grid; subtract the previous
// cover in the 180m join, instead of counting overlapping maps twice.
for(let x=x0+1;x<x0+w;x+=2)for(let z=z0+1;z<z0+d;z+=2){
 const blend=airportCountryBlend(airport,x,z),i=Math.floor((x-x0)/w*airport.width),j=Math.floor((z-z0)/d*airport.height),a=airportCover(j*airport.width+i),b=before.sample(x,z);
 for(let k=0;k<3;k++)delta[k]+=(a[k]-b[k])*blend*4/10000;
}
const bytesAdded=(await fs.stat('assets/scenery/airport-countryside.json')).size+(await fs.stat('assets/scenery/airport-countryside.png')).size;
const diffs=[];
for(const tier of ['high','low'])for(const view of ['captain-4000','captain-3000','captain-2200','airport-country-north','airport-country-south','airport-overcast','airport-night']){
 const images=await Promise.all(['before','after'].map(s=>sharp(`test/output/airport-countryside-${s}-${tier}-${view}.png`).removeAlpha().raw().toBuffer()));
 let changed=0,visible=0,sum=0;for(let i=0;i<images[0].length;i+=3){let max=0;for(let c=0;c<3;c++){const d=Math.abs(images[0][i+c]-images[1][i+c]);sum+=d;max=Math.max(max,d);}changed+=max>0;visible+=max>12;}
 const pixels=images[0].length/3;diffs.push({tier,view,changedPercent:100*changed/pixels,visibleChangePercent:100*visible/pixels,meanRgbDelta:sum/images[0].length});
 if(tier==='low')assert.equal(changed,0,`Low ${view} remains pixel-identical`);
}
const report={olderBakedMapsUnchanged:retained,atlas:[after.m.width,after.m.textureHeight],bytesBefore:before.bytes,bytesAfter:after.bytes+bytesAdded,transferDelta:bytesAdded,netHectares:delta,netTotalHectares:delta.reduce((s,n)=>s+n,0),airportMask:[airport.width,airport.height],method:'Net high-tier coverage change on a 2m grid over the airport rectangle, subtracting prior coverage within the 180m join.',diffs};
await fs.writeFile('test/output/airport-countryside-metrics.json',JSON.stringify(report,null,2)+'\n');console.log(report);
