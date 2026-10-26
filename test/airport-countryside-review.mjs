// Assemble the matched game captures and measured costs; --verify checks the
// actual review controls, all image loads, slider direction and phone layout.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
const choices=[
 ['captain-4000','Captain · short final','Normal forward view on short final. The airfield flanks connect with the closer approach woodland.'],
 ['captain-3000','Captain · threshold ahead','Fields remain open while wooded parcels gain depth on either side of the airport.'],
 ['captain-2200','Captain · flare approach','A closer pilot view checks that scenery leaves the runway and approach lights clear.'],
 ['airport-country-north','Northern countryside','Separate pasture and harvested parcels, a wooded ridge and open farmyards follow the bundled aerial imagery. The woodland thins beside the fictional airfield earthworks.'],
 ['airport-country-south','Southern countryside','The road valley and farm clearings remain open, with woodland extending toward the completed approach.'],
 ['airport-overcast','Below overcast','A matched view 100 m below cloud base checks the countryside under diffuse lighting.'],
 ['airport-night','Night','The same landscape at night; this pass adds no lights.'],
];
const read=file=>fs.readFile('test/output/'+file,'utf8').then(JSON.parse);
const [before,after,metrics]=await Promise.all(['render-benchmark-airport-countryside-before.json','render-benchmark-airport-countryside-after.json','airport-countryside-metrics.json'].map(read));
const rows=after.results.map(r=>{
 const b=before.results.find(b=>b.tier===r.tier&&b.scene===r.scene);
 return `<tr>${[r.tier+' / '+r.scene,b.fps.toFixed(1),r.fps.toFixed(1),r.p95FrameMs.toFixed(1),b.medianDrawCalls+' → '+r.medianDrawCalls].map(t=>`<td>${t}</td>`).join('')}</tr>`;
}).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airport countryside · scenery review</title><style>
:root{color-scheme:dark;font:16px/1.55 system-ui;background:#111a22;color:#e3edf4}*{box-sizing:border-box}body{margin:0}main{max-width:1488px;margin:auto;padding:24px}h1{font-size:clamp(26px,3.2vw,42px);line-height:1.2}p{max-width:1020px;color:#bdccd7}a{color:#9cd4f2}button,select{font:inherit;padding:9px 13px;border:1px solid #506f82;border-radius:7px;background:#213643;color:inherit}button{cursor:pointer}button[aria-pressed=true]{background:#355c71;border-color:#8ac6e9}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #f1c57a;outline-offset:3px}.controls{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0}.labels{display:flex;justify-content:space-between;gap:15px;font-weight:650}.labels span:last-child{text-align:right}.compare{position:relative;aspect-ratio:8/5;background:#162934;margin:8px 0}.compare img{position:absolute;width:100%;height:100%;object-fit:contain}#before{clip-path:inset(0 50% 0 0)}#divider{position:absolute;left:50%;height:100%;width:2px;background:white}.slider{display:flex;gap:14px;margin:16px 0}.slider input{flex:1;min-width:0}.note{border-left:3px solid #84b7d4;padding-left:15px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;text-align:left;border-bottom:1px solid #354854;white-space:nowrap}.scroll{overflow:auto}.videos{display:grid;grid-template-columns:1fr 1fr;gap:16px}video{width:100%}#description{min-height:3em}footer{margin:30px 0;color:#adbdca}@media(max-width:600px){main{padding:14px}.labels{font-size:12px}.videos{grid-template-columns:1fr}button,select{font-size:14px;padding:8px}#description{min-height:5em}}
</style><main><h1>Connecting the airport countryside</h1>
<p>Fields, wooded margins and farm clearings now connect the airfield flanks to the completed approach scenery. This pass adds about ${metrics.netTotalHectares.toFixed(0)} hectares of weighted cover after accounting for overlaps. It uses the existing public-domain aerial imagery and tree assets.</p>
<div class="controls" id="views" aria-label="Review view"></div>
<div class="controls"><label for="tier">Quality</label><select id="tier"><option value="high">High</option><option value="low">Low</option></select><button id="onlyBefore">Show before</button><button id="split">Compare</button><button id="onlyAfter">Show after</button></div>
<p id="description" aria-live="polite"></p><div class="labels"><span>Before · main 8f492ad</span><span>After · airport countryside</span></div>
<div class="compare"><img id="after" alt=""><img id="before" alt=""><div id="divider" aria-hidden="true"></div></div>
<div class="slider"><label for="slider">Compare</label><input id="slider" type="range" min="0" max="100" value="50" aria-label="Before image coverage"></div>
<p>Left is <b>before</b>; right is <b>after</b>. Use the buttons for full-frame views. <a id="beforeLink">Open before image</a> · <a id="afterLink">Open after image</a></p>
<p class="note">High quality receives the new map and 4000 additional trees. All seven low-tier comparison views remain pixel-identical. The previous five land-cover maps are unchanged. Tree crowns remain simplified, while many houses and distant fields still rely on basic geometry or photography. This is a bounded countryside pass, not a complete regional scenery replacement.</p>
<details><summary>Measured cost and validation</summary>
<p>High has 70,000 trees; low keeps 14,000. Previous planting allocations and seeds remain; trees near the new overlap and in the background can move. The same cover drives CPU planting and the terrain shader, checked at 31 points. Field, road, building and protected-airfield clearance checks pass. Missing or invalid airport data retains the previous approach maps and photographic airport ground.</p>
<p>The optional map/manifest adds ${metrics.transferDelta.toLocaleString('en-US')} bytes on high only. Its 640 × 768 texture uses 1.97 MB RGBA8, plus about 0.98 MB of packed CPU coverage and a small table for mixed pixels. The previous atlas stays 3450 × 1277 high / 2048 × 603 low. There is one additional sampler, read only in the new rectangle; the 180 m overlap also reads the previous map. No new photograph, model or terrain draw pass is added. Trees and their shade still cost geometry and rendering work.</p>
<p>Apple M2 Pro, Chromium ANGLE Metal, 1440 × 900, high 1.5× / low 1×. Four-second warm-up and twelve-second samples, paused physics. One low captain sample dipped to 57.7 FPS; its repeat returned 60.0 without code changes. Both measurements are retained. These short samples are not a guarantee for other machines. Physical phones, other GPUs, SwiftShader and the full functional flight suite were not rerun.</p>
<div class="scroll"><table><thead><tr><th>Tier / scene</th><th>Before FPS</th><th>After FPS</th><th>After p95 ms</th><th>Draw calls</th></tr></thead><tbody>${rows}</tbody></table></div></details>
<h2>Normal pilot descent</h2><p>Matched 480-frame descent from x=3600 to 3001.25 m, high at 1×. Video encoding affects pacing; these clips are visual evidence, not FPS measurements.</p>
<div class="videos"><div>Before<video controls preload="metadata" src="airport-countryside-motion-before.webm"></video></div><div>After<video controls preload="metadata" src="airport-countryside-motion-after.webm"></video></div></div>
<footer>2026-10-26 · Matched camera, weather seed and 1× capture resolution. <a href="../VISUAL-AUDIT.md">Visual audit</a> · <a href="../RENDER-PERFORMANCE.md">Performance log</a>.</footer></main>
<script>
const choices=${JSON.stringify(choices)},byId=id=>document.getElementById(id);let selected=choices[0][0];
for(const [id,label] of choices){const b=document.createElement('button');b.textContent=label;b.dataset.view=id;b.onclick=()=>{selected=id;refresh()};byId('views').append(b)}
function refresh(){const tier=byId('tier').value,[,label,description]=choices.find(c=>c[0]===selected);byId('description').textContent=description;for(const b of byId('views').children)b.setAttribute('aria-pressed',String(b.dataset.view===selected));for(const side of ['before','after']){const url='airport-countryside-'+side+'-'+tier+'-'+selected+'.png';byId(side).src=url;byId(side).alt=label+', '+tier+' quality, '+side;byId(side+'Link').href=url}}
function setSplit(v){byId('slider').value=v;byId('before').style.clipPath='inset(0 '+(100-v)+'% 0 0)';byId('divider').style.left=v+'%';byId('divider').hidden=v===0||v===100;byId('slider').setAttribute('aria-valuetext',v+'% before, '+(100-v)+'% after')}
byId('tier').onchange=refresh;byId('slider').oninput=e=>setSplit(Number(e.target.value));byId('onlyBefore').onclick=()=>setSplit(100);byId('onlyAfter').onclick=()=>setSplit(0);byId('split').onclick=()=>setSplit(50);refresh();setSplit(50);
</script></html>`;
await fs.writeFile('test/output/airport-countryside-review.html',html);
if(process.argv.includes('--verify')){
 const {server,url}=await startServer(process.cwd()),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/test/output/airport-countryside-review.html');
  for(const tier of ['high','low']){await page.selectOption('#tier',tier);for(const [view] of choices){await page.click(`[data-view="${view}"]`);await page.evaluate(()=>Promise.all([...document.querySelectorAll('.compare img')].map(i=>i.decode())));}}
  for(const [button,value] of [['onlyBefore','100'],['onlyAfter','0'],['split','50']]){await page.click('#'+button);assert.equal(await page.inputValue('#slider'),value);}
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=1&&Number.isFinite(v.duration)&&v.duration>0));
  const videoDurations=await page.locator('video').evaluateAll(videos=>videos.map(v=>v.duration));
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await fs.writeFile('test/output/airport-countryside-review-check.json',JSON.stringify({images:choices.length*4,slider:true,videoDurations,phoneLayout:true,errors},null,2)+'\n');
  console.log('All review images, slider controls and phone layout passed');
 }finally{await browser.close();server.close();}
}
