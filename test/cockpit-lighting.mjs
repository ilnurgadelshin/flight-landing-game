// Rendered regressions: loading and shader compilation alone did not catch a
// black cabin after a day/night change. VISUAL_GPU=metal selects macOS hardware.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {server,url}=await startServer(process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
  await fs.mkdir('test/output',{recursive:true});
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url+'/?quality='+tier);
    try{await page.waitForFunction(()=>window.__sim,null,{timeout:120000});}
    catch(error){throw new Error(`${tier} failed to initialize: ${errors.join('\n')||error.message}`);}
    await page.evaluate(()=>window.__sim.setDrawing(false));
    for(const [scenarioId,night] of [['clear',false],['clear',true],['crosswind',false],['storm',true],['clear',false]]){
      const result=await page.evaluate(async({scenarioId,night})=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        const previous=[...w.cabinEnvironment.captures.values()];let disposed=0;
        for(const c of previous)c.target.addEventListener('dispose',()=>disposed++);
        s.start({startId:'short',scenarioId,night,seed:5});s.setTimeScale(0);
        s.view.setMode('cockpit');s.view.setNdView(false);Object.assign(s.view.look,{down:false,yaw:0,pitch:0});
        for(let i=0;i<40;i++)s.view.update(1/60);
        s.drawNow();
        const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;
        const ctx=canvas.getContext('2d');ctx.drawImage(w.renderer.domElement,0,0,1440,900);
        // Painted panel above the PFD, away from the emissive instrument screens.
        const panel=ctx.getImageData(520,520,140,40).data;let luminance=0;
        for(let i=0;i<panel.length;i+=4)luminance+=(panel[i]+panel[i+1]+panel[i+2])/3;
        const captures=[...w.cabinEnvironment.captures.values()];let invalid=0,lit=0;
        for(const {target} of captures){
          const pixels=new Uint16Array(target.width*target.height*4);
          w.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
          for(let i=0;i<pixels.length;i++)if(i%4!==3){
            const value=T.DataUtils.fromHalfFloat(pixels[i]);
            if(!Number.isFinite(value))invalid++;else if(value>.002)lit++;
          }
        }
        const texture=w.cockpitScene.environment;
        for(let i=0;i<20;i++)s.view.update(1/60);
        let layers=true;
        if(scenarioId==='crosswind'){
          const eye=w.camera.getWorldPosition(new T.Vector3());
          w.update(0,{...s.state(),alt:w.cloudTop+100},eye);
          const above=w.cockpitScene.environment;
          w.update(0,s.state(),eye);
          layers=above!==texture&&w.cockpitScene.environment===texture&&w.cabinEnvironment.captures.size===2;
        }
        return {luminance:luminance/(panel.length/4),invalid,lit,disposed,previous:previous.length,
          cached:w.cockpitScene.environment===texture,count:w.cabinEnvironment.captures.size,layers,
          finishes:s.cockpit.authoredModel.userData.surfaceDetail};
      },{scenarioId,night});
      assert.equal(result.invalid,0,`${tier} ${scenarioId}/${night}: finite reflection radiance`);
      assert.ok(result.lit>100,`${tier}: cabin capture contains illumination`);
      assert.ok(result.luminance>(night?8:18),`${tier} ${scenarioId}/${night}: readable panel: ${result.luminance}`);
      assert.equal(result.disposed,result.previous,'Previous scenario capture targets are disposed');
      assert.ok(result.cached&&result.count<=2,'Reuse bounded captures between frames');
      assert.ok(result.layers,'Crossing the cloud layer selects and reuses separate cabin captures');
      assert.deepEqual(result.finishes.errors,[]);
      console.log(tier,scenarioId,night?'night':'day',result);
      await page.screenshot({path:`test/output/lighting-${tier}-${scenarioId}-${night?'night':'day'}.png`});
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  const fallback=await browser.newPage({viewport:{width:1024,height:576}});
  await fallback.route('**/assets/cockpit/*.png',route=>route.abort());
  await fallback.goto(url+'/?quality=high');await fallback.waitForFunction(()=>window.__sim,null,{timeout:120000});
  const recovered=await fallback.evaluate(()=>{
    const s=window.__sim;s.setDrawing(false);s.drawNow();
    return {loaded:s.cockpit.modelLoaded,...s.cockpit.authoredModel.userData.surfaceDetail};
  });
  assert.equal(recovered.loaded,true);assert.equal(recovered.errors.length,2);assert.equal(recovered.maps,5);
  await fallback.close();
  console.log('Cabin day/night/weather transitions, finite captures, cache disposal and missing-scan fallback passed.');
}finally{await browser.close();server.close();}
