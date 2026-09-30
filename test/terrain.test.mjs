import assert from 'node:assert/strict';
import {surveyedHeight} from '../js/physics/elevation.js';
import {TERRAIN} from '../js/physics/terrain.js';
import {Simulation} from '../js/sim.js';

// Independent samples inspected in the raw north-up F32 USGS export, before
// quantization/registration. A flipped row, incorrect centre or datum fails.
for(const [x,z,height] of [[5000,0,16.093],[8000,3000,117.473],[10000,4000,249.530],
  [15000,-5000,-1.352],[14000,10000,57.050]]){
  assert.ok(Math.abs(surveyedHeight(x,z)-height)<.3,`Registered DEM at ${x},${z}`);
}
assert.ok(TERRAIN.heightAt(10000,0)>150,'The old level centreline strip is gone');
assert.ok(TERRAIN.heightAt(10000,4000)>200,'The photographed forest ridge has volume');
for(const x of [-60000,-24000,-7000,-5500,15500,17000,56000,100000]){
  for(const z of [-55000,-40000,-12000,0,12000,40000,55000]){
    const h=TERRAIN.heightAt(x,z);
    assert.ok(Number.isFinite(h)&&h>-350&&h<500,'Finite heights including outside the photographed region');
    assert.ok(Math.abs(TERRAIN.heightAt(x-.01,z)-TERRAIN.heightAt(x+.01,z))<.1,'No dataset-boundary step');
  }
}

// A hull plane left at airport altitude catches the aircraft in mid-air above
// a lower valley. Test the actual Cannon solver, not only the height function.
const sim=new Simulation({scenarioId:'clear',startId:'short',seed:5});
sim.aircraft.terrain={heightAt:()=>-100,surfaceAt:()=> 'grass'};
sim.aircraft.place({x:15000,y:-20,z:-5000,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:0});
for(let i=0;i<120;i++)sim.stepOnce();
assert.ok(!sim.aircraft.damage.destroyed&&!sim.state.onGround,'Flight below airport datum has no phantom collision');
assert.ok(sim.state.alt<0&&sim.state.agl>60,'Radar altitude measures the valley below');
assert.equal(sim.aircraft.groundBody.position.y,-100);
console.log('Survey registration, continuous relief, and flight below the airport datum passed');
