// Rendered regressions: loading and shader compilation alone did not catch a
// black cabin after a day/night change. VISUAL_GPU=metal selects macOS hardware.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
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
    await completeScenery(page); // Match normal Start; do not probe captures during background warm-up.
    if(tier==='high'){
      // Exercise the production GLSL with collapsed derivatives explicitly. Real
      // zero-area source triangles only trigger this on some drivers/cube views.
      const normals=await page.evaluate(async()=>{
        const T=await import('/vendor/three.module.js');
        const {COCKPIT_SURFACE_GLSL}=await import('/js/cockpit/surfaces.js');
        const renderer=window.__sim.world.renderer,previous=renderer.getRenderTarget();
        const target=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,depthBuffer:false});
        const material=new T.ShaderMaterial({uniforms:{derivativeScale:{value:1}},
          vertexShader:`uniform float derivativeScale; varying vec3 vViewPosition; varying vec3 vDeckPosition;
            void main(){vDeckPosition=position;vViewPosition=-position*derivativeScale;gl_Position=vec4(position.xy,0.,1.);}`,
          fragmentShader:`varying vec3 vViewPosition;\n${COCKPIT_SURFACE_GLSL}\n
            void main(){vec3 n=deckBump(vec3(0.,0.,1.),vDeckPosition.x*.01,1.);gl_FragColor=vec4(n*.5+.5,1.);}`});
        const quad=new T.Mesh(new T.PlaneGeometry(2,2),material),scene=new T.Scene();scene.add(quad);
        const results=[];
        try{
          for(const scale of [0,1e-20,1]){
            material.uniforms.derivativeScale.value=scale;
            renderer.setRenderTarget(target);renderer.render(scene,new T.Camera());
            const pixels=new Uint16Array(4*4*4);renderer.readRenderTargetPixels(target,0,0,4,4,pixels);
            results.push({scale,normal:Array.from(pixels.slice(20,23),v=>T.DataUtils.fromHalfFloat(v)*2-1)});
          }
        }finally{renderer.setRenderTarget(previous);quad.geometry.dispose();material.dispose();target.dispose();}
        return results;
      });
      for(const {scale,normal} of normals){
        assert.ok(normal.every(Number.isFinite),`Finite surface normal at derivative scale ${scale}`);
        assert.ok(Math.abs(Math.hypot(...normal)-1)<.003,'Bump output remains a unit normal');
        if(scale<1)assert.deepEqual(normal,[0,0,1],'Degenerate bump preserves the original normal');
        else assert.ok(normal[0]<-.005&&normal[2]>.99,'Ordinary surface relief is still applied');
      }
      console.log('Rendered degenerate/ordinary surface normals:',normals);
    }
    for(const [scenarioId,night] of [['clear',false],['clear',true],['crosswind',false],['storm',true],['clear',false]]){
      const result=await page.evaluate(async({scenarioId,night})=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        const previous=[...w.cabinEnvironment.captures.values()];let disposed=0;
        for(const c of previous)c.target?.addEventListener('dispose',()=>disposed++);
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
          if(!target)throw new Error('Unexpected cabin capture fallback');
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
  await fallback.route('**/assets/cockpit/*.webp',route=>route.abort());
  await fallback.goto(url+'/?quality=high');await fallback.waitForFunction(()=>window.__sim,null,{timeout:120000});
  await completeScenery(fallback);
  const recovered=await fallback.evaluate(()=>{
    const s=window.__sim;s.setDrawing(false);s.drawNow();
    return {loaded:s.cockpit.modelLoaded,...s.cockpit.authoredModel.userData.surfaceDetail};
  });
  assert.equal(recovered.loaded,true);assert.equal(recovered.errors.length,2);assert.equal(recovered.maps,5);
  // Deliberately poison the driver's readback, then throw on capture. Neither
  // failure may reach the material environment or trigger a retry every frame.
  const guarded=await fallback.evaluate(()=>{
    const s=window.__sim,w=s.world,c=w.cabinEnvironment,read=w.renderer.readRenderTargetPixels;
    s.start({startId:'short',seed:5});s.setTimeScale(0);s.setDrawing(false);
    w.renderer.readRenderTargetPixels=(target,x,y,width,height,pixels)=>pixels.fill(0x7e00);
    c.reset();s.view.update(0);s.drawNow();
    const rejected=[...c.captures.values()].every(v=>!v.target&&v.reason);
    const safe=w.cockpitScene.environment===w.env[w.envKey].texture;
    w.renderer.readRenderTargetPixels=read;
    const capture=c.pmrem.fromScene;let attempts=0;
    c.pmrem.fromScene=()=>{attempts++;throw new Error('Simulated unsupported capture');};
    c.reset();for(let i=0;i<5;i++)s.view.update(0);s.drawNow();
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=576;
    const ctx=canvas.getContext('2d');ctx.drawImage(w.renderer.domElement,0,0,1024,576);
    const p=ctx.getImageData(370,330,100,25).data;let sum=0;
    for(let i=0;i<p.length;i+=4)sum+=(p[i]+p[i+1]+p[i+2])/3;
    c.pmrem.fromScene=capture;
    let areaLights=0;w.cockpitScene.traverse(o=>{if(o.isRectAreaLight)areaLights++;});
    return {rejected,safe,attempts,luminance:sum/(p.length/4),areaLights};
  });
  assert.ok(guarded.rejected&&guarded.safe);assert.equal(guarded.attempts,1);
  assert.equal(guarded.areaLights,0);assert.ok(guarded.luminance>18,JSON.stringify(guarded));
  console.log('Invalid/unsupported capture safely rejected:',guarded);
  await fallback.close();
  console.log('Cabin day/night/weather transitions, finite captures, cache disposal and missing-scan fallback passed.');
}finally{await browser.close();server.close();}
