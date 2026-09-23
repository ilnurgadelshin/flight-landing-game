// Keyboard + mouse mapping for a laptop.
//
//   Pitch      ↑ / ↓  (or mouse yoke)        Roll       ← / →  (or mouse yoke)
//   Rudder     A / D                          Throttle   W / S,  T = TOGA (go-around thrust)
//   Flaps      F extend / V retract           Gear       G
//   Speedbrake Space (toggle), X = arm        Brakes     B (hold), N = autobrake cycle
//   Reversers  R (hold, ground only)          Trim       [ / ]  or PageUp / PageDown
//   Look down  L (hold), right-drag = look    Mouse yoke click canvas / M, Esc releases
//   Pause P · Help H · Reposition Backspace · Menu Esc
import { AIRCRAFT as AC } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class InputManager {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.opts = Object.assign({ invertPitch: false, mouseSensitivity: 1.0 }, opts);
    this.mouseEngaged = false;
    this.tapped = new Set();
    this.mouse = { x: 0, y: 0 };          // -1..1 relative to the canvas centre
    this.look = { yaw: 0, pitch: 0, down: false };
    this.rightDrag = null;
    this.axes = { pitch: 0, roll: 0, yaw: 0 };   // keyboard axes with ramping
    this.brake = 0;
    this.listeners = [];
    this.enabled = false;               // only drives the aircraft while flying
    this.lastHumanInputT = -1;
    this.time = 0;
    this.bind();
  }

  onAction(fn) { this.listeners.push(fn); }
  emit(name, arg) { for (const l of this.listeners) l(name, arg); }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'PageUp', 'PageDown'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;            // ignore auto-repeat
      this.keys.add(k);
      this.tapped.add(k);                      // latched until the next update: a tap shorter than a frame still counts
      this.lastHumanInputT = this.time;
      switch (k) {
        case 'KeyG': this.emit('gear'); break;
        case 'KeyF': this.emit('flapsDown'); break;
        case 'KeyV': this.emit('flapsUp'); break;
        case 'Space': this.emit('speedbrake'); break;
        case 'KeyX': this.emit('armSpeedbrake'); break;
        case 'KeyN': this.emit('autobrake'); break;
        case 'KeyT': this.emit('toga'); break;
        case 'KeyP': this.emit('pause'); break;
        case 'KeyH': this.emit('help'); break;
        case 'KeyM': this.toggleMouse(); break;
        case 'Backspace': this.emit('reposition'); break;
        case 'Escape': if (this.mouseEngaged) this.setMouse(false); else this.emit('menu'); break;
        case 'KeyL': this.look.down = true; break;
        case 'Enter': this.emit('enter'); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyL') this.look.down = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.look.down = false; });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { if (this.enabled) this.setMouse(true); }
      if (e.button === 2) { this.rightDrag = { x: e.clientX, y: e.clientY, yaw: this.look.yaw, pitch: this.look.pitch }; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) { this.rightDrag = null; this.look.yaw = 0; this.look.pitch = 0; } });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.mouse.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      if (this.mouseEngaged) this.lastHumanInputT = this.time;
      if (this.rightDrag) {
        this.look.yaw = clamp(this.rightDrag.yaw - (e.clientX - this.rightDrag.x) * 0.004, -1.6, 1.6);
        this.look.pitch = clamp(this.rightDrag.pitch - (e.clientY - this.rightDrag.y) * 0.004, -1.0, 0.6);
      }
    });
  }

  toggleMouse() { this.setMouse(!this.mouseEngaged); }
  setMouse(on, soft = false) {
    this.mouseEngaged = on && this.enabled;
    this.mouseBlend = this.mouseEngaged && soft ? 0 : 1;   // soft: fade the yoke in over ~1 s
    this.emit('mouse', this.mouseEngaged);
  }

  /** Simulated key press for tests / demos. */
  press(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
  release(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }

  /**
   * Drive the aircraft input from the held keys and the mouse.
   * @param dt seconds
   * @param inp aircraft.input
   * @param st aircraft.state
   */
  update(dt, inp, st) {
    this.time += dt;
    if (!this.enabled) { this.tapped.clear(); return; }
    const K = (c) => this.keys.has(c) || this.tapped.has(c);
    const inv = this.opts.invertPitch ? -1 : 1;
    // ---- primary flight controls: keyboard axes ramp in ~0.35 s and spring back in ~0.25 s
    // progressive: a tap gives a small, precise input; the axis only reaches full
    // deflection after ~1.5 s of holding (an airliner is flown with small inputs)
    const ramp = (cur, target, upRate, downRate) => {
      if (target === 0) { const d = downRate * dt; return Math.abs(cur) <= d ? 0 : cur - Math.sign(cur) * d; }
      if (Math.sign(cur) !== Math.sign(target) && cur !== 0) return cur + Math.sign(target) * downRate * dt; // reversing: fast through zero
      const rate = Math.abs(cur) < 0.45 ? upRate : upRate * 0.28;
      return clamp(cur + Math.sign(target) * rate * dt, -1, 1);
    };
    const pk = (K('ArrowUp') ? 1 : 0) - (K('ArrowDown') ? 1 : 0);      // + = up arrow
    const rk = (K('ArrowRight') ? 1 : 0) - (K('ArrowLeft') ? 1 : 0);
    const yk = (K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0);
    this.axes.pitch = ramp(this.axes.pitch, pk, 1.6, 3.0);
    this.axes.roll = ramp(this.axes.roll, rk, 2.0, 3.0);
    this.axes.yaw = ramp(this.axes.yaw, yk, 1.6, 2.5);
    let pitch = this.axes.pitch * inv;           // up arrow = nose up unless inverted
    let roll = this.axes.roll;
    if (this.mouseEngaged && pk === 0 && rk === 0) {
      const s = this.opts.mouseSensitivity;
      const dz = (v) => (Math.abs(v) < 0.06 ? 0 : (v - Math.sign(v) * 0.06) / 0.94);
      // mouse up (negative y) = nose up unless inverted (pilot style: forward = push = nose down)
      this.mouseBlend = Math.min(1, (this.mouseBlend ?? 1) + dt);
      pitch = clamp(-dz(this.mouse.y) * s * inv, -1, 1) * this.mouseBlend;
      roll = clamp(dz(this.mouse.x) * s, -1, 1) * this.mouseBlend;
      // gentle response curve so small movements are precise
      pitch = Math.sign(pitch) * Math.pow(Math.abs(pitch), 1.4);
      roll = Math.sign(roll) * Math.pow(Math.abs(roll), 1.4);
    } else if (pk !== 0 || rk !== 0) {
      // keyboard overrides the mouse while a key is held
    }
    inp.pitch = pitch; inp.roll = roll; inp.yaw = this.axes.yaw;
    // ---- throttle
    const tr = 0.35 * dt;
    if (K('KeyW')) inp.throttle = clamp(inp.throttle + tr, 0, 1);
    if (K('KeyS')) inp.throttle = clamp(inp.throttle - tr, 0, 1);
    // ---- brakes (hold), reversers (hold)
    const bTarget = K('KeyB') ? 1 : 0;
    this.brake = bTarget ? Math.min(1, this.brake + dt * 2.5) : Math.max(0, this.brake - dt * 4);
    inp.brake = this.brake;
    const rev = K('KeyR');
    if (rev && !inp.reverse) { inp.reverse = true; inp.throttle = 0; this.emit('reverse', true); }
    if (!rev && inp.reverse) { inp.reverse = false; this.emit('reverse', false); }
    if (inp.reverse) inp.throttle = 0;
    // ---- trim
    const trimRate = AC.controls.trimRateDegPerSec * dt * 1.6;
    if (K('BracketRight') || K('PageDown')) inp.trim = clamp(inp.trim - trimRate, -AC.controls.maxTrimDeg, AC.controls.maxTrimDeg);
    if (K('BracketLeft') || K('PageUp')) inp.trim = clamp(inp.trim + trimRate, -AC.controls.maxTrimDeg, AC.controls.maxTrimDeg);
    this.tapped.clear();
    void st;
  }

  anyFlightKeyHeld() {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyW', 'KeyS']) if (this.keys.has(k)) return true;
    return false;
  }
}
