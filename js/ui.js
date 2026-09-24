// DOM user interface: main menu, HUD readouts, Flight School onboarding,
// pause and results screens.
import { SCENARIOS, APPROACH_STARTS, AIRCRAFT as AC, FT, KTS, DEG } from './config.js';
import { fmtOutcome } from './evaluate.js';
import { controlsHtml, controlsText, getScheme, onSchemeChange, tiltWording, padWording } from './controls.js';

const $ = (id) => document.getElementById(id);

// Flight School pages. [[name]] tokens render as the active scheme's controls (js/controls.js);
// `touch` overrides the anchor (a page element instead of a 3D cockpit part), the camera look
// and, where the phone layout differs (head-up display instead of the panel), the text;
// `touch.tiltBody` is the text when steering by tilting the phone.
export const SCHOOL_STEPS = [
  { title: 'Welcome aboard', anchor: 'windshield', touch: { anchor: '#hgs' },
    body: `You are in the captain's seat of a Boeing 737-800 on final approach to runway 27. Your job: fly the ILS down the 3° glideslope at <b>Vref + 5 = 147 kts</b>, flare at 30 ft, touch down in the touchdown zone and stop.<ul><li>[[flyWith]]</li><li>Press [[help]] any time to reopen this school.</li></ul>` },
  { title: 'Artificial horizon (attitude)', anchor: 'attitude',
    body: `The blue/brown ball shows pitch and bank. Keep the wings level and the nose about <b>+2°</b> on approach.<ul><li>[[pitch]]: pitch (nose up/down)</li><li>[[roll]]: roll (bank)</li></ul>The aircraft is heavy: make small, smooth inputs and wait for it to respond.`,
    touch: { title: 'Attitude and the stick', tiltTitle: 'Attitude and tilt steering', anchor: '#t-stick-zone',
      body: `Keep the wings level with the horizon outside and the nose about <b>+2°</b> on approach ([[look]] shows the panel's attitude display).<ul><li>[[pitch]]: pitch (nose up/down)</li><li>[[roll]]: roll (bank)</li></ul>The stick appears where your right thumb touches. Let go and it springs back: the aircraft holds its attitude and trims itself. It is heavy: make small, smooth inputs and wait for it to respond.`,
      tiltBody: `Keep the wings level with the horizon outside and the nose about <b>+2°</b> on approach ([[look]] shows the panel's attitude display).<ul><li>[[pitch]]: pitch (nose up/down)</li><li>[[roll]]: roll (bank)</li></ul>The way you hold the phone when the flight starts is level flight, and the circle shows your tilt from it. [[center]] makes the way you hold it now level. Back at level, the aircraft holds its attitude and trims itself. It is heavy: make small, smooth movements and wait for it to respond.` } },
  { title: 'Airspeed tape', anchor: 'airspeed',
    body: `Speed in knots. The green <b>REF</b> bug is Vref (142 kts with flaps 30). The red barber pole at the bottom is the stall; the red one at the top is the flap limit.<ul><li>[[thrust]]: throttle up / down. Thrust controls your speed on approach — about <b>60 % N1</b> holds Vref+5.</li><li>In gusts the needle jumps: don't chase it. Hold the thrust and correct only a steady trend, with small changes.</li></ul>`,
    touch: { title: 'Airspeed', anchor: '#g-spd',
      body: `Speed in knots, in the left box of the head-up display. Below it: the target <b>REF+5</b> (Vref + 5 = 147 kts with flaps 30) and the engines' N1. With landing flaps the box turns green on target and amber when fast or slow; it turns red at the stall.<ul><li>[[thrust]]: thrust controls your speed on approach — about <b>60 % N1</b> holds Vref+5.</li><li>In gusts the speed jumps: don't chase it. Hold the thrust and correct only a steady trend, with small changes.</li></ul>` } },
  { title: 'Altimeter & vertical speed', anchor: 'altimeter',
    body: `Barometric altitude in feet with the radio altitude below the horizon under 2500 ft. The vertical-speed needle on the right should sit near <b>−750 fpm</b> on the glideslope.<ul><li>Pitch controls the descent rate. High on the glideslope → lower the nose a little; low → raise it.</li></ul>`,
    touch: { anchor: '#g-alt',
      body: `Altitude in feet (right box), the radio altitude (height above the ground) below 2500 ft, and the vertical speed: about <b>−750 fpm</b> on the glideslope.<ul><li>Pitch controls the descent rate. High on the glideslope → lower the nose a little; low → raise it.</li></ul>` } },
  { title: 'ILS: localizer & glideslope', anchor: 'nd',
    body: `The magenta diamonds on the PFD show your position relative to the runway centreline (bottom) and the 3° glideslope (right). Keep both centred. The navigation display shows the extended centreline and your track.<ul><li>Follow the <b>PAPI</b> lights left of the runway: 2 white + 2 red = on slope, more white = high, more red = low.</li></ul>`,
    touch: { anchor: '#hgs',
      body: `The magenta diamonds show where the runway centreline (bottom scale) and the 3° glideslope (right scale) are. Steer towards them to centre them: diamond below the middle → you are high, lower the nose a little; diamond left → bank left a little.<ul><li>Follow the <b>PAPI</b> lights left of the runway: 2 white + 2 red = on slope, more white = high, more red = low.</li></ul>` } },
  { title: 'Rudder — essential in a crosswind', anchor: 'rudder', look: 1, touch: { anchor: '#t-rudder' },
    body: `In a crosswind you fly "crabbed" into the wind. Just before touchdown, press the rudder to align the nose with the runway and lower the upwind wing slightly.<ul><li>[[rudder]]: left / right rudder. On the ground it also steers the nose wheel.</li></ul>` },
  { title: 'Thrust levers', anchor: 'throttle', look: 1,
    body: `Two thrust levers on the pedestal ([[look]] to look down). N1 is shown on the engine display.<ul><li>[[thrust]]: move the levers</li><li>[[toga]]: TOGA — full thrust for a go-around</li><li>Engines take a few seconds to spool up: anticipate!</li></ul>`,
    touch: { title: 'Thrust lever', anchor: '#t-lever',
      body: `The thrust lever on the left edge stays where you leave it: drag it with your left thumb (the number is the thrust in %). N1 is shown under your speed.<ul><li>[[toga]] on top of the lever: full thrust for a go-around</li><li>On the ground, pull it down past idle into <span class="tc">REV</span> for reverse thrust</li><li>Engines take a few seconds to spool up: anticipate!</li></ul>` } },
  { title: 'Flaps', anchor: 'flapLever', look: 1,
    body: `Flaps add lift for slow flight. Extend them step by step as you slow down: flaps 5 by 190 kts, flaps 15 by 170, <b>flaps 30 for landing</b> below 165 kts.<ul><li>[[flapsDown]]: extend one notch · [[flapsUp]]: retract one notch</li><li>The gauge next to the gear lever shows the actual position.</li></ul>`,
    touch: { anchor: '#t-flaps',
      body: `Flaps add lift for slow flight. Extend them step by step as you slow down: flaps 5 by 190 kts, flaps 15 by 170, <b>flaps 30 for landing</b> below 165 kts.<ul><li>[[flapsDown]]: extend one notch · [[flapsUp]]: retract one notch</li><li>The number between them is the setting; it turns amber while the flaps move.</li></ul>` } },
  { title: 'Landing gear', anchor: 'gear', look: 0.45,
    body: `Lower the gear when you intercept the glideslope (about 2000 ft). It takes ~8 s and adds drag — three green lights mean down and locked.<ul><li>[[gear]]: gear up / down</li><li>Landing without gear = belly landing. The warning system will shout at you.</li></ul>`,
    touch: { anchor: '#t-gear',
      body: `Lower the gear when you intercept the glideslope (about 2000 ft). It takes ~8 s and adds drag — the button shows a green <b>DN</b> when it is down and locked.<ul><li>[[gear]]: gear up / down</li><li>Landing without gear = belly landing. The warning system will shout at you.</li></ul>` } },
  { title: 'Speedbrakes / spoilers', anchor: 'speedbrake', look: 1, touch: { anchor: '#t-spd' },
    body: `The speedbrake lever raises spoilers on the wing. In flight they add drag (use them if you are high and fast). On the ground they dump the lift so the brakes can work.<ul><li>[[armSpeedbrake]]: <b>arm</b> them before landing — they deploy automatically at touchdown</li><li>[[speedbrake]]: extend / retract manually</li></ul>` },
  { title: 'Brakes & thrust reversers', anchor: 'lower', look: 0.45, touch: { anchor: '#t-lever' },
    body: `After touchdown: hold the reversers, then brake. Reversers only work on the ground.<ul><li>[[reverse]]: reverse thrust — stow below 60 kts</li><li>[[brakes]] (hold): wheel brakes</li><li>[[autobrake]]: autobrake OFF / 1 / 2 / 3 / MAX (set 3 for a wet runway)</li></ul>` },
  { title: 'Trim & go-around', anchor: 'trim', look: 1, touch: { anchor: '#t-toga' },
    body: `The trim wheels relieve the control force so the aircraft holds its attitude hands-off.<ul><li>[[trim]]</li></ul>If the approach is not stable below 500 ft: <b>go around</b>. Press [[toga]] for full thrust, pitch up to +12°, gear up when climbing, flaps 15. Then press [[reposition]] to reposition on final, or fly a visual circuit.` },
  { title: 'Landing criteria', anchor: 'pfd', touch: { anchor: '#hgs' },
    body: `You will be graded on:<ul><li><b>Touchdown zone</b>: 150–900 m past the threshold (aim for the big white blocks)</li><li><b>Sink rate</b> under 300 fpm is smooth; over 600 fpm is a hard landing; 900+ collapses the gear</li><li><b>Centreline</b> and <b>alignment</b> (less than 3° crab, wings level)</li><li><b>Speed</b> near Vref, <b>flaps 30</b> and gear down</li><li>Stop before the end of the runway</li></ul>Callouts: "Fifty, forty, thirty, twenty, ten" — start the flare at <b>thirty</b>.<br>[[view]] steps through the views to the <b>head-up view</b>: no flight deck, and a head-up display in the windshield. Keep its flight path marker (the circle with wings) on the touchdown zone. Good luck, Captain.` },
];

