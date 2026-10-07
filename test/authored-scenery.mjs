// Matched before/after views of architecture and canopy variety, plus integration checks.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';   // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/?quality=${tier}`);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    await completeScenery(page);
    const status=await page.evaluate(async()=>{
      const s=window.__sim;s.setDrawing(false);s.game.state='menu';
      const w=s.world,farm=w.approachBuildings.group.getObjectByName('Authored valley farm'),roofHeights=[];
      if(farm){
        const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js');
        farm.updateMatrixWorld(true);
        for(const [x,z,height] of [[2488.2,300.8,7.5],[2490.8,327.8,6.3],[2465.9,303.6,3.6]]){
          const hit=new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0)).intersectObject(farm,true)[0];
          if(!hit||hit.face.normal.y<.5)throw new Error('Farm roof is missing or inverted: '+JSON.stringify({x,z,point:hit?.point,normal:hit?.face.normal,mesh:hit?.object.name}));
          const delta=hit.point.y-sceneryGroundHeight(x,z,w.groundLowDetail)-height;
          if(delta<0||delta>1)throw new Error('Farm roof lost its registered elevation');
          if(!w.approachBuildingExcludes(x,z))throw new Error('Replacement footprint lost its tree exclusion');
          roofHeights.push(hit.point.y);
        }
        const yard=farm.getObjectByName('Valley farm gravel yard'),p=yard.geometry.attributes.position;
        for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-sceneryGroundHeight(p.getX(i),p.getZ(i),w.groundLowDetail)-.022)>.001)throw new Error('Farm yard does not follow rendered terrain');
      }
      return {authored:w.approachBuildings.authored,farm:w.approachBuildings.farm,roofHeights,forms:w.woodlandForms,errors:w.assetErrors,
        bytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.encodedBodySize,0)};
    });
    if(!process.env.REVIEW_ROOT){
      assert.ok(status.authored.buildings>10);assert.ok(status.authored.triangles<700000);
      assert.equal(status.farm.buildings,9);assert.equal(status.farm.batches,14);assert.ok(status.farm.triangles<75000);
    }
    assert.deepEqual(status.errors,[]);reports.push({tier,...status});console.log(tier,status);
    for(const view of ['farm','house','village','airport','trees','night','farm-overcast',...(!process.env.REVIEW_ROOT&&tier==='high'?['tree-7','tree-8']:[])]){
      await page.evaluate(async view=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        s.start({startId:'short',scenarioId:view==='farm-overcast'?'storm':'clear',seed:5,night:view==='night'});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
        const camera=new T.PerspectiveCamera(50,1440/900,.1,60000);
        if(view==='farm'||view==='farm-overcast'){camera.position.set(2530,18,352);camera.lookAt(2465.9,2.5,303.6);}
        if(view==='house'||view==='night'){camera.position.set(2435,8,325);camera.lookAt(2465.9,2,303.6);}
        if(view==='village'){camera.position.set(3150,180,800);camera.lookAt(2450,5,280);}
        if(view==='airport'){camera.position.set(640,110,100);camera.lookAt(0,14,440);}
        if(view==='trees'){camera.position.set(2700,100,520);camera.lookAt(2470,12,300);}
        if(view.startsWith('tree-')){
          const row=Number(view.split('-')[1]),matrix=new T.Matrix4();let chosen,best=Infinity;
          for(const mesh of w.woodland.children)if(mesh.material===w.woodlandMaterial)for(let i=0;i<mesh.count;i++){
            if(mesh.geometry.attributes.treeUvOffset.getY(i)!==row)continue;
            mesh.getMatrixAt(i,matrix);const p=new T.Vector3().setFromMatrixPosition(matrix),distance=Math.hypot(p.x-2530,p.z-350);
            if(distance<best){best=distance;chosen={p,h:new T.Vector3().setFromMatrixScale(matrix).y};}
          }
          camera.position.copy(chosen.p).add(new T.Vector3(chosen.h*1.2,chosen.h*.5,chosen.h));
          camera.lookAt(chosen.p.clone().add(new T.Vector3(0,chosen.h*.5,0)));
        }
        camera.updateMatrixWorld();w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;
        w.drawCockpit=false;document.getElementById('hud').style.visibility='hidden';
        w.update(0,{...s.state(),alt:camera.position.y},camera.position);
        await w.groundDetail.settle(camera.position);w.nearWoodland?.settle(camera.position);w.render();
      },view);
      await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  if(!process.env.REVIEW_ROOT){
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/modular_urban_apartments_facade.glb',r=>r.fulfill({status:503,body:'Unavailable'}));
    await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    const fallback=await page.evaluate(async()=>{
      const s=window.__sim;s.setDrawing(false);await s.world.loadScenery();s.drawNow();
      return {count:s.world.approachBuildings.count,authored:s.world.approachBuildings.authored,errors:s.world.assetErrors};
    });
    assert.equal(fallback.count,2165);assert.equal(fallback.authored,null);
    assert.ok(fallback.errors.some(e=>e.includes('modular_urban_apartments_facade')));assert.deepEqual(errors,[]);
    await page.close();console.log('Missing authored kit retains complete procedural buildings');
    for(const unavailable of ['valley-farm.glb','farm-gravel-normal.webp','valley-site.json']){
      const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/'+unavailable,r=>r.fulfill({status:503,body:'Unavailable'}));
      await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
      const fallback=await page.evaluate(async()=>{
        const s=window.__sim;s.setDrawing(false);await s.world.loadScenery();s.drawNow();
        const b=s.world.approachBuildings;
        return {count:b.count,farm:b.farm,authored:b.authored.buildings,errors:s.world.assetErrors,partial:!!b.group.getObjectByName('Authored valley farm')};
      });
      assert.equal(fallback.count,2165);assert.equal(fallback.farm,null);assert.equal(fallback.authored,40);assert.equal(fallback.partial,false);
      assert.equal(fallback.errors.length,1);assert.deepEqual(errors,[]);await page.close();
      console.log('Missing '+unavailable+' retains all original farm and roadside buildings');
    }
  }
  await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
