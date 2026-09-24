// Test pilot / demo autopilot. It flies the ILS to a landing using ONLY the
// same input channels a human uses (pitch, roll, yaw, throttle, flaps, gear,
// speedbrake, brakes, reversers). Used by the automated tests and by the
// "watch a demo landing" option in Flight School.
//
// Its thrust is a 737-style autothrottle (see throttleForSpeed): command speed Vref + the wind
// additive (windAdditive), the speed filtered with the aircraft's inertial acceleration so gusts
// do not reach the levers, and the levers moved by a rate-limited servo that adds thrust faster
// than it takes it off.
import { RUNWAY, KTS, FT, DEG } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * The approach speed's wind additive (kt) for a reported wind: half the steady headwind component
 * plus the full gust increment, between 5 and 20 kt (no credit for a tailwind).
 */
export function windAdditive(scenario) {
  if (!scenario) return 5;
  const head = scenario.windKts * Math.cos((scenario.windDirDeg - RUNWAY.headingDeg) * DEG);
  return clamp(Math.max(0, head) / 2 + (scenario.gustKts || 0), 5, 20);
}

/** The autothrottle's speed mode (fractions of the thrust lever's travel). */
export const AUTOTHROTTLE = {
  filterTime: 5,        // s: the complementary filter's time constant (autothrottles use 2–5 s)
  rateUp: 0.08,         // lever travel per second, adding thrust: quick when slow...
  rateDown: 0.04,       // ...and half as quick taking it off (Boeing's gust protection)
  deadband: 0.005,      // the servo ignores smaller corrections
  retard: 0.25,         // lever travel per second in RETARD (from 27 ft): idle about 2 s later
};

export class Autopilot {
  constructor(aircraft, opts = {}) {
    this.ac = aircraft;
    this.opts = Object.assign({
      // deliberately-bad behaviours for failure testing
      noGear: false, noFlare: false, noBrakes: false, hardLanding: false, offsetM: 0, noDecrab: false,
      targetSpeedOffset: 0, flareHeight: 9.5, autobrake: 3, useReversers: true, idleAt: 6,
    }, opts);
    this.phase = 'approach';
    this.iPitch = 0; this.iRoll = 0;
    this.prevGsDev = 0; this.prevLoc = 0;
    this.flareStartT = -1;
    this.t = 0;
    this.log = [];
  }