/** A school page as the active control scheme shows it. */
export function schoolPage(s) {
  const touch = getScheme() === 'touch' ? (s.touch || {}) : {};
  if (padWording()) {
    // a controller in use: the standard pages in the controller's words; on a phone the head-up
    // display pages still point at the head-up display (the touch controls are hidden)
    const hud = touch.anchor && /^#(hgs|g-)/.test(touch.anchor);
    return { title: (hud && touch.title) || s.title, anchor: hud ? touch.anchor : s.anchor, look: hud ? 0 : (s.look || 0), body: controlsHtml((hud && touch.body) || s.body) };
  }
  const t = touch;
  const body = (tiltWording() && t.tiltBody) || t.body || s.body;
  return { title: (tiltWording() && t.tiltTitle) || t.title || s.title, anchor: t.anchor || s.anchor, look: t.anchor ? (t.look || 0) : (s.look || 0), body: controlsHtml(body) };
}

export class UI {
  constructor() {
    this.el = {
      menu: $('menu'), hud: $('hud'), school: $('school'), pause: $('pause'), results: $('results'), loading: $('loading'),
      modeMsg: $('mode-msg'), instructor: $('instructor'), caption: $('gpws-caption'), checklist: $('checklist'),
      stall: $('alert-stall'), config: $('alert-config'), crashFlash: $('crash-flash'), rain: $('rain-overlay'),
    };
    this.selection = { mode: 'game', scenario: 'clear', start: 'standard' };
    this.schoolIndex = 0;
    this.onStart = null; this.onDemo = null; this.onResume = null; this.onQuit = null; this.onAgain = null; this.onSchoolDone = null;
    this.buildMenu();
    this.bindButtons();
    this.hgs = {}; this.hgsShown = {};
    for (const id of ['hgs', 'g-ias', 'g-tgt', 'g-n1', 'g-altv', 'g-ra', 'g-vs', 'g-wind']) this.hgs[id] = $(id);
    this.hgs.gsDia = document.querySelector('#g-gs .g-dia'); this.hgs.locDia = document.querySelector('#g-loc .g-dia');
    this.hgs.fdh = document.querySelector('#g-fd .g-fdh'); this.hgs.fdv = document.querySelector('#g-fd .g-fdv');
    // a scheme switch (first touch on a hybrid laptop, a mouse on an iPad) re-renders the open page
    onSchemeChange(() => { if (!this.el.school.classList.contains('hidden')) this.renderSchool(); });
  }

