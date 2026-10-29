// Matched game views, real shader contribution, distance fade, delivery and fallback.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'ground-materials').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser();
const reports=[];
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});
  const startup=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/ground-(color|surface)/.test(r.name)).length);
  assert.equal(startup,0,'New ground maps must not delay the menu');
  await completeScenery(page);
  const report={tier,views:[]};reports.push(report);
  for(const view of process.env.REVIEW_VIEWS?.split(',')||['meadow','soil','forest','turf','captain','rollout','distant','wet','night']){
   const pose=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight:height}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='wet'?'storm':'clear',night:view==='night',seed:5});
    s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';document.getElementById('hud').style.visibility='hidden';
    const c=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);
    let p=view==='soil'?[3350,580]:view==='forest'?[2900,550]:view==='turf'?[1250,-40]:[3370,-650];
    const y=height(...p,w.groundLowDetail);
    c.position.set(p[0],y+3.5,p[1]);c.lookAt(p[0]+45,height(p[0]+45,p[1]+12,w.groundLowDetail),p[1]+12);
    if(view==='distant'){c.position.set(3900,400,850);c.lookAt(2650,0,400);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(['captain','rollout'].includes(view)){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const roll=view==='rollout';s.game.sim.aircraft.place({x:roll?1000:3300,y:roll?2.5:115,z:0,headingDeg:270,iasKts:roll?85:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:roll});
     s.view.look.yaw=0;s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
    return {eye:eye.toArray(),cover:w.approachCorridor.sample(...p)};
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   const stats={view,...pose};report.views.push(stats);
   if(!baseline){
    stats.contribution=await page.evaluate(()=>{
     const w=window.__sim.world,u=w.groundUniforms,c=document.createElement('canvas');c.width=480;c.height=300;
     const g=c.getContext('2d',{willReadFrequently:true}),grass=w.groundCover?.mesh,visible=grass?.visible;if(grass)grass.visible=false;
     const grab=()=>{w.render();w.renderer.getContext().finish();g.drawImage(w.renderer.domElement,0,0,480,300);return g.getImageData(0,0,480,300).data;};
     const after=grab();u.uGroundMaterialsInfluence.value=0;const before=grab();u.uGroundMaterialsInfluence.value=1;
     if(grass)grass.visible=visible;w.render();
     let delta=0,lit=0,n=0,changed=0;for(let y=160;y<290;y++)for(let x=30;x<450;x++){
      let d=0;for(let k=0;k<3;k++){const i=(y*480+x)*4+k;d+=Math.abs(after[i]-before[i]);lit+=after[i];n++;}
      delta+=d;if(d>12)changed++;
     }return {delta:delta/n,mean:lit/n,changed};
    });
    if(['meadow','soil','forest','turf'].includes(view))assert.ok(stats.contribution.delta>.7,`${view}: close ground must visibly change (${stats.contribution.delta})`);
    if(view==='distant')assert.ok(stats.contribution.delta<.1,'No additional grain beyond 260 m');
   }
   console.log(tier,stats);
  }
  if(!baseline){
   report.assets=await page.evaluate(()=>{
    const w=window.__sim.world,m=w.groundMaterials,gl=w.renderer.getContext(),program=w.renderer.properties.get(w.groundMat).currentProgram.program;
    let samplers=0;
    for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){
     const u=gl.getActiveUniform(program,i);
     if([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_SHADOW].includes(u.type))samplers+=u.size;
    }
    return {size:m.size,layers:m.layers,ready:w.groundUniforms.uGroundMaterialsReady.value,
     bytes:performance.getEntriesByType('resource').filter(r=>/ground-(color|surface)/.test(r.name)).reduce((s,r)=>s+r.encodedBodySize,0),
     errors:w.assetErrors,textureUnits:w.renderer.capabilities.maxTextures,samplers};
   });
   assert.equal(report.assets.size,tier==='high'?512:256);assert.equal(report.assets.ready,1);
   assert.ok(report.assets.bytes<(tier==='high'?820000:210000));assert.deepEqual(report.assets.errors,[]);
   assert.ok(report.assets.samplers<=16,'Terrain fits WebGL2 minimum texture-unit support');
   report.floatPixels=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),w=window.__sim.world,r=w.renderer;
    const mat=w.groundMat.clone();mat.onBeforeCompile=w.groundMat.onBeforeCompile;mat.fog=false;
    const scene=new T.Scene();scene.add(new T.AmbientLight(0xffffff,2));
    const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,5,1);scene.add(sun);
    const geometry=new T.PlaneGeometry(4,4).rotateX(-Math.PI/2).translate(3350,0,580);
    const mesh=new T.Mesh(geometry,mat);scene.add(mesh);
    const target=new T.WebGLRenderTarget(64,64,{type:T.FloatType}),camera=new T.PerspectiveCamera(50,1,.01,100);
    const previous=r.getRenderTarget(),clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha(),results=[];
    try{
     r.setRenderTarget(target);r.setClearColor(0,0);
     for(const [x,y,z]of [[3350,4,580],[3350,.2,584],[3354,.1,580]]){
      camera.position.set(x,y,z);camera.lookAt(3350,0,580);camera.updateMatrixWorld();r.render(scene,camera);
      const pixels=new Float32Array(64*64*4);r.readRenderTargetPixels(target,0,0,64,64,pixels);
      let finite=true,lit=0;for(let i=0;i<pixels.length;i+=4){
       for(let k=0;k<4;k++)if(!Number.isFinite(pixels[i+k])||pixels[i+k]<0||pixels[i+k]>16)finite=false;
       if(pixels[i+3]>.5&&pixels[i]+pixels[i+1]+pixels[i+2]>.01)lit++;
      }results.push({eye:[x,y,z],finite,lit});
     }
    }finally{r.setRenderTarget(previous);r.setClearColor(clear,alpha);target.dispose();geometry.dispose();mat.dispose();}
    return results;
   });
   assert.ok(report.floatPixels.every(r=>r.finite&&r.lit>10),'Overhead and grazing ground pixels remain finite and lit');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline&&!process.env.REVIEW_VIEWS){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/ground-surface-low.webp',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const fallback=await page.evaluate(()=>{
   const s=window.__sim,w=s.world;s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.drawNow();
   return {ready:w.groundUniforms.uGroundMaterialsReady.value,errors:w.assetErrors,terrain:!!w.ground};
  });
  assert.equal(fallback.ready,0);assert.equal(fallback.terrain,true);assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);
  reports.push({fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
