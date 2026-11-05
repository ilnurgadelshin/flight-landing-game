// Matched ordinary landing and close runway views on both tiers.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'runway-current').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await launchBrowser();
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const report={tier,views:[]};reports.push(report);
  report.designators = await page.evaluate(async () => {
   const {RUNWAY} = await import('/js/config.js');
   const image = window.__sim.world.runwayTex.image;
   const sx = image.width / RUNWAY.length, sy = image.height / RUNWAY.width;
   // Measure white paint in the numeral area, excluding the runway edge lines.
   return [false, true].map(nearEnd => {
    const start = Math.floor((nearEnd ? RUNWAY.length - 74 : 40) * sx);
    const width = Math.ceil(34 * sx), height = Math.floor(26 * sy);
    const {data} = image.getContext('2d').getImageData(start, Math.floor((image.height-height)/2), width, height);
    let x0 = width, x1 = -1, y0 = height, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
     if (data[4 * (y * width + x)] < 190) continue;
     x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
    }
    return {ident:nearEnd ? RUNWAY.ident : RUNWAY.reciprocal, height:(x1-x0+1)/sx, span:(y1-y0+1)/sy};
   });
  });
  if (!baseline) {
   for (const numeral of report.designators) {
    assert.ok(numeral.height >= 17.5 && numeral.height <= 19.4, numeral.ident + ' uses the full painted height');
    assert.ok(numeral.span >= 16 && numeral.span <= 18, numeral.ident + ' retains two separated numeral strokes');
   }
   // Sample the materials through real world-space ray hits. A flipped pad at
   // the reciprocal end still has the right colours but fails these placements.
   const markings = await page.evaluate(async () => {
    const T = await import('/vendor/three.module.js');
    const { RUNWAY } = await import('/js/config.js');
    const world = window.__sim.world, runway = world.scene.getObjectByName('Runway pavement');
    const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
    world.scene.updateMatrixWorld(true);
    function sample(mesh, x, z) {
     ray.set(new T.Vector3(x, 10, z), down);
     const hit = ray.intersectObject(mesh, false)[0], map = mesh.material.map;
     const uv = map.transformUv(hit.uv), image = map.image;
     return Array.from(image.getContext('2d').getImageData(
      Math.floor(uv.x * image.width), Math.floor(uv.y * image.height), 1, 1).data.slice(0, 3));
    }
    return [1, -1].map(end => {
     const ident = end > 0 ? RUNWAY.ident : RUNWAY.reciprocal;
     const pad = world.scene.getObjectByName('Blast pad ' + ident);
     const at = distance => end * (RUNWAY.length / 2 + distance);
     const arms = [-10, 0, 10].map(z => sample(pad, at(15.7 + Math.abs(z)), z));
     return { ident, arms, aisle: sample(pad, at(24), 0), margin: sample(pad, at(37), 22.1),
      bar: sample(runway, at(-1.5), 8), gap: sample(runway, at(-4.5), 8) };
    });
   });
   for (const {ident, arms, aisle, margin, bar, gap} of markings) {
    for (const [r,g,b] of arms) assert.ok(r > 180 && g > 140 && b < g / 2, ident + ' chevron points inward');
    for (const [r,g,b] of [aisle, margin, gap]) assert.ok(Math.max(r,g,b) < 120, ident + ' pavement separates the paint');
    assert.ok(Math.min(...bar) > 205, ident + ' white bar starts on the landing side');
   }
   report.markings = markings;
  }
  for(const view of ['shoulder','touchdown','threshold-27','threshold-09','rollout','flare','final','storm','night']){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(['shoulder','storm','night'].includes(view)){c.position.set(1250,3.7,-29);c.lookAt(1120,1,-41);}
    if(view==='touchdown'){c.position.set(1350,14,-45);c.lookAt(1030,0,0);}
    if(view.startsWith('threshold-')){
     const end=view==='threshold-27'?1:-1;
     c.position.set(end*1600,58,end*-30);c.lookAt(end*1510,0,0);
    }
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
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const fallback=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.setDrawing(false);w.render();return {ready:w.runwayShoulders.uniforms.uShoulderReady.value,visible:w.runwayShoulders.mesh.visible,errors:w.assetErrors};});
  assert.equal(fallback.ready,0);assert.equal(fallback.visible,true);assert.equal(fallback.errors.length,1);reports.push({fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
