// The game's rules (js/game.js) and the flight controls' owner (js/flightcontrols.js) in Node:
// no browser, no DOM, no Three.js, no sound. The rules only emit events; this test records them.
// R7 checks that every phrase the game speaks has a voice recording (audio/voice).
//   node test/game.test.mjs
import { Game } from '../js/game.js';
import { GPWS } from '../js/gpws.js';
import { FlightControls } from '../js/flightcontrols.js';
import { FT, DEG } from '../js/config.js';
import { ndModel, autoRange } from '../js/nd.js';
import { MISSED } from '../js/nav.js';
import { debriefModel } from '../js/debrief.js';
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

console.log('\n[R8] The autoland\'s autothrottle in a storm');
{
  const { AUTOTHROTTLE, windAdditive } = await import('../js/autopilot.js');
  const { SCENARIOS } = await import('../js/config.js');
  const add = Object.fromEntries(Object.keys(SCENARIOS).map((k) => [k, windAdditive(SCENARIOS[k])]));
  check('approach speed: Vref + half the steady headwind + the gust, between 5 and 20 kt', add.clear === 5 && add.tailwind === 5 && Math.abs(add.crosswind - 10.4) < 0.1 && add.storm === 20, JSON.stringify(Object.fromEntries(Object.entries(add).map(([k, v]) => [k, +v.toFixed(1)]))));
  const R = rig({ scenarioId: 'storm', startId: 'standard', seed: 3 });
  R.game.engageAutopilot();
  const ap = R.game.demoAp, st = R.game.sim.state, inp = R.game.sim.aircraft.input, frame = 1 / 30;
  const L = [], modes = [];
  let prev = inp.throttle;
  for (let t = 0; t < 600 && R.game.state !== 'finished'; t += frame) {
    R.game.update(frame);
    const m = ap.atMode; if (modes[modes.length - 1] !== m) modes.push(m);
    if (ap.phase === 'approach' && st.agl < 1500 * FT && st.agl > 50 * FT) L.push({ lever: inp.throttle, rate: (inp.throttle - prev) / frame, ias: st.ias, filtered: ap.at.speed, vref: st.vref });
    prev = inp.throttle;
  }
  const up = Math.max(...L.map((x) => x.rate)), down = -Math.min(...L.map((x) => x.rate));
  check('the servo moves the levers no faster than its rates: 8 %/s up, 4 %/s down', up <= AUTOTHROTTLE.rateUp * 100 / 100 + 1e-6 && down <= AUTOTHROTTLE.rateDown + 1e-6, `up ${(up * 100).toFixed(1)} %/s, down ${(down * 100).toFixed(1)} %/s`);
  let rev = 0, dir = 0, ext = L[0].lever;
  for (const x of L) { if (Math.abs(x.lever - ext) > 0.03) { const s = Math.sign(x.lever - ext); if (dir && s !== dir) rev++; dir = s; ext = x.lever; } }
  const minutes = L.length * frame / 60;
  check('no pumping: under 15 reversals a minute, never at idle or full', rev / minutes < 15 && L.every((x) => x.lever > 0.02 && x.lever < 0.98), `${(rev / minutes).toFixed(1)} reversals/min, lever ${Math.round(Math.min(...L.map((x) => x.lever)) * 100)}–${Math.round(Math.max(...L.map((x) => x.lever)) * 100)} %`);
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length, sd = (a) => { const k = m(a); return Math.sqrt(m(a.map((x) => (x - k) ** 2))); };
  // the gusts' quick changes of airspeed are what the filter keeps from the levers
  const rate = (k) => L.slice(1).map((x, i) => (x[k] - L[i][k]) / frame);
  const rIas = sd(rate('ias')), rFil = sd(rate('filtered'));
  check('the gusts are filtered out of the speed it controls (it changes at under half the airspeed\'s rate)', rFil < 0.5 * rIas, `airspeed ${rIas.toFixed(2)} kt/s, filtered ${rFil.toFixed(2)} kt/s (σ)`);
  const over = m(L.map((x) => x.ias - x.vref));
  check('and it holds Vref + 20 on average', Math.abs(over - 20) < 3, `Vref + ${over.toFixed(1)}`);
  check('the flight mode annunciator: MCP SPD, RETARD from 27 ft, ARM after touchdown', modes.join(' ') === 'MCP SPD RETARD ARM', modes.join(' → '));
  const fin = R.of('finish')[0];
  check('it lands', !!fin && fin.result.success, fin ? `${fin.result.score} ${fin.result.grade}` : 'no result');
}

