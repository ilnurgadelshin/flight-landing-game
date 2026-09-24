// The debrief map on the results screen: the flight's path (js/game.js records it) in three views
//   plan     north up, the whole flight at one scale: the approach, any go-around and circuit, the
//            runway
//   profile  the height against the glidepath on the final approach (and the climb-out of a
//            go-around), with the decision altitude
//   runway   the runway from above, its width stretched so the centreline, the touchdown zone,
//            each touchdown and the stop show
// Colours: the approach blue, a go-around and its circuit amber, on the ground green.
//
// debriefModel() is pure (the path in, shapes in a 960 × 380 canvas out; test/nav.test.mjs);
// drawDebrief() paints them.
import { RUNWAY, NM } from './config.js';
import { ILS27, glidepathFt, glidepathDistNm } from './nav.js';

export const DW = 960, DH = 380;
export const BOX = {
  plan: { x: 8, y: 8, w: 330, h: 262 },
  profile: { x: 350, y: 8, w: 602, h: 262 },
  runway: { x: 8, y: 290, w: 944, h: 82 },
};
const TDZ = [150, 900];                 // m past the threshold: the touchdown zone the grading uses
const thrX = RUNWAY.thresholdX;

/** Split samples into polylines of one kind (and one segment), each joined to the previous one. */
function runs(samples, keep, project) {
  const out = [];
  let cur = null, prev = null;
  for (const s of samples) {
    if (!keep(s)) { cur = null; prev = null; continue; }
    const p = project(s);
    if (!cur || s.kind !== cur.kind || s.seg !== cur.seg) {
      cur = { kind: s.kind, pts: prev && prev.seg === s.seg ? [prev.p] : [] };
      out.push(cur);
    }
    cur.pts.push(p);
    prev = { p, seg: s.seg };
  }
  return out.filter((r) => r.pts.length > 1);
}

/**
 * @param path { samples: [{ t, x, z, altFt, aglFt, kind, seg }], marks: [{ type, x, z, altFt, text }] }
 */
export function debriefModel(path) {
  const S = path.samples || [], marks = path.marks || [];
  const L = RUNWAY.length, farEnd = thrX - L;
  // ---- plan: fit the flight and the runway, the same scale both ways, at least 4 nm across
  const P = BOX.plan;
  let x0 = farEnd - 0.3 * NM, x1 = thrX + 0.5 * NM, z0 = -0.5 * NM, z1 = 0.5 * NM;
  for (const s of S) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  const pad = 0.08;
  let w = (x1 - x0) * (1 + 2 * pad), h = (z1 - z0) * (1 + 2 * pad);
  w = Math.max(w, 4 * NM); h = Math.max(h, 4 * NM * P.h / P.w);
  const k = Math.min(P.w / w, P.h / h);                         // px per m
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const toPlan = (x, z) => ({ x: P.x + P.w / 2 + (x - cx) * k, y: P.y + P.h / 2 + (z - cz) * k });
  const W = RUNWAY.width;
  const plan = {
    toPlan, k,
    runway: [[thrX, -W / 2], [farEnd, -W / 2], [farEnd, W / 2], [thrX, W / 2]].map(([x, z]) => toPlan(x, z)),
    centreline: [toPlan(thrX + 12 * NM, 0), toPlan(thrX, 0)],
    runs: runs(S, () => true, (s) => toPlan(s.x, s.z)),
    marks: marks.map((m) => Object.assign(toPlan(m.x, m.z), { type: m.type, text: m.text })),
    scaleNm: [1, 2, 5, 10, 20].find((n) => n * NM * k > 50) || 20,
  };
  // ---- profile: the samples near the centreline (within 1 nm of it), height against distance
  const R = BOX.profile;
  const near = (s) => Math.abs(s.z) < 1 * NM && s.x > farEnd - 4 * NM;
  let far = 3;
  for (const s of S) if (near(s)) far = Math.max(far, (s.x - thrX) / NM);
  far = Math.min(Math.ceil(far), 15);
  const nearNm = -2;
  let top = 1000;
  for (const s of S) if (near(s) && (s.x - thrX) / NM <= far) top = Math.max(top, s.altFt);
  top = Math.max(1500, Math.min(Math.max(glidepathFt(far), top) * 1.1, 8000));
  top = Math.ceil(top / 500) * 500;
  // the heights between the title and the distance scale at the bottom
  const y0 = R.y + 22, ih = R.h - 22 - 18;
  const toProfile = (distNm, altFt) => ({ x: R.x + (distNm - nearNm) / (far - nearNm) * R.w, y: y0 + ih - Math.max(0, altFt) / top * ih });
  const profile = {
    toProfile, farNm: far, nearNm, topFt: top,
    glide: [toProfile(far, glidepathFt(far)), toProfile(0, glidepathFt(0))],
    da: Object.assign(toProfile(glidepathDistNm(ILS27.daFt), ILS27.daFt), { text: `DA ${ILS27.daFt}` }),
    runway: [toProfile(0, 0), toProfile(-L / NM, 0)],
    runs: runs(S, (s) => near(s) && (s.x - thrX) / NM <= far + 0.01, (s) => toProfile((s.x - thrX) / NM, s.altFt)),
    marks: marks.filter((m) => Math.abs(m.z) < 1 * NM && (m.x - thrX) / NM <= far).map((m) => Object.assign(toProfile((m.x - thrX) / NM, m.altFt), { type: m.type, text: m.text })),
    ticks: Array.from({ length: far - nearNm + 1 }, (_, i) => nearNm + i).map((d) => ({ d, x: toProfile(d, 0).x })),
    heights: [500, 1000, 2000, 3000, 5000, 7000].filter((a) => a < top).map((a) => ({ a, y: toProfile(0, a).y })),
  };
  // ---- runway: along the runway horizontally (the approach from the right, as on the plan), the
  // width stretched: ±60 m over the strip's height
  const U = BOX.runway, before = 600, after = 300, halfM = 60;
  const toRunway = (x, z) => ({ x: U.x + U.w - (thrX - x + before) / (L + before + after) * U.w, y: U.y + U.h / 2 + z / halfM * (U.h / 2) });
  const onStrip = (s) => thrX - s.x > -before && thrX - s.x < L + after && Math.abs(s.z) < halfM * 1.5 && s.aglFt < 200;
  const runway = {
    toRunway,
    outline: [[thrX, -W / 2], [farEnd, -W / 2], [farEnd, W / 2], [thrX, W / 2]].map(([x, z]) => toRunway(x, z)),
    centreline: [toRunway(thrX, 0), toRunway(farEnd, 0)],
    tdz: [toRunway(thrX - TDZ[0], 0).x, toRunway(thrX - TDZ[1], 0).x],
    ticks: [0, 500, 1000, 1500, 2000, 2500, 3000].filter((m) => m <= L).map((m) => ({ m, x: toRunway(thrX - m, 0).x })),
    runs: runs(S, onStrip, (s) => toRunway(s.x, Math.max(-halfM, Math.min(halfM, s.z)))),
    marks: marks.filter((m) => m.type !== 'goaround' && thrX - m.x > -before && thrX - m.x < L + after).map((m) => Object.assign(toRunway(m.x, Math.max(-halfM, Math.min(halfM, m.z))), { type: m.type, text: m.text, alongM: thrX - m.x, lateralM: -m.z })),
  };
  return {
    plan, profile, runway,
    goArounds: marks.filter((m) => m.type === 'goaround').length,
    touchdowns: marks.filter((m) => m.type === 'touchdown' || m.type === 'touchandgo').length,
    empty: S.length < 2,
  };
}

