// Guard the source model's proportions/materials through optimization. This
// deliberately measures the delivered assets, not the converter's implementation.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';

await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const suffix of ['', '-low']){
  const document=await io.read(fileURLToPath(new URL(`../assets/models/737-cockpit${suffix}.glb`,import.meta.url)));
  const root=document.getRoot(),materials=root.listMaterials();
  const byName=name=>{const m=materials.find(m=>m.getName()===name);assert.ok(m,`Missing source material ${name}`);return m;};
  for(const [name,color,roughness] of [
    ['Material.014',.8,.7883398951148328],       // shell's light trim
    ['Material.008',.375746,.9159806401726364],  // windshield framing
  ]){
    const m=byName(name);
    assert.ok(m.getBaseColorFactor().slice(0,3).every(c=>Math.abs(c-color)<1e-5),`${suffix||'high'}: preserve ${name} colour`);
    assert.ok(Math.abs(m.getRoughnessFactor()-roughness)<1e-5,`${suffix||'high'}: preserve ${name} roughness`);
  }
  const consoleColour=byName('Material.424').getBaseColorFactor();
  [.777285,.80004,.709816,1].forEach((v,i)=>assert.ok(Math.abs(consoleColour[i]-v)<1e-5,'Preserve source console paint'));
  for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
    const ao=p.getAttribute('COLOR_0');assert.equal(ao.getCount(),p.getAttribute('POSITION').getCount());
    for(let i=0;i<ao.getCount();i++){
      const [r,g,b]=ao.getElement(i,[]);
      assert.ok(Number.isFinite(r)&&r>=0&&r<=1&&r===g&&r===b,'Finite scalar occlusion survives mesh compression');
    }
  }
  // Blender inspection of Body.020 in the downloaded glTF: source Y 2.00593..2.26994.
  // Uniform 1.7× conversion gives a 0.449 m frame, not the former stretched 0.789 m.
  let bottom=Infinity,top=-Infinity;
  const frame=byName('Material.008');
  for(const node of root.listNodes())for(const p of node.getMesh()?.listPrimitives()||[])if(p.getMaterial()===frame){
    const matrix=node.getWorldMatrix();
    const positions=p.getAttribute('POSITION');
    for(let i=0;i<positions.getCount();i++){
      const [x,y,z]=positions.getElement(i,[]),height=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
      bottom=Math.min(bottom,height);top=Math.max(top,height);
    }
  }
  assert.ok(Math.abs(bottom-(-.22392))<.003&&Math.abs(top-.22490)<.003,`${suffix||'high'}: original frame bounds, got ${bottom}..${top}`);
  const controls=root.listNodes().map(n=>n.getExtras().flightControl).filter(Boolean).sort();
  assert.deepEqual(controls,['flaps','reverse-left','reverse-right','speedbrake','throttle-left','throttle-right','trim-left','trim-right']);
  assert.equal(root.listNodes().filter(n=>n.getExtras().controlPivot).length,2,'both authored yokes remain animated');
  console.log(`${suffix||'high'} cockpit: source colours, roughness, frame proportions and control bindings passed`);
}
