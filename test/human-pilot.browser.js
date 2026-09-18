// Human-like pilot that runs INSIDE the page and produces only the events a
// person would: mouse moves for the yoke, key presses for everything else.
// It runs once per rendered frame (like a human reacting to what they see).
// Used by the browser tests and the playtest harness.
//   window.installHumanPilot({ noGear, noFlare, noBrakes, stallOnFinal, landLong, goAroundAt, targetOffset, ... })
(function () {
  window.installHumanPilot = function (opts) {
    const o = Object.assign({ noGear: false, noFlare: false, noBrakes: false, stallOnFinal: false, landLong: false, goAroundAt: 0, targetOffset: 0, keepCrab: false, autobrake: 3, useReversers: true }, opts || {});
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const held = new Set();
    const key = (code, on) => {
      if (on && !held.has(code)) { held.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
      if (!on && held.has(code)) { held.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }
    };
    const tap = (code, ms = 60) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), ms); };
    const mouse = (rollIn, pitchIn) => { const x = W() / 2 + rollIn * W() / 2, y = H() / 2 - pitchIn * H() / 2; window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true })); };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const DEG = Math.PI / 180, NM = 1852;
    const P = { phase: 'approach', prevLat: null, flareT: 0, flarePitch0: 0, flareVs0: -3.7, last: performance.now(), iVs: 0, iSpd: 0, did: {}, log: [], gaT: 0, stopped: false, trace: [] };
    window.__pilot = P;
    const note = (m) => { const st = window.__sim.state(); P.log.push({ t: st.time, m }); };
    const config = (st, inp) => {
      const d = st.distToThreshold;
      if (d < 14 * NM && inp.flapIndex < 2 && !P.did.f5) { P.did.f5 = 1; tap('KeyF'); note('flaps 5'); }
      if (d < 8.5 * NM && inp.flapIndex < 3 && st.ias < 195 && !P.did.f15) { P.did.f15 = 1; tap('KeyF'); note('flaps 15'); }
      if (d < 7.2 * NM && !inp.gearDown && !o.noGear && st.ias < 190 && !P.did.gear) { P.did.gear = 1; tap('KeyG'); note('gear down'); }
      if (d < 6.2 * NM && inp.flapIndex < 4 && st.ias < 170 && !P.did.f30) { P.did.f30 = 1; tap('KeyF'); note('flaps 30'); }
      if (d < 5.5 * NM && !inp.speedbrakeArmed && st.speedbrake < 0.1 && !P.did.arm) { P.did.arm = 1; tap('KeyX'); note('speedbrake armed'); }
      // fast on the way down with little flap: use the speedbrakes in flight, stow them once the speed is back
      if (d > 6 * NM && st.agl > 1500 * 0.3048) {
        const tgt = (inp.flapIndex >= 3 ? 165 : inp.flapIndex >= 2 ? 175 : 210) + o.targetOffset;
        if (st.ias > tgt + 15 && inp.speedbrake < 0.5 && !P.sbOut) { P.sbOut = 1; tap('Space'); note('speedbrakes out (fast)'); }
        if (st.ias < tgt + 4 && P.sbOut) { P.sbOut = 0; tap('Space'); note('speedbrakes in'); }
      } else if (P.sbOut) { P.sbOut = 0; tap('Space'); note('speedbrakes in'); }
      if (d < 5.5 * NM && inp.autobrake === 0 && !P.did.ab) { P.did.ab = 1; for (let i = 0; i < o.autobrake; i++) setTimeout(() => tap('KeyN'), i * 250); note('autobrake ' + o.autobrake); }
    };
    function tick() {
      const now = performance.now(); const dt = Math.min(0.25, (now - P.last) / 1000); P.last = now;
      const g = window.__sim.game; const st = window.__sim.state(); const inp = window.__sim.input();
      if (g.state !== 'flying') { for (const c of [...held]) key(c, false); if (g.state === 'finished') { P.stopped = true; return; } requestAnimationFrame(tick); return; }
      // a person who sees "click to engage" on the HUD clicks the window again
      if (!window.__sim.inputManager.mouseEngaged) { const cv = document.querySelector('canvas'); cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: W() / 2, clientY: H() / 2, bubbles: true })); cv.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: W() / 2, clientY: H() / 2, bubbles: true })); note('yoke re-engaged'); }
      let pitchIn = 0, rollIn = 0;
      const drift = P.prevLat === null ? 0 : (st.lateralOffset - P.prevLat) / Math.max(dt, 0.001); P.prevLat = st.lateralOffset;
      const targetIas = () => { const fi = inp.flapIndex; return (fi >= 4 ? st.vref + 5 : fi >= 3 ? 165 : fi >= 2 ? 175 : 210) + o.targetOffset; };
      const speedHold = (target) => {
        P.iSpd = clamp(P.iSpd + (target - st.ias) * dt * 0.004, -0.2, 0.2);
        const accel = P.prevIas === undefined ? 0 : (st.ias - P.prevIas) / Math.max(dt, 0.001); P.prevIas = st.ias;
        const thrDes = clamp(0.55 + (target - st.ias) * 0.018 + P.iSpd - accel * 0.2, 0.05, 0.95);
        key('KeyW', inp.throttle < thrDes - 0.02); key('KeyS', inp.throttle > thrDes + 0.02);
      };
      const lateral = (limitDeg) => {
        const bankCmd = clamp(-(st.lateralOffset * 0.10 + drift * 1.5), -limitDeg, limitDeg) * DEG;
        return clamp((bankCmd - st.roll) * 2.2 - st.p * 0.6, -1, 1);
      };
      if (P.phase === 'approach') {
        config(st, inp);
        if (o.goAroundAt && st.agl < o.goAroundAt * 0.3048 && !P.did.ga) { P.did.ga = 1; P.phase = 'goaround'; P.gaT = 0; tap('KeyT'); note('go-around: TOGA'); }
        // vertical: fly the glideslope (intercept from below), else hold altitude until the GS comes down
        let vsT;
        const gsErr = st.alt - st.gsAltitude;      // + above
        if (gsErr < -40 && st.distToThreshold > 4000) vsT = 0;
        else if (st.agl < 60) vsT = -st.groundSpeed * Math.tan(3 * DEG);   // below 200 ft: visual, hold the 3 deg path, do not chase the beam
        else vsT = -st.groundSpeed * Math.tan(3 * DEG) - clamp(gsErr * 0.12, -3, 3);
        if (o.stallOnFinal && st.agl < 250) { key('KeyS', true); key('KeyW', false); pitchIn = 0.9; rollIn = lateral(8); mouse(rollIn, pitchIn); P.traceStep(st, inp, pitchIn, rollIn, dt); requestAnimationFrame(tick); return; }
        // fly pitch attitude (inner loop) and nudge it for the vertical speed (outer loop), like a trained pilot:
        // small, smooth inputs instead of chasing the VS needle
        const err = vsT - st.vs;
        if (P.thetaRef === undefined) P.thetaRef = st.pitch;
        P.thetaRef = clamp(P.thetaRef + err * dt * 0.15 * DEG, -5 * DEG, 8 * DEG);
        const thetaCmd = P.thetaRef + clamp(err * 0.8, -3, 3) * DEG;
        pitchIn = clamp((thetaCmd - st.pitch) * 4.0 - st.q * 2.0, -0.35, 0.35);
        rollIn = lateral(st.agl < 150 ? 8 : 15);
        speedHold(targetIas());
        const flareH = 9.5 * clamp(Math.abs(st.vs) / 3.7, 0.9, 1.35);
        if (st.agl < flareH && !o.noFlare) { P.phase = 'flare'; P.flareT = 0; P.flarePitch0 = st.pitch; P.flareVs0 = st.vs; P.bias = clamp(pitchIn, -0.3, 0.3); note('flare'); }
        if (o.noFlare && st.onGround) { P.phase = 'rollout'; note('touchdown (no flare)'); }
      } else if (P.phase === 'flare') {
        P.flareT += dt;
        key('KeyW', false); key('KeyS', true);
        // a deliberately long landing: hold the aircraft a metre or two off the runway well past the touchdown zone
        const holdOff = o.landLong && st.distFromThreshold < 1300;
        const vsT = holdOff ? (st.agl > 1.5 ? -0.3 : 0) : -Math.min(0.6 + st.agl * 0.42, Math.abs(P.flareVs0));
        const corr = clamp((vsT - st.vs) * 1.1, -3, 3) * DEG;
        const ff = 3.0 * clamp(Math.abs(P.flareVs0) / 3.7, 0.9, 1.4);
        const target = Math.min(P.flarePitch0 + Math.min(P.flareT / 1.5, 1) * ff * DEG + corr, 6 * DEG);
        pitchIn = clamp((target - st.pitch) * 8 - st.q * 1.5 + 0.08 + P.bias, -0.3, 0.7);
        const bankCmd = o.keepCrab ? 0 : clamp((st.crosswind * 0.24 - st.lateralOffset * 0.4 - drift * 1.4) * DEG, -5 * DEG, 5 * DEG);
        rollIn = clamp((bankCmd - st.roll) * 2.5 - st.p * 1.2, -1, 1);
        if (!o.keepCrab) { key('KeyD', st.crabDeg < -2); key('KeyA', st.crabDeg > 2); }
        if (st.onGround && st.mainsOnGround) { P.phase = 'rollout'; note('touchdown'); }
      } else if (P.phase === 'rollout') {
        key('KeyS', true); key('KeyW', false);
        key('KeyR', o.useReversers && st.groundSpeed > 30 * 0.5144); key('KeyB', !o.noBrakes && (inp.autobrake === 0 || st.groundSpeed < 25));
        pitchIn = st.groundSpeed > 30 ? -0.1 : 0; rollIn = clamp(-st.roll * 3, -1, 1);
        // gentle rudder on the roll-out: short taps sized to the error, never a key held for a whole frame
        const steer = (-st.lateralOffset * 0.025 - drift * 0.10 - st.crabDeg * 0.2) * (st.groundSpeed > 40 ? 0.6 : 1);
        if (Math.abs(steer) > 0.1 && !held.has('KeyD') && !held.has('KeyA')) tap(steer > 0 ? 'KeyD' : 'KeyA', clamp(Math.abs(steer) * 600, 100, 300));
      } else if (P.phase === 'goaround') {
        P.gaT += dt;
        key('KeyW', false); key('KeyS', false);
        pitchIn = clamp((12 * DEG - st.pitch) * 4 - st.q * 2, -1, 1);
        rollIn = clamp(-st.roll * 3, -1, 1);
        if (st.vs > 2 && inp.gearDown && !P.did.gaGear) { P.did.gaGear = 1; tap('KeyG'); note('gear up'); }
        if (st.agl > 400 * 0.3048 && inp.flapIndex > 3 && !P.did.gaFlaps) { P.did.gaFlaps = 1; tap('KeyV'); note('flaps 15'); }
        if (st.agl > 1500 * 0.3048 && !P.did.repos) { P.did.repos = 1; tap('Backspace'); note('reposition'); P.phase = 'approach'; P.did.f30 = P.did.gear = P.did.f15 = P.did.arm = 0; }
      }
      mouse(rollIn, pitchIn);
      P.traceStep(st, inp, pitchIn, rollIn, dt);
      requestAnimationFrame(tick);
    }
    P.traceStep = (st, inp, pitchIn, rollIn, dt) => {
      if (!P.lastTrace || st.time - P.lastTrace > 1.0) {
        P.lastTrace = st.time;
        P.trace.push({ t: +st.time.toFixed(1), ph: P.phase, agl: +st.agl.toFixed(1), ias: +st.ias.toFixed(0), vs: +(st.vs / 0.00508).toFixed(0), pitch: +(st.pitch / DEG).toFixed(1), roll: +(st.roll / DEG).toFixed(1), lat: +st.lateralOffset.toFixed(1), thr: +inp.throttle.toFixed(2), n1: +st.n1[0].toFixed(2), flap: st.flapDeg, gear: +st.gearPos.toFixed(1), gsE: +(st.alt - st.gsAltitude - 0).toFixed(0), trim: +st.trim.toFixed(1), pIn: +pitchIn.toFixed(2), rIn: +rollIn.toFixed(2), dt: +dt.toFixed(2) });
      }
    };
    requestAnimationFrame(tick);
    return P;
  };
})();
