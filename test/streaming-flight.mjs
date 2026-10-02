// Real-time autoland through the actual Start handler, including menu preparation.
// Archived builds without preparation retain their original deferred streaming.
// Localhost transfer/decode/upload timing is not an Internet/mobile-network benchmark.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'-');
const auto=process.env.BENCHMARK_AUTO==='1';
const {server,url}=await startServer(process.env.BENCHMARK_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:auto?2:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>performance.setResourceTimingBufferSize(1000));
  await page.goto(url+(auto?'/?drs=1':'/?quality=high&drs=0'));await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
  await page.evaluate(auto=>{
    const s=window.__sim;if(!auto)s.world.setPixelRatio(1);s.setDrawing(true);s.setTimeScale(1);
    window.__flightFrames=[];window.__qualityHistory=[];let previous,lastQuality;
    window.__flightDone=false;window.__flightStart=null;window.__startPressed=performance.now();
    const frame=t=>{
      if(s.game.state==='flying'&&window.__flightStart===null){
        window.__flightStart=performance.now();s.autopilot({});
      }
      if(window.__flightStart!==null){
        const quality=s.world.quality+':'+s.world.renderer.getPixelRatio();
        if(quality!==lastQuality){window.__qualityHistory.push({seconds:(performance.now()-window.__flightStart)/1000,tier:s.world.quality,ratio:s.world.renderer.getPixelRatio()});lastQuality=quality;}
        if(previous!==undefined)window.__flightFrames.push([t,t-previous,s.state().x]);
        previous=t;
      }
      if(!window.__flightDone)requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    s.ui.onStart({startId:'short',scenarioId:'clear',seed:11,mode:'game',sound:false,skipSchool:true});
  },auto);
  await page.waitForFunction(()=>window.__sim.game.state==='finished',null,{timeout:300000});
  const report=await page.evaluate(()=>{
    window.__flightDone=true;const s=window.__sim,frames=window.__flightFrames,sorted=frames.map(f=>f[1]).sort((a,b)=>a-b);
    const q=p=>sorted[Math.floor((sorted.length-1)*p)];
    return {startWaitSeconds:(window.__flightStart-window.__startPressed)/1000,seconds:(performance.now()-window.__flightStart)/1000,frames:frames.length,fps:1000*frames.length/sorted.reduce((a,b)=>a+b,0),
      p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:sorted.at(-1),over50Ms:sorted.filter(t=>t>50).length,over100Ms:sorted.filter(t=>t>100).length,
      worstFrames:[...frames].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([time,ms,x])=>({seconds:(time-window.__flightStart)/1000,ms,x})),
      streamed:performance.getEntriesByType('resource').filter(r=>r.startTime>=window.__flightStart).map(r=>({file:new URL(r.name).pathname,seconds:(r.startTime-window.__flightStart)/1000,durationMs:r.duration,bytes:r.encodedBodySize})),
      preparedBytes:performance.getEntriesByType('resource').filter(r=>r.startTime<window.__flightStart).reduce((sum,r)=>sum+r.encodedBodySize,0),
      qualityHistory:window.__qualityHistory,quality:s.world.quality,
      result:s.result(),errors:s.world.assetErrors,pixelRatio:s.world.renderer.getPixelRatio(),nearTrees:s.world.nearWoodland?.count||0};
  });
  assert.deepEqual(errors,[]);assert.deepEqual(report.errors,[]);assert.equal(report.result?.success,true,'Complete the actual landing successfully');
  report.browser=browser.version();report.autoQuality=auto;report.method=`1440x900, ${auto?'desktop auto, 2x device pixel ratio':'forced high at fixed 1x'}, real-time physics/autoland through UI Start, cold browser resource cache, actual menu preparation/streaming policy, local HTTP server, ANGLE Metal. Start wait is measured to the first in-flight RAF; frame intervals begin after it.`;
  await fs.writeFile(`test/output/streaming-flight-${label}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,streamed:report.streamed.length},null,2));
}finally{await browser.close();server.close();}
