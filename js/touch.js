// On-screen controls for phones and tablets in landscape, built from page elements on
// pointer events so several thumbs work at once (each control captures its own touch):
//   right thumb  a floating flight stick: it appears under the thumb and springs back to centre
//   left thumb   the thrust lever, which stays where it is left, with TO/GA on its handle and a
//                reverse position below idle on the ground, and a spring-return rudder strip
//   buttons      gear, flaps −/+, speedbrake arm/extend, autobrake, view, pause, help, plus
//                BRAKE (hold) on the ground and REPOSITION after a go-around
// With tilt steering on (body.tilt), the stick's circle shows the tilt instead and a CENTER button
// makes the way the phone is held now level.
// The buttons emit the same actions as the keys; the axes go to InputManager.touch.
import { AIRCRAFT as AC } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } };
const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k')) || 1;

const MARKUP = `
  <div id="t-config">
    <div id="t-gear" class="tbtn" role="button"><b>DN</b><small>GEAR</small></div>
    <div id="t-autobrake" class="tbtn" role="button"><b>OFF</b><small>A/BRK</small></div>
    <div id="t-flaps" class="tstep">
      <div id="t-flaps-up" class="tbtn" role="button" aria-label="Flaps up"><b>−</b></div>
      <div class="tread"><b id="t-flaps-val">0</b><small>FLAPS</small></div>
      <div id="t-flaps-dn" class="tbtn" role="button" aria-label="Flaps down"><b>+</b></div>
    </div>
    <div id="t-spd" class="tpair">
      <div id="t-arm" class="tbtn" role="button"><b>ARM</b><small>SPD BRK</small></div>
      <div id="t-ext" class="tbtn" role="button"><b>EXT</b><small>SPD BRK</small></div>
    </div>
  </div>
  <div id="t-lever">
    <div id="t-toga" class="tbtn" role="button"><b>TO/GA</b></div>
    <div id="t-lever-body">
      <span class="tmark max">MAX</span><span class="tmark idle">IDLE</span>
      <div class="ttrack"><div class="tfill"></div><div class="thandle"><b>0</b></div></div>
      <div class="trev">REV</div>
    </div>
  </div>
  <div id="t-rudder"><span>◀ RUDDER ▶</span><div class="tknob"></div></div>
  <div id="t-stick-zone"><div class="tbase"><div class="tknob"></div></div><span class="tlabel">STICK</span></div>
  <div id="t-sys">
    <div id="t-view" class="tbtn" role="button"><b>VIEW</b></div>
    <div id="t-pause" class="tbtn" role="button" aria-label="Pause"><b>❚❚</b></div>
    <div id="t-help" class="tbtn" role="button" aria-label="Flight School"><b>?</b></div>
  </div>
  <div id="t-reposition" class="tbtn wide hidden" role="button"><b>REPOSITION</b><small>back on final</small></div>
  <div id="t-brake" class="tbtn hidden" role="button"><b>BRAKE</b><small>hold</small></div>
  <div id="t-center" class="tbtn" role="button"><b>CENTER</b><small>tilt</small></div>`;

