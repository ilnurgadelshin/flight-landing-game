import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {protectedScenery} from '../js/world/scenery-ground.js';
import {packCover,featherMissingHills,joinOppositeHills} from '../js/world/approach-corridor.js';

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
for(const [x,z] of [[3500,980],[3600,950],[3800,900],[3900,950]])assert.ok(sample(x,z)[2]>.9,'The omitted forest connects to the hillside');
for(const [x,z] of [[3100,970],[3300,920],[3500,850]])assert.ok(sample(x,z)[2]<.1,'Gardens beside the lane remain outside the new woodland trace');
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
// Low quality omits the hill tile: the same decoded mask must gradually end both
// the ground treatment and its planting, without altering the baked high-tier join.
const lowRgba=Buffer.from(rgba);featherMissingHills(lowRgba,manifest);
const lowCover=packCover(lowRgba,count),pixel=(x,z)=>Math.floor((z-z0)/depth*info.height)*info.width+Math.floor((x-x0)/width*info.width);
for(const x of [4300,4600,4900]){
 const ramp=[990,1004,1016,1028].map(z=>lowCover(pixel(x,z))[2]);
 assert.ok(ramp[0]>.03&&ramp[0]<.2&&ramp.at(-1)===0,'The low-tier edge reaches zero gradually');
 assert.ok(ramp.every((v,i)=>i===0||v<=ramp[i-1]),'No bright band along the outer fade');
 assert.ok(cover(pixel(x,1028))[2]>.6,'The source high-tier join remains opaque');
}
assert.ok(lowRgba.subarray(0,pixel(x0,870)*4).equals(rgba.subarray(0,pixel(x0,870)*4)),'Interior cover stays byte-identical');
for(const [x,z] of [[3370,-650],[7550,-400],[8500,1000],[5600,1028]])assert.deepEqual(lowCover(pixel(x,z)),cover(pixel(x,z)),'Fields and other map boundaries remain unchanged');
console.log('Corridor coverage, airport clearance, registration, transfer budget and exact packed cover passed');

// The opposite hill occupies unused atlas columns. It must neither enlarge the
// upload nor overwrite the original tile, and its fields must remain unplanted.
const o=manifest.oppositeHills,other=await sharp(root+'.png').extract({left:o.atlas[0],top:o.atlas[1],width:o.width,height:o.height}).ensureAlpha().raw().toBuffer();
assert.equal(manifest.textureHeight,1277);assert.equal(o.atlas[1],h.atlas[1]);assert.ok(o.atlas[0]>=h.width+6&&o.atlas[0]+o.width<=manifest.width);
assert.deepEqual(o.bounds,[2100,-2500,3200,1500]);assert.equal(o.plantingZones[0].lowLimit,0);assert.equal(o.plantingZones[0].highLimit,6000);
const opposite=(x,z)=>{const i=Math.floor((x-o.bounds[0])/o.bounds[2]*o.width),j=Math.floor((z-o.bounds[1])/o.bounds[3]*o.height);return [0,1,2].map(c=>other[(j*o.width+i)*4+c]/255)};
for(const p of [[2500,-2100],[3200,-1800],[2700,-1200]])assert.ok(opposite(...p)[2]>.9,'The bare photographed ridge now has woodland');
for(const p of [[4120,-2240],[4640,-1820],[4740,-1300]])assert.ok(opposite(...p)[0]+opposite(...p)[1]>.7&&opposite(...p)[2]===0,'Fields on the slope retain open cover');
const oppositeTotals=[0,0,0];for(let i=0;i<other.length;i+=4){assert.ok(other[i]+other[i+1]+other[i+2]<=256);for(let c=0;c<3;c++)oppositeTotals[c]+=other[i+c]/255*o.bounds[2]*o.bounds[3]/o.width/o.height/10000;}
for(let c=0;c<3;c++)assert.ok(Math.abs(oppositeTotals[c]-o.hectares[c])<.01);
const joined=Buffer.from(rgba);joinOppositeHills(joined,manifest,other);const joinedCover=packCover(joined,count);
for(const x of [2450,2500,2600])for(let z=-1028;z<=-960;z+=4)assert.ok((z< -1000?opposite(x,z):joinedCover(pixel(x,z)))[2]>.6,'No cover gap at the north join');
assert.ok(joined.subarray(15*manifest.width*4).equals(rgba.subarray(15*manifest.width*4)),'The north join only edits the first 30 m; older fields and the south join remain intact');
for(let j=0;j<h.height;j++)for(let g=0;g<6;g++){
 const row=(h.atlas[1]+j)*manifest.width,from=row+(g<3?h.width-1:o.atlas[0]);
 assert.ok(full.subarray((row+h.width+g)*3,(row+h.width+g+1)*3).equals(full.subarray(from*3,(from+1)*3)),'Horizontal gutter repeats adjacent tile edges');
}
console.log('Opposite hill cover, retained fields, shared atlas, bounded allocation and high-only join passed');

