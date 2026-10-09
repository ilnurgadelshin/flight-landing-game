// Both new complete sites: rendered registration/contact, planting, and optional-data fallback.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'approach-sites').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const stats=await page.evaluate(async baseline=>{
   const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');s.setDrawing(false);s.game.state='menu';
   const result={...w.approachBuildings.farm,groundError:0,roofs:0,roadConnections:0,trees:0,unplanned:0,intrusions:0,errors:w.assetErrors};
   if(baseline)return result;
   const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),data=await(await fetch('/assets/scenery/approach-sites.json')).json();
   const manifest=await(await fetch('/assets/scenery/farm-sources.json')).json(),farm=w.approachBuildings.group.getObjectByName('Authored valley farm');farm.updateMatrixWorld(true);
   for(const p of manifest.placements){
    const ground=sceneryGroundHeight(p.x,p.z,w.groundLowDetail),hit=new T.Raycaster(new T.Vector3(p.x,ground+100,p.z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
    if(!hit||hit.face.normal.y<.5||hit.point.y-ground<p.height-.5)throw new Error('Missing/low/inverted roof '+p.id);result.roofs++;
   }
   for(const site of data.sites){
    const group=farm.getObjectByName(site.name),road=group.getObjectByName('Roadside roads');
    for(const mesh of group.children)if(mesh.userData.sceneryPart==='site-ground'){
     const p=mesh.geometry.attributes.position,lift=mesh.name.endsWith('lawns')?.016:mesh.name.endsWith('roads')?.10:.026;
     for(let i=0;i<p.count;i++)result.groundError=Math.max(result.groundError,Math.abs(p.getY(i)-sceneryGroundHeight(p.getX(i),p.getZ(i),w.groundLowDetail)-lift));
    }
    for(const path of site.paths.filter(p=>p.connectsRoad)){
     const [x,z]=path.points.at(-1),hit=new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0)).intersectObject(road)[0];
     if(!hit||hit.face.normal.y<.5)throw new Error('Disconnected access '+site.id);result.roadConnections++;
    }
   }
   const matrix=new T.Matrix4(),point=new T.Vector3();
   for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
    m.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);const placed=w.approachSiteTrees.some(t=>Math.hypot(t.x-point.x,t.z-point.z)<.02);
    if(placed)result.trees++;
    if(w.approachSiteExcludes(point.x,point.z)&&!placed)result.unplanned++;
    if(placed&&(w.approachSiteRoadExcludes(point.x,point.z)||w.approachBuildingExcludes(point.x,point.z)||w.approachRoadExcludes(point.x,point.z)))result.intrusions++;
   }
   return result;
  },baseline);
  assert.deepEqual(stats.errors,[]);
  if(!baseline){assert.equal(stats.buildings,16);assert.equal(stats.sites,3);assert.equal(stats.roofs,16);assert.equal(stats.roadConnections,3);assert.ok(stats.groundError<.001);assert.equal(stats.intrusions,0);assert.equal(stats.unplanned,0);assert.ok(stats.trees>14);}
  console.log(tier,stats);report.push({tier,...stats});
  for(const view of ['farm-wide','farm-close','hamlet-wide','hamlet-close','overcast','night','captain-4300','captain-3500','captain-2900']){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='overcast'?'storm':'clear',night:view==='night',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(view==='farm-wide'){c.position.set(2620,140,-610);c.lookAt(2370,0,-390);}
    if(view==='farm-close'){c.position.set(2390,15,-320);c.lookAt(2387,3,-385);}
    if(view==='hamlet-wide'){c.position.set(3410,125,-490);c.lookAt(3180,0,-285);}
    if(['hamlet-close','night','overcast'].includes(view)){c.position.set(3150,14,-310);c.lookAt(3195,2,-277);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(view.startsWith('captain-')){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=Number(view.split('-')[1]);s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.render();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline)for(const failure of ['unavailable','invalid']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/approach-sites.json',r=>r.fulfill(failure==='unavailable'?{status:503,body:'Unavailable'}:
   {status:200,contentType:'application/json',body:'{"sites":{}}'}));
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.setDrawing(false);w.render();return {farm:w.approachBuildings.farm,errors:w.assetErrors};});
  assert.equal(fallback.farm.buildings,9);assert.equal(fallback.farm.sites,1);assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);report.push({failure,fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
