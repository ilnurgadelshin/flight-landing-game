// Assemble the matched game captures and measured costs; --verify checks the
// actual review controls, all image loads, slider direction and phone layout.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
const choices=[
 ['valley-lane-wide','Whole stretch','The farm, lane and roadside homes form two connected sites. Existing fields and woodland coverage remain; architecture and parcel use are interpretations of the bundled imagery.'],
 ['valley-lane-farm','Farm','Separate pitched barn wings leave an open courtyard. The machinery barn, farmhouse, garden store and lane-side shed gain complete models and connected grounds.'],
 ['valley-lane-east','Homes','Thirteen homes and outbuildings follow the registered footprints. The concave garden house has separate roof wings, leaving its forecourt open.'],
 ['captain-4300','Captain · approaching','Normal forward pilot view at x=4300 m on the three-degree approach. Changes occupy a small part of the left-side scenery; they do not transform the whole windshield view.'],
 ['captain-3500','Captain · passing','Normal forward pilot view at x=3500 m. Much of the nearby scenery passes below the glareshield. Wider views show detail that is not prominent here.'],
 ['valley-lane-overcast','Storm','The same farm in storm weather. Shared atmospheric shading remains active on the buildings and terrain-following grounds.'],
 ['valley-lane-night','Night','The same farm at night. Existing window lighting is reused; there are no additional light sources.'],
];
const read=file=>fs.readFile('test/output/'+file,'utf8').then(JSON.parse);
const [before,after,sites]=await Promise.all(['render-benchmark-valley-lane-before.json','render-benchmark-valley-lane-after.json','valley-lane-after.json'].map(read));
const stats=sites.find(s=>s.tier==='high');
const rows=after.results.map(r=>{
 const b=before.results.find(b=>b.tier===r.tier&&b.scene===r.scene);
 return `<tr>${[r.tier+' / '+r.scene,b.fps.toFixed(1),r.fps.toFixed(1),r.p95FrameMs.toFixed(1),b.medianDrawCalls+' → '+r.medianDrawCalls].map(t=>`<td>${t}</td>`).join('')}</tr>`;
}).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Valley lane · scenery review</title><style>
:root{color-scheme:dark;font:16px/1.55 system-ui;background:#111a22;color:#e3edf4}*{box-sizing:border-box}body{margin:0}main{max-width:1488px;margin:auto;padding:24px}h1{font-size:clamp(26px,3.2vw,42px);line-height:1.2}p{max-width:1020px;color:#bdccd7}a{color:#9cd4f2}button,select{font:inherit;padding:9px 13px;border:1px solid #506f82;border-radius:7px;background:#213643;color:inherit}button{cursor:pointer}button[aria-pressed=true]{background:#355c71;border-color:#8ac6e9}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #f1c57a;outline-offset:3px}.controls{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0}.labels{display:flex;justify-content:space-between;gap:15px;font-weight:650}.labels span:last-child{text-align:right}.compare{position:relative;aspect-ratio:8/5;background:#162934;margin:8px 0}.compare img{position:absolute;width:100%;height:100%;object-fit:contain}#before{clip-path:inset(0 50% 0 0)}#divider{position:absolute;left:50%;height:100%;width:2px;background:white}.slider{display:flex;gap:14px;margin:16px 0}.slider input{flex:1;min-width:0}.note{border-left:3px solid #84b7d4;padding-left:15px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;text-align:left;border-bottom:1px solid #354854;white-space:nowrap}.scroll{overflow:auto}.videos{display:grid;grid-template-columns:1fr 1fr;gap:16px}video{width:100%}#description{min-height:3em}footer{margin:30px 0;color:#adbdca}@media(max-width:600px){main{padding:14px}.labels{font-size:12px}.videos{grid-template-columns:1fr}button,select{font-size:14px;padding:8px}#description{min-height:5em}}
</style><main><h1>Valley lane: farm and neighboring homes</h1>
<p>19 additional complete buildings, connected gravel access, lawns and timber boundaries. The scene now has 81 complete building placements across ten sites. Existing openly licensed materials and imagery; the total tree budget remains unchanged.</p>
<div class="controls" id="views" aria-label="Review view"></div>
<div class="controls"><label for="tier">Quality</label><select id="tier"><option value="high">High</option><option value="low">Low</option></select><button id="onlyBefore">Show before</button><button id="split">Compare</button><button id="onlyAfter">Show after</button></div>
<p id="description" aria-live="polite"></p><div class="labels"><span>Before · main 07530bb</span><span>After · valley lane</span></div>
<div class="compare"><img id="after" alt=""><img id="before" alt=""><div id="divider" aria-hidden="true"></div></div>
<div class="slider"><label for="slider">Compare</label><input id="slider" type="range" min="0" max="100" value="50" aria-label="Before image coverage"></div>
<p>Left is <b>before</b>; right is <b>after</b>. Use the buttons for full-frame views. <a id="beforeLink">Open before image</a> · <a id="afterLink">Open after image</a></p>
<p class="note">The strongest gain is in the farm and roadside views. From the ordinary pilot seat it is modest: many buildings are small or below the glareshield. Photographic blur and shadows, simple materials and distant tree image planes remain visible limitations.</p>
<details><summary>Measured cost and validation</summary>
<p>Both quality tiers pass ${stats.roofSamples} roof samples, ${stats.roadConnections} local access joins and ${stats.mainRoadConnections} main-road joins, terrain contact, open-courtyard checks and planting clearances. Missing or invalid extension data retains the original nine-building site. Complete buildings: ${stats.triangles.toLocaleString('en-US')} triangles near / ${stats.farTriangles.toLocaleString('en-US')} far; grounds and fences: ${stats.siteTriangles.toLocaleString('en-US')}; ${stats.batches} batches before subtracting replaced procedural buildings.</p>
<p>Apple M2 Pro, Chromium ANGLE Metal, 1440 × 900, high 1.5× / low 1×. Four-second warm-up and twelve-second samples, paused physics. These measure fixed-resolution rendering and scenery updates, not a full-flight or physical-phone benchmark.</p>
<div class="scroll"><table><thead><tr><th>Tier / scene</th><th>Before FPS</th><th>After FPS</th><th>After p95 ms</th><th>Draw calls</th></tr></thead><tbody>${rows}</tbody></table></div></details>
<h2>Normal pilot descent</h2><p>Matched 480-frame descent from x=4300 to 3701.25 m, high at 1×. Video encoding affects pacing; these clips are visual evidence, not FPS measurements.</p>
<div class="videos"><div>Before<video controls preload="metadata" src="valley-lane-motion-before.webm"></video></div><div>After<video controls preload="metadata" src="valley-lane-motion-after.webm"></video></div></div>
<footer>2026-10-24 · Matched camera, weather seed and 1× capture resolution. <a href="../VISUAL-AUDIT.md">Visual audit</a> · <a href="../RENDER-PERFORMANCE.md">Performance log</a>.</footer></main>
<script>
const choices=${JSON.stringify(choices)},byId=id=>document.getElementById(id);let selected=choices[0][0];
for(const [id,label] of choices){const b=document.createElement('button');b.textContent=label;b.dataset.view=id;b.onclick=()=>{selected=id;refresh()};byId('views').append(b)}
function refresh(){const tier=byId('tier').value,[,label,description]=choices.find(c=>c[0]===selected);byId('description').textContent=description;for(const b of byId('views').children)b.setAttribute('aria-pressed',String(b.dataset.view===selected));for(const side of ['before','after']){const url='valley-lane-'+side+'-'+tier+'-'+selected+'.png';byId(side).src=url;byId(side).alt=label+', '+tier+' quality, '+side;byId(side+'Link').href=url}}
function setSplit(v){byId('slider').value=v;byId('before').style.clipPath='inset(0 '+(100-v)+'% 0 0)';byId('divider').style.left=v+'%';byId('divider').hidden=v===0||v===100;byId('slider').setAttribute('aria-valuetext',v+'% before, '+(100-v)+'% after')}
byId('tier').onchange=refresh;byId('slider').oninput=e=>setSplit(Number(e.target.value));byId('onlyBefore').onclick=()=>setSplit(100);byId('onlyAfter').onclick=()=>setSplit(0);byId('split').onclick=()=>setSplit(50);refresh();setSplit(50);
</script></html>`;
await fs.writeFile('test/output/valley-lane-review.html',html);
if(process.argv.includes('--verify')){
 const {server,url}=await startServer(process.cwd()),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/test/output/valley-lane-review.html');
  for(const tier of ['high','low']){await page.selectOption('#tier',tier);for(const [view] of choices){await page.click(`[data-view="${view}"]`);await page.evaluate(()=>Promise.all([...document.querySelectorAll('.compare img')].map(i=>i.decode())));}}
  for(const [button,value] of [['onlyBefore','100'],['onlyAfter','0'],['split','50']]){await page.click('#'+button);assert.equal(await page.inputValue('#slider'),value);}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await fs.writeFile('test/output/valley-lane-review-check.json',JSON.stringify({images:choices.length*4,slider:true,phoneLayout:true,errors},null,2)+'\n');
  console.log('All review images, slider controls and phone layout passed');
 }finally{await browser.close();server.close();}
}
