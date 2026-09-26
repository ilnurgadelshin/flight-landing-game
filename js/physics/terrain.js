// Terrain height / surface query used by BOTH physics and rendering so the
// wheels and the visuals agree. The airport and approach safety strip stay level;
// rolling countryside rises beside them and a mountain ridge sits to the south.
import { RUNWAY } from '../config.js';

function hash2(x, z) {
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function smoothNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const TERRAIN = {
  // metres above sea level at world x,z
  heightAt(x, z) {
    // A level airport and approach safety strip, blending into nearby rolling
    // countryside. Rendering, wheel contact and navigation use this same query.
    const dz = Math.abs(z);
    const dx = Math.abs(x);
    if (dz <= 700 && dx < 60000) return 0;
    const t = Math.min(1, Math.max(0, (dz - 700) / 2200));
    if (t <= 0) return 0;
    let h = 0;
    // rolling hills
    h += 155 * smoothNoise(x / 2800, z / 2800);
    h += 55 * smoothNoise(x / 950 + 7.3, z / 950 + 2.1);
    // mountain ridge to the south (z > 18 km)
    if (z > 15000) {
      const s = Math.min(1, (z - 15000) / 8000);
      h += s * (600 + 350 * smoothNoise(x / 4000 + 3.3, z / 4000));
    }
    return h * t * t * (3 - 2 * t);
  },

  // 'runway' | 'taxiway' | 'grass'
  surfaceAt(x, z) {
    const halfL = RUNWAY.length / 2, halfW = RUNWAY.width / 2;
    if (Math.abs(x) <= halfL + RUNWAY.padLength && Math.abs(z) <= halfW) return 'runway'; // include the blast pads
    // parallel taxiway on the south side and apron
    if (Math.abs(x) <= halfL && z > 120 && z < 150) return 'taxiway';
    if (Math.abs(x) < 700 && z > 150 && z < 420) return 'taxiway';
    // taxiway connectors
    for (const cx of [-1450, -700, 0, 700, 1450]) {
      if (Math.abs(x - cx) < 15 && z > halfW && z < 150) return 'taxiway';
    }
    return 'grass';
  },
};
