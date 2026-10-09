import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {groundCoverKind} from '../js/world/ground-cover.js';
import {TERRAIN} from '../js/physics/terrain.js';
const manifest=JSON.parse(await fs.readFile('assets/scenery/grass-patches.json'));
assert.equal(manifest.license,'CC0-1.0');assert.equal(manifest.columns*manifest.rows,8);
// One atlas: the low tier has no near-ground grass.
await assert.rejects(fs.stat('assets/scenery/grass-patches-low.webp'));
for(const [suffix,width,height,budget] of [['',1024,256,180000]]){
 const file=`assets/scenery/grass-patches${suffix}.webp`,{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.deepEqual([info.width,info.height],[width,height]);assert.ok((await fs.stat(file)).size<budget);
 const tw=width/4,th=height/2;
 for(let row=0;row<2;row++)for(let col=0;col<4;col++){
  let solid=0,bright=0;
  for(let y=row*th;y<(row+1)*th;y++)for(let x=col*tw;x<(col+1)*tw;x++){
   const i=(y*width+x)*4;if(data[i+3]>128){solid++;bright+=data[i]+data[i+1]+data[i+2];}
  }
  assert.ok(solid>tw*th*.12&&solid<tw*th*.8,'Each patch contains dense blades and transparent sky');
  assert.ok(bright/solid>100,'Photographed blade colours survived alpha repair');
 }
}
const empty={};assert.equal(groundCoverKind(empty,1200,-55),1);assert.equal(groundCoverKind(empty,4000,500),0,'Missing corridor keeps unmapped land unplanted');
for(let x=-1680;x<=1680;x+=13.1)for(let z=-100;z<110;z+=3.7)if(groundCoverKind(empty,x,z)){
 for(const dx of [-.65,.65])for(const dz of [-.65,.65])assert.equal(TERRAIN.surfaceAt(x+dx,z+dz),'grass','Whole blade cards remain off pavement');
}
for(const x of [-1450,-700,0,700,1450])for(const dx of [-50,0,50])assert.equal(groundCoverKind(empty,x+dx,72),0,'Rendered connector extent stays clear');
const field={approachCorridor:{sample:()=>[1,0,0]}};assert.equal(groundCoverKind(field,2350,330),2);
for(const name of ['approachSiteExcludes','approachBuildingExcludes','approachRoadExcludes'])assert.equal(groundCoverKind({...field,[name]:()=>true},2350,330),0);
for(const rgb of [[0,1,0],[0,0,1],[.5,.5,0],[0,0,0]])assert.equal(groundCoverKind({approachCorridor:{sample:()=>rgb}},2350,330),0,'Only strongly mapped meadow receives grass');
console.log('Ground-cover atlas alpha/size budgets, missing-map fallback, pavement and site exclusions passed');
