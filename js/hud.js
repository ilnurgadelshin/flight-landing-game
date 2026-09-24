// The head-up view's display, modelled on the 737's head-up guidance system (HGS). Its symbols are
// conformal: drawn where they lie in the outside world, so the horizon line lies on the horizon and
// the flight path marker on the point the aircraft is heading for.
//   horizon line with heading marks · pitch ladder every 5° (dashed below the horizon)
//   aircraft reference: where the nose points · flight path marker: where the aircraft is going
//   −3° glidepath reference line: the marker on it is a 3° descent
//   speed error tape and acceleration caret on the marker's left wing (landing configuration)
//   runway outline on the approach · guidance cue (Flight School's flight director) · FLARE cue
// Landing with it: put the flight path marker on the touchdown zone and keep it there; on a
// normal approach it then sits on the −3° line. The speed, altitude, vertical speed and ILS
// scales are the #hgs readouts (js/ui.js).
// geometry() is pure (camera and aircraft state in, shapes in CSS px out; tested in Node);
// draw() paints the shapes on a 2D canvas over the 3D view.
import * as THREE from 'three';
import { RUNWAY, DEG, FT } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const V = new THREE.Vector3(), E = new THREE.Vector3(), D = new THREE.Vector3();

/** World direction for a heading (0 = −Z, 90° = +X, as the physics measures it) and an elevation. */
export function dirAzEl(az, el, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** Screen position (CSS px) of a world point seen by the camera, or null when it is behind the eye. */
function project(camera, p, W, H) {
  V.copy(p).applyMatrix4(camera.matrixWorldInverse);
  if (V.z > -0.01) return null;
  V.applyMatrix4(camera.projectionMatrix);
  return { x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H };
}

/**
 * The display's shapes for this camera (its world matrices current) and aircraft state.
 * @param opts { W, H: CSS px; target: speed to fly (kt) or null; accel: speed trend (kt/s);
 *               fd: flight director { pitch, roll } or null }
 */
export function geometry(camera, st, opts) {
  const { W, H } = opts;
  camera.getWorldPosition(E);
  const dir = (az, el) => { dirAzEl(az, el, D); return project(camera, D.multiplyScalar(1000).add(E), W, H); };
  const hdg = st.heading, pitchDeg = st.pitch / DEG;
  // pixels per degree near the centre of the screen
  const pxPerDeg = (H / 2) / Math.tan(camera.fov * DEG / 2) * Math.tan(DEG);
  const g = { W, H, pxPerDeg, horizon: [], ticks: [], ladder: [], gsRef: [], boresight: null, fpv: null, speedTape: null, caret: null, runway: null, cue: null, flare: false };

  // horizon line, with a mark every 5° of heading and the heading (tens of degrees) every 10°
  for (let d = -60; d <= 60; d += 5) g.horizon.push(dir(hdg + d * DEG, 0));
  const first = Math.ceil((hdg / DEG - 60) / 5) * 5;
  for (let deg = first; deg <= hdg / DEG + 60; deg += 5) {
    const az = deg * DEG, p = dir(az, 0), q = dir(az, -0.6 * DEG), l = dir(az, -1.6 * DEG);
    if (!p || !q) continue;
    const norm = ((deg % 360) + 360) % 360;
    g.ticks.push({ a: p, b: q, label: norm % 10 === 0 && l ? { x: l.x, y: l.y, text: String(Math.round(norm / 10) % 36).padStart(2, '0') } : null });
  }

  // pitch ladder: rungs either side of the heading, the ends turned towards the horizon
  for (let deg = -30; deg <= 30; deg += 5) {
    if (!deg || Math.abs(deg - pitchDeg) > 12) continue;
    const el = deg * DEG, k = 1 / Math.cos(el), inner = 1.2 * DEG * k, outer = 4 * DEG * k, end = -Math.sign(deg) * 0.7 * DEG;
    const rung = { deg, dashed: deg < 0, segs: [], labels: [] };
    for (const s of [-1, 1]) {
      const a = dir(hdg + s * inner, el), b = dir(hdg + s * outer, el), c = dir(hdg + s * outer, el + end), t = dir(hdg + s * (outer + 1.4 * DEG * k), el);
      if (a && b) rung.segs.push([a, b]);
      if (b && c) rung.segs.push([b, c]);
      if (t) rung.labels.push({ x: t.x, y: t.y, text: String(Math.abs(deg)) });
    }
    g.ladder.push(rung);
  }

  // the −3° glidepath reference line (a line of constant elevation projects as a slight curve)
  const gs = -RUNWAY.glideslopeDeg * DEG;
  g.gsRef = [];
  for (let d = -12; d <= 12; d += 3) g.gsRef.push(dir(hdg + d * DEG, gs));

  // aircraft reference: along the nose
  g.boresight = dir(hdg, st.pitch);

  // flight path marker: the direction of motion over the ground (it includes the wind's drift)
  const speed = Math.hypot(st.vx, st.vy, st.vz);
  if (speed > 15) {
    D.set(st.vx, st.vy, st.vz).multiplyScalar(1000 / speed).add(E);
    g.fpv = project(camera, D, W, H);
  }
  const airborne = !st.onGround;
  if (g.fpv && airborne && opts.target) {
    // speed error: a tape above the left wing when fast, below when slow (15 kt full length);
    // the caret: the speed trend, level with the wing when the speed is steady
    const dv = clamp(st.ias - opts.target, -15, 15);
    g.speedTape = { x: g.fpv.x - 20, y0: g.fpv.y, y1: g.fpv.y - dv * 2.4 };
    g.caret = { x: g.fpv.x - 30, y: g.fpv.y - clamp((opts.accel || 0) * 6, -30, 30) };
  }

  // runway outline, on the approach (drawn from the runway's corners)
  if (airborne && st.distToThreshold > -RUNWAY.length && st.distToThreshold < 15 * 1852) {
    const x0 = RUNWAY.thresholdX, x1 = RUNWAY.thresholdX - RUNWAY.length, z = RUNWAY.width / 2, y = RUNWAY.elevation;
    const pts = [[x0, -z], [x1, -z], [x1, z], [x0, z]].map(([x, zz]) => project(camera, D.set(x, y, zz), W, H));
    if (pts.every(Boolean)) g.runway = pts;
  }

  // guidance cue: where the flight director wants the flight path marker (pitch error up or
  // down, bank error left or right)
  if (opts.fd && airborne) {
    const base = g.fpv || g.boresight;
    if (base) g.cue = { x: base.x + clamp((opts.fd.roll - st.roll) / DEG * 1.5, -80, 80), y: base.y - clamp((opts.fd.pitch - st.pitch) / DEG, -12, 12) * pxPerDeg };
  }
  const aglFt = st.agl / FT;
  g.flare = airborne && aglFt < 50 && aglFt > 3 && st.vs < 0;
  return g;
}

const GREEN = '#7dff9a', SHADOW = 'rgba(0, 0, 0, 0.55)';

/** Paint the shapes (CSS px) on a 2D context whose canvas is `dpr` device pixels per CSS pixel. */
export function draw(ctx, g, dpr) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, g.W, g.H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // every line twice: a dark outline so it reads against a bright sky, then the green
  const stroke = (build, width = 1.6, dash = null) => {
    for (const pass of [0, 1]) {
      ctx.beginPath(); build();
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = pass ? GREEN : SHADOW; ctx.lineWidth = pass ? width : width + 2;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  const text = (t, x, y, align = 'center', size = 12) => {
    ctx.font = `${size}px "DejaVu Sans Mono", Consolas, Menlo, monospace`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = SHADOW; ctx.strokeText(t, x, y);
    ctx.fillStyle = GREEN; ctx.fillText(t, x, y);
  };
  const polyline = (pts) => { let pen = false; for (const p of pts) { if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true; } };

  stroke(() => polyline(g.horizon), 1.8);
  stroke(() => { for (const t of g.ticks) { ctx.moveTo(t.a.x, t.a.y); ctx.lineTo(t.b.x, t.b.y); } }, 1.4);
  for (const t of g.ticks) if (t.label) text(t.label.text, t.label.x, t.label.y, 'center', 10);
  for (const r of g.ladder) {
    stroke(() => { for (const [a, b] of r.segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }, 1.5, r.dashed ? [6, 5] : null);
    for (const l of r.labels) text(l.text, l.x, l.y, 'center', 11);
  }
  stroke(() => polyline(g.gsRef), 1.4, [3, 7]);
  if (g.runway) stroke(() => { polyline(g.runway); ctx.closePath(); }, 1.4, [8, 5]);
  if (g.boresight) {
    // the aircraft reference: a small gull wing
    const { x, y } = g.boresight;
    stroke(() => { ctx.moveTo(x - 16, y); ctx.lineTo(x - 7, y); ctx.lineTo(x - 3.5, y + 4); ctx.lineTo(x, y); ctx.lineTo(x + 3.5, y + 4); ctx.lineTo(x + 7, y); ctx.lineTo(x + 16, y); }, 1.8);
  }
  if (g.fpv) {
    const { x, y } = g.fpv, r = 7;
    stroke(() => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r, y); ctx.lineTo(x - r - 13, y); ctx.moveTo(x + r, y); ctx.lineTo(x + r + 13, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y - r - 7); }, 2);
    if (g.flare) text('FLARE', x, y + 26, 'center', 13);
  }
  if (g.speedTape && Math.abs(g.speedTape.y1 - g.speedTape.y0) > 0.5) {
    const s = g.speedTape;
    stroke(() => { ctx.moveTo(s.x, s.y0); ctx.lineTo(s.x, s.y1); }, 3);
  }
  if (g.caret) {
    const c = g.caret;
    stroke(() => { ctx.moveTo(c.x - 6, c.y - 5); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x - 6, c.y + 5); }, 1.8);
  }
  if (g.cue) {
    const { x, y } = g.cue;
    stroke(() => { ctx.moveTo(x + 5, y); ctx.arc(x, y, 5, 0, Math.PI * 2); }, 2.2);
  }
}

/** The display on its canvas: sized to the screen, cleared when hidden. */
export class HeadUpDisplay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.shown = false;
    this.last = null;            // the shapes last drawn (tests read them)
  }

  /** Draw for this camera and state (opts as geometry(), plus visible). */
  render(camera, st, opts) {
    if (!this.ctx) return;
    const c = this.canvas, W = c.clientWidth, H = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (!opts.visible || !W || !H) {
      if (this.shown) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, c.width, c.height); }
      this.shown = false; this.last = null;
      return;
    }
    this.last = geometry(camera, st, Object.assign({ W, H }, opts));
    draw(this.ctx, this.last, dpr);
    this.shown = true;
  }
}
