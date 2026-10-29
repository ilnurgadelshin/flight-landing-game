// Complete approach sites: rendered registration/contact, planting, and optional-data fallback.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery,loadSceneryData} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'approach-sites').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await launchBrowser({lowResolution:true});
const report=[];
try{
 for(const tier of process.env.REVIEW_TIERS?.split(',')||['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const stats=await page.evaluate(async baseline=>{
   const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');s.setDrawing(false);s.game.state='menu';
   const result={...w.approachBuildings.farm,groundError:0,roofs:0,roofSamples:0,foundations:0,ramps:0,roadConnections:0,mainRoadConnections:0,trees:0,unplanned:0,intrusions:0,errors:w.assetErrors};
   if(baseline)return result;
   const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),data=await(await fetch('/assets/scenery/approach-sites.json')).json();
   const registered=(await(await fetch('/assets/scenery/approach-buildings.json')).json()).buildings;
   const manifest=await(await fetch('/assets/scenery/farm-sources.json')).json(),farm=w.approachBuildings.group.getObjectByName('Authored valley farm');farm.updateMatrixWorld(true);
   for(const p of manifest.placements){
    for(const [dx,dz] of p.roofSamples||[[0,0]]){
     const x=p.x+dx,z=p.z+dz,ground=sceneryGroundHeight(x,z,w.groundLowDetail),hit=new T.Raycaster(new T.Vector3(x,ground+100,z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
     if(!hit||hit.face.normal.y<.5||hit.point.y-ground<p.height-.5)throw new Error('Missing/low/inverted roof '+p.id);result.roofSamples++;
    }result.roofs++;
    if(p.foundationPolygons){
     const b=registered.find(b=>b.x===p.x&&b.z===p.z),floor=Math.max(...b.outline.map(([x,z])=>sceneryGroundHeight(b.x+x,b.z+z,w.groundLowDetail)))+.15;
     const edges=[];for(const poly of p.foundationPolygons){
      const area=poly.reduce((n,a,i)=>{const b=poly[(i+1)%poly.length];return n+a[0]*b[1]-b[0]*a[1];},0),ring=area<0?[...poly].reverse():poly;
      for(let i=0;i<ring.length;i++){
       const a=ring[i],b=ring[(i+1)%ring.length],u=(a[0]+b[0])/2,v=(a[1]+b[1])/2,c=Math.cos(p.angle),s=Math.sin(p.angle),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
       const nx=(b[1]-a[1])/length,nz=-(b[0]-a[0])/length,x=p.x+u*c-v*s,z=p.z+u*s+v*c;
       edges.push({x,z,nx:nx*c-nz*s,nz:nx*s+nz*c,ground:sceneryGroundHeight(x,z,w.groundLowDetail)});
      }
     }
     const e=edges.sort((a,b)=>a.ground-b.ground)[0],y=(floor+e.ground)/2;
     const hit=new T.Raycaster(new T.Vector3(e.x+e.nx*2,y,e.z+e.nz*2),new T.Vector3(-e.nx,0,-e.nz),0,2.1).intersectObject(farm,true)[0];
     if(!hit||!hit.object.name.includes('Foundation concrete'))throw new Error('Floating downhill foundation: '+p.id);
     result.foundations++;
     for(const ramp of p.accessRamps||[]){
      for(const t of [.2,.99]){
       const along=.75+(ramp.length-.75)*t,u=ramp.center[0]+ramp.out[0]*along,v=ramp.center[1]+ramp.out[1]*along,c=Math.cos(p.angle),s=Math.sin(p.angle),x=p.x+u*c-v*s,z=p.z+u*s+v*c;
       const hit=new T.Raycaster(new T.Vector3(x,floor+10,z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
       const eu=ramp.center[0]+ramp.out[0]*ramp.length,ev=ramp.center[1]+ramp.out[1]*ramp.length,endGround=sceneryGroundHeight(p.x+eu*c-ev*s,p.z+eu*s+ev*c,w.groundLowDetail);
       const expected=Math.max(sceneryGroundHeight(x,z,w.groundLowDetail)+.04,(floor+.30)*(1-t)+(endGround+.04)*t);
       if(!hit||hit.face.normal.y<.5||(t<.5&&!hit.object.name.includes('Foundation concrete'))||Math.abs(hit.point.y-expected)>.12)throw new Error('Entrance ramp misses floor or yard: '+p.id);
      }result.ramps++;
     }
    }
   }
   for(const [id,u,v] of [['lane-courtyard-barn',8,-10],['lane-garden-house',0,-5],['ridge-farmhouse',-14,-6],['ridge-workshop',10,7],['ridge-workshop',-10,-7]]){
    const p=manifest.placements.find(p=>p.id===id),x=p.x+u*Math.cos(p.angle)-v*Math.sin(p.angle),z=p.z+u*Math.sin(p.angle)+v*Math.cos(p.angle);
    const ground=sceneryGroundHeight(x,z,w.groundLowDetail),yard=new T.Raycaster(new T.Vector3(x,ground+100,z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
    if(yard&&yard.point.y-ground>1)throw new Error('Courtyard filled by a false roof: '+id);
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
    for(const lane of site.streets.filter(l=>site.id==='roadside-homes'||l.connectsMainRoad)){
     const [x,z]=lane.points.at(-1),hit=new T.Raycaster(new T.Vector3(x,sceneryGroundHeight(x,z,w.groundLowDetail)+100,z),new T.Vector3(0,-1,0)).intersectObject(w.approachRoads.group,true).find(h=>h.face?.normal.y>.5);
     if(!hit)throw new Error('Drive does not meet the main road');result.mainRoadConnections++;
    }
   }
   const matrix=new T.Matrix4(),point=new T.Vector3();
   if(!w.approachSiteExcludes(4308,134))throw new Error('Preserved swimming pool must still exclude planting');
   for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
    m.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);const placed=w.approachSiteTrees.some(t=>Math.hypot(t.x-point.x,t.z-point.z)<.02);
    if(placed)result.trees++;
    if(w.approachSiteExcludes(point.x,point.z)&&!placed)result.unplanned++;
    if(placed&&(w.approachSiteRoadExcludes(point.x,point.z)||w.approachBuildingExcludes(point.x,point.z)||w.approachRoadExcludes(point.x,point.z)))result.intrusions++;
   }
   return result;
  },baseline);
  assert.deepEqual(stats.errors,[]);
  if(!baseline){assert.equal(stats.buildings,84);assert.equal(stats.sites,11);assert.equal(stats.roofs,84);assert.equal(stats.roofSamples,89);assert.equal(stats.foundations,3);assert.equal(stats.ramps,4);assert.equal(stats.roadConnections,57);assert.equal(stats.mainRoadConnections,26);assert.ok(stats.groundError<.001);assert.equal(stats.intrusions,0);assert.equal(stats.unplanned,0);assert.ok(stats.trees>50);}
  console.log(tier,stats);report.push({tier,...stats});
  for(const view of process.env.REVIEW_VIEWS?.split(',')||['valley-lane-wide','valley-lane-farm','valley-lane-east','valley-lane-overcast','valley-lane-night','crossing-wide','crossing-front','crossing-lane','crossing-bend','crossing-overcast','crossing-night','captain-6000','captain-5500','captain-5000','homes-wide','homes-close','homes-garden','homes-overcast','homes-night','farm-wide','farm-close','hamlet-wide','hamlet-close','contour-wide','contour-close','contour-overcast','contour-night','overcast','night','captain-4300','captain-3500','captain-2900']){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view.endsWith('overcast')?'storm':'clear',night:view.endsWith('night'),seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(view.startsWith('ridge-farm-')){
     const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),g=(x,z)=>sceneryGroundHeight(x,z,w.groundLowDetail);
     if(view==='ridge-farm-wide'){c.position.set(5880,g(5880,-180)+170,-180);c.lookAt(5520,g(5520,-450)+4,-450);}
     else if(view==='ridge-farm-yard'){c.position.set(5687,g(5687,-447)+6,-447);c.lookAt(5683,g(5683,-474)+3,-474);}
     else{c.position.set(5735,g(5735,-540)+18,-540);c.lookAt(5632,g(5632,-476)+4,-476);}
    }
    if(view==='farm-wide'){c.position.set(2620,140,-610);c.lookAt(2370,0,-390);}
    if(view==='farm-close'){c.position.set(2390,15,-320);c.lookAt(2387,3,-385);}
    if(view==='hamlet-wide'){c.position.set(3410,125,-490);c.lookAt(3180,0,-285);}
    if(['hamlet-close','night','overcast'].includes(view)){c.position.set(3150,14,-310);c.lookAt(3195,2,-277);}
    if(view==='contour-wide'){c.position.set(4585,160,-335);c.lookAt(4420,10,-490);}
    if(view==='homes-wide'){c.position.set(4910,185,335);c.lookAt(4510,35,115);}
    if(view==='valley-lane-wide'){c.position.set(4200,245,80);c.lookAt(3430,30,510);}
    if(['valley-lane-farm','valley-lane-overcast','valley-lane-night'].includes(view)){c.position.set(3415,100,685);c.lookAt(3280,30,545);}
    if(view==='valley-lane-east'){c.position.set(4050,115,600);c.lookAt(3840,35,455);}
    if(['homes-close','homes-overcast','homes-night'].includes(view)){c.position.set(4605,57,255);c.lookAt(4540,36,167);}
    if(view==='homes-garden'){c.position.set(4400,44,220);c.lookAt(4330,27,140);}
    if(view==='crossing-wide'){c.position.set(5410,220,165);c.lookAt(4860,3,-110);}
    if(['crossing-front','crossing-overcast','crossing-night'].includes(view)){c.position.set(5060,50,-72);c.lookAt(4974,8,-161);}
    if(view==='crossing-lane'){c.position.set(4790,80,-73);c.lookAt(4592,-2,-156);}
    if(view==='crossing-bend'){c.position.set(5250,60,-188);c.lookAt(5145,8,-247);}
    if(['contour-close','contour-overcast','contour-night'].includes(view)){c.position.set(4500,25,-406);c.lookAt(4415,8,-493);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(view.startsWith('captain-')){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=Number(view.split('-')[1]);s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline)for(const failure of ['unavailable','invalid']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/approach-sites.json',r=>r.fulfill(failure==='unavailable'?{status:503,body:'Unavailable'}:
   {status:200,contentType:'application/json',body:'{"sites":{}}'}));
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await loadSceneryData(page);
  const fallback=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.setDrawing(false);w.render();return {farm:w.approachBuildings.farm,errors:w.assetErrors};});
  assert.equal(fallback.farm.buildings,9);assert.equal(fallback.farm.sites,1);assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);report.push({failure,fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
