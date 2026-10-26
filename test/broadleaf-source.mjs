// Offline asset-quality check against downloaded CC0 originals. Run after
// fetch-authored-scenery.py; source models stay ignored and are never delivered.
// CANOPY_BASELINE=/path/to/archive also records the preceding reduction.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const names=['jacaranda_tree','island_tree_02'];
for(const name of names)await fs.access(`test/output/authored-sources/${name}/source.gltf`);
const {server,url}=await startServer(process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 if(process.env.CANOPY_BASELINE)await page.route('**/canopy-baseline/*.glb',async route=>{
  const name=path.basename(new URL(route.request().url()).pathname);
  await route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(path.join(process.env.CANOPY_BASELINE,'assets/scenery',name))});
 });
 await page.goto(url+'/assets/credits.html');
 const report=await page.evaluate(async({names,baseline})=>{
  const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{three:'/vendor/three.module.js'}});document.head.append(map);
  const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js');
  const {MeshoptDecoder}=await import('/vendor/addons/libs/meshopt_decoder.module.js');
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setClearColor(0,0);
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x7a8070,2.2));const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(2,4,3);scene.add(sun);
  const camera=new T.OrthographicCamera(-.9,.9,.9,-.9,.1,20),pixels=new Uint8Array(512*512*4),result=[];
  for(const name of names)for(const mode of [...(baseline?['before']:[]),'after','source']){
   const folder=`/test/output/authored-sources/${name}`;
   const {scene:model}=await loader.loadAsync(mode==='source'?`${folder}/source.gltf`:mode==='before'?`/canopy-baseline/${name}-near.glb`:`/assets/scenery/${name}-near.glb`);
   const box=new T.Box3().setFromObject(model),height=box.max.y-box.min.y,center=box.getCenter(new T.Vector3());
   model.scale.multiplyScalar(1/height);model.position.set(-center.x/height,-box.min.y/height,-center.z/height);
   let triangles=0;
   const alpha=mode==='source'?await new T.TextureLoader().loadAsync(`${folder}/leaves-alpha.png`):null;if(alpha)alpha.flipY=false;
   model.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
     m.metalness=0;m.roughness=1;
     if(alpha&&/leaves/.test(m.name)){m.alphaMap=alpha;m.transparent=false;m.alphaTest=.4;m.side=T.DoubleSide;}
    }
   });scene.add(model);
   for(const elevation of [0,22.5,45])for(const azimuth of [0,22.5,45,67.5]){
    const pitch=elevation*Math.PI/180,yaw=azimuth*Math.PI/180;
    camera.position.set(4*Math.sin(yaw)*Math.cos(pitch),.5+4*Math.sin(pitch),4*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(0,.5,0);camera.updateMatrixWorld();
    renderer.render(scene,camera);renderer.getContext().readPixels(0,0,512,512,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);
    let area=0,border=0;for(let i=3;i<pixels.length;i+=4){area+=pixels[i]/255;const p=(i-3)/4,x=p%512,y=Math.floor(p/512);if(x<2||x>509||y<2||y>509)border+=pixels[i]/255;}
    result.push({name,mode,elevation,azimuth,triangles,area,border,...(elevation===22.5&&azimuth===22.5?{png:renderer.domElement.toDataURL().split(',')[1]}:{})});
   }
   scene.remove(model);const textures=new Set(),materials=new Set();
   model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
   for(const m of materials){for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();}for(const t of textures)t.dispose();
  }renderer.dispose();return result;
 },{names,baseline:!!process.env.CANOPY_BASELINE});
 for(const r of report)if(r.png){await fs.writeFile(`test/output/broadleaf-source-${r.name}-${r.mode}.png`,Buffer.from(r.png,'base64'));delete r.png;}
 const summary=names.map(name=>{
  const mean=mode=>{const rows=report.filter(r=>r.name===name&&r.mode===mode);return rows.length?rows.reduce((s,r)=>s+r.area,0)/rows.length:null};
  return {name,before:mean('before'),after:mean('after'),source:mean('source'),retained:mean('after')/mean('source')};
 });
 await fs.writeFile('test/output/broadleaf-source.json',JSON.stringify({summary,views:report,errors},null,2)+'\n');
 assert.deepEqual(errors,[]);assert.ok(report.every(r=>r.area>1000&&r.border===0),'Canopies stay framed with visible coverage');
 assert.ok(summary.every(r=>r.retained>.7&&r.retained<1.3),'Delivered crown retains at least 70% of source projected coverage without an opaque fill');
 console.log(summary);
}finally{await browser.close();server.close();}
