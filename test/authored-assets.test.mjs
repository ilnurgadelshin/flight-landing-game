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
const farm=JSON.parse(await fs.readFile('assets/scenery/farm-sources.json'));
assert.equal(farm.geometryLicense,'MIT');assert.equal(farm.placements.length,16);
assert.ok(farm.sources.every(s=>s.license==='CC0-1.0'&&Object.keys(s.authors).length));
for(const [file,bytes] of Object.entries(farm.bytes))assert.equal((await fs.stat('assets/scenery/'+file)).size,bytes);
for(const low of [false,true]){
  const suffix=low?'-low':'';
  const bytes=Object.entries(farm.bytes).filter(([file])=>['valley-site.json','approach-sites.json'].includes(file)||file.includes('-low')===low).reduce((n,[,b])=>n+b,0);
  assert.ok(bytes<(low?1.6e6:2.4e6),'Whole farm and yard transfer budget');
  const doc=await io.read(`assets/scenery/valley-farm${suffix}.glb`);
  const nodes=doc.getRoot().listScenes()[0].listChildren();assert.equal(nodes.length,16);
  let triangles=0;
  for(const placement of farm.placements){
    const node=nodes.find(n=>n.getName()===placement.id);assert.ok(node);
    const {min,max}=getBounds(node);
    assert.ok(min.every(Number.isFinite)&&max.every(Number.isFinite));
    assert.ok(min[1]>=-.2&&max[1]<placement.height+1,'Foundation and roof stay within registered height');
    assert.ok(max[0]-min[0]<placement.w+2&&max[2]-min[2]<placement.d+2,'Roof footprint remains registered');
  }
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
    const positions=primitive.getAttribute('POSITION'),uv=primitive.getAttribute('TEXCOORD_0');
    assert.ok([...positions.getArray(),...(uv?.getArray()||[])].every(Number.isFinite));
    triangles+=primitive.getIndices().getCount()/3;
    // Relief UVs must cover both dimensions even on gable ends; collapsed UVs
    // also make derivative-based normal mapping unsafe on some drivers.
    if(primitive.getMaterial().getNormalTexture()){
      assert.ok(uv);
      const indices=primitive.getIndices().getArray();
      for(let i=0;i<indices.length;i+=3){
        const [a,b,c]=[0,1,2].map(j=>uv.getElement(indices[i+j],[]));
        assert.ok(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-10,'Nondegenerate surface relief UV triangle');
      }
    }
  }
  assert.ok(triangles<75000,'Farm geometry remains bounded');
}
const sites=[JSON.parse(await fs.readFile('assets/scenery/valley-site.json')),...JSON.parse(await fs.readFile('assets/scenery/approach-sites.json')).sites];
const {siteCoverage}=await import('../js/world/valley-site.js');
const {protectedScenery}=await import('../js/world/scenery-ground.js');
for(const site of sites){
for(const points of [...site.lawns,...site.gravel,...site.fences,...site.streets.map(r=>r.points),...site.paths.map(r=>r.points)]){
 assert.ok(points.every(p=>p.length===2&&p.every(Number.isFinite)));
 assert.ok(points.every(([x,z])=>!protectedScenery(x,z,16)),'Site keeps clear of the protected airport');
}
for(const path of site.paths.filter(p=>p.connectsRoad)){
 const [x,z]=path.points.at(-1);assert.ok(siteCoverage(site,x,z,'roads')>1.5,'Access paths reach the reconstructed lane');
}
if(site.id)for(const line of site.fences)for(let i=1;i<line.length;i++){
 const [a,b]=[line[i-1],line[i]],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5);
 for(let k=0;k<=steps;k++){
  const x=a[0]+(b[0]-a[0])*k/steps,z=a[1]+(b[1]-a[1])*k/steps;
  assert.ok(siteCoverage(site,x,z,'roads')<-.8,'Boundary fence leaves access lane open');
 }
}
}
assert.ok((await fs.stat('assets/scenery/approach-sites.json')).size<20000,'Small extension site data');
assert.ok((await fs.stat('assets/scenery/valley-site.json')).size<15000,'Small interpreted site data');
console.log('Authored facade, farm and tree bounds, UVs, source records and delivery budgets passed');
