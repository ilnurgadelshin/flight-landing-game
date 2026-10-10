import {completeScenery} from './scene-ready.mjs';
// Hardware renderer benchmark, separate from SwiftShader correctness tests.
// Measures fixed-resolution RAF pacing, not uncapped GPU throughput or flight physics.
// node test/render-benchmark.mjs [label]
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const label=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'-');
const highPixelRatio=Number(process.env.BENCHMARK_DPR||1.5);
const disabled=(process.env.BENCHMARK_DISABLE||'').split(',').filter(Boolean);
const scenes=process.env.BENCHMARK_SCENES?.split(',')||['captain','nearby','storm'];
const outputRoot=path.resolve(new URL('..',import.meta.url).pathname);
const root=process.env.BENCHMARK_ROOT||outputRoot;
const {server,url}=await startServer(root);
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const report={date:new Date().toISOString(),browser:browser.version(),platform:os.platform(),arch:os.arch(),
  viewport:[1440,900],pixelRatio:{high:highPixelRatio,low:1},disabled,warmupSeconds:4,sampleSeconds:12,
  method:'Private Chromium ANGLE Metal; fixed-resolution renderer and scenery updates, paused physics. RAF pacing is display capped; no gl.finish. CPU times exclude asynchronous GPU work.',results:[]};
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    const startupBytes=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.encodedBodySize,0));
    await completeScenery(page);
    (report.startupBytes??={})[tier]=startupBytes;
    const gpu=await page.evaluate(()=>{
      const s=window.__sim;s.setDrawing(false);s.game.state='menu';s.benchmarkCamera=s.world.camera;
      const gl=s.world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    });
    if(!/Apple|AMD|Intel|NVIDIA/i.test(gpu)||/SwiftShader|llvmpipe|software/i.test(gpu))throw new Error(`Hardware rendering not established: ${gpu}`);
    report.gpu=gpu;
    for(const scene of scenes){
      const result=await page.evaluate(async({scene,warmup,seconds,pixelRatio,disabled})=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        w.camera=s.benchmarkCamera;if(w.composer)w.composer.passes[0].camera=w.camera;
        s.start({startId:'short',scenarioId:scene==='storm'?'storm':scene.startsWith('deck-')?'crosswind':'clear',seed:5});s.setTimeScale(0);
        s.game.sim.aircraft.place({x:scene==='rollout'?1000:3300,y:scene==='rollout'?2.5:scene==='deck-captain'?w.cloudTop+220:115,z:0,headingDeg:270,iasKts:scene==='rollout'?85:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:scene==='rollout'});
        s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
        s.game.state='menu';w.setPixelRatio(pixelRatio);
        if(['nearby','site','corridor','extension','opposite','shoulder','north-farm','hamlet','deck-top','deck-base','deck-near-top','deck-inside-base','grass-meadow','grass-pasture'].includes(scene)){
          const c=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);
          if(scene==='grass-meadow'){c.position.set(2350,3.45,330);c.lookAt(2470,3,415);}
          else if(scene==='grass-pasture'){const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');c.position.set(3370,sceneryGroundHeight(3370,-650,w.groundLowDetail)+2.5,-650);c.lookAt(3550,4,-740);}
          else if(scene==='deck-top'){c.position.set(3300,w.cloudTop+320,0);c.lookAt(-5000,w.cloudTop-500,-2000);}
          else if(scene==='deck-base'){c.position.set(3300,w.cloudBase-120,0);c.lookAt(-5000,w.cloudBase+200,-2000);}
          else if(scene==='deck-near-top'){c.position.set(3300,w.cloudTop+12,0);c.lookAt(-5000,w.cloudTop-500,-2000);}
          else if(scene==='deck-inside-base'){c.position.set(3300,w.cloudBase+24,0);c.lookAt(-5000,w.cloudBase+200,-2000);}
          else if(scene==='north-farm'){c.position.set(2390,15,-320);c.lookAt(2387,3,-385);}
          else if(scene==='hamlet'){c.position.set(3150,14,-310);c.lookAt(3195,2,-277);}
          else if(scene==='shoulder'){c.position.set(1250,3.7,-29);c.lookAt(1120,1,-41);}
          else if(scene==='nearby'){c.position.set(2530,18,352);c.lookAt(2465.9,8,303.6);}
          else if(scene==='site'){c.position.set(2670,24,500);c.lookAt(2600,3,433);}
          else if(scene==='opposite'){c.position.set(4040,250,-910);c.lookAt(2810,35,-475);}
          else if(scene==='corridor'){c.position.set(3900,240,850);c.lookAt(2650,0,400);}
          else {c.position.set(5950,240,950);c.lookAt(4250,40,300);}
          c.updateMatrixWorld();
          w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
        }
        const eye=w.camera.getWorldPosition(new T.Vector3());
        await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
        if(disabled.includes('cumulus')&&w.cumulus)w.cumulus.group.visible=false;
        if(disabled.includes('bloom')&&w.bloom)w.bloom.enabled=false;
        if(disabled.includes('shadows'))w.renderer.shadowMap.enabled=false;
        const base=w.camera.position.clone(),state={...s.state(),alt:scene.startsWith('deck-')||scene.startsWith('grass-')?eye.y:scene==='north-farm'?15:scene==='hamlet'?14:scene==='shoulder'?3.7:scene==='rollout'?5:scene==='site'?24:scene==='nearby'?18:scene==='opposite'?250:['corridor','extension'].includes(scene)?240:115};
        const intervals=[],cpu=[],calls=[],triangles=[];let start,last;
        w.renderer.info.autoReset=false;
        await new Promise(resolve=>{
          function frame(now){
            start??=now;last??=now;const elapsed=(now-start)/1000,dt=Math.min(.1,(now-last)/1000);
            if(elapsed>warmup&&last!==now)intervals.push(now-last);
            last=now;
            // Move the close camera through 30 m to include tree/ground selection updates.
            if(scene==='nearby'||scene.startsWith('grass-')){w.camera.position.x=base.x-Math.min(30,elapsed*1.875);w.camera.updateMatrixWorld();}
            const t=performance.now();w.update(dt,state,w.camera.getWorldPosition(new T.Vector3()));
            w.renderer.info.reset();w.render();
            if(elapsed>warmup){cpu.push(performance.now()-t);calls.push(w.renderer.info.render.calls);triangles.push(w.renderer.info.render.triangles);}
            if(elapsed<warmup+seconds)requestAnimationFrame(frame);else resolve();
          }requestAnimationFrame(frame);
        });
        w.renderer.info.autoReset=true;
        const sorted=xs=>[...xs].sort((a,b)=>a-b),q=(xs,p)=>sorted(xs)[Math.floor((xs.length-1)*p)];
        const sum=intervals.reduce((a,b)=>a+b,0);
        return {scene,frames:intervals.length,fps:1000*intervals.length/sum,p50FrameMs:q(intervals,.5),p95FrameMs:q(intervals,.95),p99FrameMs:q(intervals,.99),
          cpuP50Ms:q(cpu,.5),cpuP95Ms:q(cpu,.95),medianDrawCalls:q(calls,.5),medianTriangles:q(triangles,.5),
          nearTreesAtEnd:w.nearWoodland?.count||0,pixelRatio:w.renderer.getPixelRatio(),assets:w.assetErrors};
      },{scene,warmup:report.warmupSeconds,seconds:report.sampleSeconds,pixelRatio:tier==='high'?highPixelRatio:1,disabled});
      report.results.push({tier,...result});console.log(tier,result);
    }
    if(errors.length)throw new Error(errors.join('\n'));await page.close();
  }
  await fs.writeFile(path.join(outputRoot,`test/output/render-benchmark-${label}.json`),JSON.stringify(report,null,2)+'\n');
  console.log(`Hardware benchmark saved: ${report.gpu}`);
}finally{await browser.close();server.close();}
