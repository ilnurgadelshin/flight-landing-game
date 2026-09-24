// Physics test-suite (runs in Node, no browser needed).
//   node test/physics.test.mjs
// Uses the test pilot (autopilot.js) which drives ONLY the same input channels
// a human uses, so a passing landing here proves the mapped controls suffice.
import { Simulation } from '../js/sim.js';
import { Autopilot } from '../js/autopilot.js';
import { evaluateLanding, OUTCOME } from '../js/evaluate.js';
import { RUNWAY, KTS, FT, DEG, AIRCRAFT } from '../js/config.js';

let passed = 0, failed = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); results.push(name); }
}
const fmt = (n, d = 1) => Number(n).toFixed(d);

// ----------------------------------------------------------------------------
function flyApproach({ scenarioId = 'clear', startId = 'standard', seed = 7, apOpts = {}, maxTime = 900, log = false, onStep, onStart } = {}) {
  const sim = new Simulation({ scenarioId, startId, seed });
  const ap = new Autopilot(sim.aircraft, apOpts);
  if (onStart) onStart(sim, ap);
  const ctx = { usedReversers: false, usedSpeedbrake: false, maxBrake: 0, goArounds: 0, excursion: false, overrun: false };
  let t = 0, stoppedT = -1, minIas = 999, maxBank = 0, maxG = 0, minG = 9;
  const dt = sim.fixedDt;
  while (t < maxTime) {
    ap.update(dt);
    if (onStep) onStep(sim, ap, t);
    sim.stepOnce();
    t += dt;
    const st = sim.state;
    if (st.reverser > 0.5) ctx.usedReversers = true;
    if (st.speedbrake > 0.5 && st.onGround) ctx.usedSpeedbrake = true;
    ctx.maxBrake = Math.max(ctx.maxBrake, st.brake);
    if (st.agl > 30) { minIas = Math.min(minIas, st.ias); maxBank = Math.max(maxBank, Math.abs(st.roll) / DEG); }
    maxG = Math.max(maxG, st.gLoad); minG = Math.min(minG, st.gLoad);
    if (st.onGround && st.surface === 'grass' && !st.beyondRunwayEnd && Math.abs(st.z) > RUNWAY.width / 2 && sim.aircraft.touchdown) ctx.excursion = true;
    if (st.onGround && st.beyondRunwayEnd && sim.aircraft.touchdown && !ctx.overrun) { ctx.overrun = true; ctx.overrunSpeedKts = st.groundSpeed / KTS; }
    if (log && Math.round(t / dt) % Math.round(5 / dt) === 0) {
      console.log(`    t=${fmt(t, 0).padStart(4)} ${ap.phase.padEnd(8)} ias=${fmt(st.ias)} agl=${fmt(st.agl, 0)} vs=${fmt(st.vs / 0.00508, 0)} pitch=${fmt(st.pitch / DEG)} roll=${fmt(st.roll / DEG)} loc=${fmt(st.locDev, 2)} gs=${fmt(st.gsDev, 2)} dThr=${fmt(st.distToThreshold, 0)} lat=${fmt(st.lateralOffset)} n1=${fmt(st.n1[0], 2)} thr=${fmt(st.throttle, 2)} flap=${st.flapDeg} gear=${fmt(st.gearPos, 1)} crab=${fmt(st.crabDeg)} hw=${fmt(st.headwind, 0)} xw=${fmt(st.crosswind, 0)}`);
    }
    if (sim.aircraft.damage.destroyed) break;
    if (sim.aircraft.touchdown && st.onGround && st.groundSpeed < 0.3) { stoppedT = t; break; }
    if (t > 60 && st.alt > 4000) break; // flew away
  }
  const evalRes = evaluateLanding(sim.aircraft, ctx);
  return { sim, ap, ctx, evalRes, t, stoppedT, minIas, maxBank, maxG, minG, state: sim.state, td: sim.aircraft.touchdown, events: sim.aircraft.events };
}

