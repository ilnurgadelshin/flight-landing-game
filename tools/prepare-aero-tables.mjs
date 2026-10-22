// Writes js/physics/aero-tables.js: the 737-800's lift, profile drag and pitching moment by angle
// of attack and flap angle, read by the flight model (js/physics/aero.js).
//   node tools/prepare-aero-tables.mjs
//
// Boeing's aerodynamic data are not public, so the tables are built from documented shapes and
// calibrated to what is published about the aircraft:
//  - Maximum lift per flap setting from the reference speeds in js/config.js: CS 25.125 sets
//    VREF at 1.23 times the reference stall speed (1-g, sea level, the configured mass). Flaps
//    up uses the clean stall speed; flaps 1 and 5 lie between flaps up and flaps 15 in
//    proportion to their lift at zero incidence.
//  - The linear lift slope, the flaps' lift at zero incidence and their drag and pitching
//    moment increments carry over from the earlier coefficient model (its overall drag polar
//    is close to OpenAP's for the 737-800: CD0 0.019, gear 0.017, K 0.042, against 0.022,
//    0.020 and 0.045 here). Flaps 40 have 0.15 more lift at zero incidence than flaps 30, so
//    the approach attitude is lower than with flaps 30, as Boeing's training manual describes.
//  - The lift curve departs from its straight line 3° before the stall and rounds into the
//    maximum (a slatted swept wing stalls gently); past the stall the lift falls to 75 % over
//    5° and then towards a flat plate's, the separated flow's drag rises towards a flat plate's
//    and the pitching moment breaks nose-down.
//  - The stall warning (stick shaker) comes at 7 % above the 1-g stall speed, more than the
//    5 kt or 5 % of CS 25.207(c).
import fs from 'node:fs/promises';
import { AIRCRAFT as AC, KTS, G, RHO0 } from '../js/config.js';

const DEG = Math.PI / 180;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

const flapDeg = AC.flapDetents;                                  // the table's columns
const CLa = 5.2;                                                 // lift slope, per radian
const CL0 = [0.20, 0.32, 0.50, 0.70, 0.95, 1.10];                // lift at zero incidence
const CD0 = [0.022, 0.026, 0.035, 0.054, 0.092, 0.117];          // profile drag
const Cm0 = [0.05, 0.02, -0.02, -0.08, -0.17, -0.21];            // pitching moment at zero incidence
const Cma = -1.45;                                               // per radian, below the stall
const roundDeg = 3;                                              // the lift curve rounds over this
const warnMargin = 1.07;                                         // stick shaker / 1-g stall speed

// maximum lift from the 1-g stall speeds: VREF / 1.23 with the landing and approach flaps
const weight = AC.mass * G;
const clmaxAt = (vsKts) => 2 * weight / (RHO0 * AC.wingArea * (vsKts * KTS) ** 2);
const CLmax = [clmaxAt(AC.stallClean), 0, 0, clmaxAt(AC.vref15 / 1.23), clmaxAt(AC.vref30 / 1.23), clmaxAt(AC.vref40 / 1.23)];
for (const i of [1, 2]) CLmax[i] = CLmax[0] + (CLmax[3] - CLmax[0]) * (CL0[i] - CL0[0]) / (CL0[3] - CL0[0]);

