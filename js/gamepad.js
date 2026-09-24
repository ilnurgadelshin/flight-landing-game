// Game controllers through the Gamepad API. Xbox, PlayStation, Switch Pro and most Bluetooth
// controllers are mapped by the browser to the W3C "standard" layout; the layout below follows
// Microsoft Flight Simulator's default controller scheme where it has one:
//   left stick  pitch / roll                 right stick  look around (press it: next view)
//   LT / RT     rudder left / right          A / B        thrust up / down (hold)
//   X           wheel brakes (hold)          Y            landing gear
//   LB / RB     flaps up / down              D-pad ↑ / ↓  trim nose down / nose up
//   D-pad ←     autobrake                    D-pad →      speedbrakes: tap = arm, hold = extend / retract
//   View        TO/GA; in a go-around, back on final      Menu  pause · start · fly again
// On the ground at idle, keeping B held selects reverse thrust, which stays until A (like pulling
// the reverse levers). Other controllers (joysticks with their own layout) fly pitch and roll with
// their first two axes. Browsers only reveal a controller once one of its buttons is pressed.
// Safari on iPhone and iPad names a controller "<its name> Extended Gamepad" (no vendor number),
// e.g. "DualSense Wireless Controller Extended Gamepad", in the standard layout with the PS / Home
// button as button 16; it has no rumble there (only on a Mac).
//
// This module reads the controller once per frame, writes the analog state to InputManager.pad and
// emits button presses as actions; InputManager.update applies them like the keyboard's.

export const BUTTONS = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };

