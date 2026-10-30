// Actual pilot views: final approach, flare, night and storm. Separate from FPS tests.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'landing-lights').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const report=[];
try {
 for(const tier of ['high','low']) {
  const page=await browser.newPage({viewport:tier==='high'?{width:1440,height:900}:{width:852,height:393},hasTouch:tier==='low',isMobile:tier==='low'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  for(const view of ['final','flare','night','storm']) {
   const result=await page.evaluate(async({view,record})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:5,sound:false,skipSchool:true});
    s.setTimeScale(0);s.setDrawing(false);w.setPixelRatio(1);
    // Own the visual clock: the application RAF would otherwise advance lights
    // between captured frames, giving the paired videos different strobe phases.
    s.game.state='menu';w.time=0;w.lights.time=0;w.lightningTimer=4;w.lightningFlash=0;
    s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:false});
    document.getElementById('hud').style.visibility='hidden';
    const pose=i=>{
     const x=(view==='flare'?1800:2800)-i*1.2,y=view==='flare'?17-i*.075:15+(x-1500)*Math.tan(Math.PI/60);
     s.game.sim.aircraft.place({x,y,z:Math.sin(i*.011)*.12,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.update(1/60);
    };
    for(let i=0;i<40;i++)pose(0);
    const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);
    const stream=record&&w.renderer.domElement.captureStream(30),chunks=[];
    const recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:10000000});
    const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
    const frames=[];
    for(let i=0;i<120;i++){
     if(record)await new Promise(requestAnimationFrame);pose(i);if(record||[0,60,119].includes(i))w.render();
     if([0,60,119].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
    }
    let video=null;if(record){recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());video=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});}
    return {frames,video,visualTime:w.time,lightTime:w.lights.time,lights:w.lights.entries.length,papi:w.lights.papiWhites(w.camera.getWorldPosition(new T.Vector3())),errors:w.assetErrors};
   },{view,record:process.env.RECORD_VIDEO==='1'});
   for(const {frame,png} of result.frames)await fs.writeFile(`test/output/${label}-${tier}-${view}-${frame}.png`,Buffer.from(png,'base64'));
   if(result.video)await fs.writeFile(`test/output/${label}-${tier}-${view}.webm`,Buffer.from(result.video,'base64'));
   assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);
   assert.ok(Math.abs(result.lightTime-160/60)<1e-6,'Light animation follows the captured frame clock');
   report.push({tier,view,frames:120,travelM:142.8,visualTime:result.visualTime,lightTime:result.lightTime,lights:result.lights,papi:result.papi,recorded:!!result.video,errors});console.log(report.at(-1));
  }
  await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
