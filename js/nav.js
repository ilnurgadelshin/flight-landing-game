// Navigation data for Westhaven International (WHV) and its ILS runway 27 — the one source that the
// navigation display, the approach chart, the debrief map and the autoland's missed approach read —
// and the ILS 27 signals a receiver picks up wherever the aircraft is.
//
// World frame (js/config.js): +X east, +Z south, heading 0 = north (−Z). Runway 27's threshold is at
// x = RUNWAY.thresholdX; the final approach comes from the east along z = 0.
// Everything here is pure (no DOM, no Three.js): test/nav.test.mjs runs it in Node.
import { RUNWAY, NM, FT, DEG } from './config.js';
import { TERRAIN } from './physics/terrain.js';

export const AIRPORT = { name: 'Westhaven International', ident: 'WHV', elevationFt: RUNWAY.elevation / FT };

/** The ILS 27: its ground stations and the coverage a receiver can rely on (ICAO Annex 10). */
export const ILS27 = {
  ident: 'IWH', freq: '110.30', courseDeg: RUNWAY.headingDeg, gsDeg: RUNWAY.glideslopeDeg,
  tchFt: Math.round(RUNWAY.thresholdCrossingHeight / FT / 5) * 5,
  daFt: 200,                                   // CAT I decision altitude (the threshold is at sea level)
  locAntennaAlong: RUNWAY.length + 300,        // m past the threshold: beyond the far end
  gsAntennaAlong: RUNWAY.papiDistance,         // m past the threshold, beside the touchdown zone
  // the localizer: ±10° out to 25 nm, ±35° out to 17 nm; the glideslope: ±8° out to 10 nm
  loc: { narrowDeg: 10, narrowNm: 25, wideDeg: 35, wideNm: 17 },
  gs: { azDeg: 8, rangeNm: 10 },
};

/** Height of the glidepath above the threshold (ft) at a distance before it (nm). */
export function glidepathFt(distNm) {
  return Math.tan(ILS27.gsDeg * DEG) * (distNm * NM + ILS27.gsAntennaAlong) / FT;
}
/** Distance before the threshold (nm) where the glidepath is at a height (ft). */
export function glidepathDistNm(heightFt) {
  return (heightFt * FT / Math.tan(ILS27.gsDeg * DEG) - ILS27.gsAntennaAlong) / NM;
}

/** The approach's fixes on the extended centreline: distance before the threshold (nm) and altitude (ft). */
export const FIXES = [
  { name: 'HAVEN', role: 'IAF', distNm: 26, altFt: 7000 },                  // where the full approach starts
  { name: 'WESTY', role: 'IF', distNm: 13, altFt: 3000 },
  { name: 'FI27', role: 'FAP', distNm: Math.round(glidepathDistNm(3000) * 10) / 10, altFt: 3000 },   // the glideslope meets 3000 ft
  { name: 'RW27', role: 'THR', distNm: 0, altFt: ILS27.tchFt },
];
/** World position (x, z) of a point on the extended centreline, `distNm` before the threshold. */
export const onCentreline = (distNm) => ({ x: RUNWAY.thresholdX + distNm * NM, z: 0 });

/**
 * The missed approach and the radar vectors back to the ILS, as the autoland flies them: climb
 * straight ahead, turn left at 2000 ft, 3000 ft and 180 kt round a left-hand circuit 4 nm south
 * of the runway, base 13 nm out, and a 30° intercept that joins the localizer about 2 nm outside
 * the final approach fix.
 */
export const MISSED = {
  altFt: 3000, turnAltFt: 2000, speedKts: 180,
  headings: { climb: RUNWAY.headingDeg, crosswind: 180, downwind: 90, base: 360, intercept: 300 },
  downwindNm: 4,        // the downwind leg is flown once this far south of the centreline
  baseNm: 13,           // the base leg this far east of the threshold
  interceptNm: 1.5,     // the intercept heading this far south of the centreline
  captureM: 700,        // then the approach, within this of the centreline
  text: 'Climb straight ahead. At 2000 turn LEFT heading 180, climbing to 3000. Radar vectors for a left-hand circuit and another ILS 27.',
};

