import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canopyFootprint,drapeCanopy} from '../js/world/woodland-shadows.js';
import {sceneryGroundHeight} from '../js/world/scenery-ground.js';
const atlas=JSON.parse(fs.readFileSync(new URL('../assets/scenery/tree-variety.json',import.meta.url)));
const sun={x:-.26,y:.643,z:-.72};
let triangles=0,worstOld=0,worstNew=0;
for(const low of [false,true])for(let i=0;i<200;i++){
  const t={x:2200+i*31.713,z:-950+(i*53.619)%2100,h:18,w:21,yaw:i*2.399,type:i%4,row:i%9};
  const form=atlas.species[t.row];
  for(const light of [sun,{x:-.85,y:.12,z:.5},{x:0,y:1,z:0}]){
    const {quad}=canopyFootprint(t,form,light);
    assert.ok(quad.flat().every(Number.isFinite));
    let area=0;
    drapeCanopy(quad,low,(a,b,c)=>{
      triangles++;
      area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
      // Interior points must stay on the terrain, not merely its vertices.
      for(const weights of [[1/3,1/3,1/3],[.7,.2,.1],[.1,.7,.2]]){
        const p=[a,b,c],x=p.reduce((s,v,j)=>s+v[0]*weights[j],0),z=p.reduce((s,v,j)=>s+v[1]*weights[j],0);
        const plane=p.reduce((s,v,j)=>s+sceneryGroundHeight(v[0],v[1],low)*weights[j],0);
        worstNew=Math.max(worstNew,Math.abs(plane-sceneryGroundHeight(x,z,low)));
      }
      assert.ok([a,b,c].every(p=>p[2]>=-1e-6&&p[2]<=1+1e-6&&p[3]>=-1e-6&&p[3]<=1+1e-6));
    });
    const [a,b,,d]=quad,expected=Math.abs((b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]));
    assert.ok(Math.abs(area-expected)<.001,'Clipping must neither lose nor duplicate shadow area');
  }
  for(const dx of [-t.w*.375,t.w*.375])for(const dz of [-t.w*.375,t.w*.375]){
    worstOld=Math.max(worstOld,Math.abs(sceneryGroundHeight(t.x+dx,t.z+dz,low)-sceneryGroundHeight(t.x,t.z,low)));
  }
}
assert.ok(worstOld>2,'Fixture includes slopes where a horizontal contact patch fails');
assert.ok(worstNew<1e-6,`Draped triangles agree with terrain: ${worstNew}`);
const tree={x:4500,z:300,h:20,w:22,yaw:.7,type:2,row:7},form=atlas.species[7];
const center=q=>[0,1].map(i=>q.reduce((n,p)=>n+p[i],0)/4);
const a=center(canopyFootprint(tree,form,sun).quad),b=center(canopyFootprint(tree,form,{...sun,x:-sun.x,z:-sun.z}).quad);
assert.ok(a[0]>tree.x&&a[1]>tree.z&&b[0]<tree.x&&b[1]<tree.z,'Shade projects away from sunlight');
console.log(`Canopy ground fit passed: ${triangles} triangles, old maximum error ${worstOld.toFixed(2)} m, new ${worstNew.toExponential(2)} m.`);
