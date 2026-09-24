// The 737's navigation display (ND), as its EFIS control panel sets it:
//   MAP  track up, the aircraft at the bottom of an expanded arc: the route with its fixes and the
//        missed approach, the runway, the airport, the selected heading and the next fix's distance
//   APP  heading up: the ILS 27 course with its deviation bar and the glideslope pointer, the
//        ILS's ident, frequency, course and DME
//   PLN  north up, centred on the airport: the whole approach and circuit on one page
// Ranges 5–160 nm. Until the pilot turns the range knob it follows the crew's usual choice: 40 nm
// far out, 20 nm from 12 nm (and in a go-around's circuit), 10 nm inside 4 nm.
//
// ndModel() is pure (state and settings in, shapes in the 512 px canvas out; test/nav.test.mjs);
// drawND() paints them. The flight deck's ND and the ND view's sharp copy over it (js/view.js) draw
// the same model.
import { RUNWAY, NM, KTS, DEG } from './config.js';
import { AIRPORT, ILS27, FIXES, onCentreline, missedPath } from './nav.js';

export const ND_RANGES = [5, 10, 20, 40, 80, 160];
export const ND_MODES = ['MAP', 'APP', 'PLN'];
export const S = 512;                     // canvas size (px)
const ARC = { cx: 256, cy: 400, r: 330 }; // MAP / APP: the aircraft and the arc's radius at the selected range
const PLAN = { cx: 256, cy: 270, r: 200 };

const MISSED_PTS = missedPath();
const norm360 = (d) => ((d % 360) + 360) % 360;
const wrap180 = (d) => ((d + 540) % 360) - 180;

/** The range the crew would select now (the knob's setting until the pilot turns it). */
export function autoRange(st, circuit) {
  if (circuit) return 20;
  const d = -st.ils.along / NM;           // nm before the threshold (− past it)
  return d > 12 ? 40 : (d > 4 ? 20 : 10);
}

/** The fix the route leads to next: the first one still ahead on the approach ('FI27' in a circuit). */
export function activeFix(st, circuit) {
  if (circuit) return FIXES.find((f) => f.role === 'FAP');
  const d = -st.ils.along / NM;
  return FIXES.find((f) => f.distNm < d - 0.05) || FIXES[FIXES.length - 1];
}

/**
 * The display's content.
 * @param st   the published aircraft state (with st.ils, js/nav.js)
 * @param efis { mode, range, auto }: the EFIS control panel
 * @param opts { hdgBug: selected heading (deg), hdgSel: the autopilot is flying it, circuit: a
 *             go-around and its circuit are under way }
 */
