// Browser end-to-end QA: plays the game in headless Chromium (SwiftShader).
//   node test/e2e.mjs            (all)      node test/e2e.mjs quick   (skip the slow keyboard, touch, tilt and controller landings)
// Software rendering (no graphics card) is ~95% of a frame, so the pages run with the 3D drawing
// switched off (window.__sim.setDrawing): the game loop, physics, rules, displays and interface run
// as usual at 30-50 fps. A frame is drawn for every screenshot; E1 and E16 check drawn pixels, and
// E16 draws every scenario by day and night on both graphics tiers. The functional groups use the
// fast 'low' tier; E16 checks the 'high' one. Each group reports how long it took.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'test', 'output'); fs.mkdirSync(out, { recursive: true });
const quick = process.argv.includes('quick');
const only = (process.argv.find((a) => a.startsWith('only=')) || '').slice(5);
const onlyGroups = only ? only.split(',') : null;          // only=tilt,tiltland runs several groups
const want = (g) => !onlyGroups || onlyGroups.includes(g);

let passed = 0, failed = 0; const failures = [];
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; failures.push(name); console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const fmt = (n, d = 1) => Number(n).toFixed(d);
// group headers, timed
const sections = [];
const tStart = Date.now();
const section = (id, title) => {
  const now = Date.now(), prev = sections[sections.length - 1];
  if (prev) prev.s = (now - prev.t0) / 1000;
  sections.push({ id, title, t0: now });
  console.log(`\n[${id}] ${title}`);
};

const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const VW = 1024, VH = 576;
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));

