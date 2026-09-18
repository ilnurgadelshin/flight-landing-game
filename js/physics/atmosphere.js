// Atmosphere: ISA density, wind with a surface boundary layer, gusts and
// Dryden-style turbulence (filtered noise) so the storm feels alive.
import { KTS, DEG, RHO0 } from '../config.js';

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
    // low-pass filtered noise states
    this.gust = [0, 0, 0];
    this.gustTarget = [0, 0, 0];
    this.gustTimer = 0;
    this.turb = [0, 0, 0];
    this.turbRate = [0, 0, 0];
    this.windShearPhase = 0;
  }

  setScenario(s) {
    this.scenario = s;
    this.windDir = s.windDirDeg * DEG;      // direction the wind blows FROM
    this.windSpeed = s.windKts * KTS;
    this.gustSpeed = s.gustKts * KTS;
    this.turbulence = s.turbulence;
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

  // Advance the stochastic parts.
  step(dt) {
    this.time += dt;
    // Gusts: piecewise targets every 2–6 s, low-pass filtered
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 2 + this.rng() * 4;
      const g = this.gustSpeed;
      const toDir = this.windDir + Math.PI;
      const along = (this.rng() * 2 - 1) * g;             // along the mean wind
      const across = (this.rng() * 2 - 1) * g * 0.5;      // across it
      this.gustTarget[0] = Math.sin(toDir) * along + Math.cos(toDir) * across;
      this.gustTarget[2] = -Math.cos(toDir) * along + Math.sin(toDir) * across;
      this.gustTarget[1] = (this.rng() * 2 - 1) * g * 0.25;
    }
    const kg = 1 - Math.exp(-dt / 1.5);
    for (let i = 0; i < 3; i++) this.gust[i] += (this.gustTarget[i] - this.gust[i]) * kg;

    // Turbulence: second-order filtered white noise per axis (Dryden-like)
    const sigma = this.turbulence * 2.6;    // m/s rms at full intensity
    const omega = 1.8;                       // rad/s characteristic frequency
    for (let i = 0; i < 3; i++) {
      const s = i === 1 ? sigma * 0.6 : sigma;
      const noise = (this.rng() * 2 - 1) * s * Math.sqrt(2 * omega / Math.max(dt, 1e-4)) * 0.5;
      const acc = noise - 2 * 0.5 * omega * this.turbRate[i] - omega * omega * this.turb[i];
      this.turbRate[i] += acc * dt;
      this.turb[i] += this.turbRate[i] * dt;
    }
  }

  // Total wind at a point (m/s, world frame). Turbulence is stronger close to
  // the ground in the storm (mechanical turbulence) — realistic and nasty.
  windAt(alt, out) {
    this.meanWind(alt, out);
    const nearGround = 1 + 0.3 * Math.max(0, 1 - alt / 250);
    // the ground suppresses vertical gusts (no vertical motion at the surface)
    const vert = Math.min(1, Math.max(0.12, alt / 120));
    out[0] += this.gust[0] + this.turb[0] * nearGround;
    out[1] += (this.gust[1] + this.turb[1] * nearGround) * vert;
    out[2] += this.gust[2] + this.turb[2] * nearGround;
    return out;
  }

}