  update(dt) {
    const ac = this.ac, st = ac.state, o = this.opts;
    const inp = this.target();   // a shadow input lets the flight director reuse this law without flying the aircraft
    this.t += dt;
    const agl = st.agl;
    const distThr = st.distToThreshold;  // + before the threshold
    // the steady crosswind, as a pilot feels it (not each gust)
    this.xwF = this.xwF === undefined ? st.crosswind : this.xwF + (st.crosswind - this.xwF) * Math.min(1, dt / 4);

    // ---- configuration schedule (distance/altitude based, like a real crew)
    if (this.phase === 'approach') {
      const vref = st.vref;
      // slow down and configure progressively
      if (distThr < 14 * 1852 && inp.flapIndex < 2) { inp.flapIndex = 2; this.note('flaps 5'); }
      if (distThr < 11 * 1852 && inp.flapIndex < 3 && st.ias < 195) { inp.flapIndex = 3; this.note('flaps 15'); }
      if (distThr < 9.5 * 1852 && !inp.gearDown && !o.noGear && st.ias < 190) { inp.gearDown = true; this.note('gear down'); }
      if (distThr < 8 * 1852 && inp.flapIndex < 4 && st.ias < 170) { inp.flapIndex = 4; this.note('flaps 30'); inp.speedbrakeArmed = true; inp.autobrake = o.autobrake; }
      // approach speed: Vref + the wind additive, as Boeing describes it and airlines fly it: half
      // the reported steady headwind plus the full gust, at least 5 and at most 20 kt; else a
      // schedule by flap
      let target = vref + windAdditive(ac.atmosphere.scenario) + o.targetSpeedOffset;
      if (inp.flapIndex < 4) target = Math.max(target, [210, 190, 180, 160][inp.flapIndex] || 160);
      this.targetIas = target;

      // ---- lateral: track the extended centreline (+ optional deliberate offset) using the
      // lateral offset and its rate (like a localizer whose gain is normalised by distance)
      const latErr = st.lateralOffset - o.offsetM;              // m, + = right of the desired line
      const latRate = this.prevLat0 === undefined ? 0 : (latErr - this.prevLat0) / dt; this.prevLat0 = latErr;
      const offsetDeg = Math.atan2(o.offsetM, Math.max(distThr + RUNWAY.length + 300, 200)) / DEG;
      const locErr = st.locDev - offsetDeg;
      const locRate = (locErr - this.prevLoc) / dt; this.prevLoc = locErr;
      // far out: localizer angle; inside 2 nm: direct offset + drift (the loc gets over-sensitive near the antenna)
      let trackCmdDeg = clamp(-locErr * 8 - locRate * 3.0, -25, 25);
      if (distThr < 2 * 1852) trackCmdDeg = clamp(-(latErr * 0.09 + latRate * 1.3), -12, 12);
      const rwyHdg = RUNWAY.headingDeg;
      const trackErr = ((st.track / DEG - (rwyHdg + trackCmdDeg)) + 540) % 360 - 180;
      const bankLimit = agl < 150 ? 8 : (agl < 400 ? 14 : 20);   // gentle near the ground
      const bankCmd = clamp(-trackErr * 1.5, -bankLimit, bankLimit) * DEG;
      const rollErr = bankCmd - st.roll;
      this.iRoll = clamp(this.iRoll + rollErr * dt * 0.5, -0.3, 0.3);
      inp.roll = clamp(rollErr * 2.2 - st.p * 0.6 + this.iRoll, -1, 1);
      inp.yaw = 0; // coordinated: yaw damper handles the rest

      // ---- vertical: capture the glideslope from below, then track it
      let vsTarget;
      const gsAltErr = st.alt - st.gsAltitude;   // + above the GS
      if (this.phase === 'approach' && st.alt > st.gsAltitude + 30 && distThr > 2000) {
        vsTarget = -900 * 0.00508;   // descend to intercept from above
      } else if (gsAltErr < -40 && distThr > 4000) {
        vsTarget = 0; // level, wait for the glideslope
      } else {
        // the glidepath's descent rate, corrected towards the glideslope; the correction fades out
        // from 150 ft to 50 ft, where the beam is too sensitive to chase
        const gsVs = -st.groundSpeed * Math.tan(RUNWAY.glideslopeDeg * DEG);
        const gsGain = clamp((agl - 50 * FT) / (100 * FT), 0, 1);
        vsTarget = gsVs - clamp(gsAltErr * 0.12, -4, 4) * gsGain;
      }
      if (agl < 100 * FT && !o.noFlare && this.pitchAvg !== undefined) {
        // below 100 ft fly the approach's attitude (its average over the last few seconds above
        // 100 ft) with only a small correction for the sink rate, as autoland and pilots do:
        // the gusts near the ground are not chased with the nose
        const want = this.pitchAvg + clamp((vsTarget - st.vs) * 0.4, -1.5, 1.5) * DEG;
        this.pitchForAttitude(Math.max(want, -1 * DEG));
      } else {
        // close to the ground the nose never goes more than 1° below the horizon on a 3° approach
        this.pitchForVs(vsTarget, dt, agl < 200 * FT ? -1 * DEG : -Infinity);
        if (agl >= 100 * FT) {
          const k = Math.min(1, dt / 6);
          if (this.pitchAvg === undefined) { this.pitchAvg = st.pitch; this.pitchInAvg = inp.pitch; }
          this.pitchAvg += (st.pitch - this.pitchAvg) * k; this.pitchInAvg += (inp.pitch - this.pitchInAvg) * k;
        }
      }
      this.throttleForSpeed(target, dt);

      // a steeper approach (tailwind: higher ground speed) needs the flare to start a little higher
      // (the deliberate push into the runway begins at 40 ft)
      const flareH = o.hardLanding ? 40 * FT : o.flareHeight * clamp(Math.abs(st.vs) / 3.7, 0.9, 1.35);
      if (agl < flareH && !o.noFlare) { this.phase = 'flare'; this.flareStartT = this.t; this.flarePitch0 = st.pitch; this.flareVs0 = st.vs; this.flareBias = clamp(inp.pitch, -0.3, 0.3); this.crab0 = st.crabDeg; this.note('flare'); }
      if (o.noFlare && agl < 3) { this.phase = 'rollout'; }
    }

    if (this.phase === 'flare') {
      // exponential flare: sink rate proportional to height, throttles closed, decrab with rudder
      const tf = this.t - this.flareStartT;
      // feed-forward: rotate ~3.5° nose-up over 1.5 s, then trim the sink rate with height
      // ~4 s exponential flare from 30 ft to ~200 fpm at touchdown; never asks for more sink than the approach had
      const vsTarget = o.hardLanding ? -8 : -Math.min(0.6 + agl * 0.42, Math.abs(this.flareVs0 || 3.6));
      const err = vsTarget - st.vs;
      // sinking too fast: raise the nose more; floating or ballooning: ease it a little, but never
      // push it down through the flare attitude (hold it and let the aircraft settle)
      const corr = clamp(err * 1.1, -1.5, 3) * DEG;
      const ff = 3.0 * clamp(Math.abs(this.flareVs0 || 3.7) / 3.7, 0.9, 1.4);
      const ramp = clamp(tf / 1.5, 0, 1);
      let pitchTarget = this.flarePitch0 + ramp * ff * DEG + corr;
      // (the attitude reference: the flare's entry attitude, or the approach's average when a
      // gust had the nose low as the flare began)
      const floor0 = this.pitchAvg === undefined ? this.flarePitch0 : Math.max(this.flarePitch0, this.pitchAvg);
      pitchTarget = Math.max(pitchTarget, floor0 + ramp * 0.5 * ff * DEG);
      // in the last few feet hold the attitude reached (lowering the nose there only drops the
      // wheels onto the runway)
      if (agl < 6 * FT) pitchTarget = Math.max(pitchTarget, st.pitch);
      pitchTarget = Math.min(pitchTarget, this.flarePitch0 + 4.5 * DEG, 6.0 * DEG); // tail-strike protection
      const cmd = (pitchTarget - st.pitch) * 8 - st.q * 1.5 + 0.08 + (this.flareBias || 0);
      inp.pitch = clamp(cmd, -0.3, 0.7);
      if (o.hardLanding) inp.pitch = -0.6;
      // the autothrottle's RETARD: from 27 ft the levers come back to idle, reaching it about as
      // the wheels touch; above 27 ft it still holds the speed, so a gust that balloons the
      // aircraft back up gets thrust again as the speed decays (Boeing: in a balloon hold the
      // attitude and add thrust as needed) instead of an idle float that ends in a drop; and
      // with the speed decayed below Vref the thrust stays in to the ground
      if (o.hardLanding) inp.throttle = 0;
      else if (agl < 27 * FT) { if (st.ias > st.vref - 5) inp.throttle = Math.max(0, inp.throttle - dt * AUTOTHROTTLE.retard); }
      else this.throttleForSpeed(this.targetIas, dt);
      void tf;
      // decrab with rudder as the wheels near the runway (the crab is gone by 5 ft; a balloon
      // brings it back), and hold the centreline with a wing-low sideslip INTO the steady
      // crosswind (+ = from the right -> right bank) plus drift feedback; the bank comes off
      // towards the ground to keep the engine nacelles clear
      const drift = this.prevLatF === undefined ? 0 : (st.lateralOffset - this.prevLatF) / dt;  // m/s, + = drifting right
      this.prevLatF = st.lateralOffset;
      const aglFt = agl / FT, keep = clamp((aglFt - 5) / 20, 0, 1);
      const crabTarget = (this.crab0 || 0) * keep;
      const bankLimit = (4 + 2 * clamp((aglFt - 5) / 15, 0, 1)) * DEG;
      const bankCmd = o.noDecrab ? 0 : clamp((this.xwF * 0.24 * (1 - keep) - st.lateralOffset * 0.3 - drift * 1.6) * DEG, -bankLimit, bankLimit);
      const rollErrF = bankCmd - st.roll;
      this.iRoll = clamp(this.iRoll + rollErrF * dt * 1.5, -0.3, 0.3);
      inp.roll = clamp(rollErrF * 5 - st.p * 1.5 + this.iRoll, -1, 1);
      inp.yaw = o.noDecrab ? 0 : clamp(-(st.crabDeg - crabTarget) * 0.12 - st.r * 0.8, -1, 1);
      void vsTarget;
      if (st.onGround && st.mainsOnGround) { this.phase = 'rollout'; this.note('touchdown'); }
      if (st.onGround && this.t - this.flareStartT > 3) this.phase = 'rollout';
    }

    if (this.phase === 'rollout') {
      inp.throttle = 0;
      if (!st.onGround) {
        // bounced: hold a 3° attitude and wait for the wheels — never push the nose over
        inp.pitch = clamp((3 * DEG - st.pitch) * 6 - st.q * 1.5 + 0.08, -0.2, 0.6);
      } else if (st.groundSpeed > 30) {
        inp.pitch = clamp(inp.pitch - dt * 0.35, -0.15, 1); // lower the nose gently
      } else inp.pitch = 0;
      inp.roll = clamp(-st.roll * 3, -1, 1);
      // steer along the centreline with rudder / nose-wheel steering
      const driftG = (st.lateralOffset - (this.prevLat === undefined ? st.lateralOffset : this.prevLat)) / dt; // + = drifting right
      this.prevLat = st.lateralOffset;
      inp.yaw = clamp(-st.lateralOffset * 0.05 - driftG * 0.12 - st.crabDeg * 0.15, -1, 1);
      if (o.useReversers && st.groundSpeed > 30 * KTS) inp.reverse = true; else inp.reverse = false;
      if (st.groundSpeed < 30 * KTS && inp.reverse) inp.reverse = false;
      if (!o.noBrakes) inp.brake = st.groundSpeed > 1 ? 0.8 : 1; else inp.brake = 0;
      if (st.groundSpeed < 0.5) { this.phase = 'stopped'; }
    }
  }

