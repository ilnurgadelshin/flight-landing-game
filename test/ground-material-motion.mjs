// Matched moving views expose repeat patterns and shimmer that still images hide.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'ground-motion').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
 for(const view of ['soil','meadow']){
  const result=await page.evaluate(async({view,record})=>{
   const T=await import('/vendor/three.module.js'),{sceneryGroundHeight:height}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
   s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
   document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
   const camera=new T.PerspectiveCamera(50,1440/900,.1,60000);w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;w.drawCockpit=false;
   const x=view==='soil'?3350:3370,z=view==='soil'?580:-650;
   const place=i=>{camera.position.set(x+i/179*30,height(x+i/179*30,z,w.groundLowDetail)+3.5,z);camera.lookAt(camera.position.x+45,height(camera.position.x+45,z+12,w.groundLowDetail),z+12);camera.updateMatrixWorld();};
   place(0);await w.groundDetail.settle(camera.position);w.nearWoodland?.settle(camera.position);w.groundCover?.settle(camera.position);
   const stream=record&&w.renderer.domElement.captureStream(30),chunks=[],recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000});
   const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
   const frames=[];
   for(let i=0;i<180;i++){
    if(record)await new Promise(requestAnimationFrame);place(i);w.update(1/60,{...s.state(),alt:camera.position.y},camera.position);
    if(record||[0,90,179].includes(i))w.render();
    if([0,90,179].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
   }
   let video=null;if(record){recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});}
   return {frames,video,errors:w.assetErrors};
  },{view,record:angle!=='swiftshader'&&process.env.RECORD_VIDEO!=='0'});
  assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
  for(const {frame,png}of result.frames)await fs.writeFile(`test/output/${label}-${view}-${frame}.png`,Buffer.from(png,'base64'));
  if(result.video)await fs.writeFile(`test/output/${label}-${view}.webm`,Buffer.from(result.video,'base64'));
  report.push({view,frames:180,distance:30,recorded:!!result.video,errors});console.log(report.at(-1));
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
