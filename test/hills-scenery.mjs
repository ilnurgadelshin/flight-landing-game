// Pilot-visible hillside coverage, retained fields and distant building detail.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
async function imageDifference(a,b){
 const [x,y]=await Promise.all([a,b].map(image=>sharp(image).removeAlpha().raw().toBuffer()));
 let sum=0,changed=0;for(let i=0;i<x.length;i+=3){const d=(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]))/3;sum+=d;if(d>12)changed++;}
 return {mean:sum/(x.length/3),changedPercent:100*changed/(x.length/3)};
}
const label=process.argv[2]||'hills-current',baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const stats=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;s.setDrawing(false);s.game.state='menu';
   const matrix=new T.Matrix4(),p=new T.Vector3();let trees=0,hills=0,intrusions=0,clearingTrees=0,airportSide=0;
   const join={close:0,hill:0};
   for(const mesh of w.woodland.children)if(mesh.material===w.woodlandMaterial)for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);trees++;
    if(p.x<2100)airportSide++;
    // either side of the join with the close map, where both are wooded
    if(p.x>4200&&p.x<5000){if(p.z>=990&&p.z<1030)join.close++;else if(p.z>=1030&&p.z<1070)join.hill++;}
    if(p.x>2100&&p.x<5300&&p.z>=1030&&p.z<2500){
     hills++;if(w.approachBuildingExcludes(p.x,p.z)||w.approachRoadExcludes(p.x,p.z))intrusions++;
     if(p.x>2350&&p.x<2520&&p.z>1100&&p.z<1310)clearingTrees++;
    }
   }
   const lods=[];w.approachBuildings.group.updateMatrixWorld(true);w.approachBuildings.group.traverse(o=>{
    if(!o.userData.buildingDetail)return;
    const near=o.levels[0].object,far=o.levels[1].object,detail=o.userData.buildingDetail;
    for(const mesh of near.children)if(!/^(Aged cream paint|Recess and door ironwork)$/.test(mesh.material.name)){
     const distant=far.getObjectByName(mesh.name);
     if(!distant||distant.geometry!==mesh.geometry||distant.material!==mesh.material)throw Error('Distant detail changed a structural surface: '+mesh.name);
    }
    const c=new T.PerspectiveCamera(),center=o.getWorldPosition(new T.Vector3());
    const check=(distance,level)=>{c.position.copy(center).add(new T.Vector3(distance,0,0));c.updateMatrixWorld();o.update(c);if(o.getCurrentLevel()!==level)throw Error('Incorrect building detail transition')};
    check(detail.distance*.5,0);check(detail.distance*1.2,1);check(detail.distance*.95,1);check(detail.distance*.5,0);
    lods.push({...detail,name:o.name,structuralSurfacesRetained:true,hysteresis:true});
   });
   return {trees,hills,intrusions,clearingTrees,airportSide,join,hillsActive:w.groundUniforms.uHillsReady.value===1,
    lods,farm:w.approachBuildings.farm,errors:w.assetErrors};
  });
  console.log(tier,stats);
  if(!baseline){
   assert.equal(stats.trees,tier==='high'?52000:14000);
   if(tier==='high'){
    assert.ok(stats.hills>=7900&&stats.hillsActive);
    // no gap or density step where the hillside continues the close map's woods
    assert.ok(stats.join.hill>=.7*stats.join.close,`Hill woods continue the close woods: ${JSON.stringify(stats.join)}`);
    assert.equal(stats.clearingTrees,0);
   }else assert.ok(!stats.hillsActive&&stats.airportSide>=120,'Low keeps the photographed hillside and its background trees');
   assert.equal(stats.intrusions,0);
   assert.ok(stats.lods.length>=5&&stats.farm.farTriangles<stats.farm.triangles*.85,'Distant detail removes meaningful geometry');
  }
  assert.deepEqual(stats.errors,[]);const report={tier,...stats};reports.push(report);
  for(const view of process.env.REVIEW_VIEWS?.split(',')||['captain-7500','captain-6500','captain-5500','captain-4300','captain-3500','hills-wide','hills-edge','hills-overcast','hills-night']){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='hills-overcast'?'crosswind':'clear',night:view==='hills-night',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    if(view.startsWith('captain-')){
     const x=Number(view.split('-')[1]);s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }else{
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
     c.position.set(5200,380,600);c.lookAt(3300,sceneryGroundHeight(3300,1650,w.groundLowDetail)+10,1650);
     if(view==='hills-edge'){c.position.set(3000,sceneryGroundHeight(3000,1400,w.groundLowDetail)+55,1400);c.lookAt(3300,sceneryGroundHeight(3300,1800,w.groundLowDetail)+10,1800)}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(!baseline&&tier==='high'&&view==='hills-wide'){
    const enabled=await page.screenshot();
    await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uHillsReady.value=0;w.render();w.renderer.getContext().finish()});
    report.groundContribution=await imageDifference(enabled,await page.screenshot());
    assert.ok(report.groundContribution.mean>.02,'Hillside atlas contributes to rendered ground');
    await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uHillsReady.value=1;w.render()});
   }
  }
  if(!baseline){
   await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'clear',seed:5});s.setDrawing(false);s.game.state='menu';w.setPixelRatio(1);
    const lod=w.approachBuildings.group.getObjectByName('Complete buildings approach-crossing detail levels');
    const center=lod.getWorldPosition(new T.Vector3()),c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    // An elevated view keeps the crossing roofs in sight instead of allowing the
    // foreground ridge to hide the geometry whose transition we are measuring.
    c.position.copy(center).add(new T.Vector3(1,.65,.18).normalize().multiplyScalar(lod.userData.buildingDetail.distance));c.lookAt(center);c.updateMatrixWorld();
    w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    w.update(0,{...s.state(),alt:c.position.y},c.position);await w.groundDetail.settle(c.position);w.nearWoodland?.settle(c.position);w.groundCover?.settle(c.position);
    w.approachBuildings.group.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0)}});w.render();w.renderer.getContext().finish();
   });
   const near=await page.screenshot({path:`test/output/${label}-${tier}-detail-near.png`});
   await page.evaluate(()=>{const w=window.__sim.world;w.approachBuildings.group.traverse(o=>{if(o.isLOD)o.levels.forEach((l,i)=>l.object.visible=i===1)});w.render();w.renderer.getContext().finish()});
   report.detailTransition=await imageDifference(near,await page.screenshot({path:`test/output/${label}-${tier}-detail-far.png`}));
   assert.ok(report.detailTransition.mean<.5&&report.detailTransition.changedPercent<.3,'Distant trim switch should affect very little of the full image');
   console.log(tier,'Rendered contributions',report.groundContribution,report.detailTransition);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline){
  const page=await browser.newPage();await page.route('**/approach-corridor.json',async route=>{
   const response=await route.fetch(),data=await response.json();data.hills.width=2048;
   await route.fulfill({response,json:data});
  });
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>{const w=window.__sim.world;w.render();return {ready:w.groundUniforms.uCorridorReady.value,hills:w.groundUniforms.uHillsReady.value,errors:w.assetErrors}});
  assert.equal(fallback.ready,0);assert.equal(fallback.hills,0);assert.ok(fallback.errors.some(e=>e.includes('Invalid hillside')));reports.push({invalidAtlas:fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close()}
