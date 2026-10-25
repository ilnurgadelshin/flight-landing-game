// Assemble the matched game captures and measured costs; --verify checks the
// actual review controls, all image loads, slider direction and phone layout.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
const choices=[
 ['captain-9000','Captain · upper final','Normal forward pilot view at x=9000 m. The upper flanks now connect to the closer woodland, with fields and residential clearings retained.'],
 ['captain-7500','Captain · valley','Normal pilot view at x=7500 m. Wider slopes extend beyond the formerly narrow band of detailed ground.'],
 ['captain-6000','Captain · joins','Normal pilot view at x=6000 m. The two upper maps overlap the completed nearer slopes rather than ending in an uncovered strip.'],
 ['upper-slopes-north','Contour fields','Pastures, harvested strips and wooded margins follow the existing aerial imagery. The settlement and road valley retain their photographic ground and existing buildings.'],
 ['upper-slopes-south','Wooded slopes','The broad opposite woodland now has mapped ground and trees. Tree forms remain sparse and simplified; distant countryside outside the mapped area retains photography.'],
 ['upper-overcast','Below overcast','A matched camera 100 m below the crosswind cloud base, so the scenery and its diffuse lighting remain visible.'],
 ['upper-night','Night','The same upper landscape at night, without additional lights.'],
];
const read=file=>fs.readFile('test/output/'+file,'utf8').then(JSON.parse);
const [before,after,metrics]=await Promise.all(['render-benchmark-upper-slopes-before.json','render-benchmark-upper-slopes-optimized.json','upper-slopes-metrics.json'].map(read));
const rows=after.results.map(r=>{
 const b=before.results.find(b=>b.tier===r.tier&&b.scene===r.scene);
 return `<tr>${[r.tier+' / '+r.scene,b.fps.toFixed(1),r.fps.toFixed(1),r.p95FrameMs.toFixed(1),b.medianDrawCalls+' → '+r.medianDrawCalls].map(t=>`<td>${t}</td>`).join('')}</tr>`;
}).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Upper slopes · scenery review</title><style>
:root{color-scheme:dark;font:16px/1.55 system-ui;background:#111a22;color:#e3edf4}*{box-sizing:border-box}body{margin:0}main{max-width:1488px;margin:auto;padding:24px}h1{font-size:clamp(26px,3.2vw,42px);line-height:1.2}p{max-width:1020px;color:#bdccd7}a{color:#9cd4f2}button,select{font:inherit;padding:9px 13px;border:1px solid #506f82;border-radius:7px;background:#213643;color:inherit}button{cursor:pointer}button[aria-pressed=true]{background:#355c71;border-color:#8ac6e9}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #f1c57a;outline-offset:3px}.controls{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0}.labels{display:flex;justify-content:space-between;gap:15px;font-weight:650}.labels span:last-child{text-align:right}.compare{position:relative;aspect-ratio:8/5;background:#162934;margin:8px 0}.compare img{position:absolute;width:100%;height:100%;object-fit:contain}#before{clip-path:inset(0 50% 0 0)}#divider{position:absolute;left:50%;height:100%;width:2px;background:white}.slider{display:flex;gap:14px;margin:16px 0}.slider input{flex:1;min-width:0}.note{border-left:3px solid #84b7d4;padding-left:15px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;text-align:left;border-bottom:1px solid #354854;white-space:nowrap}.scroll{overflow:auto}.videos{display:grid;grid-template-columns:1fr 1fr;gap:16px}video{width:100%}#description{min-height:3em}footer{margin:30px 0;color:#adbdca}@media(max-width:600px){main{padding:14px}.labels{font-size:12px}.videos{grid-template-columns:1fr}button,select{font-size:14px;padding:8px}#description{min-height:5em}}
</style><main><h1>Connecting the upper approach slopes</h1>
<p>Woodland, contour fields and open clearings continue along both sides of final to x=9000 m. This pass adds about ${metrics.netTotalHectares.toFixed(0)} hectares of weighted cover after accounting for overlaps. It uses the existing public-domain aerial imagery and tree assets.</p>
<div class="controls" id="views" aria-label="Review view"></div>
<div class="controls"><label for="tier">Quality</label><select id="tier"><option value="high">High</option><option value="low">Low</option></select><button id="onlyBefore">Show before</button><button id="split">Compare</button><button id="onlyAfter">Show after</button></div>
<p id="description" aria-live="polite"></p><div class="labels"><span>Before · main 2b627a3</span><span>After · upper slopes</span></div>
<div class="compare"><img id="after" alt=""><img id="before" alt=""><div id="divider" aria-hidden="true"></div></div>
<div class="slider"><label for="slider">Compare</label><input id="slider" type="range" min="0" max="100" value="50" aria-label="Before image coverage"></div>
<p>Left is <b>before</b>; right is <b>after</b>. Use the buttons for full-frame views. <a id="beforeLink">Open before image</a> · <a id="afterLink">Open after image</a></p>
<p class="note">High quality receives the new slope maps and 8000 additional trees. All seven low-tier comparison views remain pixel-identical. The earlier close map and nearer-hill baked pixels are unchanged. Sparse crowns, repeated tree forms and procedural houses remain visible limitations. Airport-side countryside and areas outside x=2100–9000 m / z=−2500–2500 m remain incomplete.</p>
<details><summary>Measured cost and validation</summary>
<p>High has 66,000 trees; low keeps 14,000. Earlier planting allocations and seeds remain. The same 180 m overlaps drive CPU planting and the terrain shader, verified by reading actual GPU pixels across both joins. Field/road/building-clearance and missing/invalid-map fallback checks pass.</p>
<p>The map/manifest pair adds ${metrics.transferDelta.toLocaleString('en-US')} bytes. Both 692 × 256 tiles fit unused atlas space: GPU texture dimensions remain 3450 × 1277 high and 2048 × 603 low. Packed CPU cover grows by about 0.71 MB. There is no new source image, model, sampler or terrain draw pass. Added trees and their footprint shadows still cost geometry, shading and memory.</p>
<p>Apple M2 Pro, Chromium ANGLE Metal, 1440 × 900, high 1.5× / low 1×. Four-second warm-up and twelve-second samples, paused physics. An initial loop-based shader slowed these scenes; the final shader selects the matching strip directly and reads the older map only within an overlap. Initial and repeat measurements are retained in the performance log. These short samples are not a guarantee for other machines. Physical phones, other GPUs, SwiftShader and the complete functional suite were not rerun for this pass.</p>
<div class="scroll"><table><thead><tr><th>Tier / scene</th><th>Before FPS</th><th>After FPS</th><th>After p95 ms</th><th>Draw calls</th></tr></thead><tbody>${rows}</tbody></table></div></details>
<h2>Normal pilot descent</h2><p>Matched 480-frame descent from x=9000 to 8401.25 m, high at 1×. Video encoding affects pacing; these clips are visual evidence, not FPS measurements.</p>
<div class="videos"><div>Before<video controls preload="metadata" src="upper-slopes-motion-before.webm"></video></div><div>After<video controls preload="metadata" src="upper-slopes-motion-after.webm"></video></div></div>
<footer>2026-10-25 · Matched camera, weather seed and 1× capture resolution. <a href="../VISUAL-AUDIT.md">Visual audit</a> · <a href="../RENDER-PERFORMANCE.md">Performance log</a>.</footer></main>
<script>
const choices=${JSON.stringify(choices)},byId=id=>document.getElementById(id);let selected=choices[0][0];
for(const [id,label] of choices){const b=document.createElement('button');b.textContent=label;b.dataset.view=id;b.onclick=()=>{selected=id;refresh()};byId('views').append(b)}
function refresh(){const tier=byId('tier').value,[,label,description]=choices.find(c=>c[0]===selected);byId('description').textContent=description;for(const b of byId('views').children)b.setAttribute('aria-pressed',String(b.dataset.view===selected));for(const side of ['before','after']){const url='upper-slopes-'+side+'-'+tier+'-'+selected+'.png';byId(side).src=url;byId(side).alt=label+', '+tier+' quality, '+side;byId(side+'Link').href=url}}
function setSplit(v){byId('slider').value=v;byId('before').style.clipPath='inset(0 '+(100-v)+'% 0 0)';byId('divider').style.left=v+'%';byId('divider').hidden=v===0||v===100;byId('slider').setAttribute('aria-valuetext',v+'% before, '+(100-v)+'% after')}
byId('tier').onchange=refresh;byId('slider').oninput=e=>setSplit(Number(e.target.value));byId('onlyBefore').onclick=()=>setSplit(100);byId('onlyAfter').onclick=()=>setSplit(0);byId('split').onclick=()=>setSplit(50);refresh();setSplit(50);
</script></html>`;
await fs.writeFile('test/output/upper-slopes-review.html',html);
if(process.argv.includes('--verify')){
 const {server,url}=await startServer(process.cwd()),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/test/output/upper-slopes-review.html');
  for(const tier of ['high','low']){await page.selectOption('#tier',tier);for(const [view] of choices){await page.click(`[data-view="${view}"]`);await page.evaluate(()=>Promise.all([...document.querySelectorAll('.compare img')].map(i=>i.decode())));}}
  for(const [button,value] of [['onlyBefore','100'],['onlyAfter','0'],['split','50']]){await page.click('#'+button);assert.equal(await page.inputValue('#slider'),value);}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await fs.writeFile('test/output/upper-slopes-review-check.json',JSON.stringify({images:choices.length*4,slider:true,phoneLayout:true,errors},null,2)+'\n');
  console.log('All review images, slider controls and phone layout passed');
 }finally{await browser.close();server.close();}
}