const COL = { approach: '#4fa3ff', goaround: '#ffb020', ground: '#3fd67a' };
const INK = '#e8eef4', DIM = 'rgba(232,238,244,0.35)', PANEL = '#0d141c';
const font = (px, bold = false) => `${bold ? 'bold ' : ''}${px}px "DejaVu Sans", Arial, sans-serif`;
const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };

function drawRuns(g, list, width) {
  g.lineWidth = width;
  for (const r of list) { g.strokeStyle = COL[r.kind] || INK; poly(g, r.pts); g.stroke(); }
}
function drawMark(g, m, labels = true) {
  g.save(); g.translate(m.x, m.y);
  g.lineWidth = 2; g.strokeStyle = '#000';
  if (m.type === 'goaround') { g.fillStyle = COL.goaround; g.beginPath(); g.moveTo(0, -9); g.lineTo(8, 6); g.lineTo(-8, 6); g.closePath(); g.fill(); g.stroke(); }
  else if (m.type === 'touchdown' || m.type === 'touchandgo') { g.fillStyle = m.type === 'touchdown' ? '#fff' : COL.goaround; g.beginPath(); g.arc(0, 0, 5, 0, 2 * Math.PI); g.fill(); g.stroke(); }
  else if (m.type === 'crash') { g.strokeStyle = '#ff4d4d'; g.lineWidth = 3; g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.moveTo(7, -7); g.lineTo(-7, 7); g.stroke(); }
  else { g.fillStyle = '#fff'; g.fillRect(-5, -5, 10, 10); g.strokeRect(-5, -5, 10, 10); }
  if (labels) {
    const t = { goaround: 'GA', touchdown: 'TD', touchandgo: 'T&G', stop: 'STOP', crash: 'CRASH', end: 'END' }[m.type] || '';
    g.fillStyle = INK; g.font = font(12, true); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(t, 8, -6);
  }
  g.restore();
}
function frame(g, b, title) {
  g.fillStyle = PANEL; g.fillRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  g.fillStyle = DIM; g.font = font(12, true); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(title, b.x + 8, b.y + 6);
}

