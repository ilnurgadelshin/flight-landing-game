// Manual screenshot helper: node test/screenshot.mjs <scenario> <start> [seconds to fly with the autopilot first]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'test', 'output'); fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url + '/?lowdetail', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sim, null, { timeout: 60000 });
console.log('ready in', Date.now() - t0, 'ms');
await page.screenshot({ path: path.join(out, 'menu.png') });
const scenario = process.argv[2] || 'clear';
const start = process.argv[3] || 'short';
await page.evaluate(({ scenario, start }) => window.__sim.start({ scenarioId: scenario, startId: start, mode: 'game' }), { scenario, start });
const flySeconds = parseFloat(process.argv[4] || '0');
if (flySeconds > 0) {
  await page.evaluate((sec) => { window.__sim.autopilot(); window.__sim.setTimeScale(6); window.__flyUntil = window.__sim.state().time + sec; }, flySeconds);
  await page.waitForFunction(() => window.__sim.state().time >= window.__flyUntil, null, { timeout: 300000 });
  await page.evaluate(() => { window.__sim.setTimeScale(1); window.__sim.disengage(); });
}
await page.waitForTimeout(800);
const info = await page.evaluate(() => { const s = window.__sim.state(); return { ias: s.ias, alt: s.alt, agl: s.agl, fps: window.__sim.stats.fps, frameMs: window.__sim.stats.frameMs, errors: window.__sim.errors }; });
console.log(info);
await page.screenshot({ path: path.join(out, `shot-${scenario}.png`) });
// look down at the pedestal
await page.keyboard.down('KeyL'); await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, `shot-${scenario}-pedestal.png`) });
await page.keyboard.up('KeyL');
console.log(logs.filter((l) => !l.startsWith('[log]')).slice(0, 30).join('\n'));
await browser.close(); server.close();
