// Renders icons/icon.svg to the PNG sizes the web app manifest and iOS need.
//   node tools/make-icons.mjs
// 'any' icons get rounded corners (shown as-is); the maskable and Apple icons are full-bleed
// squares that Android and iOS crop to their own shape.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const svg = fs.readFileSync(path.join(root, 'icons', 'icon.svg'), 'utf8');
const out = [
  { file: 'icon-192.png', size: 192, radius: 0.22 },
  { file: 'icon-512.png', size: 512, radius: 0.22 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0 },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const o of out) {
  await page.setViewportSize({ width: o.size, height: o.size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${o.size}px;height:${o.size}px;border-radius:${o.radius * o.size}px;overflow:hidden">${svg.replace('<svg ', `<svg width="${o.size}" height="${o.size}" `)}</div></body></html>`);
  await page.screenshot({ path: path.join(root, 'icons', o.file), omitBackground: true });
  console.log('icons/' + o.file);
}
await browser.close();
