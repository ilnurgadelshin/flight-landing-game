import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'landing-edge';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
const report={date:new Date().toISOString(),results:[]};
try{
 const viewport={width:852,height:393},page=await browser.newPage({viewport,hasTouch:true,isMobile:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url+'/?quality=low&drs=0');await page.waitForFunction(()=>window.__sim,null,{timeout:scaledTimeout(120000)});await completeScenery(page);
 for(const view of (process.env.EDGE_VIEWS||'flare,rollout,panel,night,storm').split(',')){
  const result=await page.evaluate(async({view})=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
   s.start({startId:'short',scenarioId:view==='storm'?'storm':'clear',night:view==='night',seed:11,sound:false,skipSchool:true});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
   s.game.sim.aircraft.place({x:view==='rollout'?1000:1600,y:view==='rollout'?2.5:11,z:0,headingDeg:270,iasKts:view==='rollout'?85:147,flapIndex:4,gearDown:true,gammaDeg:-1.5,onGround:view==='rollout'});
   w.camera=s.cockpit.camera;s.view.setMode('cockpit');Object.assign(s.view.look,{yaw:0,pitch:0,down:view==='panel'});for(let i=0;i<40;i++)s.view.update(1/60);
   if(view==='panel'){s.game.state='paused';for(let i=0;i<90;i++)s.view.update(1/60);}
   document.getElementById('hud').style.visibility='hidden';w.setPixelRatio(1);w.time=w.lights.time=0;
   const eye=w.camera.getWorldPosition(new T.Vector3());w.update(0,{...s.state(),alt:eye.y},eye);await w.groundDetail.settle(eye);w.groundCover?.settle(eye);
   const renderer=w.renderer,gl=renderer.getContext(),width=innerWidth,height=innerHeight,frames={before:[],after:[],reference:[]},images=[];
   let protectedSamples=0,protectedMaxDifference=0;
   const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
   const pixels=ratio=>{const out=new Uint8Array(width*height*ratio*ratio*4);gl.readPixels(0,0,width*ratio,height*ratio,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;};
   for(let f=0;f<9;f++){
    w.camera.setViewOffset(width,height,(f-4)/4,0,width,height);
    w.setPixelRatio(1);w.edgeFilter.enabled=false;w.render();frames.before.push(pixels(1));
    w.edgeFilter.enabled=true;w.render();frames.after.push(pixels(1));
    // Independently project interior points on the live display meshes. Those
    // samples must survive the post filter unchanged, including oblique screens.
    s.cockpit.root.traverseVisible(mesh=>{
     if(!mesh.isMesh||!mesh.material?.map?.isCanvasTexture||mesh.material.toneMapped!==false)return;
     const b=mesh.geometry.boundingBox;
     if(!b||Math.abs(b.max.z-b.min.z)>.00001)return;
     for(const u of [.2,.4,.6,.8])for(const v of [.2,.4,.6,.8]){
      const p=new T.Vector3(T.MathUtils.lerp(b.min.x,b.max.x,u),T.MathUtils.lerp(b.min.y,b.max.y,v),b.max.z).applyMatrix4(mesh.matrixWorld).project(w.camera);
      const x=Math.floor((p.x*.5+.5)*width),y=Math.floor((p.y*.5+.5)*height);
      if(p.z< -1||p.z>1||x<0||x>=width||y<0||y>=height)continue;
      for(let c=0;c<3;c++)protectedMaxDifference=Math.max(protectedMaxDifference,Math.abs(frames.before.at(-1)[(y*width+x)*4+c]-frames.after.at(-1)[(y*width+x)*4+c]));
      protectedSamples++;
     }
    });
    w.edgeFilter.enabled=false;w.setPixelRatio(4);w.render();const large=pixels(4),ref=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
     let sum=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)sum+=linear(large[((y*4+dy)*width*4+x*4+dx)*4+c]/255);
     ref[(y*width+x)*4+c]=Math.round(srgb(sum/16)*255);ref[(y*width+x)*4+3]=255;
    }
    frames.reference.push(ref);
    if(f===4)for(const name of ['before','after','reference']){
     const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d'),im=context.createImageData(width,height),data=frames[name].at(-1);
     for(let y=0;y<height;y++)im.data.set(data.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);context.putImageData(im,0,0);images.push({name,png:canvas.toDataURL().split(',')[1]});
    }
   }
   const regions={whole:[0,0,1,1],windshield:[0,.03,1,.5],mcp:[.52,.54,.47,.23],instruments:[.25,.79,.75,.21]};
   const metric=(kind,region)=>{let error=0,motion=0,n=0;const [x,y,ww,hh]=region;
    for(let f=0;f<9;f++)for(let yy=Math.floor(y*height);yy<Math.floor((y+hh)*height);yy++)for(let xx=Math.floor(x*width);xx<Math.floor((x+ww)*width);xx++)for(let c=0;c<3;c++){
     const i=((height-1-yy)*width+xx)*4+c,a=frames[kind][f][i],b=frames.reference[f][i];error+=Math.abs(a-b);
     if(f)motion+=Math.abs((a-frames[kind][f-1][i])-(b-frames.reference[f-1][i]));n++;
    }return {referenceError:error/n,motionResidual:motion/(n*8/9)};
   };
   w.camera.clearViewOffset();w.setPixelRatio(1);w.edgeFilter.enabled=true;w.render();
   return {view,protectedSamples,protectedMaxDifference,regions:Object.fromEntries(Object.entries(regions).map(([key,rect])=>[key,{before:metric('before',rect),after:metric('after',rect)}])),images,assetErrors:w.assetErrors};
  },{view});
  for(const im of result.images)await fs.writeFile(`test/output/${label}-${view}-${im.name}.png`,Buffer.from(im.png,'base64'));delete result.images;
  report.results.push(result);console.log(result);
  assert.deepEqual(result.assetErrors,[]);assert.ok(result.protectedSamples>100);assert.ok(result.protectedMaxDifference<=1,'Live display colours and lettering remain unchanged');
  for(const [name,r] of Object.entries(result.regions)){
   if(view==='panel')assert.deepEqual(r.after,r.before,'Focused displays bypass the post filter');
   else if(name==='whole'||name==='windshield'){assert.ok(r.after.referenceError<r.before.referenceError*.98);assert.ok(r.after.motionResidual<r.before.motionResidual*.98);}
   else assert.ok(r.after.referenceError<r.before.referenceError*1.02,'Other panel detail is not blurred beyond the reference');
  }
 }
 assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
