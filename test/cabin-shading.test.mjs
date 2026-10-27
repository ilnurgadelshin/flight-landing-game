// A large, otherwise featureless face must pick up contact under a nearby part,
// including when the delivered geometry uses scaled/translated node coordinates.
import assert from 'node:assert/strict';
import {Document} from '@gltf-transform/core';
import {refineCabinShading} from '../tools/refine-cabin-shading.mjs';
import {cabinOcclusionSampler} from '../tools/bake-cockpit-occlusion.mjs';

function fixture(transformed=false){
 const d=new Document(),buffer=d.createBuffer(),scene=d.createScene();
 function plane(name,left,right,bottom,top,z){
  const coords=[left,bottom,z,right,bottom,z,right,top,z,left,top,z];
  const position=d.createAccessor().setType('VEC3').setArray(new Float32Array(coords)).setBuffer(buffer);
  const normal=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1])).setBuffer(buffer);
  const color=d.createAccessor().setType('VEC3').setArray(new Uint8Array(12).fill(255)).setNormalized(true).setBuffer(buffer);
  const index=d.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2,0,2,3])).setBuffer(buffer);
  const p=d.createPrimitive().setAttribute('POSITION',position).setAttribute('NORMAL',normal).setAttribute('COLOR_0',color).setIndices(index).setMaterial(d.createMaterial(name));
  const node=d.createNode().setMesh(d.createMesh().addPrimitive(p));scene.addChild(node);
  if(transformed){
   for(let i=0;i<4;i++)position.setElement(i,position.getElement(i,[]).map((v,j)=>(v-[.1,.2,.3][j])/2));
   node.setScale([2,2,2]).setTranslation([.1,.2,.3]);
  }
  return p;
 }
 const panel=plane('Material.457',-.5,.5,-.65,-.2,-1),occluder=plane('unmodified control',-.08,.08,-.5,-.35,-.96);
 return {d,panel,occluder};
}
for(const lowDetail of [false,true]){
 const a=fixture(),b=fixture(true);
 const ra=refineCabinShading(a.d,{lowDetail}),rb=refineCabinShading(b.d,{lowDetail});
 assert.equal(ra.addedTriangles,rb.addedTriangles);
 assert.ok(ra.addedTriangles<1600,'Contact detail stays bounded on a half-square-metre panel');
 assert.equal(a.occluder.getAttribute('POSITION').getCount(),4,'Unrelated parts remain untouched');
 const pos=a.panel.getAttribute('POSITION'),colors=a.panel.getAttribute('COLOR_0');
 const near=[],far=[];
 for(let i=0;i<pos.getCount();i++){
  const [x,y,z]=pos.getElement(i,[]),ao=colors.getElement(i,[])[0];
  assert.ok(Math.abs(z+1)<1e-6&&x>=-.5&&x<=.5&&y>=-.65001&&y<=-.19999,'Subdivision preserves the surface');
  assert.ok(Number.isFinite(ao)&&ao>0&&ao<=1);
  if(Math.abs(x)<.04&&y>-.48&&y<-.38)near.push(ao);
  if(Math.abs(x)>.4)far.push(ao);
 }
 const mean=v=>v.reduce((sum,x)=>sum+x,0)/v.length;
 // Probe fixed points: float rounding can change which of two equal triangle
 // edges splits first, so emitted vertex order is not an invariance requirement.
 const sa=cabinOcclusionSampler(a.d),sb=cabinOcclusionSampler(b.d);
 for(const x of [-.45,-.2,0,.2,.45])for(const y of [-.6,-.425,-.25])assert.ok(
  Math.abs(sa.sample([x,y,-1],[0,0,1])-sb.sample([x,y,-1],[0,0,1]))<=1,
  'Equivalent transformed geometry receives equivalent shading at a fixed point');
 sa.dispose();sb.dispose();
 assert.ok(near.length&&far.length&&mean(far)-mean(near)>.20,'Nearby part casts a localized soft contact shadow');
 console.log(`${lowDetail?'low':'high'} cabin shading: bounded geometry, transform invariance and localized contact passed`);
}