function summary(r) {
  const td = r.td;
  const e = r.evalRes;
  return `outcome=${e.outcome} score=${e.score} grade=${e.grade} | td: sink=${td ? fmt(td.sink / 0.00508, 0) : '-'}fpm ias=${td ? fmt(td.ias, 0) : '-'} dist=${td ? fmt(td.distFromThreshold, 0) : '-'}m lat=${td ? fmt(td.lateralOffset) : '-'}m crab=${td ? fmt(td.crabDeg) : '-'}° bank=${td ? fmt(td.bank / DEG) : '-'}° | roll=${fmt(r.sim.aircraft.landingRollDistance, 0)}m t=${fmt(r.t, 0)}s | ${e.headline}`;
}

// ----------------------------------------------------------------------------
console.log('\n[1] Trimmed hands-off flight is stable (no pilot input, 60 s)');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'short' });
  const ias0 = sim.state.ias;
  let maxDev = 0, maxPitchRate = 0;
  sim.run(60, (st) => { maxDev = Math.max(maxDev, Math.abs(st.ias - ias0)); maxPitchRate = Math.max(maxPitchRate, Math.abs(st.q)); if (st.agl < 5) return; });
  const st = sim.state;
  check('airspeed stays within 6 kts of the trim speed', maxDev < 6, `max deviation ${fmt(maxDev)} kts`);
  check('descends on roughly a 3° path', st.vs < -2.5 && st.vs > -5.5, `vs ${fmt(st.vs / 0.00508, 0)} fpm`);
  check('wings stay level with no input', Math.abs(st.roll) < 1 * DEG, `roll ${fmt(st.roll / DEG, 2)}°`);
  check('heading holds', Math.abs(st.heading / DEG - 270) < 1.5, `hdg ${fmt(st.heading / DEG)}`);
}

console.log('\n[2] Physics is frame-rate independent (same result at 30 fps and 144 fps frame steps)');
{
  const run = (frameDt) => {
    const sim = new Simulation({ scenarioId: 'crosswind', startId: 'short', seed: 3 });
    let t = 0; while (t < 30) { sim.input.pitch = 0.1 * Math.sin(t); sim.input.roll = 0.1 * Math.cos(t * 0.7); sim.update(frameDt); t += frameDt; }
    return sim.state;
  };
  const a = run(1 / 30), b = run(1 / 144);
  const dPos = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  check('positions agree within 10 m after 30 s', dPos < 10, `Δ = ${fmt(dPos, 2)} m`);
  check('airspeed agrees within 1 kt', Math.abs(a.ias - b.ias) < 1, `Δ = ${fmt(a.ias - b.ias, 2)} kts`);
}

console.log('\n[3] Pitch input pitches the nose up; roll input banks; rudder yaws (control geometry)');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'standard' });
  const p0 = sim.state.pitch;
  sim.input.pitch = 0.5; sim.run(2);
  check('pull -> nose up', sim.state.pitch > p0 + 2 * DEG, `Δpitch ${fmt((sim.state.pitch - p0) / DEG)}°, q=${fmt(sim.state.q / DEG)}°/s`);
  check('pull -> positive g', sim.state.gLoad > 1.05, `g=${fmt(sim.state.gLoad, 2)}`);
  sim.input.pitch = 0;
  sim.input.roll = 1; sim.run(2.5);
  check('roll right input -> right bank', sim.state.roll > 8 * DEG, `roll ${fmt(sim.state.roll / DEG)}° after 2.5 s`);
  check('roll rate is airliner-like (< 25°/s)', sim.state.p / DEG < 25, `p=${fmt(sim.state.p / DEG)}°/s`);
  sim.input.roll = -1; sim.run(3); sim.input.roll = 0; sim.run(1);
  const h0 = sim.state.heading;
  sim.input.yaw = 1; sim.run(3);
  let dh = (sim.state.heading - h0) / DEG; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
  check('right rudder -> nose right (sideslip / heading change)', dh > 1.5 || sim.state.beta < -3 * DEG, `Δhdg ${fmt(dh)}°, beta ${fmt(sim.state.beta / DEG)}°`);
}

