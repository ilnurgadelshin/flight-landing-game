import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
const compressed=await fs.readFile(new URL('../assets/weather/cumulus-density.bin.gz',import.meta.url));
assert.ok(compressed.length<100000,'Cloud density transfer stays below 100 KB');
const data=gunzipSync(compressed);
assert.equal(data.length,64**3*4,'Four bounded 64³ density fields');
const signatures=new Set();
for(let layer=0;layer<4;layer++){
  let filled=0,sum=0;
  for(let z=0;z<64;z++)for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const value=data[((layer*64+z)*64+y)*64+x];sum+=value;if(value)filled++;
    if([x,y,z].some(v=>v===0||v===63))assert.equal(value,0,'Empty border prevents filtering between cloud variants');
  }
  assert.ok(filled>5000&&filled<64**3*.6,'Each variant contains a bounded, nonempty cloud');signatures.add(sum);
}
assert.equal(signatures.size,4,'Distinct cloud variants');
const atlas=JSON.parse(await fs.readFile(new URL('../assets/scenery/tree-variety.json',import.meta.url)));
assert.deepEqual(atlas.elevations,[0,45,90]);assert.equal(atlas.species.length,9);
assert.equal(atlas.columns,8);assert.equal(atlas.geometrySource,'bundled near-tree GLBs');
for(const low of [false,true]){
  const file=`assets/scenery/tree-variety${low?'-low':''}.webp`,image=await sharp(file).metadata(),tile=low?atlas.lowTileSize:atlas.tileSize;
  assert.deepEqual([image.width,image.height],[atlas.columns*tile,atlas.rows*atlas.elevations.length*tile]);
  assert.ok(image.width*image.height<=(low?2e6:8e6),'More angles fit the bounded texture memory');
  assert.ok((await fs.stat(file)).size<(low?650000:2000000),'Bounded canopy transfer');
}
for(const form of atlas.species)assert.ok(form.frameScale>1&&form.frameScale<2&&form.aspect>.5&&form.aspect<1.5);
console.log('Weather density bounds, distinct variants and elevation-atlas framing passed');
