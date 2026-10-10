// Check the actual rendered directions that the old uniform-fog tests missed.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import {cloudPathLength,CLOUD_EXTINCTION} from '../js/world/cloud-layer.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {server,url}=await startServer(process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader'; // VISUAL_GPU=metal on macOS hardware
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
 ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const report=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const result=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),{CLOUD_LAYER_GLSL}=await import('/js/world/cloud-layer.js');
   const s=window.__sim,w=s.world;s.setDrawing(false);s.start({startId:'short',scenarioId:'crosswind',seed:5});s.setTimeScale(0);s.game.state='menu';w.time=40;w.cloudGroup.visible=false;
   // Metal rotates alpha-to-coverage samples between identical frames. Disable
   // that independent tree-edge noise only for the strict pixel comparisons.
   w.woodlandMaterial.alphaToCoverage=false;w.woodlandMaterial.needsUpdate=true;
   const camera=new T.PerspectiveCamera(50,1440/900,.1,60000);w.camera=camera;if(w.composer)w.composer.passes[0].camera=camera;w.drawCockpit=false;w.setPixelRatio(1);
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const grab=()=>{w.render();ctx.drawImage(w.renderer.domElement,0,0,320,200);return ctx.getImageData(0,0,320,200).data;};
   const centre=data=>{const sum=[0,0,0];let n=0;for(let y=80;y<120;y++)for(let x=140;x<180;x++){const i=(y*320+x)*4;for(let c=0;c<3;c++)sum[c]+=data[i+c];n++;}return sum.map(x=>x/n);};
   const diff=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*.75);};
   const pose=(y,dy)=>{camera.position.set(3300,y,0);camera.lookAt(3200,y+dy,0);camera.updateMatrixWorld();w.update(0,{...s.state(),alt:y},camera.position);w.render();w.render();};
   pose(w.cloudTop+12,60);const up=grab(),above=centre(up);
   const extinction=w.atmo.uniforms.cloudLayer.value.w;w.atmo.uniforms.cloudLayer.value.w=0;const aboveClearDelta=diff(up,grab());w.atmo.uniforms.cloudLayer.value.w=extinction;
   pose(w.cloudBase-12,-60);const belowImage=grab(),below=centre(belowImage);w.atmo.uniforms.cloudLayer.value.w=0;const belowClearDelta=diff(belowImage,grab());w.atmo.uniforms.cloudLayer.value.w=extinction;
   pose(w.cloudTop-24,80);const exiting=centre(grab());
   pose(w.cloudTop-24,-5);const entry=grab();let horizonJump=0,previousRow;
   for(let y=50;y<150;y++){let mean=0;for(let x=40;x<280;x++){const i=(y*320+x)*4;mean+=(entry[i]+entry[i+1]+entry[i+2])/720;}if(previousRow!==undefined)horizonJump=Math.max(horizonJump,Math.abs(mean-previousRow));previousRow=mean;}
   pose((w.cloudTop+w.cloudBase)/2,0);const deepImage=grab(),deep=centre(deepImage);w.lights.points.visible=false;const lightDelta=diff(deepImage,grab());w.lights.points.visible=true;
   const boundaryJumps=[];
   for(const edge of [w.cloudTop,w.cloudBase]){pose(edge+1,-5);const a=grab();pose(edge-1,-5);boundaryJumps.push(diff(a,grab()));}
   // A nearby target must remain visible, including just before a boundary proxy is hidden.
   const target=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0xff1010,side:T.DoubleSide}));w.scene.add(target);const foreground=[];
   for(const [y,dy] of [[w.cloudTop-24,-100],[w.cloudTop-148,-100],[w.cloudBase+24,100],[w.cloudBase+148,100],[(w.cloudBase+w.cloudTop)/2,0]]){
    pose(y,dy);const direction=new T.Vector3(-100,dy,0).normalize();target.position.copy(camera.position).addScaledVector(direction,10);target.lookAt(camera.position);target.updateMatrixWorld();
    foreground.push(centre(grab()));
   }
   w.scene.remove(target);target.geometry.dispose();target.material.dispose();
   // GPU/CPU agreement catches sign errors and non-finite horizontal/clear rays.
   const scene=new T.Scene(),probeCamera=new T.Camera(),rt=new T.WebGLRenderTarget(1,1,{depthBuffer:false}),pixels=new Uint8Array(4);
   const uniforms={cloudLayer:{value:new T.Vector4(100,1000,32,Math.log(20)/120)},cloudEye:{value:new T.Vector3()},direction:{value:new T.Vector3()},distanceM:{value:0}};
   const mat=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:CLOUD_LAYER_GLSL+'uniform vec3 direction;uniform float distanceM;void main(){gl_FragColor=vec4(vec3(cloudOpacity(direction,distanceM)),1.);}',toneMapped:false});
   mat.onBeforeCompile=()=>{}; // Isolate the probe from installHaze's shared world uniforms.
   const quad=new T.Mesh(new T.PlaneGeometry(2,2),mat);quad.frustumCulled=false;scene.add(quad);const gpu=[];
   const previous=w.renderer.getRenderTarget();w.renderer.setRenderTarget(rt);
   try{for(const [y,dy,distance] of [[1012,1,20000],[1012,0,20000],[88,-1,20000],[1012,-1,12],[1012,-1,2000],[984,1,2000],[116,-1,2000],[500,0,120],[500,0,10],[1000.01,.00001,60000],[500,.00001,120],[1004,-.00009,60000],[984,.00001,120],[116,-.00001,120]]){
    uniforms.cloudEye.value.y=y;uniforms.direction.value.set(Math.sqrt(1-dy*dy),dy,0);uniforms.distanceM.value=distance;w.renderer.render(scene,probeCamera);w.renderer.readRenderTargetPixels(rt,0,0,1,1,pixels);gpu.push({y,dy,distance,opacity:pixels[0]/255,alpha:pixels[3]});
   }}finally{w.renderer.setRenderTarget(previous);rt.dispose();mat.dispose();quad.geometry.dispose();}
   return {above,below,exiting,horizonJump,deep,aboveClearDelta,belowClearDelta,lightDelta,boundaryJumps,foreground,gpu,assetErrors:w.assetErrors};
  });
  console.log(tier,JSON.stringify(result));
  assert.ok(result.above[2]-result.above[0]>25,'Blue sky survives 12 m above cloud');
  assert.ok(result.aboveClearDelta<.2&&result.belowClearDelta<.2,'Rays away from the cloud retain ordinary clear-air visibility');
  assert.ok(result.exiting[2]-result.exiting[0]>20,'A short upward exit through the fringe retains blue sky');
  assert.ok(result.horizonJump<5,'Entering cloud has no hard horizontal proxy edge');
  assert.ok(result.deep[0]>50&&Math.max(...result.deep)-Math.min(...result.deep)<20,'Deep cloud remains a grey whiteout');
  assert.ok(result.lightDelta<.02,'Distant lights remain obscured inside deep cloud');
  assert.ok(result.boundaryJumps.every(x=>x<8),'No abrupt full-frame change across the nominal boundary');
  for(const rgb of result.foreground)assert.ok(rgb[0]-rgb[1]>45,'Cloud proxies do not hide nearby foreground');
  for(const p of result.gpu){const expected=1-Math.exp(-CLOUD_EXTINCTION*cloudPathLength(p.y,p.dy,p.distance,100,1000));assert.ok(Math.abs(p.opacity-expected)<.012);assert.equal(p.alpha,255);}
  assert.deepEqual(result.assetErrors,[]);assert.deepEqual(errors,[]);report.push({tier,...result});await page.close();
 }
 await fs.writeFile('test/output/cloud-boundary-checks.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
