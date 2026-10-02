// Matched before/after views of architecture and canopy variety, plus integration checks.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const reports=[];
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/?quality=${tier}`);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    await completeScenery(page);
    const status=await page.evaluate(()=>{
      const s=window.__sim;s.setDrawing(false);s.game.state='menu';
      return {authored:s.world.approachBuildings.authored,forms:s.world.woodlandForms,errors:s.world.assetErrors,
        bytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.encodedBodySize,0)};
    });
    if(!process.env.REVIEW_ROOT){assert.ok(status.authored.buildings>10);assert.ok(status.authored.triangles<700000);}
    assert.deepEqual(status.errors,[]);reports.push({tier,...status});console.log(tier,status);
    for(const view of ['farm','house','village','airport','trees','night',...(!process.env.REVIEW_ROOT&&tier==='high'?['tree-7','tree-8']:[])]){
      await page.evaluate(async view=>{
        const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
        s.start({startId:'short',scenarioId:'clear',seed:5,night:view==='night'});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
        const camera=new T.PerspectiveCamera(50,1440/900,.1,60000);
        if(view==='farm'){camera.position.set(2530,18,352);camera.lookAt(2465.9,2.5,303.6);}
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
  }
  await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
