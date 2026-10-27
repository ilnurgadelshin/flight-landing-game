// Update optimized assets without re-downloading the original. Always use the
// unmodified baseline directory; the main source converter applies the same pass.
// node tools/prepare-cabin-shading.mjs BASELINE_MODELS [OUTPUT_MODELS]
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {refineCabinShading} from './refine-cabin-shading.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const input=process.argv[2],output=process.argv[3]||'assets/models';
if(!input||path.resolve(input)===path.resolve(output))throw Error('Supply a separate unmodified model directory.');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
await fs.mkdir(output,{recursive:true});
for(const suffix of ['', '-low']){
  const name=`737-cockpit${suffix}.glb`,doc=await io.read(path.join(input,name));
  const report=refineCabinShading(doc,{lowDetail:!!suffix});
  await doc.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:suffix?15:16}));
  await io.write(path.join(output,name),doc);
  console.log(name,{...report,bytes:(await fs.stat(path.join(output,name))).size});
}