  /** The autothrottle's mode as a 737's flight mode annunciator shows it. */
  get atMode() {
    const st = this.ac.state;
    if (this.phase === 'approach') return 'MCP SPD';
    if (this.phase === 'flare' && !st.onGround) return st.agl < 27 * FT ? 'RETARD' : 'MCP SPD';
    return 'ARM';
  }

  /** The controls this autopilot writes: the aircraft's, or the flight director's shadow copy. */
  target() { return this.inputTarget || this.ac.input; }

  pitchForVs(vsTarget, dt, minPitch = -Infinity) {
    const st = this.ac.state, inp = this.target();
    const err = vsTarget - st.vs;   // m/s
    this.iPitch = clamp(this.iPitch + err * dt * 0.02, -0.4, 0.4);
    // pitch input: proportional on VS error, damping on pitch rate
    let cmd = err * 0.10 + this.iPitch - st.q * 3.0;
    // an attitude floor: below it, pull back towards it instead
    if (st.pitch < minPitch + 0.5 * DEG) cmd = Math.max(cmd, (minPitch + 0.5 * DEG - st.pitch) * 8 - st.q * 1.5);
    inp.pitch = clamp(cmd, -0.7, 0.7);
  }

  /** Hold a pitch attitude, from the elevator the vertical speed law used on the approach. */
  pitchForAttitude(pitchTarget) {
    const st = this.ac.state, inp = this.target();
    inp.pitch = clamp(this.pitchInAvg + (pitchTarget - st.pitch) * 8 - st.q * 1.5, -0.7, 0.7);
  }

