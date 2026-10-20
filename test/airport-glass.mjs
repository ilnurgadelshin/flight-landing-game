// Real glass material under axis-aligned/grazing rays, and a moving full-game view.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'airport-glass').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
 const report={baseline};
 if(!baseline){
  report.rays=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),w=window.__sim.world,r=w.renderer;
   const mat=w.airportArchitecture.materials.glass.clone();mat.onBeforeCompile=w.airportArchitecture.materials.glass.onBeforeCompile;
   mat.color.set(0);mat.emissive.set(0xffffff);mat.emissiveIntensity=1;mat.fog=false;mat.toneMapped=false;
   const g=new T.PlaneGeometry(6.7,5).toNonIndexed();g.translate(0,2.5,0);
   g.setAttribute('paneUV',g.attributes.uv.clone());
   for(const [name,data] of [['paneSize',[6.7,5]],['paneRight',[1,0,0]],['paneUp',[0,1,0]],['paneVariant',[0]]])g.setAttribute(name,new T.Float32BufferAttribute(Array.from({length:6},()=>data).flat(),data.length));
   const scene=new T.Scene();scene.add(new T.Mesh(g,mat));
   const camera=new T.PerspectiveCamera(35,1,.01,200),target=new T.WebGLRenderTarget(192,192,{type:T.FloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
   const previous=r.getRenderTarget(),clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha(),results=[];
   try{
    r.setRenderTarget(target);r.setClearColor(0,0);
    for(const [x,y,z] of [[-5,2.5,18],[0,2.5,18],[5,2.5,18],[20,2.5,.8],[0,25,.8],[0,0.01,18]]){
     camera.position.set(x,y,z);camera.lookAt(0,2.5,0);camera.updateMatrixWorld();r.render(scene,camera);
     const pixels=new Float32Array(192*192*4);r.readRenderTargetPixels(target,0,0,192,192,pixels);
     let finite=true,lit=0,board=0,sumX=0,minX=192,maxX=0;
     for(let i=0;i<pixels.length;i+=4){
      for(let k=0;k<4;k++)if(!Number.isFinite(pixels[i+k])||pixels[i+k]<0||pixels[i+k]>8)finite=false;
      if(pixels[i+3]>.5){const xx=i/4%192;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);if(pixels[i]+pixels[i+1]+pixels[i+2]>.01)lit++;
       if(pixels[i+2]>pixels[i]*2&&pixels[i+1]>pixels[i]*1.8&&pixels[i]>.04){board++;sumX+=xx;}
      }
     }
     results.push({eye:[x,y,z],finite,lit,board,boardPosition:board?(sumX/board-minX)/(maxX-minX):null});
    }
   }finally{r.setRenderTarget(previous);r.setClearColor(clear,alpha);target.dispose();g.dispose();mat.dispose();}
   return results;
  });
  assert.ok(report.rays.every(r=>r.finite&&r.lit>0),'Axis-aligned and grazing views draw finite, lit room pixels');
  const views=report.rays.slice(0,3);assert.ok(views.every(r=>r.lit>1000&&r.board>4),'Rooms remain lit and retain their rear-wall detail');
  assert.ok(views[2].boardPosition-views[0].boardPosition>.1,'Rear-wall detail moves relative to the pane, rather than staying painted on it');
 }
 const record=angle!=='swiftshader'&&process.env.RECORD_VIDEO!=='0';
 const motion=await page.evaluate(async record=>{
  const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
  s.start({startId:'short',scenarioId:'clear',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
  document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
  const camera=new T.PerspectiveCamera(50,1440/900,.1,60000);w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;w.drawCockpit=false;
  camera.position.set(75,6,388);camera.lookAt(0,7,426);camera.updateMatrixWorld();
  await w.groundDetail.settle(camera.position);w.nearWoodland?.settle(camera.position);w.groundCover?.settle(camera.position);
  const stream=record&&w.renderer.domElement.captureStream(30),chunks=[],recorder=record&&new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});
  const done=record&&new Promise(resolve=>recorder.onstop=resolve);if(record){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
  const frames=[];
  for(let i=0;i<180;i++){
   await new Promise(requestAnimationFrame);camera.position.x=75-i*100/179;camera.lookAt(0,7,426);camera.updateMatrixWorld();
   w.update(1/60,{...s.state(),alt:6},camera.position);w.render();
   if([0,90,179].includes(i))frames.push({frame:i,png:w.renderer.domElement.toDataURL().split(',')[1]});
  }
  let video=null;
  if(record){recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});}
  return {frames,video,errors:w.assetErrors};
 },record);
 assert.deepEqual(motion.errors,[]);assert.deepEqual(errors,[]);
 for(const {frame,png} of motion.frames)await fs.writeFile(`test/output/${label}-motion-${frame}.png`,Buffer.from(png,'base64'));
 if(motion.video)await fs.writeFile(`test/output/${label}-moving.webm`,Buffer.from(motion.video,'base64'));
 report.motion={frames:180,distance:100,video:!!motion.video,errors};
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();server.close();}