console.log('\n[4] Idle thrust + full back stick -> decelerates and stalls; nose drops');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'standard' });
  sim.input.throttle = 0; sim.input.flapIndex = 4; sim.input.gearDown = true;
  let stallT = -1, warnT = -1, maxAlpha = 0, minIas = 999, pitchAtStall = 0, pitchLater = 0;
  let t = 0;
  const pitch0 = sim.state.pitch;
  let gAtStall = 0;
  while (t < 90) {
    // classic 1-g stall demonstration: idle thrust, raise the nose slowly (~1°/s) as the speed bleeds off
    const st0 = sim.state;
    const target = pitch0 + t * 1.0 * DEG;
    sim.input.pitch = st0.stalled ? 0.9 : Math.max(-1, Math.min(1, (target - st0.pitch) * 6 - st0.q * 2));
    sim.stepOnce(); t += sim.fixedDt;
    const st = sim.state;
    maxAlpha = Math.max(maxAlpha, st.alpha / DEG);
    minIas = Math.min(minIas, st.ias);
    if (st.stallWarning && warnT < 0) warnT = t;
    if (st.stalled && stallT < 0) { stallT = t; pitchAtStall = st.pitch; gAtStall = st.gLoad; }
    if (stallT > 0 && t > stallT + 6) { pitchLater = st.pitch; break; }
  }
  check('stick shaker fires before the stall', warnT > 0 && warnT < stallT, `warning at ${fmt(warnT)} s, stall at ${fmt(stallT)} s`);
  check('the aircraft stalls', stallT > 0, `alpha max ${fmt(maxAlpha)}°, min IAS ${fmt(minIas, 0)} kts`);
  check('stall speed is realistic for flaps 30 (105–125 kts at ~1 g)', minIas > 100 && minIas < 126, `min IAS ${fmt(minIas, 0)} kts, ${fmt(gAtStall, 2)} g at the stall`);
  check('nose drops / sink rate develops after the stall', sim.state.vs < -8 || pitchLater < pitchAtStall - 3 * DEG, `vs ${fmt(sim.state.vs / 0.00508, 0)} fpm, pitch ${fmt(pitchLater / DEG)}° vs ${fmt(pitchAtStall / DEG)}°`);
}

console.log('\n[5] Crosswind pushes the aircraft off the centreline when not corrected');
{
  const sim = new Simulation({ scenarioId: 'crosswind', startId: 'standard', seed: 5 });
  // hold wings level with a simple roll hold but no track correction
  let t = 0;
  while (t < 40) { sim.input.roll = -sim.state.roll * 3 - sim.state.p * 0.5; sim.stepOnce(); t += sim.fixedDt; }
  const st = sim.state;
  check('drifted laterally by tens of metres in 40 s', Math.abs(st.lateralOffset) > 60, `offset ${fmt(st.lateralOffset, 0)} m, crosswind ${fmt(st.crosswind, 0)} kts`);
  check('crosswind is from the right (north wind on runway 27)', st.crosswind > 15, `${fmt(st.crosswind)} kts`);
  check('track differs from heading (crab needed)', Math.abs(st.track - st.heading) / DEG > 5, `track-heading ${fmt((st.track - st.heading) / DEG)}°`);
}

console.log('\n[6] Successful autoland in every scenario');
const landings = {};
for (const scenarioId of ['clear', 'tailwind', 'crosswind', 'storm']) {
  const r = flyApproach({ scenarioId, startId: 'standard', seed: 11 });
  landings[scenarioId] = r;
  console.log(`  ${scenarioId}: ${summary(r)}`);
  check(`${scenarioId}: landed successfully`, r.evalRes.outcome === OUTCOME.SUCCESS, r.evalRes.headline);
  check(`${scenarioId}: touchdown inside the touchdown zone`, r.td && r.td.distFromThreshold > 100 && r.td.distFromThreshold < 1100, r.td ? `${fmt(r.td.distFromThreshold, 0)} m` : 'no touchdown');
  check(`${scenarioId}: sink rate < 600 fpm`, r.td && r.td.sink < 3.05, r.td ? `${fmt(r.td.sink / 0.00508, 0)} fpm` : '');
  check(`${scenarioId}: stopped on the runway`, r.state.onGround && r.state.surface === 'runway' && !r.state.beyondRunwayEnd, `along=${fmt(r.state.alongRunway, 0)} m, z=${fmt(r.state.z)}`);
  check(`${scenarioId}: no damage`, r.sim.aircraft.damage.notes.length === 0, r.sim.aircraft.damage.notes.join('; '));
}
check('tailwind roll-out is longer than the clear-weather one', landings.tailwind.sim.aircraft.landingRollDistance > landings.clear.sim.aircraft.landingRollDistance,
  `${fmt(landings.tailwind.sim.aircraft.landingRollDistance, 0)} m vs ${fmt(landings.clear.sim.aircraft.landingRollDistance, 0)} m`);
