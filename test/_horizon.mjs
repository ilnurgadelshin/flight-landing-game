import { chromium } from 'playwright';
import { startServer } from './server.mjs';
const root = '/home/user/flight-landing-game';
const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
await page.goto(url + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sim, null, { timeout: 60000 });
const frames = (n) => page.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n);
await page.evaluate(() => window.__sim.start({ scenarioId: 'clear', startId: 'short', mode: 'game', sound: false, night: false, seed: 11 }));
await frames(3);
await page.evaluate(() => { window.__sim.game.sim.paused = true; });
await frames(2);
const info = await page.evaluate(() => {
  const s = window.__sim.state(); const cam = window.__sim.world.camera; cam.updateMatrixWorld(true);
  const eye = window.__sim.game.eye.clone();
  // a point far ahead, level with the eye (heading 270 = -x)
  const pt = eye.clone(); pt.x -= 50000;
  const ndc = pt.project(cam);
  return { pitch: s.pitch * 57.3, y: (1 - ndc.y) / 2 * 576, x: (ndc.x + 1) / 2 * 1024, fov: cam.fov, aspect: cam.aspect };
});
console.log('projected horizon', JSON.stringify(info));
await page.screenshot({ path: '/tmp/claude-0/-home-user-flight-landing-game/3b3f02f8-63cc-557a-b5f7-892b15b88c28/scratchpad/hz.png' });
await browser.close(); server.close();
