// The head-up view's display (js/hud.js) in Node: its conformal geometry against the exact
// projection of a camera placed like the game's (the pilot's eye, looking 6° below the nose).
//   node test/hud.test.mjs
import * as THREE from 'three';
import { geometry, dirAzEl } from '../js/hud.js';
import { hudFov } from '../js/view.js';
import { RUNWAY, DEG, FT } from '../js/config.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const f1 = (v) => Number(v).toFixed(1);

const W = 1280, H = 720, VIEW_PITCH = -6 * DEG;
/** A camera at `eye` for an aircraft attitude (heading as the physics measures it: 0 = −Z, 90° = +X). */
function cameraFor({ heading = 270 * DEG, pitch = 0, roll = 0, eye = [3000, 150, 0], fov = hudFov(W / H) }) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 60000);
  cam.position.set(...eye);
  cam.rotation.set(pitch + VIEW_PITCH, -heading, -roll, 'YXZ');
  cam.updateMatrixWorld(true);
  return cam;
}
/** An aircraft state flying along `gamma` (flight path angle) and `track`, at `ias` kt. */
function state({ heading = 270 * DEG, pitch = 0, roll = 0, gamma = 0, track = heading, speed = 75, ias = 147, agl = 150, onGround = false, dist = 3 * 1852 } = {}) {
  const v = dirAzEl(track, gamma).multiplyScalar(speed);
  return { heading, pitch, roll, vx: v.x, vy: v.y, vz: v.z, vs: v.y, ias, agl, onGround, distToThreshold: dist };
}
const cy = (cam, el) => H / 2 - (H / 2) / Math.tan(cam.fov * DEG / 2) * Math.tan(el);   // straight ahead, at an elevation from the camera's axis

console.log('\n[H1] Horizon, pitch ladder and the aircraft reference');
{
  const cam = cameraFor({}), g = geometry(cam, state(), { W, H });
  const hz = g.horizon.filter(Boolean), mid = hz[Math.floor(hz.length / 2)];
  check('level flight: the horizon is level, 6° above the middle of the screen (the eye looks 6° below the nose)', Math.abs(hz[0].y - hz[hz.length - 1].y) < 0.01 && Math.abs(mid.y - cy(cam, 6 * DEG)) < 0.5, `y ${f1(mid.y)} px, expected ${f1(cy(cam, 6 * DEG))}`);
  check('the aircraft reference (nose) sits on the horizon at 0° pitch, in the middle across', Math.abs(g.boresight.y - mid.y) < 0.5 && Math.abs(g.boresight.x - W / 2) < 0.5);
  const cam2 = cameraFor({ pitch: 4 * DEG }), g2 = geometry(cam2, state({ pitch: 4 * DEG }), { W, H });
  const h2 = g2.horizon.filter(Boolean)[12];
  check('nose 4° up: the reference stays put on the screen, the horizon drops 4°', Math.abs(g2.boresight.y - mid.y) < 0.5 && Math.abs((h2.y - g2.boresight.y) - (cy(cam2, 0) - cy(cam2, 4 * DEG))) < 0.5, `${f1(h2.y - g2.boresight.y)} px`);
  const r5 = g.ladder.find((r) => r.deg === 5), rm5 = g.ladder.find((r) => r.deg === -5);
  check('ladder: +5° rung solid 5° above the horizon, −5° dashed below', r5 && !r5.dashed && rm5 && rm5.dashed && Math.abs(r5.segs[0][0].y - cy(cam, 11 * DEG)) < 1 && Math.abs(rm5.segs[0][0].y - cy(cam, 1 * DEG)) < 1);
  check('only rungs within 12° of the nose are drawn', g.ladder.every((r) => Math.abs(r.deg) <= 12) && g.ladder.length === 4, g.ladder.map((r) => r.deg).join(' '));
  const labels = g.ticks.filter((t) => t.label).map((t) => t.label.text);
  check('heading marks every 5° on the horizon, labelled every 10° ("27" ahead)', g.ticks.length >= 20 && labels.includes('27') && labels.includes('26') && labels.includes('28'), labels.slice(0, 7).join(' '));
  const t27 = g.ticks.find((t) => t.label && t.label.text === '27');
  check('"27" is straight ahead', Math.abs(t27.a.x - W / 2) < 0.5);
}

console.log('\n[H2] Bank');
{
  const roll = 20 * DEG, cam = cameraFor({ roll }), g = geometry(cam, state({ roll }), { W, H });
  const hz = g.horizon.filter(Boolean), a = hz[8], b = hz[16];
  const tilt = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
  check('banked 20°: the horizon tilts 20° on the screen', Math.abs(Math.abs(tilt) - 20) < 0.3, `${f1(tilt)}°`);
  const r = g.ladder.find((x) => x.deg === 5), s = r.segs.find((q) => Math.abs(q[1].y - q[0].y) < Math.abs(q[1].x - q[0].x));
  const rt = Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x) / DEG;
  check('the ladder rungs stay parallel to the horizon', Math.abs(Math.abs(rt) - Math.abs(tilt)) < 0.5 || Math.abs(Math.abs(rt) - (180 - Math.abs(tilt))) < 0.5, `${f1(rt)}°`);
}