export class TouchControls {
  constructor(input, parent, haptics = null) {
    this.input = input;
    this.haptics = haptics;
    this.onCenter = null;              // tilt: make the way the phone is held now level
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = MARKUP;
    parent.appendChild(this.root);
    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      gear: $('t-gear'), autobrake: $('t-autobrake'), flapsUp: $('t-flaps-up'), flapsDn: $('t-flaps-dn'), flapsVal: $('t-flaps-val'), flaps: $('t-flaps'),
      arm: $('t-arm'), ext: $('t-ext'), toga: $('t-toga'), lever: $('t-lever'), leverBody: $('t-lever-body'),
      track: this.root.querySelector('.ttrack'), fill: this.root.querySelector('.tfill'), handle: this.root.querySelector('.thandle'), rev: this.root.querySelector('.trev'),
      rudder: $('t-rudder'), rudderKnob: this.root.querySelector('#t-rudder .tknob'),
      zone: $('t-stick-zone'), base: this.root.querySelector('.tbase'), knob: this.root.querySelector('.tbase .tknob'),
      view: $('t-view'), pause: $('t-pause'), help: $('t-help'), reposition: $('t-reposition'), brake: $('t-brake'),
      center: $('t-center'), stickLabel: this.root.querySelector('#t-stick-zone .tlabel'),
    };
    // last rendered text / classes, so a frame only touches what changed (the context buttons start hidden)
    this.shown = { reposition: 'hidden', brakeBtn: 'hidden' };
    this.state = { onGround: false, throttle: 0, reverse: false };
    const emit = (name) => () => input.emit(name);
    this.tap(this.el.gear, emit('gear'));
    this.tap(this.el.autobrake, emit('autobrake'));
    this.tap(this.el.flapsUp, emit('flapsUp'));
    this.tap(this.el.flapsDn, emit('flapsDown'));
    this.tap(this.el.arm, emit('armSpeedbrake'));
    this.tap(this.el.ext, emit('speedbrake'));
    this.tap(this.el.toga, emit('toga'));
    this.tap(this.el.pause, emit('pause'));
    this.tap(this.el.help, emit('help'));
    this.tap(this.el.reposition, emit('reposition'));
    this.tap(this.el.view, () => { input.look.down = !input.look.down; });
    this.tap(this.el.center, () => { if (this.onCenter) this.onCenter(); });
    this.hold(this.el.brake, (on) => { input.touch.brake = on; });
    this.bindStick();
    this.bindRudder();
    this.bindLever();
    this.bindLook(input.canvas);
  }

  // ------------------------------------------------------------------ buttons
  /** Fires on release over the button (with a little slack), so a thumb sliding off cancels it. */
  tap(el, fn) {
    let id = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (id !== null) return; id = e.pointerId; capture(el, e); el.classList.add('down'); this.buzz(); });
    const end = (e, fire) => {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('down');
      if (!fire) return;
      const r = el.getBoundingClientRect(), s = 12;
      if (e.clientX >= r.left - s && e.clientX <= r.right + s && e.clientY >= r.top - s && e.clientY <= r.bottom + s) fn();
    };
    el.addEventListener('pointerup', (e) => end(e, true));
    el.addEventListener('pointercancel', (e) => end(e, false));
  }

  /** Active while pressed. */
  hold(el, fn) {
    let id = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (id !== null) return; id = e.pointerId; capture(el, e); el.classList.add('down'); this.buzz(); fn(true); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('down'); fn(false); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  buzz() { if (this.haptics) this.haptics.tick(); }

  // ------------------------------------------------------------------ flight stick
  bindStick() {
    const { zone, base, knob } = this.el, T = this.input.touch;
    let id = null, ox = 0, oy = 0, radius = 56;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; capture(zone, e);
      radius = 56 * scale();
      const zr = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      base.style.left = `${ox - zr.left}px`; base.style.top = `${oy - zr.top}px`;   // the stick appears under the thumb
      knob.style.transform = '';
      zone.classList.add('active');
      T.stickHeld = true; T.pitch = 0; T.roll = 0;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const m = Math.hypot(dx, dy);
      if (m > radius) { dx *= radius / m; dy *= radius / m; }
      knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      T.roll = dx / radius; T.pitch = -dy / radius;                 // stick up = +pitch (nose up unless pilot-style)
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      zone.classList.remove('active');
      base.style.left = ''; base.style.top = ''; knob.style.transform = '';
      T.stickHeld = false; T.pitch = 0; T.roll = 0;                  // the axes ramp back to centre in InputManager
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  // ------------------------------------------------------------------ rudder
  bindRudder() {
    const { rudder, rudderKnob } = this.el, T = this.input.touch;
    let id = null, ox = 0, travel = 60;
    rudder.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; capture(rudder, e);
      ox = e.clientX; travel = rudder.getBoundingClientRect().width * 0.38;
      rudder.classList.add('active');
      T.rudderHeld = true; T.yaw = 0;
    });
    rudder.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      T.yaw = clamp((e.clientX - ox) / travel, -1, 1);
      rudderKnob.style.transform = `translateX(${(T.yaw * travel).toFixed(1)}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; rudder.classList.remove('active');
      rudderKnob.style.transform = '';
      T.rudderHeld = false; T.yaw = 0;
    };
    rudder.addEventListener('pointerup', end);
    rudder.addEventListener('pointercancel', end);
    rudder.addEventListener('lostpointercapture', end);
  }

  // ------------------------------------------------------------------ thrust lever
  // Dragged, not tapped: the lever moves by the thumb's travel from wherever it was, so a touch
  // never jumps the thrust. Below idle is a gate: on the ground, pulling past it selects reverse,
  // which stays selected (like the real reverse levers) until the lever is pushed back up.
  bindLever() {
    const { leverBody, track, rev } = this.el, T = this.input.touch;
    let id = null, y0 = 0, p0 = 0, h = 100, gate = 0.3;
    leverBody.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; capture(leverBody, e);
      h = Math.max(40, track.getBoundingClientRect().height);
      gate = rev.getBoundingClientRect().height / h;
      y0 = e.clientY;
      p0 = this.state.reverse ? -gate : this.state.throttle;
      T.leverHeld = true;
      this.el.lever.classList.add('active');
    });
    leverBody.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let p = p0 - (e.clientY - y0) / h;
      const wasRev = T.reverse;
      if (p < 0) {
        if (!this.state.onGround && !T.reverse) p = 0;          // the reverse gate only opens on the ground
        else if (p < -gate * 0.8) T.reverse = true;
      }
      if (T.reverse && p > -gate * 0.3) T.reverse = false;       // pushed back up out of REV: stowed
      if (T.reverse !== wasRev && this.haptics) this.haptics.gate();
      T.throttle = clamp(p, 0, 1);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; T.leverHeld = false;
      this.el.lever.classList.remove('active');
    };
    leverBody.addEventListener('pointerup', end);
    leverBody.addEventListener('pointercancel', end);
    leverBody.addEventListener('lostpointercapture', end);
  }

  // ------------------------------------------------------------------ look around
  /** A drag on the open windshield looks around; letting go looks ahead again. */
  bindLook(canvas) {
    const look = this.input.look;
    let id = null, x0 = 0, y0 = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.input.touchMode || !this.input.enabled || id !== null) return;
      e.preventDefault();               // also stops the compatibility mouse events
      id = e.pointerId; capture(canvas, e); x0 = e.clientX; y0 = e.clientY;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      look.yaw = clamp(-(e.clientX - x0) * 0.006, -1.6, 1.6);
      look.pitch = clamp(-(e.clientY - y0) * 0.006, -1.0, 0.6);
    });
    const end = (e) => { if (e.pointerId !== id) return; id = null; look.yaw = 0; look.pitch = 0; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ per frame
  /** Show the aircraft's state on the controls (the lever follows TO/GA, the keys and the demo). */
  sync(st, inp, ctx = {}) {
    const s = this.state;
    s.onGround = st.onGround; s.throttle = inp.throttle; s.reverse = !!inp.reverse;
    const gearTxt = inp.gearDown ? (st.gearDown ? 'DN' : 'TRN') : (st.gearInTransit ? 'TRN' : 'UP');
    this.show('gear', gearTxt, st.gearCollapsed ? 'bad' : (gearTxt === 'DN' ? 'good' : (gearTxt === 'TRN' ? 'warn' : '')));
    this.show('autobrake', ['OFF', '1', '2', '3', 'MAX'][inp.autobrake] || 'OFF', inp.autobrake > 0 ? 'good' : '');
    const detent = AC.flapDetents[inp.flapIndex];
    this.text(this.el.flapsVal, 'flapsVal', String(detent));
    this.cls(this.el.flaps, 'flaps', Math.abs(st.flapDeg - detent) > 0.3 ? 'warn' : '');
    this.cls(this.el.arm, 'arm', inp.speedbrakeArmed ? 'on' : '');
    this.cls(this.el.ext, 'ext', st.speedbrake > 0.05 ? 'on' : '');
    this.cls(this.el.view, 'view', this.input.look.down ? 'on' : '');
    this.cls(this.el.reposition, 'reposition', ctx.gaMode ? '' : 'hidden');
    this.cls(this.el.brake, 'brakeBtn', st.onGround ? (this.input.touch.brake ? 'down' : '') : 'hidden');
    // thrust lever
    const pct = Math.round(inp.throttle * 100);
    this.text(this.el.handle.firstChild, 'handle', s.reverse ? 'REV' : String(pct));
    // tilt steering: the stick's circle shows how far the phone is tilted from level
    const tl = this.input.tilt, tilting = document.body.classList.contains('tilt');
    this.text(this.el.stickLabel, 'stickLabel', tilting ? (tl.active ? 'TILT' : 'TILT — hold level') : 'STICK');
    if (tilting) {
      const R = 56 * scale();
      const tr = tl.active ? `translate(${(tl.roll * R).toFixed(1)}px, ${(-tl.pitch * R).toFixed(1)}px)` : '';
      if (this.shown.tiltKnob !== tr) { this.shown.tiltKnob = tr; this.el.knob.style.transform = tr; }
    } else if (this.shown.tiltKnob) { this.shown.tiltKnob = ''; if (!this.input.touch.stickHeld) this.el.knob.style.transform = ''; }
    const pos = s.reverse ? 0 : inp.throttle;
    if (this.shown.leverPos !== pos) { this.shown.leverPos = pos; this.el.handle.style.bottom = `${(pos * 100).toFixed(1)}%`; this.el.fill.style.height = `${(pos * 100).toFixed(1)}%`; }
    this.cls(this.el.lever, 'leverState', (s.reverse ? 'rev ' : '') + (st.onGround ? 'ground' : ''));
  }

  show(name, txt, cls) { const e = this.el[name]; this.text(e.firstChild, name + 'T', txt); this.cls(e, name + 'C', cls); }
  text(e, key, txt) { if (this.shown[key] !== txt) { this.shown[key] = txt; e.textContent = txt; } }
  cls(e, key, c) {
    if (this.shown[key] === c) return;
    const prev = this.shown[key];
    if (prev) for (const x of prev.split(' ')) if (x) e.classList.remove(x);
    if (c) for (const x of c.split(' ')) if (x) e.classList.add(x);
    this.shown[key] = c;
  }
}
