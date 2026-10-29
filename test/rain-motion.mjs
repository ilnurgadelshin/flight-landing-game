// Rendered regressions for the old 10-second outside loop and repeating pane beads.
// REVIEW_ROOT serves the archived baseline. RECORD_VIDEO=1 adds 20-second clips.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'rain-current').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser();
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const isolated=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
   s.start({scenarioId:'storm',startId:'short',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
   const r=w.renderer,scene=new T.Scene(),cam=new T.PerspectiveCamera(58,1.6,.1,150);cam.lookAt(-1,0,0);cam.updateMatrixWorld();
   const mesh=w.rain.clone(),rig=new T.Group();rig.add(mesh);scene.add(rig);
   const current=!!w.precipitation;
   if(current){w.precipitation.reset();mesh.position.set(0,0,0);}else rig.quaternion.copy(cam.quaternion);
   const mat=mesh.material,oldColor=mat.uniforms.uColor.value.clone();mat.uniforms.uColor.value.set(0xffffff);
   const target=new T.WebGLRenderTarget(640,400),prev=r.getRenderTarget(),clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();
   const state={vx:-70,vy:0,vz:0,groundSpeed:70,windKts:0,windDirDeg:0},eye=new T.Vector3();let time=0;
   const grab=()=>{r.setRenderTarget(target);r.setClearColor(0,0);r.render(scene,cam);const p=new Uint8Array(640*400*4);r.readRenderTargetPixels(target,0,0,640,400,p);return p;};
   const sample=t=>{
    if(current){while(time<t-1e-8){const dt=Math.min(1/60,t-time);w.precipitation.update(dt,state,eye,r);time+=dt;}mat.uniforms.uResolution.value.set(640,400);mat.uniforms.uDpr.value=1;}
    else{mat.uniforms.uTime.value=t;mat.uniforms.uVel.value.set(0,-9,56);}
    return grab();
   };
   const overlap=(a,b)=>{let lo=0,hi=0,covered=0;for(let i=3;i<a.length;i+=4){lo+=Math.min(a[i],b[i]);hi+=Math.max(a[i],b[i]);if(a[i]>2)covered++;}return {overlap:lo/Math.max(1,hi),covered};};
   const image=p=>{const c=document.createElement('canvas');c.width=640;c.height=400;const flipped=new Uint8ClampedArray(p.length);for(let y=0;y<400;y++)flipped.set(p.subarray(y*2560,(y+1)*2560),(399-y)*2560);c.getContext('2d').putImageData(new ImageData(flipped,640,400),0,0);return c.toDataURL().split(',')[1];};
   let outside,beads,pngs;
   try{
    const a=sample(2),b=sample(12);outside=overlap(a,b);pngs={outside2:image(a),outside12:image(b)};
    scene.remove(rig);
    // Normalize the arrival clock to one second only in this isolated test.
    // The actual drop function must change placement on successive arrivals.
    const original=s.cockpit.windshield.rainMeshes[0].material,glass=original.clone();
    glass.uniforms=T.UniformsUtils.clone(original.uniforms);
    glass.fragmentShader=original.fragmentShader.replace(/uTime\*\(\.13\+\.12\*(?:base|h)\)/g,'uTime').replace(/void main\(\)\{[\s\S]*$/,'void main(){float mask=drops(vPaneUV,vec2(6.,4.),0.).z;gl_FragColor=vec4(1.,1.,1.,mask);}');
    const quad=new T.Mesh(new T.PlaneGeometry(2,2),glass),ortho=new T.OrthographicCamera(-1,1,1,-1,.1,10);ortho.position.z=1;scene.add(quad);
    const pane=t=>{glass.uniforms.uTime.value=t;r.setClearColor(0,0);r.render(scene,ortho);const p=new Uint8Array(640*400*4);r.readRenderTargetPixels(target,0,0,640,400,p);return p;};
    const c=pane(.4),d=pane(1.4);beads=overlap(c,d);pngs.beads1=image(c);pngs.beads2=image(d);
    quad.geometry.dispose();glass.dispose();
   }finally{mat.uniforms.uColor.value.copy(oldColor);r.setRenderTarget(prev);r.setClearColor(clear,alpha);target.dispose();}
   return {outside,beads,pngs};
  });
  for(const [name,png] of Object.entries(isolated.pngs))await fs.writeFile(`test/output/${label}-${tier}-${name}.png`,Buffer.from(png,'base64'));
  delete isolated.pngs;console.log(tier,isolated);reports.push({tier,...isolated});
  if(!baseline){assert.ok(isolated.outside.covered>100,'Outside rain remains visible');assert.ok(isolated.outside.overlap<.15,'No ten-second outside constellation loop');assert.ok(isolated.beads.covered>1000);assert.ok(isolated.beads.overlap<.65,'Successive pane arrivals have new positions');}
  for(const view of ['storm','side','night','stopped']){
   await page.evaluate(view=>{
    const s=window.__sim,w=s.world;s.start({scenarioId:'storm',startId:'short',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    s.game.sim.aircraft.place({x:view==='stopped'?1200:2700,y:view==='stopped'?2.5:78,z:0,headingDeg:270,iasKts:view==='stopped'?0:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:view==='stopped'});
    w.time=0;w.lightningTimer=4;w.lightningFlash=0;s.view.setMode('cockpit');s.view.setNdView(false);Object.assign(s.view.look,{yaw:view==='side'?.55:0,pitch:0,down:false});
    for(let i=0;i<240;i++)s.view.update(1/60);s.presentation.frame(0,0);w.render();const gl=w.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(view==='storm'&&process.env.RECORD_VIDEO==='1'){
    const movie=await page.evaluate(async()=>{
     const s=window.__sim,w=s.world,stream=w.renderer.domElement.captureStream(30),chunks=[];
     const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
     const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
     let start,last;await new Promise(resolve=>{function frame(t){start??=t;last??=t;s.view.update(Math.min(.1,(t-last)/1000));last=t;w.render();if(t-start<20000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
     recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await fs.writeFile(`test/output/${label}-${tier}-moving.webm`,Buffer.from(movie,'base64'));
   }
  }
  if(!baseline){
   const bounds=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.view.look.yaw=1.1;for(let i=0;i<90;i++)s.view.update(1/60);const worldOriented=w.rain.quaternion.equals(w.rain.quaternion.clone().identity());w.reduceQuality();const count=w.rain.geometry.instanceCount;s.start({scenarioId:'clear',startId:'short'});s.view.update(1/60);w.render();return {worldOriented,count,dry:!w.rain.visible};});
   assert.deepEqual(bounds,{worldOriented:true,count:900,dry:true});reports.push({tier,bounds});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
