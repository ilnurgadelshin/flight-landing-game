// Actual browser requests: what the menu waits for (startup), then the full scenery that loads
// and is prepared on the graphics card behind the menu, before any flight.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startServer} from './server.mjs';
const {server,url}=await startServer(process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report=[];
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1024,height:576}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>window.addEventListener('sim-ready',()=>{window.__menuAt=performance.now();window.__sim.setDrawing(false);}));
    await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    const resources=()=>page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,start:r.startTime,bytes:r.encodedBodySize})));
    const sum=list=>list.reduce((total,r)=>total+r.bytes,0);
    // requests made before the menu appeared
    const menuAt=await page.evaluate(()=>window.__menuAt),startup=(await resources()).filter(r=>r.start<menuAt);
    assert.ok(!startup.some(r=>/-near\.glb|\/detail\/|\/approach-buildings\.json|\/approach-corridor\.(png|json)|\/grass-patches/.test(r.name)),'No optional scenery before the menu');
    assert.ok(sum(startup)<(tier==='high'?15e6:9e6),`${tier} startup budget: ${sum(startup)}`);
    // behind the menu: the scenery, the near trees on high, and the warm-up
    await page.waitForFunction(()=>window.__sim.world.sceneryPrepared,null,{timeout:30000});
    await page.evaluate(async()=>{await window.__sim.world.sceneryPrepared;});
    const prepared=await resources(),progress=await page.evaluate(()=>window.__sim.world.sceneryProgress);
    const grass=prepared.filter(r=>/\/grass-patches.*\.webp$/.test(r.name));
    assert.equal(grass.length,1,'Exactly one selected grass atlas is prepared');
    assert.ok(grass[0].name.endsWith(tier==='high'?'/grass-patches.webp':'/grass-patches-low.webp'));
    assert.ok(progress.total>4&&progress.done===progress.total,`Scenery progress completes: ${JSON.stringify(progress)}`);
    // a flight then requests nothing more
    await page.evaluate(()=>{window.__sim.start({startId:'short',seed:5});});
    await page.waitForTimeout(3000);
    const flight=(await resources()).slice(prepared.length).map(r=>r.name.replace(url,''));
    const status=await page.evaluate(()=>({errors:window.__sim.world.assetErrors,trees:window.__sim.world.nearWoodland?.pools.length||0}));
    assert.deepEqual(flight,[],'A flight downloads nothing: its scenery is already prepared');
    assert.deepEqual(errors,[]);assert.deepEqual(status.errors,[]);assert.equal(status.trees,tier==='high'?9:0);
    const result={tier,startupBytes:sum(startup),preparedBytes:sum(prepared)};report.push(result);console.log(result);
    await page.close();
  }
  const auto=await browser.newPage({viewport:{width:1024,height:576},deviceScaleFactor:2});
  // Simulate a slow display/renderer cadence; automatic mode must select low.
  await auto.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);
    let hidden=true;Object.defineProperty(document,'hidden',{get:()=>hidden});
    window.__testVisibility=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
    window.requestAnimationFrame=fn=>raf(()=>setTimeout(()=>fn(performance.now()),40));});
  await auto.goto(url+'/');
  await auto.waitForFunction(()=>document.getElementById('loading-msg')?.textContent.includes('Checking graphics'),null,{timeout:120000});
  assert.equal(await auto.evaluate(()=>!!window.__sim),false,'A hidden tab waits for foreground calibration');
  await auto.evaluate(()=>window.__testVisibility(false));
  await auto.waitForFunction(()=>window.__sim,null,{timeout:120000});
  const selected=await auto.evaluate(()=>{
    const s=window.__sim;s.setDrawing(false);const w=s.world;
    return {tier:w.quality,measurement:w.qualityMeasurement,composer:!!w.composer,shadows:w.renderer.shadowMap.enabled,adaptive:s.scaler.enabled,ceiling:s.scaler.ceiling};
  });
  assert.equal(selected.tier,'low');assert.equal(selected.composer,false);assert.equal(selected.shadows,false);assert.equal(selected.adaptive,true);
  // A measurement is stored only after a visible, uninterrupted sample. How many frames fit
  // into it depends on the renderer: software rendering may finish none (incomplete selects
  // low too). Every frame that was measured must show the slowed cadence.
  const measured=selected.measurement;
  assert.ok(measured&&measured.intervals.every(t=>t>=35),'Selection comes from a foreground measurement');
  assert.equal(selected.ceiling,1.5,'Automatic Retina mode can recover above the initial scale');
  await auto.evaluate(async()=>{
    const w=window.__sim.world;await w.loadScenery();
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
    const ray=new T.Raycaster(new T.Vector3(8250,1000,2400),new T.Vector3(0,-1,0));w.ground.updateMatrixWorld(true);
    const height=ray.intersectObject(w.ground,true)[0].point.y;
    if(Math.abs(height-sceneryGroundHeight(8250,2400,w.groundLowDetail))>.001)throw new Error('Quality fallback changed scenery registration');
    if(w.nearWoodland||w.loadNearTrees)throw new Error('Low fallback should not request near-tree models');
    if(w.assetErrors.length)throw new Error(w.assetErrors.join('\n'));
  });
  console.log('Slow automatic selection:',selected);await auto.close();
  await fs.writeFile('test/output/delivery-review.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