// what the navigation display, the FMA and the MCP show, sampled through R9's go-around flight (R10)
const navLog = [];
let navGA = null;
const snapNav = (game) => {
  const ap = game.demoAp, st = game.sim.state;
  if (!ap) return;
  const opts = game.ndOpts(), nd = ndModel(st, game.efis, opts);
  navLog.push({ t: st.time, phase: ap.phase, leg: ap.leg, fma: ap.fma, mcp: ap.mcp, opts, alt: st.alt / FT, agl: st.agl / FT, trk: st.track / DEG, x: st.x, z: st.z,
    range: nd.range, auto: autoRange(st, opts.circuit), routeActive: nd.route.active, missedActive: nd.missed.active, fix: nd.active.name, bug: nd.hdgBug, hdgLine: nd.hdgLine,
    loc: st.ils.locValid, gs: st.ils.gsValid, kind: game.path.samples.length ? game.path.samples[game.path.samples.length - 1].kind : '' });
};

console.log('\n[R9] The autoland goes around when an approach or a landing goes bad');
{
  const { Autopilot, GO_AROUND } = await import('../js/autopilot.js');
  const { SCENARIOS } = await import('../js/config.js');
  // the criteria on made-up states: a stable approach at 800 ft unless told otherwise
  const stub = (over) => ({ state: Object.assign({ agl: 800 * FT, onGround: false, vs: -3.9, gsDev: 0, locDev: 0, ias: 147, vref: 142, roll: 0, lateralOffset: 0, alongRunway: -3000 }, over), input: {}, touchdown: null, atmosphere: { scenario: SCENARIOS.clear } });
  const reason = (over, secs, phase = 'approach', opts = {}) => {
    const ap = new Autopilot(stub(over), opts); ap.phase = phase;
    let r = '', t = 0;
    for (; t < secs && !r; t += 0.1) r = ap.canGoAround ? ap.goAroundReason(0.1) : '';
    return { r, t };
  };
  check('a stable approach never goes around', reason({}, 20).r === '');
  const sink = reason({ vs: -1500 * 0.00508 }, 10);
  check('sinking at 1500 fpm below 1000 ft for 3 s: go around (a moment is not enough)', /sink rate/.test(sink.r) && sink.t > 2.9 && reason({ vs: -1500 * 0.00508 }, 2.5).r === '', `${sink.r} after ${sink.t.toFixed(1)} s`);
  check('a glideslope 1° off at 800 ft: go around', /glideslope/.test(reason({ gsDev: 1.0 }, 10).r));
  check('the localizer 2° off: go around', /localizer/.test(reason({ locDev: 2.0 }, 10).r));
  check('the gust-filtered speed 8 kt below Vref: go around', /below Vref/.test(reason({ ias: 134 }, 10).r));
  check('18° of bank at 200 ft: go around', /bank/.test(reason({ agl: 200 * FT, roll: 18 * Math.PI / 180 }, 5).r));
  check('14 m off the centreline at 80 ft: go around', /lined up/.test(reason({ agl: 80 * FT, lateralOffset: 14 }, 5).r));
  {
    const ap = new Autopilot(stub({ agl: 20 * FT, alongRunway: 400 })); ap.phase = 'flare';
    const seq = [20, 16, 12, 14, 18, 22, 26].map((ft) => { ap.ac.state.agl = ft * FT; return ap.goAroundReason(0.1); });
    check(`a balloon of more than ${GO_AROUND.balloonFt} ft in the flare: go around (not a smaller one)`, seq.slice(0, 5).every((x) => !x) && /balloon/.test(seq[6]), seq.map((x) => x || '·').join(' '));
  }
  check(`still airborne ${GO_AROUND.longM} m past the threshold: go around (long landing)`, /long landing/.test(reason({ agl: 4 * FT, alongRunway: 1100 }, 1, 'flare').r) && reason({ agl: 4 * FT, alongRunway: 800 }, 1, 'flare').r === '');
  {
    const ap = new Autopilot(stub({ vs: -2000 * 0.00508 })); ap.ac.touchdown = { t: 1 };
    let r = ''; for (let t = 0; t < 5; t += 0.1) r = r || ap.goAroundReason(0.1);
    check('never once the wheels have touched (the landing is committed)', r === '');
  }
  check('never for the flight director, the failure tests, or after two go-arounds (a crew would divert)',
    [{ goAround: false }, { noFlare: true }, { hardLanding: true }, { goAroundsFlown: 2 }].every((o) => reason({ vs: -2000 * 0.00508 }, 10, 'approach', o).r === '') && new FlightControls(stub({}), null).enableDirector() !== false);

  // a go-around forced at 200 ft, flown through the circuit to the next landing
  const R = rig({ scenarioId: 'clear', startId: 'short', seed: 3 });
  R.game.engageAutopilot();
  const ap = R.game.demoAp, st = R.game.sim.state, inp = R.game.sim.aircraft.input, frame = 1 / 30;
  let tGA = null, h0 = 0, low = 1e9, maxPitch = 0, gearUpVs = null, thr3 = null, level = [], legs = [], modes = new Set(), saidAt = 0;
  for (let t = 0; t < 2400 && R.game.state !== 'finished'; t += frame) {
    if (tGA === null && st.agl < 200 * FT) { ap.goAround('forced for the test'); tGA = st.time; h0 = st.agl; saidAt = R.said.length; }
    const gearWas = inp.gearDown;
    R.game.update(frame);
    if (Math.round(st.time * 30) % 10 === 0) snapNav(R.game);
    modes.add(ap.atMode);
    if (tGA !== null && ap.phase === 'goaround') { low = Math.min(low, st.agl); maxPitch = Math.max(maxPitch, st.pitch); if (thr3 === null && st.time - tGA > 3) thr3 = inp.throttle; }
    if (gearWas && !inp.gearDown && gearUpVs === null) gearUpVs = st.vs;
    if (ap.phase === 'missed' && legs[legs.length - 1] !== ap.leg) legs.push(ap.leg);
    if (ap.leg === 'downwind') level.push(st.alt / FT);
  }
  const ga = R.of('goaround')[0], fin = R.of('finish')[0];
  navGA = { tGA, path: R.game.path, game: R.game };
  check('TO/GA: the game announces it with the reason ("Go around, flaps fifteen" follows)', !!ga && ga.reason === 'forced for the test' && R.of('message').some((m) => /AUTOLAND GO-AROUND — forced/.test(m.text)));
  check('go-around thrust within 3 s, flaps 15, the nose towards 15° (at most 17°)', thr3 >= 0.85 && maxPitch < 17 * Math.PI / 180, `levers ${Math.round(thr3 * 100)} % after 3 s, pitch up to ${(maxPitch * 180 / Math.PI).toFixed(1)}°`);
  check('it stops the descent within 60 ft and climbs away', h0 - low < 60 * FT, `lost ${((h0 - low) / FT).toFixed(0)} ft`);
  check('gear up with a positive rate of climb', gearUpVs > 1, `climbing ${(gearUpVs / 0.00508).toFixed(0)} fpm`);
  check('the autothrottle mode shows GA', modes.has('GA'));
  check('the missed approach: climb, then a left-hand circuit — crosswind, downwind, base, intercept', legs.join(' ') === 'climb crosswind downwind base intercept', legs.join(' → '));
  const lv = level.slice(Math.floor(level.length / 3));
  check('downwind level at 3000 ft', lv.length && Math.max(...lv.map((a) => Math.abs(a - GO_AROUND.missedAltFt))) < 150, `${Math.round(Math.min(...lv))}–${Math.round(Math.max(...lv))} ft`);
  check('the missed approach message; no "too low" warning during the go-around and the circuit', R.of('message').some((m) => /MISSED APPROACH/.test(m.text)) && !R.said.slice(saidAt).some((x) => /Too low|Don't sink|Pull up/.test(x)));
  check('another approach from the localizer intercept, and a landing', !!fin && fin.result.success && ap.log.some((l) => /another approach/.test(l.msg)), fin ? `${fin.result.score} ${fin.result.grade}` : 'no result');
  check('the debrief grades that landing and counts the go-around', fin && fin.result.touchdown.t > tGA + 300 && fin.result.items.some((i) => i.label === 'Go-arounds' && i.value === '1'), fin ? `touchdown at ${fin.result.touchdown.t.toFixed(0)} s, go-around at ${tGA.toFixed(0)} s` : '');

  // the storm: approaches that go bad by themselves
  const storm = (startId, seed) => {
    const Q = rig({ scenarioId: 'storm', startId, seed }); Q.game.engageAutopilot();
    for (let t = 0; t < 2400 && Q.game.state !== 'finished'; t += frame) Q.game.update(frame);
    const f = Q.of('finish')[0], g = Q.game.events.filter((e) => e.type === 'goaround');
    return { f, g, gaT: g.length ? g[0].t : null };
  };
  const b = storm('standard', 21);
  check('storm: a balloon in the flare — it goes around, and lands from the next approach', b.g.length && /balloon/.test(b.g[0].text) && b.f && b.f.result.success && b.f.result.touchdown.sink < 3.05, b.f ? `${b.g.map((e) => e.text).join('; ')} → ${(b.f.result.touchdown.sink / 0.00508).toFixed(0)} fpm` : 'no result');
  const l = storm('short', 8);
  check('storm: floating past the touchdown zone — it goes around; the touch-and-go is not the landing graded', l.g.some((e) => /long landing/.test(e.text)) && l.g.some((e) => /touch-and-go/.test(e.text)) && l.f && l.f.result.success && l.f.result.touchdown.alongRunway < 1000 && l.f.result.touchdown.flapDeg === 30, l.f ? `graded touchdown ${l.f.result.touchdown.alongRunway.toFixed(0)} m past the threshold, flaps ${l.f.result.touchdown.flapDeg}` : 'no result');
  const n = storm('short', 11);
  check('storm: an approach that stays within the limits lands without a go-around', n.g.length === 0 && n.f && n.f.result.success);

  // a reposition during the go-around: the autoland starts the new approach and keeps count
  const P = rig({ scenarioId: 'clear', startId: 'short', seed: 3 });
  P.game.engageAutopilot();
  let repositioned = false;
  for (let t = 0; t < 900 && P.game.state !== 'finished'; t += frame) {
    const a = P.game.demoAp;
    if (a && a.phase === 'approach' && !a.goArounds && P.game.sim.state.agl < 300 * FT) a.goAround('forced for the test');
    if (!repositioned && a && a.phase === 'missed') { P.game.action('reposition'); repositioned = true; }
    P.game.update(frame);
  }
  const pf = P.of('finish')[0];
  check('repositioned on final during the go-around: the autoland flies the new approach and lands (one go-around counted)', repositioned && P.game.demoAp && P.game.demoAp.goArounds === 1 && pf && pf.result.success && P.game.ctx.goArounds === 1, pf ? `${pf.result.score} ${pf.result.grade}` : 'no result');
}

console.log('\n[R10] The navigation display, the FMA and the MCP through a go-around and the circuit');
{
  // the EFIS control panel
  const R = rig({ scenarioId: 'clear', startId: 'standard', seed: 3 });
  const e = R.game.efis, st = R.game.sim.state;
  check('a flight starts with the ND in MAP on the automatic range (20 nm at 10 nm out)', e.mode === 'MAP' && e.auto && autoRange(st, false) === 20);
  R.game.action('ndRange', 1);
  check('the range knob steps from the range shown (20 → 40), and from then on it is the pilot\'s', e.range === 40 && !e.auto && R.of('control').some((c) => c.name === 'ndRange' && c.value === 40));
  for (let i = 0; i < 4; i++) R.game.action('ndRange', 1);
  const top = e.range; R.game.action('ndRange', 'cycle');
  check('it stops at 160 nm; the controller\'s tap goes round to 5 nm', top === 160 && e.range === 5);
  R.game.action('ndRange', -1);
  check('and it stops at 5 nm', e.range === 5);
  const modes = []; for (let i = 0; i < 3; i++) { R.game.action('ndMode'); modes.push(e.mode); }
  check('the mode selector: MAP → APP → PLN → MAP', modes.join(' ') === 'APP PLN MAP' && R.game.events.some((x) => x.text === 'ND APP'));
  R.game.togglePause(); R.game.action('ndMode');
  check('the knobs do nothing while paused', e.mode === 'MAP'); R.game.togglePause();
  R.game.start({ mode: 'game', scenarioId: 'clear', startId: 'standard', seed: 3 });
  check('a new flight resets the panel', R.game.efis.mode === 'MAP' && R.game.efis.auto);
  check('without the autoland: the heading bug on the runway heading, no HDG SEL line, no circuit', (() => { const o = R.game.ndOpts(); return o.hdgBug === 270 && !o.hdgSel && !o.circuit; })());
  R.game.action('toga');
  check('the pilot\'s TO/GA: the ND shows the circuit (missed approach active, FI27 next)', (() => { const o = R.game.ndOpts(), m = ndModel(R.game.sim.state, R.game.efis, o); return o.circuit && m.missed.active && !m.route.active && m.active.name === 'FI27'; })());

  // R9's flight: an approach, a go-around at 200 ft, the missed approach and the circuit, the ILS again, a landing
  const L = navLog, tGA = navGA.tGA;
  const before = L.filter((s) => s.t < tGA - 1 && s.phase === 'approach'), gaPh = L.filter((s) => s.phase === 'goaround'), missed = L.filter((s) => s.phase === 'missed');
  const tRes = missed.length ? missed[missed.length - 1].t : 1e9;
  const after = L.filter((s) => s.t > tRes && s.phase === 'approach');
  const all = (arr, f) => arr.length > 0 && arr.every(f);
  const bad = (arr, f) => arr.filter((s) => !f(s));
  check('on the approach: LOC and G/S (or V/S before the capture), the route active, the bug on 270, no circuit',
    all(before, (s) => s.fma.roll === 'LOC' && ['G/S', 'V/S', 'ALT HOLD'].includes(s.fma.pitch) && s.routeActive && !s.missedActive && s.mcp.hdg === 270 && !s.opts.circuit && !s.hdgLine), `${before.length} samples`);
  check('TO/GA: the FMA reads TO/GA TO/GA; the MCP speed is the go-around speed; the missed approach is the active leg',
    all(gaPh, (s) => s.fma.roll === 'TO/GA' && s.fma.pitch === 'TO/GA' && s.mcp.spd >= 145 && s.mcp.spd <= 175 && s.opts.circuit && s.missedActive && !s.routeActive && s.fix === 'FI27'), `${gaPh.length} samples, speed ${gaPh.length ? gaPh[0].mcp.spd : '-'} kt`);
  const legs = [...new Set(missed.map((s) => s.leg))];
  check('the missed approach: every leg shows its heading on the MCP and the ND, with HDG SEL and its line',
    legs.join(' ') === 'climb crosswind downwind base intercept' && all(missed, (s) => s.fma.roll === 'HDG SEL' && s.mcp.hdg === MISSED.headings[s.leg] && s.opts.hdgBug === s.mcp.hdg && s.opts.hdgSel && s.hdgLine),
    legs.map((l) => `${l} ${MISSED.headings[l]}`).join(', '));
  check('...and 180 kt, 3000 ft on the MCP; LVL CHG climbing, ALT HOLD at 3000 ft',
    all(missed, (s) => s.mcp.spd === MISSED.speedKts && s.mcp.alt === 3000 && (s.fma.pitch === 'ALT HOLD' ? Math.abs(s.alt - 3000) < 60 : s.fma.pitch === 'LVL CHG')) && missed.some((s) => s.fma.pitch === 'ALT HOLD') && missed.some((s) => s.fma.pitch === 'LVL CHG'));
  const settled = legs.map((l) => { const x = missed.filter((s) => s.leg === l); return x[x.length - 1]; });
  check('by the end of each leg the aircraft flies the heading: the bug at the top of the track-up map', settled.every((s) => Math.abs(s.bug) < 10), settled.map((s) => `${s.leg} ${s.bug.toFixed(0)}°`).join(', '));
  check('the range stays automatic: 20 nm in the circuit; the ND always shows the range the crew would pick', all(L, (s) => s.range === s.auto) && all([...gaPh, ...missed], (s) => s.range === 20));
  check('back on the localizer: LOC and the approach again, the route active, the bug on 270',
    all(after, (s) => s.fma.roll === 'LOC' && !s.opts.circuit && s.routeActive && !s.missedActive && s.mcp.hdg === 270 && !s.hdgLine), `${after.length} samples`);
  check('...with FI27 next while outside it, then the threshold', after.some((s) => s.fix === 'FI27') && after[after.length - 1].fix === 'RW27' && all(after.filter((s) => (s.x - 1500) / 1852 > 9.3), (s) => s.fix === 'FI27'));
  // the localizer antenna is 300 m past the far end (3300 m past the threshold); on the downwind 4 nm
  // abeam, its ±35° sector starts about 6 nm east of the threshold; the glideslope's ±8° is far off
  const climbOut = missed.filter((s) => 1500 - s.x > 3400 && Math.abs(s.z) < 0.3 * 1852), down = missed.filter((s) => s.leg === 'downwind' && s.x > 1500 + 7 * 1852);
  check('the ILS where it is received: none climbing out past the localizer antenna', climbOut.length && climbOut.every((s) => !s.loc), `${climbOut.length} samples`);
  check('...on the downwind (4 nm abeam, 7 nm out and more): the localizer\'s wide sector but no glideslope', down.length && down.every((s) => s.loc && !s.gs), `${down.length} samples, ${(Math.min(...down.map((s) => s.z)) / 1852).toFixed(1)}–${(Math.max(...down.map((s) => s.z)) / 1852).toFixed(1)} nm abeam`);
  check('the circuit is flown where the chart draws it: the downwind 4 nm abeam, the localizer joined 2 nm outside FI27',
    down.every((s) => Math.abs(s.z / 1852 - MISSED.downwindNm) < 0.4) && after.length && (after[0].x - 1500) / 1852 > 10 && (after[0].x - 1500) / 1852 < 12.5, `joined ${after.length ? ((after[0].x - 1500) / 1852).toFixed(1) : '-'} nm out`);
  check('...on the ILS again: both', after.filter((s) => s.agl > 300 && (s.x - 1500) / 1852 < 9).every((s) => s.loc && s.gs));
  // the recorded path and the debrief map
  const P = navGA.path, kinds = P.samples.map((s) => s.kind).filter((k, i, a) => i === 0 || k !== a[i - 1]);
  check('the recorded path: the approach, the go-around and circuit, the approach again, the ground roll', kinds.join(' ') === 'approach goaround approach ground', kinds.join(' → '));
  check('its marks: the go-around (with the reason), the touchdown, the stop', P.marks.map((m) => m.type).join(' ') === 'goaround touchdown stop' && /forced for the test/.test(P.marks[0].text));
  const d = debriefModel(P);
  check('the debrief map counts one go-around and one touchdown; its profile reaches the circuit\'s intercept', d.goArounds === 1 && d.touchdowns === 1 && d.profile.farNm >= 10, `profile to ${d.profile.farNm} nm, ${P.samples.length} samples`);
  const tdm = d.runway.marks.find((m) => m.type === 'touchdown');
  check('the runway strip puts the touchdown where the grading measured it', tdm && Math.abs(tdm.alongM - navGA.game.result.touchdown.alongRunway) < 40, tdm ? `${tdm.alongM.toFixed(0)} m vs ${navGA.game.result.touchdown.alongRunway.toFixed(0)} m` : '');
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
