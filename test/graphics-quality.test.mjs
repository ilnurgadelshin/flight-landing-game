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

// Desktop auto mode holds a steady 60 fps. A modelled fill-bound GPU: the frame cost grows with
// the pixel count, and the browser delivers frames no faster than the 60 Hz display.
const paced=(highMs,lowMs,start=1)=>{
  const w=world();w.ratio=start;
  const s=new ResolutionScaler(w,{enabled:true,start,maxRatio:1.5,targetMs:1000/60});
  const interval=()=>Math.max(1000/60,(w.quality==='high'?highMs:lowMs)*w.ratio*w.ratio);
  const run=n=>{const seen=[];for(let i=0;i<n;i++){const t=interval();seen.push(t);s.frame(t,true);}return seen;};
  return {w,s,run};
};
{ // 15 ms at 1×: 1.1× would cost 18 ms (55 fps, about five dropped frames a second)
  const {w,s,run}=paced(15,8);run(9000);const last=run(1200);
  assert.ok(last.every(t=>t<=1000/60+1e-9),'Settles where every frame makes 60 fps');
  assert.ok(w.ratio>=1&&w.ratio<1.1&&w.quality==='high','Keeps the effects and the sharpest scale that holds 60 fps');
  assert.ok(s.ceiling<1.1,'A step up that dropped frames is not tried again');
}
{ // the old thresholds accepted this: 18.2 ms frames sat between "slow" (25 ms) and "fast" (18 ms)
  const old=world(),s=new ResolutionScaler(old,{enabled:true,start:1.1,maxRatio:1.5});old.ratio=1.1;
  for(let i=0;i<9000;i++)s.frame(15*old.ratio*old.ratio,true);
  assert.equal(old.ratio,1.1,'Phone thresholds accept 55 fps; the desktop target does not');
}
{ // 20 ms at 1× on high: the effects go before the resolution drops below 1×
  const {w,s,run}=paced(20,9);run(400);
  assert.equal(w.ratio,1,'Not below 1× while the high-tier effects are still on');
  run(400);assert.equal(w.quality,'low','Missing 60 fps at 1× drops shadows, bloom and 3D clouds');
  run(9000);const last=run(1200);
  assert.ok(w.ratio>1&&last.every(t=>t<=1000/60+1e-9),'The cheaper scene climbs back above 1× at a steady 60 fps');
}
{ // a slow computer on the low tier may still go below 1×
  const {w,run}=paced(60,40);run(9000);
  assert.equal(w.quality,'low');assert.ok(Math.abs(w.ratio-.7)<1e-9,'The low tier keeps the 0.7× floor');
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
