// Landing evaluation: turns the touchdown record, the roll-out and the damage
// state into an outcome (success / failure), a score and a debrief.
import { RUNWAY, AIRCRAFT as AC, KTS, FPM, DEG } from './config.js';

export const OUTCOME = {
  SUCCESS: 'success',
  CRASH: 'crash',
  OVERRUN: 'overrun',
  EXCURSION: 'excursion',
  BELLY: 'belly',
  COLLAPSE: 'collapse',
  UNDERSHOOT: 'undershoot',
  MISSED: 'missed',
};

/**
 * @param {import('./physics/aircraft.js').Aircraft} ac
 * @param {object} ctx { scenario, goArounds, usedReversers, usedSpeedbrake, maxBrake, stopped, elapsed }
 */
export function evaluateLanding(ac, ctx = {}) {
  const td = ac.touchdown;
  const dmg = ac.damage;
  const st = ac.state;
  const items = [];   // { label, value, points, max, note, ok }
  let outcome = OUTCOME.SUCCESS;
  let headline = '';
  let score = 0;
  const failures = [];

  const add = (label, value, points, max, note, ok = true) => items.push({ label, value, points, max, note, ok });

  if (!td) {
    return { outcome: OUTCOME.CRASH, headline: 'No touchdown recorded', score: 0, grade: 'F', items, failures: dmg.notes.slice(), notes: dmg.notes.slice() };
  }

  // ---- catastrophic outcomes first (most specific / most informative label wins)
  const halfW = RUNWAY.width / 2;
  const tdOffSide = !td.onRunway && Math.abs(td.lateralOffset) > halfW && td.distFromThreshold >= -20;
  const tdShort = td.distFromThreshold < -20 && !td.onRunway;
  const nowOffSide = st.onGround && Math.abs(st.z) > halfW + 1 && Math.abs(st.x) <= RUNWAY.length / 2 + 60;
  const destroyedNote = dmg.destroyed ? (dmg.notes.find((n) => /destroyed|impact|cartwheel|terrain/i.test(n)) || dmg.notes[dmg.notes.length - 1]) : '';
  if (tdShort) {
    outcome = OUTCOME.UNDERSHOOT; headline = `Landed ${(-td.distFromThreshold).toFixed(0)} m short of the runway`;
  } else if (tdOffSide) {
    outcome = OUTCOME.MISSED; headline = `Missed the runway — touched down ${Math.abs(td.lateralOffset).toFixed(0)} m ${td.lateralOffset > 0 ? 'right' : 'left'} of the centreline`;
  } else if (!td.gearDown) {
    outcome = OUTCOME.BELLY; headline = 'Belly landing — the landing gear was not down';
  } else if (st.beyondRunwayEnd || ctx.overrun) {
    outcome = OUTCOME.OVERRUN; headline = `Runway overrun — left the end of the runway at ${ctx.overrunSpeedKts ? ctx.overrunSpeedKts.toFixed(0) + ' kts' : 'speed'}`;
  } else if (nowOffSide || ctx.excursion) {
    outcome = OUTCOME.EXCURSION; headline = 'Runway excursion — the aircraft left the side of the runway';
  } else if (dmg.destroyed) {
    outcome = OUTCOME.CRASH; headline = destroyedNote || 'The aircraft was destroyed';
  } else if (dmg.gearCollapsed) {
    outcome = OUTCOME.COLLAPSE; headline = dmg.notes.find((n) => /collapsed/i.test(n)) || 'Landing gear collapsed';
  } else if (dmg.wingStrike || dmg.engineStrike) {
    outcome = OUTCOME.CRASH; headline = dmg.wingStrike ? 'Wing struck the runway on touchdown' : 'Engine nacelle struck the runway on touchdown';
  } else if (dmg.tailStrike) {
    outcome = OUTCOME.CRASH; headline = 'Tail strike on touchdown — over-rotation in the flare';
  }
  if (outcome !== OUTCOME.SUCCESS && dmg.destroyed && !/destroyed|impact/i.test(headline)) headline += ' — the aircraft was destroyed';

  // ---- scored items (even on failure, for the debrief)
  const sinkFpm = td.sink / FPM;
  let sinkPts, sinkNote;
  if (td.sink <= 0.8) { sinkPts = 25; sinkNote = 'Greaser! Textbook touchdown.'; }
  else if (td.sink <= 1.5) { sinkPts = 22; sinkNote = 'Smooth touchdown.'; }
  else if (td.sink <= 2.3) { sinkPts = 17; sinkNote = 'Firm but fine.'; }
  else if (td.sink <= AC.gear.hardSink) { sinkPts = 9; sinkNote = 'Firm — passengers noticed.'; }
  else if (td.sink <= AC.gear.collapseSink) { sinkPts = 0; sinkNote = 'Hard landing. Maintenance inspection required.'; failures.push('Hard landing'); }
  else { sinkPts = 0; sinkNote = 'Gear collapsed.'; }
  add('Vertical speed at touchdown', `${sinkFpm.toFixed(0)} fpm`, sinkPts, 25, sinkNote, sinkPts >= 9);

  const d = td.distFromThreshold;
  let zonePts, zoneNote;
  if (d < 0) { zonePts = 0; zoneNote = 'Short of the threshold!'; }
  else if (d < RUNWAY.tdzStart) { zonePts = 8; zoneNote = 'Very close to the threshold — dangerously low over the approach lights.'; }
  else if (d <= RUNWAY.tdzEnd) { zonePts = d >= 250 && d <= 650 ? 20 : 16; zoneNote = d >= 250 && d <= 650 ? 'In the aiming zone.' : 'Inside the touchdown zone.'; }
  else if (d <= 1500) { zonePts = 8; zoneNote = 'Long landing — floated well past the touchdown zone.'; failures.push('Long landing'); }
  else { zonePts = 0; zoneNote = 'Far too long — less than half the runway remained.'; failures.push('Very long landing'); }
  add('Touchdown point', `${d.toFixed(0)} m past the threshold`, zonePts, 20, zoneNote, zonePts >= 16);

  const lat = td.lateralOffset;
  let latPts, latNote;
  const alat = Math.abs(lat);
  // judged on where the wheels actually touched: the paved pad before the threshold still has a centreline
  if (td.onRunway === false || d < -RUNWAY.padLength || d > RUNWAY.length) { latPts = 0; latNote = 'Not on the runway.'; }
  else if (alat <= 4) { latPts = 15; latNote = 'On the centreline.'; }
  else if (alat <= 10) { latPts = 12; latNote = 'Slightly off centre.'; }
  else if (alat <= 16) { latPts = 6; latNote = 'Well off the centreline.'; }
  else { latPts = 0; latNote = 'Nearly off the edge of the runway.'; }
  add('Centreline', `${alat.toFixed(1)} m ${lat > 0 ? 'right' : 'left'}`, latPts, 15, latNote, latPts >= 6);

  const vref = AC.vref30;
  const dv = td.ias - (td.flapIndex >= 4 ? (td.flapIndex >= 5 ? AC.vref40 : AC.vref30) : AC.vref15);
  let spdPts, spdNote;
  // the flare bleeds 5-10 kts, so a touchdown a little below Vref is normal
  if (dv >= -9 && dv <= 8) { spdPts = 15; spdNote = 'Speed on target.'; }
  else if (dv > 8 && dv <= 18) { spdPts = 8; spdNote = 'Fast — extra float and a longer roll-out.'; }
  else if (dv > 18) { spdPts = 0; spdNote = 'Far too fast.'; failures.push('Excess speed'); }
  else if (dv < -9 && dv >= -15) { spdPts = 7; spdNote = 'Slow — a long flare bled too much speed.'; }
  else { spdPts = 0; spdNote = 'Dangerously slow — close to the stall.'; failures.push('Below Vref'); }
  add('Airspeed at touchdown', `${td.ias.toFixed(0)} kts (Vref ${vref})`, spdPts, 15, spdNote, spdPts >= 7);

  const crab = Math.abs(td.crabDeg);
  const bank = Math.abs(td.bank) / DEG;
  let alignPts, alignNote;
  if (crab <= 3 && bank <= 4) { alignPts = 15; alignNote = 'Aligned with the runway, wings level.'; }
  else if (crab <= 7 && bank <= 6) { alignPts = 10; alignNote = 'Some crab / bank at touchdown — side load on the gear.'; }
  else if (crab <= AC.gear.maxCrabDeg && bank <= 8) { alignPts = 4; alignNote = 'Large crab or bank — tyres scrubbed hard.'; }
  else { alignPts = 0; alignNote = 'Sideways touchdown.'; }
  add('Alignment', `${crab.toFixed(1)}° crab, ${bank.toFixed(1)}° bank`, alignPts, 15, alignNote, alignPts >= 10);

  // flap configuration
  const flapOk = td.flapIndex >= 4;
  add('Configuration', `Flaps ${AC.flapDetents[td.flapIndex]}, gear ${td.gearDown ? 'down' : 'UP'}`, flapOk && td.gearDown ? 5 : 0, 5,
    !td.gearDown ? 'Gear was not down!' : (flapOk ? 'Landing flaps set.' : 'Landing flaps (30 or 40) were not set — fast approach.'), flapOk && td.gearDown);

  // deceleration
  const roll = ac.landingRollDistance;
  const stoppedOnRunway = outcome === OUTCOME.SUCCESS;
  let decelPts = 0, decelNote = '';
  if (stoppedOnRunway) {
    decelPts = 5;
    const used = [];
    if (ctx.usedReversers) used.push('reversers');
    if (ctx.usedSpeedbrake) used.push('speedbrakes');
    if (ctx.maxBrake > 0.2 || ac.input.autobrake > 0) used.push('brakes');
    decelNote = `Stopped after a ${roll.toFixed(0)} m roll-out using ${used.join(', ') || 'aerodynamic drag only'}.`;
    if (!ctx.usedSpeedbrake) { decelPts -= 2; decelNote += ' Speedbrakes were not deployed.'; }
  } else {
    decelNote = 'Did not stop on the runway.';
  }
  add('Stopping', stoppedOnRunway ? `${roll.toFixed(0)} m roll-out` : 'Not stopped on the runway', Math.max(0, decelPts), 5, decelNote, stoppedOnRunway);

  score = items.reduce((s, i) => s + i.points, 0);
  if (dmg.destroyed) score = 0;
  else if (outcome === OUTCOME.COLLAPSE || outcome === OUTCOME.BELLY) score = Math.min(score, 15);
  else if (outcome !== OUTCOME.SUCCESS) score = Math.min(score, 30);
  if (dmg.hardLanding && outcome === OUTCOME.SUCCESS) { score = Math.min(score, 55); failures.push('Hard landing'); }
  if (ctx.goArounds) { add('Go-arounds', `${ctx.goArounds}`, 0, 0, 'A go-around is always the right call when the approach is not stable.', true); }

  let grade;
  if (outcome !== OUTCOME.SUCCESS) grade = 'F';
  else if (score >= 90) grade = 'A';
  else if (score >= 78) grade = 'B';
  else if (score >= 62) grade = 'C';
  else if (score >= 45) grade = 'D';
  else grade = 'E';

  if (outcome === OUTCOME.SUCCESS) {
    if (dmg.hardLanding) headline = 'Landed — but that was a hard landing';
    else if (score >= 90) headline = 'Excellent landing, Captain';
    else if (score >= 78) headline = 'Good landing';
    else if (score >= 62) headline = 'Acceptable landing';
    else headline = 'You are down, but it was ugly';
  }

  return {
    outcome, headline, score, grade, items, failures,
    notes: [...new Set(dmg.notes)],
    touchdown: td,
    rollDistance: roll,
    success: outcome === OUTCOME.SUCCESS,
  };
}

export function fmtOutcome(o) {
  return {
    success: 'LANDED', crash: 'CRASHED', overrun: 'RUNWAY OVERRUN', excursion: 'RUNWAY EXCURSION',
    belly: 'BELLY LANDING', collapse: 'GEAR COLLAPSE', undershoot: 'LANDED SHORT', missed: 'MISSED THE RUNWAY',
  }[o] || o.toUpperCase();
}

export { KTS };