check('tailwind touchdown ground speed is higher', landings.tailwind.td.groundSpeed > landings.clear.td.groundSpeed + 5 * KTS,
  `${fmt(landings.tailwind.td.groundSpeed / KTS, 0)} vs ${fmt(landings.clear.td.groundSpeed / KTS, 0)} kts`);
check('wet runway (storm) roll-out is longer than dry', landings.storm.sim.aircraft.landingRollDistance > landings.clear.sim.aircraft.landingRollDistance,
  `${fmt(landings.storm.sim.aircraft.landingRollDistance, 0)} m vs ${fmt(landings.clear.sim.aircraft.landingRollDistance, 0)} m`);

console.log('\n[7] Short final and full approach starts');
for (const startId of ['short', 'full']) {
  const r = flyApproach({ scenarioId: 'clear', startId, seed: 2, maxTime: 1500 });
  console.log(`  ${startId}: ${summary(r)}`);
  check(`${startId}: landed successfully`, r.evalRes.outcome === OUTCOME.SUCCESS, r.evalRes.headline);
}

console.log('\n[8] Failure states produce the right consequences');
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { noGear: true }, onStart: (sim) => { sim.input.gearDown = false; sim.aircraft.gearPos = 0; } });
  console.log(`  gear up: ${summary(r)}`);
  check('gear-up landing -> belly landing outcome', r.evalRes.outcome === OUTCOME.BELLY, r.evalRes.headline);
  check('gear-up: hull contact event recorded', r.events.some((e) => e.type === 'bellycontact'), '');
  check('gear-up: the aircraft slides to a stop on its belly', r.state.groundSpeed < 1 && r.sim.aircraft.landingRollDistance > 200, `slid ${fmt(r.sim.aircraft.landingRollDistance, 0)} m`);
}
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { noFlare: true } });
  console.log(`  no flare: ${summary(r)}`);
  check('no flare -> hard landing recorded (600–900 fpm), aircraft survives', r.td && r.td.sink > 3.0 && r.sim.aircraft.damage.hardLanding && r.evalRes.failures.includes('Hard landing'), `${r.evalRes.headline}; sink ${r.td ? fmt(r.td.sink / 0.00508, 0) : '-'} fpm`);
}
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { hardLanding: true } });
  console.log(`  pushed into the runway: ${summary(r)}`);
  check('very hard touchdown -> gear collapse or crash', [OUTCOME.COLLAPSE, OUTCOME.CRASH].includes(r.evalRes.outcome), `${r.evalRes.headline}; sink ${r.td ? fmt(r.td.sink / 0.00508, 0) : '-'} fpm`);
  check('crash debrief still has a touchdown record', !!r.td, '');
}
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { noBrakes: true, useReversers: false, autobrake: 0 } });
  console.log(`  no brakes: ${summary(r)}`);
  check('no braking at all -> runway overrun', r.evalRes.outcome === OUTCOME.OVERRUN, `roll ${fmt(r.sim.aircraft.landingRollDistance, 0)} m; ${r.evalRes.headline}`);
}
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { offsetM: 60 } });
  console.log(`  60 m right of centreline: ${summary(r)}`);
  check('landing beside the runway -> missed the runway', r.evalRes.outcome === OUTCOME.MISSED, r.evalRes.headline);
}
{
  const r = flyApproach({ scenarioId: 'crosswind', startId: 'short', seed: 4, apOpts: { noDecrab: true } });
  console.log(`  crosswind without decrab: ${summary(r)}`);
  check('crosswind landing without decrab -> crab recorded at touchdown', r.td && Math.abs(r.td.crabDeg) > 4, r.td ? `${fmt(r.td.crabDeg)}°` : '');
}
{
  const r = flyApproach({ scenarioId: 'clear', startId: 'short', apOpts: { targetSpeedOffset: 30, flareHeight: 9 } });
  console.log(`  30 kts fast: ${summary(r)}`);
  check('fast approach -> long landing or overrun flagged', r.td && (r.td.distFromThreshold > 700 || r.evalRes.failures.includes('Excess speed') || r.evalRes.outcome !== OUTCOME.SUCCESS), r.evalRes.headline);
}

