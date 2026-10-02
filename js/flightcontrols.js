// The one owner of the aircraft's control inputs (aircraft.input).
//
// Exactly one pilot has command at a time: the player, through their devices (keyboard, mouse,
// touch, tilt, controller: InputManager), or the demo autoland (Autopilot). The player grabbing a
// control takes command back from the autoland. Discrete actions (gear, flaps, speedbrakes,
// autobrake, TO/GA) are applied here, whoever asks for them. The Flight School flight director
// flies the same autopilot law on a copy of the controls, so its guidance never moves the aircraft.
//
// The player can also engage the autothrottle (js/autothrottle.js) for a manual landing: it moves
// the thrust levers before every physics step, and the player's devices moving them disconnect it.
//
// The player's devices are anything with this shape:
//   update(dt, input, state)  move the controls for dt of simulated time
//   idle(dt)                  time passes while the autoland flies
//   grabbing()                the player is holding a flight control right now
import { AIRCRAFT as AC } from './config.js';
import { Autopilot } from './autopilot.js';
import { Autothrottle } from './autothrottle.js';

export class FlightControls {
  constructor(aircraft, player = null) {
    this.ac = aircraft;
    this.player = player;
    this.autopilot = null;      // the demo autoland, while it has command
    this.director = null;       // the flight director: an autopilot flying `shadow`
    this.shadow = null;
    this.autothrottle = new Autothrottle();   // the player's, for a manual landing
    this.onAutothrottle = null;               // (engaged, reason): it engaged or disengaged
  }

  get input() { return this.ac.input; }
  get commander() { return this.autopilot ? 'autopilot' : 'player'; }
  grabbing() { return !!(this.player && this.player.grabbing()); }

  /** The autoland flies its own autothrottle: the player's disengages without a word. */
  engageAutopilot(opts = {}) { this.autothrottle.disengage(); this.autopilot = new Autopilot(this.ac, opts); return this.autopilot; }
  /** Hand command back to the player. Returns whether the autoland had it. */
  disengageAutopilot() { const had = !!this.autopilot; this.autopilot = null; return had; }

  enableDirector() {
    this.shadow = Object.assign({}, this.ac.input);
    this.director = new Autopilot(this.ac, { goAround: false });   // the pilot decides when to go around
    this.director.inputTarget = this.shadow;
  }

  /**
   * Once per frame while flying: the player's devices move the controls (dt is simulated time, so
   * a slowed simulation sees the same control movements as real time). While the autoland flies,
   * the devices only keep time. Returns true when the player just took command from the autoland.
   */
  frame(dt, wallDt, state) {
    if (this.autopilot) {
      if (this.player) this.player.idle(wallDt);
      return this.grabbing() && this.disengageAutopilot();
    }
    if (this.player) {
      // the levers moved by hand (or reverse selected) while the autothrottle has them: disconnect
      const inp = this.ac.input, lever = inp.throttle, rev = inp.reverse;
      this.player.update(dt, inp, state);
      if (this.autothrottle.engaged && (inp.throttle !== lever || (inp.reverse && !rev))) this.setAutothrottle(false, 'manual');
    }
    return false;
  }

  /** Engage or disengage the player's autothrottle. Returns whether it changed. */
  setAutothrottle(on, reason = '') {
    const changed = on ? !this.autothrottle.engaged && this.autothrottle.engage(this.ac.state) : this.autothrottle.disengage();
    if (changed && this.onAutothrottle) this.onAutothrottle(on, reason);
    return changed;
  }

  /** Before every physics step: the autoland flies; the flight director computes its guidance. Returns true on a takeover. */
  step(dt) {
    let takeover = false;
    if (this.autopilot) {
      this.autopilot.update(dt);
      takeover = this.grabbing() && this.disengageAutopilot();
    } else if (this.autothrottle.engaged && this.autothrottle.update(dt, this.ac.input, this.ac.state) && this.onAutothrottle) {
      this.onAutothrottle(false, 'landed');
    }
    if (this.director && !this.autopilot) {
      const inp = this.ac.input;
      Object.assign(this.shadow, { flapIndex: inp.flapIndex, gearDown: inp.gearDown, throttle: inp.throttle });
      this.director.update(dt);
    }
    return takeover;
  }

  /**
   * A discrete action. Returns { name, value } for what changed, or null when nothing did
   * (flaps already at a stop, an unknown action).
   */
  act(name) {
    const inp = this.ac.input;
    switch (name) {
      case 'gear': inp.gearDown = !inp.gearDown; return { name, value: inp.gearDown };
      case 'flapsDown': if (inp.flapIndex >= AC.flapDetents.length - 1) return null; inp.flapIndex++; return { name, value: inp.flapIndex };
      case 'flapsUp': if (inp.flapIndex <= 0) return null; inp.flapIndex--; return { name, value: inp.flapIndex };
      case 'speedbrake': inp.speedbrake = inp.speedbrake > 0.5 ? 0 : 1; inp.speedbrakeArmed = false; return { name, value: inp.speedbrake };
      case 'armSpeedbrake': inp.speedbrakeArmed = !inp.speedbrakeArmed; if (inp.speedbrakeArmed) inp.speedbrake = 0; return { name, value: inp.speedbrakeArmed };
      case 'autobrake': inp.autobrake = (inp.autobrake + 1) % 5; return { name, value: inp.autobrake };
      case 'toga': inp.throttle = 1; inp.reverse = false; inp.speedbrake = 0; this.autothrottle.goAround(); return { name, value: true };
      default: return null;
    }
  }
}
