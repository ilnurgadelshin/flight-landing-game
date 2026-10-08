// Matched deck views, including normal cockpit views and both cloud boundaries.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'overcast').replace(/[^a-z0-9_-]/gi,'-');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const report={views:[],checks:[]};
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  for(const view of ['above','below','near-top','near-base','inside-top','inside-base','captain-above','captain-below','night','storm']){
   const result=await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.setDrawing(false);s.start({startId:'short',scenarioId:view==='storm'?'storm':'crosswind',night:view==='night',seed:5});s.setTimeScale(0);s.game.state='menu';w.time=40;
    const top=w.cloudTop,base=w.cloudBase,c=new T.PerspectiveCamera(50,1440/900,.1,60000);
    if(['above','near-top','inside-top','night'].includes(view)){
     const y=top+(view==='near-top'?12:view==='inside-top'?-24:320);
     c.position.set(3300,y,0);c.lookAt(-5000,top-500,-2000);
    }else{
     const y=base+(view==='near-base'?-12:view==='inside-base'?24:view==='storm'?-35:-120);
     c.position.set(3300,y,0);c.lookAt(-5000,base+200,-2000);
    }
    c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    if(view.startsWith('captain-')){
     const y=view==='captain-above'?top+220:base-150;
     s.game.sim.aircraft.place({x:8000,y,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;for(let i=0;i<40;i++)s.view.update(1/60);
    }
    w.setPixelRatio(1);document.getElementById('hud').style.visibility='hidden';
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.render();
    const deck=w.deckSurfaces;
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const grab=()=>{w.render();ctx.drawImage(w.renderer.domElement,0,0,320,200);return ctx.getImageData(0,0,320,200).data;};
    const lit=grab();let lightDelta=0;
    if(view==='above'||view.startsWith('inside-')){
     w.lights.points.visible=false;const unlit=grab();w.lights.points.visible=true;
     for(let i=0;i<lit.length;i++)if(i%4!==3)lightDelta=Math.max(lightDelta,Math.abs(lit[i]-unlit[i]));
    }
    let dark=0,mean=0,n=0;
    for(let y=90;y<190;y++)for(let x=10;x<310;x++){const i=(y*320+x)*4,v=(lit[i]+lit[i+1]+lit[i+2])/3;mean+=v;dark+=v<5;n++;}
    return {baseVisible:w.overcast.visible,topVisible:w.overcastTop.visible,lightDelta,mean:mean/n,darkFraction:dark/n,
     visibility:1.73/w.scene.fog.density,width:deck?.target.width,height:deck?.target.height,steps:deck?.uniforms.uSteps.value};
   },view);
   report.views.push({tier,view,...result});
   if(!process.env.REVIEW_ROOT){
    if(view==='above'||view.startsWith('inside-'))assert.ok(result.lightDelta<3,`${tier} ${view}: lights obscured by cloud (${result.lightDelta})`);
    if(view.startsWith('inside-')){
     assert.ok(!result.baseVisible&&!result.topVisible,'No false floor/ceiling inside cloud');
     assert.ok(result.visibility<150,'Cloud fringe must become opaque, even in a high-visibility scenario');
    }
    if(['above','below','near-top','near-base','inside-top','inside-base'].includes(view))assert.ok(result.mean>35&&result.darkFraction<.01,`${tier} ${view}: no black cloud surface`);
    assert.ok(result.width*result.height<=(tier==='high'?560000:160000),'Bounded density target');
   }
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
  }
  if(!process.env.REVIEW_ROOT){
   const guards=await page.evaluate(async()=>{
    const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js'),deck=w.deckSurfaces,r=w.renderer;
    const camera=w.camera;let draws=0;deck.scene.onBeforeRender=()=>draws++;
    const update=alt=>{camera.position.set(3300,alt,0);camera.lookAt(-5000,alt-400,0);camera.updateMatrixWorld();w.update(0,{...s.state(),alt},camera.position);};
    s.start({startId:'short',scenarioId:'clear',seed:5});s.game.state='menu';update(400);deck.render(camera);const clearDraws=draws;
    s.start({startId:'short',scenarioId:'crosswind',seed:5});s.game.state='menu';update((w.cloudTop+w.cloudBase)/2);deck.render(camera);const insideDraws=draws;
    update(w.cloudTop+200);w.render();const texture=deck.target.texture;
    const nested=new T.WebGLRenderTarget(17,13),color=new T.Color(.11,.22,.33);r.setRenderTarget(nested);r.setClearColor(color,.37);r.autoClear=false;
    deck.render(camera);const restored=r.getRenderTarget()===nested&&r.getClearColor(new T.Color()).equals(color)&&r.getClearAlpha()===.37&&r.autoClear===false;
    r.setRenderTarget(null);r.autoClear=true;nested.dispose();
    const sizes=[];w.setPixelRatio(2);w.render();sizes.push([w.quality,deck.target.width,deck.target.height]);
    const textures=r.info.memory.textures;
    for(const ratio of [1,1.5,1,2]){w.setPixelRatio(ratio);w.render();}
    const stable=r.info.memory.textures===textures&&deck.target.texture===texture;
    if(w.quality==='high')w.reduceQuality();w.render();sizes.push([w.quality,deck.target.width,deck.target.height]);
    const lowSteps=deck.uniforms.uSteps.value;delete deck.scene.onBeforeRender;
    return {clearDraws,insideDraws,restored,stable,sizes,lowSteps};
   });
   assert.equal(guards.clearDraws,0);assert.equal(guards.insideDraws,0);assert.ok(guards.restored);assert.ok(guards.stable);
   assert.equal(guards.lowSteps,14);for(const [q,x,y] of guards.sizes)assert.ok(x*y<=(q==='high'?560000:160000));
   report.checks.push({tier,...guards});console.log(tier,guards);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(tier+' overcast captures passed');
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
