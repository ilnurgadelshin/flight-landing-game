import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {protectedScenery} from '../js/world/scenery-ground.js';

const root='assets/scenery/approach-corridor',manifest=JSON.parse(await fs.readFile(root+'.json'));
const {data,info}=await sharp(root+'.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.deepEqual([info.width,info.height,info.channels],[manifest.width,manifest.height,3]);
assert.ok((await fs.stat(root+'.png')).size+(await fs.stat(root+'.json')).size<100000,'Shared land cover stays below 100 KB');
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
console.log('Corridor coverage, airport clearance, registration and transfer budget passed');
