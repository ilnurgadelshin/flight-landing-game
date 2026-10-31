// Matched pilot head movement with the actual displays; not a performance test.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'instrument-motion').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const reports=[];
try {
 for(const tier of ['high','low']) {
  const phone=tier==='low',page=await browser.newPage({viewport:phone?{width:852,height:393}:{width:1440,height:900},hasTouch:phone,isMobile:phone}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  for(const night of [false,true]) {
   const result=await page.evaluate(async({night,record})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'clear',night,seed:5,sound:false,skipSchool:true});s.setTimeScale(0);s.setDrawing(false);
    // Prevent the application RAF from advancing a second, uncontrolled visual clock.
    s.game.state='menu';w.time=0;w.lights.time=0;w.setPixelRatio(1);
    s.game.sim.aircraft.place({x:2700,y:78,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    s.view.setMode('cockpit');s.view.setNdView(false);Object.assign(s.view.look,{yaw:0,pitch:0,down:false});
    for(let i=0;i<60;i++)s.view.update(1/60);
    const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);
    const stream=record&&w.renderer.domElement.captureStream(30),chunks=[];
    const recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:14000000});
    const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
    const frames=[];
    for(let i=0;i<180;i++) {
     if(record)await new Promise(requestAnimationFrame);
     const wave=Math.sin(Math.PI*i/179)**2;
     Object.assign(s.view.look,{yaw:.28*wave,pitch:-.25*wave});s.view.update(1/60);
     if(record||[0,90,179].includes(i))w.render();
     if([0,90,179].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
    }
    let video=null;if(record){recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});}
    return {frames,video,time:w.time,lightTime:w.lights.time,errors:w.assetErrors};
   },{night,record:process.env.RECORD_VIDEO==='1'});
   const scene=night?'night':'day';
   for(const {frame,png}of result.frames)await fs.writeFile(`test/output/${label}-${tier}-${scene}-${frame}.png`,Buffer.from(png,'base64'));
   if(result.video)await fs.writeFile(`test/output/${label}-${tier}-${scene}.webm`,Buffer.from(result.video,'base64'));
   assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);assert.ok(Math.abs(result.lightTime-4)<1e-6);
   reports.push({tier,scene,frames:180,recorded:!!result.video,worldRatio:1,visualTime:result.time,lightTime:result.lightTime,errors});console.log(reports.at(-1));
  }
  await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
