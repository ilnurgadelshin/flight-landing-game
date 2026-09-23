// Browser end-to-end QA: plays the game in headless Chromium (SwiftShader).
//   node test/e2e.mjs            (all)      node test/e2e.mjs quick   (skip the slow keyboard and touch landings)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'test', 'output'); fs.mkdirSync(out, { recursive: true });
const quick = process.argv.includes('quick');
const only = (process.argv.find((a) => a.startsWith('only=')) || '').slice(5);

let passed = 0, failed = 0; const failures = [];
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; failures.push(name); console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const fmt = (n, d = 1) => Number(n).toFixed(d);

const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const VW = 1024, VH = 576;
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));

const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
const S = () => page.evaluate(() => { const s = window.__sim.state(); const g = window.__sim.game; return Object.assign({}, s, { gameState: g.state, gaMode: g.ctx.gaMode, time: s.time }); });
const I = () => page.evaluate(() => Object.assign({}, window.__sim.input()));
const start = (opts) => page.evaluate((o) => window.__sim.start(o), opts);
const waitFor = async (fn, timeout, label) => { try { await page.waitForFunction(fn, null, { timeout }); return true; } catch (e) { console.log(`    (timeout waiting for ${label || fn})`); return false; } };
// frame-based waits: SwiftShader frames can take 100–400 ms, so wall-clock holds are unreliable
const frames = async (n) => { await page.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n); };
const holdKey = async (code, ms) => { await page.keyboard.down(code); await frames(Math.max(2, Math.round(ms / 80))); await page.keyboard.up(code); await frames(1); };
const tap = async (code) => { await page.keyboard.down(code); await frames(1); await page.keyboard.up(code); await frames(1); };
const simWait = async (sec) => { await page.evaluate((sec) => { window.__until = window.__sim.state().time + sec; }, sec); await waitFor(() => window.__sim.state().time >= window.__until || window.__sim.game.state !== 'flying', 120000, 'sim time'); };

// --------------------------------------------------------------------------- load
console.log('\n[E1] Page loads, WebGL renderer up, no errors');
await page.goto(url + '/?lowdetail', { waitUntil: 'load' });
const ready = await waitFor(() => window.__sim, 60000, 'sim ready');
check('sim ready', ready);
const gl = await page.evaluate(() => ({ renderer: !!window.__sim.world.renderer, scenarios: window.__sim.scenarios, menu: !document.getElementById('menu').classList.contains('hidden') }));
check('renderer created and menu visible', gl.renderer && gl.menu, gl.scenarios.join(','));
await shot('e2e-menu');

// --------------------------------------------------------------------------- menu flow
if (!only || only === 'menu') {
  console.log('\n[E2] Menu: choose mode / scenario / start with the mouse, start the approach');
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
if (!only || only === 'keys') {
  console.log('\n[E3] Every mapped key drives the right control (real key events)');
  await start({ scenarioId: 'clear', startId: 'standard', mode: 'game', sound: false });
  await page.waitForTimeout(300);
  let i0 = await I();
  await page.keyboard.down('KeyW'); await frames(10); await page.keyboard.up('KeyW'); await frames(1); let i1 = await I();
  check('W increases throttle', i1.throttle > i0.throttle + 0.12, `${fmt(i0.throttle, 2)} -> ${fmt(i1.throttle, 2)}`);
  await page.keyboard.down('KeyS'); await frames(10); await page.keyboard.up('KeyS'); await frames(1); let i2 = await I();
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
  await page.keyboard.down('KeyB'); await frames(8); check('B applies the wheel brakes', (await I()).brake > 0.5, `${fmt((await I()).brake, 2)}`); await page.keyboard.up('KeyB'); await frames(6);
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
  check('← rolls left', rl.roll < rr.roll - 5 * Math.PI / 180, `roll ${fmt(rl.roll * 57.3)}°`);
  await page.keyboard.down('KeyD'); await simWait(1.5); const yd = await S(); const iy = await I(); await page.keyboard.up('KeyD');
  check('D applies right rudder (nose right / sideslip)', iy.yaw > 0.5 && (yd.r > 0.005 || yd.beta < -0.5 * Math.PI / 180), `yaw input ${fmt(iy.yaw, 2)}, r=${fmt(yd.r * 57.3)}°/s beta=${fmt(yd.beta * 57.3)}°`);
  await simWait(0.8);
  await page.keyboard.down('KeyA'); await simWait(1.5); const ya = await S(); await page.keyboard.up('KeyA');
  check('A applies left rudder', ya.r < -0.005 || ya.beta > 0.5 * Math.PI / 180, `r=${fmt(ya.r * 57.3)}°/s beta=${fmt(ya.beta * 57.3)}°`);
  await page.keyboard.down('KeyL'); await frames(8); const camL = await page.evaluate(() => window.__sim.world.camera.rotation.x); await page.keyboard.up('KeyL');
  check('L looks down at the pedestal', camL < -0.5, `cam pitch ${fmt(camL * 57.3)}°`);
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
  await tap('Backspace');
  const sRp = await S(); check('Backspace repositions on final after a go-around', Math.abs(sRp.distToThreshold - 10 * 1852) < 100 && !sRp.gaMode, `${fmt(sRp.distToThreshold / 1852)} nm`);
}

// --------------------------------------------------------------------------- flight school
if (!only || only === 'school') {
  console.log('\n[E4] Flight School onboarding (training mode)');
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
  await page.evaluate((o) => { window.__sim.autopilot(o); window.__sim.setTimeScale(8); }, apOpts);
  let shotDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await S();
    if (!shotDone && s.agl < 110 && extra.shotName) { await page.evaluate(() => window.__sim.setTimeScale(1)); await page.waitForTimeout(300); await shot(extra.shotName); await page.evaluate(() => window.__sim.setTimeScale(8)); shotDone = true; }
    if (s.gameState === 'finished') break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.__sim.setTimeScale(1));
  const res = await page.evaluate(() => ({ result: window.__sim.result(), events: window.__sim.events(), gpws: window.__sim.gpwsEvents(), audio: window.__sim.audioLog(), state: window.__sim.game.state, resultsVisible: !document.getElementById('results').classList.contains('hidden'), headline: document.getElementById('res-headline').textContent, outcome: document.getElementById('res-outcome').textContent }));
  if (extra.shotName) await shot(extra.shotName + '-result');
  return res;
}
const said = (r, re) => r.audio.some((a) => a.kind === 'voice' && re.test(a.text));

