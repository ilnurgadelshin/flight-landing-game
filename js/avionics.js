// Avionics: what the instruments and the crew work out from the aircraft's position and
// configuration relative to the airport — which runway it is landing on, the distance to the
// threshold and the offset from the centreline, the localizer and glideslope deviations, the
// reference speed for the flap setting, and rising terrain ahead.
//
// The flight model (js/physics/) knows nothing about runways. The Simulation hands it
// deriveApproach() as a hook that runs each time the aircraft publishes its state, so every
// reader (displays, GPWS, grading, the test pilot) finds these fields in the same state object.
import { AIRCRAFT as AC, RUNWAY, DEG } from './config.js';
import { TERRAIN } from './physics/terrain.js';
import { ils27 } from './nav.js';

/** Vref for the flap lever position (kts): the approach speed is Vref + 5. */
export function referenceSpeed(flapIndex) {
  if (flapIndex >= 5) return AC.vref40;
  if (flapIndex >= 4) return AC.vref30;
  if (flapIndex >= 3) return AC.vref15;
  if (flapIndex >= 2) return AC.vref15 + 10;
  if (flapIndex >= 1) return AC.vref15 + 20;
  return AC.stallClean * 1.3;
}

/**
 * Add the approach geometry to a published aircraft state (in place). The landing direction
 * follows the heading: within 90° of 270 it is runway 27, otherwise 09.
 */
export function deriveApproach(st, runway = RUNWAY) {
  const rwyHdg = runway.headingDeg * DEG;
  let dHdg = st.heading - rwyHdg; while (dHdg > Math.PI) dHdg -= 2 * Math.PI; while (dHdg < -Math.PI) dHdg += 2 * Math.PI;
  const landingWest = Math.abs(dHdg) <= Math.PI / 2;
  st.landingDirection = landingWest ? runway.ident : runway.reciprocal;
  const thresholdX = landingWest ? runway.thresholdX : -runway.thresholdX;
  st.alongRunway = landingWest ? (thresholdX - st.x) : (st.x - thresholdX); // + past the threshold
  st.distFromThreshold = st.alongRunway;
  st.distToThreshold = -st.alongRunway;
  st.lateralOffset = landingWest ? -st.z : st.z;  // + = right of the centreline
  const dirHdg = landingWest ? rwyHdg : rwyHdg - Math.PI;
  let crab = st.heading - dirHdg; while (crab > Math.PI) crab -= 2 * Math.PI; while (crab < -Math.PI) crab += 2 * Math.PI;
  st.crabDeg = crab / DEG;
  // ILS-like deviations
  const locAntennaAlong = runway.length + 300;
  const dAlong = locAntennaAlong - st.alongRunway;
  st.locDev = Math.atan2(st.lateralOffset, Math.max(dAlong, 50)) / DEG;   // + = right of centreline
  const gsAntennaAlong = runway.papiDistance;
  const dGs = gsAntennaAlong - st.alongRunway;
  const hAboveThr = st.alt - runway.elevation;
  st.gsAngle = dGs > 100 ? Math.atan2(hAboveThr, dGs) / DEG : runway.glideslopeDeg;
  st.gsDev = st.gsAngle - runway.glideslopeDeg;                          // + = above
  st.gsAltitude = Math.tan(runway.glideslopeDeg * DEG) * Math.max(dGs, 0);
  st.onRunwayStrip = Math.abs(st.z) <= runway.width / 2 && Math.abs(st.x) <= runway.length / 2;
  st.beyondRunwayEnd = st.alongRunway > runway.length;
  st.vref = referenceSpeed(st.flapIndex);
  // what the ILS 27 receivers show, wherever the aircraft is (the displays read these; the fields
  // above follow the landing direction for the rules)
  st.ils = runway === RUNWAY ? ils27(st) : null;
  return st;
}

/** Terrain rising into the flight path within about 2.6 km (for the GPWS "terrain" warning). */
export function terrainAhead(st, terrain = TERRAIN) {
  if (st.onGround) return false;
  const hx = Math.sin(st.heading), hz = -Math.cos(st.heading);
  for (const d of [800, 1600, 2600]) {
    const h = terrain.heightAt(st.x + hx * d, st.z + hz * d);
    if (h > 5 && st.alt - h < 120 + d * 0.05) return true;
  }
  return false;
}
