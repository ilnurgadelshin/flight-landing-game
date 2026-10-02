// Interactions between cached airport shadows, fading tree geometry, and menu warm-up.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const result=await page.evaluate(async()=>{
    const s=window.__sim,w=s.world,T=await import('/vendor/three.module.js');s.setDrawing(false);s.game.state='menu';
    const near=w.nearWoodland,eye=new T.Vector3(2530,18,352),far=new T.Vector3(0,9000,0);
    w.time+=2;near.settle(far);w.time+=2;near.settle(far);
    w.sun.shadow.needsUpdate=false;
    w.time+=2;near.update(1/60,eye);
    const initialRefresh=w.sun.shadow.needsUpdate;
    const ids=()=>[...near.active.keys()].sort().join(',');
    const membership=ids();w.sun.shadow.needsUpdate=false;
    let firstFadeRefresh=null;
    for(let i=1;i<=90;i++){
      w.time+=1/60;near.update(1/60,eye);
      if(w.sun.shadow.needsUpdate&&firstFadeRefresh===null)firstFadeRefresh=i/60;
    }
    const stableMembership=membership===ids();w.sun.shadow.needsUpdate=false;
    for(let i=0;i<120;i++){w.time+=1/60;near.update(1/60,eye);}
    const settledRefresh=w.sun.shadow.needsUpdate;
    const objects=[];for(const scene of [w.scene,w.cockpitScene])scene.traverse(o=>objects.push([o,o.visible,o.frustumCulled,o.children]));
    const renderer=w.renderer,compile=renderer.compile,render=renderer.render,target=renderer.getRenderTarget(),shadowAuto=renderer.shadowMap.autoUpdate;
    let work=0;renderer.compile=function(...args){work++;return compile.apply(this,args);};renderer.render=function(...args){work++;return render.apply(this,args);};
    try{await w.warmUp(()=>false);}finally{renderer.compile=compile;renderer.render=render;}
    return {initialRefresh,stableMembership,firstFadeRefresh,settledRefresh,cancelledWork:work,
      restored:objects.every(([o,visible,culled,children])=>o.visible===visible&&o.frustumCulled===culled&&o.children===children)&&target===renderer.getRenderTarget()&&shadowAuto===renderer.shadowMap.autoUpdate,
      trees:near.count,errors:w.assetErrors};
  });
  console.log(result);
  assert.ok(result.initialRefresh&&result.stableMembership);
  assert.ok(result.firstFadeRefresh>=1&&result.firstFadeRefresh<1.2,'Refresh completed leaf fades at the one-second limit, even with unchanged membership');
  assert.equal(result.settledRefresh,false,'Settled trees do not repeatedly redraw the static shadow map');
  assert.equal(result.cancelledWork,0,'A cancelled warm-up submits no compile or render work');
  assert.equal(result.restored,true);assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
  console.log('Tree fade shadow invalidation, bounded refresh and cancelled warm-up state passed');
  await page.close();
  // Exercise the real UI gate with a held asset. Shorten only its one-minute wait;
  // no flight/test clocks are otherwise accelerated.
  const slow=await browser.newPage();slow.on('pageerror',e=>errors.push(e.message));
  await slow.addInitScript(()=>{
    const timeout=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===60000?50:ms,...args);
    window.addEventListener('sim-ready',()=>{
      const s=window.__sim;s.setDrawing(false);window.__starts=0;window.__warmCalls=0;
      const start=s.game.start.bind(s.game),warm=s.world.warmUp.bind(s.world);
      s.game.start=(...args)=>{window.__starts++;return start(...args);};
      s.world.warmUp=(...args)=>{window.__warmCalls++;return warm(...args);};
    },{once:true});
  });
  let release;const held=new Promise(resolve=>{release=resolve;});
  await slow.route('**/approach-buildings.json',async route=>{await held;await route.continue();});
  await slow.goto(url+'/?quality=high');await slow.waitForFunction(()=>window.__sim,null,{timeout:120000});
  await slow.evaluate(()=>{const start=()=>window.__sim.ui.onStart({mode:'game',startId:'short',scenarioId:'clear',sound:false,skipSchool:true});start();start();});
  // The first flight frame makes the cabin reflection capture: over 10 s with software rendering.
  await slow.waitForFunction(()=>window.__sim.game.state==='flying',null,{timeout:60000});
  assert.deepEqual(await slow.evaluate(()=>({starts:window.__starts,loading:!document.getElementById('loading').classList.contains('hidden')})),{starts:1,loading:false});
  release();await slow.evaluate(()=>window.__sim.world.sceneryPrepared);
  assert.equal(await slow.evaluate(()=>window.__warmCalls),0,'Delayed scenery must not begin warm-up in the timed-out flight');
  assert.deepEqual(errors,[]);await slow.close();
  console.log('Early Start waits, duplicate Start ignored, timeout starts once and late warm-up skipped');
}finally{await browser.close();server.close();}
