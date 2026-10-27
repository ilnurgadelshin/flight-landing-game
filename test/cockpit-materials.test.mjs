import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {Document} from '@gltf-transform/core';
import {SURFACE_ATLAS,SURFACE_LAYOUT,finishCoordinates} from '../js/cockpit/surface-layout.js';
import {panelMasks} from '../tools/cockpit-panel-masks.mjs';

// Existing masks keep their texel density in the left half of the wider atlas.
const forward=finishCoordinates('panel',-.2,-.4,-.95,0,0);
assert.equal(forward[2],1);assert.ok(forward[0]<.5&&forward[1]>.5);
for(const [region,p] of [
 ['pedestal',[0,-.65,-.1,0,1]],['overhead',[0,.35,-.4,0,-.9]],['headliner',[-.7,.25,-.4,0,-.8]],
]){
 const uv=finishCoordinates(region==='headliner'?region:'panel',...p),[x,y,w,h]=SURFACE_LAYOUT[region].rect;
 assert.equal(uv[2],1);assert.ok(uv[0]*SURFACE_ATLAS[0]>x&&uv[0]*SURFACE_ATLAS[0]<x+w);
 assert.ok((1-uv[1])*SURFACE_ATLAS[1]>y&&(1-uv[1])*SURFACE_ATLAS[1]<y+h);
}
assert.equal(finishCoordinates('headliner',0,-.99,0,0,1)[2],0,'Liner finish stays off the floor and lower walls');
assert.equal(finishCoordinates('panel',0,-.65,-.1,0,0)[2],0,'Vertical casing does not inherit the horizontal panel map');
assert.equal(finishCoordinates('overhead',0,-.4,-.9,0,1)[2],0,'Shared overhead material leaves the lower deck alone');

// A bent panel is still one manufactured part. Its normal change and internal
// triangle edges must not become painted seam lines (the first prototype did).
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(),points=[];
for(const z of [-.2,0,.2])for(const x of [-.2,.2])points.push(x,-.65-Math.abs(z)*.18,z);
const p=doc.createPrimitive().setMaterial(doc.createMaterial('Material.103'))
 .setAttribute('POSITION',doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(new Float32Array(points)))
 .setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint16Array([0,1,2,1,3,2,2,3,4,3,5,4])));
scene.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(p)));
const layout=SURFACE_LAYOUT.pedestal,masks=await panelMasks(doc,layout,'pedestal');
assert.equal(masks.report.plates,1,'Curved connected faces stay one coating island');
const [, ,w,h]=layout.rect,[left,bottom,right,top]=layout.bounds;
const pixel=(x,z)=>Math.round(2+(1-(z-bottom)/(top-bottom))*(h-4))*w+Math.round(2+(x-left)/(right-left)*(w-4));
assert.ok(masks.edge[pixel(0,0)]<2,'No false seam at the bend');
assert.ok(masks.edge[pixel(-.2,-.1)]>30,'Actual outside contour remains');
for(const [suffix,width,height,budget] of [['',2048,1024,800000],['-low',1024,512,350000]]){
 const file=new URL(`../assets/cockpit/service-wear${suffix}.webp`,import.meta.url),meta=await sharp(file.pathname).metadata();
 assert.equal(meta.width,width);assert.equal(meta.height,height);assert.equal(meta.channels,3,'Opaque packed channels avoid alpha premultiplication');
 assert.ok((await fs.stat(file)).size<budget,'Packed finish stays within its delivery budget');
}
console.log('Cockpit materials: fitted regions, exclusions, curved-part outlines and packed-map budgets passed');
