import assert from 'node:assert/strict';
import {RainField} from '../js/world/rain-field.js';

const flight={vx:-70,vy:0,vz:0,windKts:0,windDirDeg:0};
const a=new RainField(),b=new RainField();
assert.deepEqual(a.centers,b.centers,'A seeded scenario is reproducible');
const initial=a.centers.slice();
for(let i=0;i<600;i++){a.update(1/60,flight);b.update(1/60,flight);}
assert.deepEqual(a.centers,b.centers);
let unchanged=0,sum=0;
for(let i=0;i<a.count;i++){
  const k=i*3,d=Math.hypot(...[0,1,2].map(j=>a.centers[k+j]-initial[k+j]));
  if(d<.01)unchanged++;sum+=d;
  assert.ok(a.generations[i]>1,'Every drop has been replaced over ten seconds of approach');
  assert.ok([0,1,2].every(j=>Math.abs(a.centers[k+j])<=a.half),'Pool stays bounded');
}
assert.equal(unchanged,0,'The old ten-second constellation cannot recur');
assert.ok(sum/a.count>10,'Recycled drops receive new positions');
const before=a.centers.slice();
a.update(0,{...flight,vx:-95});
assert.deepEqual(a.centers,before,'Speed changes cannot teleport particles using speed × total time');

const single=new RainField(1);single.centers.fill(0);
const fall=single.details[0];single.update(.05,flight);
assert.ok(Math.abs(single.centers[0]-3.5)<1e-5);
assert.ok(Math.abs(single.centers[1]+fall*.05)<1e-5);
single.centers.fill(0);single.update(.05,{vx:0,vy:0,vz:0,windKts:20,windDirDeg:0});
assert.equal(single.centers[0],0);assert.ok(single.centers[2]>.5,'North wind blows toward +Z');
single.centers.fill(0);single.update(.05,{vx:0,vy:0,vz:0,windKts:20,windDirDeg:90});
assert.ok(single.centers[0]<-.5,'East wind blows toward -X');

const low=new RainField(900);low.update(.05,flight);
assert.equal(low.centers.length,2700);assert.equal(low.details.length,3600);
a.reset();assert.deepEqual(a.centers,initial,'Scenario reset resets the weather seed');
console.log('Rain field passed: fresh arrivals, bounded pool, deterministic replay, continuous acceleration, wind and low budget.');
