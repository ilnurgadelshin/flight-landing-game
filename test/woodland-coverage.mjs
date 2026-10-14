// Retain filtered leaf coverage at distance and between atlas views, on both tiers.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'woodland-coverage').replace(/[^a-z0-9_-]/gi,'-');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
const reports=[];
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
  const result=await page.evaluate(async tier=>{
   const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;s.setDrawing(false);s.game.state='menu';
   const atlas=await(await fetch('/assets/scenery/tree-variety.json')).json(),base=w.woodland.children.find(m=>m.material===w.woodlandMaterial),mat=w.woodlandMaterial;
   const renderer=w.renderer,target=new T.WebGLRenderTarget(256,256,{samples:tier==='high'?4:0}),previous=renderer.getRenderTarget();
   const clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),cutoff=mat.alphaTest;
   const scene=new T.Scene(),camera=new T.OrthographicCamera(),samples=[],pixels=new Uint8Array(256*256*4);
   const grab=threshold=>{mat.alphaTest=threshold;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);let area=0,border=0;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=pixels[(y*256+x)*4+3]/255;area+=a;if(x<2||x>253||y<2||y>253)border+=a;}return {area,border};};
   try{
    for(const row of [0,7,8])for(const yaw of [0,22.5])for(const elevation of [0,22.5,45])for(const size of [128,64,24]){
     const form=atlas.species[row],g=base.geometry.clone(),r=yaw*Math.PI/180;
     for(const [name,values,n] of [['treeUvOffset',[0,row],2],['treeYaw',[r],1],['treeFrame',[form.frameScale,form.aspect],2],['treeDetailFade',[0],1]])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(values),n));
     const tree=new T.InstancedMesh(g,mat,1);tree.setMatrixAt(0,new T.Matrix4().makeScale(form.aspect*20,20,form.aspect*20));tree.setColorAt(0,new T.Color(1,1,1));tree.frustumCulled=false;scene.add(tree);
     const extent=256*10/size,a=elevation*Math.PI/180;camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.near=.1;camera.far=500;camera.updateProjectionMatrix();camera.position.set(0,10+100*Math.sin(a),100*Math.cos(a));camera.up.set(0,Math.cos(a),-Math.sin(a));camera.lookAt(0,10,0);camera.updateMatrixWorld();
     const before=grab(.28),after=grab(cutoff);samples.push({row,yaw,elevation,size,before,after});scene.remove(tree);g.dispose();
    }
   }finally{mat.alphaTest=cutoff;renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();}
   return {tier,samples};
  },tier);
  const minified=result.samples.filter(s=>s.size<128);
  const before=minified.reduce((n,s)=>n+s.before.area,0),after=minified.reduce((n,s)=>n+s.after.area,0);
  result.coverageRatio=after/before;
  assert.ok(result.samples.every(s=>s.after.area>=s.before.area*.99&&s.after.area>1),'No crown vanishes or loses coverage at an intermediate view');
  assert.ok(result.samples.every(s=>s.after.border===0),'Empty frame border stays transparent');
  assert.ok(result.samples.filter(s=>s.size===128).every(s=>Math.abs(s.after.area/s.before.area-1)<.01),'Large crowns preserve the original near-transition outline');
  assert.ok(result.coverageRatio>1.1&&result.coverageRatio<2.5,'Retain fine foliage without filling the entire tree frame');
  assert.deepEqual(errors,[]);reports.push(result);console.log(tier,{coverageRatio:result.coverageRatio,cases:result.samples.length});await page.close();
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();server.close();}