export function ndModel(st, efis, opts = {}) {
  const mode = ND_MODES.includes(efis.mode) ? efis.mode : 'MAP';
  const circuit = !!opts.circuit;
  const range = efis.auto ? autoRange(st, circuit) : efis.range;
  const trk = norm360(st.track / DEG), hdg = norm360(st.heading / DEG);
  const up = mode === 'MAP' ? trk : (mode === 'APP' ? hdg : 0);           // the direction at the top
  const geo = mode === 'PLN' ? PLAN : ARC;
  const k = geo.r / (range * NM);                                            // px per metre
  // world (x east, z south) -> screen: MAP/APP about the aircraft, PLN about the airport
  const ox = mode === 'PLN' ? 0 : st.x, oz = mode === 'PLN' ? 0 : st.z;
  const upR = up * DEG, cu = Math.cos(upR), su = Math.sin(upR);
  const toScreen = (x, z) => {
    const e = (x - ox) * k, n = -(z - oz) * k;                               // east, north (px)
    return { x: geo.cx + e * cu - n * su, y: geo.cy - (e * su + n * cu) };
  };
  const m = {
    mode, range, auto: !!efis.auto, up, S, geo,
    topLabel: mode === 'APP' ? `HDG ${String(Math.round(hdg) % 360).padStart(3, '0')}` : (mode === 'MAP' ? `TRK ${String(Math.round(trk) % 360).padStart(3, '0')}` : 'PLN'),
    gs: Math.round(st.groundSpeed / KTS), tas: Math.round(st.tasKts || 0),
    wind: { dir: Math.round(norm360(st.windDirDeg)), kts: Math.round(st.windKts), rel: wrap180(st.windDirDeg + 180 - up) },
    rings: [0.5, 1].map((f) => ({ r: geo.r * f, label: `${range * f}` })),
    hdgBug: opts.hdgBug === undefined || opts.hdgBug === null ? null : wrap180(opts.hdgBug - up),
    hdgLine: !!opts.hdgSel && mode !== 'PLN',
    toScreen,
  };
  // the aircraft: fixed at the arc's centre in MAP and APP, placed and turned on the plan
  m.aircraft = mode === 'PLN' ? Object.assign(toScreen(st.x, st.z), { rot: trk }) : { x: geo.cx, y: geo.cy, rot: 0 };
  m.trackLine = mode === 'PLN' ? null : wrap180(trk - up);                  // straight up in MAP
  // the runway (both ends), the airport
  const L = RUNWAY.length, W = RUNWAY.width, x0 = RUNWAY.thresholdX, x1 = RUNWAY.thresholdX - L;
  m.runway = [[x0, -W / 2], [x1, -W / 2], [x1, W / 2], [x0, W / 2]].map(([x, z]) => toScreen(x, z));
  m.runwayLine = [toScreen(x0, 0), toScreen(x1, 0)];                        // drawn at least 5 px wide
  m.airport = Object.assign(toScreen(0, 0), { name: AIRPORT.ident });
  if (mode !== 'APP') {
    // the route: the approach's fixes to the threshold (magenta while it is the active route), then
    // the missed approach straight ahead (cyan dashed until a go-around makes it the active leg)
    const pts = FIXES.map((f) => toScreen(onCentreline(f.distNm).x, 0));
    m.route = { pts, active: !circuit };
    m.missed = { pts: MISSED_PTS.map((p) => toScreen(p.x, p.z)), active: circuit };
    const act = activeFix(st, circuit);
    m.fixes = FIXES.filter((f) => f.role !== 'THR').map((f) => Object.assign(toScreen(onCentreline(f.distNm).x, 0), { name: f.name, active: f.name === act.name }));
    const p = onCentreline(act.distNm);
    m.active = { name: act.name, nm: Math.hypot(p.x - st.x, p.z - st.z) / NM };
  } else {
    // the ILS: its course through the runway, the deviation bar (1° a dot) and the glideslope (0.35° a dot)
    const ils = st.ils;
    m.course = { rel: wrap180(ILS27.courseDeg - up), pts: [toScreen(x0 + 15 * NM, 0), toScreen(x1, 0)] };
    m.loc = ils.locValid ? { dots: Math.max(-2.5, Math.min(2.5, -ils.locDev / 1.0)) } : null;
    m.glide = ils.gsValid ? { dots: Math.max(-2.5, Math.min(2.5, -ils.gsDev / 0.35)) } : null;
    m.ilsText = [`${ILS27.ident} ${ILS27.freq}`, `CRS ${ILS27.courseDeg}`, ils.locValid ? `DME ${ils.dmeNm.toFixed(1)}` : 'DME ---'];
  }
  // the offset from the centreline on the final approach (localizer received, within 2 nm of it)
  m.offset = st.ils.locValid && Math.abs(st.ils.lateral) < 2 * NM && -st.ils.along > -RUNWAY.length ? st.ils.lateral : null;
  return m;
}

const MAGENTA = '#ff4dff', CYAN = '#3fe0ff', GREEN = '#3cff6a', WHITE = '#ffffff', GREY = '#4a4a55';
const FONT = 'bold 22px "DejaVu Sans Mono", Consolas, monospace', FONT_S = 'bold 16px "DejaVu Sans Mono", Consolas, monospace';

