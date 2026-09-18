// Procedural canvas textures: runway markings, taxiway, ground fields, clouds.
import * as THREE from 'three';
import { RUNWAY } from '../config.js';
import { makeRng } from '../physics/atmosphere.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeTexture(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = opts.anisotropy || 1;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Runway texture. U runs along the runway from the "09" end (x = -L/2) to the
 * "27" end (x = +L/2); V across the width. Markings follow ICAO Annex 14 for a
 * 45 m wide precision runway: threshold stripes, designators, aiming point,
 * touchdown-zone stripes, centreline and edge lines.
 */
export function makeRunwayTexture(anisotropy) {
  const W = 4096, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const L = RUNWAY.length, RW = RUNWAY.width;
  const sx = W / L;            // px per metre along
  const sy = H / RW;           // px per metre across
  // asphalt base with subtle noise + tyre rubber in the touchdown zones
  g.fillStyle = '#3c3d40';
  g.fillRect(0, 0, W, H);
  const rng = makeRng(42);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // concrete slab joints (transverse lines every 7.5 m)
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (let m = 0; m < L; m += 7.5) { g.beginPath(); g.moveTo(m * sx, 0); g.lineTo(m * sx, H); g.stroke(); }
  // rubber deposits: dark streaks 150..900 m from each threshold, centre 12 m wide-ish
  for (const dir of [1, -1]) {
    for (let i = 0; i < 260; i++) {
      const d = 120 + rng() * 800;
      const m = dir === 1 ? L - d : d;
      const zc = (rng() - 0.5) * 12 + (rng() < 0.5 ? -2.9 : 2.9);
      const len = 8 + rng() * 40;
      g.strokeStyle = `rgba(10,10,12,${0.12 + rng() * 0.25})`;
      g.lineWidth = (0.5 + rng() * 0.7) * sy;
      g.beginPath(); g.moveTo(m * sx, (RW / 2 + zc) * sy); g.lineTo((m - dir * len) * sx, (RW / 2 + zc + (rng() - 0.5) * 0.6) * sy); g.stroke();
    }
  }

  const white = '#e9e9e2';
  g.fillStyle = white;
  const rect = (mFrom, mLen, zFrom, zLen) => { g.fillRect(mFrom * sx, (RW / 2 + zFrom) * sy, mLen * sx, zLen * sy); };
  // edge lines (0.9 m)
  rect(0, L, -RW / 2, 0.9); rect(0, L, RW / 2 - 0.9, 0.9);
  // centreline: 30 m stripes / 20 m gaps, 0.9 m wide, starting 100 m past each threshold region
  for (let m = 90; m < L - 90; m += 50) rect(m, 30, -0.45, 0.9);

  // per-threshold markings; dir=+1 is the 27 end (aircraft lands toward -x), dir=-1 is the 09 end
  const endMarkings = (dir, label) => {
    const at = (d) => (dir === 1 ? L - d : d);             // metre position for a distance d from this threshold
    const along = (d, len) => (dir === 1 ? [at(d + len), len] : [at(d), len]);
    // threshold stripes: 12 stripes 1.8 m wide, 30 m long, from 6 m to 36 m
    const stripeW = 1.8, gap = 1.5;
    const totalStripes = 12;
    const groupW = totalStripes / 2 * stripeW + (totalStripes / 2 - 1) * gap; // per side
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < totalStripes / 2; i++) {
        const z0 = side === -1 ? -(1.8 + groupW) + i * (stripeW + gap) : 1.8 + i * (stripeW + gap);
        const [m, len] = along(6, 30); rect(m, len, z0, stripeW);
      }
    }
    // designator numerals 18 m tall, centred 48..66 m from the threshold; rotated so it reads for the landing pilot
    const [mNum] = along(48, 18);
    g.save();
    g.translate((mNum + 9) * sx, (RW / 2) * sy);
    // pilot looks along -dir*x; text "up" must point away from the pilot
    g.rotate(dir === 1 ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = white;
    g.font = `bold ${Math.round(18 * sy * 1.05)}px Arial`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // stretch the glyphs: the along-runway axis has fewer px/m than across
    g.scale(1, sx / sy);
    g.fillText(label, 0, 0);
    g.restore();
    g.fillStyle = white;
    // aiming point: two 45 m x 6 m bars at 300 m, inner edges 9 m from the centreline
    { const [m, len] = along(300, 45); rect(m, len, -15, 6); rect(m, len, 9, 6); }
    // touchdown-zone stripes: 1.8 m x 22.5 m, pairs at 150 m intervals: 3,2,2,1,1 (skip 300 m = aiming point)
    const tdz = [[150, 3], [450, 2], [600, 2], [750, 1], [900, 1]];
    for (const [d, n] of tdz) {
      const [m, len] = along(d, 22.5);
      for (let i = 0; i < n; i++) {
        const off = 9 + i * (1.8 + 1.5);
        rect(m, len, -off - 1.8, 1.8); rect(m, len, off, 1.8);
      }
    }
  };
  endMarkings(1, RUNWAY.ident);
  endMarkings(-1, RUNWAY.reciprocal);
  return makeTexture(c, { anisotropy });
}

