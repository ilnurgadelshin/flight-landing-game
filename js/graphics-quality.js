// Decide from drawn frames, not GPU names or device age. Explicit URL tiers
// bypass this check. Only visible frames count; background throttling is not
// evidence of a slow GPU. An incomplete foreground sample selects low.
export function qualifiesForHigh(intervals) {
  if(intervals.length<24||intervals.some(t=>!Number.isFinite(t)||t<=0))return false;
  const sorted=[...intervals].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length*.9)]<=22.5;
}

export async function selectGraphicsQuality(world,view) {
  for(;;){
    if(document.hidden)await new Promise(resolve=>{
      const visible=()=>{if(!document.hidden){document.removeEventListener('visibilitychange',visible);resolve();}};
      document.addEventListener('visibilitychange',visible);visible();
    });
    view.update(0);view.draw(); // Include cockpit, terrain, clouds and their real shaders.
    const intervals=[];let frames=0,previous,start,interrupted=false;
    await new Promise(resolve=>{
      let ticket,done=false;
      const finish=()=>{
        if(done)return;done=true;cancelAnimationFrame(ticket);clearTimeout(timer);
        document.removeEventListener('visibilitychange',visibility);resolve();
      };
      const visibility=()=>{if(document.hidden){interrupted=true;finish();}};
      const timer=setTimeout(finish,3000);
      document.addEventListener('visibilitychange',visibility);
      const frame=now=>{
        if(done)return;
        if(document.hidden){visibility();return;}
        start??=now;
        if(previous!==undefined&&frames>=8)intervals.push(now-previous);
        previous=now;frames++;
        view.draw();
        if(frames>=56||now-start>2500)finish();else ticket=requestAnimationFrame(frame);
      };
      ticket=requestAnimationFrame(frame);
    });
    if(interrupted||document.hidden)continue; // Discard partial samples and retry in the foreground.
    const high=qualifiesForHigh(intervals);
    world.qualityMeasurement={intervals,selected:high?'high':'low',pixelRatio:world.pixelRatio};
    if(!high)world.reduceQuality();
    return;
  }
}
