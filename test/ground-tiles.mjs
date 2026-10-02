// Ground detail tiles during a flight: a new tile is copied to the graphics card in strips under a
// per-frame budget, the tiles on screen stay until the new set is complete, the cache stays at four,
// and the copy holds exactly the image's pixels (row 0 = the north edge). Both tiers.
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {completeScenery} from './scene-ready.mjs';
import assert from 'node:assert/strict';
const {server,url}=await startServer(process.cwd()),angle=process.env.VISUAL_GPU||'swiftshader';
const browser=await chromium.launch({headless:true,args:[`--use-angle=${angle}`,
  ...(angle==='swiftshader'?['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[])]});
try{
  for(const tier of ['high','low']){
    const page=await browser.newPage({viewport:{width:320,height:200}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
    await page.goto(url+'/?quality='+tier);await page.waitForFunction(()=>window.__sim,null,{timeout:120000});
    await completeScenery(page);
    const r=await page.evaluate(async()=>{
      const T=await import('/vendor/three.module.js'),s=window.__sim,w=s.world,d=w.groundDetail,R=w.renderer;
      const slots=()=>[0,1,2,3].map(i=>w.groundUniforms[`uDetail${i}`].value);
      const settled=slots(),size=settled[0].image.width;
      // Fly toward the threshold, one simulated frame at a time, counting the strip copies.
      const copy=R.copyTextureToTexture.bind(R);let copies=0,frameCopies=0,maxCopies=0,maxMs=0,early=false;
      R.copyTextureToTexture=(...a)=>{copies++;frameCopies++;return copy(...a);};
      let frames=0,changedAt=null;
      for(let x=8500;x>=5000&&frames<4000;x-=3){
        frameCopies=0;const t0=performance.now();d.update(new T.Vector3(x,200,0));
        maxMs=Math.max(maxMs,performance.now()-t0);maxCopies=Math.max(maxCopies,frameCopies);frames++;
        // until the new set is complete, the four tiles on screen are the settled ones
        const now=slots();
        if(changedAt===null&&now.some((t,i)=>t!==settled[i])){changedAt=frames;early=d.uploading>0;}
        if(frames%20===0)await new Promise(done=>setTimeout(done,0));   // decodes finish between frames
      }
      while(d.uploading){d.update(new T.Vector3(5000,200,0));await new Promise(done=>setTimeout(done,0));}
      await d.ready;
      R.copyTextureToTexture=copy;
      // The resident copy against the image itself, decoded by a 2D canvas: first and last rows.
      const [id,entry]=[...d.cache].find(([,e])=>e.texture);
      const low=w.quality==='low';
      const blob=await(await fetch(`/assets/scenery/detail/${id}${low?'-low':''}.webp`)).blob();
      const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,0,0);
      const target=new T.WebGLRenderTarget(bitmap.width,bitmap.height,{depthBuffer:false});
      // copy level 0 of the tile into a plain target to read it back
      const quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:{map:{value:entry.texture}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        // the tile is sRGB: sampling returns linear values, so encode them back for the comparison
        fragmentShader:`uniform sampler2D map;varying vec2 vUv;
          vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
          void main(){gl_FragColor=vec4(srgb(textureLod(map,vUv,0.).rgb),1.);}`}));
      const scene=new T.Scene();scene.add(quad);const prev=R.getRenderTarget(),tone=R.toneMapping;
      R.setRenderTarget(target);R.render(scene,new T.Camera());R.setRenderTarget(prev);
      let worst=0;
      for(const row of [0,bitmap.height-1]){
        const gpu=new Uint8Array(bitmap.width*4);R.readRenderTargetPixels(target,0,row,bitmap.width,1,gpu);
        const cpu=g.getImageData(0,row,bitmap.width,1).data;
        for(let i=0;i<gpu.length;i++)if(i%4!==3)worst=Math.max(worst,Math.abs(gpu[i]-cpu[i]));
      }
      target.dispose();quad.geometry.dispose();quad.material.dispose();
      return {size,frames,copies,maxCopies,maxMs:+maxMs.toFixed(1),changedAt,early,cache:d.cache.size,errors:[...d.errors],worst,
        resident:[...d.cache.values()].map(e=>e.texture?.image.width)};
    });
    console.log(tier,JSON.stringify(r));
    assert.equal(r.size,tier==='high'?2064:1032);
    assert.ok(r.copies>=16,'Each new tile arrives in strips');
    assert.equal(r.maxCopies,1,'One strip a frame during a flight');
    assert.ok(r.changedAt!==null&&!r.early,'The settled tiles stay on screen until the new set is complete');
    assert.equal(r.cache,4);assert.deepEqual(r.resident,Array(4).fill(r.size));assert.deepEqual(r.errors,[]);
    assert.ok(r.worst<=2,`The resident copy holds the image's pixels, north edge first (difference ${r.worst})`);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Strip uploads, kept tiles until complete, a bounded cache and exact pixels on both tiers passed');
}finally{await browser.close();server.close();}
