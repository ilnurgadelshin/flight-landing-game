// Playtest harness: plays the game the way a new player would (menu clicks,
// mouse yoke, key presses), pauses at every phase of the approach, and writes
// a diary (state, callouts, events) plus screenshots for scrutiny.
//   node test/playtest.mjs [scenario-list]   e.g. node test/playtest.mjs training,clear,storm
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const outRoot = path.join(root, 'test', 'output', 'playtest');
fs.mkdirSync(outRoot, { recursive: true });

const RUNS = {
  training:      { mode: 'training', scenario: 'clear', start: 'standard', night: false },
  clear:         { mode: 'game', scenario: 'clear', start: 'standard', night: false },
  tailwind:      { mode: 'game', scenario: 'tailwind', start: 'short', night: false },
  crosswind:     { mode: 'game', scenario: 'crosswind', start: 'standard', night: false },
  storm:         { mode: 'game', scenario: 'storm', start: 'standard', night: false },
  night:         { mode: 'game', scenario: 'clear', start: 'short', night: true },
  goaround:      { mode: 'game', scenario: 'clear', start: 'short', night: false, pilot: { goAroundAt: 300 } },
  gearup:        { mode: 'game', scenario: 'clear', start: 'short', night: false, pilot: { noGear: true }, before: 'gearUp' },
  noflare:       { mode: 'game', scenario: 'clear', start: 'short', night: false, pilot: { noFlare: true } },
  overrun:       { mode: 'game', scenario: 'tailwind', start: 'short', night: false, pilot: { landLong: true, noBrakes: true, useReversers: false, autobrake: 0 } },
  stall:         { mode: 'game', scenario: 'clear', start: 'short', night: false, pilot: { stallOnFinal: true } },
  full:          { mode: 'game', scenario: 'clear', start: 'full', night: false },
};
const list = (process.argv[2] || Object.keys(RUNS).join(',')).split(',');

const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });
await page.goto(url + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sim, null, { timeout: 60000 });
await page.addScriptTag({ path: path.join(root, 'test', 'human-pilot.browser.js') });
const frames = (n) => page.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n);
const S = () => page.evaluate(() => { const s = window.__sim.state(); const g = window.__sim.game; const a = window.__sim.audioLog(); return { time: s.time, gameState: g.state, ias: s.ias, alt: s.alt / 0.3048, agl: s.agl / 0.3048, vs: s.vs / 0.00508, pitch: s.pitch * 57.3, roll: s.roll * 57.3, hdg: s.heading * 57.3, gs: s.groundSpeed / 0.5144, n1: s.n1[0], thr: s.throttle, flapDeg: s.flapDeg, flapSel: s.flapIndex, gear: s.gearPos, sb: s.speedbrake, sbArmed: s.speedbrakeArmed, ab: s.autobrake, brake: s.brake, rev: s.reverser, trim: s.trim, dist: s.distToThreshold / 1852, lat: s.lateralOffset, loc: s.locDev, gsDev: s.gsDev, crab: s.crabDeg, xw: s.crosswind, hw: s.headwind, windDir: s.windDirDeg, windKts: s.windKts, alpha: s.alpha * 57.3, onGround: s.onGround, stall: s.stallWarning, g: s.gLoad, papi: window.__sim.world.lights.papiWhites(window.__sim.game.eye), instructor: document.getElementById('instructor').textContent, caption: document.getElementById('gpws-caption').textContent, mode: document.getElementById('mode-msg').textContent, voices: a.filter((x) => x.kind === 'voice').map((x) => x.text), sounds: a.filter((x) => x.kind === 'sound').map((x) => x.text), events: window.__sim.events().map((e) => `${e.t.toFixed(0)}s ${e.type}: ${e.text}`), fps: window.__sim.stats.fps, ga: g.ctx.gaMode }; });