/** Paint a model on a 512 × 512 canvas context (or one scaled to it with setTransform). */
export function drawND(g, m) {
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const { cx, cy, r } = m.geo;
  g.lineCap = 'round';
  // the rose: an arc (MAP, APP) or a full circle (PLN) with marks every 5°, figures every 30°
  g.save();
  g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.strokeStyle = WHITE; g.lineWidth = 2;
  g.beginPath(); if (m.mode === 'PLN') g.arc(cx, cy, r, 0, 2 * Math.PI); else g.arc(cx, cy, r, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
  g.fillStyle = WHITE; g.font = FONT_S; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d - m.up) * DEG;
    if (m.mode !== 'PLN' && Math.abs(wrap180(d - m.up)) > 58) continue;
    const s = Math.sin(a), c = Math.cos(a), len = d % 10 === 0 ? 14 : 7;
    g.beginPath(); g.moveTo(cx + s * r, cy - c * r); g.lineTo(cx + s * (r - len), cy - c * (r - len)); g.stroke();
    if (d % 30 === 0 && m.mode !== 'PLN') g.fillText(String(d / 10), cx + s * (r - 28), cy - c * (r - 28));
  }
  if (m.mode === 'PLN') for (const [t, d] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) g.fillText(t, cx + Math.sin(d * DEG) * (r + 16), cy - Math.cos(d * DEG) * (r + 16));
  // range rings
  g.strokeStyle = GREY; g.lineWidth = 1; g.fillStyle = GREY; g.textAlign = 'left';
  for (const ring of m.rings.slice(0, 1)) {
    g.beginPath(); if (m.mode === 'PLN') g.arc(cx, cy, ring.r, 0, 2 * Math.PI); else g.arc(cx, cy, ring.r, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillText(ring.label, cx + ring.r * 0.72 + 4, cy - ring.r * 0.69);
  }
  // runway, airport
  g.fillStyle = '#d8d8d8'; g.beginPath(); m.runway.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill();
  g.strokeStyle = CYAN; g.lineWidth = 2; g.beginPath(); g.arc(m.airport.x, m.airport.y, 9, 0, 2 * Math.PI); g.stroke();
  g.fillStyle = CYAN; g.font = FONT_S; g.textAlign = 'left'; g.fillText(m.airport.name, m.airport.x + 12, m.airport.y + 14);
  if (m.route) {
    const line = (pts, color, dash) => { g.strokeStyle = color; g.lineWidth = 3; g.setLineDash(dash || []); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.setLineDash([]); };
    line(m.route.pts, m.route.active ? MAGENTA : WHITE, m.route.active ? null : [10, 8]);
    line(m.missed.pts, m.missed.active ? MAGENTA : CYAN, m.missed.active ? null : [10, 8]);
    m.fixes.forEach((f, i) => {
      g.strokeStyle = f.active ? MAGENTA : WHITE; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.moveTo(f.x, f.y); g.lineTo(f.x + Math.sin(a) * 9, f.y - Math.cos(a) * 9); } g.stroke();
      g.fillStyle = f.active ? MAGENTA : WHITE; g.font = FONT_S; g.textAlign = 'left';
      const ly = f.y + (i % 2 ? 24 : -12);                                             // alternate sides so close fixes stay legible
      if (ly < S - 34) g.fillText(f.name, f.x + 10, ly);
    });
  }
  if (m.course) {
    // the ILS course through the runway
    g.strokeStyle = MAGENTA; g.lineWidth = 3;
    g.beginPath(); g.moveTo(m.course.pts[0].x, m.course.pts[0].y); g.lineTo(m.course.pts[1].x, m.course.pts[1].y); g.stroke();
  }
  // the runway over the route: a white bar at least 5 px wide
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 6; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(m.runwayLine[0].x, m.runwayLine[0].y); g.lineTo(m.runwayLine[1].x, m.runwayLine[1].y); g.stroke(); g.lineCap = 'round';
  // the selected heading: a line to it while the autopilot flies it
  if (m.hdgLine && m.hdgBug !== null) {
    const a = m.hdgBug * DEG; g.strokeStyle = MAGENTA; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.stroke(); g.setLineDash([]);
  }
  g.restore();
  // heading bug on the rose
  if (m.hdgBug !== null && (m.mode === 'PLN' || Math.abs(m.hdgBug) < 60)) {
    const a = m.hdgBug * DEG, s = Math.sin(a), c = Math.cos(a), px = cx + s * r, py = cy - c * r;
    g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = MAGENTA; g.fillRect(-10, -8, 20, 8); g.restore();
  }
  // track line and aircraft
  if (m.trackLine !== null) { const a = m.trackLine * DEG; g.strokeStyle = WHITE; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.stroke(); }
  const A = m.aircraft;
  g.save(); g.translate(A.x, A.y); g.rotate((m.mode === 'PLN' ? A.rot : 0) * DEG);
  g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -16); g.lineTo(-10, 12); g.lineTo(10, 12); g.closePath(); g.stroke();
  g.restore();
  // APP: the deviation scales
  if (m.mode === 'APP') {
    g.strokeStyle = WHITE; g.lineWidth = 2;
    const ly = cy + 60;
    for (const d of [-2, -1, 1, 2]) { g.beginPath(); g.arc(cx + d * 34, ly, 5, 0, 2 * Math.PI); g.stroke(); g.beginPath(); g.arc(S - 26, 250 + d * 34, 5, 0, 2 * Math.PI); g.stroke(); }
    g.beginPath(); g.moveTo(S - 36, 250); g.lineTo(S - 16, 250); g.stroke();
    g.fillStyle = MAGENTA;
    if (m.loc) { const x = cx + m.loc.dots * 34; g.fillRect(x - 3, ly - 22, 6, 44); }
    if (m.glide) { const y = 250 - m.glide.dots * 34; g.beginPath(); g.moveTo(S - 26, y - 10); g.lineTo(S - 16, y); g.lineTo(S - 26, y + 10); g.lineTo(S - 36, y); g.closePath(); g.fill(); }
  }
  // readouts
  g.textBaseline = 'alphabetic'; g.font = FONT_S; g.textAlign = 'left'; g.fillStyle = WHITE;
  g.fillText(`GS ${m.gs}  TAS ${m.tas}`, 8, 20);
  g.fillText(`${String(m.wind.dir).padStart(3, '0')}°/${m.wind.kts}`, 8, 40);
  // the wind arrow points where the wind blows, relative to the top of the display
  g.save(); g.translate(28, 66); g.rotate(m.wind.rel * DEG); g.strokeStyle = WHITE; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 12); g.lineTo(0, -12); g.moveTo(-5, -6); g.lineTo(0, -12); g.lineTo(5, -6); g.stroke(); g.restore();
  g.textAlign = 'center'; g.fillStyle = GREEN; g.font = FONT; g.fillText(m.topLabel, cx, 24);
  g.textAlign = 'right'; g.font = FONT_S;
  if (m.active) { g.fillStyle = MAGENTA; g.fillText(m.active.name, S - 8, 20); g.fillStyle = WHITE; g.fillText(`${m.active.nm.toFixed(1)} NM`, S - 8, 40); }
  if (m.ilsText) { g.fillStyle = GREEN; m.ilsText.forEach((t, i) => g.fillText(t, S - 8, 20 + i * 20)); }
  g.textAlign = 'left'; g.fillStyle = GREEN; g.fillText(`${m.mode} ${m.range} NM`, 8, S - 12);
  if (m.offset !== null && m.mode === 'MAP') { g.textAlign = 'center'; g.fillStyle = MAGENTA; g.fillText(`${Math.abs(m.offset).toFixed(0)} m ${m.offset > 0 ? 'R' : 'L'} of C/L`, cx, S - 12); }
  g.restore();
}

