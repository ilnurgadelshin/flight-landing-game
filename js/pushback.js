// The tug's pushback from the stand: straight back off the gate, a quarter turn that swings the
// tail along the apron's taxi lane, and a short straight to line the nosewheel up. It sets the
// aircraft's motion over the ground (Aircraft.tow); the struts and the weight are still the
// physics'. Simplified: no tug driver to talk to, one path per stand.
import { DEG } from './config.js';

export const PUSHBACK = {
  speed: 1.5,        // m/s: a brisk walking pace, as a tug pushes
  accel: 0.35,       // m/s²
  straight: 45,      // m back from the stand before the turn
  radius: 40,        // m, the turn's
  tail: 12,          // m straight after it
};

const wrap = (a) => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };

export class Pushback {
  /** @param stand { headingDeg, noseToDeg }: the heading on the stand and the one the push ends on */
  constructor(aircraft, stand) {
    this.ac = aircraft; this.stand = stand;
    this.turn = wrap((stand.noseToDeg - stand.headingDeg) * DEG);      // + = the nose swings clockwise
    this.arc = Math.abs(this.turn) * PUSHBACK.radius;
    this.total = PUSHBACK.straight + this.arc + PUSHBACK.tail;
    this.s = 0; this.v = 0; this.active = false; this.done = false;
  }

  start() { if (this.done || this.active) return false; this.active = true; this.ac.tow = { vx: 0, vz: 0, headingRate: 0 }; return true; }

  /** Seconds the whole push takes, about. */
  get duration() { return this.total / PUSHBACK.speed + PUSHBACK.speed / PUSHBACK.accel; }
  get progress() { return Math.min(1, this.s / this.total); }

  /** One physics step. Returns true on the step the push ends. */
  step(dt) {
    if (!this.active) return false;
    const P = PUSHBACK, ac = this.ac, heading = ac.state.heading;
    // speed: up to the tug's pace, and down to a stop at the end of the path
    const left = this.total - this.s;
    this.v = Math.min(P.speed, this.v + P.accel * dt, Math.sqrt(2 * P.accel * Math.max(0, left)) + 0.02);
    this.s += this.v * dt;
    // the heading the path has here, held by the towbar
    const along = Math.min(1, Math.max(0, (this.s - P.straight) / this.arc));
    const want = this.stand.headingDeg * DEG + this.turn * along;
    const onArc = this.s > P.straight && this.s < P.straight + this.arc;
    const headingRate = (onArc ? Math.sign(this.turn) * this.v / P.radius : 0) + wrap(want - heading) * 0.8;
    if (left <= 0.01) {
      this.active = false; this.done = true; ac.tow = null;
      ac.body.velocity.x = 0; ac.body.velocity.z = 0; ac.body.angularVelocity.y = 0;
      return true;
    }
    // backwards: against the nose's direction (sin ψ, -cos ψ)
    ac.tow.vx = -Math.sin(heading) * this.v; ac.tow.vz = Math.cos(heading) * this.v; ac.tow.headingRate = headingRate;
    return false;
  }
}
