// Actual fitted panes, wet refraction and wiper clearing in the game renderer.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'windshield').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const view of ['clear','storm','side','night']){
   const stats=await page.evaluate(view=>{
    const s=window.__sim,w=s.world,c=s.cockpit;
    s.start({scenarioId:view==='clear'?'clear':'storm',startId:'short',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    s.game.sim.aircraft.place({x:2700,y:78,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.setMode('cockpit');s.view.setNdView(false);
    Object.assign(s.view.look,{yaw:view==='side'?.55:0,pitch:0,down:false});
    for(let i=0;i<240;i++)s.view.update(1/60);
    s.presentation.frame(0,0);
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const grab=()=>{w.render();const gl=w.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));ctx.drawImage(w.renderer.domElement,0,0,1440,900);return ctx.getImageData(0,0,1440,900).data;};
    const wet=grab();let changed=0,panelChanged=0,maxDelta=0;
    const screens=[c.pfdScreen,c.ndScreen].map(m=>{
     const {width,height}=m.geometry.parameters;
     const pts=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>m.localToWorld(c.eyeLocal.clone().set(x*width*.45,y*height*.45,0)).project(w.camera));
     return {x0:Math.min(...pts.map(p=>(p.x+1)*720)),x1:Math.max(...pts.map(p=>(p.x+1)*720)),y0:Math.min(...pts.map(p=>(1-p.y)*450)),y1:Math.max(...pts.map(p=>(1-p.y)*450))};
    });
    if(c.windshield){
     for(const m of c.windshield.rainMeshes)m.visible=false;const dry=grab();
     for(let y=0;y<900;y++)for(let x=0;x<1440;x++){const i=(y*1440+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(wet[i+k]-dry[i+k])));if(d>2){changed++;if(screens.some(r=>x>r.x0&&x<r.x1&&y>r.y0&&y<r.y1))panelChanged++;}maxDelta=Math.max(maxDelta,d);}
     c.windshield.rainMeshes.forEach(m=>m.visible=c.windshield.wet>.001);grab();
    }
    return {view,wet:c.windshield?.wet,changed,panelChanged,maxDelta,copyCount:c.windshield?.copyCount,captures:[...w.cabinEnvironment.captures.values()].map(x=>!!x.target)};
   },view);
   if(!baseline){
    assert.ok(stats.captures.every(Boolean),'Glazing must not invalidate cabin captures');
    if(view==='clear'){assert.equal(stats.wet,0);assert.equal(stats.changed,0);}
    else {assert.ok(stats.wet>.99&&stats.changed>200,'Rain visibly changes the panes');if(view!=='side')assert.equal(stats.panelChanged,0,'Water must not cover instruments');}
   }
   reports.push({tier,...stats});console.log(tier,stats);await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(view==='storm'&&process.env.RECORD_VIDEO==='1'){
    const video=await page.evaluate(async()=>{
     const s=window.__sim,w=s.world,stream=w.renderer.domElement.captureStream(30),chunks=[];
     const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
     const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
     for(let i=0;i<240;i++){await new Promise(requestAnimationFrame);s.view.update(1/60);w.render();}
     recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
     return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await fs.writeFile(`test/output/${label}-${tier}-moving.webm`,Buffer.from(video,'base64'));
   }
  }
  if(!baseline&&process.env.CAPTURE_ONLY!=='1'){
   const behavior=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world,glass=s.cockpit.windshield;
    // The actual wet shader on an isolated pane: wiping reduces the water mask,
    // movement changes it, and none can survive a zero-wetness reset.
    const original=glass.rainMeshes[0].material,material=original.clone();material.uniforms=T.UniformsUtils.clone(original.uniforms);
    material.fragmentShader=material.fragmentShader.replace(/}\s*$/,'gl_FragColor=vec4(1.,1.,1.,mask); }');
    const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
    const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);scene.add(mesh);
    const r=w.renderer,target=new T.WebGLRenderTarget(256,256),prev=r.getRenderTarget(),color=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();const pixels=new Uint8Array(256*256*4);
    const sample=(front,time,wet)=>{Object.assign(material.uniforms.uFront,{value:front});material.uniforms.uTime.value=time;material.uniforms.uWet.value=wet;material.uniforms.uPhase.value=1.8;r.setRenderTarget(target);r.setClearColor(0,0);r.render(scene,camera);r.readRenderTargetPixels(target,0,0,256,256,pixels);return new Uint8Array(pixels);};
    let full,wiped,moved,empty;
    try{full=sample(0,4,1);wiped=sample(1,4,1);moved=sample(1,4.2,1);empty=sample(1,4.2,0);}
    finally{r.setRenderTarget(prev);r.setClearColor(color,alpha);target.dispose();mesh.geometry.dispose();material.dispose();}
    const sum=p=>p.reduce((n,x,i)=>n+(i%4===3?x:0),0),motion=moved.reduce((n,x,i)=>n+(i%4===3?Math.abs(x-wiped[i]):0),0);
    const outside=glass.outside;let disposed=0;outside?.addEventListener('dispose',()=>disposed++);
    const copies=glass.copyCount;s.view.setMode('hud');for(let i=0;i<60;i++)s.view.update(1/60);w.render();const hudCopies=glass.copyCount-copies;
    s.view.setNdView(true);for(let i=0;i<180;i++)s.view.update(1/60);const beforeND=glass.copyCount;w.render();const ndCopies=glass.copyCount-beforeND;
    s.view.setNdView(false);s.view.setMode('cockpit');for(let i=0;i<90;i++)s.view.update(1/60);
    w.setPixelRatio(1.25);w.render();const resized=glass.outside?[glass.outside.image.width,glass.outside.image.height]:null;
    if(w.quality==='high')w.reduceQuality();const noRefraction=glass.rainMeshes.every(m=>!m.material.defines.REFRACT_PANES)&&!glass.outside;const beforeLow=glass.copyCount;w.render();const lowCopies=glass.copyCount-beforeLow;
    glass.reset();w.render();
    return {wipeRatio:sum(wiped)/sum(full),motion,empty:sum(empty),hudCopies,ndCopies,resized,disposed,noRefraction,lowCopies,resetDry:glass.wet===0&&glass.rainMeshes.every(m=>!m.visible)&&!glass.outside};
   });
   console.log(tier,behavior);
   assert.ok(behavior.wipeRatio>.1&&behavior.wipeRatio<.9,'Wipers clear a bounded sector');assert.ok(behavior.motion>1000,'Water moves');assert.equal(behavior.empty,0);
   assert.equal(behavior.hudCopies,0);assert.equal(behavior.ndCopies,0);assert.ok(behavior.noRefraction&&behavior.resetDry);assert.equal(behavior.lowCopies,0);
   if(tier==='high'){assert.deepEqual(behavior.resized,[1800,1125]);assert.ok(behavior.disposed>=1);}else assert.equal(behavior.resized,null);
   reports.push({tier,behavior});
  }
  if(tier==='low'){
   const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   phone.on('pageerror',e=>errors.push(e.message));await phone.goto(url+'/?quality=low');await phone.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(phone);
   await phone.evaluate(()=>{const s=window.__sim;s.start({scenarioId:'storm',startId:'short',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';s.game.sim.aircraft.place({x:2700,y:78,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.setMode('cockpit');for(let i=0;i<240;i++)s.view.update(1/60);s.presentation.frame(0,0);s.world.render();const gl=s.world.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));});
   await phone.screenshot({path:`test/output/${label}-phone.png`});await phone.close();
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