if (!only || only === 'land') {
  console.log('\n[E5] Autoland in every scenario, day and night, with GPWS callouts');
  const cases = [['clear', 'short', false], ['tailwind', 'short', false], ['crosswind', 'short', false], ['storm', 'short', true], ['clear', 'standard', true]];
  for (const [sc, st, night] of cases) {
    const r = await autoland(sc, st, {}, { shotName: `e2e-land-${sc}${night ? '-night' : ''}`, night });
    const td = r.result && r.result.touchdown;
    console.log(`  ${sc}/${st}${night ? ' night' : ''}: ${r.result ? `${r.result.outcome} ${r.result.score} ${r.result.grade} — ${r.result.headline}` : 'no result'} | td ${td ? `${fmt(td.sink / 0.00508, 0)} fpm @ ${fmt(td.distFromThreshold, 0)} m` : '-'}`);
    check(`${sc}: results screen shown with a successful landing`, r.resultsVisible && r.result && r.result.success, r.headline);
    check(`${sc}: altitude callouts heard (500 … 10)`, said(r, /Five hundred/) && said(r, /One hundred/) && said(r, /Fifty/) && said(r, /Thirty/) && said(r, /Ten/), r.audio.filter((a) => a.kind === 'voice').map((a) => a.text).join(', ').slice(0, 120));
    check(`${sc}: "Minimums" called`, said(r, /Minimums/));
    check(`${sc}: touchdown sound played`, r.audio.some((a) => a.kind === 'sound' && /touchdown|hardlanding/.test(a.text)));
    check(`${sc}: no GPWS warnings during a good approach`, !r.gpws.some((e) => e.type === 'warning'), r.gpws.filter((e) => e.type !== 'callout').map((e) => e.text).join(', '));
  }
}

// --------------------------------------------------------------------------- failure consequences
if (!only || only === 'fail') {
  console.log('\n[E6] Intentional errors: the simulation reacts with alarms and consequences');
  let r = await autoland('clear', 'short', { noGear: true }, { before: () => { window.__sim.input().gearDown = false; window.__sim.game.sim.aircraft.gearPos = 0; }, shotName: 'e2e-fail-gearup' });
  console.log(`  gear up: ${r.outcome} — ${r.headline}`);
  check('gear-up: "Too low, gear" warning and the configuration horn', said(r, /Too low, gear/) && r.gpws.some((e) => e.type === 'horn'), r.gpws.map((e) => e.text).join(', ').slice(0, 100));
  check('gear-up: belly landing outcome on the results screen', r.result && r.result.outcome === 'belly' && /BELLY/.test(r.outcome));
  check('gear-up: crash sound and screen flash', r.audio.some((a) => a.text === 'crash') && r.events.some((e) => e.type === 'damage'));

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
if (!only || only === 'ga') {
  console.log('\n[E7] Go-around flown with the keyboard from 500 ft, then reposition (Fly the Approach and Flight School)');
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
    check(tag + 'Backspace repositions for another approach (same 4 nm start)', Math.abs(s2.distToThreshold - 4 * 1852) < 100 && !s2.gaMode && s2.gameState === 'flying', `${fmt(s2.distToThreshold / 1852)} nm, ${fmt(s2.alt / 0.3048, 0)} ft`);
  }
}