// screenshots draw a frame first (the pages run with drawing off)
// screenshots are for people to look at, not checks: a slow one (a busy machine) is skipped, not fatal
const snap = async (p, name) => {
  try { await p.evaluate(() => window.__sim.drawNow()); await p.screenshot({ path: path.join(out, name + '.png'), timeout: 90000 }); }
  catch (e) { console.log(`    (screenshot ${name} skipped: ${String(e.message).split('\n')[0]})`); }
};
const shot = (name) => snap(page, name);
const drawOff = (p) => p.evaluate(() => window.__sim.setDrawing(false));
const S = () => page.evaluate(() => { const s = window.__sim.state(); const g = window.__sim.game; return Object.assign({}, s, { gameState: g.state, gaMode: g.ctx.gaMode, time: s.time }); });
const I = () => page.evaluate(() => Object.assign({}, window.__sim.input()));
const start = (opts) => page.evaluate((o) => window.__sim.start(o), opts);
const waitFor = async (fn, timeout, label) => { try { await page.waitForFunction(fn, null, { timeout }); return true; } catch (e) { console.log(`    (timeout waiting for ${label || fn})`); return false; } };
// frame-based waits: SwiftShader frames can take 100–400 ms, so wall-clock holds are unreliable
const frames = async (n) => { await page.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n); };
// a key held for at least `ms` and at least two frames (so the game reads it whatever the frame rate)
const holdKey = async (code, ms) => { const t0 = Date.now(); await page.keyboard.down(code); await frames(2); const left = ms - (Date.now() - t0); if (left > 0) await page.waitForTimeout(left); await page.keyboard.up(code); await frames(1); };
const tap = async (code) => { await page.keyboard.down(code); await frames(1); await page.keyboard.up(code); await frames(1); };
// frames flowing steadily on a page (5 in a row, under 100 ms apart). In software rendering the
// graphics work queued when a flight starts (the sky's lighting map) can hold frames back for up to
// a second some time later, while the page's timers and sensor events carry on
const steady = (p) => p.evaluate(() => new Promise((res) => { let last = performance.now(), n = 0; const f = (t) => { n = t - last < 100 ? n + 1 : 0; last = t; if (n >= 5) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
// simulated time passing on any page (a hold that means the same at any frame rate)
const simWaitOn = async (p, sec) => {
  const t = await p.evaluate((sec) => window.__sim.state().time + sec, sec);
  await p.waitForFunction((t) => window.__sim.state().time >= t || window.__sim.game.state !== 'flying', t, { timeout: 120000 });
};
const simWait = async (sec) => { await page.evaluate((sec) => { window.__until = window.__sim.state().time + sec; }, sec); await waitFor(() => window.__sim.state().time >= window.__until || window.__sim.game.state !== 'flying', 120000, 'sim time'); };

// --------------------------------------------------------------------------- load
section('E1', 'Page loads, WebGL renderer up, no errors');
await page.goto(url + '/?lowdetail', { waitUntil: 'load' });
const ready = await waitFor(() => window.__sim, 60000, 'sim ready');
check('sim ready', ready);
const gl = await page.evaluate(() => ({ renderer: !!window.__sim.world.renderer, scenarios: window.__sim.scenarios, menu: !document.getElementById('menu').classList.contains('hidden') }));
check('renderer created and menu visible', gl.renderer && gl.menu, gl.scenarios.join(','));
await shot('e2e-menu');
// a real frame: the drawn picture is not a blank canvas (the other groups run with drawing off)
const drawn = await page.evaluate(() => {
  window.__sim.drawNow();
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36;
  const g = cv.getContext('2d'); g.drawImage(window.__sim.world.renderer.domElement, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data; let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  return { lo, hi };
});
check('a frame draws: the 3D scene behind the menu, not a blank canvas', drawn.hi - drawn.lo > 40, `luminance ${fmt(drawn.lo, 0)}..${fmt(drawn.hi, 0)}`);
await drawOff(page);

// --------------------------------------------------------------------------- menu flow
if (want('menu')) {
  section('E2', 'Menu: choose mode / scenario / start with the mouse, start the approach');
  await page.click('#mode-row .choice[data-mode="game"]');
  await page.click('#scenario-row .choice[data-scenario="crosswind"]');
  await page.click('#start-row .choice[data-start="short"]');
  await page.click('#btn-start');
  await page.waitForTimeout(600);
  let s = await S();
  const applied = await page.evaluate(() => ({ sc: window.__sim.world.scenario.id, hud: !document.getElementById('hud').classList.contains('hidden'), menu: document.getElementById('menu').classList.contains('hidden') }));
  check('game starts flying the selected scenario', s.gameState === 'flying' && applied.sc === 'crosswind' && applied.hud && applied.menu, `state=${s.gameState} scenario=${applied.sc}`);
  check('crosswind scenario changed the physics (crosswind component > 15 kt)', Math.abs(s.crosswind) > 15, `${fmt(s.crosswind)} kt`);
  await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  s = await S(); check('P pauses', s.gameState === 'paused');
  await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  s = await S(); check('P resumes', s.gameState === 'flying');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc opens the pause menu', (await S()).gameState === 'paused');
  await page.click('#btn-quit'); await page.waitForTimeout(200);
  check('Back to menu works', (await S()).gameState === 'menu' && !(await page.evaluate(() => document.getElementById('menu').classList.contains('hidden'))));
}

// --------------------------------------------------------------------------- keyboard & mouse mapping
if (want('keys')) {
  section('E3', 'Every mapped key drives the right control (real key events)');
  await start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false });
  await page.waitForTimeout(300);
  let i0 = await I();
  await page.keyboard.down('KeyW'); await simWait(0.6); await page.keyboard.up('KeyW'); await frames(1); let i1 = await I();
  check('W increases throttle', i1.throttle > i0.throttle + 0.12, `${fmt(i0.throttle, 2)} -> ${fmt(i1.throttle, 2)}`);
  await page.keyboard.down('KeyS'); await simWait(0.6); await page.keyboard.up('KeyS'); await frames(1); let i2 = await I();
  check('S decreases throttle', i2.throttle < i1.throttle - 0.12, `${fmt(i1.throttle, 2)} -> ${fmt(i2.throttle, 2)}`);
  await tap('KeyG'); let i3 = await I();
  check('G lowers the gear', i3.gearDown === true);
  await tap('KeyG'); check('G again raises the gear', (await I()).gearDown === false);
  await tap('KeyG');
  const f0 = (await I()).flapIndex;
  await tap('KeyF'); check('F extends flaps one notch', (await I()).flapIndex === f0 + 1);
  await tap('KeyV'); check('V retracts flaps one notch', (await I()).flapIndex === f0);
  await tap('Space'); check('Space extends the speedbrake', (await I()).speedbrake === 1);
  await tap('Space'); check('Space again retracts it', (await I()).speedbrake === 0);
  await tap('KeyX'); check('X arms the speedbrake', (await I()).speedbrakeArmed === true);
  const ab0 = (await I()).autobrake; await tap('KeyN'); check('N cycles the autobrake', (await I()).autobrake === (ab0 + 1) % 5);
  await page.keyboard.down('KeyB'); await simWait(0.4); check('B applies the wheel brakes', (await I()).brake > 0.5, `${fmt((await I()).brake, 2)}`); await page.keyboard.up('KeyB'); await simWait(0.4);
  check('brakes release', (await I()).brake < 0.1);
  await page.keyboard.down('KeyR'); await frames(3); const ir = await I(); check('R selects reverse (and closes the thrust levers)', ir.reverse === true && ir.throttle === 0); await page.keyboard.up('KeyR'); await frames(3);
  check('reverse stows on release', (await I()).reverse === false);
  const sR = await S(); check('reversers cannot deploy in flight', sR.reverser < 0.05, `reverser ${fmt(sR.reverser, 2)}`);
  const tr0 = (await I()).trim; await holdKey('BracketLeft', 400); const tr = (await I()).trim; check('[ trims nose up', tr > tr0, `${fmt(tr0, 2)} -> ${fmt(tr, 2)}`);
  // primary controls: hold and look at the physics response
  await page.evaluate(() => { window.__sim.input().throttle = 0.6; });
  const p0 = await S();
  await page.keyboard.down('ArrowUp'); await simWait(1.2); const pu = await S(); const ipu = await I(); await page.keyboard.up('ArrowUp');
  check('↑ commands nose up (pitch input > 0) and the aircraft pitches up', pu.pitch > p0.pitch + 1.0 * Math.PI / 180 && ipu.pitch > 0.5 && pu.q > 0, `Δpitch ${fmt((pu.pitch - p0.pitch) * 57.3)}° q=${fmt(pu.q * 57.3)}°/s input ${fmt(ipu.pitch, 2)}`);
  await simWait(0.6);
  await page.keyboard.down('ArrowDown'); await simWait(1.2); const pd = await S(); await page.keyboard.up('ArrowDown');
  check('↓ commands nose down', pd.q < -0.01, `q=${fmt(pd.q * 57.3)}°/s`);
  await page.keyboard.down('ArrowRight'); await simWait(1.5); const rr = await S(); await page.keyboard.up('ArrowRight');
  check('→ rolls right', rr.roll > 3 * Math.PI / 180, `roll ${fmt(rr.roll * 57.3)}°`);
  await page.keyboard.down('ArrowLeft'); await simWait(2.5); const rl = await S(); await page.keyboard.up('ArrowLeft');
  // the key's input ramps in (fast through zero, then progressively), so from a right bank the aircraft
  // first stops rolling right: the check is a left roll rate and a bank angle already coming back
  check('← rolls left', rl.p < -3 * Math.PI / 180 && rl.roll < rr.roll - 2 * Math.PI / 180, `roll ${fmt(rr.roll * 57.3)}° → ${fmt(rl.roll * 57.3)}°, p=${fmt(rl.p * 57.3)}°/s`);
  await page.keyboard.down('KeyD'); await simWait(1.5); const yd = await S(); const iy = await I(); await page.keyboard.up('KeyD');
  check('D applies right rudder (nose right / sideslip)', iy.yaw > 0.5 && (yd.r > 0.005 || yd.beta < -0.5 * Math.PI / 180), `yaw input ${fmt(iy.yaw, 2)}, r=${fmt(yd.r * 57.3)}°/s beta=${fmt(yd.beta * 57.3)}°`);
  await simWait(0.8);
  await page.keyboard.down('KeyA'); await simWait(1.5); const ya = await S(); await page.keyboard.up('KeyA');
  check('A applies left rudder', ya.r < -0.005 || ya.beta > 0.5 * Math.PI / 180, `r=${fmt(ya.r * 57.3)}°/s beta=${fmt(ya.beta * 57.3)}°`);
  await page.keyboard.down('KeyL'); await frames(8); const camL = await page.evaluate(() => window.__sim.world.camera.rotation.x); await page.keyboard.up('KeyL');
  check('L looks down at the pedestal', camL < -0.5, `cam pitch ${fmt(camL * 57.3)}°`);
  const viewNow = () => page.evaluate(() => { const w = window.__sim.world; return { mode: window.__sim.view.shown, body: document.body.classList.contains('view-hud'), deck: w.drawCockpit !== false, fov: +w.camera.fov.toFixed(1), pitch: +(w.camera.rotation.x * 57.3).toFixed(1) }; });
  const settled = () => page.waitForFunction(() => window.__sim.cockpit.lookDown < 0.005, null, { timeout: 30000 });   // the look eases back from L
  await settled(); await tap('KeyC'); await frames(3); const hv = await viewNow();
  await tap('KeyC'); await frames(3); const cv = await viewNow();
  check('C switches to the head-up view (no flight deck, the eye 6° below the nose) and back', hv.mode === 'hud' && hv.body && !hv.deck && Math.abs(hv.pitch + 6) < 0.5 && cv.mode === 'cockpit' && !cv.body && cv.deck && cv.fov === 70 && Math.abs(cv.pitch + 15) < 0.5, `head-up ${JSON.stringify(hv)}, cockpit ${JSON.stringify(cv)}`);
  // mouse yoke
  await page.mouse.click(VW / 2, VH / 2); await frames(2);
  check('click engages the mouse yoke', await page.evaluate(() => window.__sim.inputManager.mouseEngaged));
  await page.mouse.move(VW / 2, VH * 0.2); await frames(3);
  check('mouse up = nose up command', (await I()).pitch > 0.3, `pitch input ${fmt((await I()).pitch, 2)}`);
  await page.mouse.move(VW * 0.85, VH / 2); await frames(3);
  check('mouse right = roll right command', (await I()).roll > 0.3, `roll input ${fmt((await I()).roll, 2)}`);
  await page.mouse.move(VW / 2, VH / 2); await page.keyboard.press('Escape'); await frames(3);
  check('Esc releases the mouse yoke', !(await page.evaluate(() => window.__sim.inputManager.mouseEngaged)) && Math.abs((await I()).roll) < 0.05);
  // pilot-style inversion option
  await page.evaluate(() => { window.__sim.inputManager.opts.invertPitch = true; });
  await page.keyboard.down('ArrowUp'); await frames(6); const inv = await I(); await page.keyboard.up('ArrowUp');
  check('pilot-style option inverts the pitch axis', inv.pitch < 0, `pitch input ${fmt(inv.pitch, 2)}`);
  await page.evaluate(() => { window.__sim.inputManager.opts.invertPitch = false; });
  await tap('KeyT');
  const it = await I(); const ev = await page.evaluate(() => window.__sim.events().map((e) => e.type));
  check('T sets TOGA thrust and triggers a go-around', it.throttle === 1 && ev.includes('goaround'));
  await tap('KeyH');
  check('H opens Flight School in flight', (await S()).gameState === 'school' && !(await page.evaluate(() => document.getElementById('school').classList.contains('hidden'))));
  await page.click('#school-skip'); await frames(2);
  check('Skip returns to flying', (await S()).gameState === 'flying');
  // the aircraft flies on while the key is down: check the jump back and the event, not an exact distance
  const dRp = (await S()).distToThreshold;
  await tap('Backspace');
  const sRp = await S(); const rp = await page.evaluate(() => window.__sim.events().some((e) => e.type === 'reposition'));
  check('Backspace repositions on final after a go-around', rp && !sRp.gaMode && sRp.distToThreshold <= 10.02 * 1852 && sRp.distToThreshold > 9.6 * 1852 && sRp.distToThreshold > dRp + 0.2 * 1852, `${fmt(dRp / 1852)} → ${fmt(sRp.distToThreshold / 1852)} nm`);
}

// --------------------------------------------------------------------------- flight school
if (want('school')) {
  section('E4', 'Flight School onboarding (training mode)');
  await page.evaluate(() => window.__sim.game.quitToMenu());
  await page.click('#mode-row .choice[data-mode="training"]');
  await page.click('#start-row .choice[data-start="short"]');
  await page.click('#btn-start'); await page.waitForTimeout(500);
  check('school overlay shown and the sim is paused', (await S()).gameState === 'school' && await page.evaluate(() => window.__sim.game.sim.paused));
  const nSteps = await page.evaluate(() => document.getElementById('school-step').textContent);
  check('step counter shows 1 / N', /^1 \/ \d+/.test(nSteps), nSteps);
  await shot('e2e-school-1');
  let allOnScreen = true, titles = [], kbdSteps = 0;
  const total = parseInt(nSteps.split('/')[1], 10);
  for (let k = 0; k < total; k++) {
    await frames(8);   // let the camera settle on the step's view
    const info = await page.evaluate(() => { const h = document.getElementById('school-highlight').getBoundingClientRect(); return { title: document.getElementById('school-title').textContent, body: document.getElementById('school-body').textContent, kbd: document.getElementById('school-body').innerHTML.includes('<kbd>'), x: h.x, y: h.y, w: h.width, h: h.height }; });
    titles.push(info.title); if (info.kbd) kbdSteps++;
    if (!(info.x + info.w / 2 > 0 && info.x + info.w / 2 < VW && info.y + info.h / 2 > 0 && info.y + info.h / 2 < VH)) { allOnScreen = false; console.log(`    highlight off screen for "${info.title}": ${JSON.stringify(info)}`); }
    if (k === 6) await shot('e2e-school-throttle');
    if (k < total - 1) { await page.click('#school-next'); await page.waitForTimeout(120); }
  }
  check(`all ${total} steps have their highlight on screen`, allOnScreen, titles.slice(0, 4).join(' | ') + ' …');
  check('steps show the key mapping', kbdSteps >= 9, `${kbdSteps} steps with key caps`);
  await page.click('#school-next'); await page.waitForTimeout(500);
  check('"Start flying" closes the school and unpauses', (await S()).gameState === 'flying' && !(await page.evaluate(() => window.__sim.game.sim.paused)));
  await page.waitForTimeout(1500);
  const inst = await page.evaluate(() => document.getElementById('instructor').textContent);
  check('instructor hints are shown in training mode', inst.length > 10, inst.slice(0, 60));
  check('flight director is displayed in training mode', await page.evaluate(() => window.__sim.cockpit.pfd.fdEnabled));
  await shot('e2e-training');
}

// --------------------------------------------------------------------------- autoland every scenario
async function autoland(scenarioId, startId, apOpts = {}, extra = {}) {
  await start(Object.assign({ scenarioId, startId, mode: 'game', sound: false, night: !!extra.night, seed: extra.seed || 11 }, extra.startOpts || {}));
  await page.waitForTimeout(200);
  if (extra.before) await page.evaluate(extra.before);
  await page.evaluate((o) => { window.__sim.autopilot(o); window.__sim.setTimeScale(16); }, apOpts);
  let shotDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await S();
    if (!shotDone && s.agl < 110 && extra.shotName) { await page.evaluate(() => window.__sim.setTimeScale(1)); await page.waitForTimeout(300); await shot(extra.shotName); await page.evaluate(() => window.__sim.setTimeScale(16)); shotDone = true; }
    if (s.gameState === 'finished') break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.__sim.setTimeScale(1));
  const res = await page.evaluate(() => ({ result: window.__sim.result(), events: window.__sim.events(), gpws: window.__sim.gpwsEvents(), audio: window.__sim.audioLog(), state: window.__sim.game.state, resultsVisible: !document.getElementById('results').classList.contains('hidden'), headline: document.getElementById('res-headline').textContent, outcome: document.getElementById('res-outcome').textContent }));
  if (extra.shotName) await shot(extra.shotName + '-result');
  return res;
}
const said = (r, re) => r.audio.some((a) => a.kind === 'voice' && re.test(a.text));

if (want('land')) {
  section('E5', 'Autoland in every scenario, day and night, with GPWS callouts in the recorded voice');
  // the voice is recorded clips played through Web Audio like the engines (an iPhone plays nothing
  // else reliably); they load after the first key press or tap
  await page.keyboard.press('Shift');
  const clips = await page.evaluate(async () => { const a = window.__sim.audio; return { n: await a.clipsReady, state: a.ctx && a.ctx.state }; });
  const nPhrases = JSON.parse(fs.readFileSync(path.join(root, 'audio', 'voice', 'phrases.json'), 'utf8')).phrases.length;
  check(`the voice recordings load after the first key press (${nPhrases} phrases)`, clips.n === nPhrases, `${clips.n} decoded, sound ${clips.state}`);
  const cases = [['clear', 'short', false], ['tailwind', 'short', false], ['crosswind', 'short', false], ['storm', 'short', true], ['clear', 'standard', true]];
  for (const [sc, st, night] of cases) {
    const sound = sc === 'clear' && st === 'short';   // one landing with the sound on
    const r = await autoland(sc, st, {}, { shotName: `e2e-land-${sc}${night ? '-night' : ''}`, night, startOpts: { sound } });
    const td = r.result && r.result.touchdown;
    console.log(`  ${sc}/${st}${night ? ' night' : ''}: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'no result'} | td ${td ? `${fmt(td.sink / 0.00508, 0)} fpm @ ${fmt(td.distFromThreshold, 0)} m` : '-'}`);
    check(`${sc}: results screen shown with a successful landing`, r.resultsVisible && r.result && r.result.success, r.headline);
    check(`${sc}: altitude callouts heard (500 … 10)`, said(r, /Five hundred/) && said(r, /One hundred/) && said(r, /Fifty/) && said(r, /Thirty/) && said(r, /Ten/), r.audio.filter((a) => a.kind === 'voice').map((a) => a.text).join(', ').slice(0, 120));
    check(`${sc}: "Minimums" called`, said(r, /Minimums/));
    check(`${sc}: touchdown sound played`, r.audio.some((a) => a.kind === 'sound' && /touchdown|hardlanding/.test(a.text)));
    check(`${sc}: no GPWS warnings during a good approach`, !r.gpws.some((e) => e.type === 'warning'), r.gpws.filter((e) => e.type !== 'callout').map((e) => e.text).join(', '));
    if (sound) {
      // at 16× time many callouts are dropped as stale; the ones spoken must all be recordings
      const spoken = r.audio.filter((a) => a.kind === 'voice' && a.via), fallbacks = await page.evaluate(() => window.__sim.audio.fallbacks);
      check(`${sc}: the callouts play the recordings, none left to the browser's speech`, spoken.length >= 3 && spoken.every((a) => a.via === 'clip') && !fallbacks.length, `${spoken.map((a) => `${a.text} (${a.via})`).join(', ').slice(0, 140)}${fallbacks.length ? ' | fallbacks: ' + fallbacks.join(', ') : ''}`);
    }
  }
}

// --------------------------------------------------------------------------- failure consequences
if (want('fail')) {
  section('E6', 'Intentional errors: the simulation reacts with alarms and consequences');
  let r = await autoland('clear', 'short', { noGear: true }, { before: () => { window.__sim.input().gearDown = false; window.__sim.game.sim.aircraft.gearPos = 0; }, shotName: 'e2e-fail-gearup' });
  console.log(`  gear up: ${r.outcome} — ${r.headline}`);
  check('gear-up: "Too low, gear" warning and the configuration horn', said(r, /Too low, gear/) && r.gpws.some((e) => e.type === 'horn'), r.gpws.map((e) => e.text).join(', ').slice(0, 100));
  check('gear-up: belly landing outcome on the results screen', r.result && r.result.outcome === 'belly' && /BELLY/.test(r.outcome));
  check('gear-up: crash sound and screen flash', r.audio.some((a) => a.text === 'crash') && r.events.some((e) => e.type === 'damage'));
  // a phone speaker plays little below 400 Hz, so a thud is not enough: each sound rendered offline
  // and its loudest 200 ms between 400 Hz and 8 kHz compared with the engines' (dBFS)
  const band = await page.evaluate(async () => {
    const { AudioSystem } = await import(new URL('js/audio.js', location.href).href);
    const fft = (re, im) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= n; len <<= 1) {
        const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
        for (let i = 0; i < n; i += len) for (let k = 0, cr = 1, ci = 0; k < len / 2; k++) {
          const p = i + k, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    };
    const st = (n1, kts, onGround) => ({ n1: [n1, n1], reverser: 0, tasKts: kts, speedbrake: 0, gearDown: true, groundSpeed: kts * 0.514, onGround, surface: 'runway', skidding: false, stallWarning: false });
    const out = {};
    for (const name of ['approach', 'rollout', 'touchdown', 'hardlanding', 'crash', 'voice', 'shaker']) {
      const fs = 48000, N = 1 << 18, ctx = new OfflineAudioContext(1, N, fs), a = new AudioSystem();
      a.init(ctx);
      if (name === 'approach') a.update(0.016, st(0.55, 145, false), {}); else if (name === 'rollout') a.update(0.016, st(0.3, 110, true), {});
      else if (name === 'voice') { await a.loadClips(); a.say('Sink rate', { priority: 2 }); } else if (name === 'shaker') a.startStickShaker(); else a.play(name);
      const re = Float64Array.from((await ctx.startRendering()).getChannelData(0)), im = new Float64Array(N);
      fft(re, im);
      for (let k = 0; k < N; k++) { const f = Math.min(k, N - k) * fs / N; if (f < 400 || f > 8000) { re[k] = 0; im[k] = 0; } im[k] = -im[k]; }
      fft(re, im);
      const w = fs * 0.2; let acc = 0, best = 0;
      for (let i = 0; i < N; i++) { const y = re[i] / N, z = i >= w ? re[i - w] / N : 0; acc += y * y - z * z; best = Math.max(best, acc); }
      out[name] = 10 * Math.log10(best / w + 1e-12);
    }
    return out;
  });
  const dB = (k) => `${fmt(band[k])} dB`;
  console.log(`  phone band: approach ${dB('approach')}, roll-out ${dB('rollout')}, touchdown ${dB('touchdown')}, hard landing ${dB('hardlanding')}, crash ${dB('crash')}, "Sink rate" ${dB('voice')}, stick shaker ${dB('shaker')}`);
  check('on a phone speaker a touchdown is heard over the roll-out (≥ 5 dB)', band.touchdown - band.rollout >= 5, fmt(band.touchdown - band.rollout) + ' dB');
  check('a hard landing clearly over it (≥ 10 dB)', band.hardlanding - band.rollout >= 10, fmt(band.hardlanding - band.rollout) + ' dB');
  check('a crash over the engines on approach (≥ 8 dB)', band.crash - band.approach >= 8, fmt(band.crash - band.approach) + ' dB');
  check('the voice warnings over the engines on approach (≥ 8 dB)', band.voice - band.approach >= 8, fmt(band.voice - band.approach) + ' dB');
  check('the stick shaker over them too (≥ 4 dB)', band.shaker - band.approach >= 4, fmt(band.shaker - band.approach) + ' dB');

  r = await autoland('clear', 'short', { noFlare: true }, {});
  console.log(`  no flare: ${r.outcome} — ${r.headline}`);
  check('no flare: hard landing recorded', r.result && r.result.touchdown.sink > 3.0 && r.result.notes.some((n) => /Hard landing/.test(n)), r.headline);
  check('no flare: "Sink rate" or hard-landing sound', said(r, /Sink rate/) || r.audio.some((a) => a.text === 'hardlanding'));

  r = await autoland('clear', 'short', { hardLanding: true }, { shotName: 'e2e-fail-crash' });
  console.log(`  pushed into the runway: ${r.outcome} — ${r.headline}`);
  check('pushed into the runway: crash / gear collapse with the aircraft destroyed', r.result && ['crash', 'collapse'].includes(r.result.outcome), r.headline);
  check('crash: "Sink rate"/"Pull up" warning was voiced', said(r, /Sink rate|Pull up/), r.gpws.map((e) => e.text).join(', ').slice(0, 100));

  r = await autoland('clear', 'short', { offsetM: 60 }, {});
  console.log(`  60 m right: ${r.outcome} — ${r.headline}`);
  check('landing beside the runway: "missed the runway"', r.result && r.result.outcome === 'missed');

  r = await autoland('clear', 'short', { noBrakes: true, useReversers: false, autobrake: 0 }, {});
  console.log(`  no brakes: ${r.outcome} — ${r.headline}`);
  check('no braking: runway overrun', r.result && r.result.outcome === 'overrun');

  r = await autoland('clear', 'short', { targetSpeedOffset: -32, flareHeight: 25 }, {});
  console.log(`  far too slow (Vref-27): ${r.outcome} — ${r.headline}`);
  check('flying too slowly: stick shaker / stall warning heard', r.audio.some((a) => /stick shaker/.test(a.text)) || said(r, /Stall/), r.audio.filter((a) => /stick|Stall/.test(a.text)).map((a) => a.text).join(', '));
  check('flying too slowly: airspeed penalised or a crash', (r.result && r.result.items.some((i) => /Airspeed/.test(i.label) && !i.ok)) || (r.result && !r.result.success), r.headline);
}

// --------------------------------------------------------------------------- go-around with the keyboard
if (want('ga')) {
  section('E7', 'Go-around flown with the keyboard from 500 ft, then reposition (Fly the Approach and Flight School)');
  for (const mode of ['game', 'training']) {
    const tag = mode === 'training' ? 'Flight School ' : '';
    await start({ scenarioId: 'clear', startId: 'short', mode, sound: false, skipSchool: true });
    await page.evaluate(() => { window.__sim.autopilot(); window.__sim.setTimeScale(6); });
    await waitFor(() => window.__sim.state().agl < 500 * 0.3048, 120000, '500 ft');
    await page.evaluate(() => { window.__sim.setTimeScale(1); window.__sim.disengage(); });
    const agl0 = (await S()).agl;
    await tap('KeyT');                       // TOGA
    let minAgl = agl0; const t0 = Date.now();
    // pilot: pulse the up arrow to hold ~12° pitch, raise the gear when climbing, flaps 15
    let gearUp = false, flapsSet = false;
    while (Date.now() - t0 < 60000) {
      const s = await S();
      minAgl = Math.min(minAgl, s.agl);
      const pitchDeg = s.pitch * 57.3;
      if (pitchDeg < 11) await holdKey('ArrowUp', 120); else if (pitchDeg > 14) await holdKey('ArrowDown', 100); else await page.waitForTimeout(100);
      if (Math.abs(s.roll) > 0.05) await holdKey(s.roll > 0 ? 'ArrowLeft' : 'ArrowRight', 80);
      if (!gearUp && s.vs > 2) { await tap('KeyG'); gearUp = true; }
      if (!flapsSet && s.agl > 400 * 0.3048) { await tap('KeyV'); flapsSet = true; }
      if (s.agl > 1100 * 0.3048) break;
    }
    const s1 = await S(); const ev = await page.evaluate(() => window.__sim.events().map((e) => e.type + ':' + e.text));
    check(tag + 'go-around: aircraft climbed away without touching down', s1.agl > 1000 * 0.3048 && !s1.onGround && minAgl > 20, `from ${fmt(agl0 / 0.3048, 0)} ft, lowest ${fmt(minAgl / 0.3048, 0)} ft, now ${fmt(s1.agl / 0.3048, 0)} ft, gear ${s1.gearDown ? 'down' : 'up'}`);
    check(tag + 'go-around: detected and announced', ev.some((e) => e.startsWith('goaround')) && (await page.evaluate(() => window.__sim.audioLog().some((a) => /Go around/.test(a.text)))), ev.filter((e) => e.startsWith('goaround')).join(', '));
    check(tag + 'go-around: gear retracted with G', !s1.gearDown);
    await shot(mode === 'training' ? 'e2e-goaround-school' : 'e2e-goaround');
    await tap('Backspace'); await page.waitForTimeout(300);
    const s2 = await S();
    check(tag + 'Backspace repositions for another approach (same 4 nm start)', s2.distToThreshold <= 4.02 * 1852 && s2.distToThreshold > 3.6 * 1852 && !s2.gaMode && s2.gameState === 'flying', `${fmt(s2.distToThreshold / 1852)} nm, ${fmt(s2.alt / 0.3048, 0)} ft`);
  }
}

// --------------------------------------------------------------------------- frame-rate decoupling in the browser
if (want('fps')) {
  section('E8', 'Physics time is decoupled from the render frame rate');
  await start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false });
  await page.waitForTimeout(300);
  // The physics must integrate exactly the frame time the loop hands it, at any frame rate. Sim time
  // and frame time are both counted inside the same frames, so a window edge falling mid-frame cannot
  // skew the ratio; time dropped by the loop's 1 s per-frame cap is reported separately.
  await frames(3);                                        // let the heavy first frames after a restart pass
  const m = await page.evaluate(async () => {
    const st = window.__sim.stats, sim0 = window.__sim.state().time, ft0 = st.frameTime, wt0 = st.wallTime, f0 = st.frames;
    await new Promise((r) => setTimeout(r, 4000));
    return { sim: window.__sim.state().time - sim0, frameTime: st.frameTime - ft0, wall: st.wallTime - wt0, frames: st.frames - f0, fps: st.fps };
  });
  check('sim time tracks the frame time at 1x regardless of fps', m.frames >= 3 && Math.abs(m.sim - m.frameTime) < Math.max(0.05 * m.frameTime, 1 / 60), `sim ${fmt(m.sim, 2)} s for ${fmt(m.frameTime, 2)} s of frame time over ${m.frames} frames at ${fmt(m.fps, 1)} fps; ${fmt(m.wall - m.frameTime, 2)} s dropped by the 1 s frame cap`);
  const m4 = await page.evaluate(async () => {
    window.__sim.setTimeScale(4);
    const st = window.__sim.stats, sim0 = window.__sim.state().time, ft0 = st.frameTime;
    await new Promise((r) => setTimeout(r, 3000));
    const out = { sim: window.__sim.state().time - sim0, frameTime: st.frameTime - ft0 };
    window.__sim.setTimeScale(1);
    return out;
  });
  check('time scale 4x advances the physics 4x the frame time', Math.abs(m4.sim / m4.frameTime - 4) < 0.2, `ratio ${fmt(m4.sim / m4.frameTime, 2)} (${fmt(m4.sim, 2)} s for ${fmt(m4.frameTime, 2)} s)`);
}

