// The take-off: its speeds and trim, what the crew hears on the roll, what is recorded and how it
// is graded. Pure rules (no DOM, no sound): js/game.js feeds it the aircraft state each step and
// passes on what it returns.
//
// The speeds come from this flight model, not from Boeing's tables: V2 is 1.2 times the 1-g stall
// speed with the take-off flaps at the take-off weight (the tables' maximum lift), VR 10 kt below it and V1 3 kt below VR
// on a dry runway, 8 kt on a wet one. At 62 t and flaps 5 that is 140 / 143 / 153 kt, a few knots
// above a real 737-800's. With a rotation of 2.5° a second from VR the aircraft lifts off near
// V2 + 8 at about 10° of pitch and passes 35 ft near V2 + 15.
import { AIRCRAFT as AC, RUNWAY, KTS, FT, DEG, G, RHO0 } from './config.js';
import { flapValue } from './physics/aero.js';

export const TAKEOFF = {
  flaps: [1, 2, 3],          // flap lever positions allowed for take-off: 1, 5, 15
  trimBand: 1.5,             // ° either side of the take-off trim: the green band
  rollThrottle: 0.55,        // thrust levers past this on the runway: the take-off roll has begun
  rejectThrottle: 0.1,       // closed during the roll: a rejected take-off
  rotatePull: 0.15,          // the column pulled this far (of full travel) above 60 kt: the rotation has begun
  rateDegS: [2, 3],          // the rotation rate to fly
  tailPitchDeg: 11,          // the tail touches at about this pitch with the wheels on the runway
  climb: [10, 25],           // kt above V2 to hold in the climb
  gearUpS: 8,                // s after the positive rate of climb to have the gear selected up
  endFt: 3000,               // the take-off ends this far above the runway
  thrustReductionFt: 1500,   // climb thrust from here
  climbLever: 0.9,           // the thrust levers at or below this: climb thrust (about 93 % N1)
  cleanFromFt: 400,          // no flap retraction below this
  retractMargin: 1.3,        // a flap setting is selected only above this times its stall speed
  maxKt: 250,                // the speed limit below 10,000 ft
  // take-off thrust ratings: the full rating and two fixed reductions (the thrust lever position each sets)
  ratings: [{ id: 'TO', lever: 1 }, { id: 'TO-1', lever: 0.9 }, { id: 'TO-2', lever: 0.8 }],
  // take-off weights offered (kg): a light aircraft, a typical one, and near the maximum (79,016 kg)
  weights: [62000, 70000, 78000],
  // an engine failure on the roll, for practice: 'early' is 20 kt before V1 (the answer is to stop),
  // 'v1' just after it (the answer is to go). With one engine the flight ends at 1,500 ft.
  failures: ['none', 'early', 'v1', 'surprise'], failEarlyKt: 20, engineOutEndFt: 1500, engineOutClimb: [0, 20],
  speedFromFt: 35, speedToFt: 1000,   // the climb speed is judged between these heights
};

/** The 1-g stall speed (kt) with a flap lever position, at a weight (kg). */
export function stallSpeed(flapIndex, mass = AC.mass) {
  return Math.sqrt(2 * mass * G / (RHO0 * AC.wingArea * flapValue('CLmax', AC.flapDetents[flapIndex]))) / KTS;
}

/** V1, VR and V2 (kt) for a flap lever position; with other flaps, those for flaps 5. */
export function takeoffSpeeds(flapIndex, wet = false, mass = AC.mass) {
  const f = TAKEOFF.flaps.includes(flapIndex) ? flapIndex : 2;
  const v2 = Math.round(1.2 * stallSpeed(f, mass)), vr = v2 - 10;
  return { v1: vr - (wet ? 8 : 3), vr, v2, flapIndex: f };
}

const trims = new Map();
/** The stabiliser trim (° nose up) that holds the climb at V2 + 15 with take-off thrust: the green band's middle. */
export function takeoffTrim(aircraft, flapIndex) {
  const f = TAKEOFF.flaps.includes(flapIndex) ? flapIndex : 2;
  const key = `${f}/${aircraft.mass}`;
  if (!trims.has(key)) {
    const t = aircraft.trimFor({ alt: 300, tas: (takeoffSpeeds(f, false, aircraft.mass).v2 + 15) * KTS, gamma: 8 * DEG, flapDeg: AC.flapDetents[f], gearDown: false, n1: 1 });
    trims.set(key, Math.round(t.trimDeg * 2) / 2);
  }
  return trims.get(key);
}

