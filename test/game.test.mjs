// The game's rules (js/game.js) and the flight controls' owner (js/flightcontrols.js) in Node:
// no browser, no DOM, no Three.js, no sound. The rules only emit events; this test records them.
// R7 checks that every phrase the game speaks has a voice recording (audio/voice).
//   node test/game.test.mjs
import { Game } from '../js/game.js';
import { GPWS } from '../js/gpws.js';
import { FlightControls } from '../js/flightcontrols.js';
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const NM = 1852;

// a player's devices: moves nothing unless told to; can be made to "grab" the controls
function fakePlayer() {
  return { updates: 0, idled: 0, grab: false, pitch: null,
    update(dt, input) { this.updates++; if (this.pitch !== null) input.pitch = this.pitch; }, idle() { this.idled++; }, grabbing() { return this.grab; } };
}
// a game with every event recorded, and a GPWS whose voice is recorded
function rig(opts = {}) {
  const player = fakePlayer();
  const said = [];
  const gpws = new GPWS({ say: (t) => { said.push(t); return true; }, play: (t) => said.push('sound:' + t), setConfigHorn() {} });
  const game = new Game({ player, gpws });
  const got = [];
  for (const t of ['state', 'start', 'school', 'message', 'instructor', 'control', 'goaround', 'reposition', 'demo', 'touchdown', 'spoilers', 'damage', 'finish']) game.on(t, (d) => got.push({ type: t, ...d }));
  const fly = (seconds, frame = 0.1) => { let sim = 0; for (let t = 0; t < seconds && game.state !== 'finished'; t += frame) sim += game.update(frame); return sim; };
  game.start(Object.assign({ mode: 'game', scenarioId: 'clear', startId: 'short', seed: 3 }, opts));
  return { game, player, got, said, fly, of: (t) => got.filter((e) => e.type === t) };
}

console.log('\n[R1] Rules without a browser');
{
  check('the rules and the controls load in Node with no window, document or WebGL', typeof globalThis.window === 'undefined' && typeof globalThis.document === 'undefined');
  const R = rig();
  check('a flight starts: start then state flying events, the log records it', R.of('start').length === 1 && R.of('state').some((e) => e.state === 'flying' && e.prev === 'menu') && R.game.events.some((e) => e.type === 'start'));
  const sim = R.fly(2);
  check('update() advances the physics and returns the simulated time', Math.abs(sim - 2) < 0.02 && R.game.time > 1.9, `${sim.toFixed(3)} s`);
  check('the player\'s devices move the controls once per frame while flying', R.player.updates >= 19, `${R.player.updates} updates`);
}

console.log('\n[R2] Actions');
{
  const R = rig();
  const inp = R.game.sim.aircraft.input;
  R.game.action('gear');
  check('gear: the control moves, a control event and the log entry', inp.gearDown === false && R.of('control').some((e) => e.name === 'gear' && e.value === false) && R.game.events.some((e) => e.text === 'gear up'));
  R.game.action('flapsDown');
  check('flaps down one stop (30 → 40)', inp.flapIndex === 5 && R.game.events.some((e) => e.text === 'flaps 40'));
  const n = R.of('control').length;
  R.game.action('flapsDown');
  check('flaps already at the last stop: nothing changes, nothing announced', inp.flapIndex === 5 && R.of('control').length === n);
  R.game.action('flapsUp'); R.game.action('flapsUp');
  check('flaps up two stops', inp.flapIndex === 3 && R.game.events.some((e) => e.text === 'flaps 15'));
  R.game.action('armSpeedbrake'); R.game.action('autobrake'); R.game.action('autobrake');
  check('speedbrakes armed, autobrake 2', inp.speedbrakeArmed && inp.autobrake === 2);
  R.game.action('toga');
  check('TO/GA: full thrust and a go-around, announced', inp.throttle === 1 && R.game.ctx.gaMode && R.of('goaround').some((e) => e.manual) && R.of('message').some((e) => /GO-AROUND/.test(e.text)));
  R.fly(4);
  R.game.action('reposition');
  check('reposition during the go-around: back at the start, with a message that clears itself', Math.abs(R.game.sim.state.distToThreshold - 4 * NM) < 5 && !R.game.ctx.gaMode && R.of('reposition').length === 1 && R.of('message').some((e) => /REPOSITIONED/.test(e.text) && e.duration > 0));
  R.game.togglePause();
  const t0 = R.game.time;
  check('pause: the state and no simulated time passes', R.game.state === 'paused' && R.fly(1) === 0 && R.game.time === t0);
  const gear = inp.gearDown;
  R.game.action('gear');
  check('actions do nothing while paused', inp.gearDown === gear);
  R.game.togglePause();
  check('resume', R.game.state === 'flying' && R.fly(0.5) > 0.4);
}

console.log('\n[R3] Autoland demo and taking over');
{
  const R = rig({ demo: true });
  check('the demo has command and says so', !!R.game.demoAp && R.game.controls.commander === 'autopilot' && R.of('message').some((e) => /AUTOLAND DEMO/.test(e.text)));
  const u0 = R.player.updates;
  R.fly(3);
  check('while the autoland flies, the devices only keep time', R.player.updates === u0 && R.player.idled > 20);
  R.player.grab = true; R.player.pitch = 0.3;
  R.fly(0.2);
  check('grabbing a control takes command: demo event, message, log', R.game.demoAp === null && R.of('demo').length === 1 && R.of('message').some((e) => /DISENGAGED/.test(e.text)) && R.game.events.some((e) => e.type === 'demo' && e.text === 'disengaged'));
  check('from then on the player\'s devices fly', R.player.updates > u0 && R.game.sim.aircraft.input.pitch === 0.3);
  const R2 = rig({ demo: true });
  R2.game.action('flapsUp');
  check('a configuration action also takes over from the demo', R2.game.demoAp === null && R2.of('demo').length === 1);
}

