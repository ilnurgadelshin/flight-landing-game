// Human-like pilot that runs INSIDE the page and produces only the events a
// person would: mouse moves for the yoke, key presses for everything else, or
// (input: 'touch') touches on the on-screen stick, thrust lever, rudder and buttons, or
// (input: 'tilt') the same touches but pitch and roll by tilting the phone (the simulated
// sensor in test/tilt-pose.browser.js must be loaded and running), or
// (input: 'gamepad') a game controller: stick, triggers and buttons of the simulated controller
// in test/gamepad-stub.browser.js (connected and in use).
// It runs once per rendered frame (like a human reacting to what they see).
// Used by the browser tests and the playtest harness.
//   window.installHumanPilot({ input, noGear, noFlare, noBrakes, stallOnFinal, landLong, goAroundAt, targetOffset, ... })
(function () {
  window.installHumanPilot = function (opts) {
    const o = Object.assign({ input: 'keyboard', noGear: false, noFlare: false, noBrakes: false, stallOnFinal: false, landLong: false, goAroundAt: 0, targetOffset: 0, keepCrab: false, autobrake: 3, useReversers: true }, opts || {});
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const held = new Set();
    const key = (code, on) => {
      if (on && !held.has(code)) { held.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
      if (!on && held.has(code)) { held.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }
    };
    const tapping = new Set();
    const tap = (code, ms = 60) => {
      if (held.has(code) || tapping.has(code)) return;
      tapping.add(code);
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      setTimeout(() => { tapping.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }, ms);
    };
    const mouse = (rollIn, pitchIn) => { const x = W() / 2 + rollIn * W() / 2, y = H() / 2 - pitchIn * H() / 2; window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true })); };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // ---- what the hands do, per control scheme. The keyboard version is the original pilot:
    // W/S held toward a thrust target, A/D held toward a pedal position, R and B held.
    const keyIO = {
      tap: (code) => tap(code),
      stick: (rollIn, pitchIn) => mouse(rollIn, pitchIn),
      thrust: (des, inp) => { key('KeyW', inp.throttle < des - 0.02); key('KeyS', inp.throttle > des + 0.02); },
      idle: () => { key('KeyW', false); key('KeyS', true); },
      hands: () => { key('KeyW', false); key('KeyS', false); },
      decrab: (st) => { key('KeyD', st.crabDeg < -2); key('KeyA', st.crabDeg > 2); },
      steer: (want, have) => { key('KeyD', want > have + 0.06); key('KeyA', want < have - 0.06); },
      pedalsOff: () => { key('KeyA', false); key('KeyD', false); },
      reverse: (on) => key('KeyR', on),
      brake: (on) => key('KeyB', on),
      releaseAll: () => { for (const c of [...held]) key(c, false); },
    };
    // Touch: the same decisions through the on-screen controls, as synthetic touch pointer events on
    // the widgets (the handlers the real touches reach). The thumb stays on the stick while flying.
    const TAPS = { KeyF: 't-flaps-dn', KeyV: 't-flaps-up', KeyG: 't-gear', KeyX: 't-arm', KeyN: 't-autobrake', Space: 't-ext', KeyT: 't-toga', Backspace: 't-reposition' };
    const $ = (id) => document.getElementById(id);
    const pe = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
    const k = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k')) || 1;
    const touch = { stick: null, rudder: null, brake: false };
    const leverDrag = (dy) => { const body = $('t-lever-body'), h = document.querySelector('#t-lever .thandle'); const c = centre(h); pe(body, 'pointerdown', 3, c.x, c.y); pe(body, 'pointermove', 3, c.x, c.y + dy); pe(body, 'pointerup', 3, c.x, c.y + dy); };
    const trackH = () => document.querySelector('#t-lever .ttrack').getBoundingClientRect().height;
    const touchIO = {
      tap: (code) => { const el = $(TAPS[code]); if (!el) return; const c = centre(el); pe(el, 'pointerdown', 7, c.x, c.y); setTimeout(() => pe(el, 'pointerup', 7, c.x, c.y), 60); },
      stick: (rollIn, pitchIn) => {
        const zone = $('t-stick-zone'), R = 56 * k();
        if (!touch.stick) { const b = centre(document.querySelector('#t-stick-zone .tbase')); touch.stick = { x: b.x, y: b.y }; pe(zone, 'pointerdown', 1, b.x, b.y); }
        pe(zone, 'pointermove', 1, touch.stick.x + clamp(rollIn, -1, 1) * R, touch.stick.y - clamp(pitchIn, -1, 1) * R);
      },
      // the lever is moved, not held: small drags toward the thrust wanted, at about the pace a thumb
      // moves a lever (and a little faster than W/S), never a jump
      thrust: (des, inp) => { if (inp.reverse || Math.abs(des - inp.throttle) < 0.02) return; const lim = 0.5 * P.dt; leverDrag(-clamp(des - inp.throttle, -lim, lim) * trackH()); },
      idle: (inp) => { if (inp.reverse || inp.throttle < 0.005) return; const step = Math.min(inp.throttle, 0.5 * P.dt); leverDrag(step >= inp.throttle ? inp.throttle * trackH() + 4 : step * trackH()); },
      hands: () => {},
      decrab: (st) => touchIO.rudderTo(clamp(-st.crabDeg * 0.12, -0.8, 0.8)),
      steer: (want) => touchIO.rudderTo(want),
      pedalsOff: () => touchIO.rudderTo(0),
      rudderTo: (v) => {
        const strip = $('t-rudder'), travel = strip.getBoundingClientRect().width * 0.38;
        if (Math.abs(v) < 0.04) { if (touch.rudder) { pe(strip, 'pointerup', 4, touch.rudder.x, touch.rudder.y); touch.rudder = null; } return; }
        if (!touch.rudder) { const c = centre(strip); touch.rudder = { x: c.x, y: c.y }; pe(strip, 'pointerdown', 4, c.x, c.y); }
        pe(strip, 'pointermove', 4, touch.rudder.x + v * travel, touch.rudder.y);
      },
      // reverse: pull the lever down through the idle gate (it stays there); stow by pushing it back up
      reverse: (on, inp) => {
        const gate = document.querySelector('#t-lever .trev').getBoundingClientRect().height;
        if (on && !inp.reverse && window.__sim.state().onGround) leverDrag(inp.throttle * trackH() + gate + 6);
        if (!on && inp.reverse) leverDrag(-gate);
      },
      brake: (on) => { const b = $('t-brake'); if (on === touch.brake) return; const c = centre(b); pe(b, on ? 'pointerdown' : 'pointerup', 5, c.x, c.y); touch.brake = on; },
      releaseAll: () => {
        if (touch.stick) { pe($('t-stick-zone'), 'pointerup', 1, touch.stick.x, touch.stick.y); touch.stick = null; }
        touchIO.rudderTo(0); touchIO.brake(false);
      },
    };
    // Tilt: pitch and roll are the phone's tilt from where it was held at the start, with a slight
    // hand tremor; everything else is touched as above
    const range = (window.__sim && window.__sim.tiltRange) || { pitch: 20, roll: 25 };
    const tiltIO = Object.assign({}, touchIO, {
      stick: (rollIn, pitchIn) => {
        const t = performance.now() / 1000;
        window.tiltFeed.set({ pull: clamp(pitchIn, -1, 1) * range.pitch + 0.3 * Math.sin(t * 8.1), bank: -clamp(rollIn, -1, 1) * range.roll + 0.3 * Math.sin(t * 6.7 + 1) });
      },
      releaseAll: () => { touchIO.rudderTo(0); touchIO.brake(false); window.tiltFeed.set({ pull: 0, bank: 0 }); },
    });
    // Controller: the same decisions on the simulated controller. Buttons are pressed one at a time and
    // held until the game has read them (2 frames); the stick is pushed a little further to cover its
    // dead zone, as a player's thumb does
    const padIO = (() => {
      const F = window.fakePad, DZ = (window.__sim && window.__sim.padDeadZone) || 0.12, TDZ = 0.05;
      const MAP = { KeyF: 'RB', KeyV: 'LB', KeyG: 'Y', KeyX: 'Right', KeyN: 'Left', Space: 'Right', KeyT: 'View', Backspace: 'View' };
      const queue = [];
      let cur = null;
      const frames = () => window.__sim.stats.frames;
      const trig = (v) => (v <= 0 ? 0 : TDZ + Math.min(1, v) * (1 - TDZ));
      const io = {
        pump: () => {
          const now = performance.now();
          if (cur && cur.releasedAt === null && frames() - cur.f0 >= (cur.hold > 0 ? 4 : 2) && now - cur.t0 >= cur.hold) { F.release(cur.btn); cur.releasedAt = frames(); }
          else if (cur && cur.releasedAt !== null && frames() - cur.releasedAt >= 2) cur = null;
          if (!cur && queue.length) { const q = queue.shift(); cur = { btn: q.btn, hold: q.hold, f0: frames(), t0: now, releasedAt: null }; F.press(q.btn); }
        },
        tap: (code, hold) => { if (MAP[code]) queue.push({ btn: MAP[code], hold: hold !== undefined ? hold : (code === 'Space' ? 1500 : 0) }); },
        stick: (rollIn, pitchIn) => {
          let x = clamp(rollIn, -1, 1), y = -clamp(pitchIn, -1, 1);
          const m = Math.hypot(x, y);
          if (m > 1e-6) { const k = (DZ + Math.min(1, m) * (1 - DZ)) / m; x *= k; y *= k; } else { x = 0; y = 0; }
          F.stick('left', x, y);
        },
        thrust: (des, inp) => { const up = inp.throttle < des - 0.02, down = inp.throttle > des + 0.02; F.set('A', up ? 1 : 0); F.set('B', down ? 1 : 0); },
        idle: (inp) => { if (!(cur && cur.btn === 'A')) F.set('A', 0); F.set('B', inp.throttle > 0.005 ? 1 : 0); },   // a queued A (stowing the reversers) is left pressed
        hands: () => { F.set('A', 0); F.set('B', 0); },
        rudderTo: (v) => { F.set('LT', trig(-v)); F.set('RT', trig(v)); },
        decrab: (st) => io.rudderTo(clamp(-st.crabDeg * 0.12, -0.8, 0.8)),
        steer: (want) => io.rudderTo(want),
        pedalsOff: () => io.rudderTo(0),
        // reverse: keep B held at idle on the ground until it is selected; stow with a press of A
        reverse: (on, inp) => {
          if (on && !inp.reverse && window.__sim.state().onGround && inp.throttle <= 0.005) F.set('B', 1);
          if (!on && inp.reverse && !queue.some((q) => q.btn === 'A') && !(cur && cur.btn === 'A')) queue.push({ btn: 'A', hold: 0 });
        },
        brake: (on) => F.set('X', on ? 1 : 0),
        releaseAll: () => { F.set('A', 0); F.set('B', 0); F.set('X', 0); io.rudderTo(0); F.stick('left', 0, 0); },
      };
      return io;
    })();
    const IO = o.input === 'gamepad' ? padIO : o.input === 'tilt' ? tiltIO : o.input === 'touch' ? touchIO : keyIO;
    const DEG = Math.PI / 180, NM = 1852;
    const P = { phase: 'approach', prevLat: null, flareT: 0, flarePitch0: 0, flareVs0: -3.7, last: performance.now(), iVs: 0, iSpd: 0, did: {}, log: [], gaT: 0, stopped: false, trace: [] };
    window.__pilot = P;
    const note = (m) => { const st = window.__sim.state(); P.log.push({ t: st.time, m }); };
    const config = (st, inp) => {
      const d = st.distToThreshold;
      if (d < 14 * NM && inp.flapIndex < 2 && !P.did.f5) { P.did.f5 = 1; IO.tap('KeyF'); note('flaps 5'); }
      if (d < 8.5 * NM && inp.flapIndex < 3 && st.ias < 195 && !P.did.f15) { P.did.f15 = 1; IO.tap('KeyF'); note('flaps 15'); }
      if (d < 7.2 * NM && !inp.gearDown && !o.noGear && st.ias < 190 && !P.did.gear) { P.did.gear = 1; IO.tap('KeyG'); note('gear down'); }
      if (d < 6.2 * NM && inp.flapIndex < 4 && st.ias < 170 && !P.did.f30) { P.did.f30 = 1; IO.tap('KeyF'); note('flaps 30'); }
      if (d < 5.5 * NM && !inp.speedbrakeArmed && st.speedbrake < 0.1 && !P.did.arm) { P.did.arm = 1; IO.tap('KeyX'); note('speedbrake armed'); }
      // fast on the way down with little flap: use the speedbrakes in flight, stow them once the speed is back
      if (d > 6 * NM && st.agl > 1500 * 0.3048) {
        const tgt = (inp.flapIndex >= 3 ? 165 : inp.flapIndex >= 2 ? 175 : 210) + o.targetOffset;
        if (st.ias > tgt + 15 && inp.speedbrake < 0.5 && !P.sbOut) { P.sbOut = 1; IO.tap('Space'); note('speedbrakes out (fast)'); }
        if (st.ias < tgt + 4 && P.sbOut) { P.sbOut = 0; IO.tap('Space'); note('speedbrakes in'); }
      } else if (P.sbOut) { P.sbOut = 0; IO.tap('Space'); note('speedbrakes in'); }
      if (d < 5.5 * NM && inp.autobrake === 0 && !P.did.ab) { P.did.ab = 1; for (let i = 0; i < o.autobrake; i++) setTimeout(() => IO.tap('KeyN'), i * 250); note('autobrake ' + o.autobrake); }
    };
    function tick() {
      const now = performance.now(); const dt = Math.min(0.25, (now - P.last) / 1000); P.last = now; P.dt = dt * (window.__sim.game.sim.timeScale || 1);
      const g = window.__sim.game; const st = window.__sim.state(); const inp = window.__sim.input();
      if (IO.pump) IO.pump();
      if (g.state !== 'flying') { IO.releaseAll(); if (g.state === 'finished') { P.stopped = true; return; } requestAnimationFrame(tick); return; }
      // a person who sees "click to engage" on the HUD clicks the window again
      if (IO === keyIO && !window.__sim.inputManager.mouseEngaged) { const cv = document.querySelector('canvas'); cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: W() / 2, clientY: H() / 2, bubbles: true })); cv.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: W() / 2, clientY: H() / 2, bubbles: true })); note('yoke re-engaged'); }
      let pitchIn = 0, rollIn = 0;
      const drift = P.prevLat === null ? 0 : (st.lateralOffset - P.prevLat) / Math.max(dt, 0.001); P.prevLat = st.lateralOffset;
      const targetIas = () => { const fi = inp.flapIndex; return (fi >= 4 ? st.vref + 5 : fi >= 3 ? 165 : fi >= 2 ? 175 : 210) + o.targetOffset; };
      const speedHold = (target) => {
        P.iSpd = clamp(P.iSpd + (target - st.ias) * dt * 0.004, -0.2, 0.2);
        const accel = P.prevIas === undefined ? 0 : (st.ias - P.prevIas) / Math.max(dt, 0.001); P.prevIas = st.ias;
        const thrDes = clamp(0.55 + (target - st.ias) * 0.018 + P.iSpd - accel * 0.2, 0.05, 0.95);
        IO.thrust(thrDes, inp);
      };
      const lateral = (limitDeg) => {
        const bankCmd = clamp(-(st.lateralOffset * 0.25 + drift * 2.0), -limitDeg, limitDeg) * DEG;
        return clamp((bankCmd - st.roll) * 3.0 - st.p * 0.8, -1, 1);
      };
      if (P.phase === 'approach') {
        config(st, inp);
        if (o.goAroundAt && st.agl < o.goAroundAt * 0.3048 && !P.did.ga) { P.did.ga = 1; P.phase = 'goaround'; P.gaT = 0; IO.tap('KeyT'); note('go-around: TOGA'); }
        // vertical: fly the glideslope (intercept from below), else hold altitude until the GS comes down
        let vsT;
        const gsErr = st.alt - st.gsAltitude;      // + above
        if (gsErr < -40 && st.distToThreshold > 4000) vsT = 0;
        else if (st.agl < 60) vsT = -st.groundSpeed * Math.tan(3 * DEG);   // below 200 ft: visual, hold the 3 deg path, do not chase the beam
        else vsT = -st.groundSpeed * Math.tan(3 * DEG) - clamp(gsErr * 0.12, -3, 3);
        if (o.stallOnFinal && st.agl < 250) { IO.idle(inp); pitchIn = 0.9; rollIn = lateral(8); IO.stick(rollIn, pitchIn); P.traceStep(st, inp, pitchIn, rollIn, dt); requestAnimationFrame(tick); return; }
        // fly pitch attitude (inner loop) and nudge it for the vertical speed (outer loop), like a trained pilot:
        // small, smooth inputs instead of chasing the VS needle
        const err = vsT - st.vs;
        // a firm attitude loop (the mouse curve squashes small inputs) under a slow path correction
        if (P.thetaRef === undefined) P.thetaRef = st.pitch;
        P.thetaRef = clamp(P.thetaRef + err * dt * 0.08 * DEG, -5 * DEG, 8 * DEG);
        const thetaCmd = P.thetaRef + clamp(err * 0.6, -2.5, 2.5) * DEG;
        pitchIn = clamp((thetaCmd - st.pitch) * 12.0 - st.q * 3.0, -0.4, 0.4);
        rollIn = lateral(st.agl < 60 ? 6 : 12);
        speedHold(targetIas());
        const flareH = 9.5 * clamp(Math.abs(st.vs) / 3.7, 0.9, 1.35);
        if (st.agl < flareH && !o.noFlare) { P.phase = 'flare'; P.flareT = 0; P.flarePitch0 = st.pitch; P.flareVs0 = st.vs; P.bias = clamp(pitchIn, -0.3, 0.3); note('flare'); }
        if (o.noFlare && st.onGround) { P.phase = 'rollout'; note('touchdown (no flare)'); }
      } else if (P.phase === 'flare') {
        P.flareT += dt;
        IO.idle(inp);
        // a deliberately long landing: hold the aircraft a metre or two off the runway well past the touchdown zone
        const holdOff = o.landLong && st.distFromThreshold < 1300;
        const vsT = holdOff ? (st.agl > 1.5 ? -0.3 : 0) : -Math.min(0.6 + st.agl * 0.42, Math.abs(P.flareVs0));
        const corr = clamp((vsT - st.vs) * 1.1, -3, 3) * DEG;
        const ff = 3.0 * clamp(Math.abs(P.flareVs0) / 3.7, 0.9, 1.4);
        const target = Math.min(P.flarePitch0 + Math.min(P.flareT / 1.5, 1) * ff * DEG + corr, 6 * DEG);
        pitchIn = clamp((target - st.pitch) * 8 - st.q * 1.5 + 0.08 + P.bias, -0.3, 0.7);
        const bankCmd = o.keepCrab ? 0 : clamp((st.crosswind * 0.24 - st.lateralOffset * 0.4 - drift * 1.4) * DEG, -5 * DEG, 5 * DEG);
        rollIn = clamp((bankCmd - st.roll) * 2.5 - st.p * 1.2, -1, 1);
        if (!o.keepCrab) IO.decrab(st);
        // the decrab rudder is let go at touchdown; the roll-out is steered with taps
        if (st.onGround && st.mainsOnGround) { P.phase = 'rollout'; IO.pedalsOff(); note('touchdown'); }
      } else if (P.phase === 'rollout') {
        IO.idle(inp);
        IO.reverse(o.useReversers && st.groundSpeed > 30 * 0.5144, inp); IO.brake(!o.noBrakes && (inp.autobrake === 0 || st.groundSpeed < 25));
        pitchIn = st.groundSpeed > 30 ? -0.1 : 0; rollIn = clamp(-st.roll * 3, -1, 1);
        // roll-out: decide the pedal position wanted (heading error, yaw rate, lateral offset) and
        // hold or release A / D to move the keyboard rudder axis toward it, as a keyboard player does
        const rDeg = st.r / DEG;
        const want = clamp(-st.crabDeg * 0.15 - rDeg * 0.12 - st.lateralOffset * 0.015 - drift * 0.05, -1, 1);
        const have = inp.yaw || 0;
        IO.steer(want, have);
      } else if (P.phase === 'goaround') {
        P.gaT += dt;
        IO.hands();
        pitchIn = clamp((12 * DEG - st.pitch) * 4 - st.q * 2, -1, 1);
        rollIn = clamp(-st.roll * 3, -1, 1);
        if (st.vs > 2 && inp.gearDown && !P.did.gaGear) { P.did.gaGear = 1; IO.tap('KeyG'); note('gear up'); }
        if (st.agl > 400 * 0.3048 && inp.flapIndex > 3 && !P.did.gaFlaps) { P.did.gaFlaps = 1; IO.tap('KeyV'); note('flaps 15'); }
        if (st.agl > 1500 * 0.3048 && !P.did.repos) { P.did.repos = 1; IO.tap('Backspace'); note('reposition'); P.phase = 'approach'; P.did.f30 = P.did.gear = P.did.f15 = P.did.arm = 0; }
      }
      IO.stick(rollIn, pitchIn);
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
