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
const roadData=JSON.parse(fs.readFileSync(path.join(root,'assets/scenery/approach-roads.json')));
for(const road of roadData.roads)for(const [x,z] of road.points)assert.ok(!protectedScenery(x,z,12));
assert.ok(data.buildings.length>2000);
for(const b of data.buildings){
  assert.ok(b.outline.every(p=>p.every(Number.isFinite)));
  assert.ok(!protectedScenery(b.x,b.z,Math.hypot(b.w,b.d)/2+2),'Buildings and eaves must clear operational areas');
}
const {server,url}=await startServer(root);
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    const stats=await page.evaluate(async()=>{
      const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');
      s.setDrawing(false);s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);
      const buildings=w.approachBuildings;let triangles=0,downwardRoofVertices=0;
      let batches=0;
      buildings.group.traverse(m=>{if(!m.isMesh)return;batches++;triangles+=m.geometry.attributes.position.count/3;
        if(m.name.endsWith(' 3')){const n=m.geometry.attributes.normal;for(let i=0;i<n.count;i++)if(n.getY(i)<0)downwardRoofVertices++;}
      });
      let intrudingTrees=0,trees=0;const mat=new T.Matrix4(),p=new T.Vector3();
      for(const m of w.woodland.children)if(m.material===w.woodlandMaterial)for(let i=0;i<m.count;i++){
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
      return {count:buildings.count,batches,triangles,downwardRoofVertices,intrudingTrees,trees,
        roadSections:w.approachRoads.roads.length,groundError:Math.max(...groundErrors),minimumRoadNormal:Math.min(...roadVertices),roadsFaceUp:roadVertices.every(y=>y>.8),assetErrors:w.assetErrors};
    });
    console.log(tier,stats);
    assert.equal(stats.count,data.buildings.length);assert.equal(stats.downwardRoofVertices,0);
    assert.equal(stats.intrudingTrees,0);assert.deepEqual(stats.assetErrors,[]);assert.ok(stats.trees>5000);
    assert.equal(stats.roadSections,3);assert.ok(stats.roadsFaceUp);
    assert.ok(stats.groundError<.001,'Scenery must meet the actual rendered terrain on this tier');
    for(const shot of ['captain','village','nearby','night']){
      await page.evaluate(async shot=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        s.start({startId:'short',scenarioId:'clear',night:shot==='night',seed:5});s.setTimeScale(0);
        s.game.sim.aircraft.place({x:4500,y:175,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
        s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
        w.approachBuildings.group.visible=true;
        if(shot!=='captain'){
          const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,1,60000);
          if(shot==='nearby'){camera.position.set(2530,18,352);camera.lookAt(2465.9,2.5,303.6);}
          else {camera.position.set(3150,180,800);camera.lookAt(2450,5,280);}
          camera.updateMatrixWorld();w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;
          w.drawCockpit=false;document.getElementById('hud').style.visibility='hidden';
          w.update(0,s.state(),camera.position);w.render();
        }else s.drawNow();
      },shot);
      await page.screenshot({path:path.join(out,`approach-${tier}-${shot}.png`)});
      if(shot==='village'){
        await page.evaluate(()=>{const w=window.__sim.world;w.approachBuildings.group.visible=false;w.render();});
        await page.screenshot({path:path.join(out,`approach-${tier}-before.png`)});
      }
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage();
  await page.route('**/approach-*.json',r=>r.abort());
  await page.goto(url+'/?quality=low');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
  const fallback=await page.evaluate(()=>({woodland:!!window.__sim.world.woodland,errors:window.__sim.world.assetErrors.length}));
  assert.deepEqual(fallback,{woodland:true,errors:2});await page.close();
  console.log('Approach geometry, protected areas, vegetation exclusions, both tiers and missing-data fallback passed.');
}finally{await browser.close();server.close();}
