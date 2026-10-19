import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {CUMULUS_SIZE as size,CUMULUS_VARIANTS as variants,CUMULUS_DIMENSIONS as dimensions,CUMULUS_BYTES} from '../js/world/cumulus-layout.js';
const compressed=await fs.readFile(new URL('../assets/weather/cumulus-density.bin.gz',import.meta.url));
assert.ok(compressed.length<250000,'Cloud density transfer stays below 250 KB');
const data=gunzipSync(compressed);
assert.equal(data.length,CUMULUS_BYTES,'Complete packed density texture');
assert.ok(dimensions.every(n=>n<=256),'Fits the WebGL2 minimum 3D texture dimensions');
assert.ok(data.length<=3.1e6,'Bounded CPU/GPU density storage');
const signatures=new Set();
const volumes=[];
for(let layer=0;layer<variants;layer++){
  let filled=0,sum=0;
  const volume=[];
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=layer%2*size+x,pz=Math.floor(layer/2)*size+z;
    const value=data[(pz*dimensions[1]+y)*dimensions[0]+px];sum+=value;if(value)filled++;volume.push(value);
    if([x,y,z].some(v=>v===0||v===size-1))assert.equal(value,0,'Empty border prevents filtering between cloud variants');
    if(y/(size-1)-.5<-.29)assert.equal(value,0,'No density below the bounded condensation base');
  }
  assert.ok(filled>5000&&filled<size**3*.6,'Each variant contains a bounded, nonempty cloud');signatures.add(sum);volumes.push(volume);
}
assert.equal(signatures.size,variants,'Distinct cloud variants');
for(let a=0;a<variants;a++)for(let b=a+1;b<variants;b++){
 let intersection=0,union=0;
 for(let i=0;i<volumes[a].length;i++){intersection+=Math.min(volumes[a][i],volumes[b][i]);union+=Math.max(volumes[a][i],volumes[b][i]);}
 assert.ok(intersection/union<.85,'Variants differ in occupied volume, not just a small noise seed');
}
const atlas=JSON.parse(await fs.readFile(new URL('../assets/scenery/tree-variety.json',import.meta.url)));
assert.deepEqual(atlas.elevations,[0,45,90]);assert.equal(atlas.species.length,9);
assert.equal(atlas.columns,8);assert.equal(atlas.geometrySource,'bundled near-tree GLBs');
for(const low of [false,true]){
  const file=`assets/scenery/tree-variety${low?'-low':''}.webp`,image=await sharp(file).metadata(),tile=low?atlas.lowTileSize:atlas.tileSize;
  assert.deepEqual([image.width,image.height],[atlas.columns*tile,atlas.rows*atlas.elevations.length*tile]);
  assert.ok(image.width*image.height<=(low?2e6:8e6),'More angles fit the bounded texture memory');
  assert.ok((await fs.stat(file)).size<(low?650000:2000000),'Bounded canopy transfer');
  const responseFile=`assets/scenery/tree-light-response${low?'-low':''}.webp`,responseTile=low?atlas.lowResponseTileSize:atlas.responseTileSize;
  const response=await sharp(responseFile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([response.info.width,response.info.height],[atlas.columns*responseTile,atlas.rows*atlas.elevations.length*responseTile]);
  assert.ok((await fs.stat(responseFile)).size<(low?230000:700000),'Directional response stays smaller than the colour atlas');
  for(let row=0;row<atlas.rows*atlas.elevations.length;row++)for(let col=0;col<atlas.columns;col++){
    let count=0,bad=0;
    for(let y=row*responseTile;y<(row+1)*responseTile;y++)for(let x=col*responseTile;x<(col+1)*responseTile;x++){
      const i=(y*response.info.width+x)*4;if(response.data[i+3]<32)continue;count++;
      const length=Math.hypot(...[0,1,2].map(c=>response.data[i+c]/127.5-1));
      // Filtered leaves may cancel, but opaque data must not have the >1.4
      // lengths caused by accidentally unpremultiplying directional data as colour.
      if(length>1.4)bad++;
    }
    assert.ok(count>5&&bad/count<.02,`Valid directional response in view ${row}/${col}`);
  }
}
for(const form of atlas.species)assert.ok(form.frameScale>1&&form.frameScale<2&&form.aspect>.5&&form.aspect<1.5);
console.log('Weather density bounds, distinct variants and elevation-atlas framing passed');
