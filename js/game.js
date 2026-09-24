// The game's rules: the state machine (menu → school → flying ⇄ paused → finished), what the
// player's actions do, go-around detection, excursions and overruns, the finish, the grading,
// the instructor's hints in training and the autoland demo.
//
// No DOM, no Three.js, no sound: it runs in Node (test/game.test.mjs). It tells the rest of the
// game what happened through events (on / emit); js/presentation.js turns them into sound,
// vibration and screens, and js/view.js draws the aircraft and the world. The aircraft's controls
// are owned by FlightControls (js/flightcontrols.js).
//
// Events:
//   state        { state, prev }                      the state machine moved
//   start        { opts, scenario, night }            a flight is set up (before it begins)
//   school       { fromStart }                        show Flight School (the flight is paused)
//   message      { text, kind, duration }             the mode line; duration in s (0: until replaced)
//   instructor   { html }                             training hint ('' clears it)
//   control      { name, value }                      a discrete control moved (gear, flaps, TO/GA …)
//   goaround     { manual, reason }                  reason: why the autoland went around ('' otherwise)
//   reposition   { distanceNm }
//   demo         { engaged }                          the autoland demo handed over
//   touchdown    { sink, hard, distFromThreshold }
//   spoilers     {}
//   damage       { type, reason }                     strikes, gear collapse, destruction
//   finish       { result }
import { Simulation } from './sim.js';
import { FlightControls } from './flightcontrols.js';
import { evaluateLanding } from './evaluate.js';
import { terrainAhead } from './avionics.js';
import { SCENARIOS, RUNWAY, FT, KTS, DEG, NM, AIRCRAFT as AC } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DAMAGE = ['gearcollapse', 'destroyed', 'bellycontact', 'wingstrike', 'tailstrike', 'enginestrike', 'nosefirst'];

export class Game {
  /**
   * @param player the player's devices (see FlightControls), or null
   * @param gpws   the ground proximity warning system (js/gpws.js), or null
   */
  constructor({ player = null, gpws = null } = {}) {
    this.player = player;
    this.gpws = gpws;
    this.listeners = {};
    this.sim = new Simulation({ scenarioId: 'clear', startId: 'standard' });
    this.controls = new FlightControls(this.sim.aircraft, player);
    this.state = 'menu';
    this.mode = 'game';
    this.opts = null;
    this.night = false;
    this.events = [];           // the flight's log, for the debrief and the tests: { t, type, text }
    this.ctx = this.newCtx();
    this.time = 0;
    this.result = null;
  }