  buildMenu() {
    const sc = $('scenario-row');
    sc.innerHTML = '';
    for (const s of Object.values(SCENARIOS)) {
      const b = document.createElement('button');
      b.className = 'choice' + (s.id === this.selection.scenario ? ' selected' : '');
      b.dataset.scenario = s.id;
      b.innerHTML = `<b><span class="icon">${s.icon}</span>${s.name}</b><small>${s.tagline}<br>Wind ${s.windDirDeg}° / ${s.windKts} kt${s.gustKts ? ` gusting ${s.windKts + s.gustKts}` : ''} · Visibility ${s.visibility >= 10000 ? (s.visibility / 1000) + ' km' : s.visibility + ' m'}${s.wet ? ' · Wet runway' : ''}</small>`;
      b.addEventListener('click', () => { this.selection.scenario = s.id; this.refreshMenu(); });
      sc.appendChild(b);
    }
    const st = $('start-row');
    st.innerHTML = '';
    for (const s of Object.values(APPROACH_STARTS)) {
      const b = document.createElement('button');
      b.className = 'choice' + (s.id === this.selection.start ? ' selected' : '');
      b.dataset.start = s.id;
      b.innerHTML = `<b>${s.name}</b><small>${s.desc}</small>`;
      b.addEventListener('click', () => { this.selection.start = s.id; this.refreshMenu(); });
      st.appendChild(b);
    }
    document.querySelectorAll('#mode-row .choice').forEach((b) => b.addEventListener('click', () => { this.selection.mode = b.dataset.mode; this.refreshMenu(); }));
    this.refreshMenu();
  }

