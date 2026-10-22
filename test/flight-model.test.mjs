// Flight-model validation (runs in Node): the aerodynamic tables, the engines' thrust and the
// asymmetric thrust of one engine against what is published about the 737-800 and what its
// certification (EASA CS-25, as FAR 25) requires of it.
//   node test/flight-model.test.mjs
import { Simulation } from '../js/sim.js';
import { Atmosphere } from '../js/physics/atmosphere.js';
import { aeroCoefficients, alphaForLift, flapValue } from '../js/physics/aero.js';
import { engineThrust, n1ForThrust, thrustLapse } from '../js/physics/engines.js';
import { AERO_TABLES } from '../js/physics/aero-tables.js';
import { AIRCRAFT as AC, SCENARIOS, KTS, DEG, G, RHO0 } from '../js/config.js';

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); failures.push(name); }
}
const fmt = (n, d = 1) => Number(n).toFixed(d);
const W = AC.mass * G, E = AC.engines;
const atm = new Atmosphere(SCENARIOS.clear);
const stallKts = (CLmax) => Math.sqrt(2 * W / (RHO0 * AC.wingArea * CLmax)) / KTS;   // 1 g, sea level

console.log('\n[F1] Maximum lift: VREF = 1.23 × the 1-g stall speed (CS 25.125), the stall warning 5 kt / 5 % before it (CS 25.207)');
{
  const refs = { 0: AC.stallClean * 1.23, 15: AC.vref15, 30: AC.vref30, 40: AC.vref40 };
  const rows = [];
  for (const [deg, vref] of Object.entries(refs)) rows.push(`F${deg} ${fmt(1.23 * stallKts(flapValue('CLmax', +deg)))} vs ${fmt(vref, 0)}`);
  check('1.23 × the tables\' stall speed is each reference speed, within 1 kt',
    Object.entries(refs).every(([deg, vref]) => Math.abs(1.23 * stallKts(flapValue('CLmax', +deg)) - vref) < 1), rows.join(', '));
  const margins = AERO_TABLES.flapDeg.map((deg) => {
    const CLmax = flapValue('CLmax', deg), c = aeroCoefficients(flapValue('warnAlphaDeg', deg) * DEG, deg, {});
    return { deg, vs: stallKts(CLmax), vw: stallKts(c.CL) };
  });
  check('the stick shaker comes at least 5 kt and 5 % above the stall, and within 10 %',
    margins.every((m) => m.vw - m.vs >= 5 && m.vw / m.vs >= 1.05 && m.vw / m.vs <= 1.10),
    margins.map((m) => `F${m.deg} +${fmt(m.vw - m.vs)} kt`).join(', '));
}

console.log('\n[F2] Lift, drag and pitching moment have a stall\'s shape at every flap setting');
{
  const shape = AERO_TABLES.flapDeg.map((deg) => {
    const stall = flapValue('stallAlphaDeg', deg) * DEG, c = {};
    let rising = true, prev = -Infinity;
    for (let a = -8 * DEG; a <= stall; a += 0.25 * DEG) { const CL = aeroCoefficients(a, deg, c).CL; if (CL <= prev) rising = false; prev = CL; }
    const at = (a) => ({ ...aeroCoefficients(a, deg, c) });
    const s = at(stall), past = at(stall + 3 * DEG), deep = at(stall + 10 * DEG), below = at(stall - 2 * DEG);
    const slopeBelow = (s.Cm - at(stall - 4 * DEG).Cm) / (4 * DEG), slopePast = (deep.Cm - s.Cm) / (10 * DEG);
    return { deg, rising, falls: past.CL < s.CL - 0.05, dragRise: deep.CD > 2 * below.CD, noseDown: slopePast < slopeBelow * 1.3 };
  });
  check('lift rises steadily up to the stall', shape.every((s) => s.rising));
  check('past the stall the lift falls', shape.every((s) => s.falls));
  check('the separated flow\'s drag rises past the stall (more than doubles 10° beyond it)', shape.every((s) => s.dragRise));
  check('the pitching moment breaks nose-down past the stall', shape.every((s) => s.noseDown));
}

