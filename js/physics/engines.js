// ---------------------------------------------------------------------------
// Turbofan thrust: how much an engine gives at an N1, an airspeed and an altitude.
//
// The rated (take-off) thrust lapses with Mach number and pressure altitude as in Bartel &
// Young (2008), "Simplified thrust and fuel consumption models for modern two-shaft turbofan
// engines", Journal of Aircraft 45(4), equations 11–14, with their fit of the gas generator
// function to bypass ratio. The model matches its reference engines within about 1 % up to
// Mach 0.4, which covers every approach, landing and go-around here. A CFM56-7B (bypass ratio
// 5.1) gives about 80 % of its static thrust at approach speed and 78 % in a go-around.
//
// Part throttle is the same fraction of the lapsed rated thrust that the N1 gives statically
// (a common simplification: it ignores how ram drag grows at low power).
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Rated thrust at this Mach number and pressure ratio p/p0, as a fraction of sea-level static. */
export function thrustLapse(mach, pressureRatio, bypassRatio) {
  const p = pressureRatio, bpr = bypassRatio, M = clamp(mach, 0, 0.4);
  const G0 = 0.0606 * bpr + 0.6337;                       // the gas generator function
  const A = -0.4327 * p * p + 1.3855 * p + 0.0472;        // each is 1 at sea level
  const Z = 0.9106 * p * p * p - 1.7736 * p * p + 1.8697 * p;
  const X = 0.1377 * p * p * p - 0.4374 * p * p + 1.3003 * p;
  return A - 0.377 * (1 + bpr) / Math.sqrt((1 + 0.82 * bpr) * G0) * Z * M
    + (0.23 + 0.19 * Math.sqrt(bpr)) * X * M * M;
}

/** Fraction of the rated thrust an N1 (0..1) gives: almost none at idle. */
export function n1ThrustFraction(n1) {
  return Math.pow(clamp((n1 - 0.2) / 0.8, 0, 1), 2.2);
}

/** One engine's forward thrust (N) at an N1, Mach number and pressure ratio. */
export function engineThrust(n1, mach, pressureRatio, engines) {
  return engines.maxThrust * n1ThrustFraction(n1) * thrustLapse(mach, pressureRatio, engines.bypassRatio);
}

/** The N1 that gives one engine's thrust (N): the inverse of engineThrust, within 20–100 %. */
export function n1ForThrust(thrust, mach, pressureRatio, engines) {
  const rated = engines.maxThrust * thrustLapse(mach, pressureRatio, engines.bypassRatio);
  return 0.2 + 0.8 * Math.pow(clamp(thrust / rated, 0, 1), 1 / 2.2);
}
