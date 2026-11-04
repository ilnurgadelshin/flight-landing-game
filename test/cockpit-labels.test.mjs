import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const bytes=await fs.readFile('assets/models/737-forward-labels.glb'),sourceBytes=await fs.readFile('assets/models/737-cockpit.glb');
const source=await io.readBinary(sourceBytes),labels=await io.readBinary(bytes),scene=labels.getRoot().listScenes()[0],meta=scene.getExtras();
assert.equal(meta.sourceHash,crypto.createHash('sha256').update(sourceBytes).digest('hex'),'Rebuild the derivative when the source changes');
assert.ok(bytes.length<150000,'Forward labels fit the existing low startup budget');
assert.equal(labels.getRoot().listTextures().length,1);assert.ok(meta.width*meta.height<=1048576,'Bound single-channel GPU footprint');
let triangles=0,sourceTriangles=0;
for(const node of labels.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;const m=node.getExtras(),original=source.getRoot().listNodes().find(n=>n.getName()===m.source).getMesh().listPrimitives()[0];
 assert.equal(m.vertexCount,original.getAttribute('POSITION').getCount());assert.equal(m.indexCount,original.getIndices().getCount());
 let end=0;for(const [start,count]of m.remove){assert.ok(start>=end&&count>0&&start%3===0&&count%3===0&&start+count<=m.indexCount);end=start+count;sourceTriangles+=count/3;}
 for(const p of mesh.listPrimitives()){
  for(const attr of p.listAttributes())for(const v of attr.getArray())assert.ok(Number.isFinite(v));
  assert.equal(p.getMaterial().getAlphaMode(),'BLEND');assert.equal(p.getAttribute('COLOR_0').getCount(),p.getAttribute('POSITION').getCount());
  triangles+=p.getIndices().getCount()/3;
 }
}
assert.ok(sourceTriangles>190000&&triangles<1000,'Restore the marks without their dense source geometry');
const texture=labels.getRoot().listTextures()[0],image=await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(image.info.width,meta.width);assert.equal(image.info.height,meta.height);
let visible=0;for(let i=3;i<image.data.length;i+=4)if(image.data[i])visible++;
assert.ok(visible>10000&&visible<meta.width*meta.height*.3,'Atlas contains sparse coverage with transparent separation');
console.log({glyphs:meta.glyphs,patches:meta.patches,triangles,sourceTriangles,bytes:bytes.length,coverageBytes:meta.width*meta.height});
