// The browser suite (test/e2e.mjs) split across parallel processes, and the results merged.
//   node test/e2e-parallel.mjs              all groups, 3 processes
//   node test/e2e-parallel.mjs quick        without the four real-time landings
//   node test/e2e-parallel.mjs workers=2    fewer processes (each one uses about one CPU core)
// Each process opens its own browser and web server and starts with E1 (page load). Groups are
// shared out by how long they took in a measured run (GROUP_SECONDS), longest first, each to the
// process with the least work so far. The exit code is non-zero if any check failed.
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
// seconds per group with 3 processes on the reference machine (software rendering, 4 cores), from the
// "Time per group" line that test/e2e.mjs prints; update them when groups change a lot
const GROUP_SECONDS = { menu: 2, keys: 25, school: 49, land: 115, fail: 73, ga: 62, fps: 7, keyboard: 164, mobile: 165, touchland: 180, tilt: 159, tiltland: 214, gamepad: 154, padland: 191, graphics: 130, maps: 150 };
const LANDINGS = ['keyboard', 'touchland', 'tiltland', 'padland'];

const args = process.argv.slice(2);
const quick = args.includes('quick');
const workers = Math.max(1, Number((args.find((a) => a.startsWith('workers=')) || 'workers=3').slice(8)));
const groups = Object.keys(GROUP_SECONDS).filter((g) => !(quick && LANDINGS.includes(g)));

const shards = Array.from({ length: Math.min(workers, groups.length) }, () => ({ groups: [], load: 0 }));
for (const g of [...groups].sort((a, b) => GROUP_SECONDS[b] - GROUP_SECONDS[a])) {
  const s = shards.reduce((a, b) => (b.load < a.load ? b : a));
  s.groups.push(g); s.load += GROUP_SECONDS[g];
}

const t0 = Date.now();
console.log(`Browser suite in ${shards.length} processes${quick ? ' (quick: no real-time landings)' : ''}:`);
shards.forEach((s, i) => console.log(`  [${i + 1}] ${s.groups.join(', ')}  (~${Math.round(s.load / 60)} min)`));

const run = (s, i) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(root, 'test', 'e2e.mjs'), 'only=' + s.groups.join(','), ...(quick ? ['quick'] : [])], { cwd: root });
  let out = '', buf = '';
  const line = (l) => {
    out += l + '\n';
    if (/^\[E\d+\]/.test(l)) console.log(`  [${i + 1}] ${l}  (${Math.round((Date.now() - t0) / 1000)} s)`);
    else if (/✘/.test(l)) console.log(`  [${i + 1}] ${l.trim()}`);
  };
  p.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(line); });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => { if (buf) line(buf); resolve({ code, out }); });
});

const results = await Promise.all(shards.map(run));
let passed = 0, failed = 0; const failures = [], times = [];
results.forEach((r, i) => {
  const m = r.out.match(/^E2E-RESULT (.*)$/m);
  if (!m) { failed++; failures.push(`process ${i + 1} ended without a result (exit ${r.code})`); console.log(`\n--- process ${i + 1} output ---\n${r.out.slice(-3000)}`); return; }
  const res = JSON.parse(m[1]);
  passed += res.passed; failed += res.failed; failures.push(...res.failures);
  times.push(...res.sections.filter((x) => x.id !== 'E1' || i === 0));
});
times.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
console.log('\nTime per group: ' + times.map((x) => `${x.id} ${x.s} s`).join(' · '));
console.log(`\n${passed} passed, ${failed} failed  (${Math.round((Date.now() - t0) / 1000)} s with ${shards.length} processes)`);
if (failed) console.log('Failed: ' + failures.join(' | '));
process.exit(failed ? 1 : 0);
