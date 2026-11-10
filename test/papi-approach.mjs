// Capture a controlled six-second descent across all four PAPI cutoffs in the
// normal pilot view. Each filmstrip row is a native-resolution windshield crop.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchBrowser, scaledTimeout } from './browser.mjs';
import { startServer } from './server.mjs';
import { completeScenery } from './scene-ready.mjs';

const checkOnly = process.argv.includes('--check');
const label = (process.argv.slice(2).find(arg => arg !== '--check') || 'papi-after').replace(/[^a-z0-9_-]/gi, '-');
await fs.mkdir('test/output', { recursive: true });
const { server, url } = await startServer(process.env.REVIEW_ROOT || process.cwd());
const browser = await launchBrowser();
const results = [];
try {
  for (const tier of ['high', 'low']) {
    const phone = tier === 'low';
    const page = await browser.newPage({
      viewport: phone ? { width: 852, height: 393 } : { width: 1440, height: 900 },
      hasTouch: phone, isMobile: phone,
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url + '/?quality=' + tier + '&drs=0');
    await page.waitForFunction(() => window.__sim, null, { timeout: scaledTimeout(120000) });
    await completeScenery(page);
    for (const night of [false, true]) {
      const result = await page.evaluate(async ({ night, checkOnly }) => {
        const T = await import('/vendor/three.module.js');
        const s = window.__sim, w = s.world, camera = w.camera;
        s.start({ startId: 'short', scenarioId: 'clear', night, mode: 'game', seed: 11, sound: false, skipSchool: true });
        s.setDrawing(false);
        s.game.state = 'menu'; // own the clock for matched captures
        w.setPixelRatio(1);
        w.time = w.lights.time = 0;
        s.view.setMode('cockpit');
        Object.assign(s.view.look, { yaw: 0, pitch: 0, down: false });
        const lamps = w.lights.papi.map(i => w.lights.entries[i]);
        const place = (x, y) => {
          s.game.sim.aircraft.place({ x, y, z: 0, headingDeg: 270, iasKts: 147, flapIndex: 4, gearDown: true, gammaDeg: -3 });
          s.view.update(1 / 15);
        };
        for (let i = 0; i < 20; i++) place(2200, 60);
        const eye = camera.getWorldPosition(new T.Vector3());
        await w.groundDetail.settle(eye);
        w.nearWoodland?.settle(eye);
        const eyeOffset = eye.clone().sub(s.view.aircraft.position);
        const placeOnSlope = (x, degrees) => {
          const range = Math.hypot(x + eyeOffset.x - lamps[0].x, eyeOffset.z - lamps[0].z);
          place(x, lamps[0].y + range * Math.tan(degrees * Math.PI / 180) - eyeOffset.y);
        };
        const crop = document.createElement('canvas');
        const width = crop.width = 96, rowHeight = 24;
        crop.height = rowHeight * 91;
        const ctx = crop.getContext('2d', { willReadFrequently: true });
        const canvas = w.renderer.domElement;
        const sampleRow = frame => {
          w.render();
          const pixels = lamps.map(l => {
            const p = new T.Vector3(l.x, l.y, l.z).project(camera);
            return { x: Math.floor((p.x + 1) * canvas.width / 2), y: Math.floor((1 - p.y) * canvas.height / 2) };
          });
          const left = Math.round((pixels[0].x + pixels[3].x - width) / 2);
          const top = pixels[0].y - rowHeight / 2;
          ctx.drawImage(canvas, left, top, width, rowHeight, 0, frame * rowHeight, width, rowHeight);
          const row = ctx.getImageData(0, frame * rowHeight, width, rowHeight).data;
          return pixels.map(p => {
            const offset = ((p.y - top) * width + p.x - left) * 4;
            return Array.from(row.subarray(offset, offset + 3));
          });
        };
        const frames = [];
        let onSlopePng;
        for (let frame = 0; frame <= 90; frame++) {
          placeOnSlope(2200 - frame * 4.8, 3.68 - 1.36 * frame / 90);
          const whites = w.lights.papiWhites(s.view.eye);
          const colors = (!checkOnly || frame === 45) ? sampleRow(frame) : undefined;
          frames.push({ frame, whites, colors });
          if (frame === 45 && !checkOnly) onSlopePng = canvas.toDataURL().split(',')[1];
        }
        const strip = checkOnly ? null : crop.toDataURL().split(',')[1];
        const distant = [];
        if (night && !checkOnly) {
          for (const distance of [2400, 4000]) {
            placeOnSlope(lamps[0].x + distance, 3);
            const lit = sampleRow(0);
            for (const i of w.lights.papi) w.lights.brightAttr.setX(i, 0);
            w.lights.brightAttr.needsUpdate = true;
            distant.push({ distance, lit, background: sampleRow(0) });
          }
        }
        return { frames, onSlopePng, strip, distant, errors: w.assetErrors };
      }, { night, checkOnly });
      const phase = night ? 'night' : 'day';
      const base = 'test/output/' + label + '-' + tier + '-' + phase;
      assert.deepEqual([0, 23, 45, 68, 90].map(i => result.frames[i].whites), [4, 3, 2, 1, 0]);
      assert.deepEqual(result.errors, []);
      if (!process.env.REVIEW_ROOT) {
        // Check the displayed signal after tone mapping, cockpit glass, bloom
        // and compact filtering. This clear, on-slope pose exposes all four lamps.
        const colors = result.frames[45].colors;
        for (const [r, g] of colors.slice(0, 2)) assert.ok(r > 145 && r - g > 75, 'Red sector lost its colour');
        for (const [r, g, b] of colors.slice(2)) assert.ok(g > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 25, 'White sector lost its signal');
      }
      if (!checkOnly) {
        await fs.writeFile(base + '-2.png', Buffer.from(result.onSlopePng, 'base64'));
        await fs.writeFile(base + '-strip.png', Buffer.from(result.strip, 'base64'));
      }
      results.push({ tier, phase, frames: result.frames, distant: result.distant });
      console.log(tier, phase, 'on-slope pixels nearest runway first', result.frames[45].colors);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  if (!checkOnly) await fs.writeFile('test/output/' + label + '.json', JSON.stringify(results) + '\n');
} finally {
  await browser.close();
  server.close();
}
