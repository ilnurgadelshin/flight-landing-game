// The approach chart for ILS 27, as a pilot's electronic flight bag shows it: the plan view (north
// up) with the aircraft's own position on it, the profile with the aircraft's height against the
// glidepath, the glideslope and descent-rate tables, the minimums and the missed approach.
// Everything comes from js/nav.js, so the chart, the navigation display and the autoland's missed
// approach always agree. The airport is fictional and so is the chart.
//
// chartModel() is pure (state in, shapes in a 1200 × 800 canvas out; test/nav.test.mjs); drawChart()
// paints them. The fixed parts are computed once; only the own-ship changes from frame to frame.
import { RUNWAY, NM, FT, DEG } from './config.js';
import { TERRAIN } from './physics/terrain.js';
import { AIRPORT, ILS27, FIXES, MISSED, MSA_FT, MISSED_TURN_NM, glidepathFt, glidepathDistNm, onCentreline, missedPath, circuitPath } from './nav.js';

export const CW = 1200, CH = 800;
/** The plan view: its box on the canvas and the world it shows (m; x east, z south), the same scale both ways. */
export const PLAN = { x: 16, y: 112, w: 700, h: 460, west: RUNWAY.thresholdX - 7 * NM, east: RUNWAY.thresholdX + 15 * NM, north: -5 * NM };
PLAN.south = PLAN.north + (PLAN.east - PLAN.west) * PLAN.h / PLAN.w;
/** The profile: its box and the distances (nm before the threshold, − past it) and heights (ft) it shows. */
export const PROFILE = { x: 732, y: 112, w: 452, h: 290, farNm: 15, nearNm: -3, topFt: 4000 };

const thrX = RUNWAY.thresholdX;
/** Plan view: world (x, z) → canvas px. */
export function toPlan(x, z) {
  return { x: PLAN.x + (x - PLAN.west) / (PLAN.east - PLAN.west) * PLAN.w, y: PLAN.y + (z - PLAN.north) / (PLAN.south - PLAN.north) * PLAN.h };
}
/** Profile: distance before the threshold (nm), height (ft) → canvas px. The runway is on the left, as on the plan. */
export function toProfile(distNm, altFt) {
  return { x: PROFILE.x + (distNm - PROFILE.nearNm) / (PROFILE.farNm - PROFILE.nearNm) * PROFILE.w, y: PROFILE.y + PROFILE.h - Math.max(0, altFt) / PROFILE.topFt * PROFILE.h };
}
const inPlan = (p) => p.x >= PLAN.x && p.x <= PLAN.x + PLAN.w && p.y >= PLAN.y && p.y <= PLAN.y + PLAN.h;
const inProfile = (p) => p.x >= PROFILE.x && p.x <= PROFILE.x + PROFILE.w && p.y >= PROFILE.y - 1 && p.y <= PROFILE.y + PROFILE.h + 1;

