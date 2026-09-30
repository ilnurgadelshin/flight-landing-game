import assert from 'node:assert/strict';
import {qualifiesForHigh,selectGraphicsQuality} from '../js/graphics-quality.js';
assert.equal(qualifiesForHigh(Array(48).fill(16.7)),true);
assert.equal(qualifiesForHigh(Array(48).fill(33.3)),false);
assert.equal(qualifiesForHigh([...Array(40).fill(16.7),...Array(8).fill(50)]),false,'Reject unstable frame pacing');
assert.equal(qualifiesForHigh(Array(12).fill(16.7)),false,'Incomplete measurement stays conservative');
assert.equal(qualifiesForHigh([...Array(47).fill(16.7),NaN]),false);
globalThis.location={search:''};globalThis.window={matchMedia:()=>({matches:false})};
const {ResolutionScaler}=await import('../js/platform.js');
const world=()=>({autoQuality:true,quality:'high',ratio:1,setPixelRatio(r){this.ratio=r;},reduceQuality(){this.quality='low';}});
const w=world(),scaler=new ResolutionScaler(w,{enabled:true,start:1});
for(let i=0;i<500;i++)scaler.frame(33.3,true);
assert.equal(w.quality,'low','Sustained slow flight reduces effects after resolution reaches its floor');
assert.equal(w.ratio,.7);
const stalled=world(),s=new ResolutionScaler(stalled,{enabled:true,start:1});
s.frame(400,true);s.frame(16.7,true);assert.equal(stalled.quality,'high','An isolated hitch does not change the tier');
for(let i=0;i<8;i++)s.frame(400,true);
assert.equal(stalled.quality,'low','Repeated long frames must not escape the performance guard');
const explicit=world();explicit.autoQuality=false;const fixed=new ResolutionScaler(explicit,{enabled:false,start:1});
for(let i=0;i<500;i++)fixed.frame(33.3,true);
assert.equal(explicit.quality,'high');assert.equal(explicit.ratio,1,'Explicit quality/DRS overrides are respected');

const retina=world(),adaptive=new ResolutionScaler(retina,{enabled:true,start:1,maxRatio:1.5});
for(let i=0;i<4000;i++)adaptive.frame(16.7,true);
assert.equal(retina.ratio,1.5,'Sustained fast Retina frames recover detail above the initial 1×');
for(let i=0;i<80;i++)adaptive.frame(33.3,true);
assert.ok(retina.ratio<1.5,'An expensive resolution increase backs off');
const safeCeiling=adaptive.ceiling;
for(let i=0;i<4000;i++)adaptive.frame(16.7,true);
assert.equal(retina.ratio,safeCeiling);assert.ok(safeCeiling<1.5,'Do not oscillate back to a failed resolution');
for(const [start,maxRatio,enabled] of [[1,1,true],[1.5,undefined,true],[1,1.5,false]]){
  const w=world(),s=new ResolutionScaler(w,{enabled,start,maxRatio});w.ratio=start;
  for(let i=0;i<4000;i++)s.frame(16.7,true);
  assert.equal(w.ratio,start,'Native 1×, existing touch ceiling and disabled scaling remain unchanged');
}

// Deterministic visibility/RAF fixture: background time must never be used to
// classify the GPU, including when a visible sample is interrupted halfway.
const saved={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
try{
  for(const initiallyHidden of [true,false]){
    const events=new EventTarget(),queue=new Map();let id=0,now=0,draws=0;
    globalThis.document=events;events.hidden=initiallyHidden;
    globalThis.requestAnimationFrame=cb=>{queue.set(++id,cb);return id;};
    globalThis.cancelAnimationFrame=id=>queue.delete(id);
    const visible=hidden=>{events.hidden=hidden;events.dispatchEvent(new Event('visibilitychange'));};
    const step=ms=>{now+=ms;const callbacks=[...queue.values()];queue.clear();callbacks.forEach(cb=>cb(now));};
    const w=world();w.pixelRatio=1;
    const pending=selectGraphicsQuality(w,{update(){},draw(){draws++;}});
    if(initiallyHidden){
      assert.equal(draws,0);assert.equal(queue.size,0);assert.equal(w.qualityMeasurement,undefined);
    }else{
      for(let i=0;i<20;i++)step(50);
      visible(true);await Promise.resolve();
      assert.equal(w.qualityMeasurement,undefined,'Interrupted slow frames cannot select low');
      assert.equal(queue.size,0);
    }
    now+=60000;visible(false);await Promise.resolve();
    for(let i=0;i<56;i++)step(16.7);
    await pending;
    assert.equal(w.quality,'high');assert.equal(w.qualityMeasurement.selected,'high');
    assert.equal(w.qualityMeasurement.intervals.length,48);
    assert.ok(w.qualityMeasurement.intervals.every(t=>Math.abs(t-16.7)<1e-6),'Only fresh foreground frames count');
    assert.equal(queue.size,0,'Finished calibration cancels its RAF');
  }
}finally{Object.assign(globalThis,saved);}
console.log('Automatic graphics: frame budgets, Retina recovery, backoff and background calibration passed');
