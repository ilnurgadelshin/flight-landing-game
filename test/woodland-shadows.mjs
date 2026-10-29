// Real-scene contribution, lighting state and matched close views on both tiers.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'woodland-shadow-check').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT,{server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser({lowResolution:true});
const report={baseline,results:[]};
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  let duskBuilds;
  for(const view of ['edge','slope','dusk','overcast','night']){
   const stats=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight:ground}=await import('/js/world/scenery-ground.js');
    const s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='overcast'?'crosswind':'clear',night:view==='night',seed:5});
    if(view==='dusk')w.applyScenario({...w.scenario,timeOfDay:'dusk'});
    s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const c=new T.PerspectiveCamera(50,1440/900,.1,60000),g=(x,z)=>ground(x,z,w.groundLowDetail);
    if(view==='slope'){c.position.set(4870,g(4870,650)+50,650);c.lookAt(4760,g(4760,580)+5,580);}
    else {c.position.set(4705,g(4705,255)+35,255);c.lookAt(4620,g(4620,230)+5,230);}
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=c.position;w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    w.renderer.info.autoReset=false;w.renderer.info.reset();w.render();w.renderer.getContext().finish();
    const sh=w.woodlandShadows;
    const stats={calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,errors:w.assetErrors,trees:w.woodlandForms.reduce((a,b)=>a+b,0),
      shadows:sh?{...sh.stats,visible:sh.group.visible,opacity:sh.material.opacity,draws:sh.group.children.length,sharedAtlas:sh.material.map===w.woodlandMaterial.map}:null};
    w.renderer.info.autoReset=true;return stats;
   },view);
   assert.deepEqual(stats.errors,[]);if(!baseline)assert.equal(stats.trees,tier==='high'?70000:14000);
   const on=await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   if(!baseline){
    assert.equal(stats.shadows.sharedAtlas,true,'No duplicate atlas');
    assert.equal(stats.shadows.trees,stats.trees,'Same fixed tree budget');
    const sunless=view==='night'||view==='overcast';
    assert.equal(stats.shadows.visible,!sunless);
    assert.ok(stats.shadows.triangles<stats.trees*12,'Bound terrain subdivision cost');
    if(view==='dusk')duskBuilds=stats.shadows.builds;
    if(sunless)assert.equal(stats.shadows.builds,duskBuilds,'Weather changes keep the sunlit shade rather than rebuilding it');
    await page.evaluate(()=>{const w=window.__sim.world;w.woodlandShadows.group.visible=false;w.render();w.renderer.getContext().finish();});
    const off=await page.screenshot();
    const a=await sharp(on).removeAlpha().raw().toBuffer(),b=await sharp(off).removeAlpha().raw().toBuffer();
    let delta=0,changed=0,brightened=0;
    for(let i=0;i<a.length;i+=3){const d=(b[i]+b[i+1]+b[i+2]-a[i]-a[i+1]-a[i+2])/3;delta+=Math.abs(d);if(d>2)changed++;if(d<-2)brightened++;}
    stats.contribution={meanDelta:delta/(a.length/3),darkenedPixels:changed,brightenedPixels:brightened};
    if(['edge','slope'].includes(view))assert.ok(changed>100,'Canopy shade must actually appear in the rendered landscape');
    if(sunless)assert.equal(delta,0,'No sun shade at night or below an overcast deck');
    assert.ok(brightened<100,`Shading must not brighten the ground (${tier}/${view}: ${brightened})`);
   }
   report.results.push({tier,view,...stats});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('Canopy shade contribution, tier budgets and weather checks passed.');
}finally{await browser.close();server.close();}
