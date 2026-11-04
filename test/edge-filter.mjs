// Small software-renderer check for colour preservation, projected live displays,
// resizing and resource release. Full pilot-view reference comparisons live in
// landing-edge.mjs and intentionally load the complete scenery.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/edge-probe',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script><canvas></canvas>'}));await page.goto(url+'/edge-probe');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{EdgeFilter}=await import('/js/world/edge-filter.js');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});renderer.setClearColor(0x547f9a);
  const gl=renderer.getContext(),scene=new T.Scene(),camera=new T.PerspectiveCamera(55,4/3,.1,100);camera.position.z=3;
  const frame=new T.Mesh(new T.PlaneGeometry(2.5,1.4),new T.MeshBasicMaterial({color:0x292d2f}));frame.rotation.z=.18;scene.add(frame);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#161d24';ctx.fillRect(0,0,64,64);ctx.fillStyle='#ffb028';ctx.font='18px monospace';ctx.fillText('147',6,32);ctx.fillStyle='white';ctx.fillRect(4,45,55,2);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const screen=new T.Mesh(new T.PlaneGeometry(1,.7),new T.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.z=.01;scene.add(screen);
  const hidden=new T.Group();hidden.visible=false;scene.add(hidden);for(let i=0;i<20;i++)hidden.add(screen.clone());
  const filter=new EdgeFilter();filter.protectDisplays(scene);const results=[];
  for(const [width,height,angle]of [[128,96,0],[193,111,.4],[97,151,-.3],[128,96,0]]){
   renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();screen.rotation.y=angle;renderer.render(scene,camera);
   const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before);
   filter.render(renderer,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after);
   let maxDisplayDifference=0,samples=0,changed=0;
   for(const x of [-.35,-.2,0,.2,.35])for(const y of [-.25,-.1,.1,.25]){
    const p=new T.Vector3(x,y,0).applyMatrix4(screen.matrixWorld).project(camera),px=Math.floor((p.x*.5+.5)*width),py=Math.floor((p.y*.5+.5)*height),i=(py*width+px)*4;
    for(let c=0;c<3;c++)maxDisplayDifference=Math.max(maxDisplayDifference,Math.abs(before[i+c]-after[i+c]));samples++;
   }
   for(let i=0;i<after.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>3)changed++;
   results.push({width,height,angle,samples,maxDisplayDifference,changed,corner:Array.from(after.slice(0,4)),beforeCorner:Array.from(before.slice(0,4)),textures:renderer.info.memory.textures});
  }
  const count=renderer.info.memory.textures;filter.dispose();const released=count-renderer.info.memory.textures;
  return {results,released,protectedDisplays:filter.displays.length,error:gl.getError()};
 });
 assert.deepEqual(errors,[]);assert.equal(result.error,0);assert.equal(result.released,1);assert.equal(result.protectedDisplays,1,'Hidden fallback screens must not consume projection slots');
 for(const r of result.results){assert.ok(r.maxDisplayDifference<=1);assert.ok(r.changed>10);assert.deepEqual(r.corner,r.beforeCorner);assert.equal(r.textures,2,'Resize replaces the framebuffer copy, not leaks it');}
 await fs.writeFile('test/output/edge-filter-check.json',JSON.stringify({...result,errors},null,2)+'\n');console.log('Edge filter: protected displays, flat colours, resize and disposal passed.');
}finally{await browser.close();server.close();}