  /**
   * The autothrottle's speed mode, as a 737's works.
   *  - The speed it controls is the indicated airspeed blended with the aircraft's inertial
   *    acceleration along its path (a complementary filter): a gust that changes the airspeed for
   *    a few seconds barely moves it, a real change of speed shows at once. Airspeed alone would
   *    have the levers chase every gust (in the storm the airspeed changes by several kt/s).
   *  - A servo moves the levers at a limited rate, adding thrust twice as fast as it takes it off:
   *    in gusts the average thrust, and so the average speed, stays a little above the command
   *    speed (Boeing's gust protection with the autothrottle engaged).
   * Pilots flying by hand in turbulence do the same: set the thrust, do not chase the airspeed,
   * correct only its trend.
   */
  throttleForSpeed(targetKts, dt) {
    const st = this.ac.state, inp = this.target(), A = AUTOTHROTTLE;
    const at = this.at || (this.at = { speed: st.ias, accel: 0, v: null, i: 0 });
    // inertial acceleration along the flight path (kt/s), lightly smoothed
    const v = Math.hypot(st.vx, st.vy, st.vz);
    if (at.v !== null && dt > 0) at.accel += ((v - at.v) / dt / KTS - at.accel) * Math.min(1, dt / 0.3);
    at.v = v;
    // complementary filter: inertial acceleration for the quick part, airspeed for the slow part
    at.speed += (at.accel + (st.ias - at.speed) / A.filterTime) * dt;
    const err = targetKts - at.speed;
    at.i = clamp(at.i + err * dt * 0.004, -0.25, 0.25);
    // where the levers should be; the servo moves them there at its rates
    const want = clamp(0.55 + err * 0.02 + at.i - at.accel * 0.12, 0, 1);
    const d = want - inp.throttle;
    if (Math.abs(d) > A.deadband) inp.throttle = clamp(inp.throttle + clamp(d, -A.rateDown * dt, A.rateUp * dt), 0, 1);
  }

  note(msg) { this.log.push({ t: this.t, msg }); }
}
