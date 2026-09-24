// Navigation in Node: the ILS 27 signals and their coverage (js/nav.js), the navigation display's
// model (js/nd.js), the approach chart's (js/chart.js) and the debrief map's (js/debrief.js).
// Every figure is checked against the geometry it should show.
//   node test/nav.test.mjs
import { RUNWAY, NM, FT, DEG, KTS } from '../js/config.js';
import { TERRAIN } from '../js/physics/terrain.js';
import { ILS27, FIXES, MISSED, MSA_FT, glidepathFt, glidepathDistNm, onCentreline, ils27, bearingTo, missedPath, circuitPath } from '../js/nav.js';
import { ndModel, autoRange, activeFix, ND_RANGES } from '../js/nd.js';
import { chartModel, chartStatic, toPlan, toProfile, PLAN, PROFILE } from '../js/chart.js';
import { debriefModel, BOX } from '../js/debrief.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const thrX = RUNWAY.thresholdX;

/** A state `distNm` before the threshold, `offM` right of the centreline (looking west), `hFt` above the runway. */
function at(distNm, hFt, { offM = 0, trackDeg = 270, headingDeg = trackDeg, windDirDeg = 270, windKts = 10, gsKts = 140 } = {}) {
  const st = { x: thrX + distNm * NM, z: -offM, alt: RUNWAY.elevation + hFt * FT, track: trackDeg * DEG, heading: headingDeg * DEG,
    groundSpeed: gsKts * KTS, tasKts: gsKts + 5, ias: gsKts, windDirDeg, windKts };
  st.ils = ils27(st);
  return st;
}
const efis = (mode = 'MAP', range = 20, auto = false) => ({ mode, range, auto });

console.log('\n[N1] ILS 27 signals and their coverage');
{
  const s = at(8, glidepathFt(8));
  check('on the centreline and the glidepath 8 nm out: both signals, both deviations zero', s.ils.locValid && s.ils.gsValid && near(s.ils.locDev, 0, 1e-9) && near(s.ils.gsDev, 0, 1e-6));
  check('the DME reads the slant distance to the threshold', near(s.ils.dmeNm, Math.hypot(8 * NM, glidepathFt(8) * FT) / NM, 1e-6), `${s.ils.dmeNm.toFixed(3)} nm`);
  const dLoc = 8 * NM + ILS27.locAntennaAlong;
  const r = at(8, glidepathFt(8), { offM: dLoc * Math.tan(1 * DEG) });
  check('1° right of the course (north of it, looking west): locDev +1°', near(r.ils.locDev, 1, 1e-6), r.ils.locDev.toFixed(4));
  const dGs = 8 * NM + ILS27.gsAntennaAlong;
  const hi = at(8, Math.tan((ILS27.gsDeg + 0.35) * DEG) * dGs / FT);
  check('0.35° above the glidepath: gsDev +0.35° (one dot)', near(hi.ils.gsDev, 0.35, 1e-6), hi.ils.gsDev.toFixed(4));
  // a point `nm` from the localizer antenna, `azDeg` off the course (the coverage is measured from the antenna)
  const cover = (nm, azDeg) => { const d = nm * NM; return at((d * Math.cos(azDeg * DEG) - ILS27.locAntennaAlong) / NM, 3000, { offM: d * Math.sin(azDeg * DEG) }).ils; };
  check('the localizer: ±10° out to 25 nm', cover(24, 9).locValid && !cover(26, 9).locValid);
  check('the localizer: ±35° out to 17 nm, nothing wider', cover(14, 30).locValid && !cover(18, 30).locValid && !cover(10, 40).locValid);
  check('nothing behind the localizer antenna (past the far end of the runway)', !at(-(ILS27.locAntennaAlong / NM) - 0.5, 1500).ils.locValid && at(-1, 1500).ils.locValid);
  check('the glideslope: out to 10 nm and ±8°, not behind its antenna', at(9.5, 3000).ils.gsValid && !at(10.5, 3000).ils.gsValid
    && !at(5, 1600, { offM: Math.tan(9 * DEG) * (5 * NM + ILS27.gsAntennaAlong) }).ils.gsValid && !at(-0.5, 500).ils.gsValid);
  check('glidepathFt and glidepathDistNm are inverse', [0.5, 2, 5, 9].every((d) => near(glidepathDistNm(glidepathFt(d)), d, 1e-9)));
  const fap = FIXES.find((f) => f.role === 'FAP');
  check('the final approach fix is where the glideslope meets 3000 ft', near(glidepathFt(fap.distNm), 3000, 20), `${fap.name} ${fap.distNm} nm: ${glidepathFt(fap.distNm).toFixed(0)} ft`);
  check('the fixes run inbound to the threshold, higher or level each time', FIXES.every((f, i) => i === 0 || (f.distNm < FIXES[i - 1].distNm && f.altFt <= FIXES[i - 1].altFt)));
  let hiGround = 0;
  for (let x = -25 * NM; x <= 25 * NM; x += 2000) for (let z = -25 * NM; z <= 25 * NM; z += 2000) if (Math.hypot(x, z) <= 25 * NM) hiGround = Math.max(hiGround, TERRAIN.heightAt(x, z) / FT);
  check('the minimum sector altitude clears the ground within 25 nm by 1000 ft', MSA_FT % 100 === 0 && MSA_FT >= hiGround + 1000, `MSA ${MSA_FT} ft, ground up to ${hiGround.toFixed(0)} ft`);
  check('the missed approach is at or above the MSA\'s neighbourhood of the circuit (3000 ft over the plain)', MISSED.altFt === 3000 && MISSED.headings.climb === RUNWAY.headingDeg);
  const b = bearingTo(at(5, 1500), thrX, 0);
  check('bearingTo: the threshold dead ahead on a westbound final', near(b.deg, 270, 1e-9) && near(b.nm, 5, 1e-9));
}

