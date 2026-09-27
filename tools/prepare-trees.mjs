// Reduce the already-downloaded CC0 source models for bounded near-camera LOD.
// Alpha is bundled into the glTF base colour instead of relying on a Three-only alphaMap.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten,getBounds,prune,dedup,weld,simplifyPrimitive,meshopt,transformPrimitive} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import fs from 'node:fs/promises';
import sharp from 'sharp';
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const assets=['tree_small_02','pine_sapling_small','fir_sapling_medium'];
const stats=[];
for(const name of assets){
  const folder=name==='tree_small_02'?'test/output/tree-source':`test/output/tree-variety-source/${name}`;
  const doc=await io.read(`${folder}/tree.gltf`);
  await doc.transform(flatten());
  for(const node of doc.getRoot().listNodes()){
    const mesh=node.getMesh();if(!mesh)continue;
    const {min,max}=getBounds(node),height=max[1]-min[1],center=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
    const matrix=node.getWorldMatrix();
    for(const p of mesh.listPrimitives()){
      transformPrimitive(p,matrix);
      transformPrimitive(p,[1/height,0,0,0,0,1/height,0,0,0,0,1/height,0,-center[0]/height,-center[1]/height,-center[2]/height,1]);
    }
    node.setTranslation([0,0,0]).setRotation([0,0,0,1]).setScale([1,1,1]);
  }
  const alpha=await sharp(`${folder}/leaves-alpha.png`).greyscale().raw().toBuffer();
  for(const material of doc.getRoot().listMaterials()){
    material.setMetallicFactor(0).setRoughnessFactor(1);
    material.setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    for(const extension of material.listExtensions())material.setExtension(extension.extensionName,null);
    if(/leaves|twig/.test(material.getName())){
      const texture=material.getBaseColorTexture(),{width,height}=await sharp(texture.getImage()).metadata();
      texture.setImage(await sharp(texture.getImage()).removeAlpha().joinChannel(alpha,{raw:{width,height,channels:1}}).png().toBuffer()).setMimeType('image/png');
      material.setAlphaMode('MASK').setAlphaCutoff(.35).setDoubleSided(true);
    }
  }
  await doc.transform(prune(),dedup(),weld());
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
    const triangles=primitive.getIndices().getCount()/3,foliage=/leaves|twig/.test(primitive.getMaterial().getName());
    // Needle clusters lose their coverage much sooner than broad leaves. Retain
    // more of those small disconnected surfaces; runtime budgets bound the cost.
    const foliageRatio=name==='tree_small_02'?.08:name==='fir_sapling_medium'?.18:.15;
    const target=foliage?Math.max(1800,triangles*foliageRatio):Math.max(600,triangles*.035);
    simplifyPrimitive(primitive,{simplifier:MeshoptSimplifier,ratio:Math.min(1,target/triangles),error:.005});
  }
  await doc.transform(prune());
  for(const texture of doc.getRoot().listTextures()){
    const image=sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true});
    const hasAlpha=(await image.metadata()).hasAlpha;
    texture.setImage(await (hasAlpha?image.png({palette:true,quality:95,dither:0}):image.jpeg({quality:84})).toBuffer())
      .setMimeType(hasAlpha?'image/png':'image/jpeg');
  }
  const forms=doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>({name:n.getName(),triangles:n.getMesh().listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0)}));
  await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14}));
  const file=`assets/scenery/${name}-near.glb`;await io.write(file,doc);
  stats.push({name,file,source:`https://polyhaven.com/a/${name}`,bytes:(await fs.stat(file)).size,forms});console.log(stats.at(-1));
}
await fs.writeFile('assets/scenery/tree-geometry.json',JSON.stringify({license:'CC0-1.0',assets:stats},null,2)+'\n');
