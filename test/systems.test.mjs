// The aircraft's systems for a cold and dark departure (js/systems.js), in Node.
//   node test/systems.test.mjs
import { Simulation } from '../js/sim.js';
import { Systems, SYS, PANEL } from '../js/systems.js';
import { KTS } from '../js/config.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };
const rig = () => {
  const sim = new Simulation({ scenarioId: 'clear', startId: 'gate' }), ac = sim.aircraft, sys = new Systems(ac);
  ac.systems = sys;
  const run = (s) => { for (let t = 0; t < s; t += sim.fixedDt) { sys.step(sim.fixedDt); sim.stepOnce(); } };
  return { sim, ac, sys, run, types: () => sys.events.map((e) => e.type) };
};
const lit = (sys, id) => (sys.light(id) || {}).text || '';

console.log('\n[S1] Cold and dark, and powering up');
{
  const { sys, ac, run } = rig();
  check('every switch of the panel is known, and a cold aircraft has no power, no pressure and no lights', PANEL.flatMap((g) => g.switches).length === 31 && !sys.dc && !sys.acPower && sys.duct === 0 && !sys.limits.displays && !sys.limits.standby && sys.light('fuelPump1') === null);
  sys.set('groundPower'); run(1);
  check('ground power does nothing without the battery', !sys.acPower);
  sys.set('battery'); run(1);
  check('battery ON: the DC buses, the standby instruments, and ground power comes on the AC buses', sys.dc && sys.limits.standby && sys.acPower && sys.acSource === 'GROUND POWER' && sys.limits.displays && lit(sys, 'groundPower') === 'GRD POWER AVAILABLE');
  check('the lights tell what is off: fuel pumps and hydraulics at low pressure', lit(sys, 'fuelPump1') === 'LOW PRESSURE' && lit(sys, 'hydElec1') === 'LOW PRESSURE' && lit(sys, 'hydEng1') === 'LOW PRESSURE');
  sys.set('hydElec1'); sys.set('hydElec2'); run(8);
  check('the electric pumps pressurise both systems in a few seconds', sys.hydA && sys.hydB && sys.gauges().hydA > 2800 && lit(sys, 'hydElec1') === '');
  sys.set('groundPower', 'OFF'); run(8);
  check('without AC power they stop, and the pressure falls', !sys.acPower && !sys.hydA && !sys.hydB && sys.gauges().source === 'BATTERY ONLY');
  ac.input.flapIndex = 2; run(6);
  check('no hydraulic pressure: the flaps do not move', ac.flapDeg === 0);
  sys.set('groundPower', 'ON'); run(8);
  check('with system B they do', ac.flapDeg > 3, `${ac.flapDeg.toFixed(1)}°`);
  sys.set('irs'); run(30); const half = lit(sys, 'irs'); run(SYS.irsAlignS - 29);
  check('the IRS aligns in 90 s', /ALIGN \d+ s/.test(half) && sys.irsAligned && lit(sys, 'irs') === 'ALIGNED', half);
}

console.log('\n[S2] The APU');
{
  const { sys, run, types } = rig();
  sys.set('apu'); run(2);
  check('no battery, no APU start', sys.apu.state === 'off');
  sys.set('battery'); sys.set('apu', 'OFF'); sys.set('apu'); run(20);
  const mid = { state: sys.apu.state, rpm: sys.apu.rpm, egt: sys.apu.egt, light: lit(sys, 'apu'), pos: sys.position('apu') };
  run(SYS.apuStartS - 19);
  check('START: 45 s to on speed, the switch back at ON, the EGT peaking on the way', mid.state === 'starting' && mid.pos === 'ON' && mid.rpm > 30 && mid.rpm < 60 && mid.egt > 500 && /STARTING/.test(mid.light) && sys.apu.state === 'running' && types().includes('apuRunning'), `${mid.rpm.toFixed(0)} % and ${mid.egt.toFixed(0)}° at 20 s`);
  check('running but off the bus until its generator is switched on', !sys.acPower && lit(sys, 'apuGen') === 'APU GEN OFF BUS');
  sys.set('apuGen'); run(1);
  check('APU GEN on: the AC buses from the APU', sys.acSource === 'APU');
  sys.set('apuBleed'); run(1); const duct = sys.duct; sys.set('pack1'); run(1);
  check('its bleed gives 40 psi in the duct, 28 with a pack running', duct === 40 && sys.duct === 28, `${duct} / ${sys.duct} psi`);
  sys.set('apu'); run(1);
  check('OFF: the generator and the bleed go with it', sys.apu.state === 'off' && !sys.acPower && sys.duct === 0);
}

