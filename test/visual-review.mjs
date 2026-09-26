// Repeatable visual review of the actual game renderer, not an isolated model viewer.
// PLAYWRIGHT_BROWSERS_PATH=... node test/visual-review.mjs
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'test/output');
fs.mkdirSync(out,{recursive:true});
const {server,url}=await startServer(root);
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
// A compiled shader can still be wrong: missing shared haze uniforms made trees
// black in fog, and the old cloud sheet cut a dark floor across the transition.
// Compare actual horizon pixels, and the light contribution beyond visibility.
async function checkCloudTransition(page,tier){
  const pixels=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'storm',night:false,seed:5});s.setTimeScale(0);
    const alt=w.cloudBase+24;
    // Even the nearest approach lamp is 2.1 km away, beyond this transition's
    // 588 m visibility. A nearby light may legitimately penetrate the mist.
    s.game.sim.aircraft.place({x:4500,y:alt,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    for(let i=0;i<40;i++)s.view.update(1/60);
    const previous={camera:w.camera,deck:w.drawCockpit,rain:w.rain.visible};
    const camera=new T.PerspectiveCamera(20,16/9,.1,60000);
    camera.position.set(4500,alt,0);camera.lookAt(-10000,alt,0);camera.updateMatrixWorld();
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const grab=()=>{w.render();context.drawImage(w.renderer.domElement,0,0,320,180);return context.getImageData(0,0,320,180).data;};
    try{
      w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;
      w.drawCockpit=false;w.update(0,s.state(),camera.position);w.rain.visible=false;
      const lit=grab();w.lights.points.visible=false;const unlit=grab();
      let sky=0,ground=0,lightDelta=0,n=0;
      for(let y=10;y<80;y++)for(let x=10;x<310;x++){
        const a=(y*320+x)*4,b=((y+90)*320+x)*4;
        sky+=(unlit[a]+unlit[a+1]+unlit[a+2])/3;
        ground+=(unlit[b]+unlit[b+1]+unlit[b+2])/3;n++;
      }
      for(let i=0;i<lit.length;i++)if(i%4!==3)lightDelta=Math.max(lightDelta,Math.abs(lit[i]-unlit[i]));
      return {sky:sky/n,ground:ground/n,lightDelta};
    }finally{
      w.camera=previous.camera;if(w.composer)w.composer.passes[0].camera=previous.camera;
      w.drawCockpit=previous.deck;w.rain.visible=previous.rain;w.lights.points.visible=true;
    }
  });
  assert.ok(pixels.sky>25&&Math.abs(pixels.sky-pixels.ground)<8,`${tier}: distant ground must fade to cloud grey: ${JSON.stringify(pixels)}`);
  assert.ok(pixels.lightDelta<3,`${tier}: opaque cloud must hide the distant runway lights: ${JSON.stringify(pixels)}`);
  console.log(`${tier} rendered cloud transition passed: ${JSON.stringify(pixels)}`);
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&!m.text().includes('GPU stall due to ReadPixels'))errors.push(m.text());});
  await page.goto(url+'/?quality=high');
  await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
  const assets=await page.evaluate(()=>{
    const s=window.__sim;s.setDrawing(false);s.start({startId:'short',seed:5});s.setTimeScale(0);
    return {cockpit:s.cockpit.modelLoaded,yokes:s.cockpit.yokes.length,errors:s.world.assetErrors,imagery:s.world.landscapeImages?.length,aircraft:s.world.parkedAircraft.children.length};
  });
  assert.deepEqual(assets,{cockpit:true,yokes:2,errors:[],imagery:4,aircraft:5});
  for(const mode of ['cockpit','hud','nd']){
    await page.evaluate(mode=>{const s=window.__sim;s.view.setMode(mode==='hud'?'hud':'cockpit');s.view.setNdView(mode==='nd');for(let i=0;i<40;i++)s.view.update(1/60);s.drawNow();},mode);
    await page.screenshot({path:path.join(out,`rebuild-${mode}.png`)});
    if(mode!=='hud'){
      const visible=await page.evaluate(async mode=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,screen=s.cockpit[mode==='nd'?'ndScreen':'pfdScreen'];
        const eye=s.world.camera.getWorldPosition(new T.Vector3()),ray=new T.Raycaster();
        return [[0,0],[-.42,-.42],[.42,-.42],[-.42,.42],[.42,.42]].every(([x,y])=>{
          const target=screen.localToWorld(new T.Vector3(x*screen.geometry.parameters.width,y*screen.geometry.parameters.height,0));
          ray.set(eye,target.clone().sub(eye).normalize());
          const hits=ray.intersectObject(s.cockpit.root,true).filter(hit=>{
            for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
            return true;
          });
          return hits[0]?.object===screen;
        });
      },mode);
      assert.ok(visible,`The centre and corners of the ${mode==='nd'?'focused ND':'PFD'} must be unobstructed.`);
    }
  }
  for(const [name,look] of [['pedestal',{down:true,yaw:-.35,pitch:0}],['overhead',{down:false,yaw:-.15,pitch:.85}]]){
    await page.evaluate(look=>{
      const s=window.__sim;s.view.setNdView(false);s.view.setMode('cockpit');Object.assign(s.view.look,look);
      for(let i=0;i<80;i++)s.view.update(1/60);s.drawNow();
    },look);
    await page.screenshot({path:path.join(out,`rebuild-${name}.png`)});
  }
  await page.evaluate(()=>Object.assign(window.__sim.view.look,{down:false,yaw:0,pitch:0}));
  await page.evaluate(()=>{const s=window.__sim;s.start({startId:'short',scenarioId:'clear',night:true,seed:5});s.setTimeScale(0);s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);s.drawNow();});
  await page.screenshot({path:path.join(out,'rebuild-night.png')});
  // Ground-scale approach and weather reviews expose problems hidden at 4 NM.
  for(const scenarioId of ['clear','crosswind','storm']){
    await page.evaluate(scenarioId=>{
      const s=window.__sim;s.start({startId:'short',scenarioId,night:false,seed:5});s.setTimeScale(0);
      s.game.sim.aircraft.place({x:3300,y:115,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
      s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);s.drawNow();
    },scenarioId);
    await page.screenshot({path:path.join(out,`rebuild-final-${scenarioId}.png`)});
  }
  await checkCloudTransition(page,'high');
  // An airport review camera checks the actual scenery assets at ground scale.
  await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'clear',night:false,seed:5});s.setTimeScale(0);
    s.view.update(1/60);
    const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);
    camera.position.set(120,75,265);camera.lookAt(0,7,380);camera.updateMatrixWorld();
    w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;
    w.drawCockpit=false;document.getElementById('hud').style.visibility='hidden';w.render();
  });
  await page.screenshot({path:path.join(out,'rebuild-airport.png')});
  assert.deepEqual(errors,[]);
  await page.close();
  // A failed model download must leave a flyable cockpit and working instrument view.
  const fallback=await browser.newPage({viewport:{width:1024,height:576}}),fallbackErrors=[];
  fallback.on('pageerror',e=>fallbackErrors.push(e.message));
  await fallback.route('**/737-cockpit*.glb',route=>route.abort());
  await fallback.goto(url+'/?quality=low');
  await fallback.waitForFunction(()=>window.__sim,null,{timeout:120000});
  const recovery=await fallback.evaluate(()=>{
    const s=window.__sim;s.setDrawing(false);s.start({startId:'short',seed:5});s.setTimeScale(0);
    s.view.setNdView(true);for(let i=0;i<40;i++)s.view.update(1/60);s.drawNow();
    return {error:!!s.cockpit.modelError,authored:!!s.cockpit.modelLoaded,yokes:s.cockpit.yokes.length,focused:s.view.ndSettled,flying:s.game.state==='flying'};
  });
  assert.deepEqual(recovery,{error:true,authored:false,yokes:2,focused:true,flying:true});
  await checkCloudTransition(fallback,'low');
  assert.deepEqual(fallbackErrors,[]);
  console.log('Visual assets, PFD/ND visibility and missing-model fallback passed; cockpit, HUD, ND, pedestal, overhead, night and airport images saved.');
}finally{await browser.close();server.close();}