console.log('\n[9] Go-around: TOGA + pitch up + gear up from 300 ft climbs away; reposition works');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'short' });
  const ap = new Autopilot(sim.aircraft);
  let t = 0; let ga = false; let minAgl = 9999; let agl0 = 0;
  while (t < 120) {
    if (!ga) { ap.update(sim.fixedDt); if (sim.state.agl < 300 * FT) { ga = true; agl0 = sim.state.agl; } }
    else {
      const inp = sim.input;
      inp.throttle = 1; inp.speedbrake = 0;
      inp.pitch = Math.max(-1, Math.min(1, (12 * DEG - sim.state.pitch) * 4 - sim.state.q * 2));
      inp.roll = -sim.state.roll * 3;
      if (sim.state.vs > 1 && inp.gearDown) inp.gearDown = false;
      if (sim.state.agl > 400 * FT) inp.flapIndex = 3;
    }
    sim.stepOnce(); t += sim.fixedDt;
    if (ga) minAgl = Math.min(minAgl, sim.state.agl);
    if (ga && sim.state.agl > 1500 * FT) break;
  }
  check('go-around climbs to 1500 ft without touching down', sim.state.agl > 1500 * FT && !sim.aircraft.touchdown, `agl ${fmt(sim.state.agl / FT, 0)} ft after ${fmt(t, 0)} s, lowest ${fmt(minAgl / FT, 0)} ft (from ${fmt(agl0 / FT, 0)} ft)`);
  check('gear retracted', sim.state.gearPos < 0.05, `gearPos ${fmt(sim.state.gearPos, 2)}`);
  sim.reposition('standard');
  check('reposition puts the aircraft back on final', Math.abs(sim.state.distToThreshold - 10 * 1852) < 50 && Math.abs(sim.state.alt - 3000 * FT) < 5, `dist ${fmt(sim.state.distToThreshold / 1852, 1)} nm alt ${fmt(sim.state.alt / FT, 0)} ft`);
}

console.log('\n[10] Runway excursion at speed collapses the gear (soft ground)');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'short' });
  const ap = new Autopilot(sim.aircraft, { noBrakes: true, useReversers: false, autobrake: 0 });
  let t = 0;
  while (t < 200) {
    ap.update(sim.fixedDt);
    if (ap.phase === 'rollout' && sim.state.groundSpeed > 40) sim.input.yaw = 1; // steer off the side
    sim.stepOnce(); t += sim.fixedDt;
    if (sim.aircraft.damage.gearCollapsed || sim.aircraft.damage.destroyed) break;
    if (sim.aircraft.touchdown && sim.state.groundSpeed < 0.5) break;
  }
  check('steering off the runway at speed -> gear collapse / crash', sim.aircraft.damage.gearCollapsed || sim.aircraft.damage.destroyed, sim.aircraft.damage.notes.join('; ') || `surface ${sim.state.surface}, z=${fmt(sim.state.z, 0)}`);
}

