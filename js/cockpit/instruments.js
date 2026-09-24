// Canvas-drawn display units: PFD, ND, upper (engine) and lower (systems)
// displays in the style of the 737NG. Each returns a THREE.CanvasTexture that
// is redrawn from the physics state every frame.
import * as THREE from 'three';
import { AIRCRAFT as AC, RUNWAY, DEG, FT, KTS, NM } from '../config.js';
import { ndModel, drawND } from '../nd.js';
import { ILS27 } from '../nav.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const S = 512;

function mkCanvas() {
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return { canvas: c, ctx: c.getContext('2d'), tex };
}

const FONT = 'bold 15px "DejaVu Sans Mono", Consolas, monospace';
const FONT_S = 'bold 12px "DejaVu Sans Mono", Consolas, monospace';
const FONT_L = 'bold 24px "DejaVu Sans Mono", Consolas, monospace';
const MAGENTA = '#ff4dff', GREEN = '#33ff66', CYAN = '#33ddff', WHITE = '#ffffff', AMBER = '#ffb020', RED = '#ff2020';

// ---------------------------------------------------------------------------
export class PFD {
  constructor() { Object.assign(this, mkCanvas()); this.fdEnabled = false; this.fd = { pitch: 0, roll: 0 }; this.frame = 0; }

