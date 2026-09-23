// Phone features in Node, no browser.
// Tilt steering maths (js/tilt.js): physical ways of holding and moving a phone in landscape must
// give the right pitch and roll, in both landscape directions, for any comfortable holding angle,
// and also on a browser that reports the screen angle the other way round.
// Vibration (js/haptics.js): the patterns for each event, and silence when switched off.
//   node test/phone.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { gravityDevice, toScreen, tiltAngles, TiltControl, TILT } from '../js/tilt.js';
import { Haptics } from '../js/haptics.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const DEG = Math.PI / 180;
const f1 = (v) => (v / DEG).toFixed(1);

// ---- a physical phone, built from rotations of its own axes in a world frame (x east, y north,
// z up; the player faces north). Device axes: x right, y top, z out of the screen (portrait).
const rot = (axis, a) => { const c = Math.cos(a), s = Math.sin(a), [x, y, z] = axis; return [[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s], [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s], [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]]; };
const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const col = (M, j) => [M[0][j], M[1][j], M[2][j]];
/**
 * Device orientation (columns = device axes in the world) for a phone held in landscape in front of
 * the player: `top` 'left' or 'right' (where the phone's top edge points), `back` = how far the screen
 * is tilted back from vertical, then `pull` = the top edge of the screen towards the player, `bank` =
 * the left side lowered (about the horizontal axis the player looks along) and `wheel` = turned like a
 * steering wheel (about the screen's normal, left side down).
 */
function pose({ top = 'left', back = 35, pull = 0, bank = 0, wheel = 0 }) {
  // upright portrait facing the player: device x = east, y = up, z = south (towards the player)
  let M = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  // turn to landscape about the axis towards the player: top to the left = counter-clockwise
  M = mul(rot([0, -1, 0], top === 'left' ? 90 * DEG : -90 * DEG), M);
  // tilt back (the top of the screen away from the player, towards north) then pull it back
  M = mul(rot([1, 0, 0], -(back - pull) * DEG), M);
  // lower the left (west) side: about the north axis
  M = mul(rot([0, 1, 0], -bank * DEG), M);
  // steering wheel: about the screen normal, left side down (counter-clockwise as the player sees it)
  const n = col(M, 2);
  M = mul(rot(n, wheel * DEG), M);
  return M;
}
/** The deviceorientation beta/gamma (degrees, W3C ranges) a browser reports for a device orientation. */
function eulerFor(M) {
  const gd = apply([[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]], [0, 0, -1]);   // gravity in device axes
  const s = gd[2] <= 0 ? 1 : -1;                         // gamma in [-90, 90): cos(gamma) >= 0
  const beta = Math.atan2(-gd[1], s * Math.hypot(gd[0], gd[2]));
  const cb = Math.cos(beta);
  const gamma = Math.atan2(gd[0] * Math.sign(cb || 1), -gd[2] * Math.sign(cb || 1));
  return { beta: beta / DEG, gamma: gamma / DEG, gd };
}
// the screen angle a browser reports: 90 when the top edge points left (counter-clockwise turn)
const ANGLE = { left: 90, right: 270 };
function readAngles(p, neutralP, angleOverride) {
  const read = (P) => { const e = eulerFor(pose(P)); return toScreen(gravityDevice(e.beta, e.gamma), angleOverride ?? ANGLE[P.top || 'left']); };
  return tiltAngles(read(p), read(neutralP));
}

console.log('\n[T1] The spec\'s Euler angles give the right gravity');
{
  const flat = gravityDevice(0, 0), up = gravityDevice(90, 0);
  check('flat, face up: gravity into the screen', Math.abs(flat[2] + 1) < 1e-9, flat.map((v) => v.toFixed(2)).join(', '));
  check('upright portrait: gravity down the device', Math.abs(up[1] + 1) < 1e-9, up.map((v) => v.toFixed(2)).join(', '));
  let worst = 0;
  for (const top of ['left', 'right']) for (const back of [-10, 0, 20, 35, 60, 80]) for (const wheel of [-30, 0, 15]) {
    const e = eulerFor(pose({ top, back, wheel }));
    const g = gravityDevice(e.beta, e.gamma);
    worst = Math.max(worst, Math.hypot(g[0] - e.gd[0], g[1] - e.gd[1], g[2] - e.gd[2]));
  }
  check('reported angles reproduce gravity in every holding position, including past vertical', worst < 1e-9, `worst error ${worst.toExponential(1)}`);
}

