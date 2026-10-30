// Real view controls, Retina PFD rendering, resize and MAP/School transitions.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {functionalScene} from './scene-ready.mjs';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try {
 const page=await browser.newPage({viewport:{width:852,height:393},deviceScaleFactor:2,hasTouch:true,isMobile:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await functionalScene(page);
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});
 await page.evaluate(()=>{const s=window.__sim;s.start({startId:'short',scenarioId:'clear',mode:'game',skipSchool:true,sound:false});s.setTimeScale(0);s.view.setMode('cockpit');s.view.look.down=false;});
 const worldScale=await page.evaluate(()=>window.__sim.world.renderer.getPixelRatio());
 const panel=async()=>{
  await page.locator('#t-view').tap();
  await page.waitForFunction(()=>document.body.classList.contains('pfd-ready'));
  return page.evaluate(()=>{const s=window.__sim,c=document.getElementById('pfd-view'),r=c.getBoundingClientRect();return {w:r.width,h:r.height,backing:c.width,scale:s.world.renderer.getPixelRatio(),label:document.getElementById('t-view-mode').textContent};});
 };
 const first=await panel();assert.equal(first.label,'PANEL');assert.ok(first.w>230);assert.ok(Math.abs(first.backing/first.w-2)<.02);
 assert.equal(first.scale,worldScale,'Sharp instruments do not raise the world rendering resolution');
 const pixels=()=>page.evaluate(()=>{const c=document.getElementById('pfd-view'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261;for(let i=0;i<d.length;i+=13)hash=Math.imul(hash^d[i],16777619);return hash;});
 const before=await pixels();
 await page.evaluate(()=>window.__sim.game.sim.aircraft.place({x:2700,y:130,z:0,headingDeg:270,iasKts:175,flapIndex:4,gearDown:true,gammaDeg:-3}));
 await page.waitForTimeout(100);assert.notEqual(await pixels(),before,'The enlarged display follows actual aircraft state');
 await page.setViewportSize({width:812,height:265});
 await page.waitForFunction(()=>{const r=document.getElementById('pfd-view').getBoundingClientRect();return r.bottom<265&&r.height>=170;});
 await page.locator('#t-map').tap();
 await page.waitForFunction(()=>document.body.classList.contains('nd-ready')&&!document.body.classList.contains('pfd-view'));
 assert.equal(await page.locator('#pfd-view').isVisible(),false);
 await page.locator('#t-view').tap(); // MAP returns to the selected PANEL view.
 await page.waitForFunction(()=>document.body.classList.contains('pfd-ready')&&!document.body.classList.contains('nd-view'));
 await page.locator('#t-view').tap(); // PANEL → HUD
 await page.waitForFunction(()=>window.__sim.view.shown==='hud'&&!window.__sim.world.drawCockpit);
 assert.equal(await page.locator('#pfd-view').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__sim.cockpit.pfdTarget),null);
 await page.locator('#t-view').tap(); // HUD → cockpit
 await page.waitForFunction(()=>window.__sim.view.shown==='cockpit'&&!window.__sim.view.look.down);
 await panel();await page.setViewportSize({width:1024,height:768});
 await page.waitForFunction(()=>!window.__sim.view.pfdView&&window.__sim.cockpit.focus===0);
 assert.equal(await page.locator('#pfd-view').isVisible(),false,'Tablet retains its physical panel view');
 await page.setViewportSize({width:852,height:393});
 await page.waitForFunction(()=>document.body.classList.contains('pfd-ready'));
 await page.evaluate(()=>window.__sim.game.action('help'));
 await page.waitForFunction(()=>window.__sim.game.state==='school'&&!document.body.classList.contains('pfd-view'));
 assert.deepEqual(errors,[]);
 console.log('Retina PFD, live values, touch view cycle, MAP, resize, tablet and Flight School passed.');
}finally{await browser.close();server.close();}
