// Actual full-scenery phone landing. Optional video includes DOM instruments/controls.
// Capture overhead makes this visual/functional evidence, not a performance benchmark.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'landing-experience').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
const record=process.env.RECORD==='1',report={method:'852×393, full scenery, actual autoland; real time from 400 ft through rollout. Video/capture overhead is not an FPS benchmark.',stages:[]};
try {
 const context=await browser.newContext({viewport:{width:852,height:393},hasTouch:true,isMobile:true,deviceScaleFactor:1,
  ...(record?{recordVideo:{dir:'test/output/landing-videos',size:{width:852,height:393}}}:{})});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 await page.evaluate(()=>{
  const css=document.documentElement.style;css.setProperty('--sal','47px');css.setProperty('--sar','47px');css.setProperty('--sab','21px');
  const s=window.__sim;s.start({startId:'short',scenarioId:'clear',mode:'game',sound:false,seed:11,skipSchool:true});
  s.view.setMode('cockpit');s.view.look.down=false;s.autopilot({});s.setTimeScale(6);
 });
 await page.waitForFunction(()=>window.__sim.state().agl<400*.3048,null,{timeout:scaledTimeout(90000)});
 await page.evaluate(()=>{window.__sim.setTimeScale(1);window.__sim.setDrawing(true);});
 report.realTimeStart=await page.evaluate(()=>performance.now());
 for(const [name,when] of [
  ['final',()=>window.__sim.state().agl<300*.3048],
  ['flare',()=>window.__sim.state().agl<40*.3048],
  ['rollout',()=>window.__sim.state().onGround&&window.__sim.state().groundSpeed<45],
  ['stopped',()=>window.__sim.game.state==='finished']]){
  await page.waitForFunction(when,null,{timeout:scaledTimeout(180000)});
  report.stages.push(await page.evaluate(name=>{const s=window.__sim,st=s.state();return {name,time:st.time,agl:st.agl,ias:st.ias,onGround:st.onGround,view:s.view.shown,fov:s.world.camera.fov,errors:s.world.assetErrors};},name));
  await page.screenshot({path:`test/output/${label}-${name}.png`});
 }
 report.result=await page.evaluate(()=>window.__sim.result());report.errors=errors;
 assert.equal(report.result.success,true);assert.deepEqual(errors,[]);
 for(const s of report.stages){assert.deepEqual(s.errors,[]);assert.equal(s.view,'cockpit');}
 await context.close();if(record)await page.video().saveAs(`test/output/${label}.webm`);
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('Phone final approach, flare, rollout and successful stop passed.');
}finally{await browser.close();server.close();}
