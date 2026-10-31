// Compare real instrument textures with an independently supersampled reference.
// Subpixel motion is frozen flight data, so the residual measures sampling crawl,
// not legitimate changes to altitude, guidance or the navigation display.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'instrument-sampling').replace(/[^a-z0-9_-]/gi,'-');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/instrument-test',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js","cannon-es":"/vendor/cannon-es.js"}}</script><canvas></canvas>'}));
 await page.goto(url+'/instrument-test');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{PFD,ND,UpperDU,LowerDU,displayMaterial}=await import('/js/cockpit/instruments.js'),{Simulation}=await import('/js/sim.js');
  const sim=new Simulation({startId:'short',seed:5}),st=sim.state;
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.setClearColor(0);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,2048);camera.position.z=1024;
  const mat=new T.MeshBasicMaterial({toneMapped:false}),mesh=new T.Mesh(new T.PlaneGeometry(1,1),mat);scene.add(mesh);
  const reports=[],images=[];
  const shot=(pixels,dim)=>{const c=document.createElement('canvas');c.width=c.height=dim;const g=c.getContext('2d'),im=g.createImageData(dim,dim);for(let i=0;i<pixels.length;i+=4){for(let k=0;k<3;k++){const v=pixels[i+k]/255;im.data[((dim-1-Math.floor(i/4/dim))*dim+(i/4)%dim)*4+k]=Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));}im.data[i+3]=255;}g.putImageData(im,0,0);return c.toDataURL().split(',')[1];};
  for(const [name,Display]of Object.entries({pfd:PFD,nd:ND,upper:UpperDU,lower:LowerDU})){
   const display=new Display();display.draw(st);const texture=display.tex,currentMat=displayMaterial(texture),control=texture.clone();control.minFilter=T.LinearFilter;control.generateMipmaps=false;control.anisotropy=1;control.needsUpdate=true;
   for(const angle of [0,45])for(const size of [84,160,256,512]){
    mesh.rotation.y=angle*Math.PI/180;
    const dim=size+16,factor=2**Math.ceil(Math.log2(512/(size*Math.cos(angle*Math.PI/180))));
    const target=new T.WebGLRenderTarget(dim,dim),reference=new T.WebGLRenderTarget(dim*factor,dim*factor),pixels=new Uint8Array(dim*dim*4),refPixels=new Uint8Array(dim*dim*factor*factor*4);
    camera.left=-dim/2;camera.right=dim/2;camera.top=dim/2;camera.bottom=-dim/2;camera.updateProjectionMatrix();mesh.scale.set(size,size,1);
    const frames={control:[],current:[],reference:[]};
    for(let frame=0;frame<17;frame++){
     mesh.position.set(frame/8,.17,0);
     for(const [kind,tex]of [['control',control],['current',texture]]){
      mesh.material=kind==='current'?currentMat:mat;mat.map=tex;mat.needsUpdate=true;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,dim,dim,pixels);
      frames[kind].push(new Uint8Array(pixels));
      if(frame===8&&size===160&&angle===0)images.push({name,kind,dim,png:shot(pixels,dim)});
     }
     mesh.material=mat;mat.map=control;renderer.setRenderTarget(reference);renderer.render(scene,camera);renderer.readRenderTargetPixels(reference,0,0,dim*factor,dim*factor,refPixels);
     const avg=new Float32Array(pixels.length);
     for(let y=0;y<dim;y++)for(let x=0;x<dim;x++)for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++){
      const src=((y*factor+dy)*dim*factor+x*factor+dx)*4,dst=(y*dim+x)*4;
      for(let k=0;k<3;k++)avg[dst+k]+=refPixels[src+k]/(factor*factor);
     }
     frames.reference.push(avg);if(frame===8&&size===160&&angle===0)images.push({name,kind:'reference',dim,png:shot(avg,dim)});
    }
    const metric=kind=>{
     let error=0,crawl=0,n=0,m=0;
     for(let f=0;f<frames[kind].length;f++)for(let i=0;i<pixels.length;i++)if(i%4!==3){
      error+=Math.abs(frames[kind][f][i]-frames.reference[f][i]);n++;
      if(f){crawl+=Math.abs((frames[kind][f][i]-frames[kind][f-1][i])-(frames.reference[f][i]-frames.reference[f-1][i]));m++;}
     }
     return {referenceError:error/n,motionResidual:crawl/m};
    };
    reports.push({name,size,angle,factor,control:metric('control'),current:metric('current')});target.dispose();reference.dispose();
   }
   texture.dispose();control.dispose();currentMat.dispose();
  }
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
  renderer.dispose();return {reports,images,gpu};
 });
 for(const {name,kind,png}of result.images)await fs.writeFile(`test/output/${label}-${name}-${kind}.png`,Buffer.from(png,'base64'));
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify({date:new Date().toISOString(),browser:browser.version(),gpu:result.gpu,method:'Frozen actual PFD/ND/engine/systems textures; 17 subpixel positions, four sizes and two angles. Linear-filter control and current material compared with supersampled box reference in linear light.',reports:result.reports,errors},null,2)+'\n');
 console.log(result.reports.map(r=>`${r.name} ${r.size}px / ${r.angle}°: error ${r.control.referenceError.toFixed(3)} → ${r.current.referenceError.toFixed(3)}, motion residual ${r.control.motionResidual.toFixed(3)} → ${r.current.motionResidual.toFixed(3)}`).join('\n'));assert.deepEqual(errors,[]);
 for(const r of result.reports){
  if(r.size<=256){assert.ok(r.current.referenceError<r.control.referenceError*.85,`${r.name} ${r.size}: minification matches the supersampled reference`);assert.ok(r.current.motionResidual<r.control.motionResidual*.7,`${r.name} ${r.size}: reduced sampling crawl`);}
  if(r.size===512&&r.angle===0)assert.ok(r.current.referenceError<=r.control.referenceError+.01,`${r.name}: full-size detail is preserved`);
 }
}finally{await browser.close();server.close();}
