// Actual flight views, including both material tiers and animated control poses.
// REVIEW_ROOT can serve an archived baseline with the same camera and weather.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const label=(process.argv[2]||'cockpit-surfaces').replace(/[^a-z0-9_-]/gi,'-');
const angle=process.env.VISUAL_GPU||'swiftshader';
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report={date:new Date().toISOString(),results:[]};
try {
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')) {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const view of (process.env.REVIEW_VIEWS||'captain,panel,side,night,storm').split(',')) {
   const result=await page.evaluate(async({tier,view})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world,c=s.cockpit;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);
    s.game.state='paused';s.game.sim.aircraft.place({x:3300,y:115,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    s.view.setMode('cockpit');s.view.setNdView(false);Object.assign(s.view.look,{yaw:view==='side'?.45:0,pitch:0,down:view==='panel'?.45:0});
    for(let i=0;i<120;i++){s.presentation.frame(1/60,0);s.view.update(1/60);}
    w.setPixelRatio(tier==='high'?1.5:1);
    const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    // A one-pixel readback waits for the queued draw; the page screenshot then
    // stays within its time limit with software rendering.
    s.view.draw();const gl=w.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    const ray=new T.Raycaster(),probes=[];
    if(view==='captain')for(const [x,y] of [[505,250],[600,490],[480,448],[1090,363],[290,720],[548,795],[905,485],[700,800],[340,570]]) {
     ray.setFromCamera(new T.Vector2(x/720-1,1-y/450),w.camera);
     const hit=ray.intersectObjects(c.root.children,true).find(h=>{for(let n=h.object;n&&n!==c.root;n=n.parent)if(!n.visible)return false;return h.object.material.isMeshStandardMaterial&&!h.object.material.transparent;});
     if(hit)probes.push({screen:[x,y],name:hit.object.name,material:hit.object.material.name,finish:hit.object.material.userData.cockpitFinish,point:c.root.worldToLocal(hit.point).toArray()});
    }
    let finishBytes=0,invalid=0,paddingInside=0,paddingOutside=0,screenFinishes=0;
    c.root.traverse(mesh=>{
     if(!mesh.isMesh)return;
     const attr=mesh.geometry.getAttribute('deckFinish');if(!attr)return;
     finishBytes+=attr.array.byteLength;
     if(mesh.material.isMeshBasicMaterial)screenFinishes++;
     for(let i=0;i<attr.count;i++){
      const values=[attr.getX(i),attr.getY(i),attr.getZ(i)];
      if(values.some(v=>!Number.isFinite(v)||v<0||v>1))invalid++;
      if(mesh.material.userData.cockpitFinish==='padding'){
       if(values[2]>.5)paddingInside++;if(values[2]===0)paddingOutside++;
      }
     }
    });
    return {finishes:c.authoredModel.userData.surfaceDetail,finishBytes,invalid,paddingInside,paddingOutside,screenFinishes,
     eye:c.eyeLocal.toArray(),probes,assets:w.assetErrors};
   },{tier,view});
   assert.deepEqual(result.assets,[]);assert.deepEqual(result.finishes.errors,[]);
   if(!process.env.REVIEW_ROOT){
    assert.equal(result.finishes.wearSize,tier==='high'?1024:512);
    assert.equal(result.invalid,0,'All part UVs and weights are finite and bounded');
    assert.equal(result.screenFinishes,0,'Live displays never receive a wear finish');
    assert.ok(result.paddingInside>0&&result.paddingOutside>0,'Shared fittings outside the glareshield keep their source finish');
   }
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});report.results.push({tier,view,...result});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('Both cockpit material tiers rendered without asset or shader errors.');
} finally {await browser.close();server.close();}
