// The autothrottle, as a 737's: its speed mode (SpeedMode), shared by the autoland
// (js/autopilot.js) and the player's optional autothrottle for a manual landing (Autothrottle).
//
// The speed mode controls the indicated airspeed blended with the aircraft's inertial
// acceleration (a complementary filter), so a gust that changes the airspeed for a few seconds
// barely moves the levers while a real change of speed shows at once, and a servo moves the levers
// at a limited rate, adding thrust twice as fast as it takes it off (Boeing's gust protection).
import { KTS, FT } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The autothrottle's speed mode (fractions of the thrust lever's travel). */
export const AUTOTHROTTLE = {
  filterTime: 5,        // s: the complementary filter's time constant (autothrottles use 2–5 s)
  rateUp: 0.08,         // lever travel per second, adding thrust: quick when slow...
  rateDown: 0.04,       // ...and half as quick taking it off (Boeing's gust protection)
  deadband: 0.005,      // the servo ignores smaller corrections
  retard: 0.25,         // lever travel per second in RETARD (from 27 ft): idle about 2 s later
  retardFt: 27,         // radio altitude where RETARD begins in the flare
  offAfterLanding: 2,   // s on the ground before it disengages itself
};

/**
 * The speed set on the mode control panel when the autoland has not set one: the flap speeds on
 * the way in, then Vref + 5 with the landing flaps (Boeing: with the autothrottle engaged, command
 * speed Vref + 5; its gust protection replaces the wind additive of a manually flown approach).
 */
export function commandSpeed(inp, st) {
  return Math.round(inp.flapIndex >= 4 ? st.vref + 5 : (inp.flapIndex >= 3 ? 165 : (inp.flapIndex >= 2 ? 175 : 210)));
}

/** The speed mode: the speed filter and the lever servo. */
export class SpeedMode {
  constructor(ias) { this.speed = ias; this.accel = 0; this.v = null; this.i = 0; }

  /** The speed the autothrottle sees: airspeed blended with the inertial acceleration. */
  filter(st, dt) {
    // inertial acceleration along the flight path (kt/s), lightly smoothed
    const v = Math.hypot(st.vx, st.vy, st.vz);
    if (this.v !== null && dt > 0) this.accel += ((v - this.v) / dt / KTS - this.accel) * Math.min(1, dt / 0.3);
    this.v = v;
    // complementary filter: inertial acceleration for the quick part, airspeed for the slow part
    this.speed += (this.accel + (st.ias - this.speed) / AUTOTHROTTLE.filterTime) * dt;
    return this.speed;
  }

  /** Move the thrust levers (inp.throttle) towards the thrust that holds targetKts. */
  hold(inp, st, targetKts, dt) {
    const A = AUTOTHROTTLE;
    const err = targetKts - this.filter(st, dt);
    this.i = clamp(this.i + err * dt * 0.004, -0.25, 0.25);
    // where the levers should be; the servo moves them there at its rates
    const want = clamp(0.55 + err * 0.02 + this.i - this.accel * 0.12, 0, 1);
    const d = want - inp.throttle;
    if (Math.abs(d) > A.deadband) inp.throttle = clamp(inp.throttle + clamp(d, -A.rateDown * dt, A.rateUp * dt), 0, 1);
  }
}

/** RETARD: the levers come back towards idle at the retard rate. */
export function retard(inp, dt) { inp.throttle = Math.max(0, inp.throttle - dt * AUTOTHROTTLE.retard); }

/**
 * The player's autothrottle for a manual landing, used as a 737's is with the autopilot off.
 *  - MCP SPD: engaged in flight, it holds the MCP speed (commandSpeed), the levers moving by
 *    themselves as the pilot flies the glideslope with pitch.
 *  - RETARD: from 27 ft radio altitude with flaps 15 or more the levers come back to idle,
 *    reaching it about as the wheels touch; 2 s after touchdown it disengages.
 *  - GA: TO/GA pressed; it holds the go-around thrust.
 * The pilot taking the thrust levers (moving them, or selecting reverse) disconnects it, as the
 * disconnect switch under their thumb does on the levers. Its mode is the FMA's first column.
 */
export class Autothrottle {
  constructor() { this.engaged = false; this.mode = ''; this.speed = null; this.groundT = 0; }

  /** Engage in MCP SPD (in flight only). Returns whether it engaged. */
  engage(st) {
    if (st.onGround) return false;
    this.engaged = true; this.mode = 'MCP SPD'; this.speed = new SpeedMode(st.ias); this.groundT = 0;
    return true;
  }

  /** Returns whether it was engaged. */
  disengage() { const had = this.engaged; this.engaged = false; this.mode = ''; this.speed = null; return had; }

  /** TO/GA pressed: go-around thrust (the controls set the levers), held until the pilot takes them. */
  goAround() { if (this.engaged) { this.mode = 'GA'; this.groundT = 0; } }

  /** Back on final (a reposition): MCP SPD again from the new start's speed. */
  repositioned(st) { if (this.engaged) { this.mode = 'MCP SPD'; this.speed = new SpeedMode(st.ias); this.groundT = 0; } }

  /** Before every physics step while the player flies. Returns 'landed' when it disengaged itself. */
  update(dt, inp, st) {
    if (!this.engaged) return null;
    if (this.mode === 'GA') return null;
    if (st.onGround) {
      if ((this.groundT += dt) >= AUTOTHROTTLE.offAfterLanding) { this.disengage(); return 'landed'; }
    } else this.groundT = 0;
    if (this.mode === 'MCP SPD' && !st.onGround && st.agl < AUTOTHROTTLE.retardFt * FT && inp.flapIndex >= 3) this.mode = 'RETARD';
    if (this.mode === 'RETARD' || st.onGround) retard(inp, dt);
    else this.speed.hold(inp, st, commandSpeed(inp, st), dt);
    return null;
  }
}
