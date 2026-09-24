// How the game reaches the player: sound, vibration and the screens (HUD, mode line, instructor,
// checklist, Flight School, pause, results). It listens to the rules' events (js/game.js) and
// never decides anything about the flight.
//
// It also looks after the player's devices around the flight: they fly only while flying, a
// mouse yoke that was engaged comes back after a pause or Flight School, a new flight starts
// with every control let go, and the controller's buttons work the menus. The devices' actions
// come in through onAction(): menu navigation is handled here, everything else goes to the rules.
import { ndModel, drawND } from './nd.js';
import { chartModel, drawChart } from './chart.js';
import { debriefModel, drawDebrief } from './debrief.js';
import { getScheme } from './controls.js';

const CONTROL_SOUNDS = { gear: 'gear', flapsDown: 'flaps', flapsUp: 'flaps', speedbrake: 'click', armSpeedbrake: 'click', autobrake: 'click', toga: 'chime', ndRange: 'click', ndMode: 'click' };
const ND_PERIOD = 0.1;               // s between redraws of the navigation display over the view
const CHART_PERIOD = 0.25;           // s between redraws of the approach chart (its own-ship)

export class Presentation {
  constructor({ game, view, world, ui, audio, gpws = null, haptics = null, touch = null, input }) {
    Object.assign(this, { game, view, ui, audio, gpws, haptics, touch, input });
    this.yokeWasOn = false;          // the mouse yoke was engaged when the flight was interrupted
    this.raining = false;
    this.msgSeq = 0;
    this.soundWait = 0;              // s the sound has been waiting for a gesture while the controller is in use
    this.soundHintOn = false;
    // the navigation display over the view: a phone's MAP panel (closed until MAP is tapped) and the
    // head-up view's inset on a computer (on until J turns it off)
    this.nav = { panel: false, inset: true, wait: 0, canvas: null };
    this.chart = { open: false, wait: 0, canvas: null };
    ui.onChart = (open) => this.setChart(open);
    const on = (type, fn) => game.on(type, fn);

    on('start', ({ opts, scenario }) => {
      this.yokeWasOn = false;        // a new flight never inherits the previous flight's yoke engagement
      input.resetTouch();            // nor a held stick or a latched reverse lever
      if (haptics) haptics.reset();
      input.opts.invertPitch = !!opts.invertPitch;
      input.opts.mouseSensitivity = opts.mouseSensitivity || 1;
      audio.setEnabled(opts.sound !== false);
      audio.log.length = 0;
      this.raining = scenario.rain > 0;
      ui.show('menu', false); ui.show('results', false); ui.show('pause', false);
      this.setChart(false);
      ui.show('hud', true);
      ui.setRain(this.raining);
    });
    on('state', ({ state: s, prev }) => {
      if (prev === 'flying' && s !== 'flying') this.yokeWasOn = input.mouseEngaged;
      input.enabled = s === 'flying';
      if (s !== 'flying') input.setMouse(false);
      if (s === 'flying') {
        input.pad.holdoff = true;    // a controller button still held from a menu press does not fly
        if ((prev === 'paused' || prev === 'school') && this.yokeWasOn) {
          // give the yoke back, blended in over a second so the mouse position cannot jerk the aircraft
          input.setMouse(true, true);
          this.message('MOUSE YOKE ON — you have control', '', 2.5);
        }
        if (prev === 'menu' || prev === 'finished') this.yokeWasOn = false;
      }
      ui.show('pause', s === 'paused');
      if (s === 'menu') { ui.showMenu(); audio.setConfigHorn(false); audio.stopStickShaker(); }
      if (s === 'menu' || s === 'school' || s === 'finished') this.setChart(false);
    });
    on('school', () => {
      ui.showSchool((name) => view.anchorFor(name), (look) => { view.schoolLook = look; });
      ui.onSchoolDone = (skipped) => game.schoolDone(skipped);
    });
    on('message', ({ text, kind, duration }) => this.message(text, kind, duration));
    on('instructor', ({ html }) => ui.setInstructor(html));
    on('control', ({ name }) => audio.play(CONTROL_SOUNDS[name]));
    on('goaround', () => audio.say('Go around, flaps fifteen', { priority: 1 }));
    on('demo', () => audio.play('apdisc'));
    on('touchdown', ({ sink, hard }) => {
      audio.play(hard ? 'hardlanding' : 'touchdown');
      if (haptics) haptics.touchdown(sink, hard);
      view.shake(Math.min(0.06, 0.01 + sink * 0.012));
    });
    on('spoilers', () => audio.play('click'));
    on('damage', () => { audio.play('crash'); ui.flash(0.9); if (haptics) haptics.crash(); view.shake(0.12); });
    on('finish', ({ result }) => {
      audio.setConfigHorn(false); audio.stopStickShaker();
      this.lastDebrief = debriefModel(game.path);
      ui.showResults(result, (ctx) => drawDebrief(ctx, this.lastDebrief));
      if (result.success) audio.say(result.score >= 78 ? 'Nice landing, Captain' : 'We are down', { priority: 1 }); else audio.play('caution');
    });
    // lightning: a flash on the screen, thunder a moment later
    world.onLightning = () => { ui.flash(0.5); setTimeout(() => audio.play('thunder'), 800 + Math.random() * 1500); };
  }

  /** The mode line. A message with a duration (s) clears itself unless another has replaced it. */
  message(text, kind = '', duration = 0) {
    const seq = ++this.msgSeq;
    this.ui.setModeMessage(text, kind);
    if (text && duration > 0) setTimeout(() => { if (this.msgSeq === seq) this.ui.setModeMessage(''); }, duration * 1000);
  }

