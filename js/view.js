// The 3D view of a flight: the aircraft (with the flight deck and the camera in it) placed from the
// published physics state, the displays and levers updated, the world around it, and the drawing.
// It reads the game and never changes it.
//
// Two first-person views from the captain's eye point:
//   cockpit   the flight deck around the eye, looking 15° down so the panel shows (the PANEL look
//             tilts further down to it)
//   head-up   the flight deck hidden and a head-up display over the outside world (js/hud.js), like
//             X-Plane's "forward with HUD" or a 737 flown on its head-up guidance system. The eye
//             looks 6° below the nose, so on the approach the runway is near the middle of the
//             screen, and the field of view is about 100° wide on any screen shape.
// Flight School always shows the cockpit: its pages point at the flight deck.
//
// From either view, the ND view leans in to the captain's navigation display, the way Microsoft
// Flight Simulator's instrument views frame a display: the camera moves in front of it until it
// fills most of the screen (MAP on a phone, J on a computer). There is one navigation display, the
// flight deck's; nothing copies it over the view.
import * as THREE from 'three';
import { DEG } from './config.js';

const COCKPIT_PITCH = -15 * DEG, HUD_PITCH = -6 * DEG, COCKPIT_FOV = 70;
const ND_FOV = 30;                          // the ND view's vertical field of view (deg)
/** The head-up view's vertical field of view (degrees) for a screen shape: about 100° across, 45–70° high. */
export function hudFov(aspect) {
  return Math.min(70, Math.max(45, 2 * Math.atan(Math.tan(50 * DEG) / aspect) / DEG));
}

export class GameView {
  /**
   * @param game    the rules (js/game.js), read only
   * @param world   js/world/scene.js
   * @param cockpit js/cockpit/cockpit.js
   * @param look    { yaw, pitch, down } where the player is looking (InputManager.look)
   */
  constructor({ game, world, cockpit, look, hud = null }) {
    this.game = game; this.world = world; this.cockpit = cockpit; this.look = look;
    this.hud = hud;                             // js/hud.js HeadUpDisplay (the head-up view's symbols)
    this.mode = 'cockpit';                      // 'cockpit' | 'hud', chosen by the player
    this.onMode = null;                         // (mode) => void: the choice changed
    this.ndView = false;                        // leaning in to the ND (over either view)
    this.ndFrame = { h: 0.7, cx: 0.5, cy: 0.5 }; // where the ND sits in the ND view (fractions of the screen)
    this.speedTrend = { ias: 0, t: -1, rate: 0 };
    this.aircraft = new THREE.Group();          // follows the aircraft; the flight deck and camera hang in it
    this.aircraft.add(cockpit.group);
    world.cockpitScene.add(this.aircraft);
    this.eye = new THREE.Vector3();             // the pilot's eye, world space
    this.schoolLook = 0;                        // Flight School tilts the view down to the panel (0..1)
    this.raining = false;
    game.on('start', ({ scenario, night }) => {
      world.applyScenario(scenario, night);
      cockpit.setNight(night || scenario.timeOfDay !== 'day');
      this.raining = scenario.rain > 0;
      this.schoolLook = 0;
      this.ndView = false;
      this.sync();
    });
    game.on('state', ({ state, prev }) => { if (prev === 'school') this.schoolLook = 0; if (state === 'school' || state === 'menu') this.ndView = false; });
    game.on('reposition', () => this.sync());
    this.sync();
  }

  /** Place the aircraft from the physics state. */
  sync() {
    const st = this.game.sim.state, q = st.quat;
    this.aircraft.position.set(st.x, st.y, st.z);
    this.aircraft.quaternion.set(q[0], q[1], q[2], q[3]);
  }

  /** The view shown now: the player's choice, 'nd' while leaning in to the ND; Flight School shows the cockpit. */
  get shown() { return this.game.state === 'school' ? 'cockpit' : (this.ndView ? 'nd' : this.mode); }

  /** Lean in to the navigation display, or back to the view chosen. */
  setNdView(on) { this.ndView = !!on && this.game.state !== 'school'; }
  /** The camera is in front of the ND (the move has finished). */
  get ndSettled() { return this.ndView && this.cockpit.focus >= 1; }

