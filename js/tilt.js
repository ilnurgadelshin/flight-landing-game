// Tilt steering for phones and tablets: pitch and roll from how the device is held, relative to
// a neutral position captured when a flight starts or resumes, or when CENTER is tapped.
//
// The deviceorientation event gives the device's attitude as Euler angles (W3C DeviceOrientation:
// beta about the device x axis, gamma about y). Only the direction of gravity is used, so turning
// on the spot never steers. It is taken into the screen's frame (landscape turns the screen 90°
// about the device's z axis):
//   screen frame  x to the right of the screen, y up the screen, z out of the screen to the player
//   pitch         the top edge tilted towards the player = nose up (like pulling a yoke)
//   roll          the screen's left-right line tilted, left side down = bank left
// Browsers do not agree on the direction of the screen angle. A player always holds the phone with
// the picture upright (the system turns the screen otherwise), so at calibration gravity must point
// down the screen; when it points up, the angle is taken the other way round.

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const TILT = {
  pitchRange: 20 * DEG,     // tilt for full nose-up / nose-down
  rollRange: 25 * DEG,      // tilt for full bank input
  filterTau: 0.06,          // s, smooths sensor noise without a noticeable lag
  startTimeout: 1500,       // ms without a reading after enabling = no motion sensor
  staleAfter: 1000,         // ms without a reading while flying = the sensor stopped
};

/** Gravity (unit vector, pointing down) in the device frame from deviceorientation beta/gamma in degrees. */
export function gravityDevice(beta, gamma) {
  const b = beta * DEG, g = gamma * DEG;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

/** Device frame -> screen frame for a screen turned by `angle` degrees (screen.orientation.angle). */
export function toScreen(gd, angle) {
  const a = angle * DEG, c = Math.cos(a), s = Math.sin(a);
  return [gd[0] * c - gd[1] * s, gd[0] * s + gd[1] * c, gd[2]];
}

/** Pitch and roll (radians) of screen-frame gravity `g` relative to the neutral `n`. */
export function tiltAngles(g, n) {
  let pitch = Math.atan2(g[2], -g[1]) - Math.atan2(n[2], -n[1]);   // rotation about the screen's x axis
  if (pitch > Math.PI) pitch -= 2 * Math.PI;
  if (pitch < -Math.PI) pitch += 2 * Math.PI;
  const roll = Math.asin(clamp(g[0], -1, 1)) - Math.asin(clamp(n[0], -1, 1));   // tilt of the screen's x axis
  return { pitch, roll };
}

/** The current screen angle in degrees, 0..359. */
export function screenAngle() {
  const o = typeof screen !== 'undefined' ? screen.orientation : null;
  const a = o && typeof o.angle === 'number' ? o.angle : (typeof window !== 'undefined' && typeof window.orientation === 'number' ? window.orientation : 0);
  return ((a % 360) + 360) % 360;
}

/**
 * Reads the motion sensor and writes the player's tilt to InputManager.tilt as stick-like
 * deflections (-1..1). status: 'off' | 'waiting' (enabled, no reading yet) | 'on' | 'denied' | 'nosensor'.
 */
export class TiltControl {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.status = 'off';
    this.g = null;            // filtered gravity in the screen frame
    this.neutral = null;      // gravity at the neutral position
    this.flip = false;        // the screen angle runs the other way on this browser
    this.lastT = 0;           // time of the last reading (ms, performance.now)
    this.centerIn = 0;        // readings to wait before centering (lets the filter settle)
    this.onStatus = null;     // (status) => void
    this.handler = (e) => this.sample(e);
    this.pending = null;
    const recentre = () => { if (this.enabled) this.requestCenter(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('orientationchange', recentre);
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', recentre);
    }
  }

  static supported() { return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'; }

  setStatus(s) { this.status = s; if (this.onStatus) this.onStatus(s); return s; }

  /**
   * Turn tilt steering on. Must be called from a tap: iOS (and recent Chrome) show the motion
   * access prompt only then. Resolves to 'on', 'denied' or 'nosensor'.
   */
  enable() {
    if (this.enabled) return Promise.resolve(this.status === 'waiting' ? 'waiting' : 'on');
    if (!TiltControl.supported()) return Promise.resolve(this.setStatus('nosensor'));
    const Req = window.DeviceOrientationEvent;
    const ask = typeof Req.requestPermission === 'function' ? Req.requestPermission() : Promise.resolve('granted');   // called synchronously, inside the tap
    return Promise.resolve(ask).catch(() => 'denied').then((res) => {
      if (res !== 'granted') return this.setStatus('denied');
      return new Promise((resolve) => {
        this.enabled = true; this.g = null; this.neutral = null;
        this.pending = resolve;
        this.setStatus('waiting');
        window.addEventListener('deviceorientation', this.handler);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          if (this.enabled && !this.g) { this.disable(); this.pending = null; resolve(this.setStatus('nosensor')); }
        }, TILT.startTimeout);
      });
    });
  }

  disable() {
    clearTimeout(this.timer);
    if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', this.handler);
    this.enabled = false; this.g = null; this.neutral = null;
    Object.assign(this.input.tilt, { active: false, pitch: 0, roll: 0 });
    if (this.status === 'on' || this.status === 'waiting') this.setStatus('off');
  }

  /** Centre on the position the device is held in a moment from now (flight start, resume). */
  requestCenter() { this.centerIn = 4; this.neutral = null; this.update(); }

  /** Centre on the position the device is held in now (the CENTER button). */
  center() {
    if (!this.g) { this.requestCenter(); return; }
    if (this.g[1] > 0.2) {   // gravity up the screen: this browser turns the screen angle the other way
      this.flip = !this.flip;
      this.g = [-this.g[0], -this.g[1], this.g[2]];
    }
    this.neutral = this.g.slice();
    this.centerIn = 0;
    this.update();
  }

  sample(e) {
    if (e.beta == null || e.gamma == null) return;     // some browsers send one empty event without a sensor
    const gs = toScreen(gravityDevice(e.beta, e.gamma), screenAngle() + (this.flip ? 180 : 0));
    const now = e.timeStamp > 0 ? e.timeStamp : performance.now();   // event time: the same clock as performance.now()
    if (!this.g) {
      this.g = gs;
      clearTimeout(this.timer);
      if (this.status !== 'on') this.setStatus('on');
      if (this.pending) { const p = this.pending; this.pending = null; p('on'); }
      if (!this.neutral && !this.centerIn) this.centerIn = 4;
    } else {
      const k = 1 - Math.exp(-clamp((now - this.lastT) / 1000, 0, 0.2) / TILT.filterTau);
      for (let i = 0; i < 3; i++) this.g[i] += (gs[i] - this.g[i]) * k;
      const m = Math.hypot(this.g[0], this.g[1], this.g[2]) || 1;
      for (let i = 0; i < 3; i++) this.g[i] /= m;
    }
    this.lastT = now;
    if (this.centerIn > 0 && --this.centerIn === 0) this.center();
    this.update();
  }

  /** Write the deflections; also called every frame so a sensor that stops reporting lets go. */
  update() {
    const T = this.input.tilt;
    const now = performance.now();
    if (!this.enabled || !this.g || !this.neutral || now - this.lastT > TILT.staleAfter) { T.active = false; T.pitch = 0; T.roll = 0; return; }
    const { pitch, roll } = tiltAngles(this.g, this.neutral);
    T.active = true;
    T.pitch = clamp(pitch / TILT.pitchRange, -1, 1);
    T.roll = clamp(roll / TILT.rollRange, -1, 1);
  }
}
