// Build the local comparison after running overcast-review.mjs for both revisions.
import fs from 'node:fs/promises';
const views=[
 ['near-top','12 m above top','Outside the layer: the corrected view retains blue sky. Looking down still meets the cloud deck.'],
 ['inside-top','24 m inside top','Near the upper edge: upward rays can leave the cloud; downward and grazing rays remain obscured.'],
 ['near-base','12 m below base','Outside the layer: the ground keeps its ordinary visibility while the cloud ceiling remains overhead.'],
 ['inside-base','24 m inside base','Near the lower edge: terrain emerges through a short downward path. Looking horizontally stays opaque.'],
 ['above','320 m above top','The upper billows remain visible from above.'],
 ['below','120 m below base','The underside retains its soft structure.'],
 ['captain-above','Captain above','Normal cockpit view above the deck. The flight deck is drawn separately and is not cloud-fogged.'],
 ['captain-below','Captain below','Normal cockpit view beneath the deck.'],
 ['night','Night above','The same cloud boundary at night.'],
 ['storm','Storm below','Storm conditions retain their rain and reduced clear-air visibility.']
];
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloud entry: preserving the view outside</title>
<style>
:root{color-scheme:dark;font:17px/1.55 system-ui;background:#111a22;color:#e3edf4}body{max-width:1200px;margin:40px auto;padding:0 22px}h1{font-size:clamp(27px,4vw,44px);line-height:1.12;margin-bottom:18px}p{color:#bbcbd6;max-width:1000px}button,select{font:inherit;padding:10px 14px;border:1px solid #526b7e;border-radius:8px;background:#213340;color:inherit;cursor:pointer}button[aria-pressed=true]{background:#326178;border-color:#80b4c7}.controls{display:flex;flex-wrap:wrap;gap:9px;margin:20px 0}.labels{display:flex;justify-content:space-between;font-weight:650;gap:20px}.frame{position:relative;aspect-ratio:8/5;margin:10px 0;background:#263544}.frame img{position:absolute;width:100%;height:100%;object-fit:contain}.before{clip-path:inset(0 50% 0 0)}.line{position:absolute;left:50%;height:100%;width:2px;background:#fff9;pointer-events:none}input[type=range]{width:100%;accent-color:#71c5e5}.note{padding:15px 20px;background:#20313e;border-left:3px solid #6ca9c2}.small{font-size:14px}video{width:100%;border-radius:8px}a{color:#9cd7ee}.deep{max-width:720px;width:100%}.section{margin-top:42px}#description{min-height:3.2em}
</style><h1>Cloud entry: preserving the view outside</h1>
<p>The earlier “after” images really did turn grey near the cloud edges. This comparison shows that published version against the correction, combined with remote main d844549. Visibility now depends on the cloud along each viewing direction.</p>
<div class="controls" id="views"></div><label>Quality <select id="tier"><option value="high">High</option><option value="low">Low</option></select></label>
<p id="description"></p><div class="labels"><span>Before · published 5b85f57</span><span>After · corrected entry + remote fixes</span></div>
<div class="frame"><img id="after" alt="Corrected cloud entry"><img id="before" class="before" alt="Published cloud entry"><div class="line" id="line"></div></div>
<label for="divider">Comparison divider</label><input id="divider" type="range" min="0" max="100" value="50">
<div class="controls"><button id="only-before">Before only</button><button id="split">Split</button><button id="only-after">After only</button></div>
<p class="small">Move the divider left to reveal the corrected image, or right to reveal the published image. Both captures use the same camera, weather and time. Exterior captures hide the cockpit deliberately.</p>
<div class="section"><h2>Deep inside, a whiteout is still expected</h2><p>This is the middle of the layer, looking horizontally. There is no short path out to clear air. The ground and distant lights remain obscured; the cockpit instruments remain visible in the captain recording below.</p><img class="deep" id="deep" alt="Corrected view deep inside cloud"></div>
<div class="section"><h2>Watch both boundaries in motion</h2><p>A repeatable descent from 60 m above cloud top to 60 m below cloud base: exterior first, then captain view. The camera descends at 24 m/s to show the transitions in a short recording; this is a renderer review, not a landing flight. These recordings predate the remote lawn and low-tier grass fixes; the still images above show the combined build.</p><video id="motion" controls preload="metadata"></video></div>
<p class="note">This remains a simplified continuous layer. Billows are rendered near the edges; a smooth vertical density profile controls obscuration along each ray. It is not a full 3D weather simulation. No image or model downloads were added.</p>
<p class="small"><a href="overcast-review.html">Earlier overcast comparison</a> · <a href="../../README.md">Project README</a></p>
<script>
const views=${JSON.stringify(views)};let view=views[0][0];const byId=id=>document.getElementById(id);
function update(){const tier=byId('tier').value;byId('before').src='cloud-boundary-before-'+tier+'-'+view+'.png';byId('after').src='cloud-boundary-after-'+tier+'-'+view+'.png';byId('deep').src='cloud-boundary-after-'+tier+'-deep.png';byId('description').textContent=views.find(v=>v[0]===view)[2];document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));const video=byId('motion'),source='cloud-boundary-motion-'+tier+'.webm';if(video.getAttribute('src')!==source)video.src=source;}
for(const [id,name] of views){const b=document.createElement('button');b.textContent=name;b.dataset.view=id;b.onclick=()=>{view=id;update()};byId('views').append(b);}
function divider(n){byId('divider').value=n;byId('before').style.clipPath='inset(0 '+(100-n)+'% 0 0)';byId('line').style.left=n+'%';byId('line').hidden=n===0||n===100;}
byId('divider').oninput=e=>divider(Number(e.target.value));byId('only-before').onclick=()=>divider(100);byId('only-after').onclick=()=>divider(0);byId('split').onclick=()=>divider(50);byId('tier').onchange=update;update();
</script></html>`;
await fs.writeFile('test/output/cloud-boundary-review.html',html);
console.log('Created test/output/cloud-boundary-review.html');