let fixed = null;
/** The chart's fixed content (the same for every flight). */
export function chartStatic() {
  if (fixed) return fixed;
  const L = RUNWAY.length, W = RUNWAY.width, far = thrX - L;
  const fixes = FIXES.filter((f) => f.role !== 'THR');
  const M = MISSED;
  // the missed approach: straight ahead to 2000 ft, a left turn onto 180 climbing to 3000, then
  // radar vectors (the circuit the autoland is given, drawn dotted)
  const missed = missedPath(), turn = missed[1], south = missed[missed.length - 1], circuit = circuitPath();
  fixed = {
    header: {
      ident: AIRPORT.ident, name: AIRPORT.name.toUpperCase(), title: `ILS RWY ${Math.round(RUNWAY.headingDeg / 10)}`,
      boxes: [['LOC', `${ILS27.ident} ${ILS27.freq}`], ['FINAL CRS', `${String(ILS27.courseDeg).padStart(3, '0')}°`], ['GS', `${ILS27.gsDeg.toFixed(2)}°`],
        ['TCH', `${Math.round(glidepathFt(0) / 5) * 5}'`], ['APT ELEV', `${Math.round(AIRPORT.elevationFt)}'`], ['MSA 25 NM', `${MSA_FT}'`]],
    },
    plan: {
      runway: [[thrX, -W / 2], [far, -W / 2], [far, W / 2], [thrX, W / 2]].map(([x, z]) => toPlan(x, z)),
      airport: Object.assign(toPlan(0, 0), { name: AIRPORT.ident }),
      final: [toPlan(PLAN.east, 0), toPlan(thrX, 0)],
      fixes: fixes.map((f) => Object.assign(toPlan(onCentreline(f.distNm).x, 0), { name: f.name, role: f.role, altFt: f.altFt, dme: f.distNm })),
      haven: Object.assign(toPlan(PLAN.east, 0), { text: `${FIXES[0].name} (${FIXES[0].role}) D${FIXES[0].distNm.toFixed(1)} ${FIXES[0].altFt}` }),
      missed: missed.map((p) => toPlan(p.x, p.z)),
      turn: Object.assign(toPlan(turn.x, 0), { text: `${M.turnAltFt}` }),
      missedEnd: Object.assign(toPlan(south.x, south.z), { text: `${String(M.headings.crosswind).padStart(3, '0')}° ${M.altFt}` }),
      circuit: circuit.map((p) => toPlan(p.x, p.z)),
      scale: { nmPx: PLAN.w / ((PLAN.east - PLAN.west) / NM) },
    },
    profile: {
      level: [toProfile(PROFILE.farNm, FIXES[1].altFt), toProfile(FIXES[2].distNm, FIXES[2].altFt)],
      glide: [toProfile(FIXES[2].distNm, glidepathFt(FIXES[2].distNm)), toProfile(0, glidepathFt(0))],
      fixes: fixes.filter((f) => f.distNm <= PROFILE.farNm).map((f) => Object.assign(toProfile(f.distNm, f.altFt), { name: f.name, role: f.role, altFt: f.altFt, dme: f.distNm })),
      da: Object.assign(toProfile(glidepathDistNm(ILS27.daFt), ILS27.daFt), { text: `DA ${ILS27.daFt}'`, distNm: glidepathDistNm(ILS27.daFt) }),
      runway: [toProfile(0, 0), toProfile(-L / NM, 0)],
      missed: Object.assign([toProfile(glidepathDistNm(ILS27.daFt), ILS27.daFt), toProfile(-MISSED_TURN_NM, M.turnAltFt)], { text: `${M.turnAltFt}  LT ${String(M.headings.crosswind).padStart(3, '0')}°` }),
      terrain: (() => {
        const pts = [];
        for (let d = PROFILE.nearNm; d <= PROFILE.farNm + 1e-6; d += 0.25) pts.push(toProfile(d, TERRAIN.heightAt(thrX + d * NM, 0) / FT));
        return pts;
      })(),
      ticks: Array.from({ length: PROFILE.farNm - PROFILE.nearNm + 1 }, (_, i) => PROFILE.nearNm + i).map((d) => ({ d, x: toProfile(d, 0).x })),
    },
    // the glideslope check (height over the threshold at each DME) and the descent rate for a ground speed
    gsTable: [7, 6, 5, 4, 3, 2].map((d) => ({ dme: d, altFt: Math.round(glidepathFt(d) / 10) * 10 })),
    rodTable: [120, 140, 160, 180].map((gs) => ({ gs, fpm: Math.round(gs * NM / 60 * Math.tan(ILS27.gsDeg * DEG) / FT / 10) * 10 })),
    minima: { title: 'ILS CAT I', lines: [`DA(H) ${ILS27.daFt}'  (${Math.round(ILS27.daFt - AIRPORT.elevationFt)}')`, 'RVR 550 m', 'Circling: not authorised'] },
    missedText: M.text,
    notes: ['Fictional airport and chart for this simulator.', 'Not for real-world navigation.'],
  };
  return fixed;
}

/**
 * The chart with the aircraft on it. own.plan: position and track (deg true) on the plan, and
 * whether it is inside the plan; own.profile: its height against the glidepath, or null when it is
 * outside the profile's distances.
 */
export function chartModel(st) {
  const m = Object.assign({}, chartStatic());
  const p = toPlan(st.x, st.z);
  const distNm = (st.x - thrX) / NM, altFt = (st.alt - RUNWAY.elevation) / FT;
  const q = toProfile(distNm, altFt);
  m.own = {
    plan: { x: p.x, y: p.y, rot: ((st.track / DEG) % 360 + 360) % 360, inside: inPlan(p) },
    profile: inProfile(q) && Math.abs(st.z) < 3 * NM ? { x: q.x, y: q.y, distNm, altFt } : null,
    distNm, altFt,
  };
  return m;
}

