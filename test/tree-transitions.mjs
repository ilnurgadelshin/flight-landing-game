// Isolated delivered-geometry/card comparisons plus a deterministic moving approach.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'trees-current').replace(/[^a-z0-9_-]/gi,'-');
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
 ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});await completeScenery(page);
 const report=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
  s.start({startId:'short',scenarioId:'clear',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
  w.update(0,{...s.state(),alt:10},new T.Vector3(0,10,100));
  const atlas=await(await fetch('/assets/scenery/tree-variety.json')).json(),base=w.woodland.children.find(m=>m.material===w.woodlandMaterial);
  const renderer=w.renderer,target=new T.WebGLRenderTarget(384,384,{samples:4}),previous=renderer.getRenderTarget();
  const clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
  const scene=new T.Scene();scene.environment=w.scene.environment;
  for(const child of w.scene.children)if(child.isLight)scene.add(child.clone());
  const camera=new T.OrthographicCamera(-22,22,22,-22,.1,500);camera.position.set(0,10,100);camera.lookAt(0,10,0);camera.updateMatrixWorld();
  const pixels=new Uint8Array(384*384*4),results=[];
  const capture=()=>{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,384,384,pixels);return pixels.slice();};
  const png=bytes=>{const c=document.createElement('canvas');c.width=c.height=384;const flipped=new Uint8ClampedArray(bytes.length);for(let y=0;y<384;y++)flipped.set(bytes.subarray(y*384*4,(y+1)*384*4),(383-y)*384*4);c.getContext('2d').putImageData(new ImageData(flipped,384,384),0,0);return c.toDataURL().split(',')[1];};
  try{
   for(const row of [0,4,7,8])for(const degrees of [0,22.5,45,67.5]){
    const angle=degrees*Math.PI/180,form=atlas.species[row],q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle);
    const g=base.geometry.clone();
    for(const [name,values,size] of [['treeUvOffset',[0,row],2],['treeYaw',[angle],1],['treeFrame',[form.frameScale,form.aspect],2],['treeDetailFade',[0],1]])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(values),size));
    const card=new T.InstancedMesh(g,w.woodlandMaterial,1);card.setMatrixAt(0,new T.Matrix4().compose(new T.Vector3(),q,new T.Vector3(form.aspect*20,20,form.aspect*20)));card.setColorAt(0,new T.Color(1,1,1));scene.add(card);
    const a=capture();scene.remove(card);g.dispose();
    const group=new T.Group();
    for(const source of w.nearWoodland.pools[row].meshes){
     const geometry=source.geometry.clone();geometry.setAttribute('treeDetailFade',new T.InstancedBufferAttribute(new Float32Array([1]),1));
     const mesh=new T.InstancedMesh(geometry,source.material,1);mesh.setMatrixAt(0,new T.Matrix4().compose(new T.Vector3(),q,new T.Vector3(20,20,20)));mesh.setColorAt(0,new T.Color(1,1,1));mesh.frustumCulled=false;group.add(mesh);
    }
    scene.add(group);const b=capture();scene.remove(group);group.children.forEach(m=>m.geometry.dispose());
    let intersection=0,union=0,cardArea=0,nearArea=0;
    for(let i=3;i<a.length;i+=4){const aa=a[i]>127,bb=b[i]>127;if(aa&&bb)intersection++;if(aa||bb)union++;if(aa)cardArea++;if(bb)nearArea++;}
    results.push({row,degrees,iou:intersection/union,cardArea,nearArea,card:png(a),near:png(b)});
   }
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();}
  const near=w.nearWoodland,frames=[],snapshots=[];let previousIds=new Set(),previousFades=new Map();
  const c=new T.PerspectiveCamera(50,1440/900,.1,60000);w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
  document.getElementById('hud').style.visibility='hidden';
  const stream=renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});
  const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  // A repeatable 420 m pass at 70 m/s, rendering every step to inspect real transitions.
  for(let frame=0;frame<360;frame++){
   await new Promise(requestAnimationFrame);
   c.position.set(3300-frame*70/60,38,700);c.lookAt(c.position.x-120,12,650);c.updateMatrixWorld();
   w.update(1/60,{...s.state(),alt:38},c.position);w.render();
   if([30,180,350].includes(frame))snapshots.push({frame,png:renderer.domElement.toDataURL().split(',')[1]});
   const ids=new Set([...near.active.values()].filter(t=>t.fade>.05).map(t=>t.t.id));
   const added=[...ids].filter(id=>!previousIds.has(id)).length,removed=[...previousIds].filter(id=>!ids.has(id)).length;
   const fades=new Map([...near.active.values()].map(t=>[t.t.id,t.fade]));let maxFadeDelta=0;
   for(const [id,value] of previousFades)maxFadeDelta=Math.max(maxFadeDelta,Math.abs(value-(fades.get(id)||0)));
   frames.push({frame,count:near.count,triangles:near.triangles,added,removed,maxFadeDelta,partial:[...near.active.values()].filter(t=>t.fade>.05&&t.fade<.95).length});previousIds=ids;previousFades=fades;
  }
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  return {silhouettes:results,moving:frames,video,snapshots};
 });
 for(const shot of report.snapshots)await fs.writeFile(`test/output/${label}-moving-${shot.frame}.png`,Buffer.from(shot.png,'base64'));delete report.snapshots;
 for(const r of report.silhouettes){for(const mode of ['card','near']){await fs.writeFile(`test/output/${label}-${r.row}-${r.degrees}-${mode}.png`,Buffer.from(r[mode],'base64'));delete r[mode];}}
 await fs.writeFile(`test/output/${label}-moving.webm`,Buffer.from(report.video,'base64'));delete report.video;
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
 if(!process.env.REVIEW_ROOT)assert.ok(report.moving.every(r=>r.maxFadeDelta<=1/60/.35+.00001),'Entering and retiring trees share the same bounded fade speed');
 if(!process.env.REVIEW_ROOT)assert.ok(report.silhouettes.reduce((n,r)=>n+r.iou,0)/report.silhouettes.length>.35,'Delivered geometry and canopy views retain matching silhouettes');
 assert.ok(report.silhouettes.every(r=>r.cardArea>200&&r.nearArea>200));
 assert.ok(report.moving.every(r=>r.count<=48&&r.triangles<=2400000));assert.deepEqual(errors,[]);
 console.log(report.silhouettes);console.log('Moving tree budget passed; replacements',report.moving.reduce((n,f)=>n+f.added+f.removed,0));
}finally{await browser.close();server.close();}
