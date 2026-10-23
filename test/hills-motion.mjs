// Normal pilot camera descending through the hillside view. This is a visual
// motion recording, not an FPS measurement (video encoding changes frame cost).
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'hills-motion').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
// Software rendering draws only the three sampled frames; hardware records the video too.
const record=angle!=='swiftshader'&&process.env.RECORD_VIDEO!=='0';
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
 const result=await page.evaluate(async record=>{
  const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
  s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
  document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
  s.view.setMode('cockpit');s.view.look.yaw=s.view.look.pitch=0;
  const place=i=>{const x=6800-i*1.25;s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.update(1/60)};
  for(let i=0;i<40;i++)place(0);
  const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
  const stream=record&&w.renderer.domElement.captureStream(30),chunks=[],recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});
  const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
  const frames=[];
  for(let i=0;i<480;i++){
   if(record)await new Promise(requestAnimationFrame);place(i);w.update(1/60,s.state(),w.camera.getWorldPosition(eye));
   if(record||[0,240,479].includes(i))w.render();
   if([0,240,479].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
  }
  let video=null;
  if(record){
   recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
   video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}))});
  }
  return {video,frames,errors:w.assetErrors};
 },record);
 assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);
 if(result.video)await fs.writeFile(`test/output/${label}.webm`,Buffer.from(result.video,'base64'));
 for(const {frame,png} of result.frames)await fs.writeFile(`test/output/${label}-${frame}.png`,Buffer.from(png,'base64'));
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify({tier:'high',pixelRatio:1,frames:480,recorded:!!result.video,fromX:6800,toX:6201.25,metresPerSimulatedSecond:75,errors},null,2)+'\n');
 console.log(`Normal pilot descent ${result.video?'recorded':'sampled'} without renderer errors`);
}finally{await browser.close();server.close()}