console.log('\n[T2] Physical movements -> pitch and roll, both landscape directions');
for (const top of ['left', 'right']) {
  for (const back of [10, 35, 60]) {
    const N = { top, back };
    const p1 = readAngles({ top, back, pull: 10 }, N), p2 = readAngles({ top, back, pull: -10 }, N);
    const r1 = readAngles({ top, back, bank: 10 }, N), r2 = readAngles({ top, back, bank: -10 }, N);
    const w1 = readAngles({ top, back, wheel: 10 }, N);
    const tag = `top ${top}, screen ${back}° back`;
    check(`${tag}: top towards you = nose up, away = nose down`, Math.abs(p1.pitch / DEG - 10) < 0.5 && Math.abs(p2.pitch / DEG + 10) < 0.5 && Math.abs(p1.roll) < 0.5 * DEG, `${f1(p1.pitch)}° / ${f1(p2.pitch)}°, roll ${f1(p1.roll)}°`);
    check(`${tag}: left side 10° down = 10° bank left, right side down = bank right`, Math.abs(r1.roll / DEG + 10) < 0.5 && Math.abs(r2.roll / DEG - 10) < 0.5 && Math.abs(r1.pitch) < 2 * DEG, `${f1(r1.roll)}° / ${f1(r2.roll)}°, pitch ${f1(r1.pitch)}°`);
    check(`${tag}: turned like a steering wheel, the side that drops banks that way`, w1.roll < -(10 * Math.cos(back * DEG) - 0.5) * DEG && Math.abs(w1.pitch) < 1 * DEG, `${f1(w1.roll)}°, pitch ${f1(w1.pitch)}°`);
  }
}
{
  const turn = readAngles({ top: 'left', back: 35 }, { top: 'left', back: 35 });
  check('holding still reads zero', Math.abs(turn.pitch) < 1e-9 && Math.abs(turn.roll) < 1e-9);
}

console.log('\n[T3] Calibration: a browser that reports the screen angle the other way round');
function controlFor(angleFor) {
  // a TiltControl fed synthetic readings, with the screen angle the browser would report
  const input = { tilt: { active: false, pitch: 0, roll: 0 } };
  const t = new TiltControl(input);
  t.enabled = true;
  // readings every 16 ms on a simulated clock (the control reads event times and performance.now())
  let clock = 1000;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });
  const feed = (P, n = 8) => { for (let i = 0; i < n; i++) { clock += 16; const e = eulerFor(pose(P)); globalThis.screen = { orientation: { angle: angleFor(P.top) } }; t.sample({ beta: e.beta, gamma: e.gamma, timeStamp: clock }); } };
  return { t, input, feed };
}
for (const [name, angleFor] of [['right-way-round angle', (top) => ANGLE[top]], ['reversed angle', (top) => (top === 'left' ? 270 : 90)]]) {
  for (const top of ['left', 'right']) {
    const { t, input, feed } = controlFor(angleFor);
    feed({ top, back: 35 });
    t.center();
    feed({ top, back: 35, pull: 10 }, 40);
    const pitch = input.tilt.pitch;
    feed({ top, back: 35, bank: 10 }, 40);
    const roll = input.tilt.roll;
    check(`${name}, top ${top}: pull = nose up, left side down = bank left`, pitch > 0.4 && roll < -0.3, `pitch ${pitch.toFixed(2)}, roll ${roll.toFixed(2)}${t.flip ? ', angle flipped at calibration' : ''}`);
  }
}

console.log('\n[T4] Deflection scaling');
{
  const { t, input, feed } = controlFor((top) => ANGLE[top]);
  feed({ top: 'left', back: 35 }); t.center();
  feed({ top: 'left', back: 35, pull: TILT.pitchRange / DEG }, 60);
  check(`${(TILT.pitchRange / DEG).toFixed(0)}° of pull = full nose up`, input.tilt.pitch > 0.97, input.tilt.pitch.toFixed(3));
  feed({ top: 'left', back: 35, pull: 60 }, 60);
  check('more than the range is clamped to full', input.tilt.pitch === 1, String(input.tilt.pitch));
  feed({ top: 'left', back: 35 }, 60);
  check('back to the held position = centred', Math.abs(input.tilt.pitch) < 0.02 && Math.abs(input.tilt.roll) < 0.02, `${input.tilt.pitch.toFixed(3)}, ${input.tilt.roll.toFixed(3)}`);
  t.disable();
  check('switching tilt off lets go', !input.tilt.active && input.tilt.pitch === 0);
}

