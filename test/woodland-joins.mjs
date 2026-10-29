// Real planting and eligible woodland area on both sides of every map join.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'woodland-joins-after',baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await launchBrowser({lowResolution:true});
await fs.mkdir('test/output',{recursive:true});
const results=[];
try{
 for(const tier of (process.env.REVIEW_TIERS||'high,low').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?quality='+tier+'&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
  const report=await page.evaluate(async()=>{
   const s=window.__sim,w=s.world,c=w.approachCorridor,T=await import('/vendor/three.module.js');
   const {protectedScenery}=await import('/js/world/scenery-ground.js');
   const trees=[],p=new T.Vector3(),m=new T.Matrix4();
   for(const mesh of w.woodland.children)if(mesh.material===w.woodlandMaterial)for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);trees.push([p.x,p.z]);
   }
   const eligible=(x,z)=>{const a=c.sample(x,z);return a[2]>.5&&a[0]+a[1]<.35&&!protectedScenery(x,z,14)&&!w.approachSiteExcludes?.(x,z)&&!w.approachBuildingExcludes?.(x,z)&&!w.approachRoadExcludes?.(x,z);};
   const strips=[['airport-north','x',2100,-2400,-1200],['airport-south','x',2100,1500,2400],
    ['hills-north','x',5300,-2400,-1100],['hills-south','x',5300,1150,2400],
    ['upper-south-west','z',1030,6200,7200],['upper-south-east','z',1030,7200,8800],
    ['upper-north','z',-1000,6200,8800],['close-hill','z',1030,3000,3900]];
   const joins=strips.map(([name,axis,edge,start,end])=>{
    const bands=[[-200,-100],[-100,0],[0,100],[100,200]].map(([a,b])=>{
     let hectares=0,count=0;
     for(let t=start+2;t<end;t+=4)for(let d=edge+a+2;d<edge+b;d+=4)if(eligible(...(axis==='x'?[d,t]:[t,d])))hectares+=16/10000;
     for(const [x,z] of trees){const d=(axis==='x'?x:z)-edge,t=axis==='x'?z:x;if(d>=a&&d<b&&t>=start&&t<end&&eligible(x,z))count++;}
     return {offset:[a,b],hectares,count,density:hectares?count/hectares:0};
    });return {name,axis,edge,start,end,bands,ratio:bands[2].density/bands[1].density};
   });
   return {joins,trees:trees.length,zones:c.zoneCounts,limits:c.trees,
    image:{kind:c.texture.image.constructor.name,width:c.texture.image.width,height:c.texture.image.height},
    gap:[3000,3200,3400,3600,3800].map(x=>({x,woodland:[850,900,950,1000,1028,1050].map(z=>c.sample(x,z)[2])})),errors:w.assetErrors};
  });
  await fs.writeFile(`test/output/${label}-${tier}-metrics.json`,JSON.stringify(report,null,2)+'\n');
  if(!baseline){
   assert.equal(report.trees,tier==='high'?70000:14000);assert.deepEqual(report.errors,[]);
   assert.notEqual(report.image.kind,'HTMLCanvasElement','Decoded full-size map is not retained as a canvas');
   if(tier==='high')assert.ok(report.zones.slice(0,5).reduce((n,v)=>n+v,0)>=40700*.95,'Close corridor keeps at least 95% of its pre-blend allocation');
   if(tier==='high')for(const j of report.joins){assert.ok(j.bands[1].hectares>1.5&&j.bands[2].hectares>1.5,`${j.name}: woodland on both sides`);assert.ok(j.ratio>.70&&j.ratio<1/.70,`${j.name}: density ratio ${j.ratio}`);}
  }
  for(const view of (process.env.REVIEW_VIEWS?.split(',')||['airport-join','hills-join','upper-join','missing-woods','captain'])){
   await page.evaluate(async view=>{
    const T=await import('/vendor/three.module.js'),{sceneryGroundHeight:g}=await import('/js/world/scenery-ground.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',scenarioId:'clear',seed:5});s.setDrawing(false);s.setTimeScale(0);s.game.state='menu';
    if(view==='captain'){
     w.camera=s.view.cockpit.camera;if(w.composer)w.composer.passes[0].camera=w.camera;
     s.game.sim.aircraft.place({x:4500,y:172,z:0,headingDeg:270,iasKts:147,flapIndex:4,gearDown:true,gammaDeg:-3});s.view.setMode('cockpit');s.view.look.yaw=s.view.look.pitch=0;for(let i=0;i<40;i++)s.view.update(1/60);
    }else{
     const c=new T.PerspectiveCamera(50,1440/900,.1,60000),positions={
      'airport-join':[[2600,650,700],[2100,g(2100,1800,w.groundLowDetail),1800]],
      'hills-join':[[5550,650,450],[5300,g(5300,1650,w.groundLowDetail),1650]],
      'upper-join':[[7200,580,100],[7200,g(7200,1300,w.groundLowDetail),1300]],
      'missing-woods':[[3350,480,100],[3400,g(3400,1100,w.groundLowDetail),1100]],
     };c.position.fromArray(positions[view][0]);c.lookAt(...positions[view][1]);c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
    }
    document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);
    const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.nearWoodland?.settle(eye);w.groundCover?.settle(eye);w.render();w.renderer.getContext().finish();
   },view);
   await page.screenshot({path:`test/output/${label}-${tier}-${view}.png`});
  }
  assert.deepEqual(errors,[]);results.push({tier,...report});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(results,null,2)+'\n');console.log(results.map(r=>({tier:r.tier,joins:r.joins.map(j=>[j.name,j.bands.map(b=>+b.density.toFixed(1)),j.ratio]),image:r.image,zones:r.zones})));
}finally{await browser.close();server.close();}
