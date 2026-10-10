// Recorded descent through both boundaries. Physics is paused; the camera follows
// a repeatable 24 m/s vertical path so the renderer's transitions can be inspected.
// Optional review export (ffmpeg installed):
// ffmpeg -ss FIRST_CAPTION_SECONDS -i test/output/cloud-boundary-motion-high-raw.webm -an -c:v libvpx -deadline realtime -cpu-used 8 -b:v 1800k -crf 12 test/output/cloud-boundary-motion-high.webm
// Repeat for low. Choose the first caption timestamp from each recording; video
// timestamps may differ from the RAF clock. Preserve the full entry and exit.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader'; // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
 ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
// Slow software rendering cannot record continuous motion. Step the same path at
// 30 Hz, rendering representative positions; do not report those updates as FPS.
const record=process.env.RECORD_VIDEO?process.env.RECORD_VIDEO==='1':angle!=='swiftshader';
const report=[];
try{
 for(const tier of ['high','low']){
  const context=await browser.newContext({viewport:{width:1280,height:800},...(record?{recordVideo:{dir:'test/output',size:{width:1280,height:800}}}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const cockpit of [false,true]){
   await page.evaluate(async cockpit=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.setDrawing(false);s.start({startId:'short',scenarioId:'crosswind',seed:5});s.setTimeScale(0);s.game.state='menu';w.time=40;w.setPixelRatio(1);
    document.getElementById('hud').style.visibility='hidden';
    let caption=document.getElementById('motion-caption');if(!caption){caption=document.createElement('div');caption.id='motion-caption';caption.style='position:fixed;left:24px;top:22px;color:white;background:#101923d9;padding:12px;font:18px system-ui;z-index:9999';document.body.append(caption);}
    const camera=cockpit?s.view.cockpit.camera:new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);
    s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;w.drawCockpit=cockpit;
    const place=t=>{
     const y=w.cloudTop+60-24*t;
     if(cockpit){s.game.sim.aircraft.place({x:3300,y,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});for(let i=0;i<4;i++)s.view.update(1/60);}
     else{camera.position.set(3300,y,0);camera.lookAt(-5000,y-420,-2000);camera.updateMatrixWorld();}
     const eye=camera.getWorldPosition(new T.Vector3());
     caption.textContent=`${w.quality} · ${cockpit?'Captain':'Exterior'} · ${eye.y>w.cloudTop?`${Math.round(eye.y-w.cloudTop)} m above top`:eye.y<w.cloudBase?`${Math.round(w.cloudBase-eye.y)} m below base`:`${Math.round(w.cloudTop-eye.y)} m inside from top`}`;
     return eye;
    };
    const eye=place(0);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.update(0,s.state(),eye);w.render();
    window.__cloudMotion={w,camera,place,cockpit,duration:(w.cloudTop-w.cloudBase+120)/24,frames:[],start:null,last:null};
   },cockpit);
   const stats=record?await page.evaluate(()=>new Promise(resolve=>{
    const m=window.__cloudMotion;
    function frame(now){
     m.start??=now;const t=(now-m.start)/1000,dt=m.last===null?0:(now-m.last)/1000;m.last=now;
     const eye=m.place(t);m.w.update(Math.min(.1,dt),window.__sim.state(),eye);m.w.render();if(dt)m.frames.push(dt*1000);
     if(t<m.duration)requestAnimationFrame(frame);else{const sorted=m.frames.slice().sort((a,b)=>a-b);resolve({seconds:t,fps:1000*m.frames.length/m.frames.reduce((a,b)=>a+b,0),p99Ms:sorted[Math.floor(sorted.length*.99)],errors:m.w.assetErrors});}
    }requestAnimationFrame(frame);
   })):await page.evaluate(()=>{
    const m=window.__cloudMotion,steps=Math.ceil(m.duration*30),sampleSteps=new Set([0,Math.round(steps*.2),Math.round(steps*.5),Math.round(steps*.8),steps]),samples=[];
    for(let i=0;i<=steps;i++){
     const t=Math.min(i/30,m.duration),eye=m.place(t);m.w.update(i?1/30:0,window.__sim.state(),eye);
     if(sampleSteps.has(i)){m.w.render();samples.push({seconds:t,aboveBase:eye.y-m.w.cloudBase,aboveTop:eye.y-m.w.cloudTop});}
    }
    return {seconds:m.duration,steps,samples,fps:null,p99Ms:null,errors:m.w.assetErrors};
   });
   // WebGL calls return before the GPU has drawn them: software rendering was still drawing the
   // sampled frames 36 s later, beyond a screenshot's 30 s. Read one pixel to wait for them first.
   await page.evaluate(()=>{const gl=window.__sim.world.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));});
   await page.screenshot({path:`test/output/cloud-boundary-motion-${tier}-${cockpit?'captain':'exterior'}.png`});
   if(!record){
    assert.ok(stats.steps>500&&stats.samples.length===5,'The whole descent is stepped');
    assert.ok(stats.samples[0].aboveTop>0&&stats.samples.at(-1).aboveBase<0,'Both cloud boundaries are crossed');
    assert.ok(stats.samples[2].aboveTop<0&&stats.samples[2].aboveBase>0,'Deep cloud is rendered');
   }
   assert.deepEqual(stats.errors,[]);report.push({tier,cockpit,recorded:record,...stats});console.log(tier,cockpit,stats);
  }
  const video=page.video();await context.close();if(video){await video.saveAs(`test/output/cloud-boundary-motion-${tier}-raw.webm`);await video.delete();}assert.deepEqual(errors,[]);
 }
 await fs.writeFile('test/output/cloud-boundary-motion.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
