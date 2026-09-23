// The atmosphere model (js/world/sky.js) in Node, no browser: the sky's colours, the haze towards
// and away from the sun, the colour of the sunlight, the sky's light, and the tone-mapping helpers.
//   node test/sky.test.mjs
import * as THREE from 'three';
import { Atmosphere, acesTonemap, sceneColor } from '../js/world/sky.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const f3 = (c) => c.map((x) => x.toFixed(3)).join(', ');
const DEG = Math.PI / 180;
// a direction at elevation el, azimuth az (degrees)
const dir = (el, az) => [Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.sin(az * DEG)];
const sunAt = (el, az = 0) => new THREE.Vector3(...dir(el, az));

console.log('\n[S1] Day sky');
{
  const a = new Atmosphere().set({ sunDir: sunAt(40), turbidity: 2.2, rayleigh: 2.5, scale: 0.1 });
  const zen = a.sky([0, 1, 0]), hz = a.sky(dir(0, 180)), mid = a.sky(dir(30, 180));
  check('the sky overhead is blue', zen[2] > zen[1] && zen[1] > zen[0] && zen[2] > 1.5 * zen[0], f3(zen));
  check('the sky is paler and brighter towards the horizon (haze)', lum(hz) > lum(mid) && lum(mid) > 0.8 * lum(zen) && hz[2] / hz[0] < zen[2] / zen[0], `horizon ${f3(hz)}`);
  const toward = a.sky(dir(3, 0)), away = a.sky(dir(3, 180));
  check('the horizon glows towards the sun (forward scattering in the haze)', lum(toward) > 1.3 * lum(away), `towards ${f3(toward)}, away ${f3(away)}`);
  const light = a.skyLight();
  check('the sky lights the ground with bluish light', light.b > light.r && light.r > 0, `${light.r.toFixed(3)}, ${light.g.toFixed(3)}, ${light.b.toFixed(3)}`);
  const sl = a.sunlight();
  check('high sun: nearly full strength, yellowish white', sl.strength > 0.8 && sl.color.r === 1 && sl.color.g > 0.7 && sl.color.b > 0.3 && sl.color.b < sl.color.g, `${f3([sl.color.r, sl.color.g, sl.color.b])} × ${sl.strength.toFixed(2)}`);
  const shown = acesTonemap(zen);
  check('on screen the sky overhead is a mid blue, not black or white', shown[2] > 0.15 && shown[2] < 0.9 && shown[0] < shown[2] * 0.6, f3(shown));
}

console.log('\n[S2] Low sun, night, overcast');
{
  const a = new Atmosphere().set({ sunDir: sunAt(5), turbidity: 4, rayleigh: 2.5, scale: 0.1 });
  const sl = a.sunlight();
  check('low sun: the light is orange and weaker', sl.color.b < 0.3 && sl.color.g < 0.8 && sl.strength < 0.9, `${f3([sl.color.r, sl.color.g, sl.color.b])} × ${sl.strength.toFixed(2)}`);
  const toward = a.sky(dir(2, 0));
  check('the horizon under a low sun is warm (red over blue)', toward[0] > toward[2], f3(toward));
  const n = new Atmosphere().set({ sunDir: sunAt(-20), sunE: 0, nightZenith: sceneColor(0x03060f), nightHorizon: sceneColor(0x111a2a) });
  const nz = n.sky([0, 1, 0]), nh = n.sky(dir(0, 90));
  check('night: no sunlight, a dark sky a little lighter at the horizon', n.sunlight().strength === 0 && lum(nz) < 0.01 && lum(nh) > lum(nz), `zenith ${f3(nz)}, horizon ${f3(nh)}`);
  const grey = sceneColor(0x6f7378);
  const o = new Atmosphere().set({ sunDir: sunAt(40), overcast: 1, overcastColor: grey });
  const a1 = o.sky([0, 1, 0]), a2 = o.sky(dir(0, 0)), l = o.skyLight();
  check('overcast: the sky is one grey everywhere, and so is its light', Math.abs(a1[0] - a2[0]) < 1e-9 && Math.abs(l.r - grey.r) < 1e-6 && Math.abs(l.b - grey.b) < 1e-6, f3(a1));
}

console.log('\n[S3] Colours specified by how they look on screen');
{
  let worst = 0;
  for (const hex of [0x6f7378, 0xa9afb7, 0x111a2a, 0x03060f, 0xd8b090, 0x5d6168]) {
    const want = new THREE.Color(hex);
    const got = acesTonemap((({ r, g, b }) => [r, g, b])(sceneColor(hex)));
    worst = Math.max(worst, Math.abs(got[0] - want.r), Math.abs(got[1] - want.g), Math.abs(got[2] - want.b));
  }
  check('sceneColor() gives the scene colour that tone-maps back to the display colour', worst < 0.001, `worst error ${worst.toFixed(5)}`);
  const w = acesTonemap([100, 100, 100]);
  check('ACES keeps very bright light below white clipping at 1', w.every((x) => x <= 1 && x > 0.95), f3(w));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
