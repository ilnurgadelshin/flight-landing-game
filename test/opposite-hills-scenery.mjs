// Matched pilot views and the opposite hillside; real assets and shared mask/planting.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const label=process.argv[2]||'opposite-hills-after',baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
// Software rendering verifies the same real shaders/assets at a smaller raster;
// full-resolution captures and FPS measurements use the hardware renderer.
const viewport=angle==='swiftshader'?{width:640,height:400}:{width:1440,height:900};
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text())}});
  // Pause at the hook itself: a software-rendered menu frame can otherwise
  // monopolize the page before waitForFunction gets its next animation tick.
  await page.addInitScript(()=>window.addEventListener('sim-ready',()=>window.__sim.setDrawing(false),{once:true}));
  await page.goto(url+'/?quality='+tier);
  await page.waitForFunction(()=>window.__sim||document.getElementById('loading-msg')?.textContent.startsWith('Failed to start:'),null,{timeout:120000});
  assert.ok(await page.evaluate(()=>!!window.__sim),`Game startup failed: ${errors.join('\n')}`);
  await completeScenery(page);
  const stats=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;s.setDrawing(false);s.game.state='menu';
   const matrix=new T.Matrix4(),p=new T.Vector3(),c=w.approachCorridor;let trees=0,hillTrees=0,intrusions=0,fieldTrees=0,airportSide=0,oldHills=0;
   const join={hill:0,close:0};
   for(const mesh of w.woodland.children)if(mesh.material===w.woodlandMaterial)for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);trees++;if(p.x<2100)airportSide++;
    if(p.x>2100&&p.x<5300&&p.z>=1030&&p.z<2500)oldHills++;
    if(p.x>2300&&p.x<2750){if(p.z>=-1040&&p.z< -1000)join.hill++;if(p.z>=-1000&&p.z< -960)join.close++;}
    if(p.x>2100&&p.x<5300&&p.z>=-2500&&p.z< -1000){
     hillTrees++;if(w.approachBuildingExcludes(p.x,p.z)||w.approachRoadExcludes(p.x,p.z))intrusions++;
     const cover=c.sample(p.x,p.z);if(cover[0]+cover[1]>.35)fieldTrees++;
    }
   }
   const mask=c.texture.image,m=c.manifest,canvas=document.createElement('canvas');canvas.width=mask.width;canvas.height=mask.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(mask,0,0);
   const profiles=[-1030,-1010,-1002,-998,-990,-980,-970,-960].map(z=>{
    let px,py;if(z>=-1000){px=(2500-m.bounds[0])/m.bounds[2]*mask.width;py=(z-m.bounds[1])/m.bounds[3]*Math.round(mask.height*w.groundUniforms.uCorridorMainHeight.value);}
    else if(m.oppositeHills&&w.groundUniforms.uOppositeHillsReady?.value){const h=m.oppositeHills;px=(h.atlas[0]+(2500-h.bounds[0])/h.bounds[2]*h.width)/m.width*mask.width;py=(h.atlas[1]+(z-h.bounds[1])/h.bounds[3]*h.height)/m.textureHeight*mask.height;}
    const gpu=px===undefined?null:ctx.getImageData(Math.floor(px),Math.floor(py),1,1).data[2]/255;
    return {z,cpu:c.sample(2500,z)[2],gpu};
   });canvas.width=canvas.height=0;
   return {trees,hillTrees,oldHills,intrusions,fieldTrees,airportSide,join,profiles,zones:c.zoneCounts,mask:[mask.width,mask.height],active:!!w.groundUniforms.uOppositeHillsReady?.value,errors:w.assetErrors};
  });
  if(!baseline){
   assert.equal(stats.trees,tier==='high'?70000:14000);assert.equal(stats.active,tier==='high');
   assert.equal(stats.intrusions,0);assert.equal(stats.fieldTrees,0);
   assert.deepEqual(stats.mask,tier==='high'?[3450,1277]:[2048,603]);
   if(tier==='high'){
    assert.ok(stats.hillTrees>=5900&&stats.oldHills>=7900,'New coverage retains the previous wooded hill');
    assert.ok(stats.profiles.every(p=>p.cpu>.6&&Math.abs(p.cpu-p.gpu)<.035),'Continuous CPU/GPU woodland cover at the join');
    assert.ok(stats.join.hill>=stats.join.close*.6,'No abrupt woodland density step at the shared edge');
   }else assert.ok(stats.airportSide>=120&&!stats.active,'Phones keep their existing background tree allowance');
  }
  assert.deepEqual(stats.errors,[]);const report={tier,...stats};reports.push(report);console.log(tier,stats);
  for(const view of process.env.REVIEW_VIEWS?.split(',')||['captain-6500','captain-5500','captain-4300','opposite-hills','opposite-fields','opposite-overcast','opposite-night']){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='opposite-overcast'?'crosswind':'clear',night:view==='opposite-night',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    if(view.startsWith('captain-')){
     const x=Number(view.slice(8));s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }else{
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);c.position.set(5100,470,-400);c.lookAt(3250,sceneryGroundHeight(3250,-1630,w.groundLowDetail)+20,-1630);
     if(view==='opposite-fields'){c.position.set(5280,380,-630);c.lookAt(4470,sceneryGroundHeight(4470,-1500,w.groundLowDetail)+5,-1500);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
   },view);
   const enabled=await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(!baseline&&tier==='high'&&view==='opposite-hills'){
    await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uOppositeHillsReady.value=0;w.render();w.renderer.getContext().finish()});
    const [a,b]=await Promise.all([enabled,await page.screenshot()].map(p=>sharp(p).removeAlpha().raw().toBuffer()));
    let delta=0;for(let i=0;i<a.length;i++)delta+=Math.abs(a[i]-b[i]);report.groundContribution=delta/a.length;
    assert.ok(report.groundContribution>.05,'The new atlas tile contributes to the rendered hillside');
    await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uOppositeHillsReady.value=1;w.render()});
   }
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline&&!process.env.REVIEW_VIEWS){
  const page=await browser.newPage({viewport});
  await page.addInitScript(()=>window.addEventListener('sim-ready',()=>window.__sim.setDrawing(false),{once:true}));
  await page.route('**/approach-corridor.json',async route=>{const response=await route.fetch(),data=await response.json();data.oppositeHills.atlas[0]=0;await route.fulfill({response,json:data})});
  await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>({ready:window.__sim.world.groundUniforms.uCorridorReady.value,errors:window.__sim.world.assetErrors}));
  assert.equal(fallback.ready,0);assert.ok(fallback.errors.some(e=>e.includes('Invalid opposite hillside')));reports.push({invalidAtlas:fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close()}
