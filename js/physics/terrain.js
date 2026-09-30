// Terrain height / surface query used by BOTH physics and rendering so the
// wheels and the visuals agree. Surveyed heights match the bundled imagery;
// only the fictional airport and its obstacle-clearance envelope are graded.
import { RUNWAY } from '../config.js';
import { landscapeHeight } from './elevation.js';

export const TERRAIN = {
  // Metres relative to the fictional airport datum (valleys can be below it).
  heightAt: landscapeHeight,

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
