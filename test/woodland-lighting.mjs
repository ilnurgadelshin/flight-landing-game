// Real-material directional response and matched scenery. REVIEW_ROOT loads a baseline.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'woodland-light').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser();
const report={baseline,results:[],lighting:[]};
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  for(const view of (process.env.REVIEW_VIEWS||'captain-5500,captain-3400,canopy,hillside,dusk,overcast,night').split(',')){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    w.camera=s.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
    s.start({startId:'short',scenarioId:view==='overcast'?'crosswind':'clear',night:view==='night',seed:5});
    if(view==='dusk')w.applyScenario({...w.scenario,timeOfDay:'dusk'});
    s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const x=view==='captain-5500'?5500:3400;
    s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    if(!view.startsWith('captain')){
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
     c.position.set(4910,185,335);c.lookAt(4510,35,115);
     if(view==='canopy'){c.position.set(2700,125,520);c.lookAt(2470,15,300);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    w.renderer.info.autoReset=false;w.renderer.info.reset();w.render();w.renderer.getContext().finish();
    const stats={calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,errors:w.assetErrors,normal:!!w.woodlandLighting?.responseMap,sun:w.woodlandLighting?.uniforms.treeSunAmount.value};
    w.renderer.info.autoReset=true;return stats;
   },view);
   assert.deepEqual(stats.errors,[]);if(!baseline)assert.equal(stats.normal,true);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});report.results.push({tier,view,...stats});
  }
  if(!baseline){
   // Opposite suns must move the bright side of a stationary tree. A global
   // exposure change cannot pass this spatial test. Cover azimuth seams and
   // intermediate azimuths, using the real four-view material.
   const checks=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),w=window.__sim.world;
    const atlas=await(await fetch('/assets/scenery/tree-variety.json')).json();
    const base=w.woodland.children.find(m=>m.material===w.woodlandMaterial);
    const r=w.renderer,target=new T.WebGLRenderTarget(192,192),scene=new T.Scene();
    const c=new T.OrthographicCamera(-19,19,19,-19,.1,200);c.position.set(0,10,80);c.lookAt(0,10,0);c.updateMatrixWorld();
    const previous=r.getRenderTarget(),clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();
    const u=w.woodlandLighting.uniforms;w.woodlandMaterial.color.setScalar(1);u.treeSunAmount.value=1;u.treeSunColor.value.setRGB(1,1,1);
    const result=[];
    try{
     r.setRenderTarget(target);r.setClearColor(0,0);
     for(const row of [0,4,7,8])for(const degrees of [0,22.5,337.5]){
      const form=atlas.species[row],a=degrees*Math.PI/180,g=base.geometry.clone();
      for(const [name,values,size] of [['treeUvOffset',[0,row],2],['treeYaw',[a],1],['treeFrame',[form.frameScale,form.aspect],2],['treeDetailFade',[0],1]])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(values),size));
      const tree=new T.InstancedMesh(g,w.woodlandMaterial,1);tree.setMatrixAt(0,new T.Matrix4().makeScale(form.aspect*20,20,form.aspect*20));tree.setColorAt(0,new T.Color(1,1,1));tree.frustumCulled=false;scene.add(tree);
      const pixels=[];
      for(const x of [-1,1]){u.treeSunDirection.value.set(x,.25,.2).normalize();r.render(scene,c);const p=new Uint8Array(192*192*4);r.readRenderTargetPixels(target,0,0,192,192,p);pixels.push(p);}
      let changed=0,total=0,left=0,right=0,count=0;
      for(let i=0;i<pixels[0].length;i+=4)if(pixels[0][i+3]>127&&pixels[1][i+3]>127){
       const delta=(pixels[1][i]+pixels[1][i+1]+pixels[1][i+2]-pixels[0][i]-pixels[0][i+1]-pixels[0][i+2])/3;
       total+=Math.abs(delta);count++;if(Math.abs(delta)>2)changed++;
       if((i/4)%192<96)left+=delta;else right+=delta;
      }
      // No direction-dependent artificial sun patches in fully overcast light.
      u.treeSunAmount.value=0;const flat=[];
      for(const x of [-1,1]){u.treeSunDirection.value.set(x,.25,.2).normalize();r.render(scene,c);const p=new Uint8Array(192*192*4);r.readRenderTargetPixels(target,0,0,192,192,p);flat.push(p);}
      let flatDifference=0;for(let i=0;i<flat[0].length;i++)flatDifference+=Math.abs(flat[0][i]-flat[1][i]);
      u.treeSunAmount.value=1;result.push({row,degrees,count,meanDelta:total/count,changedFraction:changed/count,sideContrast:(right-left)/count,flatDifference});
      scene.remove(tree);g.dispose();
     }
    }finally{r.setRenderTarget(previous);r.setClearColor(clear,alpha);target.dispose();}
    return result;
   });
   // Fine needle clusters occupy very few low-tier texels; require a visible
   // spatial response there without demanding the broadleaf colour delta.
   assert.ok(checks.every(x=>x.count>100&&x.meanDelta>1&&x.changedFraction>.2),'Crown lighting responds to the sun, including blended atlas views');
   assert.ok(checks.every(x=>x.flatDifference===0),'Overcast stays diffuse');
   assert.ok(checks.reduce((s,x)=>s+x.sideContrast,0)/checks.length>1,'Sun changes sides across the crown');
   report.lighting.push({tier,checks});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline&&!process.env.REVIEW_VIEWS){
  report.fallbacks=[];
  for(const tier of ['high','low'])for(const failure of ['missing','wrong-size']){
   const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::ERR_FAILED'))errors.push(m.text());});
   await page.route('**/tree-light-response*.webp',r=>failure==='missing'?r.abort():r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}));
   await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
   const result=await page.evaluate(()=>{
    const s=window.__sim,w=s.world;s.start({startId:'short',seed:5});s.setDrawing(false);s.setTimeScale(0);s.drawNow();
    return {normal:!!w.woodlandLighting.responseMap,error:!!w.woodlandLighting.error,crowns:w.woodlandForms.reduce((a,b)=>a+b,0),shader:!!w.woodlandMaterial.defines?.TREE_DIRECTIONAL,errors:w.assetErrors};
   });
   assert.equal(result.normal,false);assert.equal(result.error,true);assert.equal(result.shader,false);
   assert.ok(result.crowns>10000);assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
   report.fallbacks.push({tier,failure,...result});await page.close();
  }
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log('Woodland lighting and matched scenery passed.');
}finally{await browser.close();server.close();}