/**
 * Where the ND view puts the display among a phone's controls (all px): the largest square from
 * `top` down to at most `bottom` (and at most `maxSize`) that no obstacle overlaps, as near the
 * middle of the screen as it can be. With `cols` ({ w, h, at }), it also leaves a column `w` wide
 * on each side, level with `at` of the display's height, clear of the obstacles (the phone's speed
 * and altitude). An obstacle left of the screen's middle bounds the display on the left, one right
 * of it on the right. Returns { x, y, size }, or null when nothing fits.
 */
export function ndViewLayout({ W, top, bottom, maxSize = Infinity, obstacles = [], cols = null, gap = 8, left = 0, right = W }) {
  const across = (o, y0, y1) => o.t < y1 - 0.5 && o.b > y0 + 0.5;
  const bounds = (y0, y1) => {
    let lo = left, hi = right;
    for (const o of obstacles) if (across(o, y0, y1)) { if ((o.l + o.r) / 2 < W / 2) lo = Math.max(lo, o.r + gap); else hi = Math.min(hi, o.l - gap); }
    return [lo, hi];
  };
  for (let size = Math.floor(Math.min(bottom - top, maxSize)); size >= 60; size -= 2) {
    let [lo, hi] = bounds(top, top + size);
    if (cols) {
      const c0 = top + size * cols.at, [clo, chi] = bounds(c0, c0 + cols.h);
      lo = Math.max(lo, clo + cols.w + gap); hi = Math.min(hi, chi - cols.w - gap);
    }
    if (hi - lo >= size) return { x: Math.min(Math.max(W / 2 - size / 2, lo), hi - size), y: top, size };
  }
  return null;
}
