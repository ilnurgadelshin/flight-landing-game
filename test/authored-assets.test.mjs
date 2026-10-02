import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const facades=JSON.parse(await fs.readFile('assets/scenery/facade-sources.json'));
assert.equal(facades.length,2);
let high=0,low=0;
for(const asset of facades){
  assert.equal(asset.license,'CC0-1.0');assert.ok(Object.keys(asset.authors).length);
  high+=asset.bytes;low+=asset.lowBytes;
  for(const [file,bytes] of [[asset.file,asset.bytes],[asset.lowFile,asset.lowBytes]]){
    assert.equal((await fs.stat(file)).size,bytes);
    const doc=await io.read(file),modules=doc.getRoot().listScenes()[0].listChildren();
    assert.equal(modules.length,4);
    for(const module of modules){
      const {min,max}=getBounds(module);
      assert.ok(min.every(Number.isFinite)&&max.every(Number.isFinite));
      assert.ok(min[0]>-.01&&max[0]<1.01&&min[1]>-.02&&max[1]<1.02,'Normalized authored wall bay bounds');
      assert.ok(max[2]-min[2]>.01||module.getName()==='blank','Openings retain real depth');
    }
  }
}
assert.ok(high<2.6e6&&low<.7e6,'Bounded architecture transfer on both tiers');
const geometry=JSON.parse(await fs.readFile('assets/scenery/tree-geometry.json'));
for(const name of ['jacaranda_tree','island_tree_02']){
  const asset=geometry.assets.find(a=>a.name===name);assert.ok(asset);
  assert.equal((await fs.stat(asset.file)).size,asset.bytes);
  assert.ok(asset.bytes<1.7e6,'New near-tree payload budget, including leaf transparency');
  const doc=await io.read(asset.file),{min,max}=getBounds(doc.getRoot().listScenes()[0]);
  assert.ok(Math.abs(min[1])<.001&&Math.abs(max[1]-1)<.01,'Simplified tree retains ground contact and source height within 1%');
  assert.ok(asset.forms[0].triangles<=75000);
}
for(const asset of geometry.assets){
  const doc=await io.read(asset.file);
  for(const material of doc.getRoot().listMaterials())if(material.getAlphaMode()==='MASK'){
    const image=sharp(material.getBaseColorTexture().getImage());
    assert.ok((await image.metadata()).hasAlpha,'Leaf silhouette mask must survive texture compression');
    const stats=await image.stats();assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);
  }
}
console.log('Authored facade bounds, opening depth, source records and new tree delivery budgets passed');