console.log('\n[T5] The browser tests\' simulated sensor agrees with the phone model');
{
  const ctx = { window: {}, Math };
  vm.runInNewContext(fs.readFileSync(new URL('./tilt-pose.browser.js', import.meta.url), 'utf8'), ctx);
  let worst = 0;
  for (const top of ['left', 'right']) for (const back of [10, 35, 60]) for (const [pull, bank] of [[0, 0], [12, 0], [-8, 0], [0, 10], [0, -15], [6, 6]]) {
    const model = eulerFor(pose({ top, back, pull, bank }));
    const sim = ctx.window.tiltReading({ back, pull, bank, angle: ANGLE[top] });
    const gm = gravityDevice(model.beta, model.gamma), gsim = gravityDevice(sim.beta, sim.gamma);
    worst = Math.max(worst, Math.hypot(gm[0] - gsim[0], gm[1] - gsim[1], gm[2] - gsim[2]));
  }
  check('tiltReading() gives the readings of the rotation-matrix phone for every pose', worst < 1e-9, `worst gravity difference ${worst.toExponential(1)}`);
}

console.log('\n[T6] Vibration patterns');
{
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => { calls.push(p); return true; } }, configurable: true, writable: true });
  const h = new Haptics();
  check('supported and on where navigator.vibrate exists', h.supported && h.enabled);
  h.tick(); h.gate();
  check('button tick and reverse gate are short pulses', calls[0] === 8 && calls[1] === 20, JSON.stringify(calls));
  calls.length = 0;
  h.touchdown(0.8, false); h.touchdown(3.5, true); h.crash();
  check('touchdown grows with the sink rate; a hard landing and a crash are patterns', typeof calls[0] === 'number' && calls[0] >= 18 && calls[0] <= 60 && Array.isArray(calls[1]) && Array.isArray(calls[2]) && calls[2][0] > calls[1][0], JSON.stringify(calls));
  calls.length = 0;
  const st = { gearDown: false, onGround: false, stallWarning: false };
  h.update(0.1, st); st.gearDown = true; h.update(0.1, st); h.update(0.1, st);
  check('gear locking down gives one thump', calls.length === 1 && calls[0] === 25, JSON.stringify(calls));
  calls.length = 0;
  st.stallWarning = true;
  for (let i = 0; i < 13; i++) h.update(0.1, st);   // 1.3 s of stall warning: bursts at 0, ~0.6 and ~1.2 s
  const bursts = calls.filter((c) => Array.isArray(c)).length;
  st.stallWarning = false; h.update(0.1, st);
  check('stall warning: a stick-shaker burst every 0.5 s, stopped when it ends', bursts === 3 && calls[calls.length - 1] === 0, `${bursts} bursts, last call ${JSON.stringify(calls[calls.length - 1])}`);
  calls.length = 0;
  const rumbles = [];
  h.pad = { rumble: (ms, strong, weak) => rumbles.push([ms, strong, weak]) };
  h.touchdown(1.5, false); h.touchdown(4, true); h.crash();
  check('a controller in use rumbles for the same events, harder for a hard landing and a crash', rumbles.length === 3 && rumbles[1][1] > rumbles[0][1] && rumbles[2][0] > rumbles[1][0], JSON.stringify(rumbles));
  calls.length = 0; rumbles.length = 0;
  h.enabled = false; h.tick(); h.touchdown(1, false);
  check('switched off: no vibration and no rumble', calls.length === 0 && rumbles.length === 0);
  delete globalThis.navigator;
  const none = new Haptics();
  let threw = false;
  try { none.tick(); none.touchdown(2, true); none.update(0.1, { gearDown: true, onGround: false, stallWarning: true }); } catch (e) { threw = true; }
  check('without the Vibration API (iPhone) it is silent and never fails', !none.supported && !threw);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