  /** An action from a device: menu navigation here, everything else to the rules. */
  onAction(name, arg) {
    if (name === 'padButton') { this.padButton(arg); return; }
    if (name === 'camera') { this.view.camera(arg); return; }            // the view is not the rules' business
    if (name === 'chart') { this.setChart(!this.chart.open); return; }
    if (name === 'menu' && this.chart.open) { this.setChart(false); return; }   // Escape closes the chart first
    // a controller or keyboard on a phone: the range and mode controls open the MAP panel first
    if ((name === 'ndRange' || name === 'ndMode') && getScheme() === 'touch' && !this.nav.panel) { this.nav.panel = true; this.nav.wait = 0; this.audio.play('click'); return; }
    if (name === 'ndInset') {
      if (getScheme() === 'touch') this.nav.panel = !this.nav.panel; else this.nav.inset = !this.nav.inset;
      this.nav.wait = 0; this.audio.play('click');
      return;
    }
    if (name === 'enter') { if (this.game.state === 'finished' && this.ui.onAgain) this.ui.onAgain(); return; }
    this.game.action(name, arg);
  }

  /**
   * The approach chart (js/chart.js), over the flight or the pause menu. The flight goes on under it:
   * a pilot reads the chart while flying.
   */
  setChart(open) {
    const s = this.game.state;
    open = !!open && (s === 'flying' || s === 'paused');
    if (open === this.chart.open) return;
    this.chart.open = open;
    this.chart.canvas = this.ui.showChart(open);
    this.chart.wait = 0;
    this.audio.play('click');
    if (open) this.drawChart();
  }
  drawChart() {
    this.lastChart = chartModel(this.game.sim.state);
    drawChart(this.chart.canvas.getContext('2d'), this.lastChart);
  }

  /** Controller buttons outside flying: Menu / A confirm, B goes back, Menu pauses in flight. Y: the chart. */
  padButton(b) {
    const ui = this.ui, game = this.game;
    if (this.chart.open) { if (b === 'A' || b === 'B' || b === 'Y' || b === 'Menu') this.setChart(false); return; }
    if (game.state === 'paused' && b === 'Y') { this.setChart(true); return; }
    switch (game.state) {
      case 'menu': if (b === 'Menu' || b === 'A') { if (ui.onStart) ui.onStart(ui.getOptions()); } break;
      case 'school': if (b === 'A') ui.schoolStep(1); else if (b === 'B') ui.schoolStep(-1); else if (b === 'Menu') ui.hideSchool(true); break;
      case 'paused': if (b === 'Menu' || b === 'A') game.togglePause(); else if (b === 'B' && ui.onQuit) ui.onQuit(); break;
      case 'finished': if ((b === 'A' || b === 'Menu') && ui.onAgain) ui.onAgain(); else if (b === 'B' && ui.onQuit) ui.onQuit(); break;
      case 'flying': if (b === 'Menu') game.togglePause(); break;
      default: break;
    }
  }

  /** Per frame, after the rules: vibration, the HUD and its captions, the touch controls' state. simDt: simulated time that passed. */
  frame(frameDt, simDt) {
    const g = this.game, st = g.sim.state, inp = g.sim.aircraft.input;
    if (this.haptics && simDt > 0 && g.state === 'flying') this.haptics.update(simDt, st);
    const configWarning = this.gpws && this.gpws.hornOn ? 'GEAR NOT DOWN' : (st.destroyed ? 'CRASHED' : '');
    const view = this.view.shown;
    this.ui.setView(view);
    this.ui.updateHUD(st, { mouse: this.input.mouseEngaged, pad: this.input.pad.active, configWarning, fd: g.fdCommand(), headUp: view === 'hud' });
    if (this.touch) this.touch.sync(st, inp, { gaMode: g.ctx.gaMode, view });
    if (this.gpws) this.ui.setCaption(this.gpws.caption, this.gpws.captionKind);
    this.ui.setChecklist(g.state === 'flying' ? g.checklist() : null);
    this.navDisplay(frameDt, view);
    if (this.chart.open) { this.chart.wait -= frameDt; if (this.chart.wait <= 0) { this.chart.wait = CHART_PERIOD; this.drawChart(); } }
  }

  /** The navigation display over the view, redrawn ten times a second while shown. */
  navDisplay(frameDt, view) {
    const g = this.game, n = this.nav, touch = getScheme() === 'touch';
    const up = g.state === 'flying' || g.state === 'paused';
    const kind = !up ? '' : (touch ? (n.panel ? 'panel' : '') : (n.inset && view === 'hud' ? 'inset' : ''));
    const canvas = this.ui.setNavDisplay(kind);
    if (!canvas) { n.canvas = null; return; }
    n.wait -= frameDt;
    if (canvas === n.canvas && n.wait > 0) return;
    n.canvas = canvas; n.wait = ND_PERIOD;
    this.lastNd = ndModel(g.sim.state, g.efis, g.ndOpts());
    drawND(canvas.getContext('2d'), this.lastNd, { big: touch });
  }

  /**
   * Every frame, in the menus too: a player using only a controller cannot start the sound (its
   * buttons are not a gesture, except its first press in Safari), so after half a second of
   * silence the screen says how. A tap, click or key starts it and the note goes.
   */
  soundHint(frameDt) {
    this.soundWait = this.input.pad.active && this.audio.enabled && !this.audio.running ? this.soundWait + frameDt : 0;
    const on = this.soundWait > 0.5;
    if (on !== this.soundHintOn) { this.soundHintOn = on; this.ui.setSoundHint(on); }
  }

  /** Per frame, after the view: engine, wind, rain and rolling sounds. */
  sound(frameDt) { this.audio.update(frameDt, this.game.sim.state, { rain: this.raining ? 1 : 0 }); }
}
