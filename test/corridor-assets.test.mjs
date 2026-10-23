import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {protectedScenery} from '../js/world/scenery-ground.js';
import {packCover} from '../js/world/approach-corridor.js';

const root='assets/scenery/approach-corridor',manifest=JSON.parse(await fs.readFile(root+'.json'));
const metadata=await sharp(root+'.png').metadata();
assert.deepEqual([metadata.width,metadata.height],[manifest.width,manifest.textureHeight]);
const {data,info}=await sharp(root+'.png').extract({left:0,top:0,width:manifest.width,height:manifest.height}).removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.deepEqual([info.width,info.height,info.channels],[manifest.width,manifest.height,3]);
assert.ok((await fs.stat(root+'.png')).size+(await fs.stat(root+'.json')).size<450000,'Extended valley land cover stays below 450 KB');
assert.ok(manifest.licence.includes('Not a land-use survey'));
const [x0,z0,width,depth]=manifest.bounds,totals=[0,0,0];
for(let j=0;j<info.height;j++)for(let i=0;i<info.width;i++){
  const p=(j*info.width+i)*3,sum=data[p]+data[p+1]+data[p+2];
  assert.ok(sum<=256,'Blended cover never brightens a surface beyond full coverage');
  if(protectedScenery(x0+(i+.5)*width/info.width,z0+(j+.5)*depth/info.height,16))assert.equal(sum,0,'Runway and airport clearance');
  for(let c=0;c<3;c++)totals[c]+=data[p+c]/255*width/info.width*depth/info.height/10000;
}
for(let c=0;c<3;c++)assert.ok(Math.abs(totals[c]-manifest.hectares[c])<.01&&totals[c]>5,'Substantial, reproducible mapped area');
const sample=(x,z)=>{
  const i=Math.floor((x-x0)/width*info.width),j=Math.floor((z-z0)/depth*info.height);
  if(i<0||j<0||i>=info.width||j>=info.height)return [0,0,0];
  return [0,1,2].map(c=>data[(j*info.width+i)*3+c]/255);
};
assert.ok(sample(2350,330)[0]>.8,'Close review lies in the reconstructed meadow');
assert.ok(sample(4500,700)[2]>.8&&sample(5500,550)[2]>.8,'Extended woodland is covered by the shared map');
assert.ok(manifest.bounds[2]>=6900&&manifest.width<=4096&&manifest.width*manifest.height<=4096*1024,'Extended coverage retains a bounded data texture');
assert.ok(sample(3370,-650)[0]>.8,'Opposite pasture is reconstructed');
assert.ok(sample(3650,-560)[2]>.8,'Opposite wooded margin is reconstructed');
assert.ok(sample(4560,-891)[0]>.8&&sample(5650,-666)[0]>.8,'Upper approach pastures are reconstructed');
assert.ok(sample(4314,-626)[1]>.8,'The upper harvested field keeps its own cover');
assert.ok(sample(4100,-756)[0]>.8&&sample(4100,-711)[1]>.8,'Curved crop strips remain distinct across the planting-zone boundary');
assert.ok(sample(5774,-216)[2]>.8,'The upper woodland replaces flat photographic trees');
assert.ok(sample(4740,-80)[2]>.8&&sample(4990,90)[2]>.8,'Wooded parcels continue across the approach crossing');
assert.ok(sample(4510,-70)[0]>.8,'The pasture beside the crossing lane remains open');
for(const site of JSON.parse(await fs.readFile('assets/scenery/approach-sites.json')).sites)for(const tree of site.trees){
 const cover=sample(tree.x,tree.z);assert.ok(cover[0]+cover[1]<=.6,'Placed garden trees keep mapped fields open');
}
for(const [x,z] of [[6500,600],[7500,600],[8500,600],[6500,-400],[7800,-800],[8500,-600]])assert.ok(sample(x,z)[2]>.8,'Upper valley woodland follows both sides of final');
assert.ok(sample(7550,-400)[1]>.8,'The large upper harvested clearing stays open');
assert.ok(sample(8660,-760)[0]>.8&&sample(8200,-445)[0]>.8,'Clearings inside woodland polygons remain meadows');
assert.equal(manifest.plantingZones.length,5);
assert.deepEqual(manifest.plantingZones[0],{bounds:[2100,180,4000,850],seed:94051,highLimit:13000,lowLimit:5800},'Denser upper woodland has a bounded share of the existing total tree budget');
assert.deepEqual(manifest.plantingZones[1],{bounds:[2100,-1000,2000,820],seed:77021,highLimit:5500,lowLimit:2600},'Close opposite canopy retains its planting allocation');
assert.deepEqual(manifest.plantingZones[2],{bounds:[4100,-1000,2000,820],seed:62039,highLimit:3500,lowLimit:1400},'New central planting must not thin the existing upper-opposite stand');
assert.deepEqual(manifest.plantingZones[4],{bounds:[4400,-180,900,360],seed:261022,highLimit:700,lowLimit:300,highSpacing:12,lowSpacing:18});
assert.ok(manifest.plantingZones.reduce((sum,z)=>sum+z.highLimit,0)<=40700&&manifest.plantingZones.reduce((sum,z)=>sum+z.lowLimit,0)<=12700);
assert.deepEqual(manifest.plantingZones[3].bounds,[6100,-1000,2900,2030]);
assert.ok(manifest.plantingZones[3].highSpacing>=16&&manifest.plantingZones[3].lowSpacing>=30,'The extension uses wider spacing without increasing the whole-world tree budget');
// The packed placement copy returns exactly what the decoded RGBA pixels give, every pixel.
const rgba=(await sharp(root+'.png').extract({left:0,top:0,width:manifest.width,height:manifest.height}).ensureAlpha().raw().toBuffer()),count=info.width*info.height,cover=packCover(rgba,count);
for(let i=0;i<count;i++){const c=cover(i);for(let k=0;k<3;k++)if(c[k]!==rgba[i*4+k]/255)assert.fail(`Packed cover differs at pixel ${i}`);}
// The hillside uses a coarser tile, never a resampling of the close 2 m mask.
const h=manifest.hills,hill=await sharp(root+'.png').extract({left:h.atlas[0],top:h.atlas[1],width:h.width,height:h.height}).raw().toBuffer();
assert.deepEqual(h.bounds,[2100,1030,3200,1470]);assert.equal(h.width*h.height,262144);
const hillside=(x,z)=>hill[(Math.floor((z-h.bounds[1])/h.bounds[3]*h.height)*h.width+Math.floor((x-h.bounds[0])/h.bounds[2]*h.width))*3+2]/255;
for(const [x,z] of [[2800,2000],[3600,1700],[4300,1800]])assert.ok(hillside(x,z)>.9,'Pilot-visible wooded slopes have mapped cover');
for(const [x,z] of [[2450,1220],[2800,1350],[4560,1460],[3890,1870]])assert.equal(hillside(x,z),0,'Photographed fields and clearings stay open');
const hillTotal=[0,0,0];for(let i=0;i<hill.length;i+=3){assert.ok(hill[i]+hill[i+1]+hill[i+2]<=255);for(let c=0;c<3;c++)hillTotal[c]+=hill[i+c]/255;}
for(let c=0;c<3;c++)assert.ok(Math.abs(hillTotal[c]*h.bounds[2]*h.bounds[3]/h.width/h.height/10000-h.hectares[c])<.01);
assert.ok(manifest.width*manifest.textureHeight<=4500000,'Bounded combined GPU atlas');
assert.ok(h.plantingZones.reduce((n,z)=>n+z.highLimit,0)<=8000&&h.plantingZones.reduce((n,z)=>n+z.lowLimit,0)<=1000);
assert.equal(h.plantingZones[0].lowLimit,0,'The hillside is high quality only: phones keep their background trees');
// A gutter of repeated edge rows separates the two maps, so filtering never blends them.
const full=await sharp(root+'.png').raw().toBuffer(),rowAt=r=>full.subarray(r*manifest.width*3,(r+1)*manifest.width*3);
assert.ok(h.atlas[1]>manifest.height&&manifest.textureHeight===h.atlas[1]+h.height);
for(let r=manifest.height;r<h.atlas[1];r++)assert.ok(rowAt(r).equals(rowAt(r-manifest.height<(h.atlas[1]-manifest.height)/2?manifest.height-1:h.atlas[1])),'Gutter rows repeat the adjacent map edge');
// Where both maps have woods, the cover runs on across their join (z=1030) without a gap:
// above 0.6 everywhere, so trees are planted right across it.
const close=(x,z)=>data[(Math.floor((z-manifest.bounds[1])/manifest.bounds[3]*manifest.height)*manifest.width+Math.floor((x-manifest.bounds[0])/manifest.bounds[2]*manifest.width))*3+2]/255;
for(const x of [4300,4600,4900])for(let z=990;z<=1070;z+=4){
 const woods=z<1030?close(x,z):hillside(x,z);assert.ok(woods>.6,`Continuous woods across the join at ${x}, ${z}: ${woods.toFixed(2)}`);
}
console.log('Corridor coverage, airport clearance, registration, transfer budget and exact packed cover passed');
