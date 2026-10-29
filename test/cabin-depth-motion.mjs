// Matched pilot head movement. Encoded video is visual evidence, not an FPS test.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const label=(process.argv[2]||'cabin-depth-motion').replace(/[^a-z0-9_-]/gi,'-');
const motionPath=process.env.MOTION_PATH||'console';
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await launchBrowser({defaultAngle:'metal'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url+'/?quality=high&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 const result=await page.evaluate(async(motionPath)=>{
  const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');
  s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='paused';
  s.game.sim.aircraft.place({x:3300,y:115,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
  s.view.setMode('cockpit');s.view.setNdView(false);Object.assign(s.view.look,{yaw:0,pitch:0,down:false});
  for(let i=0;i<120;i++){s.presentation.frame(1/60,0);s.view.update(1/60);}w.setPixelRatio(1);
  const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
  s.view.draw();
  const stream=w.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:10000000});
  const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  const frames=[];
  for(let i=0;i<360;i++){
   await new Promise(requestAnimationFrame);
   const t=i/359,wave=Math.sin(Math.PI*t)**2;
   // Smoothly inspect the console, pedestal and forward instruments from the
   // actual fitted eye. No camera translation or nonstandard exterior camera.
   if(motionPath==='materials'){
    const poses=[[0,0],[-.38,-.55],[-.38,.95],[0,0]],segment=Math.min(2,Math.floor(t*3));
    let u=t*3-segment;u=u*u*(3-2*u);
    Object.assign(s.view.look,{yaw:poses[segment][0]*(1-u)+poses[segment+1][0]*u,
      pitch:poses[segment][1]*(1-u)+poses[segment+1][1]*u,down:false});
   }else Object.assign(s.view.look,{yaw:.4*wave,pitch:-.32*wave,down:false});
   s.presentation.frame(1/60,0);s.view.update(1/60);s.view.draw();
   if([0,120,180,240,359].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
  }
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  const video=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  return {video,frames,errors:w.assetErrors};
 },motionPath);
 assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);
 await fs.writeFile(`test/output/${label}.webm`,Buffer.from(result.video,'base64'));
 for(const {frame,png} of result.frames)await fs.writeFile(`test/output/${label}-${frame}.png`,Buffer.from(png,'base64'));
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify({frames:360,pixelRatio:1,view:'pilot head movement',motionPath,errors},null,2)+'\n');
 console.log('Pilot head movement: 360 frames recorded without shader or asset errors.');
}finally{await browser.close();server.close();}
