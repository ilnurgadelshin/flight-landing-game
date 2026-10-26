import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {airportCountryBlend,validateAirportCountryside} from '../js/world/airport-countryside.js';
import {protectedScenery} from '../js/world/scenery-ground.js';
const root='assets/scenery/airport-countryside',m=JSON.parse(await fs.readFile(root+'.json'));
validateAirportCountryside(m);
const {data,info}=await sharp(root+'.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.deepEqual([info.width,info.height,info.channels],[m.width,m.height,3]);
assert.ok((await fs.stat(root+'.png')).size+(await fs.stat(root+'.json')).size<60000,'Bounded optional airport download');
assert.ok(m.licence.includes('Not a land-use survey'));
const [x0,z0,w,d]=m.bounds,totals=[0,0,0];
for(let j=0;j<m.height;j++)for(let i=0;i<m.width;i++){
 const x=x0+(i+.5)*w/m.width,z=z0+(j+.5)*d/m.height,p=(j*m.width+i)*3;
 assert.ok(data[p]+data[p+1]+data[p+2]<=256,'Weights do not add more than full cover');
 if(protectedScenery(x,z,24))assert.equal(data[p]+data[p+1]+data[p+2],0,'The airport and approach lights stay clear');
 for(let c=0;c<3;c++)totals[c]+=data[p+c]/255*w*d/m.width/m.height/10000;
}
for(let c=0;c<3;c++)assert.ok(totals[c]>50&&Math.abs(totals[c]-m.hectares[c])<.01,'Reproducible substantial parcels');
const sample=(x,z)=>{const i=Math.floor((x-x0)/w*m.width),j=Math.floor((z-z0)/d*m.height);return Array.from(data.subarray((j*m.width+i)*3,(j*m.width+i)*3+3));};
assert.ok(sample(-1500,-2100)[1]>200,'North harvested parcel');
assert.ok(sample(350,-1600)[0]>200,'North pasture');
assert.ok(sample(1800,-1500)[2]>200,'North woods connect to final');
assert.ok(sample(1800,2100)[2]>200,'South woodland remains outside the farm valley');
assert.ok(sample(-500,1950)[1]>200,'South harvested fields');
assert.equal(sample(0,0).reduce((a,b)=>a+b),0);
assert.equal(airportCountryBlend(m,2000,1400),1);assert.equal(airportCountryBlend(m,2190,1400),.5);
for(const point of [[2280,1400],[-2101,1400],[1500,-2501],[1500,2500]])assert.equal(airportCountryBlend(m,...point),0);
for(const change of [x=>x.width=0,x=>x.height=2048,x=>x.bounds[0]=NaN,x=>x.join=[0,1],x=>x.plantingZones[0].highLimit=100000,x=>x.plantingZones[1].bounds[0]=0,x=>x.plantingZones[0].highSpacing=NaN,x=>x.plantingZones[0].strictBounds=false]){
 const bad=structuredClone(m);change(bad);assert.throws(()=>validateAirportCountryside(bad),/Invalid airport/);
}
console.log('Airport countryside registration, coverage, clearance and allocation checks passed');
