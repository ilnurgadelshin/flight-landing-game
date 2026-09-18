// DOM user interface: main menu, HUD readouts, Flight School onboarding,
// pause and results screens.
import { SCENARIOS, APPROACH_STARTS, AIRCRAFT as AC, FT, KTS, DEG } from './config.js';
import { fmtOutcome } from './evaluate.js';

const $ = (id) => document.getElementById(id);

export const SCHOOL_STEPS = [
  { title: 'Welcome aboard', anchor: 'windshield', body: `You are in the captain's seat of a Boeing 737-800 on final approach to runway 27. Your job: fly the ILS down the 3° glideslope at <b>Vref + 5 = 147 kts</b>, flare at 30 ft, touch down in the touchdown zone and stop.<ul><li>Click the window to engage the <b>mouse yoke</b>, or fly with the keyboard.</li><li>Press <kbd>H</kbd> any time to reopen this school.</li></ul>` },
  { title: 'Artificial horizon (attitude)', anchor: 'attitude', body: `The blue/brown ball shows pitch and bank. Keep the wings level and the nose about <b>+2°</b> on approach.<ul><li><kbd>↑</kbd>/<kbd>↓</kbd> or mouse: pitch (nose up/down)</li><li><kbd>←</kbd>/<kbd>→</kbd> or mouse: roll (bank)</li></ul>The aircraft is heavy: make small, smooth inputs and wait for it to respond.` },
  { title: 'Airspeed tape', anchor: 'airspeed', body: `Speed in knots. The green <b>REF</b> bug is Vref (142 kts with flaps 30). The red barber pole at the bottom is the stall; the red one at the top is the flap limit.<ul><li><kbd>W</kbd> / <kbd>S</kbd>: throttle up / down. Thrust controls your speed on approach — about <b>60 % N1</b> holds Vref+5.</li></ul>` },
  { title: 'Altimeter & vertical speed', anchor: 'altimeter', body: `Barometric altitude in feet with the radio altitude below the horizon under 2500 ft. The vertical-speed needle on the right should sit near <b>−750 fpm</b> on the glideslope.<ul><li>Pitch controls the descent rate. High on the glideslope → lower the nose a little; low → raise it.</li></ul>` },
  { title: 'ILS: localizer & glideslope', anchor: 'nd', body: `The magenta diamonds on the PFD show your position relative to the runway centreline (bottom) and the 3° glideslope (right). Keep both centred. The navigation display shows the extended centreline and your track.<ul><li>Follow the <b>PAPI</b> lights left of the runway: 2 white + 2 red = on slope, more white = high, more red = low.</li></ul>` },
  { title: 'Rudder — essential in a crosswind', anchor: 'rudder', look: 1, body: `In a crosswind you fly "crabbed" into the wind. Just before touchdown, press the rudder to align the nose with the runway and lower the upwind wing slightly.<ul><li><kbd>A</kbd> / <kbd>D</kbd>: left / right rudder. On the ground the same keys steer the nose wheel.</li></ul>` },
  { title: 'Thrust levers', anchor: 'throttle', look: 1, body: `Two thrust levers on the pedestal (hold <kbd>L</kbd> or right-drag to look down). N1 is shown on the engine display.<ul><li><kbd>W</kbd>/<kbd>S</kbd>: move the levers</li><li><kbd>T</kbd>: TOGA — full thrust for a go-around</li><li>Engines take a few seconds to spool up: anticipate!</li></ul>` },
  { title: 'Flaps', anchor: 'flapLever', look: 1, body: `Flaps add lift for slow flight. Extend them step by step as you slow down: flaps 5 by 190 kts, flaps 15 by 170, <b>flaps 30 for landing</b> below 165 kts.<ul><li><kbd>F</kbd>: extend one notch · <kbd>V</kbd>: retract one notch</li><li>The gauge next to the gear lever shows the actual position.</li></ul>` },
  { title: 'Landing gear', anchor: 'gear', look: 0.45, body: `Lower the gear when you intercept the glideslope (about 2000 ft). It takes ~8 s and adds drag — three green lights mean down and locked.<ul><li><kbd>G</kbd>: gear up / down</li><li>Landing without gear = belly landing. The warning system will shout at you.</li></ul>` },
  { title: 'Speedbrakes / spoilers', anchor: 'speedbrake', look: 1, body: `The speedbrake lever raises spoilers on the wing. In flight they add drag (use them if you are high and fast). On the ground they dump the lift so the brakes can work.<ul><li><kbd>X</kbd>: <b>arm</b> them before landing — they deploy automatically at touchdown</li><li><kbd>Space</kbd>: extend / retract manually</li></ul>` },
  { title: 'Brakes & thrust reversers', anchor: 'lower', look: 0.45, body: `After touchdown: hold the reversers, then brake. Reversers only work on the ground.<ul><li><kbd>R</kbd> (hold): reverse thrust — stow below 60 kts</li><li><kbd>B</kbd> (hold): wheel brakes</li><li><kbd>N</kbd>: autobrake OFF / 1 / 2 / 3 / MAX (set 3 for a wet runway)</li></ul>` },
  { title: 'Trim & go-around', anchor: 'trim', look: 1, body: `The trim wheels relieve the control force so the aircraft holds its attitude hands-off.<ul><li><kbd>[</kbd> / <kbd>]</kbd> (or PageUp / PageDown): trim nose up / down</li></ul>If the approach is not stable below 500 ft: <b>go around</b>. Press <kbd>T</kbd> for full thrust, pitch up to +12°, gear up when climbing, flaps 15. Then press <kbd>Backspace</kbd> to reposition on final, or fly a visual circuit.` },
  { title: 'Landing criteria', anchor: 'pfd', body: `You will be graded on:<ul><li><b>Touchdown zone</b>: 150–900 m past the threshold (aim for the big white blocks)</li><li><b>Sink rate</b> under 300 fpm is smooth; over 600 fpm is a hard landing; 900+ collapses the gear</li><li><b>Centreline</b> and <b>alignment</b> (less than 3° crab, wings level)</li><li><b>Speed</b> near Vref, <b>flaps 30</b> and gear down</li><li>Stop before the end of the runway</li></ul>Callouts: "Fifty, forty, thirty, twenty, ten" — start the flare at <b>thirty</b>. Good luck, Captain.` },
];