/** What is wrong with the configuration for take-off: [] when it is set. */
export function configProblems(st, inp, trim) {
  const p = [];
  if (!TAKEOFF.flaps.includes(inp.flapIndex)) p.push('FLAPS');
  else if (Math.abs(st.flapDeg - AC.flapDetents[inp.flapIndex]) > 0.5) p.push('FLAPS MOVING');
  if (Math.abs(inp.trim - trim) > TAKEOFF.trimBand) p.push('TRIM');
  if (inp.speedbrake > 0.05 || inp.speedbrakeArmed) p.push('SPEEDBRAKE');
  if (inp.parkingBrake) p.push('PARKING BRAKE');
  return p;
}

export class TakeoffMonitor {
  /** @param opts { wet, failure: null | { at: 'early' | 'v1', engine: 0 | 1 } } */
  constructor(aircraft, { wet = false, failure = null } = {}) {
    this.ac = aircraft; this.wet = wet; this.failure = failure;
    this.phase = 'before';        // before → roll → rotate → climb → done; or roll → rejected → done
    this.rec = null; this.brief = '';
    this.rating = 0;              // index into TAKEOFF.ratings: the take-off thrust selected
  }

  /** The thrust lever position of the selected take-off thrust. */
  get lever() { return TAKEOFF.ratings[this.rating].lever; }

  get speeds() { return this.rec ? this.rec.speeds : takeoffSpeeds(this.ac.input.flapIndex, this.wet, this.ac.mass); }
  get trim() { return takeoffTrim(this.ac, this.speeds.flapIndex); }
  /** The take-off was begun: there is something to grade. */
  get started() { return this.phase !== 'before'; }
  get done() { return this.phase === 'done'; }

