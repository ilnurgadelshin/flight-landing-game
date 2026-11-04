// Actual source glyphs and their filtered replacement, against a separately
// supersampled geometry reference. Flight/instrument data do not affect this probe.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'label-sampling';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/label-probe',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script><canvas></canvas>'}));
 await page.goto(url+'/label-probe');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js'),{MeshoptDecoder}=await import('/vendor/addons/libs/meshopt_decoder.module.js');
  const {loadForwardLabels,filterForwardLabels}=await import('/js/cockpit/labels.js'),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const {scene:model}=await loader.loadAsync('/assets/models/737-cockpit.glb');model.updateMatrixWorld(true);
  const originals=new Map();model.traverse(m=>{if(m.isMesh)originals.set(m.name,{geometry:m.geometry.clone(),matrix:m.matrixWorld.clone()});});
  const replacement=await loadForwardLabels(model,loader);if(!replacement)throw new Error('Labels failed to load');
  replacement.updateMatrixWorld(true);
  const oldScene=new T.Scene(),newScene=new T.Scene(),oldGroup=new T.Group(),newGroup=new T.Group();oldScene.add(oldGroup);newScene.add(newGroup);
  const white=new T.MeshBasicMaterial({color:0xffffff,toneMapped:false,side:T.DoubleSide});
  for(const label of replacement.children){
   const original=originals.get(T.PropertyBinding.sanitizeNodeName(label.userData.source)),g=original.geometry,keep=[];
   for(const [start,count]of label.userData.remove)for(let i=start;i<start+count;i++)keep.push(g.index.array[i]);
   g.setIndex(keep);const mesh=new T.Mesh(g,white);mesh.applyMatrix4(original.matrix);oldGroup.add(mesh);
   const n=new T.Mesh(label.geometry,new T.MeshBasicMaterial({color:0xffffff,map:label.material.map,transparent:true,depthWrite:false,toneMapped:false,side:T.DoubleSide}));
   n.applyMatrix4(label.matrixWorld);newGroup.add(n);
  }
  filterForwardLabels(newGroup);
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});renderer.outputColorSpace=T.LinearSRGBColorSpace;
  renderer.setClearColor(0);const camera=new T.OrthographicCamera(-1,1,1,-1,.01,10),reports=[];
  const span=.62,center=new T.Vector3(0,-.135,-.905),images=[];
  for(const samples of [0,4])for(const size of [256,512])for(const angle of [0,20]){
   const width=size+16,height=Math.round(size*.22)+16,scale=span/size;
   Object.assign(camera,{left:-width*scale/2,right:width*scale/2,top:height*scale/2,bottom:-height*scale/2});camera.updateProjectionMatrix();
   const offset=new T.Vector3(0,Math.sin(angle*Math.PI/180),Math.cos(angle*Math.PI/180));camera.position.copy(center).add(offset);camera.lookAt(center);
   const target=new T.WebGLRenderTarget(width,height,{samples}),reference=new T.WebGLRenderTarget(width*4,height*4);
   const pixels=new Uint8Array(width*height*4),rp=new Uint8Array(width*height*16*4),frames={before:[],after:[],reference:[]};
   for(let f=0;f<17;f++){
    oldGroup.position.x=newGroup.position.x=f/8*scale;
    for(const [name,scene]of [['before',oldScene],['after',newScene]]){
     renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);frames[name].push(new Uint8Array(pixels));
    }
    renderer.setRenderTarget(reference);renderer.render(oldScene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(reference,0,0,width*4,height*4,rp);
    const ref=new Float32Array(pixels.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)ref[(y*width+x)*4]+=rp[((y*4+dy)*width*4+x*4+dx)*4]/16;
    frames.reference.push(ref);
    if(f===8&&samples===0&&angle===0)for(const name of ['before','after','reference']){
     const c=document.createElement('canvas');c.width=width;c.height=height;const context=c.getContext('2d'),im=context.createImageData(width,height),data=frames[name].at(-1);
     for(let i=0;i<width*height;i++){const p=((height-1-Math.floor(i/width))*width+i%width)*4,v=data[i*4];im.data[p]=im.data[p+1]=im.data[p+2]=v;im.data[p+3]=255;}
     context.putImageData(im,0,0);images.push({name,size,png:c.toDataURL().split(',')[1]});
    }
   }
   const metric=kind=>{let error=0,motion=0,energy=0,refEnergy=0,n=0,m=0;
    for(let f=0;f<17;f++)for(let i=0;i<pixels.length;i+=4){const v=frames[kind][f][i],r=frames.reference[f][i];error+=Math.abs(v-r);energy+=v;refEnergy+=r;n++;
     if(f){motion+=Math.abs((v-frames[kind][f-1][i])-(r-frames.reference[f-1][i]));m++;}}
    return {referenceError:error/n,motionResidual:motion/m,coverageRatio:energy/refEnergy};};
   reports.push({samples,size,angle,before:metric('before'),after:metric('after')});target.dispose();reference.dispose();
  }
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {reports,images,gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),labels:model.userData.forwardLabels};
 });
 await fs.mkdir('test/output',{recursive:true});for(const {name,size,png}of result.images)await fs.writeFile(`test/output/${label}-${size}-${name}.png`,Buffer.from(png,'base64'));
 const {images,...report}=result;await fs.writeFile(`test/output/${label}.json`,JSON.stringify({...report,errors},null,2)+'\n');
 console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
 for(const r of report.reports.filter(r=>r.samples===0)){
  assert.ok(r.after.referenceError<r.before.referenceError*.65,'Filtered phone marks match the supersampled source more closely');
  assert.ok(r.after.motionResidual<r.before.motionResidual*.45,'Filtered phone marks reduce sampling crawl');
  assert.ok(r.after.coverageRatio>.88&&r.after.coverageRatio<1.06,'Preserve source coverage instead of hiding shimmer by erasing labels');
 }
}finally{await browser.close();server.close();}