console.log('\n[R4] A whole landing, flown by the test pilot');
{
  const R = rig({ scenarioId: 'crosswind', seed: 3 });
  R.game.engageAutopilot();
  R.fly(400);
  const td = R.of('touchdown')[0], fin = R.of('finish')[0];
  check('touchdown reported with its sink rate and position', !!td && td.sink > 0 && td.sink < 4 && td.distFromThreshold > 100, td ? `${(td.sink / 0.00508).toFixed(0)} fpm at ${td.distFromThreshold.toFixed(0)} m` : 'none');
  check('ground spoilers reported', R.of('spoilers').length >= 1);
  check('finished: graded, the state machine at finished, the simulation stopped', !!fin && fin.result.success && R.game.state === 'finished' && R.game.sim.paused && R.game.result === fin.result, fin ? `${fin.result.score} ${fin.result.grade}` : '');
  check('the GPWS called out the approach through its voice output', R.said.includes('Minimums') && R.said.includes('Fifty'), R.said.slice(0, 6).join(', '));
  check('the log has the flight\'s story', ['start', 'touchdown', 'systems', 'result'].every((t) => R.game.events.some((e) => e.type === t)));
}

console.log('\n[R5] Training: Flight School first, flight director, checklist, instructor');
{
  const R = rig({ mode: 'training', startId: 'standard' });
  check('training opens Flight School before the flight, paused', R.game.state === 'school' && R.of('school').some((e) => e.fromStart) && R.fly(1) === 0);
  R.game.schoolDone(true);
  check('closing it starts the flight, logged as skipped', R.game.state === 'flying' && R.game.events.some((e) => e.type === 'school' && e.text === 'skipped'));
  R.fly(2);
  const fd = R.game.fdCommand(), cl = R.game.checklist();
  check('the flight director gives an attitude to fly, from its own copy of the controls', !!fd && Number.isFinite(fd.pitch) && R.game.controls.shadow !== R.game.sim.aircraft.input);
  check('the landing checklist', Array.isArray(cl) && cl.length === 4 && cl.some((c) => c.text === 'Gear down' && !c.done));
  check('the instructor speaks every half second', R.of('instructor').filter((e) => e.html).length >= 3);
  R.game.action('help');
  check('help in flight opens Flight School and pauses', R.game.state === 'school' && R.of('school').some((e) => !e.fromStart));
  R.game.schoolDone(false);
  check('closing it resumes (not logged again)', R.game.state === 'flying' && R.game.events.filter((e) => e.type === 'school').length === 1);
  R.game.quitToMenu();
  check('quit to the menu', R.game.state === 'menu' && R.game.sim.paused);
}

console.log('\n[R6] One owner of the controls');
{
  const R = rig();
  const fc = new FlightControls(R.game.sim.aircraft, null);
  const inp = R.game.sim.aircraft.input;
  const before = inp.gearDown;
  check('discrete actions go through one place and report what changed', fc.act('gear').value === !before && inp.gearDown === !before && fc.act('nonsense') === null);
  fc.enableDirector();
  const thr = inp.throttle, pitch = inp.pitch;
  for (let i = 0; i < 240; i++) fc.step(1 / 120);
  check('the flight director never moves the aircraft\'s controls', inp.throttle === thr && inp.pitch === pitch && fc.shadow.pitch !== 0);
}

console.log('\n[R7] Every phrase the game speaks has a recording');
{
  // the phrases in the code: the strings on the lines that speak (say, announce, the height callouts)
  const src = ['gpws.js', 'presentation.js'].map((f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')).join('\n');
  const spoken = new Set();
  for (const line of src.split('\n').filter((l) => /\b(say|announce)\(|const text =/.test(l))) for (const m of line.matchAll(/'([A-Z][a-z][^']*)'/g)) spoken.add(m[1]);
  const dir = new URL('../audio/voice/', import.meta.url);
  const { phrases } = JSON.parse(fs.readFileSync(new URL('phrases.json', dir), 'utf8'));
  const missing = [...spoken].filter((t) => !phrases.includes(t)), unused = phrases.filter((t) => !spoken.has(t));
  check('the phrase list is exactly what the GPWS and the game say', spoken.size >= 20 && !missing.length && !unused.length, missing.length || unused.length ? `missing: ${missing.join(', ') || '-'}; never said: ${unused.join(', ') || '-'}` : `${phrases.length} phrases`);
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const bad = phrases.filter((t) => { try { const b = fs.readFileSync(new URL(slug(t) + '.mp3', dir)); return b.length < 1500 || !(b[0] === 0xff && (b[1] & 0xe0) === 0xe0 || b.toString('latin1', 0, 3) === 'ID3'); } catch (e) { return true; } });
  check('each phrase has its MP3 file', !bad.length, bad.length ? 'bad or missing: ' + bad.join(', ') : `${phrases.length} files`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
