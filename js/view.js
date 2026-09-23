// The 3D view of a flight: the aircraft (with the flight deck and the camera in it) placed from the
// published physics state, the displays and levers updated, the world around it, and the drawing.
// It reads the game and never changes it.
import * as THREE from 'three';

export class GameView {
  /**
   * @param game    the rules (js/game.js), read only
   * @param world   js/world/scene.js
   * @param cockpit js/cockpit/cockpit.js
   * @param look    { yaw, pitch, down } where the player is looking (InputManager.look)
   */
  constructor({ game, world, cockpit, look }) {
    this.game = game; this.world = world; this.cockpit = cockpit; this.look = look;
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
    this.cockpit.update(st, inp, frameDt, {
      look, fd: g.fdCommand(), targetSpeed: !st.onGround ? st.vref + 5 : null, papi: this.world.lights.papiWhites(this.eye), checklist: g.checklist(),
      gaMode: g.ctx.gaMode, rain: this.raining, autothrottle: demo,
      rollMode: demo ? 'LOC' : (g.mode === 'training' ? 'FD' : ''), pitchMode: demo ? 'G/S' : (g.mode === 'training' ? 'FD' : ''),
    });
    this.world.update(frameDt, st, this.eye);
    // keep the camera's matrices current even on frames that are not drawn (the Flight School
    // highlights project flight-deck parts onto the screen)
    this.world.cockpitScene.updateMatrixWorld(true);
  }

  draw() { this.world.render(); }
}