  /**
   * One physics step. Returns what happened in it: { type: 'brief', problems, speeds, trim } on the
   * runway before the roll (whenever it changes), 'config' (a take-off begun with the configuration
   * wrong), 'call' with call 'eighty' | 'v1' | 'rotate' | 'positive', 'rejected', 'done'.
   */
  update(dt, st, inp) {
    const out = [], T = TAKEOFF;
    if (this.phase === 'done') return out;
    const onRunway = st.onGround && st.surface === 'runway';
    if (this.phase === 'before') {
      if (!onRunway || this.ac.touchdown) { this.brief = ''; return out; }
      const speeds = takeoffSpeeds(inp.flapIndex, this.wet, this.ac.mass), trim = takeoffTrim(this.ac, speeds.flapIndex);
      const problems = configProblems(st, inp, trim).filter((p) => p !== 'PARKING BRAKE' && p !== 'FLAPS MOVING');
      const key = problems.join() + speeds.vr;
      if (key !== this.brief) { this.brief = key; out.push({ type: 'brief', problems, speeds, trim }); }
      if (inp.throttle > T.rollThrottle && !inp.reverse) {
        const bad = configProblems(st, inp, trim);
        this.rec = { speeds, trim, config: bad, startX: st.x, startHeading: st.heading, t: 0, maxDev: 0, called: {},
          rotate: null, liftoff: null, rate: null, positiveT: null, gearUpT: null, speed: { n: 0, sum: 0, min: Infinity }, climbDev: 0, maxBank: 0,
          stall: false, settled: false, rejected: null, endIas: null, failure: null,
          rating: TAKEOFF.ratings[this.rating].id, mass: this.ac.mass, rto: inp.autobrake === 5, flapIndex: inp.flapIndex,
          clean: { lowFt: null, slow: null, upFt: null, reducedFt: null, maxIas: 0, told: {} } };
        this.phase = 'roll';
        if (bad.length) out.push({ type: 'config', problems: bad });
      }
      return out;
    }
    const r = this.rec, V = r.speeds;
    r.t += dt;
    const call = (name) => { if (!r.called[name]) { r.called[name] = r.t; out.push({ type: 'call', call: name }); } };
    if (st.stallWarning && !st.onGround) r.stall = true;

    if (this.phase === 'roll' || this.phase === 'rotate') {
      if (st.onGround) r.maxDev = Math.max(r.maxDev, Math.abs(st.lateralOffset));
      // the practice engine failure: once, at its speed
      const F = this.failure;
      if (F && !r.failure && st.onGround && st.ias >= (F.at === 'v1' ? V.v1 + 1 : Math.max(92, V.v1 - T.failEarlyKt))) {
        this.ac.setEngineFailed(F.engine);
        r.failure = { engine: F.engine, ias: st.ias, beforeV1: st.ias < V.v1 }; out.push({ type: 'engineFailure', engine: F.engine, ias: st.ias });
      }
      if (st.ias >= 80) call('eighty');
      if (st.ias >= V.v1) call('v1');
      if (st.ias >= V.vr) call('rotate');
      // thrust closed on the runway: the take-off is rejected, and ends when the aircraft stops
      if (st.onGround && inp.throttle < T.rejectThrottle && st.ias > 30) {
        r.rejected = { ias: st.ias, afterV1: st.ias >= V.v1 }; this.phase = 'rejected';
        out.push({ type: 'rejected', ias: st.ias });
        return out;
      }
      // brought to a stop with the thrust still set (off the runway, on collapsed gear): it ends there
      if (st.onGround && r.t > 8 && st.groundSpeed < 0.6) { this.phase = 'done'; out.push({ type: 'done' }); return out; }
      if (this.phase === 'roll' && st.onGround && st.ias > 60 && (inp.pitch > T.rotatePull || st.pitch > 3 * DEG)) { r.rotate = { ias: st.ias, t: r.t, pitch: st.pitch }; this.phase = 'rotate'; }
      if (!st.onGround && st.agl > 0.5) {
        if (!r.rotate) r.rotate = { ias: st.ias, t: r.t, pitch: st.pitch };
        r.liftoff = { ias: st.ias, pitch: st.pitch, x: st.x, t: r.t, dist: Math.abs(st.x - r.startX) };
        const span = r.t - r.rotate.t;
        // from the pull to the lift-off: the average the crew is taught (about 3 to 4 s to lift off)
        r.rate = span > 0.3 ? (st.pitch - r.rotate.pitch) / DEG / span : null;
        this.phase = 'climb';
      }
      return out;
    }
    if (this.phase === 'rejected') {
      if (st.onGround) r.maxDev = Math.max(r.maxDev, Math.abs(st.lateralOffset));
      if (st.groundSpeed < 0.6) { r.rejected.stoppedOnRunway = st.surface === 'runway'; this.phase = 'done'; out.push({ type: 'done' }); }
      return out;
    }
    // the climb
    const aglFt = st.agl / FT;
    if (st.onGround && r.t - r.liftoff.t > 1) r.settled = true;
    if (!r.positiveT && st.vs > 1.5 && aglFt > 20) { r.positiveT = r.t; call('positive'); }
    if (r.positiveT && r.gearUpT === null && !inp.gearDown) r.gearUpT = r.t - r.positiveT;
    if (aglFt >= T.speedFromFt && aglFt <= T.speedToFt) { r.speed.n++; r.speed.sum += st.ias; r.speed.min = Math.min(r.speed.min, st.ias); }
    r.climbDev = Math.max(r.climbDev, Math.abs(st.lateralOffset));
    r.maxBank = Math.max(r.maxBank, Math.abs(st.roll));
    // on one engine the take-off ends once it is safely climbing: no clean-up to grade
    if (r.failure) { if (aglFt >= T.engineOutEndFt) { r.endIas = st.ias; this.phase = 'done'; out.push({ type: 'done' }); } return out; }
    // after take-off: accelerate and clean up from 1,000 ft, climb thrust from 1,500 ft
    const cl = r.clean;
    if (inp.flapIndex < r.flapIndex) {
      if (aglFt < T.cleanFromFt && cl.lowFt === null) cl.lowFt = aglFt;
      const need = T.retractMargin * stallSpeed(inp.flapIndex, r.mass);
      if (st.ias < need && !cl.slow) cl.slow = { ias: st.ias, need, to: inp.flapIndex };
      r.flapIndex = inp.flapIndex;
      if (inp.flapIndex === 0) cl.upFt = aglFt;
    } else if (inp.flapIndex > r.flapIndex) r.flapIndex = inp.flapIndex;
    if (aglFt >= T.thrustReductionFt && cl.reducedFt === null && inp.throttle <= T.climbLever + 0.005) cl.reducedFt = aglFt;
    cl.maxIas = Math.max(cl.maxIas, st.ias);
    for (const [name, at] of [['accelerate', 1000], ['climbThrust', T.thrustReductionFt]]) if (aglFt >= at && !cl.told[name]) { cl.told[name] = true; out.push({ type: 'cleanup', step: name }); }
    if (aglFt >= T.endFt) { r.endIas = st.ias; this.phase = 'done'; out.push({ type: 'done' }); }
    return out;
  }
}

