// Actual shader/placement, matched pilot and wide views, both tiers, optional-data fallback.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const label=process.argv[2]||'upper-slopes-after',baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader',viewport=angle==='metal'?{width:1440,height:900}:{width:640,height:400};
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]}),reports=[];
const boot=async page=>{
 await page.waitForFunction(()=>window.__sim||document.getElementById('loading-msg')?.textContent.startsWith('Failed to start:'),null,{timeout:120000});
 assert.ok(await page.evaluate(()=>!!window.__sim),'WebGL/game startup failed');await completeScenery(page);
};
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text())}});
  await page.addInitScript(()=>window.addEventListener('sim-ready',()=>window.__sim.setDrawing(false),{once:true}));
  await page.goto(url+'/?quality='+tier);await boot(page);
  const stats=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),w=window.__sim.world,c=w.approachCorridor,m=new T.Matrix4(),p=new T.Vector3();
   window.__sim.setDrawing(false);window.__sim.game.state='menu';
   let trees=0,north=0,south=0,fields=0,intrusions=0,oldNorth=0,oldSouth=0,airport=0;
   for(const mesh of w.woodland.children)if(mesh.material===w.woodlandMaterial)for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);trees++;if(p.x<2100)airport++;
    if(p.x>2100&&p.x<5300){if(p.z>=1030&&p.z<2500)oldSouth++;if(p.z>=-2500&&p.z< -1000)oldNorth++;}
    if(p.x>=5300&&p.x<9000&&(p.z>=1030&&p.z<2500||p.z>=-2500&&p.z< -1000)){
     if(p.z<0)north++;else south++;
     const cover=c.sample(p.x,p.z);if(cover[0]+cover[1]>.35)fields++;
     if(w.approachBuildingExcludes(p.x,p.z)||w.approachRoadExcludes(p.x,p.z))intrusions++;
    }
   }
   return {trees,north,south,fields,intrusions,oldNorth,oldSouth,airport,zones:c.zoneCounts,active:c.upperSlopes?.length||0,mask:[c.texture.image.width,c.texture.image.height],errors:w.assetErrors};
  });
  if(!baseline){
   assert.equal(stats.trees,tier==='high'?70000:14000);assert.equal(stats.active,tier==='high'?2:0);
   assert.deepEqual(stats.mask,tier==='high'?[3450,1277]:[2048,603]);
   if(tier==='high'){
    assert.equal(stats.fields,0);assert.equal(stats.intrusions,0);
    assert.ok(stats.north>=3500&&stats.south>=4500);assert.ok(stats.oldNorth>=5900&&stats.oldSouth>=7900);
    // Exercise the exact terrain GLSL against the uploaded data texture. Read
    // independent pixels across both joins, open fields, and the former corners.
    stats.profiles=await page.evaluate(async()=>{
     const T=await import('/vendor/three.module.js'),{CORRIDOR_GLSL}=await import('/js/world/approach-corridor.js'),w=window.__sim.world;
     const points=[];for(const z of [-1650,1650])for(const x of [5110,5160,5210,5270,5320,5400])points.push([x,z]);
     for(const x of [6500,8000])for(const z of [-1010,-970,-910,-830,860,910,990,1040])points.push([x,z]);
     points.push([6400,-1950],[6050,-1320],[7500,1800]);
     const target=new T.WebGLRenderTarget(points.length,1,{depthBuffer:false,stencilBuffer:false}),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
     const mat=new T.ShaderMaterial({uniforms:{...w.groundUniforms,checks:{value:points.map(p=>new T.Vector2(...p))}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:CORRIDOR_GLSL+`\nuniform vec2 checks[${points.length}];void main(){gl_FragColor=vec4(corridorCover(checks[int(gl_FragCoord.x)]),1.);}`,depthTest:false,depthWrite:false});
     const geom=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geom,mat));const old=w.renderer.getRenderTarget();
     const pixels=new Uint8Array(points.length*4);w.renderer.setRenderTarget(target);w.renderer.render(scene,camera);w.renderer.readRenderTargetPixels(target,0,0,points.length,1,pixels);w.renderer.setRenderTarget(old);
     const result=points.map(([x,z],i)=>({x,z,cpu:w.approachCorridor.sample(x,z),gpu:[0,1,2].map(k=>pixels[i*4+k]/255)}));
     mat.dispose();geom.dispose();target.dispose();return result;
    });
    for(const p of stats.profiles)assert.ok(p.cpu.every((v,k)=>Number.isFinite(v)&&Math.abs(v-p.gpu[k])<.07),`CPU/uploaded shader disagree at ${p.x},${p.z}`);
   }
  }
  assert.deepEqual(stats.errors,[]);reports.push({tier,...stats});console.log(tier,JSON.stringify(stats));
  for(const view of process.env.REVIEW_VIEWS?.split(',')||['captain-9000','captain-7500','captain-6000','upper-slopes-north','upper-slopes-south','upper-overcast','upper-night']){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:view==='upper-overcast'?'crosswind':'clear',night:view==='upper-night',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    if(view.startsWith('captain-')){
     const x=Number(view.slice(8));s.game.sim.aircraft.place({x,y:15+(x-1500)*Math.tan(Math.PI/60),z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.look.yaw=s.view.look.pitch=0;s.view.setMode('cockpit');for(let i=0;i<40;i++)s.view.update(1/60);
    }else{
     const north=view!=='upper-slopes-south',c=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,60000);
     c.position.set(8800,view==='upper-overcast'?w.cloudBase-100:620,north?-550:650);c.lookAt(6650,sceneryGroundHeight(6650,north?-1600:1650,w.groundLowDetail)+20,north?-1600:1650);
     c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
   },view);
   const enabled=await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
   // The material isolation below draws one extra frame. Match that count on
   // the baseline too, keeping subsequent cloud jitter phases comparable.
   if(baseline&&tier==='high'&&view.startsWith('upper-slopes-'))await page.evaluate(()=>{const w=window.__sim.world;w.render();w.renderer.getContext().finish()});
   if(!baseline&&tier==='high'&&view.startsWith('upper-slopes-')){
    await page.evaluate(()=>{const w=window.__sim.world;w.groundUniforms.uUpperSlopesReady.value=0;w.render();w.renderer.getContext().finish()});
    const [a,b]=await Promise.all([enabled,await page.screenshot()].map(p=>sharp(p).removeAlpha().raw().toBuffer()));let delta=0;for(let i=0;i<a.length;i++)delta+=Math.abs(a[i]-b[i]);
    reports.at(-1)[view+'Material']=delta/a.length;assert.ok(delta/a.length>.05,'New slope material contributes to real terrain rendering');
    await page.evaluate(()=>window.__sim.world.groundUniforms.uUpperSlopesReady.value=1);
   }
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(!baseline&&!process.env.REVIEW_VIEWS){
  const page=await browser.newPage({viewport});await page.addInitScript(()=>window.addEventListener('sim-ready',()=>window.__sim.setDrawing(false),{once:true}));
  await page.route('**/approach-corridor.json',async route=>{const response=await route.fetch(),data=await response.json();data.upperSlopes[1].atlas[0]=data.upperSlopes[0].atlas[0];await route.fulfill({response,json:data})});
  await page.goto(url+'/?quality=high');await boot(page);
  const fallback=await page.evaluate(()=>({ready:window.__sim.world.groundUniforms.uCorridorReady.value,errors:window.__sim.world.assetErrors}));
  assert.equal(fallback.ready,0);assert.ok(fallback.errors.some(e=>e.includes('Invalid upper slope')));reports.push({invalidAtlas:fallback});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close()}
