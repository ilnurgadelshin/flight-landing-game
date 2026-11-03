// Actual runway material/coverage against an independent 4× supersampled reference.
// Frozen subpixel motion isolates sampling from flight dynamics and light flashers.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'runway-sampling').replace(/[^a-z0-9_-]/gi,'-');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/probe',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><canvas></canvas>'}));await page.goto(url+'/probe');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{makeRunwayTexture}=await import('/js/world/textures.js'),{filterRunwayMaterial,runwayGeometry}=await import('/js/world/runway-surfaces.js');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.setClearColor(0x718354);
  const tex=makeRunwayTexture(renderer.capabilities.getMaxAnisotropy()),scene=new T.Scene();
  const basic=new T.MeshBasicMaterial({map:tex,toneMapped:false}),filtered=basic.clone();
  filterRunwayMaterial(filtered);
  const baseGeometry=new T.PlaneGeometry(3000,45),paddedGeometry=runwayGeometry(),mesh=new T.Mesh(baseGeometry,basic);mesh.rotation.x=-Math.PI/2;scene.add(mesh);
  const camera=new T.PerspectiveCamera(58,384/240,.1,20000),reports=[],images=[];
  for(const ratio of [1,1.5])for(const view of ['far','final','banked','flare','rollout'])for(const samples of [0,4]){
   const width=384*ratio,height=240*ratio;
   const x=view==='far'?6000:(view==='final'||view==='banked')?2400:view==='flare'?1580:700,y=view==='far'?250:(view==='final'||view==='banked')?65:view==='flare'?15:5;
   camera.position.set(x,y,-1.5);camera.lookAt(x-600,y-600*Math.tan(5*Math.PI/180),-1.5);if(view==='banked')camera.rotateZ(12*Math.PI/180);
   const target=new T.WebGLRenderTarget(width,height,{samples}),reference=new T.WebGLRenderTarget(width*4,height*4),small=new Uint8Array(width*height*4),large=new Uint8Array(width*height*64),frames={control:[],current:[],reference:[]};
   for(let f=0;f<17;f++){
    camera.setViewOffset(width,height,f/8,.19,width,height);
    for(const [kind,material]of [['control',basic],['current',filtered]]){mesh.material=material;mesh.geometry=kind==='current'?paddedGeometry:baseGeometry;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(target,0,0,width,height,small);frames[kind].push(new Uint8Array(small));}
    mesh.material=basic;mesh.geometry=baseGeometry;renderer.setRenderTarget(reference);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(reference,0,0,width*4,height*4,large);
    const avg=new Float32Array(small.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++)for(let c=0;c<3;c++)avg[(y*width+x)*4+c]+=large[((y*4+yy)*width*4+x*4+xx)*4+c]/16;
    frames.reference.push(avg);
   }
   const metric=(kind,paint)=>{let error=0,motion=0,n=0,m=0;for(let f=0;f<17;f++)for(let p=0;p<small.length;p+=4){if(paint?frames.reference[f][p]<65:Math.abs(frames.reference[f][p]-42)<2)continue;for(let c=0;c<3;c++){error+=Math.abs(frames[kind][f][p+c]-frames.reference[f][p+c]);n++;if(f){motion+=Math.abs((frames[kind][f][p+c]-frames[kind][f-1][p+c])-(frames.reference[f][p+c]-frames.reference[f-1][p+c]));m++;}}}return {error:n?error/n:null,motion:m?motion/m:null,n};};
   reports.push({view,ratio,samples,control:metric('control',true),current:metric('current',true),surfaceControl:metric('control',false),surfaceCurrent:metric('current',false)});
   if(samples===0&&ratio===1)for(const kind of ['control','current','reference']){const data=frames[kind][8],canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const g=canvas.getContext('2d'),im=g.createImageData(width,height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=(y*width+x)*4,dst=((height-1-y)*width+x)*4;for(let c=0;c<3;c++){const v=data[src+c]/255;im.data[dst+c]=255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055);}im.data[dst+3]=255;}g.putImageData(im,0,0);images.push({view,kind,png:canvas.toDataURL().split(',')[1]});}
   target.dispose();reference.dispose();
  }
  // Padded geometry must neither paint nor write depth outside the original
  // runway. Draw a red plane behind it, later, to expose an invisible occluder.
  const white=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;
  filtered.map=white;filtered.needsUpdate=true;mesh.material=filtered;mesh.geometry=paddedGeometry;
  const behind=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshBasicMaterial({color:0xff0000,transparent:true,toneMapped:false}));
  behind.rotation.x=-Math.PI/2;behind.renderOrder=1;scene.add(behind);
  const ortho=new T.OrthographicCamera(-4,4,4,-4,.1,100);ortho.up.set(0,0,-1);
  const rt=new T.WebGLRenderTarget(64,64),px=new Uint8Array(64*64*4),boundaries=[];
  for(const [x,z,nx,nz]of [[1500,0,1,0],[-1500,0,-1,0],[0,22.5,0,1],[0,-22.5,0,-1]]){
   ortho.position.set(x,20,z);ortho.lookAt(x,0,z);ortho.updateMatrixWorld();behind.position.set(x,-1,z);
   renderer.setRenderTarget(rt);renderer.render(scene,ortho);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(rt,0,0,64,64,px);
   const pixel=sign=>{const p=new T.Vector3(x+sign*nx*2,0,z+sign*nz*2).project(ortho),i=(Math.floor((p.y+1)*32)*64+Math.floor((p.x+1)*32))*4;return [...px.slice(i,i+3)];};
   boundaries.push({x,z,inside:pixel(-1),outside:pixel(1)});
  }
  rt.dispose();white.dispose();
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {reports,images,boundaries,gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
 });
 assert.deepEqual(errors,[]);
 console.log(result.reports.map(r=>({view:r.view,ratio:r.ratio,samples:r.samples,paintMotionRatio:r.current.motion/r.control.motion,surfaceErrorRatio:r.surfaceCurrent.error/r.surfaceControl.error})));console.log(result.boundaries);
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify({date:new Date().toISOString(),gpu:result.gpu,reports:result.reports,boundaries:result.boundaries,errors},null,2)+'\n');
 for(const {view,kind,png}of result.images)await fs.writeFile(`test/output/${label}-${view}-${kind}.png`,Buffer.from(png,'base64'));
 for(const r of result.reports){
  // A banked Retina view with MSAA already samples many of the bright pixels:
  // require improvement there too, without imposing the larger low-tier gain.
  if(r.view!=='far')assert.ok(r.current.motion<r.control.motion*.97,`${r.view} ${r.ratio}/${r.samples}: paint motion residual`);
  // Allow half an 8-bit level of rounding around the fractional reference.
  // SwiftShader's shallow rollout trades a small static error for steadier paint;
  // the motion assertion remains mandatory on every non-distant view.
  assert.ok(r.surfaceCurrent.error<r.surfaceControl.error*1.05+.5,`${r.view} ${r.ratio}/${r.samples}: reference accuracy`);
 }
 for(const b of result.boundaries){assert.deepEqual(b.inside,[255,255,255],'Runway retains depth inside its bounds');assert.deepEqual(b.outside,[255,0,0],'Padding does not paint or occlude outside the runway');}

}finally{await browser.close();server.close();}