for (const name of list) {
  const run = RUNS[name]; if (!run) { console.log('unknown run', name); continue; }
  const dir = path.join(outRoot, name); fs.mkdirSync(dir, { recursive: true });
  const diary = []; let shotN = 0;
  const diaryPath = path.join(dir, 'diary.md');
  const say = (m) => { diary.push(m); console.log(`  ${m}`); fs.writeFileSync(diaryPath, diary.join('\n') + '\n'); };
  const shot = async (label) => { await frames(2); const f = `${String(++shotN).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: path.join(dir, f) }); return f; };
  const dumpPfd = async (label) => { const d = await page.evaluate(() => window.__sim.cockpit.pfd.canvas.toDataURL('image/png')); fs.writeFileSync(path.join(dir, `pfd-${label}.png`), Buffer.from(d.split(',')[1], 'base64')); const u = await page.evaluate(() => window.__sim.cockpit.upper.canvas.toDataURL('image/png')); fs.writeFileSync(path.join(dir, `eng-${label}.png`), Buffer.from(u.split(',')[1], 'base64')); };
  let lastVoiceN = 0, lastEventN = 0;
  const checkpoint = async (label, extraNote = '') => {
    // screenshot the live view first, then pause like a player would, note everything, resume
    const f = await shot(label);
    await page.keyboard.press('KeyP'); await frames(1);
    const s = await S();
    const newVoices = s.voices.slice(lastVoiceN); lastVoiceN = s.voices.length;
    const newEvents = s.events.slice(lastEventN); lastEventN = s.events.length;
    say(`\n### ${label}  (t=${s.time.toFixed(0)} s, ${f})${extraNote ? '\n' + extraNote : ''}`);
    say(`IAS ${s.ias.toFixed(0)} kt · ALT ${s.alt.toFixed(0)} ft · RA ${s.agl.toFixed(0)} ft · VS ${s.vs.toFixed(0)} fpm · pitch ${s.pitch.toFixed(1)}° · roll ${s.roll.toFixed(1)}° · HDG ${s.hdg.toFixed(0)}° · GS ${s.gs.toFixed(0)} kt · α ${s.alpha.toFixed(1)}° · g ${s.g.toFixed(2)}`);
    say(`N1 ${(s.n1 * 100).toFixed(0)}% (lever ${(s.thr * 100).toFixed(0)}%) · flaps ${s.flapDeg.toFixed(0)} (sel ${[0, 1, 5, 15, 30, 40][s.flapSel]}) · gear ${s.gear.toFixed(1)} · spdbrk ${s.sb.toFixed(1)}${s.sbArmed ? ' ARMED' : ''} · autobrake ${s.ab} · brake ${(s.brake * 100).toFixed(0)}% · rev ${s.rev.toFixed(1)} · trim ${s.trim.toFixed(1)}`);
    say(`dist ${s.dist.toFixed(1)} nm · lat ${s.lat.toFixed(0)} m · LOC ${s.loc.toFixed(2)}° · GS ${s.gsDev.toFixed(2)}° · PAPI ${'W'.repeat(s.papi)}${'R'.repeat(4 - s.papi)} · crab ${s.crab.toFixed(1)}° · wind ${s.windDir.toFixed(0)}°/${s.windKts.toFixed(0)} kt (hw ${s.hw.toFixed(0)}, xw ${s.xw.toFixed(0)}) · ${s.onGround ? 'ON GROUND' : 'airborne'}${s.stall ? ' · STALL WARNING' : ''}${s.ga ? ' · GO-AROUND' : ''} · fps ${s.fps.toFixed(1)}`);
    if (s.mode) say(`mode message: "${s.mode}"`);
    if (s.instructor) say(`instructor: "${s.instructor}"`);
    if (s.caption) say(`GPWS caption: "${s.caption}"`);
    if (newVoices.length) say(`voice since last: ${newVoices.join(' | ')}`);
    if (newEvents.length) say(`events since last: ${newEvents.join(' | ')}`);
    await page.keyboard.press('KeyP'); await frames(1);
    return s;
  };
  const waitCond = async (expr, timeout = 480000) => { try { await page.waitForFunction(`(() => { const s = window.__sim.state(), g = window.__sim.game, p = window.__pilot; return g.state === 'finished' || (${expr}); })()`, null, { timeout }); return true; } catch { return false; } };

  console.log(`\n=== PLAYTEST ${name}: ${JSON.stringify(run)}`);
  diary.push(`# Playtest: ${name}\n\n${JSON.stringify(run)}\n`);
  // ---- menu, like a player
  await page.evaluate(() => { if (window.__sim.game.state !== 'menu') window.__sim.game.quitToMenu(); });
  await frames(2);
  await page.click(`#mode-row .choice[data-mode="${run.mode}"]`);
  await page.click(`#scenario-row .choice[data-scenario="${run.scenario}"]`);
  await page.click(`#start-row .choice[data-start="${run.start}"]`);
  const nightChecked = await page.isChecked('#opt-night'); if (nightChecked !== !!run.night) await page.click('#opt-night');
  await shot('menu');
  await page.click('#btn-start');
  await frames(3);
  if (run.mode === 'training') {
    // read every page of the school
    const total = parseInt((await page.textContent('#school-step')).split('/')[1], 10);
    for (let k = 0; k < total; k++) {
      const title = await page.textContent('#school-title'); const body = await page.textContent('#school-body');
      say(`school ${k + 1}/${total}: ${title} — ${body.slice(0, 110)}…`);
      if (k === 0 || k === 6 || k === 8) await shot(`school-${k + 1}`);
      await page.click('#school-next'); await frames(3);
    }
  }
  if (run.before === 'gearUp') await page.evaluate(() => { window.__sim.input().gearDown = false; window.__sim.game.sim.aircraft.gearPos = 0; });
  await frames(6);
  const fps = await page.evaluate(() => window.__sim.stats.fps);
  const scale = Math.max(0.3, Math.min(1, fps / 10));
  await page.evaluate((sc) => window.__sim.setTimeScale(sc), scale);
  say(`(render ${fps.toFixed(1)} fps in software rendering -> simulation slowed to ${scale.toFixed(2)}x so the pilot reacts ~10x per simulated second)`);
  await checkpoint('start', 'First look after pressing Start.');
  await dumpPfd('start');
  // engage the mouse yoke by clicking the window, install the pilot
  await page.mouse.click(512, 200); await frames(2);
  say(`mouse yoke engaged: ${await page.evaluate(() => window.__sim.inputManager.mouseEngaged)}`);
  await page.evaluate((o) => window.installHumanPilot(o), run.pilot || {});

  const cps = [
    ['flaps-15-selected', "p.did.f15 || s.distToThreshold < 8 * 1852"],
    ['gear-down', "p.did.gear || s.distToThreshold < 6.9 * 1852"],
    ['flaps-30', "p.did.f30 || s.distToThreshold < 5.8 * 1852"],
    ['1000ft', "s.agl < 1000 * 0.3048 && s.distToThreshold < 4 * 1852"],
    ['500ft', "s.agl < 500 * 0.3048"],
    ['200ft-minimums', "s.agl < 200 * 0.3048"],
    ['50ft', "s.agl < 50 * 0.3048"],
    ['flare', "s.agl < 20 * 0.3048"],
    ['touchdown', "s.onGround"],
    ['rollout-80kt', "s.onGround && s.groundSpeed < 80 * 0.5144"],
    ['stopped', "g.state === 'finished'"],
  ];
  if (run.pilot && run.pilot.goAroundAt) {
    cps.splice(6, 0, ['go-around-initiated', "p.did.ga"], ['go-around-climbing', "p.did.ga && s.agl > 800 * 0.3048"], ['repositioned', "p.did.repos"]);
  }
  const startDist = await page.evaluate(() => window.__sim.state().distToThreshold / 1852);
  for (const [label, cond] of cps) {
    if (startDist < 5 && ['flaps-15-selected', 'gear-down', 'flaps-30'].includes(label)) continue;
    const ok = await waitCond(cond);
    if (!ok) { say(`(timeout waiting for ${label})`); break; }
    const finishedEarly = label !== 'stopped' && (await page.evaluate(() => window.__sim.game.state === 'finished'));
    const s = await checkpoint(finishedEarly ? `flight-ended-before-${label}` : label);
    if (['500ft', 'flare', 'stopped'].includes(label) || finishedEarly) await dumpPfd(finishedEarly ? 'ended' : label);
    if (label === '500ft' || label === 'gear-down') { await page.evaluate(() => { window.__sim.inputManager.look.down = true; }); await shot(label + '-pedestal'); await page.evaluate(() => { window.__sim.inputManager.look.down = false; }); }
    if (label === '1000ft' || label === '200ft-minimums') { await page.evaluate(() => { window.__sim.inputManager.look.yaw = 1.2; }); await shot(label + '-left-window'); await page.evaluate(() => { window.__sim.inputManager.look.yaw = 0; }); }
    if (s.gameState === 'finished') break;
  }
  const res = await page.evaluate(() => window.__sim.result());
  if (res) {
    say(`\n## RESULT: ${res.outcome.toUpperCase()} — ${res.headline} — ${res.score}/100 grade ${res.grade}`);
    for (const it of res.items) say(`- ${it.label}: ${it.value} — ${it.note} (${it.points}/${it.max})`);
    for (const n of res.notes) say(`- ⚠ ${n}`);
    await shot('results');
  }
  const trace = await page.evaluate(() => window.__pilot ? window.__pilot.trace : []);
  fs.writeFileSync(path.join(dir, 'trace.json'), JSON.stringify(trace));
  const plog = await page.evaluate(() => window.__pilot ? window.__pilot.log : []);
  diary.push('\npilot actions: ' + plog.map((l) => `${l.t.toFixed(0)}s ${l.m}`).join(' | '));
  diary.push('\npage errors: ' + (pageErrors.length ? pageErrors.join(' | ') : 'none'));
  fs.writeFileSync(path.join(dir, 'diary.md'), diary.join('\n'));
  await page.evaluate(() => { window.__sim.setTimeScale(1); if (window.__pilot) window.__pilot.phase = 'done'; });
}
await browser.close(); server.close();
console.log('\nplaytest done');
