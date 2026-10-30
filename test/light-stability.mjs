// Subpixel camera motion must not switch a steady airfield lamp on and off.
// Isolate the real shader from scenery, bloom and intentionally flashing lights.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'light-stability').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd()),browser=await launchBrowser();
try {
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/light-test',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><canvas></canvas>'}));
 if(process.env.LIGHT_SHADER_FILE)await page.route('**/js/world/lights.js',r=>r.fulfill({path:process.env.LIGHT_SHADER_FILE,contentType:'text/javascript'}));
 await page.goto(url+'/light-test');
 const report=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{AirfieldLights}=await import('/js/world/lights.js');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,logarithmicDepthBuffer:true});
  renderer.setSize(128,128);renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.setClearColor(0);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-64,64,64,-64,.1,10000);
  const atmosphere={uniforms:{cloudLayer:{value:new T.Vector4()},cloudEye:{value:new T.Vector3()}}};
  const lights=new AirfieldLights(scene,[],atmosphere),geo=lights.points.geometry;
  let placementHash=2166136261;for(const c of JSON.stringify(lights.entries))placementHash=Math.imul(placementHash^c.charCodeAt(0),16777619);
  const positions=geo.getAttribute('lightPosition')||geo.getAttribute('position');
  const count=lights.entries.length,idx=lights.entries.findIndex(e=>e.size===.75);
  positions.setXYZ(idx,0,0,0);positions.needsUpdate=true;
  const gl=renderer.getContext(),gpu=gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  const results=[];
  for(const dpr of [1,1.5])for(const samples of [0,4])for(const night of [false,true])for(const size of [.75,1.1,3.4])for(const distance of [1400,4000]) {
   renderer.setPixelRatio(dpr);
   const dim=128*dpr,target=new T.WebGLRenderTarget(dim,dim,{samples}),pixels=new Uint8Array(dim*dim*4);
   lights.update(0,new T.Vector3(1400,80,0),0,night?0:1,dpr);
   lights.material.uniforms.uIntensity.value=1;
   geo.getAttribute('size').setX(idx,size);geo.getAttribute('size').needsUpdate=true;
   for(let i=0;i<count;i++)lights.brightAttr.setX(i,i===idx?1:0);
   lights.brightAttr.needsUpdate=true;
   const frames=[];
   for(let i=0;i<=32;i++) {
    const shift=i/16;
    camera.position.set(-shift/dpr,.37/dpr,distance);camera.lookAt(-shift/dpr,.37/dpr,0);camera.updateMatrixWorld();
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    renderer.setRenderTarget(null); // Resolve multisampling before reading the target.
    renderer.readRenderTargetPixels(target,0,0,dim,dim,pixels);
    let flux=0,moment=0;for(let y=0;y<dim;y++)for(let x=0;x<dim;x++){
     const v=pixels[(y*dim+x)*4];flux+=v;moment+=v*(x+.5);
    }
    frames.push({shift,flux,centroid:flux?moment/flux:null});
   }
   const mean=frames.reduce((n,f)=>n+f.flux,0)/frames.length;
   const fluxRange=(Math.max(...frames.map(f=>f.flux))-Math.min(...frames.map(f=>f.flux)))/mean;
   const centerError=Math.max(...frames.map(f=>f.centroid===null?128:Math.abs(f.centroid-(dim/2+f.shift))));
   results.push({dpr,samples,night,size,distance,meanFlux:mean,fluxRange,centerError,frames});target.dispose();
  }
  // Depth, atmosphere and on/off states must remain effective with enlarged support.
  renderer.setPixelRatio(1);const rt=new T.WebGLRenderTarget(128,128),px=new Uint8Array(128*128*4);
  const capture=()=>{
   renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(rt,0,0,128,128,px);
   let sum=0;for(let i=0;i<px.length;i+=4)sum+=px[i]+px[i+1]+px[i+2];return sum;
  };
  camera.position.set(.3,.37,4000);camera.lookAt(.3,.37,0);camera.updateMatrixWorld();
  lights.material.uniforms.uPixelRatio.value=1;lights.material.uniforms.uDaylight.value=0;
  const visible=capture();lights.brightAttr.setX(idx,0);lights.brightAttr.needsUpdate=true;const off=capture();
  lights.brightAttr.setX(idx,1);lights.brightAttr.needsUpdate=true;
  positions.setXYZ(idx,0,0,8000);positions.needsUpdate=true;const behind=capture();positions.setXYZ(idx,0,0,0);positions.needsUpdate=true;
  const wall=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshBasicMaterial({color:0}));wall.position.z=2000;scene.add(wall);
  const occluded=capture();scene.remove(wall);wall.geometry.dispose();wall.material.dispose();
  lights.material.uniforms.uFogDensity.value=.01;const fog=capture();lights.material.uniforms.uFogDensity.value=0;
  atmosphere.uniforms.cloudLayer.value.set(-100,100,32,.025);atmosphere.uniforms.cloudEye.value.copy(camera.position);
  const cloud=capture();atmosphere.uniforms.cloudLayer.value.w=0;
  const papi=[];
  for(const angle of [4,3,2]){
   const e=lights.entries[lights.papi[0]],eye=new T.Vector3(e.x+4000,e.y+4000*Math.tan(angle*Math.PI/180),e.z);
   lights.update(0,eye,0,1,1);papi.push(lights.papi.filter(i=>lights.brightAttr.getX(i)>0&&lights.colAttr.getY(i)>.8).length);
  }
  rt.dispose();renderer.dispose();return {gpu,lights:count,placementHash:(placementHash>>>0).toString(16),results,visibility:{visible,off,behind,occluded,fog,cloud},papi};
 });
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log({cases:report.results.length,maxFluxRange:Math.max(...report.results.map(r=>r.fluxRange)),maxCenterError:Math.max(...report.results.map(r=>r.centerError)),visibility:report.visibility,papi:report.papi});
 for(const r of report.results)if(!baseline){
  assert.ok(r.fluxRange<.15,`Steady lamp energy must survive subpixel motion: ${JSON.stringify({...r,frames:undefined})}`);
  assert.ok(r.centerError<.12,`Lamp position must track subpixel motion: ${JSON.stringify({...r,frames:undefined})}`);}
 assert.deepEqual(errors,[]);
 assert.ok(report.visibility.visible>0);for(const k of ['off','behind','occluded','fog','cloud'])assert.equal(report.visibility[k],0,k);
 assert.deepEqual(report.papi,[4,2,0]);
}finally{await browser.close();server.close();}
