// Atmosphere: ISA density, the mean wind with a surface boundary layer, the reported gusts, and
// continuous turbulence from the Dryden model of MIL-F-8785C / MIL-HDBK-1797 (the model flight
// simulators are qualified with):
//   below 1000 ft   length scales  L_w = h,  L_u = L_v = h / (0.177 + 0.000823 h)^1.2   (ft, h ≥ 10)
//                   intensities    σ_w = 0.1 W20,  σ_u = σ_v = σ_w / (0.177 + 0.000823 h)^0.4
//   1000–2000 ft    blended to the medium-altitude values (L = 1750 ft, σ_u = σ_v = σ_w)
// W20 is the mean wind at 20 ft (about 15 kt gives light turbulence, 30 moderate, 45 severe),
// raised where the reported gusts need more: a wind reported gusting G kt above its mean needs
// W20 ≈ 2.4 G for the peak 3-second gusts in ten minutes at a 20 ft anemometer to reach G (the
// storm's 22 kt gusting 36 gives W20 34 kt, moderate to severe). A scenario with `turbulence` 0
// has smooth air. The gusts are a field frozen in the air the
// aircraft flies through: the along-track component has a first-order spectrum and the lateral and
// vertical ones second-order spectra, each with a time scale L / V. So close to the ground the
// gusts are stronger along the track and quicker, and at approach heights they last several
// seconds. The aircraft's wingspan averages the lateral and vertical gusts (MIL-F-8785C's gust
// penetration lag, 4 b / (π V)), which takes the smallest, quickest ones out near the ground,
// and its length averages the along-track eddies smaller than about 10 m.
// The turbulence is what makes the reported gusts ("22 kt gusting 36"); there is no separate
// gust model on top of it.
import { KTS, DEG, FT, RHO0, AIRCRAFT as AC } from '../config.js';

// Deterministic PRNG (mulberry32) so tests are reproducible.
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Atmosphere {
  constructor(scenario, seed = 7) {
    this.setScenario(scenario);
    this.rng = makeRng(seed);
    this.time = 0;
    // Dryden turbulence: along-track u, lateral v and vertical w (m/s), with the second-order
    // filters' inner states and the span-averaged v and w
    this.dryden = { u1: 0, u: 0, v1: 0, v2: 0, w1: 0, w2: 0, v: 0, w: 0 };
    this.turb = [0, 0, 0];             // the turbulence in the world frame (m/s)
    this.flight = { agl: 300, tas: 75, heading: 270 * DEG };
  }

  setScenario(s) {
    this.scenario = s;
    this.windDir = s.windDirDeg * DEG;      // direction the wind blows FROM
    this.windSpeed = s.windKts * KTS;
    this.gustSpeed = s.gustKts * KTS;
    this.turbulence = s.turbulence;
    // W20 (m/s): the mean wind at 20 ft, or what the reported gusts need
    const w = this.meanWind(20 * FT, [0, 0, 0]);
    this.w20 = s.turbulence > 0 ? Math.max(Math.hypot(w[0], w[2]), 2.4 * this.gustSpeed) : 0;
  }

  /**
   * Dryden length scales (m) and intensities (m/s) at a height above the ground (m), for this
   * scenario's severity.
   */
  drydenScales(agl) {
    const h = Math.max(10, agl / FT);                    // ft
    const k = 0.177 + 0.000823 * Math.min(h, 1000);
    const sw = 0.1 * this.w20;
    let Lu = Math.min(h, 1000) / Math.pow(k, 1.2), Lw = Math.min(h, 1000), su = sw / Math.pow(k, 0.4);
    if (h > 1000) { const f = Math.min(1, (h - 1000) / 1000); Lu += (1750 - Lu) * f; Lw += (1750 - Lw) * f; }
    return { Lu: Lu * FT, Lv: Lu * FT, Lw: Lw * FT, su, sv: su, sw };
  }

  density(alt) {
    // ISA troposphere
    const T = 288.15 - 0.0065 * Math.max(0, alt);
    return RHO0 * Math.pow(T / 288.15, 4.256);
  }

  // Mean wind vector (m/s) at altitude, world frame. Wind FROM direction ψ
  // means the air moves toward ψ+180.
  meanWind(alt, out) {
    // boundary layer: full strength at 300 m, ~55 % at the surface (log-ish profile)
    const h = Math.max(alt, 2);
    const profile = Math.min(1, 0.55 + 0.45 * Math.log(h / 2) / Math.log(300 / 2));
    const speed = this.windSpeed * Math.max(0.55, profile);
    const toDir = this.windDir + Math.PI;
    out[0] = Math.sin(toDir) * speed;
    out[1] = 0;
    out[2] = -Math.cos(toDir) * speed;
    return out;
  }

  /**
   * Advance the turbulence. `flight` is the aircraft's state (its height above the
   * ground, true airspeed and heading), which sets the turbulence's scales and axes.
   */
  step(dt, flight) {
    this.time += dt;
    if (flight && Number.isFinite(flight.tas)) this.flight = { agl: Math.max(0, flight.agl || 0), tas: flight.tas, heading: flight.heading || 0 };
    // Dryden turbulence, stepped through the frozen field at the airspeed
    const D = this.dryden;
    if (this.w20 > 0) {
      // V: how fast the air passes (the true airspeed; at a standstill, the wind)
      const f = this.flight, V = Math.max(3, f.tas), S = this.drydenScales(f.agl);
      // along track: first order, exact for any step; the airframe averages out eddies smaller
      // than itself (about 10 m), where the point model's spectrum would be pure noise
      const au = Math.exp(-V * dt / S.Lu);
      D.u1 = au * D.u1 + S.su * Math.sqrt(1 - au * au) * this.gauss();
      const aa = Math.exp(-dt * V / 10);
      D.u = aa * D.u + (1 - aa) * D.u1;
      // lateral and vertical: H(s) = σ √b (1 + √3 b s) / (1 + b s)², b = L / V, driven by unit
      // white noise (two first-order stages; output y2 + √3 (y1 − y2))
      const second = (y1, y2, L, sigma) => {
        const b = L / V, a = Math.exp(-dt / b), n = this.gauss() / Math.sqrt(dt);
        y1 = a * y1 + (1 - a) * sigma * Math.sqrt(b) * n;
        y2 = a * y2 + (1 - a) * y1;
        return [y1, y2, y2 + Math.sqrt(3) * (y1 - y2)];
      };
      let out;
      [D.v1, D.v2, out] = second(D.v1, D.v2, S.Lv, S.sv);
      const ap = Math.exp(-dt / (4 * AC.wingSpan / (Math.PI * V)));   // span averaging
      D.v = ap * D.v + (1 - ap) * out;
      [D.w1, D.w2, out] = second(D.w1, D.w2, S.Lw, S.sw);
      D.w = ap * D.w + (1 - ap) * out;
      // into the world frame: u along the heading, v to its right, w up
      const hx = Math.sin(f.heading), hz = -Math.cos(f.heading);
      this.turb[0] = D.u * hx - D.v * hz;
      this.turb[2] = D.u * hz + D.v * hx;
      this.turb[1] = D.w;
    } else this.turb[0] = this.turb[1] = this.turb[2] = 0;
  }

  /** A standard normal random number (Box–Muller) from the scenario's seeded generator. */
  gauss() {
    const u = Math.max(1e-12, this.rng()), v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Total wind at a point (m/s, world frame): the mean wind and the turbulence.
  windAt(alt, out) {
    this.meanWind(alt, out);
    out[0] += this.turb[0]; out[1] += this.turb[1]; out[2] += this.turb[2];
    return out;
  }

}