// a crew's flow up to the engine start
const ready = (R) => {
  const { sys, run } = R;
  for (const id of ['battery', 'groundPower', 'irs', 'position', 'apu']) sys.set(id);
  run(SYS.apuStartS + 1);
  for (const id of ['apuGen', 'fuelPump1', 'fuelPump2', 'hydElec1', 'hydElec2', 'apuBleed', 'beacon']) sys.set(id);
  run(5);
};

console.log('\n[S3] Engine start');
{
  const R = rig(), { sys, ac, run, types } = R; ready(R);
  check('ready for the tug: the APU on the bus and the beacon on (and not before)', sys.pushbackProblems().length === 0 && new Systems(ac).pushbackProblems().length === 3);
  sys.disconnectGroundPower(); run(1);
  check('the ground power unplugged: the APU carries the buses', sys.acSource === 'APU' && !sys.groundPowerAvailable && lit(sys, 'groundPower') === '');
  sys.set('start2'); run(20);
  const motor = { n2: sys.eng[1].n2, n1: ac.engines[1].n1, running: ac.engines[1].running };
  check('start switch 2 to GRD: the starter motors the engine to about 30 % N2, the fan turning, no fuel yet', motor.n2 > 26 && motor.n2 < 31 && motor.n1 > 0.03 && motor.n1 < 0.08 && !motor.running && lit(sys, 'start2') === 'START VALVE OPEN', `N2 ${motor.n2.toFixed(0)} %, N1 ${(motor.n1 * 100).toFixed(1)} %`);
  sys.set('lever2'); run(1); const lightoff = sys.eng[1].phase; let cut = null, t = 0;
  for (; t < 60 && sys.eng[1].phase !== 'running'; t += 0.5) { run(0.5); if (cut === null && sys.position('start2') === 'OFF') cut = sys.eng[1].n2; }
  run(15);
  check('start lever 2 to IDLE: light-off, the starter cuts out at 56 % N2, and the engine settles at idle', lightoff === 'lightoff' && cut >= 56 && cut < 61 && sys.eng[1].phase === 'running' && ac.engines[1].running && !ac.engines[1].starting && Math.abs(ac.engines[1].n1 - 0.21) < 0.01 && Math.abs(sys.eng[1].n2 - 61) < 2 && types().includes('starterCutout'),
    `cutout at ${cut && cut.toFixed(0)} % N2, running after ${t.toFixed(0)} s, N1 ${(ac.engines[1].n1 * 100).toFixed(0)} %, EGT ${sys.gauges().engines[1].egt}°`);
  check('its generator is off the bus until switched on; its pump holds system B', lit(sys, 'gen2') === 'GEN OFF BUS' && lit(sys, 'hydEng2') === '');
  // engine 1: the lever too early
  sys.set('start1'); run(3); sys.set('lever1'); run(1);
  const abort = sys.events.find((e) => e.type === 'startAborted');
  check('the start lever to IDLE at low N2 aborts the start: the starter off, an amber light, the reason given', sys.eng[0].phase === 'aborted' && abort && /N2/.test(abort.reason) && lit(sys, 'start1') === 'START ABORTED' && sys.position('start1') === 'OFF' && !ac.engines[0].running, abort && abort.reason);
  sys.set('start1'); sys.set('lever1', 'IDLE'); run(30);
  check('it will not start again until the lever has been at CUTOFF for 20 s', sys.eng[0].phase === 'aborted');
  sys.set('lever1', 'CUTOFF'); sys.set('start1', 'OFF'); run(SYS.abortCoolS + 1);
  sys.set('start1'); run(25); sys.set('lever1'); run(45);
  check('then the same sequence starts engine 1', sys.eng[0].phase === 'running' && ac.engines[0].running);
  // fuel pumps off
  const F = rig(); ready(F); F.sys.set('fuelPump2', 'OFF'); F.sys.set('start2'); F.run(25); F.sys.set('lever2'); F.run(1);
  check('no fuel pressure: no start', F.sys.eng[1].phase === 'aborted' && /fuel/.test(F.sys.events.find((e) => e.type === 'startAborted').reason));
  // packs on: low duct pressure, a slow start
  const P = rig(); ready(P); P.sys.set('pack1'); P.sys.set('start2'); P.run(30);
  check('a pack left on: the starter reaches only about 22 % N2', P.sys.eng[1].n2 > 19 && P.sys.eng[1].n2 < 23, `${P.sys.eng[1].n2.toFixed(0)} %`);
  // no bleed air
  const N = rig(); ready(N); N.sys.set('apuBleed', 'OFF'); N.sys.set('start2'); N.run(20);
  check('no bleed air: the starter does not turn', N.sys.eng[1].n2 < 1);

  // after start
  check('before the after-start flow the take-off is not ready: generators, IRS aligned?, yaw damper, probe heat', sys.takeoffProblems().join() === 'GENERATORS,YAW DAMPER,PROBE HEAT' || sys.takeoffProblems().includes('GENERATORS'), sys.takeoffProblems().join(', '));
  for (const id of ['gen1', 'gen2', 'probeHeat', 'windowHeat', 'yawDamper', 'pack1', 'pack2', 'strobe', 'landingLights', 'fireTest']) sys.set(id);
  sys.set('apuBleed', 'OFF'); sys.set('apu', 'OFF'); run(SYS.irsAlignS);
  check('generators on, APU off: the engines carry the buses and both hydraulic systems; nothing left for the take-off', sys.acSource === 'ENGINE GENERATORS' && sys.hydA && sys.hydB && sys.takeoffProblems().length === 0 && sys.apu.state === 'off');
  const lists = sys.checklists({ pushed: true, flapsSet: true, trimSet: true, rto: true, parkingBrake: false });
  check('every checklist is complete', lists.length === 5 && lists.every((l) => l.items.every((i) => i.done)), lists.map((l) => `${l.title} ${l.items.filter((i) => i.done).length}/${l.items.length}`).join(', '));
  check('a cold aircraft has none of them done', new Systems(ac).checklists().every((l) => l.items.every((i) => !i.done) || l.title === 'ENGINE START (2, then 1)'));
  // shutdown
  sys.set('lever2', 'CUTOFF'); run(20);
  check('a start lever to CUTOFF shuts its engine down', !ac.engines[1].running && ac.engines[1].n1 < 0.05 && sys.eng[1].phase === 'off' && sys.acSource === 'ENGINE GENERATORS' && lit(sys, 'gen2') === 'SOURCE OFF');
  // the idle engine taxis the aircraft only with hydraulics for steering
  check('the limits the flight model reads: steering and gear on system A, flaps on system B', sys.limits.steering === sys.hydA && sys.limits.flaps === sys.hydB);
}