// Upper slope overlays share the atlas and blend into both older maps on high.
const {validateUpperSlopes,upperSlopeBlend}=await import('../js/world/upper-slopes.js');
validateUpperSlopes(manifest);
const upperPixels=await Promise.all(manifest.upperSlopes.map(t=>sharp(root+'.png').extract({left:t.atlas[0],top:t.atlas[1],width:t.width,height:t.height}).raw().toBuffer()));
const upperSample=(x,z)=>{
 let base=x<5300?(z< -1000?opposite(x,z):z>=1030?[0,0,hillside(x,z)]:[0,1,2].map(c=>data[pixel(x,z)*3+c]/255)):z>=-1000&&z<1030?[0,1,2].map(c=>data[pixel(x,z)*3+c]/255):[0,0,0];
 for(const [k,t] of manifest.upperSlopes.entries()){
  const blend=upperSlopeBlend(t,x,z);if(!blend)continue;
  const [tx,tz,tw,td]=t.bounds,i=Math.floor((x-tx)/tw*t.width),j=Math.floor((z-tz)/td*t.height);
  base=base.map((v,c)=>v+(upperPixels[k][(j*t.width+i)*3+c]/255-v)*blend);
 }
 return base;
};
for(const [k,t] of manifest.upperSlopes.entries()){
 const p=upperPixels[k],sums=[0,0,0];
 for(let i=0;i<p.length;i+=3){assert.ok(p[i]+p[i+1]+p[i+2]<=256);for(let c=0;c<3;c++)sums[c]+=p[i+c]/255;}
 for(let c=0;c<3;c++)assert.ok(Math.abs(sums[c]*t.bounds[2]*t.bounds[3]/t.width/t.height/10000-t.hectares[c])<.01);
 assert.equal(t.plantingZones[0].lowLimit,0);
 for(let j=0;j<t.height;j++)for(let g=0;g<6;g++){
  const row=(t.atlas[1]+j)*manifest.width,from=row+(g<3?t.atlas[0]-7:t.atlas[0]);
  assert.ok(full.subarray((row+t.atlas[0]-6+g)*3,(row+t.atlas[0]-5+g)*3).equals(full.subarray(from*3,(from+1)*3)));
 }
}
for(const [x,z] of [[6500,1650],[7500,1800],[8100,-1300]])assert.ok(upperSample(x,z)[2]>.9,'Upper wooded slopes have connected cover');
for(const [x,z] of [[6300,-2250],[7425,-2250],[6080,-1025]])assert.ok(upperSample(x,z)[0]>.7&&upperSample(x,z)[2]<.1,'Contour pastures remain open');
for(const [x,z] of [[6630,-1875],[7240,-2137]])assert.ok(upperSample(x,z)[1]>.7,'Harvested strips retain separate cover');
for(const [x,z] of [[5790,1830],[8480,2120],[7000,-1200]])assert.ok(upperSample(x,z)[2]<.1,'Residential clearings remain open');
for(const x of [6500,8000])for(let z=860;z<1080;z+=10)assert.ok(upperSample(x,z)[2]>.6,'No bare band between close and upper south woods');
for(let x=5110;x<5400;x+=10)assert.ok(upperSample(x,1650)[2]>.65,'No bare band at the previous hillside end');
for(const mutate of [m=>m.upperSlopes[1].atlas[0]=m.upperSlopes[0].atlas[0],m=>m.upperSlopes[0].width=2000,m=>m.upperSlopes[0].bounds[0]++,m=>m.upperSlopes[0].plantingZones[0].highLimit=8000,m=>m.upperSlopes[0].plantingZones[0].lowLimit=1,m=>m.upperSlopes[0].plantingZones[0].bounds[0]=5100]){
 const bad=structuredClone(manifest);mutate(bad);assert.throws(()=>validateUpperSlopes(bad),/Invalid upper slope/);
}
const legacy=structuredClone(manifest);delete legacy.upperSlopes;assert.doesNotThrow(()=>validateUpperSlopes(legacy));
console.log('Upper slope land use, atlas bounds, overlapping joins and allocation guards passed');
