// Isolate actual planting CPU work from shader warm-up and rendering. Route-only
// instrumentation also measures archived builds without production test hooks.
import {launchBrowser,scaledTimeout} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.argv[2]||'woodland-preparation',baseline=!!process.env.REVIEW_ROOT;
const angle=process.env.VISUAL_GPU||'swiftshader';
const {server,url}=await startServer(process.env.REVIEW_ROOT||process.cwd());
const browser=await launchBrowser();
const report=[];await fs.mkdir('test/output',{recursive:true});
try{
 for(const tier of ['high','low']){
  const page=await browser.newPage({viewport:{width:1024,height:576}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/js/world/woodland.js',async route=>{
   const response=await route.fetch();let source=await response.text();
   const marker="  treeFadeShader(material,false);";
   assert.ok(source.includes(marker));
   source=source.replace('export async function addWoodland(', 'async function prepareWoodland(')
    .replace(marker,"  window.__plantingStart=performance.now();\n"+marker);
   source+='\nexport async function addWoodland(...args){try{return await prepareWoodland(...args);}finally{window.__plantingEnd=performance.now();}}\n';
   await route.fulfill({response,body:source});
  });
  await page.route('**/js/world/approach-corridor.js',async route=>{
   const response=await route.fetch();let source=await response.text();
   source=source.replace('async function retainEditedImage(canvas){','async function retainEditedImageImpl(canvas){');
   source+='\nasync function retainEditedImage(canvas){const start=performance.now();const image=await retainEditedImageImpl(canvas);window.__coverSnapshot={width:canvas.width,height:canvas.height,elapsedMs:performance.now()-start};return image;}\n';
   await route.fulfill({response,body:source});
  });
  await page.addInitScript(()=>{
   window.__plantingTicks=[];
   window.__plantingTimer=setInterval(()=>{if(window.__plantingStart&&!window.__plantingEnd)window.__plantingTicks.push(performance.now());},8);
   window.addEventListener('sim-ready',()=>{
    window.__sim.setDrawing(false);window.__sim.world.warmUp=async()=>{};
   },{once:true});
  });
  await page.goto(url+'/?quality='+tier);
  await page.waitForFunction(()=>window.__plantingEnd,null,{timeout:scaledTimeout(180000)});
  const result=await page.evaluate(()=>{
   clearInterval(window.__plantingTimer);
   const w=window.__sim.world,times=[window.__plantingStart,...window.__plantingTicks,window.__plantingEnd];
   let maxGapMs=0;for(let i=1;i<times.length;i++)maxGapMs=Math.max(maxGapMs,times[i]-times[i-1]);
   let hash=2166136261,trees=0;
   const add=array=>{for(const v of new Uint8Array(array.buffer,array.byteOffset,array.byteLength)){hash^=v;hash=Math.imul(hash,16777619);}};
   for(const mesh of w.woodland.children){trees+=mesh.count;add(mesh.instanceMatrix.array);add(mesh.instanceColor.array);}
   for(const mesh of w.woodlandShadows.group.children){add(mesh.geometry.attributes.position.array);add(mesh.geometry.attributes.uv.array);add(mesh.geometry.index.array);}
   return {elapsedMs:times.at(-1)-times[0],inputTicks:window.__plantingTicks.length,maxGapMs,
    slices:w.woodlandPreparation,trees,geometryHash:(hash>>>0).toString(16),zones:w.approachCorridor.zoneCounts,
    snapshotKind:w.approachCorridor.texture.image.constructor.name,snapshot:window.__coverSnapshot,errors:w.assetErrors};
  });
  console.log(tier,JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(result.errors,[]);
  assert.equal(result.trees,tier==='high'?70000:14000);
  if(!baseline){
   assert.ok(result.inputTicks>=5,'Menu/input tasks run during planting');
   assert.ok(result.slices.yields>=5,'Planting yields real tasks');
   assert.ok(result.slices.maxWorkMs<result.elapsedMs/2,`No single slice dominates preparation: ${result.slices.maxWorkMs} ms`);
  }
  report.push({tier,...result});await page.close();
 }
 if(process.env.PREPARATION_COMPARE){
  const before=JSON.parse(await fs.readFile(process.env.PREPARATION_COMPARE,'utf8'));
  for(const result of report){const prior=before.find(r=>r.tier===result.tier);
   assert.equal(result.geometryHash,prior.geometryHash,'Yielding preserves every tree transform, tint and shade vertex');
   assert.deepEqual(result.zones,prior.zones,'Density remains unchanged');
  }
 }
 await fs.writeFile(`test/output/${label}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.close();}
