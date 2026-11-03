// Deterministic autoland: the final ~30 seconds, flare, touchdown and rollout.
// Own physics/visual clocks so before/after use identical poses. Video is not FPS evidence.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'runway-motion').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const reports=[];
try {
 for(const tier of ['high','low']) {
  const phone=tier==='low',page=await browser.newPage({viewport:phone?{width:852,height:393}:{width:1440,height:900},hasTouch:phone,isMobile:phone}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const result=await page.evaluate(async(record)=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
   s.start({startId:'short',scenarioId:'clear',mode:'game',seed:11,sound:false,skipSchool:true});s.autopilot({});s.setDrawing(false);
   s.game.state='menu';s.setTimeScale(1);s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:false});
   const sim=s.game.sim;
   while(sim.state.agl>120&&sim.state.time<150)sim.stepOnce();
   if(sim.state.agl>120)throw new Error('Autoland did not reach final approach');
   w.time=0;w.lights.time=0;w.setPixelRatio(1);for(let i=0;i<60;i++)s.view.update(1/60);w.time=0;w.lights.time=0;
   const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);
   const stream=record&&w.renderer.domElement.captureStream(30),chunks=[];
   const recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:16000000});
   const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
   const frames=[],trajectory=[];let frame=0;const start=sim.state.time,recordStart=performance.now();
   for(;frame<2400;frame++) {
    if(record)await new Promise(resolve=>{const tick=t=>t>=recordStart+frame*1000/30?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);});
    sim.update(1/30);s.presentation.frame(1/30,1/30);s.view.update(1/30);
    if(record||frame%150===0)w.render();
    const st=sim.state;trajectory.push([st.time,st.x,st.y,st.z,st.pitch,st.roll]);
    if(frame%150===0)frames.push({frame,elapsed:st.time-start,agl:st.agl,onGround:st.onGround,png:w.renderer.domElement.toDataURL().split(',')[1]});
    if(sim.aircraft.touchdown&&st.onGround&&st.groundSpeed<1)break;
   }
   let video=null;if(record){recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());video=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});}
   let hash=2166136261;for(const c of JSON.stringify(trajectory))hash=Math.imul(hash^c.charCodeAt(0),16777619);
   return {frames,video,frameCount:frame+1,start,end:sim.state.time,touchdown:sim.aircraft.touchdown,stopped:sim.state.onGround&&sim.state.groundSpeed<1,destroyed:sim.state.destroyed,trajectoryHash:(hash>>>0).toString(16),errors:w.assetErrors};
  },process.env.RECORD_VIDEO==='1');
  for(const {frame,png}of result.frames)await fs.writeFile(`test/output/${label}-${tier}-${frame}.png`,Buffer.from(png,'base64'));
  if(result.video)await fs.writeFile(`test/output/${label}-${tier}.webm`,Buffer.from(result.video,'base64'));
  assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);assert.ok(result.touchdown);assert.ok(result.stopped);assert.equal(result.destroyed,false);
  reports.push({tier,...result,video:!!result.video,frames:result.frames.map(({png,...f})=>f)});console.log({tier,frames:result.frameCount,trajectoryHash:result.trajectoryHash,stopped:result.stopped});await page.close();
 }
 assert.equal(reports[0].trajectoryHash,reports[1].trajectoryHash,'Quality does not change the landing');
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
