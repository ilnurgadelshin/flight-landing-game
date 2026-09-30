// Decide from drawn frames, not GPU names or device age. Explicit URL tiers
// bypass this check. The conservative result is low when measurement is incomplete.
export function qualifiesForHigh(intervals) {
  if(intervals.length<24||intervals.some(t=>!Number.isFinite(t)||t<=0))return false;
  const sorted=[...intervals].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length*.9)]<=22.5;
}

export async function selectGraphicsQuality(world,view) {
  if(document.hidden){world.reduceQuality();return;}
  view.update(0);view.draw(); // Include cockpit, terrain, clouds and their real shaders.
  const intervals=[];let frames=0,previous,start;
  await new Promise(resolve=>{
    let ticket,done=false;
    const finish=()=>{if(done)return;done=true;cancelAnimationFrame(ticket);clearTimeout(timer);resolve();};
    const timer=setTimeout(finish,3000); // RAF may stop when the tab becomes hidden.
    const frame=now=>{
      if(done)return;
      start??=now;
      if(previous!==undefined&&frames>=8)intervals.push(now-previous);
      previous=now;frames++;
      view.draw();
      if(frames>=56||now-start>2500||document.hidden)finish();else ticket=requestAnimationFrame(frame);
    };
    ticket=requestAnimationFrame(frame);
  });
  const high=qualifiesForHigh(intervals);
  world.qualityMeasurement={intervals,selected:high?'high':'low',pixelRatio:world.pixelRatio};
  if(!high)world.reduceQuality();
}