const INK = '#101418', BLUE = '#1b5fd1', GREY = '#8a929a', BROWN = '#c9b79a', OWN = '#e0199b';
const font = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px "DejaVu Sans", Arial, sans-serif`;
const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };
function arrowHead(g, a, b, size = 14) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  g.beginPath(); g.moveTo(b.x, b.y);
  g.lineTo(b.x - size * Math.cos(ang - 0.4), b.y - size * Math.sin(ang - 0.4));
  g.lineTo(b.x - size * Math.cos(ang + 0.4), b.y - size * Math.sin(ang + 0.4)); g.closePath(); g.fill();
}
function box(g, x, y, w, h, title) {
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  if (title) { g.fillStyle = INK; g.font = font(15); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(title, x + 8, y + 6); }
}
function wrap(g, text, x, y, w, lh) {
  const words = text.split(' '); let line = '';
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}
/** The aircraft symbol, pointing along `rot` (deg, 0 = up). */
function ownShip(g, x, y, rot, s = 1) {
  g.save(); g.translate(x, y); g.rotate(rot * DEG); g.scale(s, s);
  g.fillStyle = OWN; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(4, -4); g.lineTo(16, 4); g.lineTo(4, 3); g.lineTo(3, 12); g.lineTo(8, 16); g.lineTo(-8, 16); g.lineTo(-3, 12); g.lineTo(-4, 3); g.lineTo(-16, 4); g.lineTo(-4, -4); g.closePath();
  g.fill(); g.stroke(); g.restore();
}

/** Paint a chart model on a 1200 × 800 canvas context. */
export function drawChart(g, m) {
  g.save();
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, CW, CH);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // ---- header
  const H = m.header;
  g.fillStyle = INK; g.textBaseline = 'top';
  g.font = font(30); g.textAlign = 'left'; g.fillText(`${H.ident}  ${H.name}`, 16, 12);
  g.textAlign = 'right'; g.fillText(H.title, CW - 16, 12);
  const bw = (CW - 32) / H.boxes.length;
  H.boxes.forEach(([k, v], i) => {
    const x = 16 + i * bw; g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x, 52, bw - 6, 50);
    g.textAlign = 'left'; g.font = font(13, false); g.fillText(k, x + 8, 57);
    g.font = font(22); g.fillText(v, x + 8, 74);
  });
  // ---- plan view
  const P = m.plan;
  g.save();
  g.beginPath(); g.rect(PLAN.x, PLAN.y, PLAN.w, PLAN.h); g.clip();
  // the MSA: a circle in the corner, 25 nm round the airport
  g.strokeStyle = GREY; g.lineWidth = 1.5; g.beginPath(); g.arc(PLAN.x + 70, PLAN.y + 70, 48, 0, 2 * Math.PI); g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(20); g.fillText(`${MSA_FT}`, PLAN.x + 70, PLAN.y + 62);
  g.font = font(12, false); g.fillText('MSA 25 NM', PLAN.x + 70, PLAN.y + 84);
  // radar vectors (typical): dotted grey
  g.strokeStyle = GREY; g.lineWidth = 2; g.setLineDash([3, 8]); poly(g, P.circuit); g.stroke(); g.setLineDash([]);
  g.fillStyle = GREY; g.font = font(14, false); g.textAlign = 'center'; g.textBaseline = 'bottom';
  const mid = { x: (P.circuit[0].x + P.circuit[1].x) / 2, y: P.circuit[0].y - 4 };
  g.fillText('radar vectors (typical)', mid.x, mid.y);
  // the final approach course (bold, with the course) and the missed approach (dashed)
  g.strokeStyle = INK; g.lineWidth = 4; poly(g, P.final); g.stroke();
  g.fillStyle = INK; arrowHead(g, P.final[0], { x: P.final[1].x + 30, y: P.final[1].y }, 18);
  g.font = font(18); g.textBaseline = 'bottom'; g.textAlign = 'center';
  g.fillText(`${String(ILS27.courseDeg).padStart(3, '0')}°`, (P.fixes[2].x + P.runway[0].x) / 2, P.final[0].y - 8);
  g.lineWidth = 2.5; g.setLineDash([12, 8]); poly(g, P.missed); g.stroke(); g.setLineDash([]);
  arrowHead(g, P.missed[P.missed.length - 2], P.missed[P.missed.length - 1], 14);
  g.font = font(16); g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(P.turn.text, P.turn.x - 16, P.turn.y - 10);
  g.textBaseline = 'top'; g.fillText(P.missedEnd.text, P.missedEnd.x + 8, P.missedEnd.y - 6);
  // the runway and the airport
  g.fillStyle = INK; poly(g, P.runway); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'butt'; poly(g, [P.runway[0], P.runway[1]]); g.stroke(); g.lineCap = 'round';
  g.font = font(16); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(`RWY ${Math.round(RUNWAY.headingDeg / 10)}`, (P.runway[0].x + P.runway[1].x) / 2, P.runway[0].y + 14);
  // the fixes: a triangle, the name, the altitude and the DME
  for (const f of P.fixes) {
    g.fillStyle = f.role === 'FAP' ? '#fff' : INK; g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.moveTo(f.x, f.y - 10); g.lineTo(f.x + 9, f.y + 7); g.lineTo(f.x - 9, f.y + 7); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.textAlign = 'center'; g.font = font(16); g.textBaseline = 'top';
    g.fillText(f.name, f.x, f.y + 14);
    g.font = font(14, false); g.fillText(`D${f.dme.toFixed(1)} ${ILS27.ident}`, f.x, f.y + 34);
    g.textBaseline = 'bottom'; g.font = font(15); g.fillText(`${f.role} ${f.altFt}`, f.x, f.y - 14);
  }
  g.textAlign = 'right'; g.textBaseline = 'top'; g.font = font(14); g.fillText(`from ${P.haven.text}`, P.haven.x - 8, P.haven.y + 58);
  // north and the scale
  g.textAlign = 'center'; g.textBaseline = 'top'; g.font = font(18); g.fillText('N', PLAN.x + PLAN.w - 26, PLAN.y + 8);
  g.lineWidth = 2; g.beginPath(); g.moveTo(PLAN.x + PLAN.w - 26, PLAN.y + 54); g.lineTo(PLAN.x + PLAN.w - 26, PLAN.y + 30); g.stroke();
  g.fillStyle = INK; arrowHead(g, { x: PLAN.x + PLAN.w - 26, y: PLAN.y + 54 }, { x: PLAN.x + PLAN.w - 26, y: PLAN.y + 30 }, 10);
  const sx = PLAN.x + PLAN.w - 20 - 5 * P.scale.nmPx, sy = PLAN.y + PLAN.h - 20;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 5 * P.scale.nmPx, sy); g.stroke();
  g.font = font(13, false); g.textBaseline = 'bottom'; g.fillText('5 NM', sx + 2.5 * P.scale.nmPx, sy - 4);
  // own ship
  if (m.own && m.own.plan.inside) ownShip(g, m.own.plan.x, m.own.plan.y, m.own.plan.rot, 1);
  g.restore();
  box(g, PLAN.x, PLAN.y, PLAN.w, PLAN.h);
  if (m.own && !m.own.plan.inside) { g.fillStyle = OWN; g.font = font(15); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('Aircraft off the plan', PLAN.x + 8, PLAN.y + PLAN.h - 6); }
  // ---- profile
  const F = m.profile, PR = PROFILE;
  g.save(); g.beginPath(); g.rect(PR.x, PR.y, PR.w, PR.h); g.clip();
  g.fillStyle = BROWN; g.beginPath(); g.moveTo(F.terrain[0].x, PR.y + PR.h); F.terrain.forEach((p) => g.lineTo(p.x, p.y)); g.lineTo(F.terrain[F.terrain.length - 1].x, PR.y + PR.h); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'butt'; poly(g, F.runway); g.stroke(); g.lineCap = 'round';
  g.lineWidth = 3.5; poly(g, F.level); g.stroke();
  g.lineWidth = 4; poly(g, F.glide); g.stroke();
  g.lineWidth = 2.5; g.setLineDash([12, 8]); poly(g, F.missed); g.stroke(); g.setLineDash([]);
  g.fillStyle = INK; arrowHead(g, F.missed[0], F.missed[1], 12);
  g.font = font(13); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(F.missed.text, F.missed[1].x + 2, F.missed[1].y + 4);
  for (const f of F.fixes) {
    g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(f.x, PR.y + 24); g.lineTo(f.x, PR.y + PR.h); g.stroke();
    g.fillStyle = INK; g.font = font(15); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(f.name, f.x, PR.y + 4);
    g.font = font(13, false); g.textBaseline = 'bottom'; g.fillText(`${f.altFt}`, f.x + (f.role === 'FAP' ? 24 : -24), f.y - 6);
  }
  g.fillStyle = BLUE; g.beginPath(); g.arc(F.da.x, F.da.y, 5, 0, 2 * Math.PI); g.fill();
  g.font = font(14); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(F.da.text, F.da.x + 8, F.da.y - 4);
  g.fillStyle = INK; g.font = font(14); g.textAlign = 'center';
  g.fillText(`GS ${ILS27.gsDeg.toFixed(2)}°`, (F.glide[0].x + F.glide[1].x) / 2 + 30, (F.glide[0].y + F.glide[1].y) / 2 - 6);
  if (m.own && m.own.profile) {
    g.fillStyle = OWN; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(m.own.profile.x, m.own.profile.y, 8, 0, 2 * Math.PI); g.fill(); g.stroke();
  }
  g.restore();
  box(g, PR.x, PR.y, PR.w, PR.h);
  g.fillStyle = INK; g.font = font(12, false); g.textAlign = 'center'; g.textBaseline = 'top';
  for (const t of F.ticks) if (t.d % 2 === 0) g.fillText(t.d === 0 ? 'THR' : `${t.d}`, t.x, PR.y + PR.h + 3);
  g.textAlign = 'right'; g.fillText('DME (NM)', PR.x + PR.w, PR.y + PR.h + 18);
  // ---- tables under the profile
  const tx = PR.x, ty = PR.y + PR.h + 40, tw = PR.w;
  box(g, tx, ty, tw, 136);
  g.textBaseline = 'top'; g.textAlign = 'left'; g.font = font(14); g.fillStyle = INK;
  g.fillText('GS CHECK', tx + 8, ty + 8); g.fillText('DESCENT', tx + 8, ty + 74);
  const cols = m.gsTable.length, cw = (tw - 110) / cols;
  m.gsTable.forEach((r, i) => {
    const x = tx + 104 + i * cw + cw / 2; g.textAlign = 'center';
    g.font = font(13, false); g.fillText(`D${r.dme}`, x, ty + 10); g.font = font(16); g.fillText(`${r.altFt}`, x, ty + 34);
  });
  const rw = (tw - 110) / m.rodTable.length;
  m.rodTable.forEach((r, i) => {
    const x = tx + 104 + i * rw + rw / 2; g.textAlign = 'center';
    g.font = font(13, false); g.fillText(`${r.gs} KT`, x, ty + 76); g.font = font(16); g.fillText(`${r.fpm}`, x, ty + 100);
  });
  g.textAlign = 'left'; g.font = font(12, false); g.fillText('ft', tx + 8, ty + 36); g.fillText('fpm', tx + 8, ty + 102);
  // ---- bottom: minimums, the missed approach, notes
  const by = 588, bh = CH - by - 14;
  box(g, 16, by, 380, bh, 'MINIMUMS');
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = INK; g.font = font(20); g.fillText(m.minima.title, 26, by + 36);
  m.minima.lines.forEach((t, i) => { g.font = font(i ? 16 : 20, i === 0); g.fillText(t, 26, by + 68 + i * 30); });
  box(g, 408, by, 470, bh, 'MISSED APPROACH');
  g.fillStyle = INK; g.font = font(17, false); wrap(g, m.missedText, 418, by + 36, 450, 24);
  box(g, 890, by, CW - 16 - 890, bh, 'NOTES');
  g.font = font(14, false); let ny = by + 36;
  for (const n of m.notes) ny = wrap(g, n, 900, ny, CW - 16 - 910, 20);
  if (m.own) {
    g.fillStyle = OWN; g.font = font(15); ny += 8;
    g.fillText(`Aircraft: ${m.own.distNm >= 0 ? `${m.own.distNm.toFixed(1)} NM out` : `${(-m.own.distNm).toFixed(1)} NM past THR`}`, 900, ny);
    g.fillText(`${Math.round(m.own.altFt / 10) * 10} ft`, 900, ny + 22);
  }
  g.restore();
}
