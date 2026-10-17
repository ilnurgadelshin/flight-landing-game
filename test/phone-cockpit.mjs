// Matched full-scenery phone views, with projected windshield and instrument bounds.
// REVIEW_ROOT captures a baseline without asserting the new layout.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'phone-cockpit').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT,angle=process.env.VISUAL_GPU||'swiftshader';
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report={date:new Date().toISOString(),baseline,results:[]};
await fs.mkdir('test/output',{recursive:true});
try {
 for(const touch of [true,false]) {
  const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const cases=touch?[
   ['phone',852,393,'cockpit',47,21],['storm',852,393,'storm',47,21],
   ['panel',852,393,'panel',47,21],['hud',852,393,'hud',47,21],['map',852,393,'nd',47,21],
   ['mini',812,265,'cockpit',50,21],['se',667,375,'cockpit',0,0],['android',640,360,'cockpit',0,0],
   ['tablet',1024,768,'cockpit',0,0],
  ]:[['desktop',1440,900,'cockpit',0,0]];
  for(const [name,width,height,mode,side,bottom] of cases) {
   await page.setViewportSize({width,height});
   await page.evaluate(({side,bottom})=>{const css=document.documentElement.style;css.setProperty('--sal',side+'px');css.setProperty('--sar',side+'px');css.setProperty('--sab',bottom+'px');},{side,bottom});
   const stats=await page.evaluate(async({mode})=>{
    const T=await import('/vendor/three.module.js'),{panePoint}=await import('/js/cockpit/glazing.js'),s=window.__sim,w=s.world,c=s.cockpit;
    s.start({startId:'short',scenarioId:mode==='storm'?'storm':'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);
    // Pause rules without opening a pause overlay; the real presentation still updates.
    s.game.state='paused';s.game.sim.aircraft.place({x:2700,y:78,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});
    s.view.setMode(mode==='hud'?'hud':'cockpit');s.view.setNdView(mode==='nd');
    Object.assign(s.view.look,{yaw:0,pitch:0,down:mode==='panel'});
    for(let i=0;i<180;i++){s.presentation.frame(1/60,0);s.view.update(1/60);}
    s.presentation.frame(0,0);w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    s.view.draw();w.renderer.getContext().finish();
    const project=p=>{p=c.root.localToWorld(p.clone()).project(w.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};};
    const top=project(new T.Vector3(...panePoint(0,.5,1))),foot=project(new T.Vector3(...panePoint(0,.5,0)));
    const screen=m=>{const {width,height}=m.geometry.parameters;return [[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>{
     const p=m.localToWorld(new T.Vector3(x*width/2,y*height/2,0)).project(w.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
    });};
    const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height,visible:!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'};};
    const gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),fov:w.camera.fov,pitch:w.camera.rotation.x*180/Math.PI,
     windshieldHeight:foot.y-top.y,windshieldTop:top.y,windshieldBottom:foot.y,mcp:project(c.anchors.mcp),pfd:screen(c.pfdScreen),nd:screen(c.ndScreen),
     hgs:rect('hgs'),speed:rect('g-spd'),altitude:rect('g-alt'),loc:rect('g-loc'),gs:rect('g-gs'),map:rect('nd-view'),mapButton:rect('t-map'),viewLabel:document.getElementById('t-view-mode').textContent,
     eye:c.eyeLocal.toArray(),errors:w.assetErrors,drawCockpit:w.drawCockpit};
   },{mode});
   report.results.push({name,width,height,mode,...stats});
   assert.deepEqual(stats.errors,[]);
   if(!baseline) {
    const compact=touch&&height<=600;
    if(mode==='cockpit'||mode==='storm') {
     assert.ok(Math.abs(stats.fov-(compact?48:58))<.01);
     assert.ok(Math.abs(stats.pitch+(compact?11:14))<.1);
     for(const points of [stats.pfd,stats.nd])assert.ok(points.every(p=>p.x>0&&p.x<width&&p.y>0&&p.y<height),'Primary displays stay on screen');
     if(compact){
      assert.ok(stats.windshieldHeight/height>.27,'Useful forward windshield band');
      assert.ok(stats.speed.b<stats.mcp.y-12&&stats.altitude.b<stats.mcp.y-12,'Readout columns clear the MCP');
      for(const r of [stats.speed,stats.altitude])assert.ok(r.visible&&r.l>=side&&r.r<=width-side&&r.t>=0&&r.b<=height-bottom);
      for(const points of [stats.pfd,stats.nd])assert.ok(stats.mapButton.r<Math.min(...points.map(p=>p.x)),'MAP clears the captain displays');
     }
    }
    if(mode==='panel'){
     assert.ok(Math.abs(stats.fov-58)<.01);assert.ok(!stats.hgs.visible);assert.equal(stats.viewLabel,'PANEL');
     for(const points of [stats.pfd,stats.nd])assert.ok(points.every(p=>p.y>height*.15&&p.y<height*.7),'PANEL frames instruments, not the floor');
    }
    if(mode==='nd'){assert.ok(stats.map.visible&&stats.hgs.visible);assert.ok(stats.speed.r<=stats.map.l&&stats.altitude.l>=stats.map.r);}
    if(mode==='hud'){assert.equal(stats.drawCockpit,false);assert.ok(stats.hgs.visible);}
   }
   await page.screenshot({path:`test/output/${label}-${name}.png`});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('Phone cockpit: full-scene captures, framing and readout checks passed.');
} finally {await browser.close();server.close();}