console.log('\n[N2] The navigation display');
{
  const ARC_R = 330, CY = 400, CX = 256;
  const s = at(10, 3000);
  const m = ndModel(s, efis('MAP', 20));
  const k = ARC_R / (20 * NM);
  check('MAP, track up: the threshold straight ahead at its distance on the arc\'s scale', near(m.runwayLine[0].x, CX, 1e-6) && near(m.runwayLine[0].y, CY - 10 * NM * k, 1e-6) && m.topLabel === 'TRK 270');
  check('MAP: the route magenta, the missed approach cyan dashed (not active) before a go-around', m.route.active && !m.missed.active);
  const fi = m.fixes.find((f) => f.name === 'FI27');
  check('MAP: the next fix is FI27, 0.8 nm ahead, and it is drawn there', m.active.name === 'FI27' && near(m.active.nm, 10 - 9.2, 1e-6) && near(fi.y, CY - 0.8 * NM * k, 1e-6) && fi.active);
  check('the next fix steps down the route: WESTY from 20 nm, then FI27, then the threshold', activeFix(at(20, 5000), false).name === 'WESTY' && activeFix(at(11, 3000), false).name === 'FI27' && activeFix(at(3, 900), false).name === 'RW27' && activeFix(at(-0.5, 0), false).name === 'RW27');
  check('in a circuit the route leads back to FI27 and the missed approach is the active leg', (() => { const c = ndModel(at(5, 3000, { offM: -4 * NM, trackDeg: 90 }), efis(), { circuit: true }); return c.active.name === 'FI27' && c.missed.active && !c.route.active; })());
  check('automatic range: 40 nm beyond 12 nm, 20 nm inside it, 10 nm inside 4 nm, 20 nm in a circuit',
    autoRange(at(20, 5000), false) === 40 && autoRange(at(8, 2500), false) === 20 && autoRange(at(3, 900), false) === 10 && autoRange(at(3, 900), true) === 20);
  check('a range the pilot selects is kept; the automatic one follows the flight', ndModel(at(3, 900), efis('MAP', 80, false)).range === 80 && ndModel(at(3, 900), efis('MAP', 80, true)).range === 10);
  check('the ranges are the 737\'s 5–160 nm', ND_RANGES.join(',') === '5,10,20,40,80,160');
  // drift: heading 275, track 270 — MAP is track up, APP heading up
  const d = at(6, 1900, { trackDeg: 270, headingDeg: 275 });
  const map = ndModel(d, efis('MAP', 10)), app = ndModel(d, efis('APP', 10));
  check('MAP is track up (TRK 270), APP heading up (HDG 275): the runway 5° right of the top in APP', map.topLabel === 'TRK 270' && app.topLabel === 'HDG 275' && near(map.runwayLine[0].x, CX, 1e-6) && app.runwayLine[0].x < CX && app.trackLine === -5, `runway x ${app.runwayLine[0].x.toFixed(1)}`);
  check('the heading bug: at the top when the runway heading is selected on a straight-in final', ndModel(at(6, 1900), efis(), { hdgBug: 270 }).hdgBug === 0);
  check('the heading bug: 90° left for heading 180 while tracking 270; its line only while HDG SEL flies it', (() => { const h = ndModel(at(6, 1900), efis(), { hdgBug: 180, hdgSel: true }); const n = ndModel(at(6, 1900), efis(), { hdgBug: 180 }); return h.hdgBug === -90 && h.hdgLine && !n.hdgLine; })());
  const offM = (8 * NM + ILS27.locAntennaAlong) * Math.tan(1 * DEG);
  const rs = at(8, glidepathFt(8) + 100, { offM }), right = ndModel(rs, efis('APP', 10));
  check('APP: 1° right of the course, the course bar one dot left', right.loc && near(right.loc.dots, -1, 1e-6));
  check('APP: above the glidepath, the pointer below the centre (0.35° a dot)', right.glide && right.glide.dots < 0 && near(right.glide.dots, -rs.ils.gsDev / 0.35, 1e-9), `${right.glide.dots.toFixed(2)} dots`);
  check('APP: the ILS ident, frequency, course and DME', right.ilsText[0] === 'IWH 110.30' && right.ilsText[1] === 'CRS 270' && /^DME \d+\.\d$/.test(right.ilsText[2]));
  const out = ndModel(at(20, 4000, { offM: 14 * NM }), efis('APP', 40));
  check('APP out of the localizer\'s coverage: no bar, no pointer, DME ---', out.loc === null && out.glide === null && out.ilsText[2] === 'DME ---');
  const pln = ndModel(at(6, 1900), efis('PLN', 20));
  check('PLN: north up about the airport; the aircraft east of it, pointing west', pln.up === 0 && pln.aircraft.x > 256 && near(pln.aircraft.y, 270, 1e-6) && pln.aircraft.rot === 270);
  check('the wind: 270° at 10 kt on a westbound track reads as a headwind (arrow pointing down)', m.wind.dir === 270 && m.wind.kts === 10 && Math.abs(m.wind.rel) === 180);
  check('ground speed and true airspeed in knots', m.gs === 140 && m.tas === 145);
  check('the offset from the centreline on the final approach', near(ndModel(at(3, 900, { offM: 25 }), efis()).offset, 25, 1e-6) && ndModel(at(3, 900, { offM: 3 * NM }), efis()).offset === null);
}

