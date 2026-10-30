// Hardware-only phone-viewport comparison including UI and native PFD redraw.
// Emulation on a Mac is not a physical-phone speed or battery measurement.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'landing-benchmark').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser({defaultAngle:'metal'});
try {
 const page=await browser.newPage({viewport:{width:852,height:393},deviceScaleFactor:2,hasTouch:true,isMobile:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 const gpu=await page.evaluate(()=>{const gl=window.__sim.world.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
 assert.ok(/Apple|AMD|Intel|NVIDIA/.test(gpu)&&!/SwiftShader|llvmpipe/.test(gpu));
 const report={gpu,viewport:[852,393],worldPixelRatio:1,devicePixelRatio:2,warmup:4,sample:12,
  method:'Actual application RAF, UI, instrument updates and rendering; frozen flight physics; M2 phone viewport emulation, not a physical phone.',results:[]};
 for(const mode of ['forward','panel','rollout']){
  await page.evaluate(mode=>{const s=window.__sim;s.start({startId:'short',scenarioId:'clear',seed:11,mode:'game',sound:false,skipSchool:true});s.setTimeScale(0);s.setDrawing(true);s.world.setPixelRatio(1);
   s.game.sim.aircraft.place({x:mode==='rollout'?1000:2700,y:mode==='rollout'?2.5:78,z:0,headingDeg:270,iasKts:mode==='rollout'?85:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:mode==='rollout'});
   s.view.setMode('cockpit');s.view.look.down=mode==='panel';},mode);
  const sample=await page.evaluate(()=>new Promise(resolve=>{let start,last;const intervals=[];
   function frame(t){start??=t;last??=t;if(t-start>4000)intervals.push(t-last);last=t;
    if(t-start<16000)requestAnimationFrame(frame);else{const sorted=[...intervals].sort((a,b)=>a-b);resolve({fps:1000*intervals.length/intervals.reduce((s,t)=>s+t,0),p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)]});}}
   requestAnimationFrame(frame);
  }));report.results.push({mode,...sample});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();server.close();}