const grade = (score) => (score >= 90 ? 'A' : score >= 78 ? 'B' : score >= 62 ? 'C' : score >= 45 ? 'D' : 'E');

/** The debrief of a take-off: the same shape as a landing's (js/evaluate.js). */
export function evaluateTakeoff(monitor, ac) {
  const r = monitor.rec, T = TAKEOFF, dmg = ac.damage, st = ac.state, V = r.speeds;
  const items = [], add = (label, value, points, max, note, ok = true) => items.push({ label, value, points: Math.round(points), max, note, ok });
  const notes = [...new Set(dmg.notes)];
  const within = (v, full, zero) => Math.max(0, Math.min(1, (zero - v) / (zero - full)));

  const cfg = r.config.filter((p) => p !== 'FLAPS MOVING');
  add('Configuration', cfg.length ? `not set: ${cfg.join(', ').toLowerCase()}` : `flaps ${AC.flapDetents[V.flapIndex]}, trim ${r.trim.toFixed(1)}, thrust ${r.rating}, ${(r.mass / 1000).toFixed(0)} t${r.rto ? ', autobrake RTO' : ''}`, cfg.length ? 0 : 10, 10,
    cfg.length ? 'Flaps 1, 5 or 15, the trim in the green band, speedbrake down and the parking brake released before take-off thrust.' : 'Set for take-off.', !cfg.length);
  const fail = r.failure, devFull = fail ? 9 : 3, devZero = fail ? 22 : 15;   // an engine failure swings the nose: the runway's half-width is the limit
  add('Centreline on the roll', `${r.maxDev.toFixed(1)} m off at most`, 15 * within(r.maxDev, devFull, devZero), 15,
    r.maxDev <= devFull ? (fail ? 'Held with the rudder through the engine failure.' : 'On the centreline.') : fail ? 'Rudder at once, towards the engine still running.' : 'Small rudder inputs early keep the nose on the centreline.', r.maxDev < devZero);
  if (fail) {
    const stopped = !!r.rejected, right = fail.beforeV1 ? stopped : !stopped;
    add('Engine failure', `engine ${fail.engine + 1} failed at ${fail.ias.toFixed(0)} kt (V1 ${V.v1}): ${stopped ? 'stopped' : 'continued'}`, right ? 10 : 0, 10,
      fail.beforeV1 ? (right ? 'Before V1: stop.' : 'Before V1 the take-off is rejected: there is runway to stop on, and one engine less to climb with.') : (right ? 'After V1: go.' : 'After V1 the take-off is continued.'), right);
  }

  if (r.rejected) {
    const j = r.rejected, ok = !j.afterV1 && j.stoppedOnRunway;
    const dec = fail ? 30 : 40;
    add('The decision', `rejected at ${j.ias.toFixed(0)} kt (V1 ${V.v1})`, j.afterV1 ? 0 : dec, dec, j.afterV1 ? 'After V1 the take-off is continued: there may not be runway left to stop.' : 'Before V1: stopping was the right call.', !j.afterV1);
    add('Stopping', j.stoppedOnRunway ? 'stopped on the runway' : 'left the runway', j.stoppedOnRunway ? 35 : 0, 35, j.stoppedOnRunway ? 'Thrust closed, brakes, speedbrakes and reverse.' : 'Maximum braking, speedbrakes up and reverse thrust at once.', j.stoppedOnRunway);
    const score = dmg.destroyed ? 0 : items.reduce((s, i) => s + i.points, 0);
    return { outcome: ok && !dmg.destroyed ? 'rejected' : 'overrun', headline: ok ? `Rejected take-off at ${j.ias.toFixed(0)} kt, stopped on the runway` : j.afterV1 ? 'Take-off rejected after V1' : 'Rejected take-off left the runway',
      score, grade: ok ? grade(score) : 'F', items, failures: [], notes, success: ok && !dmg.destroyed, takeoff: r };
  }

  const lo = r.liftoff;
  let outcome = 'takeoff', headline = '';
  if (dmg.destroyed) { outcome = 'crash'; headline = notes[notes.length - 1] || 'The aircraft was destroyed'; }
  else if (!lo) { outcome = st.beyondRunwayEnd ? 'overrun' : 'excursion'; headline = st.beyondRunwayEnd ? 'Ran off the end of the runway without lifting off' : 'Left the runway on the take-off roll'; }
  else if (dmg.tailStrike || dmg.bellyContact) { outcome = 'tailstrike'; headline = 'Tail strike — the nose was raised too far before lift-off'; }
  else if (dmg.gearCollapsed || dmg.wingStrike || dmg.engineStrike) { outcome = 'crash'; headline = notes[0] || 'The aircraft was damaged on take-off'; }

  if (r.rotate) {
    const d = r.rotate.ias - V.vr, pts = d < -5 ? 0 : d <= 7 ? 15 : 15 * within(d, 7, 20);
    add('Rotation speed', `${r.rotate.ias.toFixed(0)} kt (VR ${V.vr})`, pts, 15, d < -5 ? 'Too early: below VR the wing cannot yet carry the aircraft.' : d <= 7 ? 'At VR.' : 'Late: every second on the runway uses about 80 m of it.', d >= -5 && d <= 20);
  }
  if (lo) {
    if (r.rate !== null) {
      const [a, b] = fail ? [1.5, 3] : T.rateDegS, off = r.rate < a ? a - r.rate : r.rate > b ? r.rate - b : 0;   // a little slower on one engine
      add('Rotation rate', `${r.rate.toFixed(1)}° a second`, 15 * within(off, 0, 1.5), 15, off === 0 ? 'Smooth and continuous.' : r.rate > b ? 'Too fast: the tail comes close to the runway.' : 'Too slow: the aircraft stays on the runway longer.', off < 1.5);
    }
    const pitch = lo.pitch / DEG, margin = T.tailPitchDeg - pitch;
    add('Lift-off', `${lo.ias.toFixed(0)} kt, ${pitch.toFixed(1)}° of pitch, ${lo.dist.toFixed(0)} m down the runway`, dmg.tailStrike || dmg.bellyContact ? 0 : 10 * within(-margin, -1, 0.5), 10,
      dmg.tailStrike || dmg.bellyContact ? 'The tail struck the runway.' : margin >= 1 ? 'The tail well clear.' : 'Close to the tail-strike attitude (about 11° on the ground).', !(dmg.tailStrike || dmg.bellyContact));
    const gearOk = r.gearUpT !== null && r.gearUpT <= T.gearUpS;
    add('Gear up', r.gearUpT === null ? 'not selected up' : `${r.gearUpT.toFixed(1)} s after the positive rate`, gearOk ? 5 : r.gearUpT !== null ? 2 : 0, 5, gearOk ? 'Positive rate, gear up.' : 'Gear up as soon as the aircraft is climbing: it is a lot of drag.', gearOk);
    if (r.speed.n) {
      const mean = r.speed.sum / r.speed.n, [a, b] = fail ? T.engineOutClimb : T.climb, over = mean - V.v2, off = over < a ? a - over : over > b ? over - b : 0;
      const low = r.speed.min < V.v2 - 2;
      add('Climb speed', `V2 ${over >= 0 ? '+' : '−'} ${Math.abs(over).toFixed(0)} kt on average (lowest ${r.speed.min.toFixed(0)} kt)`, low ? 0 : 15 * within(off, 0, 20), 15,
        low ? `Below V2 (${V.v2} kt): lower the nose.` : off === 0 ? (fail ? 'V2 to V2 + 20 on one engine.' : 'V2 + 10 to 25.') : over > b ? 'Fast: a little more pitch holds the speed and gains height sooner.' : 'Slow: a little less pitch.', !low && off < 20);
    }
    const trackFull = fail ? 400 : 100, trackZero = fail ? 2000 : 600;   // on one engine the heading is held, not the centreline
    if (r.endIas !== null || r.climbDev > 0) add('Track', `${r.climbDev.toFixed(0)} m off the runway's line at most, ${(r.maxBank / DEG).toFixed(0)}° of bank`, 5 * within(r.climbDev, trackFull, trackZero), 5, r.climbDev <= trackFull ? 'Straight out.' : 'Hold the runway heading, the wings level.', r.climbDev < trackZero);
    if (r.endIas !== null && !fail) {
      // the clean-up: flaps up on schedule, climb thrust, the speed limit
      const cl = r.clean, faults = [];
      if (cl.lowFt !== null) faults.push(`flaps retracted at ${cl.lowFt.toFixed(0)} ft (not below ${T.cleanFromFt})`);
      if (cl.slow) faults.push(`flaps ${AC.flapDetents[cl.slow.to]} selected at ${cl.slow.ias.toFixed(0)} kt (${cl.slow.need.toFixed(0)} needed)`);
      if (cl.upFt === null) faults.push('flaps not up by 3,000 ft');
      if (cl.reducedFt === null) faults.push('take-off thrust left set');
      if (cl.maxIas > T.maxKt + 5) faults.push(`${cl.maxIas.toFixed(0)} kt (250 below 10,000 ft)`);
      add('After take-off', faults.length ? faults.join('; ') : `flaps up at ${cl.upFt.toFixed(0)} ft, climb thrust from ${cl.reducedFt.toFixed(0)} ft`, Math.max(0, 10 - 4 * faults.length), 10,
        faults.length ? 'From 1,000 ft lower the nose and accelerate, retract the flaps as the speed allows, and set climb thrust at 1,500 ft.' : 'Accelerated, cleaned up and climb thrust set.', !faults.length);
    }
    if (r.settled) { notes.push('The aircraft settled back onto the runway after lift-off.'); }
    if (r.stall) notes.push('Stall warning in the climb.');
  }

  let score = items.reduce((s, i) => s + i.points, 0);
  if (dmg.destroyed) score = 0; else if (outcome !== 'takeoff') score = Math.min(score, 30);
  if (r.stall && outcome === 'takeoff') score = Math.min(score, 60);
  const success = outcome === 'takeoff';
  if (success && fail) headline = fail.beforeV1 ? 'Airborne on one engine, but the failure came before V1' : score >= 78 ? 'Engine failure at V1 handled: climbing on one engine' : 'Airborne on one engine, but it was untidy';
  else if (success) headline = score >= 90 ? 'Excellent take-off, Captain' : score >= 78 ? 'Good take-off' : score >= 62 ? 'Acceptable take-off' : 'Airborne, but it was untidy';
  return { outcome, headline, score, grade: success ? grade(score) : 'F', items, failures: [], notes, success, takeoff: r };
}

/**
 * The debrief of a whole flight: the landing's, with the take-off's result as its first line and
 * the two scores averaged. A landing that fails fails the flight.
 */
export function wholeFlightResult(takeoff, landing) {
  const score = landing.success ? Math.round((takeoff.score + landing.score) / 2) : Math.min(landing.score, 30);
  const first = { label: 'Take-off', value: `${takeoff.headline}: ${takeoff.score} / 100 (grade ${takeoff.grade})`, points: takeoff.score, max: 100,
    note: takeoff.items.filter((i) => !i.ok).map((i) => i.label).join(', ') || 'Every item to the book.', ok: takeoff.success && takeoff.score >= 62 };
  const second = { label: 'Landing', value: `${landing.headline}: ${landing.score} / 100 (grade ${landing.grade})`, points: landing.score, max: 100, note: 'Its items follow.', ok: landing.success };
  return Object.assign({}, landing, { score, grade: landing.success ? grade(score) : 'F', items: [first, second, ...landing.items],
    headline: landing.success ? `Flight complete — take-off ${takeoff.score}, landing ${landing.score}` : landing.headline, wholeFlight: { takeoff, landing } });
}

export { RUNWAY };