// --------------------------------------------------------------------------- mouse-yoke + keyboard landing (human control path, real time)
if (!quick && want('keyboard')) {
  section('E9', 'Landing flown through the mouse yoke and the keyboard (real input events, real time)');
  // without drawing the page runs at 10-40 fps here; a person on a laptop gets 60. Measure the frame rate and, when it is
  // very low, slow the simulation so the pilot still gets a human-like ~10 decisions per simulated second.
  await page.setViewportSize({ width: 800, height: 450 });
  await start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 });
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(() => window.__sim.stats.fps);
  const scale = Math.max(0.35, Math.min(1, fps / 10));
  await page.evaluate((sc) => window.__sim.setTimeScale(sc), scale);
  console.log(`    render rate ${fmt(fps, 1)} fps -> simulation time scale ${fmt(scale, 2)}`);
  await tap('KeyX'); await tap('KeyN'); await tap('KeyN'); await tap('KeyN');   // arm speedbrake, autobrake 3
  await page.mouse.click(400, 225); await frames(2);                             // engage the mouse yoke
  check('mouse yoke engaged for the landing', await page.evaluate(() => window.__sim.inputManager.mouseEngaged));
  // The pilot runs inside the page at frame rate and only produces the events a person would:
  // mouse moves for pitch/roll, key presses for throttle, rudder, brakes and reversers. It is the
  // same human-like pilot the playtest harness uses (test/human-pilot.browser.js).
  await page.addScriptTag({ path: path.join(root, 'test', 'human-pilot.browser.js') });
  await page.evaluate(() => window.installHumanPilot({}));
  const done = await waitFor(() => window.__sim.game.state === 'finished', 600000, 'landing to finish');
  await page.evaluate(() => window.__sim.setTimeScale(1));
  const r = await page.evaluate(() => ({ result: window.__sim.result(), state: window.__sim.game.state, log: window.__sim.events().filter((e) => e.type === 'input').map((e) => e.text).slice(0, 12), trace: (window.__pilot.trace || []).slice(-24).map((x) => JSON.stringify(x)) }));
  if (!(r.result && r.result.success)) console.log('    trace:\n    ' + r.trace.join('\n    '));
  console.log(`  mouse+keyboard landing: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'not finished'} | inputs: ${r.log.join(', ')}`);
  check('mouse-yoke + keyboard approach ends with the aircraft stopped on the runway', done && r.result && r.result.success, r.result ? r.result.headline : 'no result');
  await shot('e2e-manual-landing');
  await page.setViewportSize({ width: VW, height: VH });
}