console.log('\n[H3] Flight path marker, the −3° line and the runway');
{
  // on the glidepath towards the aiming point 300 m past the threshold, nose 2.5° up
  const d = 2 * 1852, gpa = RUNWAY.glideslopeDeg * DEG, aimX = RUNWAY.thresholdX - RUNWAY.tdzIdeal;
  const eye = [aimX + d, d * Math.tan(gpa), 0], pitch = 2.5 * DEG;
  const cam = cameraFor({ pitch, eye }), st = state({ pitch, gamma: -gpa, dist: d - RUNWAY.tdzIdeal });
  const g = geometry(cam, st, { W, H });
  const gsY = g.gsRef[Math.floor(g.gsRef.length / 2)].y;          // the line straight ahead
  check('on a 3° path the flight path marker sits on the −3° line', Math.abs(g.fpv.y - gsY) < 0.5, `marker ${f1(g.fpv.y)}, line ${f1(gsY)}`);
  const hz = g.horizon.filter(Boolean)[12];
  check('3° below the horizon, and pitch + 3° below the nose', Math.abs((g.fpv.y - hz.y) - (cy(cam, -gpa - pitch) - cy(cam, -pitch))) < 0.5 && Math.abs((g.fpv.y - g.boresight.y) - (cy(cam, -gpa - pitch) - cy(cam, 0))) < 0.5, `${f1((g.fpv.y - hz.y) / g.pxPerDeg)}° below the horizon, ${f1((g.fpv.y - g.boresight.y) / g.pxPerDeg)}° below the nose`);
  const aim = new THREE.Vector3(aimX, 0, 0).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
  const ax = (aim.x + 1) / 2 * W, ay = (1 - aim.y) / 2 * H;
  check('the marker is on the aiming point it is heading for', Math.hypot(g.fpv.x - ax, g.fpv.y - ay) < 0.5, `${f1(Math.hypot(g.fpv.x - ax, g.fpv.y - ay))} px off`);
  const R = g.runway, inside = (p) => { let s = 0; for (let i = 0; i < 4; i++) { const a = R[i], b = R[(i + 1) % 4]; s += Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)); } return Math.abs(s) === 4; };
  check('the runway outline is drawn around the marker, centred ahead', R && inside(g.fpv) && Math.abs((R[0].x + R[3].x) / 2 - W / 2) < 0.5, R ? R.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ') : 'none');
  const gOn = geometry(cam, Object.assign({}, st, { onGround: true }), { W, H });
  check('no runway outline on the ground', gOn.runway === null);
  // crosswind: crabbed 5° right into the wind, tracking the centreline
  const cam2 = cameraFor({ heading: 275 * DEG, pitch, eye }), g2 = geometry(cam2, state({ heading: 275 * DEG, pitch, gamma: -gpa, track: 270 * DEG }), { W, H });
  const drift = (g2.boresight.x - g2.fpv.x) / g2.pxPerDeg;
  check('crabbed 5° right into a crosswind: the marker is 5° left of the nose, on the track', Math.abs(drift - 5) < 0.2, `${f1(drift)}°`);
  check('no marker when (almost) stopped', geometry(cam, state({ speed: 5 }), { W, H }).fpv === null);
}

console.log('\n[H4] Speed, trend, guidance and flare');
{
  const cam = cameraFor({ pitch: 2 * DEG });
  const at = (o, opts) => geometry(cam, state(Object.assign({ pitch: 2 * DEG, gamma: -3 * DEG }, o)), Object.assign({ W, H }, opts));
  const fast = at({ ias: 157 }, { target: 147 }), slow = at({ ias: 140 }, { target: 147 }), none = at({ ias: 157 }, { target: null });
  check('speed error tape: 10 kt fast rises 24 px from the left wing, 7 kt slow hangs below', Math.abs((fast.speedTape.y0 - fast.speedTape.y1) - 24) < 0.01 && slow.speedTape.y1 > slow.speedTape.y0 && fast.speedTape.x < fast.fpv.x, `${f1(fast.speedTape.y0 - fast.speedTape.y1)} / ${f1(slow.speedTape.y0 - slow.speedTape.y1)} px`);
  check('no tape without a target speed (not in the landing configuration)', none.speedTape === null && none.caret === null);
  const acc = at({}, { target: 147, accel: 1.5 }), steady = at({}, { target: 147, accel: 0 });
  check('acceleration caret: level with the wing at a steady speed, above it when speeding up', Math.abs(steady.caret.y - steady.fpv.y) < 0.01 && Math.abs((acc.fpv.y - acc.caret.y) - 9) < 0.01);
  const cue = at({ roll: 0 }, { fd: { pitch: 4 * DEG, roll: 10 * DEG } });
  check('guidance cue: 2° more pitch wanted puts it 2° above the marker, a right bank wanted puts it right', Math.abs((cue.fpv.y - cue.cue.y) - 2 * cue.pxPerDeg) < 0.01 && cue.cue.x > cue.fpv.x, `${f1((cue.fpv.y - cue.cue.y) / cue.pxPerDeg)}° up, ${f1(cue.cue.x - cue.fpv.x)} px right`);
  check('no cue without the flight director', at({}, {}).cue === null);
  const flare = (agl, vs, onGround = false) => { const s = state({ agl: agl * FT, onGround }); s.vs = vs; return geometry(cam, s, { W, H }).flare; };
  check('FLARE cue from 50 ft down while descending; not higher, not climbing, not on the ground', flare(30, -3) && flare(45, -3) && !flare(80, -3) && !flare(30, 1) && !flare(30, -3, true));
}

console.log('\n[H5] Field of view');
{
  const across = (a) => 2 * Math.atan(Math.tan(hudFov(a) * DEG / 2) * a) / DEG;
  check('about 100° across on a computer screen and on a wide phone, the height clamped to 45–70°', Math.abs(across(16 / 9) - 100) < 0.5 && Math.abs(across(2) - 100) < 0.5 && hudFov(2.9) === 45 && hudFov(4 / 3) === 70, `16:9 ${f1(across(16 / 9))}°, phone 2.9:1 ${f1(across(2.9))}°, 4:3 ${f1(hudFov(4 / 3))}° high`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
