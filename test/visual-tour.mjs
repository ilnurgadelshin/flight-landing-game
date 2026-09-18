// Visual QA tour: captures the game at every stage of the approach in each
// scenario / time of day so the frames can be reviewed one by one.
//   node test/visual-tour.mjs [scenario,scenario…] [night]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'test', 'output', 'visual'); fs.mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const scenarios = (args.find((a) => !['night', 'day'].includes(a)) || 'clear,tailwind,crosswind,storm').split(',');
const nights = args.includes('night') ? [true] : (args.includes('day') ? [false] : [false, true]);

const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(url + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sim, null, { timeout: 60000 });
const frames = (n) => page.evaluate((n) => new Promise((res) => { const f0 = window.__sim.stats.frames; const chk = () => (window.__sim.stats.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), n);
const shot = async (name) => { await frames(2); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('  shot', name); };
const flyUntil = async (cond, timeout = 300000) => {
  await page.evaluate(() => window.__sim.setTimeScale(8));
  await page.waitForFunction(cond, null, { timeout });
  await page.evaluate(() => window.__sim.setTimeScale(1));
};

await shot('00-menu');
for (const night of nights) for (const sc of scenarios) {
  const tag = `${sc}${night ? '-night' : ''}`;
  console.log(`--- ${tag}`);
  await page.evaluate(({ sc, night }) => window.__sim.start({ scenarioId: sc, startId: 'standard', mode: 'game', sound: false, night, seed: 11 }), { sc, night });
  await frames(3);
  await shot(`${tag}-01-10nm`);
  await page.evaluate(() => window.__sim.autopilot());
  await flyUntil(() => window.__sim.state().distToThreshold < 4.0 * 1852);
  await shot(`${tag}-02-4nm`);
  // look around: left window, right window, down at the pedestal
  await page.evaluate(() => { window.__sim.inputManager.look.yaw = 1.2; });
  await shot(`${tag}-03-4nm-left`);
  await page.evaluate(() => { window.__sim.inputManager.look.yaw = -1.2; });
  await shot(`${tag}-04-4nm-right`);
  await page.evaluate(() => { window.__sim.inputManager.look.yaw = 0; window.__sim.inputManager.look.down = true; });
  await shot(`${tag}-05-4nm-pedestal`);
  await page.evaluate(() => { window.__sim.inputManager.look.down = false; });
  await flyUntil(() => window.__sim.state().distToThreshold < 1.5 * 1852);
  await shot(`${tag}-06-1_5nm`);
  await flyUntil(() => window.__sim.state().agl < 60);
  await shot(`${tag}-07-200ft`);
  await flyUntil(() => window.__sim.state().agl < 15);
  await shot(`${tag}-08-50ft`);
  await flyUntil(() => window.__sim.state().onGround && window.__sim.state().groundSpeed < 60);
  await shot(`${tag}-09-rollout`);
  await flyUntil(() => window.__sim.game.state === 'finished');
  await page.evaluate(() => { document.getElementById('results').classList.add('hidden'); });
  await shot(`${tag}-10-stopped`);
  await page.evaluate(() => { document.getElementById('results').classList.remove('hidden'); });
  await shot(`${tag}-11-results`);
}
await browser.close(); server.close();
