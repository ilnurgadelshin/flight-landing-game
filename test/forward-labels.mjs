import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery,functionalScene} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'forward-labels',baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const report={date:new Date().toISOString(),baseline,results:[]};
try{
 for(const tier of ['high','low']){
  const phone=tier==='low',viewport=phone?{width:852,height:393}:{width:1440,height:900};
  const page=await browser.newPage({viewport,hasTouch:phone,isMobile:phone}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('737-forward-labels'))requests.push(r.url());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  for(const view of (process.env.LABEL_VIEWS||'forward,flare,close,night,storm').split(',')){
   const result=await page.evaluate(async({view,viewport})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:11,sound:false,skipSchool:true});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    s.game.sim.aircraft.place({x:view==='forward'?2700:1600,y:view==='forward'?78:11,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-1.5});
    w.camera=s.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:false});for(let i=0;i<40;i++)s.view.update(1/60);
    if(view==='close'){
     const c=new T.PerspectiveCamera(45,viewport.width/viewport.height,.01,60000),root=s.cockpit.root;root.updateMatrixWorld(true);
     c.position.copy(root.localToWorld(new T.Vector3(-.23,-.11,-.36)));c.up.set(0,1,0).transformDirection(root.matrixWorld);c.lookAt(root.localToWorld(new T.Vector3(-.01,-.19,-.95)));c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);w.time=0;w.lights.time=0;
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    w.render();const root=s.cockpit.authoredModel,meshes=[];root.traverse(m=>{if(m.isMesh&&m.name.startsWith('TextAtlas'))meshes.push(m);});
    return {labels:root.userData.forwardLabels||null,draws:meshes.length,triangles:meshes.reduce((n,m)=>n+m.geometry.index.count/3,0),coverage:meshes[0]?.material.map.format===T.RedFormat,errors:w.assetErrors};
   },{view,viewport});
   assert.deepEqual(result.errors,[]);if(!baseline){if(phone){assert.equal(result.labels.glyphs,1490);assert.equal(result.draws,4);assert.equal(result.triangles,834);assert.equal(result.coverage,true);}else assert.equal(result.labels,null);}
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});report.results.push({tier,view,...result});
   if(process.env.RECORD_VIDEO==='1'&&phone&&['flare','close'].includes(view)){
    const video=await page.evaluate(async()=>{
     const T=await import('/vendor/three.module.js'),w=window.__sim.world,camera=w.camera,base=camera.quaternion.clone();
     const stream=w.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:12000000});
     const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();const start=performance.now();
     for(let i=0;i<180;i++){
      await new Promise(resolve=>{const tick=t=>t>=start+i*1000/30?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);});
      camera.quaternion.copy(base).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.sin(i/179*Math.PI*2)*.006));camera.updateMatrixWorld();w.render();
     }
     camera.quaternion.copy(base);camera.updateMatrixWorld();recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
     return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await fs.writeFile(`test/output/${label}-${view}.webm`,Buffer.from(video,'base64'));
   }
  }
  if(!baseline)assert.equal(requests.length,phone?1:0,'Only the cockpit that omitted the source text downloads the derivative');
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline){
  const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:true,isMobile:true});await functionalScene(page);
  await page.route('**/737-forward-labels.glb',r=>r.abort());await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});
  report.fallback=await page.evaluate(()=>{const c=window.__sim.cockpit;return {authored:!!c.authoredModel,labelError:!!c.authoredModel?.userData.forwardLabels?.error,modelError:!!c.modelError};});
  assert.deepEqual(report.fallback,{authored:true,labelError:true,modelError:false});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log('Forward labels: tier policy, matched views, shader compilation and fallback passed.');
}finally{await browser.close();server.close();}
