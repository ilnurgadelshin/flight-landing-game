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
import * as THREE from 'three';
import { DEG } from './config.js';

const COCKPIT_PITCH = -15 * DEG, HUD_PITCH = -6 * DEG, COCKPIT_FOV = 70;
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
      this.sync();
    });
    game.on('state', ({ prev }) => { if (prev === 'school') this.schoolLook = 0; });
    game.on('reposition', () => this.sync());
    this.sync();
  }

  /** Place the aircraft from the physics state. */
  sync() {
    const st = this.game.sim.state, q = st.quat;
    this.aircraft.position.set(st.x, st.y, st.z);
    this.aircraft.quaternion.set(q[0], q[1], q[2], q[3]);
  }

  /** The view shown now: the player's choice, except that Flight School shows the cockpit. */
  get shown() { return this.game.state === 'school' ? 'cockpit' : this.mode; }

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
    const hud = this.shown === 'hud', cam = this.world.camera;
    const fov = hud ? hudFov(cam.aspect) : COCKPIT_FOV;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.world.drawCockpit = !hud;
    this.cockpit.update(st, inp, frameDt, {
      look, fd: g.fdCommand(), targetSpeed: !st.onGround ? st.vref + 5 : null, papi: this.world.lights.papiWhites(this.eye), checklist: g.checklist(),
      gaMode: g.ctx.gaMode, rain: this.raining, autothrottle: demo,
      rollMode: demo ? 'LOC' : (g.mode === 'training' ? 'FD' : ''), pitchMode: demo ? 'G/S' : (g.mode === 'training' ? 'FD' : ''),
      hidden: hud, viewPitch: hud ? HUD_PITCH : COCKPIT_PITCH,
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
      visible: this.shown === 'hud' && g.state !== 'menu' && ahead,
      target: !st.onGround && st.flapIndex >= 4 ? st.vref + 5 : null, accel: this.speedTrend.rate, fd: g.fdCommand(),
    });
  }
}