/** Button names printed on each family of controller (the standard layout is positional). */
export const LABELS = {
  xbox: { name: 'Xbox', A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', View: 'View', Menu: 'Menu', R3: 'R3' },
  playstation: { name: 'PlayStation', A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Create', Menu: 'Options', R3: 'R3' },
  nintendo: { name: 'Nintendo', A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', View: '−', Menu: '+', R3: 'R-stick press' },
};
export function labelsFor(id) {
  const s = (id || '').toLowerCase();
  if (/054c|playstation|dualshock|dualsense/.test(s)) return LABELS.playstation;   // 054c: Sony's USB vendor id
  if (/057e|nintendo|switch|pro controller|joy-con/.test(s)) return LABELS.nintendo;       // 057e: Nintendo's
  return LABELS.xbox;
}

export const PAD = {
  stickDeadZone: 0.12,    // worn sticks drift: ignore this much deflection, then rescale to full
  triggerDeadZone: 0.05,
  speedbrakeHold: 0.6,    // s: D-pad → held this long (and for 3+ reads, so a quick tap at a low frame rate still arms) extends / retracts
  activeAt: 0.3,          // deflection that makes the controller the device in use
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Radial dead zone: the stick's direction is kept, its travel rescaled to 0..1 past the dead zone. */
export function radial(x, y, dz = PAD.stickDeadZone) {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}
const trigger = (v) => (v <= PAD.triggerDeadZone ? 0 : clamp((v - PAD.triggerDeadZone) / (1 - PAD.triggerDeadZone), 0, 1));

export class GamepadInput {
  constructor(input, nav = typeof navigator !== 'undefined' ? navigator : null) {
    this.input = input;
    this.nav = nav;
    this.index = null;        // the controller in use
    this.gp = null;           // its latest snapshot
    this.id = '';
    this.labels = null;
    this.standard = false;
    this.active = false;      // the controller is the device being used (not the keyboard, mouse or touch)
    this.prev = [];           // buttons pressed at the previous poll
    this.rightSince = -1;     // when D-pad → went down (s), -1 = up
    this.rightPolls = 0;      // reads while it is held
    this.rightFired = false;
    this.onChange = null;     // ({ connected, active, labels, id }) => void
  }

  get connected() { return this.index !== null; }
  get canRumble() { const a = this.gp && this.gp.vibrationActuator; return !!(a && typeof a.playEffect === 'function'); }

  /** The keyboard, mouse or a touch was used: the controller is no longer the device in use. */
  otherDeviceUsed() { this.setActive(false); }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.input.pad.active = on;
    this.changed();
  }

  changed() { if (this.onChange) this.onChange({ connected: this.connected, active: this.active, labels: this.labels, id: this.id }); }

  /** Read the controller; `now` in seconds (for the D-pad hold). Call once per frame. */
  poll(now) {
    const list = this.nav && this.nav.getGamepads ? Array.from(this.nav.getGamepads() || []).filter((g) => g && g.connected !== false) : [];
    let gp = list.find((g) => g.index === this.index) || list.find((g) => g.mapping === 'standard') || list[0] || null;
    if (!gp) { if (this.connected) this.lost(); return; }
    if (gp.index !== this.index) this.found(gp);
    this.gp = gp;
    const P = this.input.pad;
    const pressed = (i) => { const b = gp.buttons[i]; return !!b && (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5); };
    const value = (i) => { const b = gp.buttons[i]; return b ? (typeof b === 'object' ? b.value : b) : 0; };
    const [lx, ly] = radial(gp.axes[0] || 0, gp.axes[1] || 0);
    P.roll = lx; P.pitch = -ly;                       // stick up (axis −1) = +pitch, like the up arrow
    let busy = Math.abs(lx) > PAD.activeAt || Math.abs(ly) > PAD.activeAt;
    if (this.standard) {
      const [rx, ry] = radial(gp.axes[2] || 0, gp.axes[3] || 0);
      const lt = trigger(value(BUTTONS.LT)), rt = trigger(value(BUTTONS.RT));
      P.yaw = rt - lt; P.lookX = rx; P.lookY = ry;
      P.thrust = (pressed(BUTTONS.A) ? 1 : 0) - (pressed(BUTTONS.B) ? 1 : 0);
      P.brake = pressed(BUTTONS.X);
      P.trim = (pressed(BUTTONS.Down) ? 1 : 0) - (pressed(BUTTONS.Up) ? 1 : 0);   // + = nose up, like [
      busy = busy || lt > PAD.activeAt || rt > PAD.activeAt || Math.abs(rx) > PAD.activeAt || Math.abs(ry) > PAD.activeAt;
    }
    // button presses: actions on the way down (the D-pad → decides on release or after the hold time)
    const n = gp.buttons.length;
    for (let i = 0; i < n; i++) {
      const on = pressed(i), was = !!this.prev[i];
      if (on && !was) { busy = true; this.press(i, now); }
      if (!on && was) this.release(i);
      this.prev[i] = on;
    }
    if (this.standard && this.rightSince >= 0 && !this.rightFired && ++this.rightPolls >= 3 && now - this.rightSince >= PAD.speedbrakeHold) { this.rightFired = true; this.input.emit('speedbrake'); }
    if (busy) this.setActive(true);
  }

  press(i, now) {
    const I = this.input;
    const name = Object.keys(BUTTONS).find((k) => BUTTONS[k] === i) || `button${i}`;
    if (!this.standard) { I.emit('padButton', name); return; }
    switch (i) {
      case BUTTONS.Y: I.emit('gear'); break;
      case BUTTONS.LB: I.emit('flapsUp'); break;
      case BUTTONS.RB: I.emit('flapsDown'); break;
      case BUTTONS.Left: I.emit('autobrake'); break;
      case BUTTONS.Right: this.rightSince = now; this.rightPolls = 0; this.rightFired = false; break;
      case BUTTONS.View: I.emit('togaOrReposition'); break;
      case BUTTONS.R3: I.emit('camera', 'cycle'); break;              // cockpit → panel → head-up
      default: break;
    }
    I.emit('padButton', name);   // menus, pause, Flight School and results use A, B and Menu
  }

  release(i) {
    if (this.standard && i === BUTTONS.Right) {
      if (!this.rightFired) this.input.emit('armSpeedbrake');
      this.rightSince = -1; this.rightFired = false;
    }
  }

  found(gp) {
    this.gp = gp;
    this.index = gp.index; this.id = gp.id || '';
    this.standard = gp.mapping === 'standard';
    this.labels = labelsFor(this.id);
    this.prev = gp.buttons.map(() => false);
    this.changed();
  }

  lost() {
    this.index = null; this.gp = null;
    Object.assign(this.input.pad, { pitch: 0, roll: 0, yaw: 0, thrust: 0, brake: false, trim: 0, lookX: 0, lookY: 0 });
    this.active = false; this.input.pad.active = false;
    this.changed();
  }

  /** Rumble the controller (Chrome, Edge: dual-rumble). Magnitudes 0..1. */
  rumble(ms, strong, weak) {
    if (!this.active || !this.canRumble) return;
    try {
      const p = this.gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not supported */ }
  }
}
