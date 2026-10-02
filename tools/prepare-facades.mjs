// Extract a small, reusable set of authored CC0 wall bays. All source pieces
// retain their UVs, recessed openings and material assignments.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,transformPrimitive,prune,dedup,weld,simplifyPrimitive,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const selections={
  modular_factory_facade:{
    blank:['wall_standard_standard_01'],
    window:['wall_window_centered_medium_01','window_centered_medium_01'],
    door:['wall_door_centered_small_01','door_centered_small_01'],
    garage:['wall_door_garage_centered_01','door_garage_centered_01'],
  },
  modular_urban_apartments_facade:{
    blank:['wall_standard_standard_01'],
    window:['wall_window_centered_small_01','window_centered_small_01'],
    windowWide:['wall_window_centered_large_01','window_centered_large_01'],
    door:['wall_door_centered_small_01','door_centered_small_01'],
  },
};
const report=[];
for(const [name,parts] of Object.entries(selections)){
  const folder=`test/output/authored-sources/${name}`,doc=await io.read(`${folder}/source.gltf`);
  const nodes=doc.getRoot().listNodes(),scene=doc.getRoot().listScenes()[0],keep=new Set();
  for(const [key,names] of Object.entries(parts)){
    const pieces=names.map(n=>nodes.find(node=>node.getName()===n));
    if(pieces.some(n=>!n))throw new Error(`Missing authored module ${name}/${key}`);
    const {min,max}=getBounds(pieces[0]),width=max[0]-min[0],height=max[1]-min[1];
    const group=doc.createNode(key).setExtras({width,height});scene.addChild(group);
    for(const node of pieces){
      const matrix=node.getWorldMatrix();
      for(const p of node.getMesh().listPrimitives()){
        transformPrimitive(p,matrix);
        transformPrimitive(p,[1/width,0,0,0,0,1/height,0,0,0,0,1,0,-min[0]/width,-min[1]/height,0,1]);
        p.setAttribute('TANGENT',null);
      }
      node.setTranslation([0,0,0]).setRotation([0,0,0,1]).setScale([1,1,1]);
      group.addChild(node);keep.add(node);
    }
  }
  for(const node of nodes)if(!keep.has(node))node.dispose();
  await doc.transform(prune(),dedup(),weld());
  for(const material of doc.getRoot().listMaterials()){
    for(const ext of material.listExtensions())material.setExtension(ext.extensionName,null);
    if(/glass/.test(material.getName()))material.setAlphaMode('OPAQUE').setBaseColorFactor([.14,.21,.23,1]).setRoughnessFactor(.22).setMetallicFactor(.25).setExtras({nightGlow:true});
  }
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())
    simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.12,error:.004});
  await doc.transform(prune(),textureCompress({encoder:sharp,targetFormat:'webp',quality:85,resize:[1024,1024]}));
  const modules=scene.listChildren().map(n=>({name:n.getName(),...n.getExtras(),triangles:n.listChildren().reduce((a,c)=>a+c.getMesh().listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0)}));
  await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14}));
  const file=`assets/scenery/${name}.glb`;await io.write(file,doc);
  await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',quality:82,resize:[512,512]}));
  const lowFile=`assets/scenery/${name}-low.glb`;await io.write(lowFile,doc);
  const info=JSON.parse(await fs.readFile(`${folder}/info.json`));
  report.push({file,lowFile,source:`https://polyhaven.com/a/${name}`,license:'CC0-1.0',authors:info.authors,bytes:(await fs.stat(file)).size,lowBytes:(await fs.stat(lowFile)).size,modules});
  console.log(report.at(-1));
}
await fs.writeFile('assets/scenery/facade-sources.json',JSON.stringify(report,null,2)+'\n');