export function makeTaxiwayTexture(anisotropy, lengthM, widthM, centreline = true) {
  const W = Math.min(2048, Math.round(lengthM * 2)), H = 64;
  const c = canvas(W, H); const g = c.getContext('2d');
  g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, W, H);
  const rng = makeRng(9);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.15})`; g.fillRect(rng() * W, rng() * H, 2 + rng() * 6, 2 + rng() * 6); }
  if (centreline) { g.fillStyle = '#e0c020'; g.fillRect(0, H / 2 - 1.5, W, 3); }
  return makeTexture(c, { anisotropy });
}

/** Patchwork of fields, hedgerows and roads for the ground. Tiled every 2 km. */
export function makeGroundTexture(anisotropy, night = false) {
  const S = 1024;
  const c = canvas(S, S); const g = c.getContext('2d');
  const rng = makeRng(3);
  const palette = night
    ? ['#0d1a12', '#101d14', '#141f13', '#0c1810', '#171f14', '#121a10']
    : ['#5d8a3c', '#6d9a44', '#7fa050', '#8f9a4a', '#a8a35a', '#6b7d3a', '#8c7b45', '#5f7f38', '#a3b262'];
  // base
  g.fillStyle = palette[0]; g.fillRect(0, 0, S, S);
  // irregular fields: random rectangles rotated a little
  for (let i = 0; i < 160; i++) {
    const w = 60 + rng() * 220, h = 60 + rng() * 220;
    const x = rng() * S, y = rng() * S;
    g.save(); g.translate(x, y); g.rotate((rng() - 0.5) * 0.5);
    g.fillStyle = palette[Math.floor(rng() * palette.length)];
    g.globalAlpha = 0.85;
    g.fillRect(-w / 2, -h / 2, w, h);
    // furrows
    if (rng() < 0.4) {
      g.globalAlpha = 0.18; g.strokeStyle = '#000'; g.lineWidth = 1;
      for (let f = -w / 2; f < w / 2; f += 6) { g.beginPath(); g.moveTo(f, -h / 2); g.lineTo(f, h / 2); g.stroke(); }
    }
    g.restore();
  }
  g.globalAlpha = 1;
  // hedgerows / tree lines
  g.strokeStyle = night ? '#08120a' : '#3d5a2a'; g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    g.beginPath(); const x = rng() * S, y = rng() * S; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 300, y + (rng() - 0.5) * 300); g.stroke();
  }
  // roads
  g.strokeStyle = night ? '#1b1b1b' : '#7b7a74'; g.lineWidth = 4;
  for (let i = 0; i < 6; i++) { g.beginPath(); const x = rng() * S; g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 200, S); g.stroke(); }
  for (let i = 0; i < 5; i++) { g.beginPath(); const y = rng() * S; g.moveTo(0, y); g.lineTo(S, y + (rng() - 0.5) * 200); g.stroke(); }
  // small villages
  for (let v = 0; v < 5; v++) {
    const vx = rng() * S, vy = rng() * S;
    for (let i = 0; i < 40; i++) { g.fillStyle = night ? '#3a2f1a' : (rng() < 0.5 ? '#9a6b4a' : '#b0b0b0'); g.fillRect(vx + (rng() - 0.5) * 80, vy + (rng() - 0.5) * 80, 3 + rng() * 4, 3 + rng() * 4); }
  }
  // fine noise
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rng() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return makeTexture(c, { repeat: true, anisotropy });
}

/** Low-frequency brightness variation to hide the ground tiling (20 km period). */
export function makeMacroTexture() {
  const S = 256;
  const c = canvas(S, S); const g = c.getContext('2d');
  const rng = makeRng(77);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    const r = 10 + rng() * 60;
    const grad = g.createRadialGradient(rng() * S, rng() * S, 0, 0, 0, r);
    const x = rng() * S, y = rng() * S;
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 100 + Math.floor(rng() * 60);
    gg.addColorStop(0, `rgba(${v},${v},${v},0.5)`); gg.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2);
    void grad;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Soft cumulus puff sprite. */
export function makeCloudTexture() {
  const S = 256;
  const c = canvas(S, S); const g = c.getContext('2d');
  const rng = makeRng(5);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = S * 0.5 + (rng() - 0.5) * S * 0.55, y = S * 0.55 + (rng() - 0.5) * S * 0.35, r = S * (0.12 + rng() * 0.16);
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.55)'); gg.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

/** Overcast layer seen from below: noisy grey alpha. */
export function makeOvercastTexture() {
  const S = 512;
  const c = canvas(S, S); const g = c.getContext('2d');
  const rng = makeRng(8);
  g.fillStyle = 'rgba(120,124,130,1)'; g.fillRect(0, 0, S, S);
  // seamless: every blob is also drawn at the wrapped offsets
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 50;
    const v = 70 + Math.floor(rng() * 90);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > S || cy + r < 0 || cy - r > S) continue;
      const gg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gg.addColorStop(0, `rgba(${v},${v + 3},${v + 8},0.8)`); gg.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
}

/** Simple building facade with lit windows. */
export function makeBuildingTexture(night) {
  const c = canvas(128, 128); const g = c.getContext('2d');
  const rng = makeRng(11);
  g.fillStyle = night ? '#1a1c22' : '#9aa0a8'; g.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 122; x += 12) {
    const lit = night ? rng() < 0.5 : rng() < 0.15;
    g.fillStyle = lit ? (night ? '#ffe9a8' : '#dfe8f0') : (night ? '#0d0f14' : '#5a6470');
    g.fillRect(x, y, 7, 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
}

export function makeTreeTexture() {
  const c = canvas(64, 64); const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#2e5a25'; g.beginPath(); g.moveTo(32, 2); g.lineTo(58, 50); g.lineTo(6, 50); g.closePath(); g.fill();
  g.fillStyle = '#3f6e2c'; g.beginPath(); g.moveTo(32, 12); g.lineTo(52, 44); g.lineTo(12, 44); g.closePath(); g.fill();
  g.fillStyle = '#5a3a1a'; g.fillRect(29, 48, 6, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
