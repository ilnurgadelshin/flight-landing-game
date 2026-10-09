// Matched ordinary landing and close runway views on both tiers; the grass is high-tier only.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const label=(process.argv[2]||'ground-cover').replace(/[^a-z0-9_-]/gi,'-'),baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const atlas=[];page.on('request',r=>{if(/\/grass-patches/.test(r.url()))atlas.push(r.url());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const report={tier,views:[]};reports.push(report);
  const grass=!baseline&&tier==='high';
  if(!baseline){
   assert.equal(await page.evaluate(()=>!!window.__sim.world.groundCover),grass,`${tier}: grass on the high tier only`);
   assert.equal(atlas.length,grass?1:0,`${tier}: the grass atlas is requested only for the high tier`);
  }
  for(const view of process.env.COVER_VIEWS?.split(',')||['shoulder','meadow','pasture','touchdown','rollout','side-rollout','hud-rollout','flare','final','storm','night']){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(['shoulder','storm','night'].includes(view)){c.position.set(1250,3.7,-29);c.lookAt(1120,1,-41);}
    if(view==='touchdown'){c.position.set(1350,14,-45);c.lookAt(1030,0,0);}
    const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
    if(view==='meadow'){c.position.set(2350,sceneryGroundHeight(2350,330,w.groundLowDetail)+3.5,330);c.lookAt(2470,3,415);}
    if(view==='pasture'){c.position.set(3370,sceneryGroundHeight(3370,-650,w.groundLowDetail)+2.5,-650);c.lookAt(3550,4,-740);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(['rollout','side-rollout','hud-rollout','flare','final'].includes(view)){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=view==='flare'?1600:view==='final'?2100:1000,y=view==='flare'?11:view==='final'?45:2.5;
     s.game.sim.aircraft.place({x,y,z:0,headingDeg:270,iasKts:view.includes('rollout')?85:147,flapIndex:4,gearDown:true,gammaDeg:view==='flare'?-1.5:-3,onGround:view.includes('rollout')});
     s.view.look.yaw=view==='side-rollout'?1.2:0;s.view.look.pitch=view==='side-rollout'?-.12:0;s.view.setMode(view==='hud-rollout'?'hud':'cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();
    const cover=w.groundCover;
    return {view,visible:cover?.mesh.visible,active:cover?.activeCount,capacity:cover?.maxInstances,triangles:cover?cover.mesh.geometry.instanceCount*cover.mesh.geometry.index.count/3:0,queued:cover?.queued,eye:eye.toArray(),errors:w.assetErrors};
   },view);
   assert.deepEqual(stats.errors,[]);report.views.push(stats);
   const on=await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(grass){
    await page.evaluate(()=>{const w=window.__sim.world;w.groundCover.mesh.visible=false;w.render();});
    const off=await page.screenshot(),a=await sharp(on).removeAlpha().raw().toBuffer(),b=await sharp(off).removeAlpha().raw().toBuffer();
    let changed=0;for(let i=0;i<a.length;i+=3)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)changed++;
    stats.changedPixels=changed;
    if(['shoulder','meadow','pasture'].includes(view))assert.ok(changed>2000,`${tier} ${view}: grass has a visible contribution`);
    if(view==='final')assert.equal(stats.visible,false,'Grass is skipped above its useful range');
   }
   console.log(tier,stats);
  }
  if(grass){
   report.pool=await page.evaluate(async()=>{
    const s=window.__sim,w=s.world,g=w.groundCover,T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
    const arrays=[g.roots.array,g.patches.array,g.births.array],geometry=g.mesh.geometry,texture=g.texture,eye=new T.Vector3(3370,4,-650);let maxTileUploads=0;
    for(let i=0;i<160;i++){
     eye.x=3370-i*.8;eye.y=sceneryGroundHeight(eye.x,eye.z,w.groundLowDetail)+3;
     const before=g.roots.version;w.time+=1/60;g.update(eye);maxTileUploads=Math.max(maxTileUploads,g.roots.version-before);
     // A renderer consumes update ranges each frame. Clear them here to isolate selection work.
     for(const a of [g.roots,g.patches,g.births])a.clearUpdateRanges();
    }
    g.settle(eye);let grounded=0,maxGroundError=0;
    for(let i=0;i<geometry.instanceCount;i++)if(g.patches.getY(i)>0){grounded++;maxGroundError=Math.max(maxGroundError,Math.abs(g.roots.getY(i)-sceneryGroundHeight(g.roots.getX(i),g.roots.getZ(i),w.groundLowDetail)-.005));}
    const settledVersion=g.roots.version;for(let i=0;i<90;i++){w.time+=1/60;g.update(eye);}
    const stable=g.roots.version===settledVersion,bufferReuse=arrays.every((a,i)=>a===[g.roots.array,g.patches.array,g.births.array][i]);
    // Hidden grass keeps one bounded upload range per buffer while the renderer skips it.
    const {addGroundCover}=await import('/js/world/ground-cover.js'),blank=quality=>({scene:new T.Scene(),quality,time:0,maxAniso:1,groundUniforms:w.groundUniforms});
    const hiddenWorld=blank('high'),hidden=await addGroundCover(hiddenWorld);let hiddenRanges=0;
    for(let i=0;i<160;i++){
     const x=10000+i*2;hiddenWorld.time+=1/60;hidden.update(new T.Vector3(x,sceneryGroundHeight(x,5000)+3,5000));
     hiddenRanges=Math.max(hiddenRanges,...[hidden.roots,hidden.patches,hidden.births].map(a=>a.updateRanges.length));
    }
    hidden.reduceQuality();const hiddenReleased=!hiddenWorld.scene.children.length&&hiddenWorld.groundCover===null;
    // A timed-out Start can reduce quality while the atlas is still arriving; a low world never asks for it.
    const lateWorld=blank('high'),pending=addGroundCover(lateWorld);lateWorld.quality='low';const late=await pending;
    const lowWorld=blank('low'),low=await addGroundCover(lowWorld);
    const lateSkipped=late===null&&!lateWorld.scene.children.length&&low===null&&!lowWorld.scene.children.length;
    eye.y+=100;g.update(eye);const hiddenAboveRange=!g.mesh.visible;
    // The flight's own quality reduction releases the grass: mesh, buffers and atlas.
    const R=w.renderer,uploaded=!!R.properties.get(texture).__webglTexture;
    w.reduceQuality();w.update(1/60,s.state(),eye);w.render();
    const reduced={uploaded,cover:w.groundCover??null,inScene:!!w.scene.getObjectByName('Dense near-ground grass'),atlasReleased:!R.properties.get(texture).__webglTexture};
    return {maxTileUploads,grounded,maxGroundError,stable,bufferReuse,reduced,hiddenRanges,hiddenReleased,lateSkipped,hiddenAboveRange,bytes:arrays.reduce((n,a)=>n+a.byteLength,0)};
   });
   assert.ok(report.pool.maxTileUploads<=2);assert.ok(report.pool.grounded>1000);assert.ok(report.pool.maxGroundError<.02);
   assert.ok(report.pool.stable&&report.pool.bufferReuse&&report.pool.hiddenAboveRange);
   assert.deepEqual(report.pool.reduced,{uploaded:true,cover:null,inScene:false,atlasReleased:true},'Quality reduction releases the grass');
   assert.ok(report.pool.lateSkipped,'Quality reduction during atlas loading, or a low world, builds no grass');
   assert.equal(report.pool.hiddenRanges,1,'Hidden grass retains one bounded upload range per buffer');
   assert.ok(report.pool.hiddenReleased);
   console.log(tier,'pool',report.pool);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/grass-patches.webp',route=>route.abort());
  await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>{const s=window.__sim,w=s.world;s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);w.render();return {grass:!!w.groundCover,terrain:!!w.groundUniforms.uGrass.value,errors:w.assetErrors};});
  assert.equal(fallback.grass,false);assert.equal(fallback.terrain,true);assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);
  reports.push({fallback});await page.close();console.log('Missing grass atlas retains terrain');
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