  refreshMenu() {
    document.querySelectorAll('#mode-row .choice').forEach((b) => b.classList.toggle('selected', b.dataset.mode === this.selection.mode));
    document.querySelectorAll('#scenario-row .choice').forEach((b) => b.classList.toggle('selected', b.dataset.scenario === this.selection.scenario));
    document.querySelectorAll('#start-row .choice').forEach((b) => b.classList.toggle('selected', b.dataset.start === this.selection.start));
    $('scenario-section').style.opacity = this.selection.mode === 'training' ? 0.45 : 1;
  }

  getOptions() {
    return {
      mode: this.selection.mode,
      scenarioId: this.selection.mode === 'training' ? 'clear' : this.selection.scenario,
      startId: this.selection.start,
      invertPitch: $('opt-invert').checked,
      night: $('opt-night').checked,
      sound: $('opt-sound').checked,
      mouseSensitivity: parseFloat($('opt-mouse').value),
    };
  }

  bindButtons() {
    $('btn-start').addEventListener('click', () => this.onStart && this.onStart(this.getOptions()));
    $('btn-demo').addEventListener('click', () => this.onDemo && this.onDemo(this.getOptions()));
    $('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    $('btn-quit').addEventListener('click', () => this.onQuit && this.onQuit());
    $('btn-again').addEventListener('click', () => this.onAgain && this.onAgain());
    $('btn-menu').addEventListener('click', () => this.onQuit && this.onQuit());
    $('btn-help').addEventListener('click', () => this.onHelp && this.onHelp());
    $('school-next').addEventListener('click', () => this.schoolStep(1));
    $('school-back').addEventListener('click', () => this.schoolStep(-1));
    $('school-skip').addEventListener('click', () => this.hideSchool(true));
  }

  show(name, on = true) { const e = this.el[name]; if (e) e.classList.toggle('hidden', !on); }
  showMenu() { this.show('menu', true); this.show('hud', false); this.show('results', false); this.show('pause', false); this.show('school', false); }
  hideLoading(msg) { if (msg) $('loading-msg').textContent = msg; else this.show('loading', false); }

  // ---- HUD ------------------------------------------------------------------
  updateHUD(st, extra = {}) {
    const set = (id, v, cls) => { const e = $(id); if (e.textContent !== String(v)) e.textContent = v; e.className = cls || ''; };
    set('h-ias', Math.round(st.ias), st.stallWarning ? 'bad' : (Math.abs(st.ias - st.vref - 5) < 6 && st.flapIndex >= 4 ? 'good' : ''));
    set('h-alt', Math.round(st.alt / FT));
    set('h-ra', st.agl / FT < 2500 ? Math.round(st.agl / FT) : '---', st.agl / FT < 100 ? 'warn' : '');
    const vs = Math.round(st.vs / 0.00508 / 10) * 10;
    set('h-vs', (vs > 0 ? '+' : '') + vs, vs < -1000 ? 'bad' : '');
    set('h-hdg', String(Math.round(st.heading / DEG) % 360).padStart(3, '0'));
    set('h-gs', Math.round(st.groundSpeed / KTS));
    set('h-n1', `${Math.round(st.n1[0] * 100)}/${Math.round(st.n1[1] * 100)}` + (st.reverser > 0.5 ? ' REV' : ''), st.reverser > 0.5 ? 'warn' : '');
    set('h-thr', Math.round(st.throttle * 100));
    const flapMoving = Math.abs(st.flapDeg - AC.flapDetents[st.flapIndex]) > 0.3;
    set('h-flap', flapMoving ? `${st.flapDeg.toFixed(0)}→${AC.flapDetents[st.flapIndex]}` : AC.flapDetents[st.flapIndex], flapMoving ? 'warn' : '');
    const gearFail = !!st.gearCollapsed;
    set('h-gear', gearFail ? 'FAIL' : (st.gearDown ? 'DOWN' : (st.gearInTransit ? 'TRANSIT' : 'UP')), gearFail ? 'bad' : (st.gearDown ? 'good' : (st.gearInTransit ? 'warn' : (st.agl / FT < 1500 && st.vs < -1 ? 'bad' : ''))));   // gear up is only a warning when descending low (not in a go-around climb)
    set('h-sb', st.speedbrake > 0.05 ? (st.onGround ? 'UP' : 'FLT') : (st.speedbrakeArmed ? 'ARMED' : 'DOWN'), st.speedbrakeArmed || st.speedbrake > 0.05 ? 'good' : '');
    set('h-brk', st.brake > 0.05 ? `${Math.round(st.brake * 100)}%` : ['OFF', 'AB1', 'AB2', 'AB3', 'MAX'][st.autobrake], st.brake > 0.05 ? 'warn' : '');
    set('h-trim', `${st.trim >= 0 ? 'NU' : 'ND'} ${Math.abs(st.trim).toFixed(1)}`);
    set('h-wind', `${String(Math.round(st.windDirDeg)).padStart(3, '0')}°/${Math.round(st.windKts)}kt`, '');
    set('h-xwind', `${Math.round(Math.abs(st.crosswind))}${st.crosswind > 0.5 ? 'R' : (st.crosswind < -0.5 ? 'L' : '')}`, Math.abs(st.crosswind) > 20 ? 'warn' : '');
    set('h-mouse', extra.pad ? 'CONTROLLER' : (extra.mouse ? 'YOKE ON (Esc)' : 'click to engage'), extra.pad || extra.mouse ? 'good' : '');
    this.el.stall.classList.toggle('hidden', !st.stallWarning);
    this.el.config.classList.toggle('hidden', !extra.configWarning);
    if (extra.configWarning) this.el.config.textContent = extra.configWarning;
    if (getScheme() === 'touch' || extra.headUp) this.updateHGS(st, extra);
  }

  /** The view shown ('cockpit' | 'hud'): the head-up view shows the #hgs readouts on every device. */
  setView(view) {
    if (view === this._view) return;
    this._view = view;
    document.body.classList.toggle('view-hud', view === 'hud');
  }

  /** Touch devices: the head-up display with the numbers needed to land (DOM writes only on change). */
  updateHGS(st, extra = {}) {
    const g = this.hgs, shown = this.hgsShown;
    const set = (id, txt, cls = '') => { const k = txt + '|' + cls; if (shown[id] === k) return; shown[id] = k; g[id].textContent = txt; g[id].className = (id === 'g-altv' || id === 'g-ias' ? 'g-box ' : '') + cls; };
    const pos = (key, el, prop, v) => { const txt = v.toFixed(1) + '%'; if (shown[key] !== txt) { shown[key] = txt; el.style[prop] = txt; } };
    const airborne = !st.onGround;
    const target = st.vref + 5, dv = st.ias - target;
    set('g-ias', String(Math.round(st.ias)), st.stallWarning ? 'bad' : (st.flapIndex >= 4 && airborne ? (Math.abs(dv) < 6 ? 'good' : (dv > 12 || dv < -6 ? 'warn' : '')) : ''));
    set('g-tgt', airborne ? `REF+5 ${Math.round(target)}` : '');
    set('g-n1', `N1 ${Math.round(st.n1[0] * 100)}${st.reverser > 0.5 ? ' REV' : ''}`, st.reverser > 0.5 ? 'warn' : '');
    set('g-altv', String(Math.round(st.alt / FT / 10) * 10));
    set('g-ra', st.agl / FT < 2500 ? `RA ${Math.round(st.agl / FT)}` : '', st.agl / FT < 100 ? 'warn' : '');
    const vs = Math.round(st.vs / 0.00508 / 10) * 10;
    set('g-vs', `V/S ${vs > 0 ? '+' : ''}${vs}`, vs < -1000 ? 'bad' : '');
    set('g-wind', `W ${String(Math.round(st.windDirDeg)).padStart(3, '0')}/${Math.round(st.windKts)}`);
    // ILS: diamonds on the same scales as the PFD (1° localizer, 0.35° glideslope per dot)
    const ils = airborne && st.distToThreshold > 0 && st.distToThreshold < 25 * 1852;
    const cls = (ils ? 'ils ' : '') + (extra.fd ? 'fd' : '');
    if (shown.hgsCls !== cls) { shown.hgsCls = cls; g.hgs.className = cls; }
    if (ils) {
      const dots = (dev, full) => Math.max(-2.5, Math.min(2.5, dev / full));
      pos('gs', g.gsDia, 'top', 50 + dots(st.gsDev, 0.35) * 20);        // above the glideslope: diamond low
      pos('loc', g.locDia, 'left', 50 + dots(-st.locDev, 1.0) * 20);    // right of the centreline: diamond left
    }
    if (extra.fd) {
      const fp = Math.max(-40, Math.min(40, (extra.fd.pitch - st.pitch) / DEG * 5));
      const fr = Math.max(-40, Math.min(40, (extra.fd.roll - st.roll) / DEG * 2));
      const tp = `translateY(${(-fp).toFixed(1)}px)`, tr = `translateX(${fr.toFixed(1)}px)`;
      if (shown.fdh !== tp) { shown.fdh = tp; g.fdh.style.transform = tp; }
      if (shown.fdv !== tr) { shown.fdv = tr; g.fdv.style.transform = tr; }
    }
  }

  setModeMessage(text, cls = '') { const e = this.el.modeMsg; const t = controlsText(text); if (e.textContent !== t) e.textContent = t; e.className = cls; }
  /** Landing checklist overlay (training mode): [{ text, done }] or null to hide. */
  setChecklist(items) { const e = this.el.checklist; if (!items) { e.classList.add('hidden'); return; } e.classList.remove('hidden'); const html = items.map((c) => `<div class="${c.done ? 'done' : 'todo'}">${c.done ? '✓' : '□'} ${c.text}</div>`).join(''); if (e.innerHTML !== html) e.innerHTML = html; }
  setInstructor(text) { const e = this.el.instructor; if (!text) { e.classList.add('hidden'); this._instr = ''; return; } e.classList.remove('hidden'); const h = controlsHtml(text); if (this._instr !== h) { this._instr = h; e.innerHTML = h; } }
  /** The sound waits for a tap, click or key (a controller in use cannot start it). */
  setSoundHint(on) { const e = document.getElementById('sound-hint'); e.textContent = on ? (getScheme() === 'touch' ? '🔇 Tap the screen for sound' : '🔇 Click or press a key for sound') : ''; e.classList.toggle('hidden', !on); }
  setCaption(text, kind) { const e = this.el.caption; if (!text) { e.classList.remove('show'); return; } e.textContent = text; e.className = 'show ' + (kind === 'warning' ? 'warning' : (kind === 'caution' ? 'caution' : 'info')); }
  flash(strength = 1) { const e = this.el.crashFlash; e.style.transition = 'none'; e.style.opacity = String(Math.min(1, strength)); requestAnimationFrame(() => { e.style.transition = 'opacity 1.2s'; e.style.opacity = '0'; }); }
  setRain(on) { this.el.rain.style.opacity = '0'; void on; }

  // ---- Flight School ----------------------------------------------------------
  showSchool(getAnchor, onLook) {
    this.getAnchor = getAnchor;
    this.onLook = onLook;
    this.schoolIndex = 0;
    this.show('school', true);
    this.renderSchool();
  }
  schoolStep(d) {
    this.schoolIndex += d;
    if (this.schoolIndex >= SCHOOL_STEPS.length) { this.hideSchool(false); return; }
    if (this.schoolIndex < 0) this.schoolIndex = 0;
    this.renderSchool();
  }
  renderSchool() {
    const s = schoolPage(SCHOOL_STEPS[this.schoolIndex]);
    $('school-step').textContent = `${this.schoolIndex + 1} / ${SCHOOL_STEPS.length}`;
    $('school-title').textContent = s.title;
    $('school-body').innerHTML = s.body;
    $('school-back').disabled = this.schoolIndex === 0;
    $('school-next').textContent = this.schoolIndex === SCHOOL_STEPS.length - 1 ? 'Start flying' : 'Next';
    if (this.onLook) this.onLook(s.look || 0);
    this.updateSchoolHighlight();
  }
  updateSchoolHighlight() {
    if (this.el.school.classList.contains('hidden') || !this.getAnchor) return;
    const s = schoolPage(SCHOOL_STEPS[this.schoolIndex]);
    const h = $('school-highlight');
    let box = null;
    if (s.anchor[0] === '#') {
      // a page element (touch controls, head-up display): frame it with a little margin
      const el = document.querySelector(s.anchor), r = el && el.getBoundingClientRect();
      if (r && r.width > 0) box = { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
    } else {
      const a = this.getAnchor(s.anchor);
      if (a) { const size = a.size || 150; box = { x: a.x - size / 2, y: a.y - size / 2, w: size, h: size * (a.aspect || 1) }; }
    }
    if (!box) { h.style.display = 'none'; return; }
    h.style.display = 'block';
    h.style.left = `${box.x}px`; h.style.top = `${box.y}px`; h.style.width = `${box.w}px`; h.style.height = `${box.h}px`;
    // keep the card away from the highlight
    $('school-card').classList.toggle('left', box.x + box.w / 2 > window.innerWidth * 0.55);
  }
  hideSchool(skipped) { this.show('school', false); this.onSchoolDone && this.onSchoolDone(skipped); }

  // ---- results ---------------------------------------------------------------
  showResults(res) {
    const o = $('res-outcome'); o.textContent = fmtOutcome(res.outcome); o.className = res.success ? 'ok' : 'fail';
    $('res-headline').textContent = res.headline;
    $('res-score').innerHTML = `${res.score} <small>/ 100 — grade ${res.grade}</small>`;
    const t = $('res-table'); t.innerHTML = '';
    for (const it of res.items) {
      const tr = document.createElement('tr'); tr.className = it.ok ? '' : 'bad';
      tr.innerHTML = `<td><b>${it.label}</b><br><span class="note">${it.value}</span></td><td class="note">${it.note}</td><td class="pts">${it.max ? `${it.points} / ${it.max}` : ''}</td>`;
      t.appendChild(tr);
    }
    const n = $('res-notes'); n.innerHTML = '';
    for (const note of res.notes) { const d = document.createElement('div'); d.textContent = note; n.appendChild(d); }
    this.show('results', true);
  }
}
