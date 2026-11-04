// A GPU-completed render probe, separate from display-capped RAF timing. gl.finish
// deliberately serializes CPU/GPU work; these numbers are not gameplay FPS.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser({defaultAngle:'metal'});
try{
 const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:true,isMobile:true});
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 const report=await page.evaluate(async()=>{
  const s=window.__sim,w=s.world,r=w.renderer,gl=r.getContext();
  const gpu=gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),results=[];
  for(const ratio of [1,1.5])for(const scenarioId of ['clear','storm']){
   s.start({startId:'short',scenarioId,seed:11,sound:false,skipSchool:true});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
   s.game.sim.aircraft.place({x:1600,y:11,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-1.5});s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:false});for(let i=0;i<40;i++)s.view.update(1/60);w.setPixelRatio(ratio);
   const runs=[];
   for(const enabled of [false,true,true,false]){
    w.edgeFilter.enabled=enabled;const samples=[];
    for(let f=0;f<65;f++){
     if(f%5===0)await new Promise(requestAnimationFrame);
     gl.finish();const start=performance.now();s.view.update(0);w.render();gl.finish();
     if(f>=15)samples.push(performance.now()-start);
    }
    const sorted=[...samples].sort((a,b)=>a-b);runs.push({enabled,p50Ms:sorted[25],p95Ms:sorted[47],meanMs:samples.reduce((a,b)=>a+b)/samples.length});
   }
   const size=r.getDrawingBufferSize(w.edgeFilter.size);results.push({ratio,scenarioId,width:size.x,height:size.y,textureBytes:size.x*size.y*4,runs});
  }
  return {gpu,method:'Alternating disabled/enabled/enabled/disabled: 15 warmup + 50 measured frames each, live instrument updates with frozen physics, gl.finish before and after every draw. CPU and GPU serialized; not gameplay FPS.',results};
 });
 assert.ok(/Apple|AMD|Intel|NVIDIA/.test(report.gpu)&&!/SwiftShader/.test(report.gpu));
 await fs.writeFile('test/output/landing-edge-cost.json',JSON.stringify({date:new Date().toISOString(),...report},null,2)+'\n');console.log(report);
}finally{await browser.close();server.close();}