  draw(st, extra = {}) {
    const g = this.ctx;
    this.frame++;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const cx = 250, cy = 250, R = 128;      // attitude indicator
    const pitchDeg = st.pitch / DEG, roll = st.roll;
    const pxPerDeg = 6.4;

    // ---- attitude sphere (clipped to a rounded rect)
    g.save();
    g.beginPath(); g.roundRect(cx - 150, cy - 138, 300, 276, 10); g.clip();
    g.translate(cx, cy); g.rotate(-roll);
    const horizonY = pitchDeg * pxPerDeg;
    g.fillStyle = '#1b6fd6'; g.fillRect(-400, -600 + horizonY, 800, 600);   // sky
    g.fillStyle = '#8a5a2b'; g.fillRect(-400, horizonY, 800, 600);          // ground
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-400, horizonY); g.lineTo(400, horizonY); g.stroke();
    // pitch ladder
    g.font = FONT_S; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let p = -30; p <= 30; p += 2.5) {
      if (p === 0) continue;
      const y = horizonY - p * pxPerDeg;
      if (Math.abs(y) > 150) continue;
      const w = p % 10 === 0 ? 46 : p % 5 === 0 ? 26 : 12;
      g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
      if (p % 10 === 0) { g.fillText(Math.abs(p), -w - 16, y); g.fillText(Math.abs(p), w + 16, y); }
    }
    g.restore();
    // roll scale
    g.save(); g.translate(cx, cy);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const len = a === 0 ? 14 : (Math.abs(a) === 30 || Math.abs(a) === 60 ? 12 : 7);
      const r = a === 0 ? R + 8 : R + 4;
      const rad = a * DEG;
      g.beginPath(); g.moveTo(Math.sin(rad) * r, -Math.cos(rad) * r); g.lineTo(Math.sin(rad) * (r + len), -Math.cos(rad) * (r + len)); g.stroke();
    }
    // bank pointer + slip indicator
    g.rotate(-roll);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -R + 2); g.lineTo(-8, -R + 16); g.lineTo(8, -R + 16); g.closePath(); g.fill();
    const slip = clamp(-st.beta / DEG * 2.2, -14, 14);
    g.fillStyle = Math.abs(slip) > 8 ? AMBER : '#fff'; g.fillRect(-8 + slip, -R + 18, 16, 5);
    g.restore();
    // aircraft symbol
    g.fillStyle = '#000'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    const wing = (x0, x1) => { g.beginPath(); g.rect(x0, cy - 3, x1 - x0, 6); g.fill(); g.stroke(); };
    wing(cx - 110, cx - 48); wing(cx + 48, cx + 110);
    g.beginPath(); g.rect(cx - 4, cy - 4, 8, 8); g.fill(); g.stroke();
    // flight director (magenta bars)
    if (this.fdEnabled) {
      const fp = clamp((this.fd.pitch - st.pitch) / DEG * pxPerDeg, -90, 90);
      const fr = clamp((this.fd.roll - st.roll) / DEG * 3.2, -90, 90);
      g.strokeStyle = MAGENTA; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx - 80, cy - fp); g.lineTo(cx + 80, cy - fp); g.stroke();
      g.beginPath(); g.moveTo(cx + fr, cy - 80); g.lineTo(cx + fr, cy + 80); g.stroke();
    }

    // ---- airspeed tape
    const asX = 20, asW = 76, tapeTop = 92, tapeH = 316, tcy = tapeTop + tapeH / 2;
    g.save(); g.beginPath(); g.rect(asX, tapeTop, asW, tapeH); g.clip();
    g.fillStyle = 'rgba(70,70,80,0.9)'; g.fillRect(asX, tapeTop, asW, tapeH);
    const ias = st.ias, pxPerKt = 3.2;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.font = FONT; g.textAlign = 'right'; g.fillStyle = '#fff';
    for (let v = Math.floor((ias - 60) / 10) * 10; v <= ias + 60; v += 10) {
      if (v < 30) continue;
      const y = tcy - (v - ias) * pxPerKt;
      g.beginPath(); g.moveTo(asX + asW - 14, y); g.lineTo(asX + asW, y); g.stroke();
      if (v % 20 === 0) g.fillText(v, asX + asW - 18, y);
    }
    // speed bands: stall (red/black barber pole) and flap limit (amber)
    const vs1g = st.vsStall || 0;
    if (vs1g > 0) {
      const yTop = tcy - (vs1g - ias) * pxPerKt;
      g.fillStyle = RED; g.fillRect(asX + asW - 8, yTop, 8, 400);
      for (let y = yTop; y < yTop + 400; y += 12) { g.fillStyle = '#000'; g.fillRect(asX + asW - 8, y, 8, 6); }
      // amber band: 1.3 Vs .. Vs (min manoeuvre speed)
      const yAmb = tcy - (vs1g * 1.23 - ias) * pxPerKt;
      g.fillStyle = AMBER; g.fillRect(asX + asW - 8, yAmb, 8, Math.max(0, yTop - yAmb));
    }
    const vfe = AC.flaps.vfe[st.flapIndex];
    if (vfe < 300) { const yv = tcy - (vfe - ias) * pxPerKt; g.fillStyle = RED; g.fillRect(asX + asW - 8, yv - 400, 8, 400); for (let y = yv - 400; y < yv; y += 12) { g.fillStyle = '#000'; g.fillRect(asX + asW - 8, y, 8, 6); } }
    // Vref bug + selected speed bug
    const bug = (v, col, label) => { const y = tcy - (v - ias) * pxPerKt; g.fillStyle = col; g.beginPath(); g.moveTo(asX + asW, y); g.lineTo(asX + asW - 10, y - 7); g.lineTo(asX + asW - 10, y + 7); g.closePath(); g.fill(); if (label) { g.font = FONT_S; g.fillStyle = col; g.textAlign = 'left'; g.fillText(label, asX + 2, y); } };
    bug(st.vref, GREEN, 'REF');
    if (extra.targetSpeed) bug(extra.targetSpeed, MAGENTA);
    g.restore();
    // current speed box
    g.fillStyle = '#000'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(asX - 4, tcy - 20, asW + 4, 40, 4); g.fill(); g.stroke();
    g.font = FONT_L; g.fillStyle = st.stallWarning ? RED : '#fff'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(Math.round(ias), asX + asW - 8, tcy);
    // selected speed readout
    g.font = FONT; g.fillStyle = MAGENTA; g.textAlign = 'center';
    g.fillText(extra.targetSpeed ? Math.round(extra.targetSpeed) : '---', asX + asW / 2, 74);
    // ground speed / mach
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = FONT_S; g.fillText(`GS ${Math.round(st.groundSpeed / KTS)}`, asX, tapeTop + tapeH + 16);

    // ---- altitude tape
    const alX = 404, alW = 84;
    g.save(); g.beginPath(); g.rect(alX, tapeTop, alW, tapeH); g.clip();
    g.fillStyle = 'rgba(70,70,80,0.9)'; g.fillRect(alX, tapeTop, alW, tapeH);
    const altFt = st.alt / FT, pxPerFt = 0.5;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.font = FONT; g.textAlign = 'left'; g.fillStyle = '#fff';
    for (let a = Math.floor((altFt - 400) / 100) * 100; a <= altFt + 400; a += 100) {
      if (a < -500) continue;
      const y = tcy - (a - altFt) * pxPerFt;
      g.beginPath(); g.moveTo(alX, y); g.lineTo(alX + 12, y); g.stroke();
      if (a % 200 === 0) g.fillText(a, alX + 16, y);
    }
    // ground (radio altitude) reference: brown/amber bar for the ground below 2500 ft
    if (st.agl / FT < 2500) {
      const yg = tcy + (st.agl / FT) * pxPerFt;
      g.fillStyle = 'rgba(200,120,30,0.85)'; g.fillRect(alX, yg, alW, 500);
      for (let y = yg; y < yg + 500; y += 10) { g.fillStyle = '#000'; g.fillRect(alX, y, alW, 3); }
    }
    g.restore();
    g.fillStyle = '#000'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(alX, tcy - 20, alW + 4, 40, 4); g.fill(); g.stroke();
    g.font = FONT_L; g.fillStyle = '#fff'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(Math.round(altFt / 20) * 20, alX + alW - 6, tcy);
    // radio altitude
    if (st.agl / FT < 2500) {
      g.font = FONT_L; g.fillStyle = st.agl / FT < 200 ? AMBER : '#fff'; g.textAlign = 'center';
      g.fillText(Math.round(st.agl / FT / (st.agl / FT < 100 ? 2 : 10)) * (st.agl / FT < 100 ? 2 : 10), cx, cy + 112);
    }
    // baro
    g.font = FONT_S; g.fillStyle = GREEN; g.textAlign = 'left'; g.fillText('1013 HPA', alX, tapeTop + tapeH + 16);

    // ---- vertical speed
    const vsX = 496, vsTop = 150, vsH = 200;
    g.fillStyle = 'rgba(70,70,80,0.9)'; g.beginPath(); g.moveTo(vsX - 6, vsTop); g.lineTo(vsX + 14, vsTop + 30); g.lineTo(vsX + 14, vsTop + vsH - 30); g.lineTo(vsX - 6, vsTop + vsH); g.closePath(); g.fill();
    const vsFpm = st.vs / 0.00508;
    const vsScale = (v) => { const a = Math.abs(v); const y = a <= 1000 ? a * 0.05 : 50 + (Math.min(a, 6000) - 1000) * 0.008; return Math.sign(v) * y; };
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.font = FONT_S; g.fillStyle = '#fff'; g.textAlign = 'left';
    for (const v of [-6000, -2000, -1000, -500, 0, 500, 1000, 2000, 6000]) { const y = vsTop + vsH / 2 - vsScale(v); g.beginPath(); g.moveTo(vsX - 4, y); g.lineTo(vsX + 2, y); g.stroke(); if (v !== 0 && Math.abs(v) >= 1000) g.fillText(Math.abs(v) / 1000, vsX + 4, y); }
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(vsX - 6, vsTop + vsH / 2 - vsScale(vsFpm)); g.lineTo(vsX + 40, vsTop + vsH / 2 - vsScale(vsFpm) * 0.35); g.stroke();
    if (Math.abs(vsFpm) > 300) { g.font = FONT_S; g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(Math.round(Math.abs(vsFpm) / 50) * 50, S - 2, vsFpm > 0 ? vsTop - 10 : vsTop + vsH + 14); }

    // ---- ILS deviation scales (localizer below the ADI, glideslope right of it)
    const dots = (dev, full) => clamp(dev / full, -2.5, 2.5);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 2;
    const locY = cy + 152, gsX = cx + 168;
    for (const d of [-2, -1, 1, 2]) { g.beginPath(); g.arc(cx + d * 34, locY, 4, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(gsX, cy + d * 34, 4, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx, locY - 10); g.lineTo(cx, locY + 10); g.stroke();
    g.beginPath(); g.moveTo(gsX - 10, cy); g.lineTo(gsX + 10, cy); g.stroke();
    // the ILS 27 receivers (js/nav.js): a pointer only where its signal is received
    const ils = st.ils || { locValid: false, gsValid: false };
    g.fillStyle = MAGENTA;
    if (ils.locValid) {
      const locD = dots(-ils.locDev, 1.0);   // needle shows where the course is: aircraft right => needle left
      g.beginPath(); g.moveTo(cx + locD * 34, locY - 9); g.lineTo(cx + locD * 34 + 9, locY); g.lineTo(cx + locD * 34, locY + 9); g.lineTo(cx + locD * 34 - 9, locY); g.closePath(); g.fill();
    }
    if (ils.gsValid) {
      const gsD = dots(-ils.gsDev, 0.35);    // above the glideslope => needle down
      g.beginPath(); g.moveTo(gsX, cy - gsD * 34 - 9); g.lineTo(gsX + 9, cy - gsD * 34); g.lineTo(gsX, cy - gsD * 34 + 9); g.lineTo(gsX - 9, cy - gsD * 34); g.closePath(); g.fill();
    }
    // the tuned ILS and its DME, inside the top left corner of the attitude display (as on a 737),
    // clear of the selected speed above the speed tape
    g.font = FONT_S; g.textAlign = 'left'; g.fillStyle = ils.locValid ? '#fff' : '#bbb';
    g.fillText(`${ILS27.ident}/${ILS27.courseDeg}°`, 106, 130);
    g.fillText(ils.locValid ? `DME ${ils.dmeNm.toFixed(1)}` : 'DME ---', 106, 148);

    // ---- heading strip
    const hdgY = 470;
    g.fillStyle = 'rgba(70,70,80,0.9)'; g.fillRect(120, hdgY - 22, 260, 44);
    g.save(); g.beginPath(); g.rect(120, hdgY - 22, 260, 44); g.clip();
    const hdg = st.heading / DEG, pxPerDegH = 3.6;
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.font = FONT_S; g.textAlign = 'center';
    for (let h = Math.floor((hdg - 40) / 5) * 5; h <= hdg + 40; h += 5) {
      let d = h - hdg; const x = cx + d * pxPerDegH;
      const hh = ((h % 360) + 360) % 360;
      g.beginPath(); g.moveTo(x, hdgY - 22); g.lineTo(x, hdgY - (hh % 10 === 0 ? 10 : 16)); g.stroke();
      if (hh % 10 === 0) g.fillText(hh / 10, x, hdgY + 4);
    }
    // selected heading bug (the mode control panel's) + track line
    const rwyBug = (((extra.mcp ? extra.mcp.hdg : RUNWAY.headingDeg) - hdg + 540) % 360) - 180;
    g.fillStyle = MAGENTA; g.fillRect(cx + rwyBug * pxPerDegH - 6, hdgY - 22, 12, 6);
    const trk = ((st.track / DEG - hdg + 540) % 360) - 180;
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(cx + trk * pxPerDegH, hdgY - 22); g.lineTo(cx + trk * pxPerDegH, hdgY + 20); g.stroke();
    g.restore();
    g.fillStyle = '#000'; g.strokeStyle = '#fff'; g.beginPath(); g.rect(cx - 26, hdgY - 46, 52, 24); g.fill(); g.stroke();
    g.font = FONT; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, hdgY - 34);
    g.font = FONT_S; g.fillStyle = GREEN; g.textAlign = 'left'; g.fillText('MAG', 122, hdgY - 30);

    // ---- flight mode annunciator (top)
    g.font = FONT_S; g.textAlign = 'center';
    const fma = [['A/T', extra.autothrottle || ''], ['ROLL', extra.rollMode || ''], ['PITCH', extra.pitchMode || '']];
    this.fma = fma.map(([, val]) => val);           // what the annunciator shows (the tests read it)
    fma.forEach(([lbl, val], i) => { const x = 130 + i * 120; g.fillStyle = '#888'; g.fillText(lbl, x, 14); g.fillStyle = GREEN; g.font = FONT; g.fillText(val, x, 36); g.font = FONT_S; });
    if (st.stallWarning) { g.fillStyle = RED; g.font = FONT_L; g.fillText('STALL', cx, cy - 60); }
    if (extra.gaMode) { g.fillStyle = GREEN; g.font = FONT; g.fillText('GO-AROUND', cx, 60); }
    // DH / minimums
    g.fillStyle = GREEN; g.font = FONT_S; g.textAlign = 'right'; g.fillText('RADIO 200', S - 8, 60);
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class ND {
  constructor() { Object.assign(this, mkCanvas()); this.last = null; }
  /** efis: { mode, range, auto }; opts: { hdgBug, hdgSel, circuit } (js/nd.js). */
  draw(st, efis = { mode: 'MAP', range: 20, auto: true }, opts = {}) {
    this.last = ndModel(st, efis, opts);
    drawND(this.ctx, this.last);
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
function dial(g, x, y, r, frac, label, value, opts = {}) {
  // 737-style N1 arc gauge: 0..1 over 220°
  const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.22;
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
  if (opts.redline) { g.strokeStyle = RED; g.beginPath(); g.arc(x, y, r, a0 + (a1 - a0) * opts.redline, a1); g.stroke(); }
  const a = a0 + (a1 - a0) * clamp(frac, 0, 1.05);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r * 0.75 + Math.cos(a + 1.57) * 4, y + Math.sin(a) * r * 0.75 + Math.sin(a + 1.57) * 4); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  g.fillStyle = '#000'; g.strokeStyle = '#888'; g.beginPath(); g.rect(x - 34, y + 10, 68, 26); g.fill(); g.stroke();
  g.font = FONT_L; g.fillStyle = opts.color || '#fff'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(value, x + 30, y + 23);
  if (opts.tick !== undefined) { const at = a0 + (a1 - a0) * opts.tick; g.strokeStyle = MAGENTA; g.lineWidth = 3; g.beginPath(); g.moveTo(x + Math.cos(at) * (r + 2), y + Math.sin(at) * (r + 2)); g.lineTo(x + Math.cos(at) * (r + 12), y + Math.sin(at) * (r + 12)); g.stroke(); }
  g.font = FONT_S; g.fillStyle = CYAN; g.textAlign = 'center'; g.fillText(label, x, y - r - 12);
}

export class UpperDU {
  constructor() { Object.assign(this, mkCanvas()); }
  draw(st, extra = {}) {
    const g = this.ctx;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    // N1 gauges
    for (let i = 0; i < 2; i++) {
      const x = 120 + i * 200, y = 120;
      const n1 = st.n1[i] * 100;
      dial(g, x, y, 62, n1 / 100, i === 0 ? 'N1' : '', n1.toFixed(1), { redline: 1.0, tick: st.throttle * 0.79 + 0.21 });
      if (st.reverser > 0.1) { g.font = FONT; g.fillStyle = st.reverser > 0.9 ? GREEN : AMBER; g.textAlign = 'center'; g.fillText('REV', x, y - 92); }
      // EGT
      const egt = 380 + st.n1[i] * 520 + (st.reverser > 0.5 ? 60 : 0);
      dial(g, x, y + 150, 42, (egt - 300) / 700, i === 0 ? 'EGT' : '', Math.round(egt), { redline: 0.93 });
      // N2 & fuel flow
      g.font = FONT; g.fillStyle = '#fff'; g.textAlign = 'right';
      const n2 = 60 + st.n1[i] * 39;
      g.fillText(`${n2.toFixed(1)}`, x + 30, y + 240);
      g.fillText(`${(0.3 + Math.pow(st.n1[i], 2.2) * 3.2).toFixed(2)}`, x + 30, y + 270);
    }
    g.font = FONT_S; g.fillStyle = CYAN; g.textAlign = 'center'; g.fillText('N2', 220, 360); g.fillText('FF', 220, 390);
    g.fillStyle = '#888'; g.fillText('TAT +14C', 60, 500);
    // flap gauge (analog dial like the 737's) — right side
    const fx = 440, fy = 110, fr = 48;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(fx, fy, fr, Math.PI * 0.6, Math.PI * 1.9); g.stroke();
    g.font = FONT_S; g.fillStyle = '#fff'; g.textAlign = 'center';
    AC.flapDetents.forEach((d, i) => { const a = Math.PI * 0.6 + (Math.PI * 1.3) * (d / 40); g.beginPath(); g.moveTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); g.lineTo(fx + Math.cos(a) * (fr - 8), fy + Math.sin(a) * (fr - 8)); g.stroke(); g.fillText(d, fx + Math.cos(a) * (fr + 14), fy + Math.sin(a) * (fr + 14) + 4); void i; });
    const fa = Math.PI * 0.6 + (Math.PI * 1.3) * (st.flapDeg / 40);
    g.strokeStyle = GREEN; g.lineWidth = 4; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(fa) * (fr - 6), fy + Math.sin(fa) * (fr - 6)); g.stroke();
    g.fillStyle = CYAN; g.font = FONT_S; g.fillText('FLAPS', fx, fy + fr + 30);
    const moving = Math.abs(st.flapDeg - AC.flapDetents[st.flapIndex]) > 0.2;
    g.fillStyle = moving ? AMBER : GREEN; g.font = FONT; g.fillText(moving ? `→ ${AC.flapDetents[st.flapIndex]}` : `${st.flapDeg.toFixed(0)}`, fx, fy + fr + 52);
    // gear indication lights
    const gy = 250;
    g.font = FONT_S; g.fillStyle = CYAN; g.fillText('GEAR', fx, gy - 30);
    const gearLight = (x, y, lbl) => {
      let col = '#222', txt = '';
      if (st.gearDown) { col = GREEN; txt = lbl; } else if (st.gearInTransit) { col = RED; txt = lbl; }
      if (st.collapsedGear && st.collapsedGear.includes(lbl.toLowerCase())) { col = RED; txt = 'FAIL'; }
      g.fillStyle = col; g.beginPath(); g.roundRect(x - 22, y - 12, 44, 24, 4); g.fill();
      g.fillStyle = col === '#222' ? '#444' : '#000'; g.font = FONT_S; g.textAlign = 'center'; g.fillText(txt || lbl, x, y + 1);
    };
    gearLight(fx, gy, 'NOSE'); gearLight(fx - 30, gy + 34, 'LEFT'); gearLight(fx + 30, gy + 34, 'RIGHT');
    if (!st.gearDown && !st.gearInTransit) { g.fillStyle = '#666'; g.font = FONT_S; g.fillText('UP', fx, gy + 66); }
    // speedbrake
    let sbTxt = '', sbCol = GREEN;
    if (st.speedbrake > 0.9 && st.onGround) sbTxt = 'SPEED BRAKE EXTENDED';
    else if (st.speedbrake > 0.05) sbTxt = 'SPEEDBRAKE ' + (st.onGround ? 'EXT' : 'FLT DET');
    else if (st.speedbrakeArmed) { sbTxt = 'SPEED BRAKE ARMED'; sbCol = GREEN; }
    if (sbTxt) { g.fillStyle = sbCol; g.font = FONT_S; g.textAlign = 'center'; g.fillText(sbTxt, fx, gy + 100); }
    // autobrake
    const ab = ['OFF', '1', '2', '3', 'MAX'][st.autobrake];
    g.fillStyle = st.autobrake ? GREEN : '#888'; g.fillText(`AUTOBRAKE ${ab}`, fx, gy + 124);
    if (st.brake > 0.05) { g.fillStyle = AMBER; g.fillText(`BRAKES ${Math.round(st.brake * 100)}%`, fx, gy + 148); }
    // trim
    g.fillStyle = '#fff'; g.font = FONT_S; g.fillText(`STAB TRIM ${st.trim >= 0 ? 'NU' : 'ND'} ${Math.abs(st.trim).toFixed(1)}`, fx, gy + 176);
    if (extra.gaMode) { g.fillStyle = GREEN; g.font = FONT; g.fillText('TOGA', 220, 30); }
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class LowerDU {
  constructor() { Object.assign(this, mkCanvas()); }
  draw(st, extra = {}) {
    const g = this.ctx;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.font = FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
    const row = (y, label, val, col = '#fff') => { g.fillStyle = CYAN; g.font = FONT_S; g.fillText(label, 20, y); g.fillStyle = col; g.font = FONT; g.textAlign = 'right'; g.fillText(val, 300, y); g.textAlign = 'left'; };
    g.fillStyle = '#fff'; g.font = FONT; g.fillText('LANDING CONFIG', 20, 24);
    row(60, 'GEAR', st.gearDown ? 'DOWN' : (st.gearInTransit ? 'TRANSIT' : 'UP'), st.gearDown ? GREEN : (st.agl / FT < 1500 ? RED : AMBER));
    row(90, 'FLAPS', `${st.flapDeg.toFixed(0)}`, st.flapIndex >= 4 ? GREEN : AMBER);
    row(120, 'SPEEDBRAKE', st.speedbrake > 0.05 ? `${Math.round(st.speedbrake * 100)}%` : (st.speedbrakeArmed ? 'ARMED' : 'DOWN'), st.speedbrakeArmed || st.speedbrake > 0.05 ? GREEN : '#fff');
    row(150, 'AUTOBRAKE', ['OFF', '1', '2', '3', 'MAX'][st.autobrake], st.autobrake ? GREEN : '#fff');
    row(180, 'REVERSERS', st.reverser > 0.9 ? 'DEPLOYED' : (st.reverser > 0.05 ? 'IN TRANSIT' : 'STOWED'), st.reverser > 0.05 ? AMBER : '#fff');
    row(210, 'BRAKE TEMP', `${Math.round(Math.min(9.9, st.brakeTemp))}`, st.brakeTemp > 5 ? AMBER : '#fff');
    row(240, 'VREF', `${st.vref} KT`, GREEN);
    row(270, 'HEAD/CROSSWIND', `${Math.round(st.headwind)} / ${Math.round(st.crosswind)} KT`, Math.abs(st.crosswind) > 20 ? AMBER : '#fff');
    const ils = st.ils || { locValid: false, gsValid: false };
    row(300, 'ILS DEV', `${ils.locValid ? `${ils.locDev > 0 ? 'R' : 'L'} ${Math.abs(ils.locDev).toFixed(2)}°` : 'LOC ---'}  ${ils.gsValid ? `${ils.gsDev > 0 ? 'HI' : 'LO'} ${Math.abs(ils.gsDev).toFixed(2)}°` : 'G/S ---'}`);
    row(330, `DME ${ILS27.ident}`, ils.locValid ? `${ils.dmeNm.toFixed(1)} NM` : '---');
    row(360, 'PAPI', extra.papi !== undefined ? '●'.repeat(extra.papi) + '○'.repeat(4 - extra.papi) : '----', extra.papi === 2 ? GREEN : AMBER);
    row(390, 'G LOAD', `${st.gLoad.toFixed(2)}`, Math.abs(st.gLoad - 1) > 0.5 ? AMBER : '#fff');
    if (extra.checklist) {
      g.fillStyle = '#fff'; g.font = FONT; g.fillText('CHECKLIST', 20, 430);
      extra.checklist.forEach((c, i) => { g.fillStyle = c.done ? GREEN : AMBER; g.font = FONT_S; g.fillText(`${c.done ? '✓' : '□'} ${c.text}`, 20, 455 + i * 18); });
    }
    this.tex.needsUpdate = true;
  }
}

/** Static MCP (mode control panel) texture for the glareshield. */
export function makeMCPTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // the windows are redrawn by the cockpit when the selected values change (texture.userData.draw)
  const draw = (v) => {
    g.fillStyle = '#3b3d42'; g.fillRect(0, 0, 1024, 96);
    // label above each window; below it the window's selector knob (geometry, js/cockpit/finish.js)
    const win = (x, label, val) => { g.fillStyle = '#111'; g.fillRect(x, 18, 90, 34); g.fillStyle = '#ffa33a'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText(val || '', x + 45, 43); g.fillStyle = '#ddd'; g.font = '11px sans-serif'; g.fillText(label, x + 45, 13); };
    win(80, 'IAS/MACH', v.ias); win(260, 'HEADING', v.hdg); win(440, 'ALTITUDE', v.alt); win(620, 'VERT SPEED', v.vs);
    for (const [x, l] of [[190, 'N1'], [230, 'SPD'], [380, 'LNAV'], [560, 'VNAV'], [780, 'APP'], [830, 'CMD A'], [880, 'CMD B'], [940, 'A/T']]) { g.fillStyle = '#2a2c30'; g.fillRect(x, 26, 34, 22); g.fillStyle = '#bbb'; g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText(l, x + 17, 40); }
    t.needsUpdate = true;
  };
  draw({ ias: '147', hdg: '270', alt: '3000', vs: '' });
  t.userData.draw = draw;
  return t;
}

/** Panel background with labels for the main instrument panel. */
export function makePanelTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#606a70'; g.fillRect(0, 0, 1024, 512);
  // Soft cavity shading around each display; the bezels and fasteners are actual geometry.
  for (const x of [200, 307, 512, 717, 824]) {
    const grad = g.createRadialGradient(x, 122, 36, x, 122, 80);
    grad.addColorStop(0, 'rgba(6,10,7,0.65)'); grad.addColorStop(1, 'rgba(6,10,7,0)');
    g.fillStyle = grad; g.fillRect(x - 80, 42, 160, 160);
  }
  g.fillStyle = '#cfd3d8'; g.font = '11px sans-serif'; g.textAlign = 'center';
  const lbl = (x, y, t) => g.fillText(t, x, y);
  lbl(180, 60, 'CAPT PFD'); lbl(370, 60, 'CAPT ND'); lbl(512, 60, 'ENG PRIMARY'); lbl(654, 60, 'F/O ND'); lbl(844, 60, 'F/O PFD');
  lbl(512, 300, 'SYSTEMS'); lbl(700, 300, 'LANDING GEAR'); lbl(700, 470, 'FLAPS'); lbl(370, 300, 'STANDBY');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

export function makeOverheadTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#34363b'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i++) { g.fillStyle = i % 7 === 0 ? '#5a6a3a' : '#22242a'; g.fillRect(20 + (i % 12) * 40, 20 + Math.floor(i / 12) * 44, 26, 18); g.fillStyle = '#999'; g.font = '7px sans-serif'; g.fillText('SW', 24 + (i % 12) * 40, 52 + Math.floor(i / 12) * 44); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
