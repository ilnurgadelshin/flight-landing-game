// Autoland robustness across random gust seeds (crosswind + storm, short final).
//   node test/robustness.mjs
import { Simulation } from '../js/sim.js';
import { Autopilot } from '../js/autopilot.js';
import { evaluateLanding } from '../js/evaluate.js';
import { RUNWAY, DEG } from '../js/config.js';
const f=(n,d=1)=>Number(n).toFixed(d);
for (const sc of ['crosswind','storm']) for (const seed of [1,2,3,4,5,6,7,8,11]) {
  const sim = new Simulation({ scenarioId: sc, startId: 'short', seed });
  const ap = new Autopilot(sim.aircraft, {});
  const ctx = { usedSpeedbrake: true }; let t = 0, maxLat = 0, maxLatGround = 0, maxBank = 0;
  while (t < 400) { ap.update(sim.fixedDt); sim.stepOnce(); t += sim.fixedDt; const st = sim.state;
    if (st.onGround && sim.aircraft.touchdown) { maxLatGround = Math.max(maxLatGround, Math.abs(st.lateralOffset)); if (st.surface==='grass' && Math.abs(st.z) > RUNWAY.width/2) ctx.excursion = true; }
    if (st.agl < 60 && !st.onGround) maxBank = Math.max(maxBank, Math.abs(st.roll)/DEG);
    if (sim.aircraft.damage.destroyed) break; if (sim.aircraft.touchdown && st.onGround && st.groundSpeed < 0.3) break; }
  const r = evaluateLanding(sim.aircraft, ctx); const td = sim.aircraft.touchdown;
  console.log(`${sc} seed ${seed}: ${r.outcome} ${r.score} | td lat=${td?f(td.lateralOffset):'-'} crab=${td?f(td.crabDeg):'-'} bank=${td?f(td.bank/DEG):'-'} sink=${td?f(td.sink/0.00508,0):'-'} | maxLatOnGround=${f(maxLatGround)} maxBank<60ft=${f(maxBank)} | ${r.headline}`);
}
