// Short repeatable grass-transition recordings. Uses the normal two-tile update budget,
// including 55 m/s runway motion; only the initial position is settled for the recording.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
const report=[];
try{
 for(const tier of ['high','low']){
  const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:'test/output',size:{width:1280,height:800}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const pose of ['pasture','shoulder']){
   await page.evaluate(async pose=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'clear',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';document.getElementById('hud').style.visibility='hidden';
    const c=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);w.camera=c;w.composer&&(w.composer.passes[0].camera=c);w.drawCockpit=false;w.setPixelRatio(1);
    const place=t=>{if(pose==='pasture'){c.position.set(3370+t*6,sceneryGroundHeight(3370+t*6,-650,w.groundLowDetail)+2.5,-650);c.lookAt(c.position.x+140,c.position.y,-580);}else{c.position.set(1250-t*55,3.7,-36);c.lookAt(c.position.x-140,1,-48);}c.updateMatrixWorld();};
    place(0);await w.groundDetail.settle(c.position);w.nearWoodland?.settle(c.position);w.groundCover.settle(c.position);
    window.__grassMotion={w,c,place,last:null,frames:[],start:null,done:false};w.render();
   },pose);
   await page.evaluate(()=>new Promise(resolve=>{
    const m=window.__grassMotion;
    function frame(now){m.start??=now;const t=(now-m.start)/1000,dt=m.last===null?0:(now-m.last)/1000;m.last=now;m.place(t);m.w.update(Math.min(.1,dt),{...window.__sim.state(),alt:m.c.position.y},m.c.position);m.w.render();if(dt)m.frames.push(dt*1000);if(t<8)requestAnimationFrame(frame);else{m.done=true;resolve();}}requestAnimationFrame(frame);
   }));
   await page.screenshot({path:`test/output/ground-cover-motion-${tier}-${pose}.png`});
   const stats=await page.evaluate(()=>{const m=window.__grassMotion,sorted=m.frames.slice().sort((a,b)=>a-b);return {fps:1000*m.frames.length/m.frames.reduce((a,b)=>a+b,0),p99Ms:sorted[Math.floor(sorted.length*.99)],worstMs:sorted.at(-1),queued:m.w.groundCover.queued,active:m.w.groundCover.activeCount,errors:m.w.assetErrors};});
   assert.deepEqual(stats.errors,[]);assert.ok(stats.active>0);report.push({tier,pose,...stats});console.log(tier,pose,stats);
  }
  const video=page.video();await context.close();await video.saveAs(`test/output/ground-cover-motion-${tier}.webm`);await video.delete();assert.deepEqual(errors,[]);
 }
 await fs.writeFile('test/output/ground-cover-motion.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
