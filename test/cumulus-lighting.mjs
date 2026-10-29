// Exercise actual cloud integration independently of sky/terrain image brightness.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const angle=process.env.VISUAL_GPU||'swiftshader',label=(process.argv[2]||'cumulus-lighting').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.cwd());
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 // Load the production cloud/atmosphere modules without the unrelated flight
 // deck, reflection capture and scenery. Full-game captures are a separate test.
 await page.route('**/cumulus-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>'}));
 await page.goto(url+'/cumulus-test.html');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{Cumulus}=await import('/js/world/clouds.js'),{Atmosphere}=await import('/js/world/sky.js');
  const r=new T.WebGLRenderer({logarithmicDepthBuffer:true});r.setSize(128,128);r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;
  const cloud=new Cumulus(new T.Scene(),new Atmosphere());await cloud.ready;
  const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),gpu=gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
  const u=cloud.material.uniforms,scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,20000),target=new T.WebGLRenderTarget(128,128);
  const previous=r.getRenderTarget(),clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha(),autoClear=r.autoClear;
  const images=[],stats=[],read=()=>{const pixels=new Uint8Array(128*128*4);r.readRenderTargetPixels(target,0,0,128,128,pixels);return pixels;};
  const summarize=p=>{let coverage=0,sum=0,opaque=0,max=0;for(let i=0;i<p.length;i+=4){if(p[i+3]>127){coverage++;sum+=(p[i]+p[i+1]+p[i+2])/3;max=Math.max(max,p[i],p[i+1],p[i+2]);}if(p[i+3]>250)opaque++;}return {coverage,mean:sum/Math.max(1,coverage),opaque,max};};
  try{
   r.setRenderTarget(target);r.setClearColor(0,0);r.autoClear=true;
   cloud.configure({id:'clear'},false,new T.Vector3(-.6,.7,.4),new T.Color(1,1,1));u.uFog.value=0;
   for(let variant=0;variant<6;variant++){
    const original=cloud.group.children[variant],mesh=original.clone();mesh.onBeforeRender=(...args)=>{original.onBeforeRender(...args);u.uEye.value.copy(camera.position).divide(mesh.scale);u.uScale.value.copy(mesh.scale);u.uRotation.value.identity();u.uSun.value.copy(cloud.sunDirection);};
    mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(3000,2300,2600);scene.add(mesh);
    camera.position.set(0,450,5000);camera.lookAt(0,0,0);r.render(scene,camera);
    const day=read();images.push(day);const item={variant,day:summarize(day)};
    cloud.configure({id:'clear'},false,new T.Vector3(.6,.7,-.4),new T.Color(1,1,1));r.render(scene,camera);
    const reverse=read();let delta=0;for(let i=0;i<day.length;i+=4)for(let c=0;c<3;c++)delta+=Math.abs(day[i+c]-reverse[i+c]);item.lightDelta=delta/(128*128*3);
    cloud.configure({id:'clear'},true,new T.Vector3(-.6,.7,.4),new T.Color(.6,.7,1));r.render(scene,camera);item.night=summarize(read());
    cloud.configure({id:'clear'},false,new T.Vector3(-.6,.7,.4),new T.Color(1,1,1));
    camera.position.set(0,-230,0);camera.lookAt(0,-230,-2000);r.render(scene,camera);item.inside=summarize(read());
    stats.push(item);scene.remove(mesh);
   }
   const difference=[];for(let a=0;a<images.length;a++)for(let b=a+1;b<images.length;b++){
    let delta=0;for(let i=3;i<images[a].length;i+=4)delta+=Math.abs(images[a][i]-images[b][i]);difference.push(delta/(128*128));
   }
   return {gpu,stats,minSilhouetteDelta:Math.min(...difference),cached:!!cloud.material.defines.CACHED_DENSITY,error:cloud.loadError||null};
  }finally{r.setRenderTarget(previous);r.setClearColor(clear,alpha);r.autoClear=autoClear;target.dispose();cloud.dispose();r.dispose();}
 });
 if(angle==='swiftshader')assert.match(result.gpu,/SwiftShader/i,'Software renderer is actually in use');
 assert.equal(result.cached,true);assert.equal(result.error,null);
 for(const v of result.stats){assert.ok(v.day.coverage>300&&v.day.coverage<12000,'Bounded visible cloud '+v.variant);assert.ok(v.day.mean>40,'Day cloud lit');assert.ok(v.night.mean<v.day.mean*.65,'Moonlit cloud darker');assert.ok(v.lightDelta>.25,'Billows respond to sun direction');assert.ok(v.inside.coverage>1000&&v.inside.mean>30,'Interior renders without black/missing pixels');}
 assert.ok(result.minSilhouetteDelta>1,'Distinct visible silhouettes');assert.deepEqual(errors,[]);
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));await page.close();
}finally{await browser.close();server.close();}
