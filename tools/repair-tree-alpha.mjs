// Repair legacy delivered near-tree textures without changing their geometry.
// Fresh prepare-trees.mjs output now preserves alpha; this also updates existing
// optimized files without repeating their geometry reduction.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const report=JSON.parse(await fs.readFile('assets/scenery/tree-geometry.json'));
for(const asset of report.assets.filter(a=>['tree_small_02','pine_sapling_small','fir_sapling_medium'].includes(a.name))){
  const folder=asset.name==='tree_small_02'?'test/output/tree-source':`test/output/tree-variety-source/${asset.name}`;
  const doc=await io.read(asset.file);let changed=false;
  for(const material of doc.getRoot().listMaterials())if(material.getAlphaMode()==='MASK'){
    const texture=material.getBaseColorTexture(),meta=await sharp(texture.getImage()).metadata();
    if(meta.hasAlpha)continue;
    const alpha=await sharp(`${folder}/leaves-alpha.png`).resize(meta.width,meta.height).removeAlpha().greyscale().raw().toBuffer();
    texture.setImage(await sharp(texture.getImage()).joinChannel(alpha,{raw:{width:meta.width,height:meta.height,channels:1}})
      .webp({quality:88,alphaQuality:100}).toBuffer()).setMimeType('image/webp');changed=true;
  }
  if(changed)await io.write(asset.file,doc);
  asset.bytes=(await fs.stat(asset.file)).size;console.log(asset.name,asset.bytes,changed?'alpha repaired':'already masked');
}
await fs.writeFile('assets/scenery/tree-geometry.json',JSON.stringify(report,null,2)+'\n');
