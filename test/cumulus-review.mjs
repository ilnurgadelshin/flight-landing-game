// Matched fair-weather views and actual-shader checks. REVIEW_ROOT archives a baseline.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'cumulus').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report={baseline,results:[]};
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const view of (process.env.REVIEW_VIEWS||'captain-entry,captain,sky,side,above,close,night,overcast').split(',')){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    w.camera=s.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
    s.start({startId:'short',scenarioId:view==='overcast'?'crosswind':'clear',night:view==='night',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const x=view==='captain-entry'?9000:3300;
    s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    if(!view.startsWith('captain')){
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
     c.position.set(3300,view==='above'?3900:115,0);c.lookAt(-5000,2000,-5500);
     if(view==='side'){c.position.set(-11000,1850,-9000);c.lookAt(-5000,2000,-5500);}
     if(view==='close'){c.position.set(-2300,2100,-4500);c.lookAt(-5000,2250,-5500);}
     if(view==='overcast'){c.position.set(3300,120,0);c.lookAt(-5000,900,0);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    w.renderer.info.autoReset=false;w.renderer.info.reset();w.render();w.renderer.getContext().finish();
    const stats={calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,errors:w.assetErrors,cloudVisible:w.cumulus?.group.visible??false,cached:!!w.cumulus?.material.defines.CACHED_DENSITY};
    w.renderer.info.autoReset=true;return stats;
   },view);
   assert.deepEqual(stats.errors,[]);
   if(!baseline&&tier==='high'){assert.equal(stats.cached,true);assert.equal(stats.cloudVisible,view!=='overcast');}
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});report.results.push({tier,view,...stats});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log('Fair-weather matched captures and shader checks passed.');
}finally{await browser.close();server.close();}
