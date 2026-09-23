// Browser end-to-end QA: plays the game in headless Chromium (SwiftShader).
//   node test/e2e.mjs            (all)      node test/e2e.mjs quick   (skip the slow keyboard landing)
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
  const m = await page.evaluate(async () => {
    const t0 = performance.now(), s0 = window.__sim.state().time;
    await new Promise((r) => setTimeout(r, 3000));
    const wall = (performance.now() - t0) / 1000, sim = window.__sim.state().time - s0;
    return { wall, sim, fps: window.__sim.stats.fps };
  });
  check('sim time tracks wall time at 1x regardless of fps', Math.abs(m.sim / m.wall - 1) < 0.15, `sim ${fmt(m.sim, 2)} s in ${fmt(m.wall, 2)} s wall at ${fmt(m.fps, 1)} fps`);
  const m4 = await page.evaluate(async () => {
    window.__sim.setTimeScale(4);
    const t0 = performance.now(), s0 = window.__sim.state().time;
    await new Promise((r) => setTimeout(r, 3000));
    const wall = (performance.now() - t0) / 1000, sim = window.__sim.state().time - s0;
    window.__sim.setTimeScale(1);
    return { wall, sim };
  });
  check('time scale 4x advances the physics ~4x', m4.sim / m4.wall > 3.2 && m4.sim / m4.wall < 4.6, `ratio ${fmt(m4.sim / m4.wall, 2)}`);
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

// --------------------------------------------------------------------------- wrap up
const errs = await page.evaluate(() => window.__sim.errors);
const realConsole = consoleErrors.filter((e) => !/favicon|Autoplay|speech/i.test(e));
check('no JavaScript errors during the whole session', errs.length === 0 && realConsole.length === 0, [...errs, ...realConsole].slice(0, 5).join(' | '));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log('Failed: ' + failures.join(' | '));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
