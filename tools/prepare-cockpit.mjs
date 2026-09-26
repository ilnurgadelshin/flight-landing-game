// Usage: node tools/prepare-cockpit.mjs /path/to/unzipped/scene.gltf
// The source is hakai315's CC BY 4.0 cockpit, downloaded via its Sketchfab page.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, getBounds, dedup, weld, simplify, join, prune, meshopt, transformPrimitive, cloneDocument } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs/promises';
import { bakeOcclusion } from './bake-cockpit-occlusion.mjs';

if(!process.argv[2]) throw new Error('Pass the downloaded scene.gltf path. See assets/README.md.');
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const document=await io.read(process.argv[2]);
await document.transform(flatten());
// Source coordinates face +Z. Normalize to metres, facing -Z, with the design eye at
// (-.51,.14,0). This transform is shared by the live display/animation bindings.
const scale=1.7, transform=[-scale,0,0,0, 0,scale,0,0, 0,0,-scale,0, 0,.14-2.22*scale,.9*scale,1];
const scene=document.getRoot().listScenes()[0];
const moving={};
for(const name of ['captain-yoke','officer-yoke','captain-column','officer-column']) moving[name]=document.createNode(name);
const controls={
  'throttle-left': {parts:/^(Cylinder\.212|Cube\.486)_/,pivot:[.0215,1.78,1.245]},
  'throttle-right': {parts:/^(Cylinder\.213|Cube\.485)_/,pivot:[.002,1.78,1.245]},
  'reverse-left': {parts:/^Cylinder\.214_/,pivot:[.0236,1.824,1.240]},
  'reverse-right': {parts:/^Cylinder\.215_/,pivot:[-.00065,1.824,1.240]},
  speedbrake: {parts:/^Cube\.481_/,pivot:[.060,1.787,1.271]},
  flaps: {parts:/^Cube\.482_/,pivot:[-.044,1.787,1.270]},
  'trim-left': {parts:/^Cylinder\.210_/,pivot:[.088,1.7435,1.2442]},
  'trim-right': {parts:/^Cylinder\.211_/,pivot:[-.068,1.7435,1.2442]},
};
for(const name of Object.keys(controls))moving[name]=document.createNode(name);
for(const node of document.getRoot().listNodes()) {
  const mesh=node.getMesh();if(!mesh)continue;
  const {min,max}=getBounds(node);
  // Stray lettering and a distant duplicate from the original authoring scene.
  if(max[0]>3||min[2]<-3){node.dispose();continue;}
  let animated=null;
  if(min[1]>1.69&&max[1]<2.07&&min[2]>1.14&&max[2]<1.29){
    if(min[0]>.15&&max[0]<.45)animated='captain-yoke';
    if(min[0]>-.40&&max[0]<-.10)animated='officer-yoke';
  }
  if(/^Cylinder\.126_/.test(node.getName()))animated='captain-column';
  if(/^Cylinder\.129_/.test(node.getName()))animated='officer-column';
  for(const [name,control] of Object.entries(controls))if(control.parts.test(node.getName()))animated=name;
  const world=node.getWorldMatrix();
  for(const primitive of mesh.listPrimitives()) {
    // No textures exist in this source. Removing unused UV seams makes welding useful.
    primitive.setAttribute('TEXCOORD_0',null);primitive.setAttribute('TEXCOORD_1',null);
    transformPrimitive(primitive,world);
    // Put the captain's seat back on its rails, behind the design eye. The source's
    // upright headrest otherwise crosses the camera when looking at the pedestal.
    if(/^Cube\.488_/.test(node.getName())){
      const p=primitive.getAttribute('POSITION');
      for(let i=0;i<p.getCount();i++){const v=p.getElement(i,[]);v[2]-=.23;p.setElement(i,v);}
    }
    // The source ceiling intersects the captain's design eye. Raise the upper shell and
    // overhead by 20 cm, blending only through the windshield pillars above the MCP.
    const position=primitive.getAttribute('POSITION'), normal=primitive.getAttribute('NORMAL');
    for(let i=0;i<position.getCount();i++) {
      const v=position.getElement(i,[]);
      const upperShell=min[1]>2.15 || /^Body\.(006|018|002|020)_/.test(node.getName());
      const t=upperShell?Math.max(0,Math.min(1,(v[1]-2.09)/.07)):0;
      v[1]+=.20*t*t*(3-2*t);position.setElement(i,v);
      if(normal){const n=normal.getElement(i,[]);n[1]/=1+.20*6*t*(1-t)/.07;const l=Math.hypot(...n)||1;normal.setElement(i,n.map(x=>x/l));}
    }
    transformPrimitive(primitive,transform);
  }
  node.setTranslation([0,0,0]).setRotation([0,0,0,1]).setScale([1,1,1]);
  if(animated)moving[animated].addChild(node);
}
for(const [name,group] of Object.entries(moving)) {
  // Geometry has already been placed in the root frame: keep it in that frame at rest.
  scene.addChild(group);
  if(controls[name]){
    const [x,y,z]=controls[name].pivot;
    group.setExtras({flightControl:name,controlOrigin:[-x*scale,y*scale+transform[13],-z*scale+transform[14]]});
    continue;
  }
  const x=name.startsWith('captain')?-.515:.431;
  const column=name.endsWith('column');
  group.setExtras({[column?'columnPivot':'controlPivot']:[x,(column?1.557:1.967)*scale+transform[13],(column?1.30:1.265)*-scale+transform[14]]});
}
for(const mat of document.getRoot().listMaterials()) {
  mat.setRoughnessFactor(Math.min(.93,Math.max(.45,mat.getRoughnessFactor())));
  if(mat.getName()==='Material.014')mat.setBaseColorFactor([.24,.255,.26,1]);
  if(mat.getName()==='Material.048')mat.setBaseColorFactor([.58,.59,.57,1]);
}
// Keep the source's vector lettering on desktop. On phones the live displays remain
// full resolution, while tiny moulded labels and dense switch bevels use less geometry.
const low=cloneDocument(document);
for(const node of low.getRoot().listNodes())if(/^Text/.test(node.getName()))node.dispose();
await low.transform(prune(),dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.20,error:.008}),join());
bakeOcclusion(low);
await low.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:15}));
await io.write('assets/models/737-cockpit-low.glb',low);
await document.transform(prune(),dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.32,error:.003}),join());
bakeOcclusion(document);
// Meshopt provides compact, offline delivery without a network decoder or a GPU extension.
await document.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16}));
await io.write('assets/models/737-cockpit.glb',document);
console.log('Prepared cockpit:',(await fs.stat('assets/models/737-cockpit.glb')).size,'bytes');
