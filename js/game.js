// Game state machine: menu → (school) → flying → rollout → results.
// Tracks everything the evaluator needs, detects go-arounds, drives the
// instructor hints in training mode and the autoland demo.
import * as THREE from 'three';
import { Simulation } from './sim.js';
import { Autopilot } from './autopilot.js';
import { evaluateLanding } from './evaluate.js';
import { SCENARIOS, RUNWAY, FT, KTS, DEG, NM, AIRCRAFT as AC } from './config.js';
import { TERRAIN } from './physics/terrain.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Game {
  constructor({ world, cockpit, input, audio, gpws, ui }) {
    this.world = world; this.cockpit = cockpit; this.input = input; this.audio = audio; this.gpws = gpws; this.ui = ui;
    this.sim = new Simulation({ scenarioId: 'clear', startId: 'standard' });
    this.state = 'menu';
    this.mode = 'game';
    this.aircraftGroup = new THREE.Group();
    this.aircraftGroup.add(cockpit.group);
    world.cockpitScene.add(this.aircraftGroup);
    this.eye = new THREE.Vector3();
    this.events = [];           // game-level events for tests: { t, type, text }
    this.ctx = this.newCtx();
    this.time = 0;
    this.demoAp = null;
    this.fdAp = null;
    this.shadowInput = null;
    this.bindActions();
    this.syncVisual();
  }

  newCtx() {
    return { usedReversers: false, usedSpeedbrake: false, maxBrake: 0, goArounds: 0, excursion: false, overrun: false, overrunSpeedKts: 0,
      gaMode: false, gaTimer: 0, gaMaxAgl: 0, wasLow: false, finished: false, finishTimer: 0, elapsed: 0, touchdownSeen: false, crashSeen: false, minAglOnApproach: 1e9 };
  }

  log(type, text) { this.events.push({ t: this.time, type, text }); }

  // ------------------------------------------------------------------ setup
  start(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.night = !!opts.night;
    this.input.opts.invertPitch = !!opts.invertPitch;
    this.input.opts.mouseSensitivity = opts.mouseSensitivity || 1;
    this.audio.setEnabled(opts.sound !== false);
    this.sim = new Simulation({ scenarioId: opts.scenarioId, startId: opts.startId, seed: opts.seed || (Date.now() % 1000) + 1 });
    this.sim.preStep = (dt) => this.preStep(dt);
    this.sim.postStep = (dt) => { if (this.state === 'flying') this.gpws.update(dt, this.sim.state, { gaMode: this.ctx.gaMode, gaAltitudeLoss: this.ctx.gaMaxAgl - this.sim.state.agl, terrainAhead: this.terrainAhead() }); };
    this.world.applyScenario(SCENARIOS[opts.scenarioId], this.night);
    this.cockpit.setNight(this.night || SCENARIOS[opts.scenarioId].timeOfDay !== 'day');
    this.gpws.reset();
    this.audio.log.length = 0;
    this.ctx = this.newCtx();
    this.events.length = 0;
    this.schoolLook = 0;
    this.time = 0;
    this.demoAp = null;
    this.fdAp = new Autopilot(this.sim.aircraft, {});
    this.shadowInput = Object.assign({}, this.sim.aircraft.input);
    this.fdAp.inputTarget = this.shadowInput;
    this.ui.show('menu', false); this.ui.show('results', false); this.ui.show('pause', false);
    this.ui.show('hud', true);
    this.ui.setRain(SCENARIOS[opts.scenarioId].rain > 0);
    this.ui.setInstructor('');
    this.syncVisual();
    if (opts.demo) {
      this.demoAp = new Autopilot(this.sim.aircraft, {});
      this.setState('flying');
      this.ui.setModeMessage('AUTOLAND DEMO — press any flight key to take over', 'ga');
      this.log('demo', 'autoland demo started');
    } else if (this.mode === 'training' && !opts.skipSchool) {
      this.setState('school');
      this.sim.paused = true;
      this.ui.showSchool((name) => this.anchorFor(name), (look) => { this.schoolLook = look; });
      this.ui.onSchoolDone = (skipped) => { this.sim.paused = false; this.schoolLook = 0; this.setState('flying'); this.log('school', skipped ? 'skipped' : 'completed'); };
    } else {
      this.setState('flying');
    }
    this.log('start', `${opts.mode} ${opts.scenarioId} ${opts.startId}`);
  }

  anchorFor(name) {
    const a = this.cockpit.anchorScreen(name, this.world.renderer);
    if (!a) return null;
    const sizes = { windshield: 420, attitude: 130, airspeed: 60, altimeter: 60, nd: 130, pfd: 150, upper: 150, lower: 150, gear: 70, flapLever: 70, throttle: 110, speedbrake: 70, trim: 90, rudder: 160, yoke: 160, mcp: 300 };
    return { x: a.x, y: a.y, size: sizes[name] || 120, aspect: name === 'windshield' ? 0.6 : (name === 'airspeed' || name === 'altimeter' ? 3.5 : 1) };
  }

  setState(s) {
    const prev = this.state;
    // remember whether the mouse yoke was engaged when the flight was interrupted (pause, help)
    if (prev === 'flying' && s !== 'flying') this._yokeWasOn = this.input.mouseEngaged;
    this.state = s;
    this.input.enabled = (s === 'flying');
    if (s !== 'flying') this.input.setMouse(false);
    if (s === 'flying') {
      this.ui.setModeMessage('');
      if ((prev === 'paused' || prev === 'school') && this._yokeWasOn) {
        // give the yoke back, blended in over a second so the mouse position cannot jerk the aircraft
        this.input.setMouse(true, true);
        this.ui.setModeMessage('MOUSE YOKE ON — you have control', '');
        setTimeout(() => { if (this.state === 'flying') this.ui.setModeMessage(''); }, 2500);
      }
      if (prev === 'menu' || prev === 'finished') this._yokeWasOn = false;
    }
  }

  bindActions() {
    this.input.onAction((name, arg) => this.onAction(name, arg));
  }

  onAction(name, arg) {
    const ac = this.sim.aircraft, inp = ac.input, st = ac.state;
    if (name === 'pause') { this.togglePause(); return; }
    if (name === 'menu') { if (this.state === 'flying') this.togglePause(); return; }
    if (name === 'help') { if (this.state === 'flying') { this.sim.paused = true; this.setState('school'); this.ui.showSchool((n) => this.anchorFor(n), (look) => { this.schoolLook = look; }); this.ui.onSchoolDone = () => { this.sim.paused = false; this.schoolLook = 0; this.setState('flying'); }; } return; }
    if (name === 'enter') { if (this.state === 'finished') this.ui.onAgain && this.ui.onAgain(); return; }
    if (this.state !== 'flying') return;
    if (this.demoAp && ['gear', 'flapsDown', 'flapsUp', 'speedbrake', 'toga'].includes(name)) this.disengageDemo();
    switch (name) {
      case 'gear': inp.gearDown = !inp.gearDown; this.audio.play('gear'); this.log('input', `gear ${inp.gearDown ? 'down' : 'up'}`); break;
      case 'flapsDown': if (inp.flapIndex < AC.flapDetents.length - 1) { inp.flapIndex++; this.audio.play('flaps'); this.log('input', `flaps ${AC.flapDetents[inp.flapIndex]}`); } break;
      case 'flapsUp': if (inp.flapIndex > 0) { inp.flapIndex--; this.audio.play('flaps'); this.log('input', `flaps ${AC.flapDetents[inp.flapIndex]}`); } break;
      case 'speedbrake': inp.speedbrake = inp.speedbrake > 0.5 ? 0 : 1; inp.speedbrakeArmed = false; this.audio.play('click'); this.log('input', `speedbrake ${inp.speedbrake ? 'up' : 'down'}`); break;
      case 'armSpeedbrake': inp.speedbrakeArmed = !inp.speedbrakeArmed; if (inp.speedbrakeArmed) inp.speedbrake = 0; this.audio.play('click'); this.log('input', `speedbrake ${inp.speedbrakeArmed ? 'armed' : 'disarmed'}`); break;
      case 'autobrake': inp.autobrake = (inp.autobrake + 1) % 5; this.audio.play('click'); this.log('input', `autobrake ${inp.autobrake}`); break;
      case 'toga': inp.throttle = 1; inp.reverse = false; inp.speedbrake = 0; this.audio.play('chime'); this.log('input', 'TOGA'); this.beginGoAround(true); break;
      case 'reposition': if (this.ctx.gaMode || st.alt > 900 || st.onGround) this.reposition(); break;
      case 'mouse': this.log('input', `mouse yoke ${arg ? 'on' : 'off'}`); break;
      case 'reverse': this.log('input', `reverse ${arg ? 'on' : 'off'}`); break;
      default: break;
    }
  }

  disengageDemo() { if (!this.demoAp) return; this.demoAp = null; this.audio.play('apdisc'); this.ui.setModeMessage('AUTOPILOT DISENGAGED — you have control', ''); setTimeout(() => this.ui.setModeMessage(''), 2500); this.log('demo', 'disengaged'); }

  togglePause() {
    if (this.state === 'flying') { this.sim.paused = true; this.setState('paused'); this.ui.show('pause', true); }
    else if (this.state === 'paused') { this.sim.paused = false; this.setState('flying'); this.ui.show('pause', false); }
  }

  quitToMenu() { this.setState('menu'); this.sim.paused = true; this.ui.showMenu(); this.audio.setConfigHorn(false); this.audio.stopStickShaker(); }

  reposition() {
    this.sim.reposition();
    this.ctx.gaMode = false; this.ctx.wasLow = false; this.ctx.gaTimer = 0;
    this.gpws.reset();
    this.ui.setModeMessage(`REPOSITIONED — ${this.sim.start.distanceNm} nm final`, 'ga');
    setTimeout(() => this.ui.setModeMessage(''), 2500);
    this.log('reposition', 'back on final');
    this.syncVisual();
  }

  beginGoAround(manual) {
    if (this.ctx.gaMode) return;
    this.ctx.gaMode = true; this.ctx.gaTimer = 0; this.ctx.goArounds++; this.ctx.gaMaxAgl = this.sim.state.agl; this.ctx.gaStartAgl = this.sim.state.agl;
    this.ui.setModeMessage('GO-AROUND — pitch up, gear up, flaps 15. Backspace = reposition on final', 'ga');
    this.audio.say('Go around, flaps fifteen', { priority: 1 });
    this.log('goaround', manual ? 'TOGA pressed' : 'detected');
  }

  // ------------------------------------------------------------------ per step
  preStep(dt) {
    // called before every physics sub-step (fixed dt)
    if (this.demoAp) {
      this.demoAp.update(dt);
      if (this.input.anyFlightKeyHeld() || this.input.mouseEngaged) this.disengageDemo();
    }
    if (this.fdAp && this.mode === 'training' && !this.demoAp) {
      // the flight director runs the same law against a shadow input to produce command bars
      const ac = this.sim.aircraft;
      Object.assign(this.shadowInput, { flapIndex: ac.input.flapIndex, gearDown: ac.input.gearDown, throttle: ac.input.throttle });
      this.fdAp.update(dt);
    }
  }

  update(frameDt) {
    const ac = this.sim.aircraft, st = ac.state, inp = ac.input;
    if (this.state === 'flying') {
      if (this.demoAp) { this.input.time += frameDt; if (this.input.anyFlightKeyHeld() || this.input.mouseEngaged) this.disengageDemo(); }
      else this.input.update(frameDt, inp, st);
    }
    const steps = this.sim.update(frameDt);
    if (steps > 0 && !this.sim.paused) {
      const dt = steps * this.sim.fixedDt;
      this.time += dt;
      this.ctx.elapsed += dt;
      this.track(dt);
      if (this.state === 'flying' && this.mode === 'training') this.instructor(dt);
    }
    this.syncVisual();
    // HUD
    const configWarning = this.gpws.hornOn ? 'GEAR NOT DOWN' : (st.destroyed ? 'CRASHED' : '');
    this.ui.updateHUD(st, { mouse: this.input.mouseEngaged, configWarning });
    this.ui.setCaption(this.gpws.caption, this.gpws.captionKind);
  }

  terrainAhead() {
    const st = this.sim.state;
    if (st.onGround) return false;
    if (this._taT !== undefined && st.time - this._taT < 0.5) return this._taV;
    this._taT = st.time;
    this._taV = this._terrainAheadCalc(st);
    return this._taV;
  }
  _terrainAheadCalc(st) {
    const hx = Math.sin(st.heading), hz = -Math.cos(st.heading);
    for (const d of [800, 1600, 2600]) {
      const h = TERRAIN.heightAt(st.x + hx * d, st.z + hz * d);
      if (h > 5 && st.alt - h < 120 + d * 0.05) return true;
    }
    return false;
  }

  track(dt) {
    const ac = this.sim.aircraft, st = ac.state, inp = ac.input, c = this.ctx;
    if (st.reverser > 0.5) c.usedReversers = true;
    if (st.speedbrake > 0.5 && st.onGround) c.usedSpeedbrake = true;
    c.maxBrake = Math.max(c.maxBrake, st.brake);
    if (!st.onGround) c.minAglOnApproach = Math.min(c.minAglOnApproach, st.agl);
    // go-around detection: was low, then full thrust + climbing
    if (!st.onGround && st.agl < 1500 * FT && st.distToThreshold > -200) c.wasLow = true;
    // automatic detection: full thrust held for 2 s while climbing away (a sloppy approach that
    // briefly balloons with high thrust must not count as a go-around)
    if (!st.onGround && inp.throttle > 0.9) { c.togaT = (c.togaT || 0) + dt; c.togaMinAgl = Math.min(c.togaMinAgl === undefined ? st.agl : c.togaMinAgl, st.agl); }
    else { c.togaT = 0; c.togaMinAgl = undefined; }
    if (!c.gaMode && c.wasLow && !st.onGround && c.togaT > 2 && st.vs > 2 && st.agl - c.togaMinAgl > 15 && !ac.touchdown) this.beginGoAround(false);
    if (c.gaMode) {
      c.gaTimer += dt; c.gaMaxAgl = Math.max(c.gaMaxAgl, st.agl);
      if (c.gaTimer > 8 && st.agl > 900 * FT && inp.gearDown === false && !this._gaHint) { this._gaHint = true; this.ui.setModeMessage('GO-AROUND complete — press Backspace to reposition on final, or fly a visual circuit', 'ga'); }
      // the go-around ends if the pilot is back on a stabilised approach below 1000 ft
      if (c.gaTimer > 30 && st.agl < 1000 * FT && st.vs < 0 && inp.throttle < 0.8) { c.gaMode = false; this._gaHint = false; this.ui.setModeMessage(''); this.log('goaround', 'ended, approach resumed'); }
    }
    // touchdown / crash events -> sounds & flash
    for (const e of ac.events.splice(0)) {
      if (e.type === 'touchdown') { c.touchdownSeen = true; this.audio.play(e.sink > AC.gear.hardSink ? 'hardlanding' : 'touchdown'); this.cockpit.shakeAmt = Math.min(0.06, 0.01 + e.sink * 0.012); this.log('touchdown', `${(e.sink / 0.00508).toFixed(0)} fpm at ${e.distFromThreshold.toFixed(0)} m`); if (this.ctx.gaMode) { this.ctx.gaMode = false; } }
      else if (e.type === 'spoilers') { this.audio.play('click'); this.log('systems', 'ground spoilers deployed'); }
      else if (e.type === 'liftoff') { this.log('bounce', `bounce ${e.bounce}`); }
      else if (['gearcollapse', 'destroyed', 'bellycontact', 'wingstrike', 'tailstrike', 'enginestrike', 'nosefirst'].includes(e.type)) {
        this.audio.play('crash'); this.ui.flash(0.9); this.cockpit.shakeAmt = 0.12; this.log('damage', e.reason || e.type);
        if (e.type === 'destroyed') c.crashSeen = true;
      }
      else if (e.type === 'hardlanding') { this.log('damage', 'hard landing'); }
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
    if (st.onGround && st.groundSpeed > 5 && inp.reverse && st.groundSpeed < 30 * KTS && !this._revHint) { this._revHint = true; }
  }

  finish() {
    const c = this.ctx;
    c.finished = true;
    const res = evaluateLanding(this.sim.aircraft, c);
    this.result = res;
    this.setState('finished');
    this.sim.paused = true;
    this.audio.setConfigHorn(false); this.audio.stopStickShaker();
    this.ui.setInstructor('');
    this.ui.setModeMessage('');
    this.ui.showResults(res);
    this.log('result', `${res.outcome} ${res.score} ${res.grade} — ${res.headline}`);
    if (res.success) this.audio.say(res.score >= 78 ? 'Nice landing, Captain' : 'We are down', { priority: 1 }); else this.audio.play('caution');
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
    if (this.demoAp) { this.ui.setInstructor('Watch the demo: notice the small, smooth control inputs and how thrust is used to hold the speed.'); return; }
    if (st.onGround && this.sim.aircraft.touchdown) {
      if (st.groundSpeed > 30 * KTS) hints.push(`<b>Rolling out.</b> Hold <kbd>R</kbd> for reverse thrust and <kbd>B</kbd> to brake. Keep straight with <kbd>A</kbd>/<kbd>D</kbd>.`);
      else if (st.groundSpeed > 1) hints.push('Stow the reversers below 60 kts (release <kbd>R</kbd>) and brake to a stop.');
    } else if (c.gaMode) {
      hints.push('<b>Go-around:</b> pitch to +12° with full thrust, gear up when climbing (<kbd>G</kbd>), flaps 15 (<kbd>V</kbd>). Above 1000 ft press <kbd>Backspace</kbd> to reposition.');
    } else if (aglFt < 60) {
      hints.push(aglFt < 35 ? '<b>Flare!</b> Raise the nose 2–3° and close the throttle (<kbd>S</kbd>). Hold it… let it settle.' : 'Approaching the flare. Wings level, aim for the touchdown zone, throttle coming back.');
      if (Math.abs(st.crabDeg) > 3) hints.push(`Kick off the crab: rudder <kbd>${st.crabDeg > 0 ? 'A' : 'D'}</kbd> to align with the runway.`);
    } else {
      // configuration schedule
      if (dNm > 8 && inp.flapIndex < 2 && st.ias < 220) hints.push('Select <b>flaps 5</b> (<kbd>F</kbd>).');
      if (dNm <= 8 && dNm > 6 && inp.flapIndex < 3 && st.ias < 195) hints.push('Slow to about 160 kts and select <b>flaps 15</b> (<kbd>F</kbd>).');
      if (dNm <= 7 && !inp.gearDown) hints.push('<b>Gear down</b> (<kbd>G</kbd>) — you are near glideslope intercept.');
      if (dNm <= 6 && inp.flapIndex < 4 && st.ias < 168) hints.push('<b>Flaps 30</b> (<kbd>F</kbd>) — landing flaps. Speed target Vref+5 = ' + target + ' kts.');
      if (dNm <= 5 && !inp.speedbrakeArmed && st.speedbrake < 0.1) hints.push('Arm the speedbrakes (<kbd>X</kbd>) and set autobrake 2 or 3 (<kbd>N</kbd>).');
      // energy
      // target speeds per configuration: flaps 5 ~175, flaps 15 ~162, landing flaps Vref+5
      const dv = st.ias - (inp.flapIndex >= 4 ? target : (inp.flapIndex >= 3 ? 162 : (inp.flapIndex >= 2 ? 175 : 210)));
      if (dv > 12) hints.push(`Speed high (+${dv.toFixed(0)}): reduce thrust (<kbd>S</kbd>).`);
      else if (dv < -10) hints.push(`Speed low (${dv.toFixed(0)}): add thrust (<kbd>W</kbd>) — do not raise the nose to hold altitude.`);
      // glideslope
      if (dNm < 12 && st.gsDev > 0.4) hints.push('Above the glideslope: lower the nose a little, reduce thrust.');
      else if (dNm < 12 && st.gsDev < -0.4) hints.push('Below the glideslope: raise the nose a little and add a touch of thrust.');
      if (Math.abs(st.locDev) > 0.5 && dNm < 12) hints.push(`${st.locDev > 0 ? 'Right' : 'Left'} of the centreline: bank ${st.locDev > 0 ? 'left' : 'right'} a few degrees to rejoin.`);
      if (Math.abs(st.roll) > 12 * DEG) hints.push('Bank angle too large — ease off the roll input.');
      if (aglFt < 500 && (Math.abs(st.gsDev) > 0.7 || Math.abs(st.locDev) > 1.2 || st.ias > target + 20)) hints.push('<b>Unstable approach — consider a go-around (<kbd>T</kbd>).</b>');
      if (!hints.length) hints.push(dNm > 2 ? 'Nicely stable. Small corrections only; keep the diamonds centred and the speed on target.' : 'On profile. Look at the runway, keep it steady.');
    }
    this.ui.setInstructor(hints.slice(0, 2).join('<br>'));
  }

  // ------------------------------------------------------------------ visual sync
  syncVisual() {
    const b = this.sim.aircraft.body;
    this.aircraftGroup.position.set(b.position.x, b.position.y, b.position.z);
    this.aircraftGroup.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  }

  fdCommand() {
    if (this.mode !== 'training' || !this.fdAp || this.demoAp) return null;
    const st = this.sim.state, sh = this.shadowInput;
    if (st.onGround) return null;
    return { pitch: st.pitch + clamp(sh.pitch, -1, 1) * 6 * DEG, roll: st.roll + clamp(sh.roll, -1, 1) * 20 * DEG };
  }

  render(frameDt) {
    const st = this.sim.state, inp = this.sim.aircraft.input;
    this.cockpit.eyeWorld(this.eye);
    const papi = this.world.lights.papiWhites(this.eye);
    const checklist = this.mode === 'training' && !st.onGround ? [
      { text: 'Flaps 30', done: inp.flapIndex >= 4 }, { text: 'Gear down', done: inp.gearDown }, { text: 'Speedbrake armed', done: inp.speedbrakeArmed || st.speedbrake > 0.5 }, { text: 'Autobrake set', done: inp.autobrake > 0 },
    ] : null;
    const look = { yaw: this.input.look.yaw, pitch: this.input.look.pitch, down: this.input.look.down ? 1 : (this.schoolLook || 0) };
    this.ui.setChecklist(this.state === 'flying' ? checklist : null);
    this.cockpit.update(st, inp, frameDt, {
      look, fd: this.fdCommand(), targetSpeed: !st.onGround ? st.vref + 5 : null, papi, checklist,
      gaMode: this.ctx.gaMode, rain: this.world.rain.visible, autothrottle: !!this.demoAp,
      rollMode: this.demoAp ? 'LOC' : (this.mode === 'training' ? 'FD' : ''), pitchMode: this.demoAp ? 'G/S' : (this.mode === 'training' ? 'FD' : ''),
    });
    this.world.update(frameDt, st, this.eye);
    this.audio.update(frameDt, st, { rain: this.world.rain.visible ? 1 : 0 });
    if (this.world.lightningFlash > 0.95) { this.ui.flash(0.5); setTimeout(() => this.audio.play('thunder'), 800 + Math.random() * 1500); }
    this.world.render();
  }
}