console.log('\n[S3b] The fire warning test and the cabin');
{
  const { sys, ac, run } = rig();
  sys.set('fireTest'); run(1);
  check('the fire warning test needs the battery', sys.position('fireTest') === 'OFF' && !sys.fire.tested);
  sys.set('battery'); sys.set('fireTest'); run(1); const during = lit(sys, 'fireTest'); run(SYS.fireTestS);
  check('TEST: the bell and the lights for 3 s, then the switch springs back and the checklist has it', /BELL/.test(during) && sys.position('fireTest') === 'OFF' && lit(sys, 'fireTest') === 'TESTED' && sys.events.some((e) => e.type === 'fireTest') && sys.checklists()[0].items.find((i) => /Fire/.test(i.text)).done);
  // the cabin in a climb, with and without the packs
  const climb = (packs) => {
    const sim = new Simulation({ scenarioId: 'clear', startId: 'full' }), s2 = new Systems(sim.aircraft, { cold: false });
    if (!packs) { s2.set('pack1', 'OFF'); s2.set('pack2', 'OFF'); }
    const st = sim.aircraft.state; let warned = false;
    for (let t = 0; t < 600; t += 0.5) { st.alt = (7000 + Math.min(8000, t * 25)) * 0.3048; st.onGround = false; s2.step(0.5); if (s2.events.some((e) => e.type === 'cabinAltitude')) warned = true; }
    return { cabin: s2.cabinFt, warned, diff: s2.gauges().cabinDiff, light: lit(s2, 'pack1') };
  };
  const on = climb(true), off = climb(false);
  check('with a pack on bleed air the cabin stays low in a climb to 15,000 ft', on.cabin < 4500 && on.diff > 4 && !on.warned && on.light === 'CABIN PRESSURISED', `cabin ${on.cabin.toFixed(0)} ft, ${on.diff.toFixed(1)} psi`);
  check('with the packs off it follows the aircraft, and CABIN ALTITUDE warns above 10,000 ft', off.cabin > 14000 && off.warned && off.diff < 0.5, `cabin ${off.cabin.toFixed(0)} ft`);
}

console.log('\n[S4] An aircraft found running');
{
  const sim = new Simulation({ scenarioId: 'clear', startId: 'runway' }), sys = new Systems(sim.aircraft, { cold: false });
  for (let t = 0; t < 3; t += sim.fixedDt) { sys.step(sim.fixedDt); sim.stepOnce(); }
  check('set as after the engine start: the engines on the buses, both hydraulic systems, nothing to do for the take-off', sys.acSource === 'ENGINE GENERATORS' && sys.hydA && sys.hydB && sys.takeoffProblems().length === 0 && sim.aircraft.engines.every((e) => e.running));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