// --------------------------------------------------------------------------- frame-rate decoupling in the browser
if (!only || only === 'fps') {
  console.log('\n[E8] Physics time is decoupled from the render frame rate');
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
if (!quick && (!only || only === 'keyboard')) {
  console.log('\n[E9] Landing flown through the mouse yoke and the keyboard (real input events, real time)');
  // software rendering here runs at ~5 fps; a person on a laptop gets 60. Measure the frame rate and, when it is
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
  mp.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[phone ${m.type()}] ${m.text()}`); });
  mp.on('pageerror', (e) => consoleErrors.push(`[phone pageerror] ${e.message}`));
  await mp.goto(url + '/');
  await mp.waitForFunction(() => window.__sim, null, { timeout: 60000 });
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

if (!only || only === 'mobile') {
  console.log('\n[E10] Phone in landscape: layout, touch controls, multi-touch, rotation and pausing');
  const { ctx, mp, fingers, mf, centreOf } = await phonePage();
  const SAFE = { l: 59, r: 59, t: 0, b: 21 };
  await mp.evaluate((s) => { const st = document.documentElement.style; st.setProperty('--sal', s.l + 'px'); st.setProperty('--sar', s.r + 'px'); st.setProperty('--sat', s.t + 'px'); st.setProperty('--sab', s.b + 'px'); }, SAFE);
  const MS = () => mp.evaluate(() => { const s = window.__sim.state(), g = window.__sim.game; return { gameState: g.state, gaMode: g.ctx.gaMode, dist: s.distToThreshold, onGround: s.onGround }; });
  const MI = () => mp.evaluate(() => Object.assign({}, window.__sim.input()));
  await mf(2);
  check('a phone is detected as a touch device', await mp.evaluate(() => document.body.classList.contains('touch') && window.__sim.inputManager.touchMode));
  const menu = await mp.evaluate(() => { const t = document.querySelector('.menu-panel h1').getBoundingClientRect(), b = document.getElementById('btn-start').getBoundingClientRect(); return { titleTop: Math.round(t.top), startBottom: Math.round(b.bottom), vh: innerHeight }; });
  check('menu fits a 393 px tall screen: title and Start both visible without scrolling', menu.titleTop >= 0 && menu.startBottom <= menu.vh, `title at ${menu.titleTop} px, Start ends at ${menu.startBottom} of ${menu.vh}`);
  await mp.screenshot({ path: path.join(out, 'e2e-phone-menu.png') });
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
  await mp.screenshot({ path: path.join(out, 'e2e-phone-flying.png') });
  // the same rules on smaller phones: iPhone SE and a 640×360 Android (no notch), and the narrowest
  // notched iPhone (13 mini, 812×375 with 50 px side insets)
  const setSafe = (s) => mp.evaluate((s) => { const st = document.documentElement.style; st.setProperty('--sal', s.l + 'px'); st.setProperty('--sar', s.r + 'px'); st.setProperty('--sat', s.t + 'px'); st.setProperty('--sab', s.b + 'px'); }, s);
  for (const vp of [{ width: 667, height: 375, safe: { l: 0, r: 0, t: 0, b: 0 } }, { width: 640, height: 360, safe: { l: 0, r: 0, t: 0, b: 0 } }, { width: 812, height: 375, safe: { l: 50, r: 50, t: 0, b: 21 } }]) {
    await mp.setViewportSize({ width: vp.width, height: vp.height }); await setSafe(vp.safe); await mf(2);
    const small = await mp.evaluate(() => {
      const ids = ['t-gear', 't-autobrake', 't-flaps-up', 't-flaps-dn', 't-arm', 't-ext', 't-toga', 't-lever-body', 't-rudder', 't-stick-zone', 't-view', 't-pause', 't-help', 'hgs'];
      const rects = ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const bad = [];
      for (const r of rects) if (r.l < 0 || r.t < 0 || r.r > innerWidth || r.b > innerHeight) bad.push(r.id + ' off screen');
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (!(rects[i].id === 'hgs' && rects[j].id === 't-stick-zone') && !(rects[j].id === 'hgs' && rects[i].id === 't-stick-zone') && hit(rects[i], rects[j])) bad.push(rects[i].id + '/' + rects[j].id);
      for (const r of rects) if (r.id !== 'hgs' && (r.w < 34 || r.h < 39)) bad.push(`${r.id} ${Math.round(r.w)}×${Math.round(r.h)}`);
      return bad;
    });
    check(`${vp.width}×${vp.height}: controls on screen, apart, at least 34×39 px`, small.length === 0, small.join(', '));
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
  await fingers.up(1); await mf(4);
  const s5 = await MI();
  check('released, the stick springs back to centre', Math.abs(s5.pitch) < 0.02 && Math.abs(s5.roll) < 0.02, `pitch ${fmt(s5.pitch, 3)}, roll ${fmt(s5.roll, 3)}`);
  const lv = await centreOf('#t-lever .thandle');
  await fingers.down(3, lv.x, lv.y); await fingers.move(3, lv.x, lv.y + 220); await fingers.up(3); await mf(3);
  const s6 = await MI();
  check('in the air the lever stops at idle: the reverse gate stays shut', s6.throttle === 0 && !s6.reverse, `throttle ${s6.throttle}, reverse ${s6.reverse}`);
  const rd = await centreOf('#t-rudder');
  await fingers.down(4, rd.x, rd.y); await fingers.move(4, rd.x + 50, rd.y); await mf(3);
  const s7 = await MI();
  await fingers.up(4); await mf(4);
  const s8 = await MI();
  check('rudder strip: right = right rudder, and it springs back', s7.yaw > 0.4 && Math.abs(s8.yaw) < 0.02, `yaw ${fmt(s7.yaw, 2)} → ${fmt(s8.yaw, 3)}`);
  await fingers.down(5, 430, 60); await fingers.move(5, 330, 60); await mf(2);
  const lk = await mp.evaluate(() => window.__sim.inputManager.look.yaw);
  await fingers.up(5); await mf(1);
  const lk2 = await mp.evaluate(() => window.__sim.inputManager.look.yaw);
  check('dragging on the windshield looks around and lets go straight ahead', Math.abs(lk) > 0.3 && lk2 === 0, `look yaw ${fmt(lk, 2)} → ${lk2}`);
  await mp.tap('#t-view'); await mf(1);
  const v1 = await mp.evaluate(() => window.__sim.inputManager.look.down);
  await mp.tap('#t-view'); await mf(1);
  check('VIEW toggles the panel view', v1 === true && !(await mp.evaluate(() => window.__sim.inputManager.look.down)));

  // go-around and reposition through the buttons
  await mp.tap('#t-toga'); await mf(2);
  const g1 = await MS(), gi = await MI();
  const repVisible = await mp.evaluate(() => !document.getElementById('t-reposition').classList.contains('hidden'));
  check('TO/GA gives full thrust, starts a go-around and offers REPOSITION', gi.throttle === 1 && g1.gaMode && repVisible);
  await mp.tap('#t-reposition'); await mf(2);
  const g2 = await MS();
  check('REPOSITION puts the aircraft back on final', !g2.gaMode && Math.abs(g2.dist - 10 * 1852) < 0.25 * 1852 && await mp.evaluate(() => document.getElementById('t-reposition').classList.contains('hidden')), `${fmt(g2.dist / 1852)} nm`);

  // pause, rotation, leaving the app
  await mp.tap('#t-pause'); await mf(1);
  check('the pause button pauses', (await MS()).gameState === 'paused' && await mp.evaluate(() => !document.getElementById('pause').classList.contains('hidden')));
  await mp.tap('#btn-resume'); await mf(1);
  await mp.setViewportSize({ width: 393, height: 852 }); await mf(2);
  const rot = await mp.evaluate(() => ({ shown: !document.getElementById('rotate').classList.contains('hidden'), state: window.__sim.game.state }));
  check('turning the phone upright pauses and asks for landscape', rot.shown && rot.state === 'paused', JSON.stringify(rot));
  await mp.screenshot({ path: path.join(out, 'e2e-phone-portrait.png') });
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
    if (k === 6) await mp.screenshot({ path: path.join(out, 'e2e-phone-school.png') });
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
if (!quick && (!only || only === 'touchland')) {
  console.log('\n[E11] Landing flown through the touch controls (phone, real time)');
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
  await mp.screenshot({ path: path.join(out, 'e2e-phone-landing.png') });
  await ctx.close();
}

// --------------------------------------------------------------------------- wrap up
const errs = await page.evaluate(() => window.__sim.errors);
const realConsole = consoleErrors.filter((e) => !/favicon|Autoplay|speech/i.test(e));
check('no JavaScript errors during the whole session', errs.length === 0 && realConsole.length === 0, [...errs, ...realConsole].slice(0, 5).join(' | '));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log('Failed: ' + failures.join(' | '));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