export class UI {
  constructor() {
    this.el = {
      menu: $('menu'), hud: $('hud'), school: $('school'), pause: $('pause'), results: $('results'), loading: $('loading'),
      modeMsg: $('mode-msg'), instructor: $('instructor'), caption: $('gpws-caption'),
      stall: $('alert-stall'), config: $('alert-config'), crashFlash: $('crash-flash'), rain: $('rain-overlay'),
    };
    this.selection = { mode: 'game', scenario: 'clear', start: 'standard' };
    this.schoolIndex = 0;
    this.onStart = null; this.onDemo = null; this.onResume = null; this.onQuit = null; this.onAgain = null; this.onSchoolDone = null;
    this.buildMenu();
    this.bindButtons();
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
    set('h-gear', st.gearDown ? 'DOWN' : (st.gearInTransit ? 'TRANSIT' : 'UP'), st.gearDown ? 'good' : (st.gearInTransit ? 'warn' : (st.agl / FT < 1500 ? 'bad' : '')));
    set('h-sb', st.speedbrake > 0.05 ? (st.onGround ? 'UP' : 'FLT') : (st.speedbrakeArmed ? 'ARMED' : 'DOWN'), st.speedbrakeArmed || st.speedbrake > 0.05 ? 'good' : '');
    set('h-brk', st.brake > 0.05 ? `${Math.round(st.brake * 100)}%` : ['OFF', 'AB1', 'AB2', 'AB3', 'MAX'][st.autobrake], st.brake > 0.05 ? 'warn' : '');
    set('h-trim', `${st.trim >= 0 ? 'NU' : 'ND'} ${Math.abs(st.trim).toFixed(1)}`);
    set('h-wind', `${String(Math.round(st.windDirDeg)).padStart(3, '0')}°/${Math.round(st.windKts)}kt  x${Math.round(Math.abs(st.crosswind))}`, Math.abs(st.crosswind) > 20 ? 'warn' : '');
    set('h-mouse', extra.mouse ? 'YOKE ON (Esc)' : 'click to engage', extra.mouse ? 'good' : '');
    this.el.stall.classList.toggle('hidden', !st.stallWarning);
    this.el.config.classList.toggle('hidden', !extra.configWarning);
    if (extra.configWarning) this.el.config.textContent = extra.configWarning;
  }

  setModeMessage(text, cls = '') { const e = this.el.modeMsg; if (e.textContent !== text) e.textContent = text; e.className = cls; }
  setInstructor(text) { const e = this.el.instructor; if (!text) { e.classList.add('hidden'); return; } e.classList.remove('hidden'); if (e.innerHTML !== text) e.innerHTML = text; }
  setCaption(text, kind) { const e = this.el.caption; if (!text) { e.classList.remove('show'); return; } e.textContent = text; e.className = 'show' + (kind === 'warning' ? '' : ' info'); }
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
    const s = SCHOOL_STEPS[this.schoolIndex];
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
    const s = SCHOOL_STEPS[this.schoolIndex];
    const a = this.getAnchor(s.anchor);
    const h = $('school-highlight');
    if (!a) { h.style.display = 'none'; return; }
    h.style.display = 'block';
    const size = a.size || 150;
    h.style.left = `${a.x - size / 2}px`; h.style.top = `${a.y - size / 2}px`; h.style.width = `${size}px`; h.style.height = `${size * (a.aspect || 1)}px`;
    // keep the card away from the highlight
    const card = $('school-card');
    if (a.x > window.innerWidth * 0.55) { card.style.right = 'auto'; card.style.left = '24px'; } else { card.style.left = 'auto'; card.style.right = '24px'; }
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