console.log('\n[11] Ground handling: hands off in a crosswind the aircraft weathervanes into the wind; the rudder holds it straight');
{
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rollout = (yawFn) => {
    const sim = new Simulation({ scenarioId: 'crosswind', startId: 'short', seed: 3 });
    const ac = sim.aircraft;
    ac.place({ x: RUNWAY.thresholdX - 400, y: 3.35, z: 0, headingDeg: 270, iasKts: 130, flapIndex: 4, gearDown: true, throttle: 0, onGround: true });
    ac.body.velocity.set(-130 * KTS, 0, 0);
    ac.input.speedbrake = 1; ac.speedbrakePos = 1;
    let maxDev = 0;
    for (let i = 0; i < 120 * 5; i++) { ac.input.yaw = yawFn(sim.state); sim.stepOnce(); if (i > 120) maxDev = Math.max(maxDev, Math.abs(sim.state.heading / DEG - 270)); }
    return { hdg: sim.state.heading / DEG, xw: sim.state.crosswind, maxDev };
  };
  const free = rollout(() => 0);
  check('hands off, the nose turns into a crosswind from the right (weathervane)', free.hdg > 271 && free.xw > 5, `heading ${fmt(free.hdg)}°, crosswind ${fmt(free.xw, 0)} kt`);
  // a pilot holding the heading with the pedals (proportional rudder, as a person would)
  const held = rollout((st) => clamp(-(st.heading / DEG - 270) * 0.15 - (st.r / DEG) * 0.1, -1, 1));
  check('pedal inputs keep the roll-out within 2° of the runway heading', held.maxDev < 2, `max heading deviation ${fmt(held.maxDev, 2)}°`);
}

console.log('\n[12] Flight School flight director: computes guidance on its own controls and never flies the aircraft');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'standard', seed: 11 });
  const ac = sim.aircraft;
  // stands in for the player and writes the real controls; it flies 8 kts faster than the flight
  // director's law so any control the flight director overwrote would show up as a changed value
  const player = new Autopilot(ac, { targetSpeedOffset: 8 });
  const fd = new Autopilot(ac, {});                     // the flight director, as training mode sets it up
  const shadow = Object.assign({}, ac.input);
  fd.inputTarget = shadow;
  const KEYS = ['pitch', 'roll', 'yaw', 'throttle', 'trim', 'flapIndex', 'gearDown', 'speedbrake', 'speedbrakeArmed', 'brake', 'autobrake', 'reverse'];
  let touched = 0, firstTouch = '', steps = 0, fdPitchMin = 0, fdPitchMax = 0, t = 0;
  while (t < 600) {
    player.update(sim.fixedDt);
    Object.assign(shadow, { flapIndex: ac.input.flapIndex, gearDown: ac.input.gearDown, throttle: ac.input.throttle });
    const before = KEYS.map((k) => ac.input[k]);
    fd.update(sim.fixedDt);
    KEYS.forEach((k, i) => { if (ac.input[k] !== before[i]) { touched++; if (!firstTouch) firstTouch = `${k} at ${fmt(t, 1)} s in the ${fd.phase} phase`; } });
    if (fd.phase === 'approach') { fdPitchMin = Math.min(fdPitchMin, shadow.pitch); fdPitchMax = Math.max(fdPitchMax, shadow.pitch); }
    sim.stepOnce(); t += sim.fixedDt; steps++;
    if (sim.aircraft.touchdown && sim.state.groundSpeed < 0.5) break;
  }
  check('the flight director never changes the aircraft controls (approach, flare, roll-out)', touched === 0, touched ? `${touched} writes, first: ${firstTouch}` : `${steps} steps checked`);
  check('the flight director computes live pitch guidance on the approach', fdPitchMax - fdPitchMin > 0.05, `shadow pitch ${fmt(fdPitchMin, 2)} .. ${fmt(fdPitchMax, 2)}`);
  check('the aircraft, flown only by the player, lands and stops', !!sim.aircraft.touchdown && sim.state.groundSpeed < 0.5, `ground speed ${fmt(sim.state.groundSpeed, 1)} m/s`);
}

