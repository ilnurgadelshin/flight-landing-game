// Matched canopy/cloud views and rendered regressions, using the real materials.
// REVIEW_ROOT can point at an archived revision for the before images.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'-');
const baseline=!!process.env.REVIEW_ROOT;
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/?quality=high');await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
  await completeScenery(page);
  const views=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
    s.start({startId:'short',seed:5});s.setTimeScale(0);s.setDrawing(false);s.game.state='menu';
    const atlas=await(await fetch('/assets/scenery/tree-variety.json')).json();
    const source=w.woodland.children.find(m=>m.material===w.woodlandMaterial);
    const geometry=source.geometry.clone();
    for(const [name,values,size] of [['treeUvOffset',[0,0],2],['treeYaw',[0],1],['treeFrame',[atlas.species[0].frameScale||1,atlas.species[0].aspect],2],['treeDetailFade',[0],1]])
      geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(values),size));
    const scene=new T.Scene(),tree=new T.InstancedMesh(geometry,w.woodlandMaterial,1);
    tree.setMatrixAt(0,new T.Matrix4().makeScale(atlas.species[0].aspect*20,20,atlas.species[0].aspect*20));
    tree.setColorAt(0,new T.Color(1,1,1));scene.add(tree);
    const camera=new T.OrthographicCamera(-18,18,18,-18,.1,200);
    const renderer=w.renderer,target=new T.WebGLRenderTarget(256,256),previous=renderer.getRenderTarget();
    const clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),result=[];
    try{
      renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=true;
      for(const angle of [0,45,89.99]){
        const a=angle*Math.PI/180;camera.position.set(0,10+80*Math.sin(a),80*Math.cos(a));
        camera.up.set(0,Math.cos(a),-Math.sin(a));camera.lookAt(0,10,0);
        renderer.render(scene,camera);
        const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
        let covered=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>127)covered++;
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const flipped=new Uint8ClampedArray(pixels.length);
        for(let y=0;y<256;y++)flipped.set(pixels.subarray(y*1024,(y+1)*1024),(255-y)*1024);
        canvas.getContext('2d').putImageData(new ImageData(flipped,256,256),0,0);
        result.push({angle,covered,png:canvas.toDataURL().split(',')[1]});
      }
    }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);geometry.dispose();target.dispose();}
    const near=w.nearWoodland,eye=new T.Vector3(2530,18,352);near.settle(eye);near.settle(eye);
    const versions=()=>near.pools.flatMap(p=>p.meshes.map(m=>[m.instanceMatrix.version,m.instanceColor?.version,m.geometry.attributes.treeDetailFade.version]));
    const before=JSON.stringify(versions());for(let i=0;i<60;i++)near.update(1/60,eye);
    return {views:result,stableBuffers:before===JSON.stringify(versions()),cloudCached:!!w.cumulus.material.defines.CACHED_DENSITY};
  });
  for(const view of views.views){await fs.writeFile(`test/output/${label}-canopy-${Math.round(view.angle)}.png`,Buffer.from(view.png,'base64'));delete view.png;}
  if(!baseline){
    assert.ok(views.views[0].covered>1000);
    assert.ok(views.views[2].covered>views.views[0].covered*.4,'Overhead crowns retain visible area instead of collapsing into an edge');
    assert.ok(views.stableBuffers,'Settled trees do not re-upload identical instance buffers');
    assert.ok(views.cloudCached,'Use the precomputed density volume');
  }
  console.log('Rendered canopy and buffer checks:',views);
  for(const shot of ['woodland','clouds','clouds-above','overcast']){
    await page.evaluate(async shot=>{
      const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world;
      s.start({startId:'short',scenarioId:shot==='overcast'?'crosswind':'clear',seed:5});s.setTimeScale(0);s.game.state='menu';
      const c=new T.PerspectiveCamera(50,1440/900,.1,60000);
      if(shot==='woodland'){c.position.set(2700,250,520);c.lookAt(2470,15,300);}
      else if(shot==='overcast'){c.position.set(3300,120,0);c.lookAt(-5000,900,0);}
      else {c.position.set(3300,shot==='clouds-above'?3900:115,0);c.lookAt(-5000,2000,-5500);}
      c.updateMatrixWorld();w.camera=c;if(w.composer)w.composer.passes[0].camera=c;w.drawCockpit=false;
      document.getElementById('hud').style.visibility='hidden';
      w.update(0,{...s.state(),alt:c.position.y},c.position);
      await w.groundDetail.settle(c.position);w.nearWoodland?.settle(c.position);w.render();
    },shot);
    await page.screenshot({path:`test/output/${label}-${shot}.png`});
  }
  if(!baseline){
    const disposal=await page.evaluate(()=>{
      const w=window.__sim.world,cloud=w.cumulus;let disposed=0;
      cloud.material.uniforms.uDensity.value.addEventListener('dispose',()=>disposed++);
      w.reduceQuality();return {disposed,removed:!w.cumulus&&!cloud.group.parent};
    });
    assert.deepEqual(disposal,{disposed:1,removed:true});
  }
  assert.deepEqual(errors,[]);await page.close();
  if(!baseline){
    const failure=await browser.newPage();failure.on('pageerror',e=>errors.push(e.message));
    failure.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await failure.route('**/weather/cumulus-density.bin.gz',r=>r.fulfill({body:'truncated',contentType:'application/octet-stream'}));
    await failure.goto(url+'/?quality=high');await failure.waitForFunction(()=>window.__sim,null,{timeout:120000});
    const fallback=await failure.evaluate(()=>{const s=window.__sim;s.setDrawing(false);s.drawNow();return {error:s.world.cumulus.loadError,cached:!!s.world.cumulus.material.defines.CACHED_DENSITY};});
    assert.match(fallback.error,/dimensions/);assert.equal(fallback.cached,false);
    await failure.unroute('**/weather/cumulus-density.bin.gz');
    await failure.addInitScript(()=>{window.DecompressionStream=undefined;});
    await failure.reload();await failure.waitForFunction(()=>window.__sim,null,{timeout:120000});
    assert.ok(await failure.evaluate(()=>{const s=window.__sim;s.setDrawing(false);s.drawNow();return !!s.world.cumulus.loadError&&!s.world.cumulus.material.defines.CACHED_DENSITY;}),'Missing decompressor retains analytic clouds');
    // Some hosts already decode Content-Encoding: gzip. That body must not be
    // decompressed twice, and also works without DecompressionStream.
    const decoded=gunzipSync(await fs.readFile('assets/weather/cumulus-density.bin.gz'));
    await failure.route('**/weather/cumulus-density.bin.gz',r=>r.fulfill({body:decoded,contentType:'application/octet-stream'}));
    await failure.reload();await failure.waitForFunction(()=>window.__sim,null,{timeout:120000});
    assert.ok(await failure.evaluate(()=>{const s=window.__sim;s.setDrawing(false);s.drawNow();return !!s.world.cumulus.material.defines.CACHED_DENSITY&&!s.world.cumulus.loadError;}),'Host-decoded volume loads directly');
    assert.deepEqual(errors,[]);await failure.close();console.log('Corrupt/missing decompressor fallbacks and host-decoded volume passed');
  }
}finally{await browser.close();server.close();}