console.log('\n[N3] The approach chart');
{
  const c = chartStatic();
  const kx = PLAN.w / (PLAN.east - PLAN.west), kz = PLAN.h / (PLAN.south - PLAN.north);
  check('the plan view has one scale both ways', near(kx, kz, 1e-12));
  check('its fixes are the navigation data\'s, on the centreline', c.plan.fixes.map((f) => f.name).join(' ') === 'HAVEN WESTY FI27' && c.plan.fixes.every((f) => { const p = toPlan(onCentreline(f.dme).x, 0); return near(f.x, p.x, 1e-9) && near(f.y, p.y, 1e-9); }));
  check('the glideslope check heights are the glidepath\'s', c.gsTable.every((r) => Math.abs(r.altFt - glidepathFt(r.dme)) <= 5), c.gsTable.map((r) => `D${r.dme} ${r.altFt}`).join(', '));
  check('the descent rate for 140 kt on a 3° path is about 740 fpm', c.rodTable.find((r) => r.gs === 140).fpm === 740);
  const ms = c.plan.missed;
  check('the missed approach: from the threshold straight ahead (west), then left onto south', near(ms[0].y, ms[1].y, 1e-9) && ms[1].x < ms[0].x && ms[ms.length - 1].y > ms[1].y && ms[ms.length - 1].x < ms[1].x);
  const mp = missedPath(), nd = ndModel(at(5, 1600), efis('PLN', 20));
  check('the chart and the ND draw the same missed approach (js/nav.js), ending on the downwind the autoland flies',
    c.plan.missed.length === mp.length && mp.every((p, i) => { const q = toPlan(p.x, p.z), r = nd.toScreen(p.x, p.z); return near(c.plan.missed[i].x, q.x, 1e-9) && near(nd.missed.pts[i].x, r.x, 1e-9) && near(nd.missed.pts[i].y, r.y, 1e-9); })
    && near(mp[mp.length - 1].z, MISSED.downwindNm * NM, 1e-6));
  const cp = circuitPath();
  const icptHdg = ((Math.atan2(cp[3].x - cp[2].x, -(cp[3].z - cp[2].z)) / DEG) + 360) % 360;   // heading of the intercept leg
  check('the radar vectors: downwind, base 13 nm out, the intercept on heading 300 onto the centreline', near(cp[1].x, thrX + MISSED.baseNm * NM, 1e-6) && near(cp[2].z, MISSED.interceptNm * NM, 1e-6) && cp[3].z === 0
    && near(icptHdg, MISSED.headings.intercept, 1e-6), `${icptHdg.toFixed(1)}°`);
  check('the missed approach text is the autoland\'s procedure', c.missedText === MISSED.text && /2000/.test(c.missedText) && /180/.test(c.missedText) && /3000/.test(c.missedText));
  check('the minimums: CAT I, DA 200 ft', c.minima.title === 'ILS CAT I' && /DA\(H\) 200'/.test(c.minima.lines[0]));
  const onGp = chartModel(at(5, glidepathFt(5)));
  const gpy = toProfile(5, glidepathFt(5)).y;
  check('own ship at 5 nm on the glidepath: on the plan, and on the profile\'s glidepath line', onGp.own.plan.inside && onGp.own.profile && near(onGp.own.profile.y, gpy, 1e-6) && near(onGp.own.plan.y, toPlan(0, 0).y, 1e-6));
  const gl = c.profile.glide, t = (onGp.own.profile.x - gl[0].x) / (gl[1].x - gl[0].x);
  check('...exactly on the drawn glidepath', near(onGp.own.profile.y, gl[0].y + t * (gl[1].y - gl[0].y), 0.5));
  const circuit = chartModel(at(8, 3000, { offM: -4 * NM, trackDeg: 90 }));
  check('own ship on the downwind leg: on the plan (4 nm south), off the profile', circuit.own.plan.inside && circuit.own.plan.y > toPlan(0, 3 * NM).y && circuit.own.profile === null && circuit.own.plan.rot === 90);
  const far = chartModel(at(30, 7000));
  check('own ship 30 nm out: off the plan and the profile (the chart says so)', !far.own.plan.inside && far.own.profile === null);
  check('the profile\'s altitudes and distances map linearly', near(toProfile(PROFILE.nearNm, 0).x, PROFILE.x, 1e-9) && near(toProfile(PROFILE.farNm, PROFILE.topFt).y, PROFILE.y, 1e-9));
}

console.log('\n[N4] The debrief map');
{
  // a synthetic flight: 10 nm final, a go-around at 200 ft, the circuit, a second approach, a landing
  const samples = [], marks = [];
  let t = 0;
  const push = (x, z, altFt, kind, seg = 0) => samples.push({ t: t += 0.5, x, z, altFt, aglFt: altFt, kind, seg });
  for (let d = 10; d > glidepathDistNm(200); d -= 0.1) push(thrX + d * NM, 0, glidepathFt(d), 'approach');
  marks.push({ type: 'goaround', x: thrX + glidepathDistNm(200) * NM, z: 0, altFt: 200, text: 'autoland: sink rate' });
  for (let d = 0.5; d > -2.5; d -= 0.1) push(thrX + d * NM, 0, 200 + (0.5 - d) * 600, 'goaround');
  for (let z = 0; z < 4 * NM; z += 0.2 * NM) push(thrX - 2.5 * NM, z, 2500, 'goaround');
  for (let x = thrX - 2.5 * NM; x < thrX + 11 * NM; x += 0.3 * NM) push(x, 4 * NM, 3000, 'goaround');
  for (let d = 8; d > 0; d -= 0.1) push(thrX + d * NM, 0, glidepathFt(d), 'approach');
  marks.push({ type: 'touchdown', x: thrX - 420, z: 3, altFt: 0, text: '160 fpm' });
  for (let a = 420; a < 1900; a += 50) push(thrX - a, 3, 0, 'ground');
  marks.push({ type: 'stop', x: thrX - 1900, z: 3, altFt: 0, text: 'landed' });
  const m = debriefModel({ samples, marks });
  const kinds = new Set(m.plan.runs.map((r) => r.kind));
  check('the plan: the approach, the go-around and circuit, and the ground roll in their own runs', kinds.has('approach') && kinds.has('goaround') && kinds.has('ground'));
  check('the plan keeps one scale and holds the whole circuit', m.plan.runs.every((r) => r.pts.every((p) => p.x >= BOX.plan.x - 1 && p.x <= BOX.plan.x + BOX.plan.w + 1 && p.y >= BOX.plan.y - 1 && p.y <= BOX.plan.y + BOX.plan.h + 1)));
  check('a go-around and a touchdown counted', m.goArounds === 1 && m.touchdowns === 1);
  const y3000 = m.profile.toProfile(0, 3000).y, x8 = m.profile.toProfile(8, 0).x;
  check('the profile leaves out the downwind leg (4 nm off the centreline) but shows the climb-out', m.profile.runs.every((r) => r.pts.every((p) => !(Math.abs(p.y - y3000) < 0.5 && p.x < x8))) && m.profile.runs.some((r) => r.kind === 'goaround'));
  const pg = m.profile.toProfile(5, glidepathFt(5)), g0 = m.profile.glide[0], g1 = m.profile.glide[1], u = (pg.x - g0.x) / (g1.x - g0.x);
  check('the profile\'s glidepath line is the ILS glidepath', near(pg.y, g0.y + u * (g1.y - g0.y), 0.5));
  check('the profile reaches out to the flight\'s farthest point on the centreline (10 nm)', m.profile.farNm === 10);
  const td = m.runway.marks.find((k) => k.type === 'touchdown'), stop = m.runway.marks.find((k) => k.type === 'stop');
  check('the runway strip: the touchdown inside the touchdown zone, the stop further on', td && td.x <= m.runway.tdz[0] && td.x >= m.runway.tdz[1] && stop.x < td.x);
  check('the runway strip: 3 m left of the centreline (south, looking west) shows below it, as on the plan', near(td.lateralM, -3, 1e-9) && td.y > m.runway.centreline[0].y);
  // a reposition breaks the line
  const rep = debriefModel({ samples: [{ x: thrX + 5 * NM, z: 0, altFt: 1600, kind: 'approach', seg: 0 }, { x: thrX + 4 * NM, z: 0, altFt: 1300, kind: 'approach', seg: 0 },
    { x: thrX + 10 * NM, z: 0, altFt: 3000, kind: 'approach', seg: 1 }, { x: thrX + 9 * NM, z: 0, altFt: 2800, kind: 'approach', seg: 1 }], marks: [] });
  check('a reposition starts a new line (no jump drawn back out to the new start)', rep.plan.runs.length === 2);
  const none = debriefModel({ samples: [], marks: [] });
  check('no flight recorded: an empty map, no error', none.empty && none.plan.runs.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