/** Paint a debrief model on a 960 × 380 canvas context. */
export function drawDebrief(g, m) {
  g.save();
  g.clearRect(0, 0, DW, DH);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // ---- plan
  const P = BOX.plan, pl = m.plan;
  frame(g, P, 'TRACK');
  g.save(); g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
  g.strokeStyle = DIM; g.lineWidth = 1; g.setLineDash([6, 6]); poly(g, pl.centreline); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#9aa4ae'; poly(g, pl.runway); g.closePath(); g.fill();
  g.strokeStyle = '#9aa4ae'; g.lineWidth = 4; g.lineCap = 'butt'; poly(g, [pl.runway[0], pl.runway[1]]); g.stroke(); g.lineCap = 'round';
  drawRuns(g, pl.runs, 2.5);
  for (const mk of pl.marks) drawMark(g, mk, mk.type !== 'touchdown' && mk.type !== 'stop');
  g.restore();
  g.fillStyle = DIM; g.font = font(11); g.textAlign = 'right'; g.textBaseline = 'bottom';
  const sl = pl.scaleNm * NM * pl.k, sx = P.x + P.w - 10, sy = P.y + P.h - 8;
  g.strokeStyle = DIM; g.lineWidth = 2; g.beginPath(); g.moveTo(sx - sl, sy); g.lineTo(sx, sy); g.stroke();
  g.fillText(`${pl.scaleNm} NM`, sx, sy - 4);
  g.textAlign = 'left'; g.fillText('N ↑', P.x + 8, P.y + P.h - 6);
  // ---- profile
  const R = BOX.profile, pr = m.profile;
  frame(g, R, 'PROFILE (height above the runway)');
  g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (const hl of pr.heights) { g.beginPath(); g.moveTo(R.x, hl.y); g.lineTo(R.x + R.w, hl.y); g.stroke(); }
  g.fillStyle = DIM; g.font = font(11); g.textAlign = 'right'; g.textBaseline = 'bottom';
  for (const hl of pr.heights) g.fillText(`${hl.a}`, R.x + R.w - 4, hl.y - 2);
  g.strokeStyle = 'rgba(255,77,255,0.8)'; g.lineWidth = 2; g.setLineDash([8, 6]); poly(g, pr.glide); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(255,77,255,0.9)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = font(11, true);
  const gm = { x: (pr.glide[0].x + pr.glide[1].x) / 2, y: (pr.glide[0].y + pr.glide[1].y) / 2 };
  g.fillText(`GS ${ILS27.gsDeg}°`, gm.x + 10, gm.y + 8);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(R.x, pr.da.y); g.lineTo(pr.da.x, pr.da.y); g.stroke();
  g.fillStyle = DIM; g.font = font(11); g.textBaseline = 'bottom'; g.fillText(pr.da.text, R.x + 6, pr.da.y - 2);
  g.strokeStyle = '#9aa4ae'; g.lineWidth = 5; g.lineCap = 'butt'; poly(g, pr.runway); g.stroke(); g.lineCap = 'round';
  drawRuns(g, pr.runs, 2.5);
  for (const mk of pr.marks) drawMark(g, mk, mk.type === 'goaround');
  g.restore();
  g.fillStyle = DIM; g.font = font(11); g.textAlign = 'center'; g.textBaseline = 'top';
  for (const t of pr.ticks) if (t.d > pr.nearNm && t.d < pr.farNm && (pr.farNm <= 8 || t.d % 2 === 0)) g.fillText(t.d === 0 ? 'THR' : `${t.d}`, t.x, R.y + R.h - 15);
  g.textAlign = 'right'; g.fillText('NM', R.x + R.w - 4, R.y + R.h - 15);
  // ---- runway
  const U = BOX.runway, rw = m.runway;
  frame(g, U, 'RUNWAY 27 (width stretched)');
  g.save(); g.beginPath(); g.rect(U.x, U.y, U.w, U.h); g.clip();
  g.fillStyle = '#39424c'; poly(g, rw.outline); g.closePath(); g.fill();
  g.fillStyle = 'rgba(63,214,122,0.16)'; const ry0 = Math.min(rw.outline[0].y, rw.outline[2].y), ry1 = Math.max(rw.outline[0].y, rw.outline[2].y);
  g.fillRect(rw.tdz[1], ry0, rw.tdz[0] - rw.tdz[1], ry1 - ry0);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5; g.setLineDash([10, 8]); poly(g, rw.centreline); g.stroke(); g.setLineDash([]);
  g.fillStyle = DIM; g.font = font(10); g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const t of rw.ticks) g.fillText(t.m === 0 ? 'THR' : `${t.m} m`, t.x, U.y + U.h - 2);
  g.fillStyle = 'rgba(63,214,122,0.8)'; g.textBaseline = 'top'; g.fillText('touchdown zone', (rw.tdz[0] + rw.tdz[1]) / 2, U.y + 6);
  drawRuns(g, rw.runs, 2.5);
  for (const mk of rw.marks) drawMark(g, mk, true);
  g.restore();
  if (m.empty) { g.fillStyle = DIM; g.font = font(14); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('No flight recorded', DW / 2, DH / 2); }
  g.restore();
}