// --------------------------------------------------------------------------- phones: layout and touch controls
// A phone in landscape (iPhone 15 size, 852×393) with touch. Chromium has no notch to emulate, so the
// safe-area insets are set through the CSS variables the layout reads. Touches are real touch
// events sent through the DevTools protocol, which (unlike Playwright's tap) can hold several
// fingers at once.
async function phonePage() {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mp = await ctx.newPage();
  const bootLog = [];
  mp.on('console', (m) => { bootLog.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[phone ${m.type()}] ${m.text()}`); });
  mp.on('pageerror', (e) => consoleErrors.push(`[phone pageerror] ${e.message}`));
  // the desktop page stays open for the final error check; shrunk, its software rendering costs little
  // while the phone groups run (late in a full run, a full-size one slowed the phone page's boot past a minute)
  await page.setViewportSize({ width: 320, height: 180 });
  const t0 = Date.now();
  await mp.goto(url + '/');
  try { await mp.waitForFunction(() => window.__sim, null, { timeout: 180000 }); await drawOff(mp); } catch (e) { console.log('    phone page did not boot:\n    ' + bootLog.slice(-10).join('\n    ')); throw e; }
  console.log(`    phone page booted in ${fmt((Date.now() - t0) / 1000, 1)} s`);
  const cdp = await ctx.newCDPSession(mp);
  const pts = new Map();
  // touchStart / touchMove take every finger on the screen; touchEnd takes the fingers lifted
  const list = (m) => [...m.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const fingers = {
    down: async (id, x, y) => { pts.set(id, { x, y }); await send('touchStart', list(pts)); },
    move: async (id, x, y) => { pts.set(id, { x, y }); await send('touchMove', list(pts)); },
    up: async (id) => { const p = pts.get(id); pts.delete(id); await send('touchEnd', [{ x: p.x, y: p.y, id }]); },
  };
  const mf = async (n) => { await mp.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n); };
  const centreOf = (sel) => mp.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  return { ctx, mp, fingers, mf, centreOf };
}

if (want('mobile')) {
  section('E10', 'Phone in landscape: layout, touch controls, multi-touch, rotation and pausing');
  const { ctx, mp, fingers, mf, centreOf } = await phonePage();
  const SAFE = { l: 59, r: 59, t: 0, b: 21 };
  await mp.evaluate((s) => { const st = document.documentElement.style; st.setProperty('--sal', s.l + 'px'); st.setProperty('--sar', s.r + 'px'); st.setProperty('--sat', s.t + 'px'); st.setProperty('--sab', s.b + 'px'); }, SAFE);
  const MS = () => mp.evaluate(() => { const s = window.__sim.state(), g = window.__sim.game; return { gameState: g.state, gaMode: g.ctx.gaMode, dist: s.distToThreshold, onGround: s.onGround }; });
  const MI = () => mp.evaluate(() => Object.assign({}, window.__sim.input()));
  await mf(2);
  check('a phone is detected as a touch device', await mp.evaluate(() => document.body.classList.contains('touch') && window.__sim.inputManager.touchMode));
  const menu = await mp.evaluate(() => { const t = document.querySelector('.menu-panel h1').getBoundingClientRect(), b = document.getElementById('btn-start').getBoundingClientRect(); return { titleTop: Math.round(t.top), startBottom: Math.round(b.bottom), vh: innerHeight }; });
  check('menu fits a 393 px tall screen: title and Start both visible without scrolling', menu.titleTop >= 0 && menu.startBottom <= menu.vh, `title at ${menu.titleTop} px, Start ends at ${menu.startBottom} of ${menu.vh}`);
  await snap(mp, 'e2e-phone-menu');
  await mp.tap('#btn-start'); await mf(4);
  check('tapping Start begins the flight', (await MS()).gameState === 'flying');

  const lay = await mp.evaluate((S) => {
    const ids = ['t-gear', 't-autobrake', 't-flaps-up', 't-flaps-dn', 't-arm', 't-ext', 't-toga', 't-lever-body', 't-rudder', 't-stick-zone', 't-view', 't-pause', 't-help'];
    const rects = ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    const W = innerWidth, H = innerHeight;
    const outside = rects.filter((r) => r.w === 0 || r.l < S.l || r.r > W - S.r || r.t < S.t || r.b > H - S.b).map((r) => r.id);
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (hit(rects[i], rects[j])) overlaps.push(rects[i].id + '/' + rects[j].id);
    const small = rects.filter((r) => r.w < 34 || r.h < 40).map((r) => `${r.id} ${Math.round(r.w)}×${Math.round(r.h)}`);
    const g = document.getElementById('hgs').getBoundingClientRect();
    const hgs = { l: g.left, r: g.right, t: g.top, b: g.bottom };
    const hgsHits = rects.filter((r) => r.id !== 't-stick-zone' && hit(r, hgs)).map((r) => r.id);
    return { outside, overlaps, small, hgsHits, strip: getComputedStyle(document.getElementById('hud-bottom')).display, ias: document.getElementById('g-ias').textContent, alt: document.getElementById('g-altv').textContent };
  }, SAFE);
  check('every touch control sits inside the notch and home-bar safe area', lay.outside.length === 0, lay.outside.join(', ') || '13 controls checked');
  check('no two touch controls overlap', lay.overlaps.length === 0, lay.overlaps.join(', '));
  check('touch targets are at least 34×40 px', lay.small.length === 0, lay.small.join(', '));
  check('the head-up display is clear of the buttons and levers', lay.hgsHits.length === 0, lay.hgsHits.join(', '));
  check('the head-up display replaces the desktop readout strip', lay.strip === 'none' && /^\d+$/.test(lay.ias) && /^\d+$/.test(lay.alt), `IAS ${lay.ias}, ALT ${lay.alt}`);
  await snap(mp, 'e2e-phone-flying');
  // the same rules on other phones, in each state that shows other buttons (BRAKE on the ground,
  // REPOSITION in a go-around, CENTER with tilt): iPhone SE and a 640×360 Android (no notch), the
  // narrowest notched iPhone (13 mini, 812×375 with 50 px side insets), and short screens, where
  // Safari's address and tab bars in landscape leave 265–330 px (the compact layout)
  const setSafe = (s) => mp.evaluate((s) => { const st = document.documentElement.style; st.setProperty('--sal', s.l + 'px'); st.setProperty('--sar', s.r + 'px'); st.setProperty('--sat', s.t + 'px'); st.setProperty('--sab', s.b + 'px'); }, s);
  const N0 = { l: 0, r: 0, t: 0, b: 0 };
  const SIZES = [
    { width: 667, height: 375, safe: N0 }, { width: 640, height: 360, safe: N0 }, { width: 812, height: 375, safe: { l: 50, r: 50, t: 0, b: 21 } },
    { width: 932, height: 320, safe: SAFE, name: 'iPhone Pro Max, Safari with tab bar' }, { width: 852, height: 283, safe: SAFE, name: 'iPhone 15, Safari with tab bar' },
    { width: 812, height: 265, safe: { l: 50, r: 50, t: 0, b: 21 }, name: 'iPhone 13 mini, Safari with tab bar' }, { width: 667, height: 265, safe: N0, name: 'iPhone SE, Safari with tab bar' },
    { width: 640, height: 304, safe: N0, name: 'Android, Chrome' },
  ];
  for (const vp of SIZES) {
    await mp.setViewportSize({ width: vp.width, height: vp.height }); await setSafe(vp.safe); await mf(3);
    const bad = await mp.evaluate((S) => {
      const bad = [];
      for (const state of ['air', 'go-around', 'ground', 'tilt']) {
        const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
        show('t-reposition', state === 'go-around'); show('t-brake', state === 'ground'); document.body.classList.toggle('tilt', state === 'tilt');
        const ids = ['t-gear', 't-autobrake', 't-flaps-up', 't-flaps-dn', 't-arm', 't-ext', 't-toga', 't-lever-body', 't-rudder', 't-stick-zone', 't-view', 't-pause', 't-help', 't-reposition', 't-brake', 't-center', 'hgs'];
        const rects = ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }).filter((r) => r.w > 0);
        const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
        // the head-up display and CENTER may lie over the stick's area (it has no drawn edge)
        const allowed = (a, b) => [a, b].includes('t-stick-zone') && ([a, b].includes('hgs') || [a, b].includes('t-center'));
        for (const r of rects) if (r.id !== 'hgs' && (r.l < S.l - 0.5 || r.t < S.t - 0.5 || r.r > innerWidth - S.r + 0.5 || r.b > innerHeight - S.b + 0.5)) bad.push(`${state}: ${r.id} outside the safe area`);
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (!allowed(rects[i].id, rects[j].id) && hit(rects[i], rects[j])) bad.push(`${state}: ${rects[i].id}/${rects[j].id}`);
        for (const r of rects) if (!['hgs', 't-stick-zone'].includes(r.id) && (r.w < 34 || r.h < 39)) bad.push(`${state}: ${r.id} ${Math.round(r.w)}×${Math.round(r.h)}`);
        // the thrust lever keeps a usable travel
        const tr = document.querySelector('#t-lever .ttrack').getBoundingClientRect().height;
        if (tr < 80) bad.push(`${state}: lever travel ${Math.round(tr)} px`);
      }
      document.getElementById('t-reposition').classList.add('hidden'); document.getElementById('t-brake').classList.add('hidden'); document.body.classList.remove('tilt');
      return bad;
    }, vp.safe);
    const compact = await mp.evaluate(() => document.body.classList.contains('compact'));
    check(`${vp.width}×${vp.height}${vp.name ? ` (${vp.name})` : ''}: controls inside the safe area, apart, at least 34×39 px, lever travel ≥ 80 px, in every state`, bad.length === 0, bad.join(', ') || (compact ? 'compact layout' : 'full layout'));
    if (vp.width === 932 && vp.height === 320) await snap(mp, 'e2e-phone-safari-toolbars');
  }
  await mp.setViewportSize({ width: 852, height: 393 }); await setSafe(SAFE); await mf(2);

  // buttons: real taps
  const i0 = await MI();
  await mp.tap('#t-gear'); await mp.tap('#t-flaps-dn'); await mp.tap('#t-arm'); await mp.tap('#t-autobrake'); await mp.tap('#t-autobrake'); await mf(2);
  const i1 = await MI();
  check('GEAR, FLAPS +, ARM and A/BRK buttons drive the aircraft', i1.gearDown !== i0.gearDown && i1.flapIndex === i0.flapIndex + 1 && i1.speedbrakeArmed && i1.autobrake === 2, `gear ${i1.gearDown}, flaps ${i0.flapIndex}→${i1.flapIndex}, armed ${i1.speedbrakeArmed}, autobrake ${i1.autobrake}`);
  const btnTxt = await mp.evaluate(() => ({ flaps: document.getElementById('t-flaps-val').textContent, ab: document.querySelector('#t-autobrake b').textContent, armOn: document.getElementById('t-arm').classList.contains('on') }));
  check('the buttons show the new settings', btnTxt.ab === '2' && btnTxt.armOn && Number(btnTxt.flaps) > 0, JSON.stringify(btnTxt));
  await mp.tap('#t-flaps-up'); await mp.tap('#t-ext'); await mf(2);
  const i2 = await MI();
  check('FLAPS − and EXT (speedbrakes out) work', i2.flapIndex === i0.flapIndex && i2.speedbrake === 1 && !i2.speedbrakeArmed, `flaps ${i2.flapIndex}, speedbrake ${i2.speedbrake}`);
  await mp.tap('#t-ext'); await mf(1);

  // the stick, and two thumbs at once
  const base = await centreOf('#t-stick-zone .tbase');
  await fingers.down(1, base.x, base.y); await fingers.move(1, base.x, base.y - 45); await mf(3);
  const s1 = await MI();
  check('stick up = nose up', s1.pitch > 0.3, `pitch input ${fmt(s1.pitch, 2)}`);
  const handle = await centreOf('#t-lever .thandle');
  await fingers.down(2, handle.x, handle.y); await fingers.move(2, handle.x, handle.y + 30); await mf(3);
  const s2 = await MI();
  check('two thumbs at once: the thrust lever moves while the stick is held', s2.throttle < s1.throttle - 0.1 && s2.pitch > 0.3, `throttle ${fmt(s1.throttle, 2)}→${fmt(s2.throttle, 2)}, pitch ${fmt(s2.pitch, 2)}`);
  await fingers.up(2); await mf(3);
  const s3 = await MI();
  check('the thrust lever stays where it was left; the other thumb keeps the stick', Math.abs(s3.throttle - s2.throttle) < 0.01 && s3.pitch > 0.3, `throttle ${fmt(s3.throttle, 2)}, pitch ${fmt(s3.pitch, 2)}`);
  await fingers.move(1, base.x + 45, base.y); await mf(3);
  const s4 = await MI();
  check('stick right = roll right', s4.roll > 0.3 && Math.abs(s4.pitch) < 0.1, `roll ${fmt(s4.roll, 2)}, pitch ${fmt(s4.pitch, 2)}`);
  await fingers.up(1); await mf(2); await simWaitOn(mp, 0.5);   // the spring takes ~0.3 s of flight time
  const s5 = await MI();
  check('released, the stick springs back to centre', Math.abs(s5.pitch) < 0.02 && Math.abs(s5.roll) < 0.02, `pitch ${fmt(s5.pitch, 3)}, roll ${fmt(s5.roll, 3)}`);
  const lv = await centreOf('#t-lever .thandle');
  await fingers.down(3, lv.x, lv.y); await fingers.move(3, lv.x, lv.y + 220); await fingers.up(3); await mf(3);
  const s6 = await MI();
  check('in the air the lever stops at idle: the reverse gate stays shut', s6.throttle === 0 && !s6.reverse, `throttle ${s6.throttle}, reverse ${s6.reverse}`);
  const rd = await centreOf('#t-rudder');
  await fingers.down(4, rd.x, rd.y); await fingers.move(4, rd.x + 50, rd.y); await mf(3);
  const s7 = await MI();
  await fingers.up(4); await mf(2); await simWaitOn(mp, 0.5);
  const s8 = await MI();
  check('rudder strip: right = right rudder, and it springs back', s7.yaw > 0.4 && Math.abs(s8.yaw) < 0.02, `yaw ${fmt(s7.yaw, 2)} → ${fmt(s8.yaw, 3)}`);
  await fingers.down(5, 430, 60); await fingers.move(5, 330, 60); await mf(2);
  const lk = await mp.evaluate(() => window.__sim.inputManager.look.yaw);
  await fingers.up(5); await mf(1);
  const lk2 = await mp.evaluate(() => window.__sim.inputManager.look.yaw);
  check('dragging on the windshield looks around and lets go straight ahead', Math.abs(lk) > 0.3 && lk2 === 0, `look yaw ${fmt(lk, 2)} → ${lk2}`);
  const vstate = () => mp.evaluate(() => ({ down: window.__sim.inputManager.look.down, mode: window.__sim.view.mode, label: document.getElementById('t-view-mode').textContent }));
  await mp.tap('#t-view'); await mf(2); const v1 = await vstate();
  await mp.tap('#t-view'); await mf(2); const v2 = await vstate();
  await mp.tap('#t-view'); await mf(2); const v3 = await vstate();
  check('VIEW cycles cockpit → panel → head-up → cockpit, and says which', v1.down && v1.mode === 'cockpit' && v1.label === 'PANEL' && !v2.down && v2.mode === 'hud' && v2.label === 'HEAD-UP' && !v3.down && v3.mode === 'cockpit' && v3.label === 'COCKPIT', JSON.stringify([v1, v2, v3]));

  // go-around and reposition through the buttons
  await mp.tap('#t-toga'); await mf(2);
  const g1 = await MS(), gi = await MI();
  const repVisible = await mp.evaluate(() => !document.getElementById('t-reposition').classList.contains('hidden'));
  check('TO/GA gives full thrust, starts a go-around and offers REPOSITION', gi.throttle === 1 && g1.gaMode && repVisible);
  const gaDist = g1.dist;
  await mp.tap('#t-reposition'); await mf(2);
  const g2 = await MS();
  const repositioned = await mp.evaluate(() => window.__sim.events().some((e) => e.type === 'reposition'));
  check('REPOSITION puts the aircraft back on final', repositioned && !g2.gaMode && g2.dist <= 10.02 * 1852 && g2.dist > gaDist + 0.2 * 1852 && await mp.evaluate(() => document.getElementById('t-reposition').classList.contains('hidden')), `${fmt(gaDist / 1852)} → ${fmt(g2.dist / 1852)} nm`);

  // pause, rotation, leaving the app
  await mp.tap('#t-pause'); await mf(1);
  check('the pause button pauses', (await MS()).gameState === 'paused' && await mp.evaluate(() => !document.getElementById('pause').classList.contains('hidden')));
  await mp.tap('#btn-resume'); await mf(1);
  await mp.setViewportSize({ width: 393, height: 852 }); await mf(2);
  const rot = await mp.evaluate(() => ({ shown: !document.getElementById('rotate').classList.contains('hidden'), state: window.__sim.game.state }));
  check('turning the phone upright pauses and asks for landscape', rot.shown && rot.state === 'paused', JSON.stringify(rot));
  await snap(mp, 'e2e-phone-portrait');
  await mp.setViewportSize({ width: 852, height: 393 }); await mf(2);
  check('back in landscape the rotate screen goes and the flight waits for Resume', await mp.evaluate(() => document.getElementById('rotate').classList.contains('hidden') && window.__sim.game.state === 'paused'));
  await mp.tap('#btn-resume'); await mf(1);
  await mp.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; });
  check('switching away from the browser pauses the flight', (await MS()).gameState === 'paused');

  // the autoland demo hands over when the stick is touched
  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false, demo: true })); await mf(2);
  const b2 = await centreOf('#t-stick-zone .tbase');
  await fingers.down(1, b2.x, b2.y); await fingers.move(1, b2.x, b2.y - 10); await mf(3); await fingers.up(1); await mf(1);
  check('touching the stick takes over from the autoland demo', await mp.evaluate(() => window.__sim.game.demoAp === null && window.__sim.events().some((e) => e.type === 'demo' && e.text === 'disengaged')));

  // Flight School on a phone: touch wording and highlights on the touch controls
  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'training', sound: false })); await mf(3);
  const total = parseInt((await mp.evaluate(() => document.getElementById('school-step').textContent)).split('/')[1], 10);
  let kbdSeen = 0, chips = 0, framed = 0, domAnchors = 0, cardOk = true;
  for (let k = 0; k < total; k++) {
    await mf(2); await mp.waitForTimeout(400); await mf(1);   // the highlight glides to its target over 0.3 s
    const info = await mp.evaluate((k) => {
      const body = document.getElementById('school-body');
      const h = document.getElementById('school-highlight').getBoundingClientRect();
      const card = document.getElementById('school-card').getBoundingClientRect();
      return { kbd: body.innerHTML.includes('<kbd>'), chips: body.querySelectorAll('.tc').length, h: { l: h.left, t: h.top, r: h.right, b: h.bottom }, card: { l: card.left, t: card.top, r: card.right, b: card.bottom }, W: innerWidth, H: innerHeight };
    }, k);
    const anchor = await mp.evaluate(async (k) => { const m = await import('./js/ui.js'); return m.schoolPage(m.SCHOOL_STEPS[k]).anchor; }, k);
    if (info.kbd) kbdSeen++;
    if (info.chips) chips++;
    if (anchor[0] === '#') {
      domAnchors++;
      const r = await mp.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, anchor);
      if (info.h.l <= r.l && info.h.t <= r.t && info.h.r >= r.r && info.h.b >= r.b) framed++;
      else console.log(`    step ${k + 1}: highlight does not frame ${anchor}`);
    }
    if (info.card.l < 0 || info.card.t < 0 || info.card.r > info.W || info.card.b > info.H) { cardOk = false; console.log(`    step ${k + 1}: card off screen ${JSON.stringify(info.card)}`); }
    if (k === 6) await snap(mp, 'e2e-phone-school');
    if (k < total - 1) { await mp.tap('#school-next'); }
  }
  check('Flight School on a phone names the touch controls, never keys', kbdSeen === 0 && chips >= 8, `${chips} of ${total} pages show touch controls, ${kbdSeen} show keys`);
  check('each touch page frames its control or display', framed === domAnchors && domAnchors === total, `${framed}/${domAnchors} framed`);
  check('the school card stays on screen', cardOk);
  await mp.tap('#school-next'); await mf(4);
  await mp.waitForTimeout(1500); await mf(2);
  const instr = await mp.evaluate(() => document.getElementById('instructor').innerHTML);
  check('instructor hints use the touch controls', instr.length > 10 && !instr.includes('<kbd>'), instr.replace(/<[^>]+>/g, '').slice(0, 70));
  const perr = await mp.evaluate(() => window.__sim.errors);
  check('no JavaScript errors on the phone', perr.length === 0, perr.slice(0, 3).join(' | '));
  await ctx.close();
}

// --------------------------------------------------------------------------- phones: a landing flown with the touch controls
if (!quick && want('touchland')) {
  section('E11', 'Landing flown through the touch controls (phone, real time)');
  const { ctx, mp, mf } = await phonePage();
  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 }));
  await mp.waitForTimeout(2500); await mf(3); await mp.waitForTimeout(1000);
  const fps = await mp.evaluate(() => window.__sim.stats.fps);
  const scale = Math.max(0.35, Math.min(1, fps / 10));
  await mp.evaluate((sc) => window.__sim.setTimeScale(sc), scale);
  console.log(`    render rate ${fmt(fps, 1)} fps -> simulation time scale ${fmt(scale, 2)}`);
  await mp.tap('#t-arm'); await mp.tap('#t-autobrake'); await mp.tap('#t-autobrake'); await mp.tap('#t-autobrake'); await mf(1);   // real taps: arm, autobrake 3
  // the same human-like pilot, flying through the stick, thrust lever, rudder strip, REV gate and BRAKE button
  await mp.addScriptTag({ path: path.join(root, 'test', 'human-pilot.browser.js') });
  await mp.evaluate(() => window.installHumanPilot({ input: 'touch' }));
  let done = true;
  try { await mp.waitForFunction(() => window.__sim.game.state === 'finished', null, { timeout: 600000 }); } catch (e) { done = false; console.log('    (timeout waiting for the landing to finish)'); }
  await mp.evaluate(() => window.__sim.setTimeScale(1));
  const r = await mp.evaluate(() => ({ result: window.__sim.result(), log: window.__sim.events().filter((e) => e.type === 'input').map((e) => e.text), mouse: window.__sim.inputManager.mouseEngaged, trace: (window.__pilot.trace || []).slice(-24).map((x) => JSON.stringify(x)) }));
  if (!(r.result && r.result.success)) console.log('    trace:\n    ' + r.trace.join('\n    '));
  console.log(`  touch landing: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'not finished'} | inputs: ${r.log.slice(0, 14).join(', ')}`);
  if (r.result) console.log('    ' + r.result.items.map((it) => `${it.label}: ${it.value}`).join(' · '));
  check('a landing flown only with the touch controls ends stopped on the runway', done && r.result && r.result.success, r.result ? r.result.headline : 'no result');
  check('the roll-out used the REV gate on the thrust lever, and no mouse yoke', r.log.includes('reverse on') && r.log.includes('reverse off') && !r.mouse);
  await snap(mp, 'e2e-phone-landing');
  await ctx.close();
}

// --------------------------------------------------------------------------- phones: tilt steering, vibration, home-screen app
// The motion sensor is simulated (test/tilt-pose.browser.js): readings a phone held in landscape
// would send, every 16 ms. navigator.vibrate is replaced by a recorder.
async function tiltPhonePage() {
  const P = await phonePage();
  await P.mp.addScriptTag({ path: path.join(root, 'test', 'tilt-pose.browser.js') });
  await P.mp.evaluate(() => { window.__vib = []; Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__vib.push(p); return true; }, configurable: true }); });
  return P;
}

if (want('tilt')) {
  section('E12', 'Tilt steering, vibration and the home-screen app (phone)');
  const { ctx, mp, mf } = await tiltPhonePage();
  // after the pose changes: 0.3 s of sensor readings (the tilt filter's time constant is 0.06 s),
  // then frames flowing again (see steady) so the controls have followed
  const tiltSettle = async () => { await mf(3); await mp.waitForTimeout(300); await steady(mp); };
  const MI = () => mp.evaluate(() => Object.assign({}, window.__sim.input()));
  const TL = () => mp.evaluate(() => Object.assign({}, window.__sim.inputManager.tilt, { status: window.__sim.tilt.status, flip: window.__sim.tilt.flip, neutral: !!window.__sim.tilt.neutral, body: document.body.classList.contains('tilt'), checked: document.getElementById('opt-tilt').checked, msg: document.getElementById('tilt-msg').textContent }));
  await mf(2);
  const opts = await mp.evaluate(() => ({ tilt: getComputedStyle(document.getElementById('opt-tilt').parentElement).display !== 'none', vib: getComputedStyle(document.getElementById('opt-vib').parentElement).display !== 'none' }));
  check('the menu offers Tilt to fly and Vibration on a phone', opts.tilt && opts.vib, JSON.stringify(opts));

  await mp.tap('#opt-tilt'); await mp.waitForTimeout(1900);
  let t = await TL();
  check('without a motion sensor, tilt switches itself off and says why', !t.checked && !t.body && t.status === 'nosensor' && /No motion sensor/.test(t.msg), t.msg);
  await mp.evaluate(() => { window.__asked = 0; DeviceOrientationEvent.requestPermission = () => { window.__asked++; return Promise.resolve('denied'); }; });
  await mp.tap('#opt-tilt'); await mp.waitForTimeout(300);
  t = await TL();
  check('motion access declined: the stick stays on and the menu says how to be asked again', !t.checked && t.status === 'denied' && /declined/.test(t.msg) && await mp.evaluate(() => window.__asked === 1), t.msg);
  await mp.evaluate(() => { window.__asked = 0; DeviceOrientationEvent.requestPermission = () => { window.__asked++; return Promise.resolve('granted'); }; window.tiltFeed.start({ back: 35 }); });
  await mp.tap('#opt-tilt'); await mp.waitForTimeout(300);
  t = await TL();
  check('motion access asked for from the tap and granted: tilt is on', t.checked && t.body && t.status === 'on' && !t.msg && await mp.evaluate(() => window.__asked === 1), `status ${t.status}`);
  check('the choice is remembered on this device', await mp.evaluate(() => localStorage.getItem('tilt') === '1'));

  await mp.tap('#btn-start'); await mf(4);
  t = await TL();
  const zone = await mp.evaluate(() => ({ label: document.querySelector('#t-stick-zone .tlabel').textContent, pe: getComputedStyle(document.getElementById('t-stick-zone')).pointerEvents, center: getComputedStyle(document.getElementById('t-center')).display }));
  check('the flight starts level with the phone as it is held; the circle shows TILT and CENTER appears', t.active && t.neutral && Math.abs(t.pitch) < 0.03 && Math.abs(t.roll) < 0.03 && zone.label === 'TILT' && zone.pe === 'none' && zone.center !== 'none', `tilt ${fmt(t.pitch, 2)}/${fmt(t.roll, 2)}, ${JSON.stringify(zone)}`);
  await mp.evaluate(() => window.tiltFeed.set({ pull: 10 })); await tiltSettle();
  let i1 = await MI(); t = await TL();
  const knob = await mp.evaluate(() => document.querySelector('#t-stick-zone .tknob').style.transform);
  check('top edge 10° towards you = nose up', t.pitch > 0.4 && i1.pitch > 0.2 && Math.abs(i1.roll) < 0.05, `tilt ${fmt(t.pitch, 2)}, pitch input ${fmt(i1.pitch, 2)}`);
  check('the circle shows the tilt', /translate\(-?[\d.]+px, -[\d.]+px\)/.test(knob), knob);
  await mp.evaluate(() => window.tiltFeed.set({ pull: 0, bank: 10 })); await tiltSettle();
  i1 = await MI();
  check('left side 10° down = bank left', i1.roll < -0.15 && Math.abs(i1.pitch) < 0.05, `roll input ${fmt(i1.roll, 2)}`);
  await mp.evaluate(() => window.tiltFeed.set({ pull: 0, bank: 0 })); await tiltSettle();
  i1 = await MI();
  check('back to how it was held: controls centred', Math.abs(i1.pitch) < 0.02 && Math.abs(i1.roll) < 0.02, `${fmt(i1.pitch, 3)}, ${fmt(i1.roll, 3)}`);
  await mp.evaluate(() => { window.__sim.inputManager.opts.invertPitch = true; window.tiltFeed.set({ pull: 10 }); }); await tiltSettle();
  i1 = await MI();
  check('pilot-style pitch does not reverse tilt: tipping towards you is always nose up', i1.pitch > 0.2, `pitch input ${fmt(i1.pitch, 2)}`);
  await mp.evaluate(() => { window.__sim.inputManager.opts.invertPitch = false; window.tiltFeed.set({ pull: -15 }); }); await tiltSettle();
  const lean = (await MI()).pitch;
  await mp.tap('#t-center'); await mf(3);
  i1 = await MI();
  check('CENTER makes the way the phone is held now level', lean < -0.3 && Math.abs(i1.pitch) < 0.03, `pitch input ${fmt(lean, 2)} → ${fmt(i1.pitch, 3)}`);
  await mp.evaluate(() => window.tiltFeed.set({ pull: -5 })); await tiltSettle();
  const before = (await TL()).pitch;
  await mp.tap('#t-pause'); await mf(1); await mp.tap('#btn-resume'); await mf(4);
  t = await TL();
  check('resuming after a pause takes the phone\'s position as level again', before > 0.3 && Math.abs(t.pitch) < 0.03, `tilt ${fmt(before, 2)} → ${fmt(t.pitch, 3)}`);
  await mp.evaluate(() => window.tiltFeed.stop()); await mp.waitForTimeout(1400); await mf(2);
  t = await TL();
  const lbl = await mp.evaluate(() => document.querySelector('#t-stick-zone .tlabel').textContent);
  check('a sensor that stops reporting lets go of the controls', !t.active && t.pitch === 0 && /hold level/.test(lbl), lbl);
  await mp.evaluate(() => { Object.defineProperty(screen.orientation, 'angle', { get: () => 270, configurable: true }); window.tiltFeed.start({ back: 35, pull: 0, bank: 0 }); });
  await mf(2); await mp.tap('#t-center'); await mf(3);
  await mp.evaluate(() => window.tiltFeed.set({ pull: 10, bank: 10 })); await tiltSettle();
  t = await TL();
  check('a browser that reports the screen angle the other way round is corrected at CENTER', t.flip && t.pitch > 0.4 && t.roll < -0.3, `flip ${t.flip}, tilt ${fmt(t.pitch, 2)}/${fmt(t.roll, 2)}`);
  await mp.evaluate(() => { delete screen.orientation.angle; window.__sim.tilt.flip = false; window.tiltFeed.set({ pull: 0, bank: 0 }); });

  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false, demo: true })); await mf(4);
  await mp.evaluate(() => window.tiltFeed.set({ pull: 12 })); await tiltSettle();
  check('tilting the phone takes over from the autoland demo', await mp.evaluate(() => window.__sim.game.demoAp === null));
  await mp.evaluate(() => window.tiltFeed.set({ pull: 0 }));
  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'training', sound: false })); await mf(3);
  const welcome = await mp.evaluate(() => document.getElementById('school-body').textContent);
  await mp.tap('#school-next'); await mf(2); await mp.waitForTimeout(400); await mf(1);
  const s2 = await mp.evaluate(() => ({ title: document.getElementById('school-title').textContent, body: document.getElementById('school-body').innerHTML }));
  check('Flight School explains tilt steering and CENTER', /tilting the phone/.test(welcome) && s2.title === 'Attitude and tilt steering' && s2.body.includes('CENTER') && !s2.body.includes('<kbd>'), s2.title);
  await snap(mp, 'e2e-phone-tilt-school');
  await mp.tap('#school-skip'); await mf(2);

  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false })); await mf(3);   // gear up at 10 nm
  await mp.evaluate(() => { window.__vib.length = 0; });
  await mp.tap('#t-gear'); await mf(1);
  const v1 = await mp.evaluate(() => window.__vib.slice());
  check('pressing a touch control gives a short tick', v1.includes(8), JSON.stringify(v1));
  await mp.waitForFunction(() => window.__sim.state().gearDown, null, { timeout: 120000 }); await mf(2);
  check('the gear locking down gives a thump', await mp.evaluate(() => window.__vib.includes(25)), JSON.stringify(await mp.evaluate(() => window.__vib.slice(0, 8))));
  await snap(mp, 'e2e-phone-tilt');
  await mp.evaluate(() => window.__sim.game.quitToMenu()); await mf(2);
  await mp.tap('#opt-vib'); await mf(1);
  await mp.evaluate(() => { window.__vib.length = 0; });
  await mp.tap('#btn-start'); await mf(3); await mp.tap('#t-gear'); await mf(1);
  check('Vibration switched off: nothing vibrates', await mp.evaluate(() => window.__vib.filter((p) => p !== 0).length === 0 && localStorage.getItem('vibration') === '0'));

  const app = await mp.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]'), apple = document.querySelector('link[rel="apple-touch-icon"]');
    const m = await (await fetch(link.href)).json();
    const size = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(`${im.naturalWidth}x${im.naturalHeight}`); im.onerror = () => res('missing'); im.src = new URL(src, link.href).href; });
    const icons = [];
    for (const ic of m.icons) icons.push({ want: ic.sizes, got: await size(ic.src), purpose: ic.purpose });
    return { display: m.display, orientation: m.orientation, start: m.start_url, icons, apple: await size(apple.getAttribute('href')), capable: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]') };
  });
  const iconsOk = app.icons.every((i) => (i.want === 'any' ? i.got !== 'missing' : i.got === i.want));
  check('home-screen app: full screen, landscape, and every icon loads at its size', app.display === 'fullscreen' && app.orientation === 'landscape' && app.start === './' && iconsOk && app.icons.some((i) => i.purpose === 'maskable') && app.apple === '180x180' && app.capable, `${app.icons.map((i) => i.got).join(', ')}; apple ${app.apple}`);
  const perr = await mp.evaluate(() => window.__sim.errors);
  check('no JavaScript errors in the tilt session', perr.length === 0, perr.slice(0, 3).join(' | '));
  await ctx.close();

  // sound on an iPhone (its user agent; Chromium has no Audio Session API, like older iOS): tapping
  // Start starts the sound and the silent looping media element that takes it off the silent switch
  const ictx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' });
  const ip = await ictx.newPage();
  ip.on('pageerror', (e) => consoleErrors.push(`[iphone pageerror] ${e.message}`));
  await ip.goto(url + '/?quality=low');
  await ip.waitForFunction(() => window.__sim, null, { timeout: 180000 }); await drawOff(ip);
  await ip.tap('#btn-start');
  await ip.waitForFunction(() => window.__sim.audio.ctx && window.__sim.audio.ctx.state === 'running' && window.__sim.audio.keepAlive && !window.__sim.audio.keepAlive.paused, null, { timeout: 30000 }).catch(() => {});
  const snd = await ip.evaluate(() => { const a = window.__sim.audio; return { ios: document.body.classList.contains('ios'), state: a.ctx && a.ctx.state, keep: !!a.keepAlive && !a.keepAlive.paused && a.keepAlive.loop, speech: a.speechPrimed, err: window.__sim.errors.length }; });
  check('iPhone: tapping Start starts the sound, with the silent-switch workaround playing and speech unlocked', snd.ios && snd.state === 'running' && snd.keep && snd.speech && snd.err === 0, JSON.stringify(snd));
  await ictx.close();
}

// --------------------------------------------------------------------------- phones: a landing flown by tilting the phone
if (!quick && want('tiltland')) {
  section('E13', 'Landing flown by tilting the phone (phone, real time)');
  const { ctx, mp, mf } = await tiltPhonePage();
  await mp.evaluate(() => window.tiltFeed.start({ back: 35 }));
  await mp.tap('#opt-tilt'); await mp.waitForTimeout(300);
  await mp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 }));
  await mp.waitForTimeout(2500); await mf(3); await mp.waitForTimeout(1000);
  const fps = await mp.evaluate(() => window.__sim.stats.fps);
  const scale = Math.max(0.35, Math.min(1, fps / 10));
  await mp.evaluate((sc) => window.__sim.setTimeScale(sc), scale);
  console.log(`    render rate ${fmt(fps, 1)} fps -> simulation time scale ${fmt(scale, 2)}`);
  const ready = await mp.evaluate(() => ({ active: window.__sim.inputManager.tilt.active, tilt: document.body.classList.contains('tilt') }));
  check('tilt steering is on and centred for the approach', ready.active && ready.tilt, JSON.stringify(ready));
  await mp.tap('#t-arm'); await mp.tap('#t-autobrake'); await mp.tap('#t-autobrake'); await mp.tap('#t-autobrake'); await mf(1);
  // the human-like pilot: pitch and roll by tilting the phone, thrust, rudder, reversers and buttons by touch
  await mp.addScriptTag({ path: path.join(root, 'test', 'human-pilot.browser.js') });
  await mp.evaluate(() => window.installHumanPilot({ input: 'tilt' }));
  let done = true;
  try { await mp.waitForFunction(() => window.__sim.game.state === 'finished', null, { timeout: 600000 }); } catch (e) { done = false; console.log('    (timeout waiting for the landing to finish)'); }
  await mp.evaluate(() => window.__sim.setTimeScale(1));
  const r = await mp.evaluate(() => ({ result: window.__sim.result(), log: window.__sim.events().filter((e) => e.type === 'input').map((e) => e.text), vib: window.__vib.slice(), stick: window.__sim.inputManager.touch.stickHeld, trace: (window.__pilot.trace || []).slice(-24).map((x) => JSON.stringify(x)) }));
  if (!(r.result && r.result.success)) console.log('    trace:\n    ' + r.trace.join('\n    '));
  console.log(`  tilt landing: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'not finished'} | inputs: ${r.log.slice(0, 14).join(', ')}`);
  if (r.result) console.log('    ' + r.result.items.map((it) => `${it.label}: ${it.value}`).join(' · '));
  check('a landing flown by tilting the phone ends stopped on the runway', done && r.result && r.result.success, r.result ? r.result.headline : 'no result');
  const td = r.vib.filter((p) => (typeof p === 'number' && p >= 18 && p <= 60 && p !== 20 && p !== 25) || (Array.isArray(p) && p[0] === 70));
  check('the roll-out used the REV gate, and the touchdown was felt as a vibration', r.log.includes('reverse on') && r.log.includes('reverse off') && td.length > 0 && !r.stick, `touchdown vibration ${JSON.stringify(td[0])}`);
  await snap(mp, 'e2e-phone-tilt-landing');
  await ctx.close();
}

// --------------------------------------------------------------------------- game controller
// Browsers cannot emulate a controller: test/gamepad-stub.browser.js replaces navigator.getGamepads()
// with a standard-layout controller that the test presses (held until the game has read it).
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
// iphone: Safari's rules where Chromium differs. No navigator.vibrate, and a screen wake lock
// granted only to a request made during a gesture (then to any; WebKit's WakeLock::request).
// window.__gesture marks the test's stand-in for a gesture; requests and releases go to __locks.
async function padPage({ phone = false, iphone = false } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(iphone ? { userAgent: IPHONE_UA } : {}) } : { viewport: { width: 1024, height: 576 } });
  if (iphone) await ctx.addInitScript(() => {
    delete Navigator.prototype.vibrate;
    window.__gesture = false; window.__locks = []; let authorized = false;
    const request = (type) => {
      const granted = window.__gesture || authorized;
      if (window.__gesture) authorized = true;
      window.__locks.push({ type, gesture: window.__gesture, granted });
      if (!granted) return Promise.reject(new DOMException('Permission was denied', 'NotAllowedError'));
      const s = new EventTarget();
      s.release = () => { window.__locks.push({ release: true }); s.dispatchEvent(new Event('release')); return Promise.resolve(); };
      return Promise.resolve(s);
    };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  });
  const pp = await ctx.newPage();
  pp.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[pad ${m.type()}] ${m.text()}`); });
  pp.on('pageerror', (e) => consoleErrors.push(`[pad pageerror] ${e.message}`));
  await page.setViewportSize({ width: 320, height: 180 });     // keep the long-lived desktop page cheap
  await pp.goto(url + '/?quality=low');                         // the fast renderer: E16 covers the other
  await pp.waitForFunction(() => window.__sim, null, { timeout: 180000 }); await drawOff(pp);
  await pp.addScriptTag({ path: path.join(root, 'test', 'gamepad-stub.browser.js') });
  const pf = async (n) => { await pp.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n); };
  const tapPad = (name, hold = 0) => pp.evaluate(([n, h]) => window.fakePad.tap(n, h), [name, hold]);
  return { ctx, pp, pf, tapPad };
}

