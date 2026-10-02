// Two additional CC0 crown silhouettes, reduced for the existing bounded tree pool.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,transformPrimitive,prune,dedup,weld,simplifyPrimitive,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const report=JSON.parse(await fs.readFile('assets/scenery/tree-geometry.json'));
for(const name of ['jacaranda_tree','island_tree_02']){
  const folder=`test/output/authored-sources/${name}`,doc=await io.read(`${folder}/source.gltf`);
  for(const node of doc.getRoot().listNodes()){
    if(!node.getMesh())continue;
    const {min,max}=getBounds(node),height=max[1]-min[1],center=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2],matrix=node.getWorldMatrix();
    for(const p of node.getMesh().listPrimitives()){
      transformPrimitive(p,matrix);
      transformPrimitive(p,[1/height,0,0,0,0,1/height,0,0,0,0,1/height,0,-center[0]/height,-center[1]/height,-center[2]/height,1]);
      p.setAttribute('TANGENT',null);
    }
    node.setTranslation([0,0,0]).setRotation([0,0,0,1]).setScale([1,1,1]);
  }
  for(const material of doc.getRoot().listMaterials()){
    material.setMetallicFactor(0).setRoughnessFactor(1).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    for(const extension of material.listExtensions())material.setExtension(extension.extensionName,null);
    if(/leaves/.test(material.getName())){
      const t=material.getBaseColorTexture(),{width,height}=await sharp(t.getImage()).metadata();
      const alpha=await sharp(`${folder}/leaves-alpha.png`).resize(width,height).removeAlpha().greyscale().raw().toBuffer();
      // removeAlpha runs late in Sharp's pipeline: separate it from joinChannel
      // or it also removes the new mask, leaving opaque black leaf rectangles.
      const rgb=await sharp(t.getImage()).removeAlpha().toBuffer();
      t.setImage(await sharp(rgb).joinChannel(alpha,{raw:{width,height,channels:1}}).png().toBuffer()).setMimeType('image/png');
      material.setAlphaMode('MASK').setAlphaCutoff(.4).setDoubleSided(true);
    }
  }
  await doc.transform(prune(),dedup(),weld());
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    const count=p.getIndices().getCount()/3,target=/leaves/.test(p.getMaterial().getName())?24000:2000;
    simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:Math.min(1,target/count),error:.012});
  }
  await doc.transform(prune(),textureCompress({encoder:sharp,targetFormat:'webp',quality:88,resize:[512,512]}));
  const forms=doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>({name:n.getName(),triangles:n.getMesh().listPrimitives().reduce((sum,p)=>sum+p.getIndices().getCount()/3,0)}));
  await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14}));
  const file=`assets/scenery/${name}-near.glb`;await io.write(file,doc);
  report.assets=report.assets.filter(a=>a.name!==name);
  const info=JSON.parse(await fs.readFile(`${folder}/info.json`));
  report.assets.push({name,file,source:`https://polyhaven.com/a/${name}`,authors:info.authors,bytes:(await fs.stat(file)).size,forms});
  console.log(report.assets.at(-1));
}
await fs.writeFile('assets/scenery/tree-geometry.json',JSON.stringify(report,null,2)+'\n');