const columns = flapDeg.map((deg, i) => {
  // the straight line, rounded over roundDeg into CLmax: CL = line - c (α - αk)², peak at the stall
  const round = roundDeg * DEG, c = CLa / (2 * round);
  const stall = (CLmax[i] - CL0[i]) / CLa + round / 2, knee = stall - round;
  const negStall = -0.8 * stall, CLneg = CL0[i] + CLa * negStall;
  const lift = (a) => {
    if (a > stall) {
      // the stalled wing: 75 % of the maximum 5° past the stall, then a flat plate's lift
      const early = CLmax[i] * (1 - 0.25 * smooth((a - stall) / (5 * DEG)));
      return early + (0.9 * Math.sin(2 * a) - early) * smooth((a - stall - 5 * DEG) / (10 * DEG));
    }
    if (a > knee) return CL0[i] + CLa * a - c * (a - knee) ** 2;
    if (a >= negStall) return CL0[i] + CLa * a;
    return CLneg + (0.9 * Math.sin(2 * a) - CLneg) * smooth((negStall - a) / (12 * DEG));
  };
  // separated flow: the drag rises to a flat plate's normal force (1.8) resolved along the flow
  const drag = (a) => CD0[i] + 1.8 * Math.sin(a) ** 2 * Math.max(smooth((a - stall + 1 * DEG) / (6 * DEG)), smooth((negStall - a + 1 * DEG) / (6 * DEG)));
  const moment = (a) => Cm0[i] + Cma * a - 1.2 * Math.max(0, a - stall);
  // the stick shaker: where the lift is CLmax / 1.07², so 7 % above the 1-g stall speed
  const warnCL = CLmax[i] / warnMargin ** 2;
  const warn = warnCL < CL0[i] + CLa * knee ? (warnCL - CL0[i]) / CLa : knee + (CLa - Math.sqrt(CLa * CLa - 4 * c * (warnCL - CL0[i] - CLa * knee))) / (2 * c);
  return { deg, lift, drag, moment, stall, warn, CLmax: CLmax[i] };
});

const r = (v, d = 4) => Number(v.toFixed(d));
// the stall as the tables give it (to 0.01°): each flap setting's maximum lift is a breakpoint, so
// the interpolated lift rises right up to its stall
for (const col of columns) col.stall = r(col.stall / DEG, 2) * DEG;

// angles of attack: 1° steps where the curves bend, the stalls, coarser in deep stall
const alphaDeg = [-30, -24, -20, -18];
for (let a = -16; a <= 26; a++) alphaDeg.push(a);
alphaDeg.push(28, 30, 35, 40, 45, 50, 60, 70, 80, 90);
for (const col of columns) { const a = r(col.stall / DEG, 2); if (!alphaDeg.includes(a)) alphaDeg.push(a); }
alphaDeg.sort((a, b) => a - b);
const table = (f) => alphaDeg.map((a) => columns.map((col) => r(col[f](a * DEG))));
const rows = (t) => t.map((row, j) => `    [${row.map((v) => String(v).padStart(7)).join(',')}],   // ${alphaDeg[j]}°`).join('\n');
const source = `// Generated by tools/prepare-aero-tables.mjs from documented shapes and the reference speeds in
// js/config.js (see that tool for the sources and assumptions). Regenerate rather than edit.
// Rows: angle of attack (alphaDeg); columns: flap angle (flapDeg). Read by js/physics/aero.js.
export const AERO_TABLES = {
  flapDeg: [${flapDeg.join(', ')}],
  alphaDeg: [${alphaDeg.join(', ')}],
  // the 1-g stall and the stick shaker (degrees of angle of attack), and the maximum lift, per flap
  stallAlphaDeg: [${columns.map((c) => r(c.stall / DEG, 2)).join(', ')}],
  warnAlphaDeg: [${columns.map((c) => r(c.warn / DEG, 2)).join(', ')}],
  CLmax: [${columns.map((c) => r(c.CLmax)).join(', ')}],
  // lift coefficient (wing and body, before elevator, pitch rate and ground effect)
  CL: [
${rows(table('lift'))}
  ],
  // profile drag coefficient (the induced drag, K CL², is added by the flight model)
  CD: [
${rows(table('drag'))}
  ],
  // pitching moment coefficient about the centre of gravity (before elevator, trim and pitch rate)
  Cm: [
${rows(table('moment'))}
  ],
};
`;
await fs.writeFile(new URL('../js/physics/aero-tables.js', import.meta.url), source);
console.log('flap      ' + flapDeg.map((d) => String(d).padStart(7)).join(''));
console.log('CLmax    ' + columns.map((c) => c.CLmax.toFixed(3).padStart(7)).join(''));
console.log('stall α  ' + columns.map((c) => (c.stall / DEG).toFixed(2).padStart(7)).join(''));
console.log('shaker α ' + columns.map((c) => (c.warn / DEG).toFixed(2).padStart(7)).join(''));
