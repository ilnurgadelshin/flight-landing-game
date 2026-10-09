// Matched views and land-cover/planting integration checks on both rendering tiers.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'corridor-current').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const views=process.env.REVIEW_VIEWS?.split(',')||['wide','canopy','field','final','overcast','extension','opposite','opposite-field','captain-3400'];
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const stats=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
   s.setDrawing(false);s.game.state='menu';
   const matrix=new T.Matrix4(),p=new T.Vector3();let trees=0,inside=0,extended=0,opposite=0,intrusions=0,fieldTrees=0;
   for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
    m.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);trees++;
    if(p.x>2100&&p.x<4100&&p.z>180&&p.z<1030)inside++;
    if(p.x>=4100&&p.x<6100&&p.z>180&&p.z<1030)extended++;
    if(p.x>2100&&p.x<4100&&p.z>-1000&&p.z< -180)opposite++;
    if(w.approachBuildingExcludes(p.x,p.z)||w.approachRoadExcludes(p.x,p.z))intrusions++;
    const cover=w.approachCorridor?.sample(p.x,p.z);if(cover&&cover[0]+cover[1]>.6)fieldTrees++;
   }
   return {trees,inside,extended,opposite,intrusions,fieldTrees,corridor:w.approachCorridor?.trees,ready:w.groundUniforms.uCorridorReady?.value,errors:w.assetErrors};
  });
  assert.equal(stats.intrusions,0);assert.deepEqual(stats.errors,[]);
  if(!baseline){assert.equal(stats.ready,1);assert.equal(stats.fieldTrees,0);assert.ok(stats.extended>(tier==='high'?4000:1800));assert.ok(stats.corridor.count>(tier==='high'?2200:900));assert.ok(stats.opposite>(tier==='high'?3000:1500));assert.ok(stats.trees<=stats.corridor.limit);}
  const report={tier,...stats};reports.push(report);console.log(report);
  for(const view of views){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:['overcast','opposite-storm'].includes(view)?'storm':'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(view==='opposite'){c.position.set(4040,250,-910);c.lookAt(2810,35,-475);}
    if(view==='pasture'){c.position.set(3730,120,-210);c.lookAt(3370,40,-720);}
    if(view==='opposite-field'){
     const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');const y=sceneryGroundHeight(3370,-650,w.groundLowDetail);
     c.position.set(3370,y+4,-650);c.lookAt(3450,y+2,-770);
    }
    if(view==='opposite-storm'){c.position.set(3750,65,-700);c.lookAt(3320,0,-600);}
    if(view==='wide'){c.position.set(3900,240,850);c.lookAt(2650,0,400);}
    if(view==='extension'){c.position.set(5950,240,950);c.lookAt(4250,40,300);}
    if(view==='canopy'){c.position.set(3190,85,810);c.lookAt(2800,16,675);}
    if(view==='field'){
     const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
     const y=sceneryGroundHeight(2350,330,w.groundLowDetail);
     c.position.set(2350,y+3.5,330);c.lookAt(2270,y+1,400);
    }
    if(view==='final'){c.position.set(3800,145,0);c.lookAt(2200,0,320);}
    // Below the 79 m storm ceiling, where ground materials remain visible.
    if(view==='overcast'){c.position.set(3900,60,850);c.lookAt(3500,0,600);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;
    w.drawCockpit=false;
    if(view.startsWith('captain-')){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=Number(view.split('-')[1]);s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.look.yaw=0;s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    document.getElementById('hud').style.visibility='hidden';
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.render();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(!baseline&&['field','opposite-field'].includes(view)){
    const delta=await page.evaluate(()=>{
     const w=window.__sim.world,c=document.createElement('canvas');c.width=480;c.height=300;const g=c.getContext('2d',{willReadFrequently:true});
     const grab=()=>{w.render();g.drawImage(w.renderer.domElement,0,0,c.width,c.height);return g.getImageData(0,0,c.width,c.height).data;};
     const after=grab();w.groundUniforms.uCorridorInfluence.value=0;const before=grab();w.groundUniforms.uCorridorInfluence.value=1;w.render();
     let total=0,n=0;for(let y=130;y<295;y++)for(let x=40;x<440;x++)for(let k=0;k<3;k++){const i=(y*c.width+x)*4+k;total+=Math.abs(after[i]-before[i]);n++;}return total/n;
    });assert.ok(delta>2,`Surface reconstruction must visibly reach the near ground: ${delta}`);(report.groundPixelDelta??={})[view]=delta;
   }
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/approach-corridor.png',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>{
   const s=window.__sim,w=s.world;s.setDrawing(false);s.drawNow();
   return {ready:w.groundUniforms.uCorridorReady.value,trees:w.woodlandForms.reduce((a,b)=>a+b,0),errors:w.assetErrors};
  });
  assert.equal(fallback.ready,0);assert.equal(fallback.trees,14000);assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);await page.close();
  console.log('Missing land-cover mask retains photographed ground and original planting');
 }
 const subset=process.env.REVIEW_VIEWS?'-'+views.join('-').replace(/[^a-z0-9_-]/gi,'-'):'';
 await fs.writeFile(`test/output/${label}${subset}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
