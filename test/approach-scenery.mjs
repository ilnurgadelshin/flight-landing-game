import {completeScenery} from './scene-ready.mjs';
// Run against the actual world, with both rendering tiers and a missing-data fallback.
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { protectedScenery } from '../js/world/scenery-ground.js';

const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'test/output');
fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/scenery/approach-buildings.json')));
const infill=JSON.parse(fs.readFileSync(path.join(root,'assets/scenery/approach-infill.json')));
const roadData=JSON.parse(fs.readFileSync(path.join(root,'assets/scenery/approach-roads.json')));
for(const road of roadData.roads)for(const [x,z] of road.points)assert.ok(!protectedScenery(x,z,12));
assert.ok(data.buildings.length>2000);
for(const b of [...data.buildings,...infill.buildings]){
  assert.ok(b.outline.every(p=>p.every(Number.isFinite)));
  assert.ok(!protectedScenery(b.x,b.z,Math.hypot(b.w,b.d)/2+2),'Buildings and eaves must clear operational areas');
}
const {server,url}=await startServer(root);
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],treeRequests=[];
    page.on('request',r=>{if(r.url().endsWith('-near.glb'))treeRequests.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
    const stats=await page.evaluate(async()=>{
      const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');
      s.setDrawing(false);s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);
      s.game.state='menu'; // Stop live camera updates while awaiting offline review tiles.
      const buildings=w.approachBuildings;let triangles=0,downwardRoofVertices=0;
      let batches=0,windowSurfaces=0,softShadowVertices=0,transparentShadowVertices=0;
      buildings.shadows.traverse(m=>{if(!m.isMesh)return;const c=m.geometry.attributes.color;
        for(let i=0;i<c.count;i++){const a=c.getW(i);if(a>0&&a<1)softShadowVertices++;if(a===0)transparentShadowVertices++;}
      });
      buildings.group.traverse(m=>{if(!m.isMesh)return;if(m.userData.sceneryPart==='window')windowSurfaces++;batches++;triangles+=m.geometry.attributes.position.count/3;
        if(m.userData.sceneryPart==='roof'){const n=m.geometry.attributes.normal;for(let i=0;i<n.count;i++)if(n.getY(i)<0)downwardRoofVertices++;}
      });
      let intrudingTrees=0,trees=0;const mat=new T.Matrix4(),p=new T.Vector3();
      for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
        if(m.geometry.index.count!==6)throw new Error('Distant tree should have one camera-facing quad');
        m.getMatrixAt(i,mat);p.setFromMatrixPosition(mat);trees++;if(w.approachBuildingExcludes(p.x,p.z)||w.approachRoadExcludes(p.x,p.z))intrudingTrees++;
      }
      const roadVertices=[];
      w.approachRoads.group.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh){const n=m.geometry.attributes.normal;for(const i of new Set(m.geometry.index.array))roadVertices.push(n.getY(i));}});
      const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
      const ray=new T.Raycaster(),groundErrors=[];w.ground.updateMatrixWorld(true);
      for(const [x,z] of [[2700,620],[3500,950],[5800,-1800],[8250,2400]]){
        ray.set(new T.Vector3(x,1000,z),new T.Vector3(0,-1,0));
        const hit=ray.intersectObject(w.ground,true)[0];
        groundErrors.push(Math.abs(hit.point.y-sceneryGroundHeight(x,z,w.lowDetail||w.quality==='low')));
      }
      const detail=w.groundDetail;
      // Cross the imagery grid in both directions and leave it. The texture cache
      // must stay bounded and dispose the departed tiles, including racing loads.
      let largestCache=0;
      for(const x of [2500,5500,9500,12000,4500]){
        await detail.settle(new T.Vector3(x,175,0));largestCache=Math.max(largestCache,detail.cache.size);
      }
      const racing=[detail.settle(new T.Vector3(2500,175,0)),detail.settle(new T.Vector3(8500,175,0))];
      await Promise.all(racing);
      const near=w.nearWoodland;
      if(near){
        for(const [x,y,z] of [[2530,18,352],[2480,60,310],[6000,800,0],[4500,175,0]]){
          near.settle(new T.Vector3(x,y,z));
          if(near.count>48||near.triangles>2400000)throw new Error('Near tree pool exceeded its budget');
        }
        near.settle(new T.Vector3(2530,18,352));
      }
      return {count:buildings.count,infillCount:buildings.infillCount,batches,triangles,windowSurfaces,softShadowVertices,transparentShadowVertices,downwardRoofVertices,intrudingTrees,trees,
        nearForms:near?.pools.length||0,nearCount:near?.count||0,nearTriangles:near?.triangles||0,
        fadedCards:near?[...near.active.values()].filter(s=>s.t.fade.getX(s.t.index)>.1).length:0,
        treeForms:w.woodlandForms,facadeProfiles:buildings.profileCounts,largestCache,detailErrors:[...detail.errors],
        residentTiles:[...detail.cache.values()].map(e=>[e.texture.image.width,e.texture.image.height]),
        roadSections:w.approachRoads.roads.length,groundError:Math.max(...groundErrors),minimumRoadNormal:Math.min(...roadVertices),roadsFaceUp:roadVertices.every(y=>y>.8),assetErrors:w.assetErrors};
    });
    console.log(tier,stats);
    assert.equal(stats.count,data.buildings.length+infill.buildings.length);assert.equal(stats.infillCount,5);assert.equal(stats.downwardRoofVertices,0);
    if(tier==='high'){
      assert.ok(stats.windowSurfaces>5);assert.equal(stats.nearForms,7);assert.ok(stats.nearCount>5&&stats.nearCount<=48);assert.ok(stats.nearTriangles>10000&&stats.nearTriangles<=2400000);assert.ok(stats.fadedCards>5);
      assert.equal(treeRequests.length,3);
    }else {assert.equal(stats.nearForms,0);assert.equal(treeRequests.length,0);}
    assert.ok(stats.softShadowVertices>100&&stats.transparentShadowVertices>100);assert.equal(stats.intrudingTrees,0);assert.deepEqual(stats.assetErrors,[]);assert.ok(stats.trees>5000);
    assert.equal(stats.roadSections,3);assert.ok(stats.roadsFaceUp);
    assert.ok(stats.groundError<.001,'Scenery must meet the actual rendered terrain on this tier');
    assert.equal(stats.treeForms.length,7);assert.ok(stats.treeForms.every(n=>n>50));
    assert.equal(stats.facadeProfiles.length,12);assert.ok(stats.facadeProfiles.every(n=>n>0));
    assert.ok(stats.largestCache<=4);assert.deepEqual(stats.detailErrors,[]);
    assert.equal(stats.residentTiles.length,4);assert.ok(stats.residentTiles.every(([x,y])=>x===(tier==='high'?2064:1032)&&y===x));
    for(const shot of ['captain','village','nearby','ground','night',...(tier==='high'?['woodland']:[])]){
      await page.evaluate(async shot=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        s.start({startId:'short',scenarioId:'clear',night:shot==='night',seed:5});s.setTimeScale(0);
        s.game.sim.aircraft.place({x:4500,y:175,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
        s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
        s.game.state='menu'; // A paused sim still updates its eye; freeze it for a fixed review camera.
        w.approachBuildings.group.visible=true;
        if(shot!=='captain'){
          const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,1,60000);
          if(shot==='woodland'){
            w.nearWoodland.settle(new T.Vector3(2530,18,352));
            const t=[...w.nearWoodland.active.values()].find(s=>s.t.row===0&&s.fade>.7).t;
            camera.position.set(t.x+26,t.y+11,t.z+24);camera.lookAt(t.x,t.y+t.h*.5,t.z);
          }
          else if(shot==='ground'){
            const {sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
            const y=sceneryGroundHeight(2550,450,w.lowDetail||w.quality==='low');
            camera.position.set(2550,y+2.5,450);camera.lookAt(2490,y+1,360);
          }
          else if(shot==='nearby'){camera.position.set(2530,18,352);camera.lookAt(2465.9,2.5,303.6);}
          else {camera.position.set(3150,180,800);camera.lookAt(2450,5,280);}
          camera.updateMatrixWorld();w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;
          w.drawCockpit=false;document.getElementById('hud').style.visibility='hidden';
          w.update(0,s.state(),camera.position);
          await w.groundDetail.settle(camera.position);w.nearWoodland?.settle(camera.position);w.render();
        }else {s.drawNow();await w.groundDetail.ready;w.nearWoodland?.settle(s.view.eye);s.drawNow();}
        if(![0,1,2,3].some(i=>w.groundUniforms[`uDetailRect${i}`].value.w===1))throw new Error('Review camera has no active detail imagery');
      },shot);
      await page.screenshot({path:path.join(out,`approach-${tier}-${shot}.png`),timeout:300000});   // software rendering: a full frame can take over 30 s
      if(shot==='woodland'){
        await page.evaluate(()=>{const w=window.__sim.world;w.nearWoodland.group.visible=false;
          for(const {t} of w.nearWoodland.active.values()){t.fade.setX(t.index,0);t.fade.needsUpdate=true;}w.render();});
        await page.screenshot({path:path.join(out,'approach-high-woodland-cards.png'),timeout:300000});
      }
      if(shot==='ground'){
        const surfacePixels=await page.evaluate(()=>{
          const w=window.__sim.world,c=document.createElement('canvas');c.width=640;c.height=400;
          const ctx=c.getContext('2d',{willReadFrequently:true});
          const grab=()=>{w.render();ctx.drawImage(w.renderer.domElement,0,0,640,400);return ctx.getImageData(0,0,640,400).data;};
          const detailed=grab();w.groundUniforms.uSurfaceDetail.value=0;const plain=grab();let delta=0,n=0;
          for(let y=230;y<390;y++)for(let x=80;x<560;x++)for(let k=0;k<3;k++){const i=(y*640+x)*4+k;delta+=Math.abs(detailed[i]-plain[i]);n++;}
          w.groundUniforms.uSurfaceDetail.value=1;w.render();return delta/n;
        });
        assert.ok(surfacePixels>.5,`${tier}: reconstructed surface must visibly reach the ground (${surfacePixels})`);
        console.log(tier,'close surface pixel delta',surfacePixels.toFixed(2));
        await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uSurfaceDetail.value=0;w.render();});
        await page.screenshot({path:path.join(out,`approach-${tier}-ground-plain.png`),timeout:300000});
        await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uSurfaceDetail.value=1;w.render();});
      }
      if(shot==='nearby'){
        const detailPixels=await page.evaluate(()=>{
          const w=window.__sim.world,c=document.createElement('canvas');c.width=640;c.height=400;
          const ctx=c.getContext('2d',{willReadFrequently:true});
          const grab=()=>{w.render();ctx.drawImage(w.renderer.domElement,0,0,640,400);return ctx.getImageData(0,0,640,400).data;};
          const before=grab(),weights=[0,1,2,3].map(i=>w.groundUniforms[`uDetailRect${i}`].value.w);
          for(let i=0;i<4;i++)w.groundUniforms[`uDetailRect${i}`].value.w=0;
          const fallback=grab();let change=0,n=0;
          for(let y=250;y<390;y++)for(let x=230;x<620;x++){
            const i=(y*640+x)*4;for(let k=0;k<3;k++){change+=Math.abs(before[i+k]-fallback[i+k]);n++;}
          }
          for(let i=0;i<4;i++)w.groundUniforms[`uDetailRect${i}`].value.w=weights[i];w.render();
          return change/n;
        });
        assert.ok(detailPixels>2,`${tier}: loaded detail imagery must visibly change near-ground pixels (delta ${detailPixels})`);
        console.log(tier,'rendered ground detail pixel delta',detailPixels.toFixed(2));
      }
      if(shot==='village'){
        await page.evaluate(()=>{const w=window.__sim.world;w.approachBuildings.group.visible=false;w.render();});
        await page.screenshot({path:path.join(out,`approach-${tier}-before.png`),timeout:300000});
      }
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage();
  await page.route('**/approach-*.json',r=>r.abort());
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const fallback=await page.evaluate(()=>({woodland:!!window.__sim.world.woodland,errors:window.__sim.world.assetErrors.length}));
  assert.deepEqual(fallback,{woodland:true,errors:3});await page.close();
  const missing=await browser.newPage();await missing.route('**/scenery/detail/*.webp',r=>r.abort());
  await missing.goto(url+'/?quality=low');await missing.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(missing);
  const groundFallback=await missing.evaluate(async()=>{
    const w=window.__sim.world;await w.groundDetail.ready;window.__sim.setDrawing(false);w.render();
    return {failed:w.groundDetail.errors.size,loaded:[...w.groundDetail.cache.values()].filter(e=>e.texture).length,ground:!!w.ground};
  });
  assert.ok(groundFallback.failed>0);assert.equal(groundFallback.loaded,0);assert.ok(groundFallback.ground);await missing.close();
  const treeFailure=await browser.newPage();await treeFailure.route('**/scenery/*-near.glb',r=>r.abort());
  await treeFailure.goto(url+'/?quality=high');await treeFailure.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(treeFailure);
  const treesFallback=await treeFailure.evaluate(()=>{
    const w=window.__sim.world;window.__sim.setDrawing(false);
    return {woodland:!!w.woodland,near:!!w.nearWoodland,errors:w.assetErrors.length};
  });
  assert.deepEqual(treesFallback,{woodland:true,near:false,errors:1});await treeFailure.close();
  console.log('Approach infill, bounded 3D trees, ground streaming, both tiers and missing-data/model fallbacks passed.');
}finally{await browser.close();server.close();}
