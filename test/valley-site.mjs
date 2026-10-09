// Matched complete-site views and captain-eye descent, including both quality tiers.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'site-current',baseline=!!process.env.REVIEW_ROOT;
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
// The videos are for review: software rendering cannot draw them in reasonable time, so they
// are recorded on a GPU only (RECORD_VIDEO=1 or 0 overrides). Every check runs either way.
const record=process.env.RECORD_VIDEO?process.env.RECORD_VIDEO==='1':angle!=='swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const stats=await page.evaluate(async baseline=>{
   const s=window.__sim,w=s.world;s.setDrawing(false);s.game.state='menu';
   const farm=w.approachBuildings.group.getObjectByName('Authored valley farm'),site=farm?.getObjectByName('Valley roadside grounds');
   let groundError=0,roofCount=0,unplannedTrees=0,plantedTrees=0;
   if(!baseline){
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
    const manifest=await(await fetch('/assets/scenery/farm-sources.json')).json();farm.updateMatrixWorld(true);
    const data=await(await fetch('/assets/scenery/valley-site.json')).json(),road=site.getObjectByName('Roadside roads');
    if(road.geometry.index.count/3>3000)throw new Error('Road ribbon exceeds its geometry budget');
    for(const path of data.paths.filter(p=>p.connectsRoad)){
     const [x,z]=path.points.at(-1),hit=new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0)).intersectObject(road)[0];
     if(!hit||hit.face.normal.y<.5)throw new Error('Access path does not meet an upward-facing road surface');
    }
    for(const p of manifest.placements){
     const hit=new T.Raycaster(new T.Vector3(p.x,100,p.z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
     if(!hit||hit.face.normal.y<.5||hit.point.y-sceneryGroundHeight(p.x,p.z,w.groundLowDetail)<p.height-.5)throw new Error('Missing/low/inverted roof '+p.id);
     roofCount++;
    }
    for(const m of site.children)if(m.userData.sceneryPart==='site-ground'){
     const p=m.geometry.attributes.position,lift=m.name.endsWith('lawns')?.016:m.name.endsWith('roads')?.10:.026;
     for(let i=0;i<p.count;i++)groundError=Math.max(groundError,Math.abs(p.getY(i)-sceneryGroundHeight(p.getX(i),p.getZ(i),w.groundLowDetail)-lift));
    }
    const matrix=new T.Matrix4(),position=new T.Vector3();
    for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
     m.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
     const authored=w.approachSiteTrees.some(t=>Math.hypot(t.x-position.x,t.z-position.z)<.02);
     if(authored)plantedTrees++;
     if(w.approachSiteExcludes(position.x,position.z)&&!authored)unplannedTrees++;
     if(authored&&w.approachSiteRoadExcludes(position.x,position.z))throw new Error('Garden tree intrudes into access lane');
    }
   }
   return {farm:w.approachBuildings.farm,groundError,roofCount,unplannedTrees,plantedTrees,errors:w.assetErrors};
  },baseline);
  assert.deepEqual(stats.errors,[]);if(!baseline){assert.equal(stats.farm.buildings,16);assert.equal(stats.roofCount,16);assert.ok(stats.groundError<.001);assert.equal(stats.unplannedTrees,0);assert.ok(stats.plantedTrees>=5);}
  for(const view of ['wide','north','south','overcast','night','captain-4000','captain-3400','captain-2800']){
   await page.evaluate(async view=>{
    const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');
    s.start({startId:'short',scenarioId:view==='overcast'?'storm':'clear',seed:5,night:view==='night'});s.setTimeScale(0);s.setDrawing(false);
    if(view.startsWith('captain-')){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     const x=Number(view.split('-')[1]);s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
     s.view.look.yaw=0;s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }else{
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
     if(view==='wide'){c.position.set(2870,145,590);c.lookAt(2520,2,350);}
     else if(view==='north'){c.position.set(2540,20,283);c.lookAt(2485,3,245);}
     else {c.position.set(2670,24,500);c.lookAt(2600,3,433);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    s.game.state='menu';document.getElementById('hud').style.visibility='hidden';
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);
    await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.nearWoodland?.settle(eye);w.render();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(view==='south'&&!baseline){
    const delta=await page.evaluate(()=>{
     const w=window.__sim.world,site=w.approachBuildings.group.getObjectByName('Valley roadside grounds'),c=document.createElement('canvas');c.width=480;c.height=300;const g=c.getContext('2d',{willReadFrequently:true});
     const grab=()=>{w.render();g.drawImage(w.renderer.domElement,0,0,480,300);return g.getImageData(0,0,480,300).data;};
     const after=grab();site.visible=false;const before=grab();site.visible=true;w.render();let sum=0,n=0;
     for(let y=150;y<295;y++)for(let x=80;x<420;x++)for(let k=0;k<3;k++){const i=(y*480+x)*4+k;sum+=Math.abs(before[i]-after[i]);n++;}return sum/n;
    });assert.ok(delta>3,'Site surfaces visibly replace photographic ground');stats.surfacePixelDelta=delta;
   }
  }
  if(tier==='high'&&record){
   const video=await page.evaluate(async()=>{
    const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');
    w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
    s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';s.view.setMode('cockpit');s.view.look.yaw=0;s.view.look.pitch=0;
    const stream=w.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    for(let i=0;i<480;i++){
     await new Promise(requestAnimationFrame);const x=3700-i*70/60;
     s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.update(1/60);w.render();
    }
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
   });await fs.writeFile(`test/output/${label}-captain.webm`,Buffer.from(video,'base64'));
  }
  reports.push({tier,...stats});assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