  on(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners[type] || []) fn(data); }
  message(text, kind = '', duration = 0) { this.emit('message', { text, kind, duration }); }

  newCtx() {
    return { usedReversers: false, usedSpeedbrake: false, maxBrake: 0, goArounds: 0, excursion: false, overrun: false, overrunSpeedKts: 0,
      gaMode: false, gaTimer: 0, gaMaxAgl: 0, wasLow: false, finished: false, finishTimer: 0, elapsed: 0, touchdownSeen: false, crashSeen: false, minAglOnApproach: 1e9 };
  }

  log(type, text) { this.events.push({ t: this.time, type, text }); }

  /** The demo autoland, while it has command (null otherwise). */
  get demoAp() { return this.controls.autopilot; }
  /** Put the autoland in command without announcing a demo (tests, automation). */
  engageAutopilot(opts) { return this.controls.engageAutopilot(opts); }

  // ------------------------------------------------------------------ setup
  start(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.night = !!opts.night;
    const scenario = SCENARIOS[opts.scenarioId];
    this.sim = new Simulation({ scenarioId: opts.scenarioId, startId: opts.startId, seed: opts.seed || (Date.now() % 1000) + 1 });
    this.controls = new FlightControls(this.sim.aircraft, this.player);
    if (this.mode === 'training') this.controls.enableDirector();
    this.sim.preStep = (dt) => {
      if (this.controls.step(dt)) this.announceTakeover();
      // the autoland decided to go around: announced like TO/GA pressed, before the GPWS looks at
      // the flaps coming up to 15
      const ap = this.demoAp;
      if (ap && ap.gaPending) { ap.gaPending = false; this.beginGoAround(true, ap.gaReason); }
    };
    this.sim.postStep = (dt) => { if (this.state === 'flying' && this.gpws) this.gpws.update(dt, this.sim.state, { gaMode: this.ctx.gaMode, gaAltitudeLoss: this.ctx.gaMaxAgl - this.sim.state.agl, terrainAhead: this.terrainAhead() }); };
    if (this.gpws) this.gpws.reset();
    this.ctx = this.newCtx();
    this.events.length = 0;
    this.time = 0;
    this.result = null;
    this._instT = 0; this._gaHint = false;
    this.emit('start', { opts, scenario, night: this.night });
    this.emit('instructor', { html: '' });
    if (opts.demo) {
      this.controls.engageAutopilot({});
      this.setState('flying');
      this.message('AUTOLAND DEMO — [[takeover]] to take over', 'ga');
      this.log('demo', 'autoland demo started');
    } else if (this.mode === 'training' && !opts.skipSchool) {
      this.openSchool(true);
    } else {
      this.setState('flying');
    }
    this.log('start', `${opts.mode} ${opts.scenarioId} ${opts.startId}`);
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    if (s === 'flying') this.message('');
    if (prev !== s) this.emit('state', { state: s, prev });
  }

  // ------------------------------------------------------------------ the player's actions
  /** An action from any device (the key, button or touch that sent it does not matter here). */
  action(name, arg) {
    const st = this.sim.state;
    if (name === 'pause') { this.togglePause(); return; }
    if (name === 'menu') { if (this.state === 'flying') this.togglePause(); return; }
    if (name === 'help') { if (this.state === 'flying') this.openSchool(false); return; }
    if (name === 'togaOrReposition') {
      // the controller's View button: TO/GA, and once the go-around is under way, back on final
      if (this.state === 'flying') this.action(this.ctx.gaMode && this.ctx.gaTimer > 3 ? 'reposition' : 'toga');
      return;
    }
    if (this.state !== 'flying') return;
    if (this.demoAp && ['gear', 'flapsDown', 'flapsUp', 'speedbrake', 'toga'].includes(name)) this.disengageDemo();
    switch (name) {
      case 'gear': case 'flapsDown': case 'flapsUp': case 'speedbrake': case 'armSpeedbrake': case 'autobrake': case 'toga': {
        const c = this.controls.act(name);
        if (!c) break;
        this.emit('control', c);
        this.log('input', ({
          gear: () => `gear ${c.value ? 'down' : 'up'}`, flapsDown: () => `flaps ${AC.flapDetents[c.value]}`, flapsUp: () => `flaps ${AC.flapDetents[c.value]}`,
          speedbrake: () => `speedbrake ${c.value ? 'up' : 'down'}`, armSpeedbrake: () => `speedbrake ${c.value ? 'armed' : 'disarmed'}`,
          autobrake: () => `autobrake ${c.value}`, toga: () => 'TOGA',
        })[name]());
        if (name === 'toga') this.beginGoAround(true);
        break;
      }
      case 'reposition': if (this.ctx.gaMode || st.alt > 900 || st.onGround) this.reposition(); break;
      case 'mouse': this.log('input', `mouse yoke ${arg ? 'on' : 'off'}`); break;
      case 'reverse': this.log('input', `reverse ${arg ? 'on' : 'off'}`); break;
      default: break;
    }
  }

  /** Flight School: before the flight (training) or opened from the flight (help). */
  openSchool(fromStart) {
    this._schoolFromStart = fromStart;
    this.sim.paused = true;
    this.setState('school');
    this.emit('school', { fromStart });
  }

  schoolDone(skipped) {
    if (this.state !== 'school') return;
    this.sim.paused = false;
    this.setState('flying');
    if (this._schoolFromStart) this.log('school', skipped ? 'skipped' : 'completed');
  }

  disengageDemo() { if (this.controls.disengageAutopilot()) this.announceTakeover(); }
  announceTakeover() {
    this.emit('demo', { engaged: false });
    this.message('AUTOPILOT DISENGAGED — you have control', '', 2.5);
    this.log('demo', 'disengaged');
  }

  togglePause() {
    if (this.state === 'flying') { this.sim.paused = true; this.setState('paused'); }
    else if (this.state === 'paused') { this.sim.paused = false; this.setState('flying'); }
  }

  quitToMenu() { this.setState('menu'); this.sim.paused = true; }

  reposition() {
    this.sim.reposition();
    this.ctx.gaMode = false; this.ctx.wasLow = false; this.ctx.gaTimer = 0; this.ctx.touchAndGo = false;
    // the autoland flies the new approach from the start (it keeps count of its go-arounds)
    const ap = this.controls.autopilot;
    if (ap) this.controls.engageAutopilot(Object.assign({}, ap.opts, { goAroundsFlown: ap.goArounds }));
    if (this.gpws) this.gpws.reset();
    this.message(`REPOSITIONED — ${this.sim.start.distanceNm} nm final`, 'ga', 2.5);
    this.emit('reposition', { distanceNm: this.sim.start.distanceNm });
    this.log('reposition', 'back on final');
  }

  /** A go-around: TO/GA pressed (manual), detected from the flying, or the autoland's (with its reason). */
  beginGoAround(manual, reason = '') {
    if (this.ctx.gaMode) return;
    this.ctx.gaMode = true; this.ctx.gaTimer = 0; this.ctx.goArounds++; this.ctx.gaMaxAgl = this.sim.state.agl; this.ctx.gaStartAgl = this.sim.state.agl;
    this.message(reason ? `AUTOLAND GO-AROUND — ${reason}. [[reposition]]: back on final` : 'GO-AROUND — pitch up, gear up, flaps 15. [[reposition]]: back on final', 'ga');
    this.emit('goaround', { manual, reason });
    this.log('goaround', reason ? `autoland: ${reason}` : (manual ? 'TOGA pressed' : 'detected'));
  }

  // ------------------------------------------------------------------ per frame
  /** Advance by a frame's time (s). Returns the simulated time that passed. */
  update(frameDt) {
    const st = this.sim.state;
    if (this.state === 'flying' && this.controls.frame(Math.min(frameDt, 1.0) * this.sim.timeScale, frameDt, st)) this.announceTakeover();
    const steps = this.sim.update(frameDt);
    if (steps === 0 || this.sim.paused) return 0;
    const dt = steps * this.sim.fixedDt;
    this.time += dt;
    this.ctx.elapsed += dt;
    this.track(dt);
    if (this.state === 'flying' && this.mode === 'training') this.instructor(dt);
    return dt;
  }

  terrainAhead() {
    const st = this.sim.state;
    if (st.onGround) return false;
    if (this._taT !== undefined && st.time - this._taT < 0.5) return this._taV;
    this._taT = st.time;
    this._taV = terrainAhead(st);
    return this._taV;
  }

  track(dt) {
    const ac = this.sim.aircraft, st = ac.state, inp = ac.input, c = this.ctx;
    if (st.reverser > 0.5) c.usedReversers = true;
    if (st.speedbrake > 0.5 && st.onGround) c.usedSpeedbrake = true;
    c.maxBrake = Math.max(c.maxBrake, st.brake);
    if (!st.onGround) c.minAglOnApproach = Math.min(c.minAglOnApproach, st.agl);
    const ap = this.demoAp;
    // go-around detection: was low, then full thrust + climbing
    if (!st.onGround && st.agl < 1500 * FT && st.distToThreshold > -200) c.wasLow = true;
    // automatic detection: full thrust held for 2 s while climbing away (a sloppy approach that
    // briefly balloons with high thrust must not count as a go-around)
    if (!st.onGround && inp.throttle > 0.9) { c.togaT = (c.togaT || 0) + dt; c.togaMinAgl = Math.min(c.togaMinAgl === undefined ? st.agl : c.togaMinAgl, st.agl); }
    else { c.togaT = 0; c.togaMinAgl = undefined; }
    if (!c.gaMode && c.wasLow && !st.onGround && c.togaT > 2 && st.vs > 2 && st.agl - c.togaMinAgl > 15 && !ac.touchdown) this.beginGoAround(false);
    if (c.gaMode) {
      c.gaTimer += dt; c.gaMaxAgl = Math.max(c.gaMaxAgl, st.agl);
      if (c.gaTimer > 8 && st.agl > 900 * FT && inp.gearDown === false && !this._gaHint) {
        this._gaHint = true;
        this.message(ap ? 'MISSED APPROACH — climbing to 3000 ft, then vectors for another approach. [[reposition]]: back on final'
          : 'GO-AROUND complete — press [[reposition]] to reposition on final, or fly a visual circuit', 'ga');
      }
      // climbing away after a touch-and-go: that contact is not the landing to grade
      if (!st.onGround && st.agl > 50 * FT && (ac.touchdown || (ac.landingTouches && ac.landingTouches.length))) {
        ac.forgetTouchdown(); c.touchAndGo = false; c.touchdownSeen = false;
      }
      // the go-around ends if the pilot is back on a stabilised approach below 1000 ft
      if (c.gaTimer > 30 && st.agl < 1000 * FT && st.vs < 0 && inp.throttle < 0.8) { c.gaMode = false; this._gaHint = false; this.message(''); this.log('goaround', 'ended, approach resumed'); }
    }
    // what the aircraft reported: touchdown, spoilers, bounces, damage
    for (const e of ac.events.splice(0)) {
      if (e.type === 'touchdown') {
        c.touchdownSeen = true;
        this.emit('touchdown', { sink: e.sink, hard: e.sink > AC.gear.hardSink, distFromThreshold: e.distFromThreshold });
        this.log('touchdown', `${(e.sink / 0.00508).toFixed(0)} fpm at ${e.distFromThreshold.toFixed(0)} m`);
        // the wheels on the runway in the first seconds of a go-around, or with go-around thrust
        // set: a touch-and-go, not the landing
        if (c.gaMode && (inp.throttle > 0.8 || c.gaTimer < 8)) { c.touchAndGo = true; this.log('goaround', 'touch-and-go: the wheels touched during the go-around'); }
        else if (c.gaMode) c.gaMode = false;
      } else if (e.type === 'spoilers') { this.emit('spoilers'); this.log('systems', 'ground spoilers deployed'); }
      else if (e.type === 'liftoff') { this.log('bounce', `bounce ${e.bounce}`); }
      else if (DAMAGE.includes(e.type)) {
        this.emit('damage', { type: e.type, reason: e.reason });
        this.log('damage', e.reason || e.type);
        if (e.type === 'destroyed') c.crashSeen = true;
      } else if (e.type === 'hardlanding') { this.log('damage', 'hard landing'); }
    }
    // excursion / overrun
    if (st.onGround && ac.touchdown) {
      if (st.surface === 'grass' && !st.beyondRunwayEnd && Math.abs(st.z) > RUNWAY.width / 2 && !c.excursion) { c.excursion = true; this.log('excursion', 'left the runway side'); }
      if (st.beyondRunwayEnd && !c.overrun) { c.overrun = true; c.overrunSpeedKts = st.groundSpeed / KTS; this.log('overrun', `${c.overrunSpeedKts.toFixed(0)} kts`); }
    }
    // finish conditions
    if (!c.finished && this.state === 'flying') {
      const stopped = ac.touchdown && st.onGround && st.groundSpeed < 0.6 && !c.gaMode;
      const destroyed = ac.damage.destroyed;
      if (stopped || destroyed) {
        c.finishTimer += dt;
        if (c.finishTimer > (destroyed ? 2.5 : 1.5)) this.finish();
      } else c.finishTimer = 0;
      // flew off (e.g. missed approach and left the area)
      if (st.distToThreshold > 40 * NM || Math.abs(st.z) > 30000) { this.log('abort', 'left the area'); this.finish(); }
    }
  }

  finish() {
    const c = this.ctx;
    c.finished = true;
    const res = evaluateLanding(this.sim.aircraft, c);
    this.result = res;
    this.setState('finished');
    this.sim.paused = true;
    this.emit('instructor', { html: '' });
    this.message('');
    this.emit('finish', { result: res });
    this.log('result', `${res.outcome} ${res.score} ${res.grade} — ${res.headline}`);
  }

  // ------------------------------------------------------------------ training
  instructor(dt) {
    this._instT = (this._instT || 0) + dt;
    if (this._instT < 0.5) return;
    this._instT = 0;
    const st = this.sim.state, inp = this.sim.aircraft.input, c = this.ctx;
    const aglFt = st.agl / FT, dNm = st.distToThreshold / NM;
    const target = st.vref + 5;
    const hints = [];
    if (this.demoAp) { this.emit('instructor', { html: 'Watch the demo: notice the small, smooth control inputs and how thrust is used to hold the speed.' }); return; }
    if (st.onGround && this.sim.aircraft.touchdown) {
      if (st.groundSpeed > 30 * KTS) hints.push('<b>Rolling out.</b> Reverse thrust: [[reverse]]; brakes: hold [[brakes]]. Keep straight with [[rudder]].');
      else if (st.groundSpeed > 1) hints.push('Stow the reversers below 60 kts ([[reverseStow]]) and brake to a stop.');
    } else if (c.gaMode) {
      hints.push('<b>Go-around:</b> pitch to +12° with full thrust, gear up when climbing ([[gear]]), flaps 15 ([[flapsUp]]). Above 1000 ft press [[reposition]] to reposition.');
    } else if (aglFt < 60) {
      hints.push(aglFt < 35 ? '<b>Flare!</b> Raise the nose 2–3° and close the throttle ([[thrustDown]]). Hold it… let it settle.' : 'Approaching the flare. Wings level, aim for the touchdown zone, throttle coming back.');
      if (Math.abs(st.crabDeg) > 3) hints.push(`Kick off the crab: ${st.crabDeg > 0 ? 'left rudder ([[rudderLeft]])' : 'right rudder ([[rudderRight]])'} to align with the runway.`);
    } else {
      // configuration schedule
      if (dNm > 8 && inp.flapIndex < 2 && st.ias < 220) hints.push('Select <b>flaps 5</b> ([[flapsDown]]).');
      if (dNm <= 8 && dNm > 6 && inp.flapIndex < 3 && st.ias < 195) hints.push('Slow to about 160 kts and select <b>flaps 15</b> ([[flapsDown]]).');
      if (dNm <= 7 && !inp.gearDown) hints.push('<b>Gear down</b> ([[gear]]) — you are near glideslope intercept.');
      if (dNm <= 6 && inp.flapIndex < 4 && st.ias < 168) hints.push('<b>Flaps 30</b> ([[flapsDown]]) — landing flaps. Speed target Vref+5 = ' + target + ' kts.');
      if (dNm <= 5 && !inp.speedbrakeArmed && st.speedbrake < 0.1) hints.push('Arm the speedbrakes ([[armSpeedbrake]]) and set autobrake 2 or 3 ([[autobrake]]).');
      // energy
      // target speeds per configuration: flaps 5 ~175, flaps 15 ~162, landing flaps Vref+5
      const dv = st.ias - (inp.flapIndex >= 4 ? target : (inp.flapIndex >= 3 ? 162 : (inp.flapIndex >= 2 ? 175 : 210)));
      if (dv > 12) hints.push(`Speed high (+${dv.toFixed(0)}): reduce thrust ([[thrustDown]]).`);
      else if (dv < -10) hints.push(`Speed low (${dv.toFixed(0)}): add thrust ([[thrustUp]]) — do not raise the nose to hold altitude.`);
      // glideslope
      if (dNm < 12 && st.gsDev > 0.4) hints.push('Above the glideslope: lower the nose a little, reduce thrust.');
      else if (dNm < 12 && st.gsDev < -0.4) hints.push('Below the glideslope: raise the nose a little and add a touch of thrust.');
      if (Math.abs(st.locDev) > 0.5 && dNm < 12) hints.push(`${st.locDev > 0 ? 'Right' : 'Left'} of the centreline: bank ${st.locDev > 0 ? 'left' : 'right'} a few degrees to rejoin.`);
      if (Math.abs(st.roll) > 12 * DEG) hints.push('Bank angle too large — ease off the roll input.');
      if (aglFt < 500 && (Math.abs(st.gsDev) > 0.7 || Math.abs(st.locDev) > 1.2 || st.ias > target + 20)) hints.push('<b>Unstable approach — consider a go-around ([[toga]]).</b>');
      if (!hints.length) hints.push(dNm > 2 ? 'Nicely stable. Small corrections only; keep the diamonds centred and the speed on target.' : 'On profile. Look at the runway, keep it steady.');
    }
    this.emit('instructor', { html: hints.slice(0, 2).join('<br>') });
  }

  /** Flight director command bars (training only): the attitude the autoland law would fly now. */
  fdCommand() {
    const sh = this.controls.shadow;
    if (this.mode !== 'training' || !this.controls.director || this.demoAp) return null;
    const st = this.sim.state;
    if (st.onGround) return null;
    return { pitch: st.pitch + clamp(sh.pitch, -1, 1) * 6 * DEG, roll: st.roll + clamp(sh.roll, -1, 1) * 20 * DEG };
  }

  /** The landing checklist shown in training while airborne (null otherwise). */
  checklist() {
    const st = this.sim.state, inp = this.sim.aircraft.input;
    if (this.mode !== 'training' || st.onGround) return null;
    return [
      { text: 'Flaps 30', done: inp.flapIndex >= 4 }, { text: 'Gear down', done: inp.gearDown }, { text: 'Speedbrake armed', done: inp.speedbrakeArmed || st.speedbrake > 0.5 }, { text: 'Autobrake set', done: inp.autobrake > 0 },
    ];
  }
}
