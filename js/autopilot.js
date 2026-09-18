// Test pilot / demo autopilot. It flies the ILS to a landing using ONLY the
// same input channels a human uses (pitch, roll, yaw, throttle, flaps, gear,
// speedbrake, brakes, reversers). Used by the automated tests and by the
// "watch a demo landing" option in Flight School.
import { RUNWAY, KTS, FT, DEG } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Autopilot {
  constructor(aircraft, opts = {}) {
    this.ac = aircraft;
    this.opts = Object.assign({
      // deliberately-bad behaviours for failure testing
      noGear: false, noFlare: false, noBrakes: false, hardLanding: false, offsetM: 0, noDecrab: false,
      targetSpeedOffset: 0, flareHeight: 9.5, autobrake: 3, useReversers: true, idleAt: 6,
    }, opts);
    this.phase = 'approach';
    this.iPitch = 0; this.iSpeed = 0; this.iRoll = 0;
    this.prevGsDev = 0; this.prevLoc = 0;
    this.flareStartT = -1;
    this.t = 0;
    this.log = [];
  }

  update(dt) {
    const ac = this.ac, st = ac.state, o = this.opts;
    const inp = this.inputTarget || ac.input;   // a shadow input lets the flight director reuse this law
    this.t += dt;
    const agl = st.agl;
    const distThr = st.distToThreshold;  // + before the threshold

    // ---- configuration schedule (distance/altitude based, like a real crew)
    if (this.phase === 'approach') {
      const vref = st.vref;
      // slow down and configure progressively
      if (distThr < 14 * 1852 && inp.flapIndex < 2) { inp.flapIndex = 2; this.note('flaps 5'); }
      if (distThr < 11 * 1852 && inp.flapIndex < 3 && st.ias < 195) { inp.flapIndex = 3; this.note('flaps 15'); }
      if (distThr < 9.5 * 1852 && !inp.gearDown && !o.noGear && st.ias < 190) { inp.gearDown = true; this.note('gear down'); }
      if (distThr < 8 * 1852 && inp.flapIndex < 4 && st.ias < 170) { inp.flapIndex = 4; this.note('flaps 30'); inp.speedbrakeArmed = true; inp.autobrake = o.autobrake; }
      // target speed: Vref+5 when configured, else a schedule by flap
      const gust = (ac.atmosphere.scenario && ac.atmosphere.scenario.gustKts) || 0;
      let target = vref + 5 + Math.min(gust / 2, 15) + o.targetSpeedOffset;
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
        const gsVs = -st.groundSpeed * Math.tan(RUNWAY.glideslopeDeg * DEG);
        vsTarget = gsVs - clamp(gsAltErr * 0.12, -4, 4);
      }
      this.pitchForVs(vsTarget, dt);
      this.throttleForSpeed(target, dt);

      // a steeper approach (tailwind: higher ground speed) needs the flare to start a little higher
      const flareH = o.flareHeight * clamp(Math.abs(st.vs) / 3.7, 0.9, 1.35);
      if (agl < flareH && !o.noFlare) { this.phase = 'flare'; this.flareStartT = this.t; this.flarePitch0 = st.pitch; this.flareVs0 = st.vs; this.flareBias = clamp(inp.pitch, -0.3, 0.3); this.note('flare'); }
      if (o.noFlare && agl < 3) { this.phase = 'rollout'; }
    }

    if (this.phase === 'flare') {
      // exponential flare: sink rate proportional to height, throttles closed, decrab with rudder
      const tf = this.t - this.flareStartT;
      // feed-forward: rotate ~3.5° nose-up over 1.5 s, then trim the sink rate with height
      // ~4 s exponential flare from 30 ft to ~200 fpm at touchdown; never asks for more sink than the approach had
      const vsTarget = o.hardLanding ? -8 : -Math.min(0.6 + agl * 0.42, Math.abs(this.flareVs0 || 3.6));
      const err = vsTarget - st.vs;
      const corr = clamp(err * 1.1, -3, 3) * DEG;
      const ff = 3.0 * clamp(Math.abs(this.flareVs0 || 3.7) / 3.7, 0.9, 1.4);
      let pitchTarget = this.flarePitch0 + clamp(tf / 1.5, 0, 1) * ff * DEG + corr;
      pitchTarget = Math.min(pitchTarget, this.flarePitch0 + 4.5 * DEG, 6.0 * DEG); // tail-strike protection
      const cmd = (pitchTarget - st.pitch) * 8 - st.q * 1.5 + 0.08 + (this.flareBias || 0);
      inp.pitch = clamp(cmd, -0.3, 0.7);
      if (o.hardLanding) inp.pitch = -0.6;
      inp.throttle = o.hardLanding ? 0 : Math.max(0, inp.throttle - dt * 0.35);
      void tf;
      // decrab with rudder and hold the centreline with a wing-low sideslip INTO the wind
      // (crosswind + = from the right -> right bank), plus drift feedback
      const drift = this.prevLatF === undefined ? 0 : (st.lateralOffset - this.prevLatF) / dt;  // m/s, + = drifting right
      this.prevLatF = st.lateralOffset;
      let bankCmd = o.noDecrab ? 0 : clamp((st.crosswind * 0.24 - st.lateralOffset * 0.4 - drift * 1.4) * DEG, -6 * DEG, 6 * DEG);
      inp.roll = clamp((bankCmd - st.roll) * 2.5 - st.p * 1.2, -1, 1);
      inp.yaw = o.noDecrab ? 0 : clamp(-st.crabDeg * 0.12 - st.r * 0.8, -1, 1);
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

  pitchForVs(vsTarget, dt) {
    const st = this.ac.state, inp = this.ac.input;
    const err = vsTarget - st.vs;   // m/s
    this.iPitch = clamp(this.iPitch + err * dt * 0.02, -0.4, 0.4);
    // pitch input: proportional on VS error, damping on pitch rate
    inp.pitch = clamp(err * 0.10 + this.iPitch - st.q * 3.0, -0.7, 0.7);
  }

  throttleForSpeed(targetKts, dt) {
    const st = this.ac.state, inp = this.ac.input;
    const err = targetKts - st.ias;
    this.iSpeed = clamp(this.iSpeed + err * dt * 0.004, -0.25, 0.25);
    const accel = this.prevIas === undefined ? 0 : (st.ias - this.prevIas) / dt;
    this.prevIas = st.ias;
    inp.throttle = clamp(0.55 + err * 0.025 + this.iSpeed - accel * 0.15, 0, 1);
  }

  note(msg) { this.log.push({ t: this.t, msg }); }
}
