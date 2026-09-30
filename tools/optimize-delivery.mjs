// Reproduce from the asset snapshot before delivery optimization:
// node tools/optimize-delivery.mjs /path/to/a406f27-snapshot
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,meshopt,textureCompress,simplifyPrimitive} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';

const source=process.argv[2];
if(!source)throw new Error('Supply the original asset snapshot directory.');
const report=[];
async function image(file,{lossless=false,quality=84}={}){
  const input=await fs.readFile(path.join(source,file)),output=file.replace(/\.(png|jpg)$/,'.webp');
  const result=await sharp(input).webp({quality,alphaQuality:100,lossless,effort:6}).toBuffer();
  await fs.writeFile(output,result);
  report.push({file:output,before:input.length,after:result.length,lossless,quality});
}
for(const name of ['region','approach','airport','final-approach'])for(const suffix of ['','-low'])
  await image(`assets/scenery/${name}${suffix}.jpg`);
for(const name of ['region','approach','airport','final-approach']){
  const file=`assets/scenery/${name}-preview.webp`;
  const result=await sharp(path.join(source,`assets/scenery/${name}-low.jpg`)).resize(512,512).webp({quality:75,effort:6}).toBuffer();
  await fs.writeFile(file,result);report.push({file,before:0,after:result.length,quality:75,resolution:512});
}
for(const file of await fs.readdir(path.join(source,'assets/scenery/detail')))
  if(file.endsWith('.jpg'))await image(`assets/scenery/detail/${file}`);
for(const suffix of ['','-low'])await image(`assets/scenery/tree-variety${suffix}.png`,{quality:90});
for(const name of ['liner','upholstery'])await image(`assets/cockpit/${name}.png`,{lossless:true});

await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const geometry=JSON.parse(await fs.readFile(path.join(source,'assets/scenery/tree-geometry.json')));
for(const asset of geometry.assets){
  const input=await fs.readFile(path.join(source,asset.file)),doc=await io.readBinary(input);
  // Retain species/forms and alpha masks. Remove unused tangent data; Three can
  // derive the tangent frame from the UVs. Trim fir geometry conservatively.
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    p.setAttribute('TANGENT',null);
    if(asset.name==='fir_sapling_medium')simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.65,error:.003});
  }
  await doc.transform(weld(),dedup(),prune(),
    textureCompress({encoder:sharp,targetFormat:'webp',quality:88,resize:[1024,1024]}),
    meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));
  asset.forms=doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>({name:n.getName(),
    triangles:n.getMesh().listPrimitives().reduce((sum,p)=>sum+p.getIndices().getCount()/3,0)}));
  await io.write(asset.file,doc);asset.bytes=(await fs.stat(asset.file)).size;
  report.push({file:asset.file,before:input.length,after:asset.bytes,forms:asset.forms});
}
await fs.writeFile('assets/scenery/tree-geometry.json',JSON.stringify(geometry,null,2)+'\n');
for(const file of ['assets/cockpit/sources.json','assets/scenery/sources.json']){
  const entries=JSON.parse(await fs.readFile(path.join(source,file)));
  for(const entry of entries){
    const converted=report.find(r=>r.file===path.posix.join(path.posix.dirname(file),entry.file.replace(/\.(jpg|png)$/,'.webp')));
    if(converted){
      entry.file=entry.file.replace(/\.(jpg|png)$/,'.webp');
      entry.delivery=converted.lossless?'Lossless WebP; packed channels unchanged.':'WebP; encoding settings in assets/delivery.json.';
    }
  }
  await fs.writeFile(file,JSON.stringify(entries,null,2)+'\n');
}
await fs.writeFile('assets/delivery.json',JSON.stringify({sourceCommit:'a406f27',files:report},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
