// ---------------------------------------------------------------------------
// The 737-800's aerodynamic coefficients from tables (js/physics/aero-tables.js, written by
// tools/prepare-aero-tables.mjs): lift, profile drag and pitching moment by angle of attack and
// flap angle, interpolated linearly in both. The flaps move continuously between detents, so a
// flap angle between two detents blends their columns.
// ---------------------------------------------------------------------------
import { AERO_TABLES as T } from './aero-tables.js';

const DEG = Math.PI / 180;

// index of the interval holding x (clamped to the table), and the fraction across it
let _frac = 0;
function locate(xs, x) {
  const n = xs.length - 1;
  if (x <= xs[0]) { _frac = 0; return 0; }
  if (x >= xs[n]) { _frac = 1; return n - 1; }
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  _frac = (x - xs[lo]) / (xs[lo + 1] - xs[lo]);
  return lo;
}

function bilinear(table, i, ta, j, tf) {
  const r0 = table[i], r1 = table[i + 1];
  const a = r0[j] + (r0[j + 1] - r0[j]) * tf, b = r1[j] + (r1[j + 1] - r1[j]) * tf;
  return a + (b - a) * ta;
}

/** CL, profile CD and Cm at an angle of attack (rad) and flap angle (deg), written into out. */
export function aeroCoefficients(alpha, flapDeg, out) {
  const i = locate(T.alphaDeg, alpha / DEG), ta = _frac;
  const j = locate(T.flapDeg, flapDeg), tf = _frac;
  out.CL = bilinear(T.CL, i, ta, j, tf);
  out.CD = bilinear(T.CD, i, ta, j, tf);
  out.Cm = bilinear(T.Cm, i, ta, j, tf);
  return out;
}

/** A per-flap value (stallAlphaDeg, warnAlphaDeg, CLmax) at a flap angle between detents. */
export function flapValue(name, flapDeg) {
  const j = locate(T.flapDeg, flapDeg), v = T[name];
  return v[j] + (v[j + 1] - v[j]) * _frac;
}

/** The angle of attack (rad) below the stall that gives a lift coefficient (trim). */
export function alphaForLift(CL, flapDeg) {
  const c = {};
  let lo = -10 * DEG, hi = flapValue('stallAlphaDeg', flapDeg) * DEG;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (aeroCoefficients(mid, flapDeg, c).CL < CL) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
