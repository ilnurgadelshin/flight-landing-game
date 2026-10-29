// Full-game matched views, lighting and finite static architecture checks.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'airport').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser();
const report={date:new Date().toISOString(),baseline,results:[]};
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const gpu=await page.evaluate(()=>{const gl=window.__sim.world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});report.gpu=gpu;
  if(!baseline){
   const geometry=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),a=window.__sim.world.airportArchitecture;
    const stats={finite:true,degenerate:0,triangles:a.triangles,draws:a.root.children.length,minZ:Infinity,textureBytes:0,roomAttributeBytes:0,roomFrames:true,roofHeights:[],frontFacing:true};
    const p=new T.Vector3(),q=new T.Vector3(),r=new T.Vector3(),hallRooms=new Map();
    for(const mesh of a.root.children){
     const geo=mesh.geometry;if(geo.index)continue;
     const pos=geo.attributes.position;
     for(const attr of Object.values(geo.attributes))for(const v of attr.array)if(!Number.isFinite(v))stats.finite=false;
     for(let i=0;i<pos.count;i+=3){
      p.fromBufferAttribute(pos,i);q.fromBufferAttribute(pos,i+1);r.fromBufferAttribute(pos,i+2);
      if(q.sub(p).cross(r.sub(p)).length()<1e-6)stats.degenerate++;
     }
     if(mesh.name.endsWith(':glass'))for(let i=0;i<pos.count;i++){
      if(Math.abs(pos.getZ(i)-426)<.001&&Math.abs(geo.attributes.normal.getZ(i)+1)>.001)stats.frontFacing=false;
      const attrs=geo.attributes,right=new T.Vector3().fromBufferAttribute(attrs.paneRight,i),up=new T.Vector3().fromBufferAttribute(attrs.paneUp,i),normal=new T.Vector3().fromBufferAttribute(attrs.normal,i);
      if(Math.abs(right.length()-1)>.001||Math.abs(up.length()-1)>.001||Math.abs(right.dot(up))>.001||Math.abs(right.dot(normal))>.001||Math.abs(up.dot(normal))>.001||attrs.paneSize.getX(i)<.1||attrs.paneSize.getY(i)<.1)stats.roomFrames=false;
     }
     for(const [name,attr] of Object.entries(geo.attributes))if(name.startsWith('pane'))stats.roomAttributeBytes+=attr.array.byteLength;
     if(mesh.name.startsWith('hall-')&&mesh.name.endsWith(':glass'))for(let i=0;i<pos.count;i+=6){
      const a=geo.attributes;if(Math.abs(Math.abs(a.normal.getZ(i))-1)>.001)continue;
      p.fromBufferAttribute(pos,i);q.fromBufferAttribute(a.paneRight,i);r.fromBufferAttribute(a.paneUp,i);
      p.addScaledVector(q,-a.paneUV.getX(i)*a.paneSize.getX(i)).addScaledVector(r,-a.paneUV.getY(i)*a.paneSize.getY(i));
      const key=[...p.toArray(),a.paneSize.getY(i)].map(v=>Math.round(v*1000)/1000).join(',');hallRooms.set(key,(hallRooms.get(key)||0)+1);
     }
     geo.computeBoundingBox();stats.minZ=Math.min(stats.minZ,geo.boundingBox.min.z);
     if(mesh.name.startsWith('hall-')&&mesh.name.endsWith(':roof'))stats.roofHeights.push(geo.boundingBox.max.y);
    }
    for(const texture of a.textures)stats.textureBytes+=texture.image.width*texture.image.height*4*4/3;
    stats.continuousHallRooms=[...hallRooms.values()].every(count=>count===4);stats.hallRooms=hallRooms.size;
    return stats;
   });
   assert.equal(geometry.finite,true);assert.equal(geometry.degenerate,0);assert.equal(geometry.frontFacing,true);assert.equal(geometry.roomFrames,true);
   assert.ok(geometry.roomAttributeBytes<200000,'Bounded static room attributes');
   assert.ok(geometry.continuousHallRooms&&geometry.hallRooms===120,'Four neighboring panes share each front/rear hall room');
   assert.ok(geometry.minZ>260,'Architecture remains outside the taxiway and runway');
   assert.ok(geometry.triangles<30000&&geometry.draws<=36,'Bound static architecture cost');
   assert.ok(new Set(geometry.roofHeights).size>=3,'Terminal roof hierarchy');
   assert.ok(geometry.textureBytes<(tier==='high'?3:1)*1024*1024,'Generated texture budget');
   (report.geometry??={})[tier]=geometry;
  }
  for(const view of (process.env.REVIEW_VIEWS||'captain,short-final,rollout,airport,terminal,terminal-close,terminal-oblique,terminal-night,terminal-overcast,tower,hangars,landside,night,storm').split(',')){
   const stats=await page.evaluate(async({view,baseline})=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    w.camera=s.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
    s.start({startId:'short',scenarioId:view==='storm'?'storm':view==='terminal-overcast'?'crosswind':'clear',night:view.includes('night'),seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    const x=view==='short-final'?1850:view==='rollout'?100:3300,y=view==='rollout'?2.5:15+(x-1500)*Math.tan(Math.PI/60);
    s.game.sim.aircraft.place({x,y,z:0,headingDeg:270,iasKts:view==='rollout'?65:147,flapIndex:4,gearDown:true,gammaDeg:-3,onGround:view==='rollout'});
    s.view.look.yaw=view==='rollout'?.65:0;s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    if(!['captain','short-final','rollout'].includes(view)){
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
     c.position.set(640,110,100);c.lookAt(0,14,440);
     if(view==='terminal'){c.position.set(130,14,325);c.lookAt(0,12,452);}
     if(['terminal-close','terminal-night','terminal-overcast'].includes(view)){c.position.set(35,5,390);c.lookAt(5,6,427);}
     if(view==='terminal-oblique'){c.position.set(90,6,410);c.lookAt(5,6,427);}
     if(view==='landside'){c.position.set(340,55,620);c.lookAt(0,12,462);}
     if(view==='hangars'){c.position.set(1080,22,185);c.lookAt(800,12,300);}
     if(view==='tower'){c.position.set(-155,33,210);c.lookAt(-250,35,330);}
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);
    w.renderer.info.autoReset=false;w.renderer.info.reset();w.render();w.renderer.getContext().finish();
    const stats={calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,errors:w.assetErrors,emissive:baseline?null:w.airportArchitecture.materials.glass.emissiveIntensity};
    w.renderer.info.autoReset=true;return stats;
   },{view,baseline});
   assert.deepEqual(stats.errors,[]);
   if(!baseline)assert.equal(stats.emissive,view.includes('night')?.65:view==='storm'?.22:0);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});report.results.push({tier,view,...stats});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log('Airport architecture: matched captures, lighting, geometry and budgets passed.');
}finally{await browser.close();server.close();}
