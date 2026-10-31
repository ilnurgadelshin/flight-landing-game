// Include live canvas uploads and GPU mip generation, which the scenery-only
// benchmark freezes. Sequential hardware runs; no recording or readPixels.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'instrument-benchmark').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser({defaultAngle:'metal'});
const report={date:new Date().toISOString(),browser:browser.version(),warmup:4,sample:12,
 method:'Actual application RAF, presentation, live instrument redraws/uploads and rendering; frozen flight physics. Display-capped Mac timing, not physical-phone performance.',results:[]};
try {
 for(const tier of ['high','low']) {
  const phone=tier==='low',viewport=phone?{width:852,height:393}:{width:1440,height:900},ratio=phone?1:1.5;
  const page=await browser.newPage({viewport,deviceScaleFactor:phone?2:1,hasTouch:phone,isMobile:phone}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const gpu=await page.evaluate(()=>{const gl=window.__sim.world.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
  assert.ok(/Apple|AMD|Intel|NVIDIA/.test(gpu)&&!/SwiftShader|llvmpipe/.test(gpu));report.gpu=gpu;
  for(const mode of ['forward','panel','storm','rollout']) {
   await page.evaluate(({mode,ratio})=>{const s=window.__sim;
    s.start({startId:'short',scenarioId:mode==='storm'?'storm':'clear',seed:11,mode:'game',sound:false,skipSchool:true});s.setTimeScale(0);s.setDrawing(true);s.world.setPixelRatio(ratio);
    s.game.sim.aircraft.place({x:mode==='rollout'?1000:2700,y:mode==='rollout'?2.5:78,z:0,headingDeg:270,iasKts:mode==='rollout'?85:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:mode==='rollout'});
    s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:mode==='panel'});
   },{mode,ratio});
   const sample=await page.evaluate(()=>new Promise(resolve=>{let start,last,firstVersion;const intervals=[];
    function frame(t){start??=t;last??=t;const s=window.__sim;
     if(t-start>4000){firstVersion??=s.cockpit.pfd.tex.version;intervals.push(t-last);}last=t;
     if(t-start<16000)requestAnimationFrame(frame);else{const sorted=[...intervals].sort((a,b)=>a-b);
      resolve({fps:1000*intervals.length/intervals.reduce((sum,t)=>sum+t,0),p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],frames:intervals.length,
       pfdUpdates:s.cockpit.pfd.tex.version-firstVersion,pixelRatio:s.world.renderer.getPixelRatio(),errors:s.world.assetErrors});}}
    requestAnimationFrame(frame);
   }));
   assert.ok(sample.pfdUpdates>=sample.frames-2,'Every sampled frame includes live PFD work');assert.equal(sample.pixelRatio,ratio);assert.deepEqual(sample.errors,[]);
   report.results.push({tier,mode,viewport,devicePixelRatio:phone?2:1,...sample});console.log(report.results.at(-1));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