console.log('\n[F3] Approach attitude on a 3° glidepath at VREF + 5');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'short' });
  const attitude = (flapIndex, vref) => {
    const tas = (vref + 5) * KTS, t = sim.aircraft.trimFor({ alt: 150, tas, gamma: -3 * DEG, flapDeg: AC.flapDetents[flapIndex], gearDown: true });
    return { pitch: t.alpha / DEG - 3, n1: t.n1 };
  };
  const f30 = attitude(4, AC.vref30), f40 = attitude(5, AC.vref40);
  check('flaps 30: a nose-up attitude of 0.5–3.5°', f30.pitch > 0.5 && f30.pitch < 3.5, `${fmt(f30.pitch, 2)}°, N1 ${fmt(f30.n1 * 100)}%`);
  check('flaps 40: a lower attitude than flaps 30 (Boeing: more tail clearance)', f40.pitch < f30.pitch - 0.5, `${fmt(f40.pitch, 2)}° vs ${fmt(f30.pitch, 2)}°`);
}

console.log('\n[F4] Thrust lapse (Bartel & Young 2008) and the N1 for a thrust');
{
  const sl = [0, 0.1, 0.2, 0.3, 0.4].map((m) => thrustLapse(m, 1, E.bypassRatio));
  check('static sea level is the rated thrust', Math.abs(sl[0] - 1) < 1e-9);
  check('the rated thrust falls with Mach number', sl.every((v, i) => i === 0 || v < sl[i - 1]), sl.map((v) => fmt(v, 3)).join(' → '));
  const approach = thrustLapse(145 * KTS / atm.speedOfSound(0), 1, E.bypassRatio);
  check('about 80 % of the static thrust at approach speed (145 kt)', approach > 0.75 && approach < 0.85, fmt(approach, 3));
  const high = thrustLapse(0.3, atm.pressureRatio(2134), E.bypassRatio), low = thrustLapse(0.3, 1, E.bypassRatio);
  check('less at 7000 ft than at sea level at the same Mach number', high < low, `${fmt(high, 3)} vs ${fmt(low, 3)}`);
  const n1 = n1ForThrust(engineThrust(0.73, 0.22, 0.95, E), 0.22, 0.95, E);
  check('the N1 for a thrust inverts the thrust at an N1', Math.abs(n1 - 0.73) < 1e-9, fmt(n1, 6));
}

// steady climb gradient (%) with the levers at TO/GA: the tables and engines alone, balancing lift
// and drag along the flight path; a failed engine adds its windmilling fan's drag
function climbGradient({ flapDeg, gearDown, kts, live = 2, alt = 0 }) {
  const tas = kts * KTS / Math.sqrt(atm.density(alt) / RHO0), qS = 0.5 * atm.density(alt) * tas * tas * AC.wingArea;
  const T = live * engineThrust(1, tas / atm.speedOfSound(alt), atm.pressureRatio(alt), E);
  const windmill = (E.count - live) * qS / AC.wingArea * E.windmillDragArea, c = {};
  let gamma = 0, alpha = 0;
  for (let k = 0; k < 30; k++) {
    alpha = alphaForLift((W * Math.cos(gamma) - T * Math.sin(alpha)) / qS, flapDeg);
    aeroCoefficients(alpha, flapDeg, c);
    const D = qS * (c.CD + AC.aero.dCD_gear * (gearDown ? 1 : 0) + AC.aero.K * c.CL * c.CL) + windmill;
    gamma = Math.asin(Math.max(-1, Math.min(1, (T * Math.cos(alpha) - D) / W)));
  }
  return Math.tan(gamma) * 100;
}

console.log('\n[F5] Climb gradients with the go-around thrust');
{
  const l30 = climbGradient({ flapDeg: 30, gearDown: true, kts: AC.vref30 }), l40 = climbGradient({ flapDeg: 40, gearDown: true, kts: AC.vref40 });
  check('landing climb, all engines, landing flaps, gear down, at VREF: at least 3.2 % (CS 25.119)', l30 >= 3.2 && l40 >= 3.2, `flaps 30 ${fmt(l30, 2)} %, flaps 40 ${fmt(l40, 2)} %`);
  const a15 = climbGradient({ flapDeg: 15, gearDown: false, kts: AC.vref15, live: 1 });
  check('approach climb, one engine out, flaps 15, gear up: at least 2.1 % (CS 25.121(d))', a15 >= 2.1, `${fmt(a15, 2)} %`);
  const ga = climbGradient({ flapDeg: 15, gearDown: false, kts: AC.vref30 + 15 }), fpm = ga / 100 * (AC.vref30 + 15) * KTS / 0.00508;
  check('a go-around (flaps 15, gear up, VREF + 15) climbs at 2000–4500 fpm', fpm > 2000 && fpm < 4500, `${fmt(ga, 2)} %, ${fmt(fpm, 0)} fpm`);
}

