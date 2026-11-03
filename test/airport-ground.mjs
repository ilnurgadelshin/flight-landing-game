// Landing-eye comparisons and ray checks for continuous operational pavement.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'airport-ground').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const viewList=(process.env.AIRPORT_VIEWS||'final,flare,rollout,late-rollout,junction,verge,shadow,storm,night').split(',');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const reports=[];
try{
 for(const tier of ['high','low']){
  const phone=tier==='low',viewport=phone?{width:852,height:393}:{width:1440,height:900};
  const page=await browser.newPage({viewport,hasTouch:phone,isMobile:phone}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const joins=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),{TERRAIN}=await import('/js/physics/terrain.js'),w=window.__sim.world;
   const connectors=w.scene.children.filter(m=>m.isMesh&&m.material===w.pavementMats[2]);w.scene.updateMatrixWorld(true);
   const ray=new T.Raycaster(),samples=[];
   for(const x of [-1450,-700,0,700,1450])for(const z of [23,45,72,99,121,149]){
    ray.set(new T.Vector3(x,10,z),new T.Vector3(0,-1,0));const hit=ray.intersectObjects(connectors,false)[0];
    samples.push({x,z,paved:TERRAIN.surfaceAt(x,z)==='taxiway',rendered:!!hit,height:hit?.point.y});
   }
   // Doors now have a forecourt that joins the taxiway; check actual ray hits,
   // including the shared edge with the original terminal apron.
   const apron=w.scene.children.filter(m=>m.isMesh&&m.material===w.pavementMats[3]);
   for(const x of [699.9,700.1,810,920,979])for(const z of [151,205,260]){
    ray.set(new T.Vector3(x,10,z),new T.Vector3(0,-1,0));const hit=ray.intersectObjects(apron,false)[0];
    samples.push({x,z,paved:TERRAIN.surfaceAt(x,z)==='taxiway',rendered:!!hit,height:hit?.point.y});
   }
   return samples;
  });
  if(!baseline)for(const j of joins){assert.equal(j.paved,true);assert.equal(j.rendered,true,`Connector gap at ${j.x},${j.z}`);assert.ok(Math.abs(j.height)<.03);}
  const views=[];
  for(const view of viewList){
   const stats=await page.evaluate(async({view,viewport})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:11,sound:false,skipSchool:true});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';w.time=0;w.lights.time=0;
    const detail=['junction','verge','shadow'].includes(view);
    if(detail){
     const c=new T.PerspectiveCamera(50,viewport.width/viewport.height,.1,60000);
     if(view==='junction'){c.position.set(1580,120,-45);c.lookAt(1430,0,80);}
     if(view==='verge'){c.position.set(1250,4,-36);c.lookAt(1120,0,-28);}
     if(view==='shadow'){c.position.set(1200,5,220);c.lookAt(1050,0,290);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }else{
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=view==='final'?2700:view==='flare'?1600:view==='late-rollout'?100:1100;
     const y=view==='final'?78:view==='flare'?11:2.5;
     s.game.sim.aircraft.place({x,y,z:0,headingDeg:270,iasKts:y>3?147:85,flapIndex:4,gearDown:true,gammaDeg:view==='flare'?-1.5:-3,onGround:y<3});
     Object.assign(s.view.look,{yaw:0,pitch:0,down:false});s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    w.setPixelRatio(1);document.getElementById('hud').style.visibility='hidden';
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();
    return {view,eye:eye.toArray(),calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,errors:w.assetErrors};
   },{view,viewport});
   assert.deepEqual(stats.errors,[]);views.push(stats);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
  }
  assert.deepEqual(errors,[]);reports.push({tier,joins,views,errors});await page.close();console.log(tier,'captured; connector samples',joins.filter(j=>j.rendered).length+'/'+joins.length);
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
