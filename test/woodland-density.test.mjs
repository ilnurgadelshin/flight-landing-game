import assert from 'node:assert/strict';
import {blendWoodlandAllocations} from '../js/world/woodland-density.js';
const zone=(x,cap)=>{
 const trees=[];for(let xx=x+5;xx<x+1000;xx+=10)for(let z=5;z<2000;z+=10)trees.push({x:xx,z});
 return {zone:{bounds:[x,0,1000,2000],highLimit:cap,highSpacing:10,uniform:true},close:[],upper:trees};
};
const source=[zone(0,4000),zone(1000,1000)],a=await blendWoodlandAllocations(source),b=await blendWoodlandAllocations(source);
assert.equal(a.target,5000);assert.equal(a.trees.length,5000,'Blending must not grow the total allocation');
assert.deepEqual(a,b,'Selection is deterministic');
const strip=(lo,hi)=>a.trees.filter(t=>t.x>=lo&&t.x<hi).length;
const ratio=strip(1000,1100)/strip(900,1000);
assert.ok(ratio>.7&&ratio<1/.7,`A fourfold quota difference blends across the shared edge: ${ratio}`);
assert.ok(strip(0,300)>strip(1700,2000)*2,'Distant density remains cheaper away from the join');
const zero=await blendWoodlandAllocations([{...zone(0,1),zone:{...source[0].zone,highLimit:0}}]);
assert.equal(zero.trees.length,0);
console.log('Woodland density: seam continuity, deterministic selection and fixed allocation passed');

let pauses=0;const chunked=await blendWoodlandAllocations(source,350,()=>{pauses++;return Promise.resolve();});
assert.ok(pauses>10,'Long allocation work offers many yielding checkpoints');
assert.deepEqual(chunked,a,'Task boundaries never change selection or random-number order');
