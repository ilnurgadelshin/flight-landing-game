// Matched ordinary landing and close runway views on both tiers.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'runway-current').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const report={tier,views:[]};reports.push(report);
  for(const view of ['shoulder','touchdown','rollout','flare','final','storm','night']){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(['shoulder','storm','night'].includes(view)){c.position.set(1250,3.7,-29);c.lookAt(1120,1,-41);}
    if(view==='touchdown'){c.position.set(1350,14,-45);c.lookAt(1030,0,0);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(['rollout','flare','final'].includes(view)){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=view==='flare'?1600:view==='final'?2100:1000,y=view==='flare'?11:view==='final'?45:2.5;
     s.game.sim.aircraft.place({x,y,z:0,headingDeg:270,iasKts:view==='rollout'?85:147,flapIndex:4,gearDown:true,gammaDeg:view==='flare'?-1.5:-3,onGround:view==='rollout'});
     s.view.look.yaw=0;s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.render();
    const shoulder=w.runwayShoulders,geometry=shoulder?.mesh.geometry;let down=0;
    if(geometry)for(let i=0;i<geometry.attributes.normal.count;i++)if(geometry.attributes.normal.getY(i)<.99)down++;
    return {view,ready:shoulder?.uniforms.uShoulderReady.value,triangles:geometry?.index.count/3,down,eye:eye.toArray(),errors:w.assetErrors};
   },view);
   assert.deepEqual(stats.errors,[]);assert.equal(stats.down,0);if(!baseline)assert.equal(stats.ready,1);report.views.push(stats);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});console.log(tier,stats);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline){
  // Optional surface scans can fail without hiding or breaking the runway edge.
  const page=await browser.newPage();
  await page.route('**/asphalt-normal.jpg',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.setDrawing(false);w.render();return {ready:w.runwayShoulders.uniforms.uShoulderReady.value,visible:w.runwayShoulders.mesh.visible,errors:w.assetErrors};});
  assert.equal(fallback.ready,0);assert.equal(fallback.visible,true);assert.equal(fallback.errors.length,1);reports.push({fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