console.log('\n[13] Turbulence: the Dryden model of MIL-F-8785C at low altitude');
{
  const { Atmosphere } = await import('../js/physics/atmosphere.js');
  const { SCENARIOS } = await import('../js/config.js');
  const dt = 1 / 120, V = 75, hdg = 270 * DEG;
  // a long flight at a fixed height and airspeed, heading 270: u along −X, v along −Z, w up
  const sample = (scenario, aglFt, seconds = 1500, seed = 3, speed = V) => {
    const a = new Atmosphere(scenario, seed), u = [], v = [], w = [];
    for (let i = 0; i < seconds / dt; i++) {
      a.step(dt, { agl: aglFt * FT, tas: speed, heading: hdg });
      if (i % 4 === 0) { u.push(-a.turb[0]); v.push(-a.turb[2]); w.push(a.turb[1]); }
    }
    return { a, u, v, w, dt: dt * 4 };
  };
  const sd = (x) => { const m = x.reduce((p, q) => p + q, 0) / x.length; return Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / x.length); };
  const corrTime = (x, step) => { const m = x.reduce((p, q) => p + q, 0) / x.length, var0 = x.reduce((p, q) => p + (q - m) ** 2, 0) / x.length;
    for (let lag = 1; lag < 2000; lag++) { let c = 0; for (let i = 0; i + lag < x.length; i++) c += (x[i] - m) * (x[i + lag] - m); if (c / (x.length - lag) / var0 < 1 / Math.E) return lag * step; } return Infinity; };
  const storm = SCENARIOS.storm;
  for (const h of [50, 500]) {
    const r = sample(storm, h), S = r.a.drydenScales(h * FT);
    check(`${h} ft: along-track and lateral intensities as specified (σu = σv = σw / (0.177 + 0.000823 h)^0.4)`, Math.abs(sd(r.u) / S.su - 1) < 0.15 && Math.abs(sd(r.v) / S.sv - 1) < 0.25, `σu ${fmt(sd(r.u) / KTS)} kt (spec ${fmt(S.su / KTS)}), σv ${fmt(sd(r.v) / KTS)} kt`);
    const tu = corrTime(r.u, r.dt);
    check(`${h} ft: along-track gusts last L_u / V (${fmt(S.Lu / V)} s)`, Math.abs(tu / (S.Lu / V) - 1) < 0.3, `${fmt(tu)} s`);
    if (h === 500) check('500 ft: vertical intensity σw = 0.1 W20 (the span barely averages gusts this large)', Math.abs(sd(r.w) / S.sw - 1) < 0.25, `σw ${fmt(sd(r.w) / KTS)} kt (spec ${fmt(S.sw / KTS)})`);
    if (h === 50) {
      const r500 = sample(storm, 500);
      check('near the ground the vertical gusts are quicker and the wingspan averages them out', sd(r.w) < 0.8 * sd(r500.w) && corrTime(r.w, r.dt) < corrTime(r500.w, r500.dt), `σw ${fmt(sd(r.w) / KTS)} kt at 50 ft, ${fmt(sd(r500.w) / KTS)} kt at 500 ft`);
      check('and the along-track gusts stronger and shorter than at 500 ft', sd(r.u) > sd(r500.u) && tu < corrTime(r500.u, r500.dt), `σu ${fmt(sd(r.u) / KTS)} vs ${fmt(sd(r500.u) / KTS)} kt`);
    }
  }
  // the storm is reported 22 kt gusting 36: the peak 3-second gust in each 10 minutes at a fixed
  // anemometer 20 ft up, which the air passes at the wind speed
  const w20 = new Atmosphere(storm).meanWind(20 * FT, [0, 0, 0]);
  const g = sample(storm, 20, 3000, 3, Math.hypot(w20[0], w20[2])), win = Math.round(3 / g.dt), per = Math.round(600 / g.dt), peaks = [];
  for (let s0 = 0; s0 + per <= g.u.length; s0 += per) { let best = -Infinity; for (let i = s0; i + win <= s0 + per; i += 2) { let m = 0; for (let j = i; j < i + win; j++) m += g.u[j]; best = Math.max(best, m / win); } peaks.push(best / KTS); }
  const peak = peaks.reduce((p, q) => p + q, 0) / peaks.length;
  check('the storm\'s turbulence makes its reported gusts: 3-second peaks about 14 kt above the mean', Math.abs(peak - storm.gustKts) < 5, `${fmt(peak)} kt above the mean (reported ${storm.gustKts})`);
  const calm = sample(SCENARIOS.clear, 200, 60);
  check('clear weather: smooth air', sd(calm.u) === 0 && sd(calm.w) === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failed: ' + results.join(' | ')); process.exit(1); }