// one engine failed (index), the other at TO/GA, on a level start at a speed with a configuration;
// fly(st, ac) sets the controls each step (none: the controls are left alone)
function engineOut({ failed = 1, flapIndex = 4, gearDown = true, kts = AC.vref30, seconds = 30, fly = null }) {
  const sim = new Simulation({ scenarioId: 'clear', startId: 'short' }), ac = sim.aircraft;
  ac.place({ x: 20000, y: 600, z: 0, headingDeg: 270, iasKts: kts, flapIndex, gearDown, gammaDeg: 0 });
  if (failed !== null) ac.setEngineFailed(failed);
  ac.input.throttle = 1;
  const trace = [];
  sim.run(seconds, (st, a, t) => { if (fly) fly(st, a, t); trace.push({ t, hdg: st.heading / DEG, roll: st.roll / DEG, rudder: st.rudder / DEG, ias: st.ias, beta: st.beta / DEG }); });
  return trace;
}

console.log('\n[F6] One engine: its thrust yaws the aircraft, and the rudder holds it at VREF (VMCL ≤ VREF, CS 25.125 / 25.149)');
{
  const hdgChange = (trace) => trace.at(-1).hdg - 270;
  const right = engineOut({ failed: 1, seconds: 5 }), left = engineOut({ failed: 0, seconds: 5 }), both = engineOut({ failed: null, seconds: 5 });
  check('the right engine failed: the nose yaws right, towards the dead engine', hdgChange(right) > 1, `${fmt(hdgChange(right))}° in 5 s`);
  check('the left engine failed: the nose yaws left', hdgChange(left) < -1, `${fmt(hdgChange(left))}° in 5 s`);
  check('both engines at TO/GA: no yaw', Math.abs(hdgChange(both)) < 0.3, `${fmt(hdgChange(both), 2)}°`);
  // the pilot's technique: rudder on the live engine's side holds the heading, up to 5° of bank towards it
  // (CS 25.149), the pitch holds the speed
  let iYaw = 0, pitchRef = null;
  const fly = (st, ac) => {
    const dt = 1 / 120, hdgErr = ((st.heading / DEG - 270 + 540) % 360) - 180;
    iYaw = Math.max(-1, Math.min(1, iYaw - hdgErr * 0.02 * dt));
    ac.input.yaw = Math.max(-1, Math.min(1, iYaw - hdgErr * 0.08 - st.r * 2));
    const bank = 5 * DEG;   // towards the live (left) engine: left wing down
    ac.input.roll = Math.max(-1, Math.min(1, (-bank - st.roll) * 3 - st.p * 1.5));
    pitchRef ??= st.pitch;
    const pitchWant = pitchRef + Math.max(-8, Math.min(12, (st.ias - AC.vref30) * 0.6)) * DEG;
    ac.input.pitch = Math.max(-1, Math.min(1, (pitchWant - st.pitch) * 5 - st.q * 2));
  };
  const held = engineOut({ failed: 1, seconds: 40, fly }), late = held.filter((s) => s.t > 25);
  const maxHdg = Math.max(...late.map((s) => Math.abs(s.hdg - 270))), maxRudder = Math.max(...late.map((s) => Math.abs(s.rudder)));
  const ias = late.reduce((a, s) => a + s.ias, 0) / late.length;
  check('flaps 30, gear down, near VREF: the heading held within 3° with at most 5° of bank', maxHdg < 3 && late.every((s) => Math.abs(s.roll) < 5.5),
    `heading within ${fmt(maxHdg, 2)}°, ${fmt(ias)} kt`);
  check('...with rudder to spare (the rudder below its 25° limit)', maxRudder < AC.controls.maxRudderDeg - 1, `${fmt(maxRudder)}°`);
}

console.log('\n[F7] The starts are trimmed: hands-off on a 3° glidepath at VREF + 5 for 20 s');
{
  const rows = [];
  let ok = true;
  for (const [flapIndex, vref] of [[3, AC.vref15], [4, AC.vref30], [5, AC.vref40]]) {
    const sim = new Simulation({ scenarioId: 'clear', startId: 'short' });
    sim.aircraft.place({ x: 9000, y: 500, z: 0, headingDeg: 270, iasKts: vref + 5, flapIndex, gearDown: true, gammaDeg: -3 });
    sim.run(20);
    const st = sim.state, dv = st.ias - vref - 5, fpa = Math.atan2(st.vs, st.groundSpeed) / DEG;
    ok &&= Math.abs(dv) < 1 && Math.abs(fpa + 3) < 0.15;
    rows.push(`F${AC.flapDetents[flapIndex]} ${dv >= 0 ? '+' : ''}${fmt(dv)} kt, ${fmt(fpa, 2)}°`);
  }
  check('the airspeed holds within 1 kt and the flight path within 0.15° of 3°', ok, rows.join('; '));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