  setMode(mode) {
    if (mode !== 'cockpit' && mode !== 'hud') return;
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.onMode) this.onMode(mode);
  }

  /**
   * A view control: 'toggle' switches cockpit ↔ head-up (the keyboard, where the panel is a held
   * key); 'cycle' steps cockpit → panel → head-up → cockpit (the touch VIEW button and the
   * controller's right stick press).
   */
  camera(action) {
    if (this.ndView) { this.ndView = false; return; }   // any view change first leaves the ND view
    if (action === 'toggle') { this.look.down = false; this.setMode(this.mode === 'hud' ? 'cockpit' : 'hud'); return; }
    if (action !== 'cycle') return;
    if (this.mode === 'hud') { this.look.down = false; this.setMode('cockpit'); }
    else if (!this.look.down) this.look.down = true;
    else { this.look.down = false; this.setMode('hud'); }
  }

  /** Camera shake (m), e.g. at touchdown; it dies away by itself. */
  shake(amount) { this.cockpit.shakeAmt = amount; }

  /** Screen position of a named flight-deck part (Flight School highlights). */
  anchorFor(name) {
    const a = this.cockpit.anchorScreen(name, this.world.renderer);
    if (!a) return null;
    const sizes = { windshield: 420, attitude: 130, airspeed: 60, altimeter: 60, nd: 130, pfd: 150, upper: 150, lower: 150, gear: 70, flapLever: 70, throttle: 110, speedbrake: 70, trim: 90, rudder: 160, yoke: 160, mcp: 300 };
    return { x: a.x, y: a.y, size: sizes[name] || 120, aspect: name === 'windshield' ? 0.6 : (name === 'airspeed' || name === 'altimeter' ? 3.5 : 1) };
  }

  /** Per frame: the aircraft, the flight deck (displays, levers, camera) and the world around the eye. */
  update(frameDt) {
    const g = this.game, st = g.sim.state, inp = g.sim.aircraft.input;
    this.sync();
    this.cockpit.eyeWorld(this.eye);
    const look = { yaw: this.look.yaw, pitch: this.look.pitch, down: this.look.down ? 1 : (this.schoolLook || 0) };
    const demo = !!g.demoAp;
    // what the autoland has selected and the modes it flies (the pilot's defaults without it)
    const fma = demo ? g.demoAp.fma : null, mcp = demo ? g.demoAp.mcp : null;
    // the flight deck is drawn while the camera leans in to the ND or back out of it, and the field
    // of view narrows with the move (it eases: cockpit.focus)
    const f = this.cockpit.focus, s = f * f * (3 - 2 * f);
    const hud = this.shown === 'hud' && f === 0, cam = this.world.camera;
    const headUp = this.mode === 'hud' && this.game.state !== 'school';
    const fov = (headUp ? hudFov(cam.aspect) : COCKPIT_FOV) * (1 - s) + ND_FOV * s;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.world.drawCockpit = !hud;
    this.cockpit.update(st, inp, frameDt, {
      // the selected speed: the autoland's on its MCP, otherwise the approach's Vref + 5
      look, fd: g.fdCommand(), targetSpeed: !st.onGround ? (mcp ? mcp.spd : st.vref + 5) : null, papi: this.world.lights.papiWhites(this.eye), checklist: g.checklist(),
      gaMode: g.ctx.gaMode, rain: this.raining, autothrottle: fma ? fma.at : '',
      rollMode: fma ? fma.roll : (g.mode === 'training' ? 'FD' : ''), pitchMode: fma ? fma.pitch : (g.mode === 'training' ? 'FD' : ''),
      mcp, efis: g.efis, nd: g.ndOpts(),
      hidden: hud, viewPitch: headUp ? HUD_PITCH : COCKPIT_PITCH,
      focus: this.ndView, focusFov: ND_FOV, focusFrame: this.ndFrame,
    });
    // the speed trend for the display's acceleration caret (kt per simulated second, smoothed)
    const tr = this.speedTrend;
    if (tr.t < 0 || st.time < tr.t) { tr.ias = st.ias; tr.t = st.time; tr.rate = 0; }
    else if (st.time - tr.t > 0.05) { const r = (st.ias - tr.ias) / (st.time - tr.t), k = Math.min(1, (st.time - tr.t) / 0.6); tr.rate += (r - tr.rate) * k; tr.ias = st.ias; tr.t = st.time; }
    this.world.update(frameDt, st, this.eye);
    // keep the camera's matrices current even on frames that are not drawn (the Flight School
    // highlights project flight-deck parts onto the screen)
    this.world.cockpitScene.updateMatrixWorld(true);
  }

  draw() {
    this.world.render();
    if (!this.hud) return;
    // the head-up display is fixed ahead of the eye: it leaves the view when the pilot looks away
    const g = this.game, st = g.sim.state, c = this.cockpit;
    const ahead = Math.abs(c.lookYaw) < 0.35 && Math.abs(c.lookPitch) < 0.3 && c.lookDown < 0.3;
    this.hud.render(this.world.camera, st, {
      visible: this.shown === 'hud' && c.focus === 0 && g.state !== 'menu' && ahead,
      target: !st.onGround && st.flapIndex >= 4 ? st.vref + 5 : null, accel: this.speedTrend.rate, fd: g.fdCommand(),
    });
  }
}