if (want('gamepad')) {
  section('E14', 'Game controller: standard layout, menus, wording, rumble, disconnect');
  const { ctx, pp, pf, tapPad } = await padPage();
  const PI = () => pp.evaluate(() => Object.assign({}, window.__sim.input()));
  const PS = () => pp.evaluate(() => { const g = window.__sim.game; return { state: g.state, ga: g.ctx.gaMode, dist: window.__sim.state().distToThreshold, pad: document.body.classList.contains('pad'), look: Object.assign({}, window.__sim.inputManager.look) }; });
  await pf(2);
  check('no controller: nothing about controllers is shown', await pp.evaluate(() => !document.body.classList.contains('pad') && document.getElementById('pad-msg').textContent === ''));
  await pp.evaluate(() => window.fakePad.connect()); await pf(2);
  const msg = await pp.evaluate(() => document.getElementById('pad-msg').textContent);
  check('a connected controller is announced in the menu with how to start', /Xbox controller connected.*Menu or A starts/.test(msg), msg);
  await tapPad('Menu'); await pf(3);
  let s = await PS();
  const hud = await pp.evaluate(() => ({ cell: document.getElementById('h-mouse').textContent, hint: getComputedStyle(document.getElementById('pad-hint')).display }));
  check('Menu starts the approach, and the controller is the device in use', s.state === 'flying' && s.pad && hud.cell === 'CONTROLLER', JSON.stringify(hud));
  await pp.evaluate(() => window.fakePad.stick('left', 0, -0.8)); await pf(2);
  let i = await PI();
  check('left stick up = nose up (like the up arrow)', i.pitch > 0.3, `pitch ${fmt(i.pitch, 2)}`);
  await pp.evaluate(() => { window.__sim.inputManager.opts.invertPitch = true; }); await pf(2);
  i = await PI();
  check('pilot-style pitch: pushing the stick forward = nose down', i.pitch < -0.3, `pitch ${fmt(i.pitch, 2)}`);
  await pp.evaluate(() => { window.__sim.inputManager.opts.invertPitch = false; window.fakePad.stick('left', 0.8, 0); }); await pf(2);
  i = await PI();
  check('left stick right = roll right; released stick = centred', i.roll > 0.3 && Math.abs(i.pitch) < 0.02, `roll ${fmt(i.roll, 2)}`);
  await pp.evaluate(() => { window.fakePad.stick('left', 0, 0); window.fakePad.set('RT', 0.8); }); await pf(2);
  const yr = (await PI()).yaw;
  await pp.evaluate(() => { window.fakePad.set('RT', 0); window.fakePad.set('LT', 0.8); }); await pf(2);
  const yl = (await PI()).yaw;
  await pp.evaluate(() => window.fakePad.set('LT', 0)); await pf(2);
  check('RT / LT = right / left rudder, analog', yr > 0.5 && yl < -0.5 && Math.abs((await PI()).yaw) < 0.02, `${fmt(yr, 2)} / ${fmt(yl, 2)}`);
  const t0 = (await PI()).throttle;
  await pp.evaluate(() => window.fakePad.press('A')); await pf(2); await simWaitOn(pp, 0.4); await pp.evaluate(() => window.fakePad.release('A')); await pf(1);
  const t1 = (await PI()).throttle;
  await pp.evaluate(() => window.fakePad.press('B')); await pf(2); await simWaitOn(pp, 0.4); await pp.evaluate(() => window.fakePad.release('B')); await pf(1);
  const t2 = (await PI()).throttle;
  check('A held = more thrust, B held = less', t1 > t0 + 0.05 && t2 < t1 - 0.05, `${fmt(t0, 2)} → ${fmt(t1, 2)} → ${fmt(t2, 2)}`);
  const c0 = await PI();
  await tapPad('Y'); await tapPad('RB'); await tapPad('Left'); await tapPad('Right');
  const c1 = await PI();
  check('Y = gear, RB = flaps down, D-pad ← = autobrake, D-pad → = arm speedbrakes', c1.gearDown !== c0.gearDown && c1.flapIndex === c0.flapIndex + 1 && c1.autobrake === (c0.autobrake + 1) % 5 && c1.speedbrakeArmed, `gear ${c1.gearDown}, flaps ${c0.flapIndex}→${c1.flapIndex}, autobrake ${c1.autobrake}, armed ${c1.speedbrakeArmed}`);
  await tapPad('LB'); await tapPad('Right', 1500);
  const c2 = await PI();
  check('LB = flaps up; D-pad → held = speedbrakes out', c2.flapIndex === c0.flapIndex && c2.speedbrake === 1 && !c2.speedbrakeArmed, `flaps ${c2.flapIndex}, speedbrake ${c2.speedbrake}`);
  await tapPad('Right', 1500);
  const trim0 = (await PI()).trim;
  await pp.evaluate(() => { window.fakePad.press('Down'); window.fakePad.press('X'); }); await pf(3);
  const c3 = await PI();
  await pp.evaluate(() => { window.fakePad.release('Down'); window.fakePad.release('X'); }); await pf(1);
  check('held again: speedbrakes in; D-pad ↓ = trim nose up; X = wheel brakes', c3.speedbrake === 0 && c3.trim > trim0 && c3.brake > 0.1, `speedbrake ${c3.speedbrake}, trim ${fmt(trim0, 2)}→${fmt(c3.trim, 2)}, brake ${fmt(c3.brake, 2)}`);
  await pp.evaluate(() => window.fakePad.stick('right', -0.8, 0)); await pf(2);
  const lookOn = (await PS()).look.yaw;
  await pp.evaluate(() => window.fakePad.stick('right', 0, 0)); await pf(2);
  await tapPad('R3');
  s = await PS();
  check('right stick looks around and lets go; pressing it shows the panel', lookOn > 0.5 && s.look.yaw === 0 && s.look.down === true, `look ${fmt(lookOn, 2)} → ${s.look.yaw}, panel ${s.look.down}`);
  await tapPad('R3');
  const padHud = await pp.evaluate(() => window.__sim.view.mode);
  await tapPad('R3');
  check('pressing it again: the head-up view, then the cockpit again', padHud === 'hud' && await pp.evaluate(() => window.__sim.view.mode === 'cockpit' && !window.__sim.inputManager.look.down), padHud);
  await pp.evaluate(() => { window.__rumble.length = 0; }); await tapPad('Y'); await tapPad('Y');   // gear up then down again
  await pp.waitForFunction(() => window.__sim.state().gearDown, null, { timeout: 120000 }); await pf(2);
  const rum = await pp.evaluate(() => window.__rumble.slice());
  check('the gear locking down rumbles the controller; the Vibration option is offered', rum.some((r) => r.type === 'dual-rumble' && r.duration === 120) && await pp.evaluate(() => getComputedStyle(document.getElementById('opt-vib').parentElement).display !== 'none'), JSON.stringify(rum.slice(0, 2)));
  await tapPad('View'); await pf(2);
  s = await PS(); i = await PI();
  check('View = TO/GA: full thrust and a go-around', s.ga && i.throttle === 1);
  await pp.waitForFunction(() => window.__sim.game.ctx.gaTimer > 3.5, null, { timeout: 120000 });
  const gaDist = (await PS()).dist;
  await tapPad('View'); await pf(2);
  s = await PS();
  // placed back at the 10 nm start (it flies on while the frames go by, at up to a second per frame here)
  const repositioned = await pp.evaluate(() => window.__sim.events().some((e) => e.type === 'reposition'));
  check('View again during the go-around = back on final', repositioned && !s.ga && s.dist <= 10.02 * 1852 && s.dist > gaDist + 0.2 * 1852, `${fmt(gaDist / 1852)} → ${fmt(s.dist / 1852)} nm`);
  await tapPad('Menu'); s = await PS();
  const paused = s.state === 'paused';
  await tapPad('A'); s = await PS();
  check('Menu pauses, A resumes', paused && s.state === 'flying');
  const beforeHold = (await PI()).throttle;
  await tapPad('Menu'); await pp.evaluate(() => window.fakePad.press('A')); await pf(4);
  const heldResume = await PI();
  await pp.evaluate(() => window.fakePad.release('A')); await pf(2);
  check('the A press that resumes does not also add thrust while it is held', (await PS()).state === 'flying' && Math.abs(heldResume.throttle - beforeHold) < 0.01, `${fmt(beforeHold, 2)} → ${fmt(heldResume.throttle, 2)}`);
  await tapPad('Menu'); await tapPad('B'); await pf(2);
  check('B in the pause menu goes back to the main menu', (await PS()).state === 'menu');

  // Flight School in the controller's words
  await pp.click('#mode-row .choice[data-mode="training"]');
  check('using the mouse hands control back to the keyboard and mouse', !(await PS()).pad);
  await tapPad('Menu'); await pf(3); await pp.waitForTimeout(400);
  const total = parseInt((await pp.evaluate(() => document.getElementById('school-step').textContent)).split('/')[1], 10);
  let padPages = 0, kbdPages = 0;
  for (let k = 0; k < total; k++) {
    const b = await pp.evaluate(() => document.getElementById('school-body').innerHTML);
    if (b.includes('class="gp"')) padPages++;
    if (b.includes('<kbd>') && !/<kbd>H<\/kbd>/.test(b)) kbdPages++;
    if (k === 8) await snap(pp, 'e2e-pad-school');
    if (k < total - 1) await tapPad('A');
  }
  check('Flight School names the controller\'s buttons, and A turns the pages', padPages >= 9 && kbdPages === 0, `${padPages} of ${total} pages with controller buttons, ${kbdPages} with keys`);
  await tapPad('B');
  const back = await pp.evaluate(() => document.getElementById('school-step').textContent);
  check('B goes back a page', back.startsWith(`${total - 1} /`), back);
  await tapPad('Menu'); await pf(3);
  // the live hint depends on the moment; a hint that names controls shows how it is worded now
  const HINT = 'Arm the speedbrakes ([[armSpeedbrake]]) and set autobrake 2 or 3 ([[autobrake]]).';
  const instr = await pp.evaluate((h) => { window.__sim.ui.setInstructor(h); return document.getElementById('instructor').innerHTML; }, HINT);
  check('Menu skips the school; instructor hints name controller buttons', (await PS()).state === 'flying' && instr.includes('class="gp"') && !instr.includes('<kbd>'), instr.replace(/<[^>]+>/g, ''));
  await pp.keyboard.press('KeyF'); await pf(2);
  const instr2 = await pp.evaluate((h) => { window.__sim.ui.setInstructor(h); return document.getElementById('instructor').innerHTML; }, HINT);
  check('a key press switches the wording back to keys', !(await PS()).pad && instr2.includes('<kbd>X</kbd>') && !instr2.includes('class="gp"'), instr2.replace(/<[^>]+>/g, ''));

  // other controller families, a joystick, and unplugging
  await pp.evaluate(() => { window.fakePad.disconnect(); }); await pf(2);   // swapping controllers pauses the flight
  await pp.evaluate(() => { window.fakePad.connect({ id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' }); }); await pf(1);
  await tapPad('A');                                                          // ✕ resumes
  const psHint = await pp.evaluate(() => document.getElementById('pad-hint').textContent);
  check('a PlayStation controller is worded with its own buttons (✕ ○ □ △, L1 R1, L2 R2)', /△/.test(psHint) && /L2 \/ R2/.test(psHint) && /R1/.test(psHint), psHint.slice(0, 90));
  s = await PS();
  const wasFlying = s.state === 'flying';
  await pp.evaluate(() => window.fakePad.disconnect()); await pf(2);
  const dc = await pp.evaluate(() => ({ state: window.__sim.game.state, msg: document.getElementById('mode-msg').textContent, pad: document.body.classList.contains('pad') }));
  check('unplugging the controller mid-flight pauses and says so', wasFlying && dc.state === 'paused' && /CONTROLLER DISCONNECTED/.test(dc.msg) && !dc.pad, JSON.stringify(dc));
  await pp.evaluate(() => { window.__sim.game.togglePause(); window.fakePad.connect({ id: 'Logitech Extreme 3D pro (Vendor: 046d Product: c215)', mapping: '', rumble: false }); window.fakePad.stick('left', -0.7, 0.7); }); await pf(3);
  i = await PI();
  check('a joystick with its own layout flies roll and pitch with its stick', i.roll < -0.3 && i.pitch < -0.3, `roll ${fmt(i.roll, 2)}, pitch ${fmt(i.pitch, 2)}`);
  const perr = await pp.evaluate(() => window.__sim.errors);
  check('no JavaScript errors in the controller session', perr.length === 0, perr.slice(0, 3).join(' | '));
  await ctx.close();

  // on a phone, a controller in use hides the touch controls; a touch brings them back
  const P2 = await padPage({ phone: true });
  await P2.pp.evaluate(() => window.fakePad.connect()); await P2.pf(2);
  await P2.tapPad('Menu'); await P2.pf(3);
  const hidden = await P2.pp.evaluate(() => getComputedStyle(document.getElementById('touch')).display === 'none' && getComputedStyle(document.getElementById('hgs')).display !== 'none');
  await P2.pp.tap('#hgs', { force: true }).catch(() => {});
  await P2.pp.touchscreen.tap(430, 60); await P2.pf(2);
  const shown = await P2.pp.evaluate(() => getComputedStyle(document.getElementById('touch')).display !== 'none');
  check('phone with a controller: touch controls hidden (head-up display kept); a touch brings them back', hidden && shown);
  await P2.ctx.close();

  // an iPhone with a PS5 controller, as Safari reports it (WebKit's GameController bridge): named
  // "... Extended Gamepad" with no vendor number, no rumble, the PS button as button 16. The page
  // first sees it at a press, in a gamepadconnected event that Safari counts as a gesture: the only
  // one a player who never touches the screen gives
  const P3 = await padPage({ phone: true, iphone: true });
  await P3.pp.evaluate(() => { const a = window.__sim.audio, u = a.unlock.bind(a); window.__unlocks = []; a.unlock = () => { window.__unlocks.push(window.__gesture); return u(); }; });
  await P3.pp.evaluate(() => { window.__gesture = true; window.fakePad.connect({ id: 'DualSense Wireless Controller Extended Gamepad', rumble: false }); window.__gesture = false; });
  await P3.pf(3);
  let ip = await P3.pp.evaluate(() => ({ msg: document.getElementById('pad-msg').textContent, unlocks: window.__unlocks, locks: window.__locks, held: !!window.__sim.platform.wakeLock, sound: window.__sim.audio.running }));
  check('iPhone + PS5 controller: announced with its own buttons ("Options or ✕ starts")', /PlayStation controller connected.*Options or ✕ starts/.test(ip.msg), ip.msg);
  check('iPhone: the controller\'s first press (Safari\'s gesture) starts the sound and keeps the screen awake', ip.unlocks[0] === true && ip.sound && ip.locks.length >= 1 && ip.locks.some((l) => l.gesture && l.granted) && ip.held, JSON.stringify({ unlocks: ip.unlocks, locks: ip.locks }));
  await P3.tapPad('Menu'); await P3.pf(3);
  await P3.tapPad('Home'); await P3.pf(2);
  ip = await P3.pp.evaluate(() => ({ state: window.__sim.game.state, held: !!window.__sim.platform.wakeLock, touch: getComputedStyle(document.getElementById('touch')).display, vib: getComputedStyle(document.getElementById('opt-vib').parentElement).display, hint: document.getElementById('pad-hint').textContent }));
  check('Options starts the flight with the screen still kept awake; the PS button does nothing', ip.state === 'flying' && ip.held, JSON.stringify({ state: ip.state, held: ip.held }));
  check('iPhone: touch controls hidden, controls worded for PlayStation, no Vibration option (no rumble or vibration there)', ip.touch === 'none' && /△/.test(ip.hint) && ip.vib === 'none', JSON.stringify({ touch: ip.touch, vib: ip.vib }));
  // after a phone call iOS interrupts the sound; the controller cannot restart it, so the screen says how
  await P3.pp.evaluate(() => window.__sim.audio.ctx.suspend());
  await P3.pp.evaluate(() => window.fakePad.stick('left', 0.5, 0)); await simWaitOn(P3.pp, 0.3);
  await P3.pp.waitForFunction(() => !document.getElementById('sound-hint').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => {});
  const note = await P3.pp.evaluate(() => ({ text: document.getElementById('sound-hint').textContent, shown: getComputedStyle(document.getElementById('sound-hint')).display !== 'none' }));
  await P3.pp.evaluate(() => window.fakePad.stick('left', 0, 0));
  await P3.pp.touchscreen.tap(430, 200); await P3.pf(3);
  await P3.pp.waitForFunction(() => window.__sim.audio.running, null, { timeout: 10000 }).catch(() => {});
  const after = await P3.pp.evaluate(() => ({ sound: window.__sim.audio.running, shown: !document.getElementById('sound-hint').classList.contains('hidden') }));
  check('sound interrupted while flying with the controller: "Tap the screen for sound", and a tap brings it back', note.shown && /Tap the screen for sound/.test(note.text) && after.sound && !after.shown, JSON.stringify({ note, after }));
  await P3.pp.evaluate(() => { window.fakePad.disconnect(); window.__sim.game.quitToMenu(); }); await P3.pf(3);
  const released = await P3.pp.evaluate(() => ({ held: !!window.__sim.platform.wakeLock, last: window.__locks[window.__locks.length - 1] }));
  check('controller gone and back in the menu: the screen may sleep again', !released.held && released.last.release === true, JSON.stringify(released));
  await P3.ctx.close();
}

// --------------------------------------------------------------------------- a landing flown with the controller
if (!quick && want('padland')) {
  section('E15', 'Landing flown with a game controller (real time)');
  const { ctx, pp, pf, tapPad } = await padPage();
  await pp.setViewportSize({ width: 800, height: 450 });
  await pp.evaluate(() => window.fakePad.connect());
  await pp.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 }));
  await pp.waitForTimeout(2500); await pf(3); await pp.waitForTimeout(1000);
  const fps = await pp.evaluate(() => window.__sim.stats.fps);
  const scale = Math.max(0.35, Math.min(1, fps / 10));
  await pp.evaluate((sc) => window.__sim.setTimeScale(sc), scale);
  console.log(`    render rate ${fmt(fps, 1)} fps -> simulation time scale ${fmt(scale, 2)}`);
  await tapPad('X');   // a first press: the controller becomes the device in use (wheel brakes do nothing in the air)
  check('the controller is the device in use', await pp.evaluate(() => window.__sim.inputManager.pad.active));
  await pp.evaluate(() => { window.__rumble.length = 0; });
  // the human-like pilot, on the controller: stick, A/B thrust, triggers, buttons, reverse by holding B
  await pp.addScriptTag({ path: path.join(root, 'test', 'human-pilot.browser.js') });
  await pp.evaluate(() => window.installHumanPilot({ input: 'gamepad' }));
  let done = true;
  try { await pp.waitForFunction(() => window.__sim.game.state === 'finished', null, { timeout: 600000 }); } catch (e) { done = false; console.log('    (timeout waiting for the landing to finish)'); }
  await pp.evaluate(() => window.__sim.setTimeScale(1));
  const r = await pp.evaluate(() => ({ result: window.__sim.result(), log: window.__sim.events().filter((e) => e.type === 'input').map((e) => e.text), mouse: window.__sim.inputManager.mouseEngaged, active: window.__sim.inputManager.pad.active, rumble: window.__rumble.slice(), trace: (window.__pilot.trace || []).slice(-24).map((x) => JSON.stringify(x)) }));
  if (!(r.result && r.result.success)) console.log('    trace:\n    ' + r.trace.join('\n    '));
  console.log(`  controller landing: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'not finished'} | inputs: ${r.log.slice(0, 14).join(', ')}`);
  if (r.result) console.log('    ' + r.result.items.map((it) => `${it.label}: ${it.value}`).join(' · '));
  check('a landing flown with the controller ends stopped on the runway', done && r.result && r.result.success, r.result ? r.result.headline : 'no result');
  const td = r.rumble.filter((x) => x.duration === 200 || x.duration === 450);
  check('reverse by holding B at idle, stowed with A; the touchdown rumbled; no mouse or keys', r.log.includes('reverse on') && r.log.includes('reverse off') && td.length > 0 && !r.mouse && r.active, `touchdown rumble ${JSON.stringify(td[0])}`);
  await snap(pp, 'e2e-pad-landing');
  await ctx.close();
}

// --------------------------------------------------------------------------- graphics
// The 'high' tier a computer gets (shadows, sky lighting, bloom, MSAA), checked on pixels read back
// from the canvas straight after a frame, and the 'low' tier phones and the other groups use.
if (want('graphics')) {
  section('E16', 'Graphics: sky, haze, sunlight and shadows; quality tiers');
  const low = await page.evaluate(() => { const w = window.__sim.world; return { q: w.quality, composer: !!w.composer, shadows: w.renderer.shadowMap.enabled }; });
  check('the fast tier (phones, and this page): no post-processing and no shadow maps', low.q === 'low' && !low.composer && !low.shadows, JSON.stringify(low));
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });   // the pixel checks use thumbnails: a small page draws faster
  const gp = await ctx.newPage();
  gp.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[graphics ${m.type()}] ${m.text()}`); });
  gp.on('pageerror', (e) => consoleErrors.push(`[graphics pageerror] ${e.message}`));
  await page.setViewportSize({ width: 320, height: 180 });     // keep the long-lived desktop page cheap
  await gp.goto(url + '/');
  await gp.waitForFunction(() => window.__sim, null, { timeout: 180000 }); await drawOff(gp);
  const gf = async (n) => { await gp.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n); };
  const hi = await gp.evaluate(() => {
    const w = window.__sim.world; let casters = 0;
    w.cockpitScene.traverse((o) => { if (o.isMesh && o.castShadow) casters++; });
    return { q: w.quality, composer: !!w.composer, samples: w.composer && w.composer.renderTarget1.samples, bloom: !!w.bloom, shadows: w.renderer.shadowMap.enabled, sun: w.sun.castShadow, cockpitSun: w.cockpitSun.castShadow, casters, env: !!w.scene.environment };
  });
  check('a computer gets the high tier: 4× MSAA floating-point frame, bloom, sun shadows outside and in the flight deck', hi.q === 'high' && hi.composer && hi.samples === 4 && hi.bloom && hi.shadows && hi.sun && hi.cockpitSun && hi.casters > 40, JSON.stringify(hi));
  check('the sky lights every surface (environment map)', hi.env);
  await gp.evaluate(() => { window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 }); window.__sim.setTimeScale(0); document.getElementById('hud').style.visibility = 'hidden'; });
  await gf(3);
  // read the frame back (a 96×54 thumbnail) right after drawing it, in the same task
  const grab = (setup) => gp.evaluate((setup) => {
    const w = window.__sim.world;
    const restore = new Function('w', setup)(w);
    w.render();
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
    const g = cv.getContext('2d'); g.drawImage(w.renderer.domElement, 0, 0, 96, 54);
    const d = Array.from(g.getImageData(0, 0, 96, 54).data);
    if (restore) restore();
    return d;
  }, setup);
  const rowMean = (d, y0, y1, x0 = 0, x1 = 96) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * 96 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // the view without the flight deck: where is the horizon on screen?
  const hz = await gp.evaluate(() => { const w = window.__sim.world; const v = w.camera.getWorldPosition(w.camera.position.clone()).add(w.camera.position.clone().set(-20000, 0, 0)).project(w.camera); return (1 - v.y) / 2; });
  const view = await grab(`w.cockpitScene.children.forEach((c) => { if (c.isGroup) c.visible = false; }); return () => w.cockpitScene.children.forEach((c) => { c.visible = true; });`);
  const hy = Math.round(hz * 54);
  const top = rowMean(view, 0, 3), nearHz = rowMean(view, Math.max(0, hy - 3), Math.max(1, hy - 1)), below = rowMean(view, Math.min(53, hy + 6), Math.min(54, hy + 9));
  check('clear day: the sky high up is blue', top[2] > top[0] + 40 && top[2] > 120, top.map((x) => x.toFixed(0)).join(','));
  check('towards the horizon it turns paler and brighter (haze)', L(nearHz) > L(top) && nearHz[2] - nearHz[0] < top[2] - top[0], `horizon ${nearHz.map((x) => x.toFixed(0)).join(',')} at row ${hy}`);
  check('the land below the horizon is darker than the sky above it', L(below) < L(nearHz), below.map((x) => x.toFixed(0)).join(','));
  // the flight deck: the sun comes in through the windows only; the shell shades the rest
  const shade = rowMean(await grab(`return null;`), 30, 54);
  const noShadow = rowMean(await grab(`const s = w.cockpitSun.shadow.intensity; w.cockpitSun.shadow.intensity = 0; return () => { w.cockpitSun.shadow.intensity = s; };`), 30, 54);
  const noSun = rowMean(await grab(`const i = w.cockpitSun.intensity; w.cockpitSun.intensity = 0; return () => { w.cockpitSun.intensity = i; };`), 30, 54);
  check('the flight deck is shaded by its roof and walls (darker with its shadows than without)', L(shade) < 0.9 * L(noShadow), `with ${L(shade).toFixed(1)}, without ${L(noShadow).toFixed(1)}`);
  check('but sunlight falls in through the windows (brighter than with the sun off)', L(shade) > L(noSun) + 0.5, `sun off ${L(noSun).toFixed(1)}`);
  // a cloud deck: sunshine and a clear sky above it, overcast light below
  await gp.evaluate(() => { window.__sim.start({ scenarioId: 'crosswind', startId: 'standard', mode: 'game', sound: false, seed: 5 }); window.__sim.setTimeScale(0); });
  await gf(2);
  const deck = await gp.evaluate(() => {
    const w = window.__sim.world, st = Object.assign({}, window.__sim.state()), eye = w.camera.getWorldPosition(w.camera.position.clone());
    const at = (alt) => { w.update(0, Object.assign({}, st, { alt }), eye); return { env: w.envKey, sun: +w.sun.intensity.toFixed(2), overcast: +w.atmo.uniforms.skyOvercast.value.toFixed(2) }; };
    const r = { above: at(w.cloudTop + 200), inside: at((w.cloudBase + w.cloudTop) / 2), below: at(w.cloudBase - 150) };
    w.update(0, st, eye);
    return r;
  });
  check('above a cloud deck: full sunshine, clear-sky light', deck.above.env === 'above' && deck.above.overcast === 0 && deck.above.sun > 3, JSON.stringify(deck.above));
  check('inside and below it: the sun is hidden and the light is the overcast\'s', deck.inside.overcast === 1 && deck.below.env === 'below' && deck.below.sun < 0.15 * deck.above.sun && deck.below.overcast > 0.8, `${JSON.stringify(deck.inside)} ${JSON.stringify(deck.below)}`);
  // every scenario, by day and night, drawn on both tiers: each one's materials compile and draw
  const drawAll = (p) => p.evaluate(async (scenarios) => {
    const out = [];
    for (const sc of scenarios) for (const night of [false, true]) {
      window.__sim.start({ scenarioId: sc, night, startId: 'short', mode: 'game', sound: false, seed: 5 });
      window.__sim.setTimeScale(0);
      await new Promise((r) => requestAnimationFrame(() => r()));
      window.__sim.drawNow();
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 27;
      const g = cv.getContext('2d'); g.drawImage(window.__sim.world.renderer.domElement, 0, 0, 48, 27);
      const d = g.getImageData(0, 0, 48, 27).data; let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); }
      out.push({ sc: sc + (night ? ' night' : ''), range: Math.round(hi - lo), errors: window.__sim.errors.length });
    }
    window.__sim.setTimeScale(1);
    return out;
  }, ['clear', 'tailwind', 'crosswind', 'storm']);
  for (const [tier, p] of [['high', gp], ['low', page]]) {
    const r = await drawAll(p);
    check(`${tier} tier: every scenario draws by day and night without errors`, r.every((x) => x.range > 30 && x.errors === 0), r.map((x) => `${x.sc} ${x.range}`).join(', '));
  }
  // the head-up view: the world without the flight deck, and the head-up display over it
  await gp.evaluate(() => { window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, seed: 5 }); window.__sim.setTimeScale(0); document.getElementById('hud').style.visibility = ''; });
  await gf(2);
  const shot = (mode) => gp.evaluate(async (mode) => {
    const S = window.__sim, w = S.world, info = w.renderer.info;
    S.view.setMode(mode);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // the view updates the camera
    info.autoReset = false; info.reset(); S.drawNow(); const calls = info.render.calls; info.autoReset = true;
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
    const g = cv.getContext('2d'); g.drawImage(w.renderer.domElement, 0, 0, 96, 54);
    const d = g.getImageData(0, 36, 96, 18).data; let l = 0;                            // the lower third
    for (let i = 0; i < d.length; i += 4) l += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const hc = document.getElementById('hud-canvas'), hd = hc.width ? hc.getContext('2d').getImageData(0, 0, hc.width, hc.height).data : []; let green = 0;   // hidden: no size
    for (let i = 0; i < hd.length; i += 4) if (hd[i + 3] > 200 && hd[i + 1] > 200 && hd[i] < 190) green++;
    const h = S.view.hud.last;
    return { calls, lower: l / (d.length / 4), green, fpv: h && h.fpv, gs: h && h.gsRef[Math.floor(h.gsRef.length / 2)], runway: h && h.runway, ppd: h && h.pxPerDeg };
  }, mode);
  const ck = await shot('cockpit'), hu = await shot('hud');
  check('head-up view: the flight deck is not drawn (fewer draw calls)', hu.calls < ck.calls * 0.8, `${ck.calls} → ${hu.calls} draw calls`);
  check('the lower third shows the land ahead instead of the dark panel', hu.lower > ck.lower + 20, `luminance ${fmt(ck.lower, 0)} → ${fmt(hu.lower, 0)}`);
  check('the head-up display is drawn (green symbols), and none in the cockpit view', hu.green > 300 && ck.green === 0, `${ck.green} → ${hu.green} green pixels`);
  // how far the marker is from the runway outline (0 inside it); 4 nm out the runway is a few pixels wide
  const offRwy = (R, p) => {
    let s = 0; for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; s += Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)); }
    if (Math.abs(s) === 4) return 0;
    let d = Infinity;
    for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4], vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy))); d = Math.min(d, Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y)); }
    return d;
  };
  const off = hu.fpv && hu.runway ? offRwy(hu.runway, hu.fpv) / hu.ppd : Infinity;
  check('short final: the flight path marker is on the −3° line and on the runway outline (within 0.5°)', hu.fpv && Math.abs(hu.fpv.y - hu.gs.y) < 0.5 * hu.ppd && off < 0.5, hu.fpv ? `${fmt((hu.fpv.y - hu.gs.y) / hu.ppd, 2)}° off the line, ${fmt(off, 2)}° from the runway` : 'no marker');
  await snap(gp, 'e2e-headup-day');
  const school = await gp.evaluate(async () => {
    const S = window.__sim;
    S.start({ scenarioId: 'clear', startId: 'standard', mode: 'training', sound: false, seed: 5 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const during = { shown: S.view.shown, deck: S.world.drawCockpit };
    S.game.schoolDone(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { during, after: { shown: S.view.shown, deck: S.world.drawCockpit }, stored: localStorage.getItem('view') };
  });
  check('Flight School shows the cockpit (its pages point at the flight deck), then the head-up view again', school.during.shown === 'cockpit' && school.during.deck && school.after.shown === 'hud' && school.after.deck === false, JSON.stringify(school));
  await gp.reload(); await gp.waitForFunction(() => window.__sim, null, { timeout: 180000 }); await drawOff(gp);
  check('the chosen view is remembered on this device', school.stored === 'hud' && await gp.evaluate(() => window.__sim.view.mode === 'hud'));
  await gp.evaluate(() => window.__sim.view.setMode('cockpit'));
  // night: stars and airfield lights bright enough to glow through the bloom pass
  await gp.evaluate(() => { window.__sim.start({ scenarioId: 'clear', night: true, startId: 'short', mode: 'game', sound: false, seed: 5 }); window.__sim.setTimeScale(0); });
  await gf(2);
  const night = await gp.evaluate(() => { const w = window.__sim.world; return { lights: w.lights.material.uniforms.uIntensity.value, threshold: w.bloom.threshold, sunE: w.atmo.uniforms.skySunE.value, stars: w.skyMat.uniforms.uStars.value, moon: +w.sun.intensity.toFixed(2) }; });
  check('night: no sky glow, stars out, moonlight, and the lights\' cores above the glow threshold', night.sunE === 0 && night.stars > 0 && night.moon > 0 && night.moon < 1 && night.lights * 1.6 > night.threshold, JSON.stringify(night));
  await snap(gp, 'e2e-graphics-night');
  await ctx.close();
  await page.setViewportSize({ width: VW, height: VH });
}

// --------------------------------------------------------------------------- wrap up
const errs = await page.evaluate(() => window.__sim.errors);
const realConsole = consoleErrors.filter((e) => !/favicon|Autoplay|speech/i.test(e));
check('no JavaScript errors during the whole session', errs.length === 0 && realConsole.length === 0, [...errs, ...realConsole].slice(0, 5).join(' | '));
const last = sections[sections.length - 1];
if (last) last.s = (Date.now() - last.t0) / 1000;
console.log('\nTime per group: ' + sections.map((x) => `${x.id} ${fmt(x.s, 0)} s`).join(' · ') + `  (total ${fmt((Date.now() - tStart) / 1000, 0)} s)`);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log('Failed: ' + failures.join(' | '));
// one line for test/e2e-parallel.mjs
console.log('E2E-RESULT ' + JSON.stringify({ passed, failed, failures, sections: sections.map((x) => ({ id: x.id, s: Math.round(x.s) })) }));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
