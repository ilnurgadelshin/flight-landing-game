import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
const poses=[];
try{
 const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:true,isMobile:true});
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 for(const view of ['flare','rollout'])for(const enabled of [false,true]){
  const video=await page.evaluate(async({view,enabled})=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
   s.start({startId:'short',scenarioId:'clear',seed:11,sound:false,skipSchool:true});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
   s.game.sim.aircraft.place({x:view==='flare'?1600:1000,y:view==='flare'?11:2.5,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-1.5,onGround:view==='rollout'});
   s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:false});
   const random=Math.random;Math.random=()=>.5;try{for(let i=0;i<40;i++)s.view.update(1/60);}finally{Math.random=random;}
   w.edgeFilter.enabled=enabled;w.setPixelRatio(1);document.getElementById('hud').style.visibility='hidden';w.time=w.lights.time=0;
   const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.groundCover?.settle(eye);
   const camera=w.camera,base=camera.quaternion.clone(),stream=w.renderer.domElement.captureStream(30),chunks=[];
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:12000000}),done=new Promise(resolve=>recorder.onstop=resolve);
   recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();const start=performance.now();
   for(let i=0;i<180;i++){
    await new Promise(resolve=>{const tick=t=>t>=start+i*1000/30?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);});
    camera.quaternion.copy(base).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.sin(i/179*Math.PI*2)*.006));camera.updateMatrixWorld();w.render();
   }
   camera.quaternion.copy(base);camera.updateMatrixWorld(true);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
   const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
   return {data,pose:camera.matrixWorld.toArray()};
  },{view,enabled});
  poses.push({view,enabled,pose:video.pose});
  if(enabled)assert.deepEqual(video.pose,poses.at(-2).pose,'Before/after start from exactly the same pilot camera');
  await fs.writeFile(`test/output/landing-edge-${view}-${enabled?'after':'before'}.webm`,Buffer.from(video.data,'base64'));
 }
 await fs.writeFile('test/output/landing-edge-motion.json',JSON.stringify({frames:180,nominalFps:30,amplitudeRadians:.006,frozenPhysics:true,poses},null,2)+'\n');
 console.log('Matched low-tier flare and rollout camera pans recorded.');
}finally{await browser.close();server.close();}