/**
 * The missed approach as the chart and the ND draw it (world x, z): straight ahead to the turn at
 * 2000 ft (drawn 2.5 nm past the threshold, where a normal go-around reaches it), a left turn at
 * 180 kt and 25° of bank onto 180, and south to the downwind.
 */
export const MISSED_TURN_NM = 2.5;
export const TURN_RADIUS_M = 1.1 * NM;
export function missedPath() {
  const turn = { x: RUNWAY.thresholdX - MISSED_TURN_NM * NM, z: 0 }, R = TURN_RADIUS_M, pts = [{ x: RUNWAY.thresholdX, z: 0 }, turn];
  for (let a = 10; a <= 90; a += 10) pts.push({ x: turn.x - R * Math.sin(a * DEG), z: R * (1 - Math.cos(a * DEG)) });
  pts.push({ x: turn.x - R, z: MISSED.downwindNm * NM });
  return pts;
}
/** The radar vectors (typical) from there back to the localizer: downwind, base, the 30° intercept. */
export function circuitPath() {
  const M = MISSED, T = RUNWAY.thresholdX, start = missedPath().pop();
  return [start, { x: T + M.baseNm * NM, z: M.downwindNm * NM }, { x: T + M.baseNm * NM, z: M.interceptNm * NM },
    { x: T + (M.baseNm - M.interceptNm / Math.tan(30 * DEG)) * NM, z: 0 }];
}

/** Minimum sector altitude within 25 nm: the highest ground + 1000 ft, up to the next 100 ft. */
export const MSA_FT = (() => {
  let hi = 0;
  for (let x = -25 * NM; x <= 25 * NM; x += 400) for (let z = -25 * NM; z <= 25 * NM; z += 400) {
    if (Math.hypot(x, z) <= 25 * NM) hi = Math.max(hi, TERRAIN.heightAt(x, z));
  }
  return Math.ceil((hi / FT + 1000) / 100) * 100;
})();

/**
 * The ILS 27 signals where the aircraft is (st: x, z, alt). Deviations in degrees: locDev + = right
 * of the course (looking along it), gsDev + = above the glidepath. A signal outside its coverage
 * (behind the antenna, too far off the course or too far away) is not valid, and a display shows
 * nothing for it. The DME reads the slant distance from the threshold (nm).
 */
export function ils27(st) {
  const along = RUNWAY.thresholdX - st.x;          // m past the threshold (− before it)
  const lateral = -st.z;                            // m right of the centreline, looking west
  const h = st.alt - RUNWAY.elevation;
  const dLoc = ILS27.locAntennaAlong - along;       // m from the localizer antenna, towards the approach
  const locAz = Math.atan2(lateral, dLoc) / DEG, locNm = Math.hypot(dLoc, lateral) / NM;
  const L = ILS27.loc;
  const locValid = dLoc > 0 && ((Math.abs(locAz) <= L.narrowDeg && locNm <= L.narrowNm) || (Math.abs(locAz) <= L.wideDeg && locNm <= L.wideNm));
  const dGs = ILS27.gsAntennaAlong - along;
  const gsAz = Math.atan2(lateral, dGs) / DEG, gsNm = Math.hypot(dGs, lateral) / NM;
  const gsValid = dGs > 0 && gsNm <= ILS27.gs.rangeNm && Math.abs(gsAz) <= ILS27.gs.azDeg;
  const gsDev = Math.atan2(h, Math.max(dGs, 1)) / DEG - ILS27.gsDeg;
  const dmeNm = Math.hypot(st.x - RUNWAY.thresholdX, st.z, h) / NM;
  return { locDev: locAz, gsDev, locValid, gsValid, dmeNm, along, lateral };
}

/** Bearing (deg true, 0 = north) and distance (nm) from the aircraft to a world point. */
export function bearingTo(st, x, z) {
  const dx = x - st.x, dz = z - st.z;
  return { deg: ((Math.atan2(dx, -dz) / DEG) + 360) % 360, nm: Math.hypot(dx, dz) / NM };
}
