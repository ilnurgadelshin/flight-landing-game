import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {functionalScene} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
const results=[];
try{
 for(const missing of [false,true]){
  const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await functionalScene(page);
  if(missing)await page.route('**/737-cockpit-low.glb',r=>r.abort());
  await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});
  const stats=await page.evaluate(()=>{
   const s=window.__sim,w=s.world,r=w.renderer,f=w.edgeFilter;
   s.start({startId:'short',scenarioId:'clear',seed:11,sound:false,skipSchool:true});s.setDrawing(false);s.setTimeScale(0);s.view.setMode('cockpit');s.view.update(0);w.render();
   const result={authored:!!s.cockpit.authoredModel,displays:f.displays.length,texture:!!f.texture};
   let disposed=0;f.texture.addEventListener('dispose',()=>disposed++);w.setPixelRatio(.7);w.render();result.resizeDisposed=disposed;
   const size=f.texture.image;result.size=[size.width,size.height];result.drawingBuffer=[r.domElement.width,r.domElement.height];
   f.texture.addEventListener('dispose',()=>disposed++);w.reduceQuality();result.disabled=w.edgeFilter===null;result.dropDisposed=disposed;
   w.reduceQuality();w.render();result.glError=r.getContext().getError();return result;
  });
  assert.equal(stats.authored,!missing);assert.equal(stats.displays,missing?9:12,'Only visible instruments consume the sixteen display slots');assert.equal(stats.texture,true);assert.equal(stats.resizeDisposed,1);assert.equal(stats.dropDisposed,2);assert.equal(stats.disabled,true);assert.deepEqual(stats.size,stats.drawingBuffer);assert.equal(stats.glError,0);assert.deepEqual(errors,[]);
  results.push({missing,...stats,errors});await page.close();
 }
 await fs.writeFile('test/output/landing-edge-compat.json',JSON.stringify({results},null,2)+'\n');console.log('Edge filter: authored/procedural fallback, resize and adaptive disposal passed.');
}finally{await browser.close();server.close();}
