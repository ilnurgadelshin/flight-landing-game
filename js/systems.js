// The aircraft's systems for a departure from a cold and dark flight deck: electrical power,
// the APU, fuel pumps, hydraulics, bleed air, the engine start, the inertial reference and the
// few other switches a crew sets before taxiing. A simplified 737-800: the switches and their
// dependencies are the real ones in outline; the numbers (times, pressures) are typical values
// recalled from operating practice, not taken from Boeing's manuals. Pure rules: no DOM.
//
// What depends on what:
//   battery            → the DC buses: without it nothing on the panel works
//   ground power / APU generator / engine generators → the AC buses: the displays, the electric
//                        hydraulic pumps, the fuel pumps
//   APU bleed (or a running engine's bleed) → duct pressure, which turns the engine starters
//   hydraulic system A (engine 1 pump, electric pump 2) → nosewheel steering, gear retraction
//   hydraulic system B (engine 2 pump, electric pump 1) → flaps, the normal brakes
//   engine start: start switch to GRD → the starter motors N2 → at 25 % N2 the start lever to
//                        IDLE (fuel and ignition) → light-off → starter cutout at 56 % N2 → idle
import { AIRCRAFT as AC } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SYS = {
  apuStartS: 45,          // from START to on speed
  irsAlignS: 90,          // the alignment, shortened: a real one takes 7 to 10 minutes
  ductApu: 40, ductEngine: 34, ductPackDrop: 12, ductStartMin: 16, ductStartFull: 32,   // psi: a starter needs 32 for a normal start
  motorN2: 30, motorN2Low: 22, motorTau: 7,     // the starter's N2 with good and with low duct pressure
  fuelOnN2: 20,           // the start lever to IDLE below this floods the engine: a hot start, aborted
  cutoutN2: 56, idleN2: 61, runUpTau: 8,
  hydPsi: 3000, hydTau: 2.5,
  abortCoolS: 20,         // after an aborted start: the lever at CUTOFF this long before another try
};

// The panel: groups of switches in the order a crew meets them. positions[0] is where a cold and
// dark aircraft has it.
export const PANEL = [
  { group: 'ELECTRICAL', switches: [
    { id: 'battery', label: 'BATTERY', positions: ['OFF', 'ON'] },
    { id: 'groundPower', label: 'GRD PWR', positions: ['OFF', 'ON'] },
    { id: 'apu', label: 'APU', positions: ['OFF', 'ON', 'START'] },
    { id: 'apuGen', label: 'APU GEN', positions: ['OFF', 'ON'] },
    { id: 'gen1', label: 'GEN 1', positions: ['OFF', 'ON'] },
    { id: 'gen2', label: 'GEN 2', positions: ['OFF', 'ON'] } ] },
  { group: 'FUEL', switches: [
    { id: 'fuelPump1', label: 'PUMPS 1', positions: ['OFF', 'ON'] },
    { id: 'fuelPump2', label: 'PUMPS 2', positions: ['OFF', 'ON'] } ] },
  { group: 'HYDRAULICS', switches: [
    { id: 'hydEng1', label: 'ENG 1 (A)', positions: ['ON', 'OFF'] },
    { id: 'hydElec2', label: 'ELEC 2 (A)', positions: ['OFF', 'ON'] },
    { id: 'hydElec1', label: 'ELEC 1 (B)', positions: ['OFF', 'ON'] },
    { id: 'hydEng2', label: 'ENG 2 (B)', positions: ['ON', 'OFF'] } ] },
  { group: 'AIR', switches: [
    { id: 'apuBleed', label: 'APU BLEED', positions: ['OFF', 'ON'] },
    { id: 'bleed1', label: 'BLEED 1', positions: ['ON', 'OFF'] },
    { id: 'bleed2', label: 'BLEED 2', positions: ['ON', 'OFF'] },
    { id: 'pack1', label: 'PACK L', positions: ['OFF', 'ON'] },
    { id: 'pack2', label: 'PACK R', positions: ['OFF', 'ON'] } ] },
  { group: 'ENGINE START', switches: [
    { id: 'start1', label: 'START 1', positions: ['OFF', 'GRD'] },
    { id: 'lever1', label: 'START LEVER 1', positions: ['CUTOFF', 'IDLE'] },
    { id: 'start2', label: 'START 2', positions: ['OFF', 'GRD'] },
    { id: 'lever2', label: 'START LEVER 2', positions: ['CUTOFF', 'IDLE'] } ] },
  { group: 'NAVIGATION & FLIGHT CONTROLS', switches: [
    { id: 'irs', label: 'IRS', positions: ['OFF', 'NAV'] },
    { id: 'yawDamper', label: 'YAW DAMPER', positions: ['OFF', 'ON'] } ] },
  { group: 'ANTI-ICE & LIGHTS', switches: [
    { id: 'probeHeat', label: 'PROBE HEAT', positions: ['OFF', 'ON'] },
    { id: 'windowHeat', label: 'WINDOW HEAT', positions: ['OFF', 'ON'] },
    { id: 'beacon', label: 'ANTI-COLLISION', positions: ['OFF', 'ON'] },
    { id: 'position', label: 'POSITION', positions: ['OFF', 'ON'] } ] },
];
const DEFS = new Map(PANEL.flatMap((g) => g.switches.map((s) => [s.id, s])));
const isOn = (def, pos) => def.positions[pos] !== 'OFF' && def.positions[pos] !== 'CUTOFF';

export class Systems {
  /** @param aircraft the flight model (its engines are started and stopped from here); cold: as found at the gate */
  constructor(aircraft, { cold = true } = {}) {
    this.ac = aircraft;
    this.sw = {};
    for (const [id] of DEFS) this.sw[id] = 0;
    this.apu = { state: 'off', t: 0, rpm: 0, egt: 0 };
    this.irsT = 0;
    this.groundPowerAvailable = true;      // the stand's power unit, until the pushback
    this.eng = [0, 1].map(() => ({ n2: 0, egt: 0, phase: 'off', coolT: 0 }));
    this.hyd = { a: 0, b: 0 };
    this.events = [];
    this.time = 0;
    if (!cold) this.setRunning();
    this.derive();
  }

  /** As a crew leaves it after the engine start: everything on, the engines running (the other starts). */
  setRunning() {
    for (const id of ['battery', 'gen1', 'gen2', 'fuelPump1', 'fuelPump2', 'hydElec1', 'hydElec2', 'pack1', 'pack2', 'lever1', 'lever2', 'irs', 'yawDamper', 'probeHeat', 'windowHeat', 'beacon', 'position']) this.sw[id] = 1;
    this.irsT = SYS.irsAlignS; this.groundPowerAvailable = false;
    for (const e of this.eng) { e.n2 = SYS.idleN2; e.egt = 430; e.phase = 'running'; }
    this.hyd.a = this.hyd.b = SYS.hydPsi;
  }

  on(id) { return isOn(DEFS.get(id), this.sw[id]); }
  position(id) { return DEFS.get(id).positions[this.sw[id]]; }

  /** Move a switch to a named position (or to the next one). Returns the position it is now in. */
  set(id, to = null) {
    const def = DEFS.get(id); if (!def) return null;
    let pos = to === null ? (this.sw[id] + 1) % def.positions.length : def.positions.indexOf(to);
    if (pos < 0) return this.position(id);
    // the APU switch springs back from START to ON; OFF then ON again does not restart it by itself
    if (id === 'apu' && to === null) pos = this.sw.apu === 0 ? 2 : 0;
    this.sw[id] = pos;
    if (id === 'apu') {
      if (pos === 2) { if (this.dc && this.apu.state === 'off') { this.apu.state = 'starting'; this.apu.t = 0; this.events.push({ type: 'apuStart' }); } this.sw.apu = 1; }
      if (pos === 0 && this.apu.state !== 'off') { this.apu.state = 'off'; this.events.push({ type: 'apuOff' }); }
    }
    this.derive();
    return this.position(id);
  }

  // ---- what is powered and pressurised now
  derive() {
    const s = this.sw, running = (i) => this.eng[i].phase === 'running';
    this.dc = !!s.battery;
    const apuRun = this.apu.state === 'running';
    this.acSource = !this.dc ? '' : (s.gen1 && running(0)) || (s.gen2 && running(1)) ? 'ENGINE GENERATORS' : (s.apuGen && apuRun) ? 'APU' : (s.groundPower && this.groundPowerAvailable) ? 'GROUND POWER' : '';
    this.ac_ = !!this.acSource;
    const packs = (s.pack1 ? 1 : 0) + (s.pack2 ? 1 : 0);
    const fromEngine = (this.on('bleed1') && running(0)) || (this.on('bleed2') && running(1));
    this.duct = !this.dc ? 0 : Math.max(s.apuBleed && apuRun ? SYS.ductApu - (packs ? SYS.ductPackDrop : 0) : 0, fromEngine ? SYS.ductEngine - (packs ? SYS.ductPackDrop / 2 : 0) : 0);
    this.fuelPressure = [!!(s.fuelPump1 && this.ac_), !!(s.fuelPump2 && this.ac_)];
    this.irsAligned = this.irsT >= SYS.irsAlignS;
  }
  /** AC power on the buses. */
  get acPower() { return this.ac_; }
  get hydA() { return this.hyd.a > SYS.hydPsi * 0.6; }
  get hydB() { return this.hyd.b > SYS.hydPsi * 0.6; }
  /** What the flight model may do: flaps and normal brakes on system B, steering and gear retraction on A. */
  get limits() { return { flaps: this.hydB, steering: this.hydA, gear: this.hydA, displays: this.ac_, standby: this.dc }; }

  step(dt) {
    this.time += dt;
    const s = this.sw, A = this.apu;
    if (!this.dc && A.state === 'starting') A.state = 'off';
    if (A.state === 'starting') {
      A.t += dt; A.rpm = clamp(A.t / SYS.apuStartS, 0, 1) * 100;
      A.egt = 150 + 620 * Math.sin(Math.PI * clamp(A.t / SYS.apuStartS, 0, 1)) * (A.t < SYS.apuStartS * 0.6 ? 1 : 0.75);
      if (A.t >= SYS.apuStartS) { A.state = 'running'; this.events.push({ type: 'apuRunning' }); }
    } else if (A.state === 'running') { A.rpm = 100; A.egt += (420 + (s.apuBleed ? 90 : 0) + (s.apuGen ? 40 : 0) - A.egt) * Math.min(1, dt / 4); }
    else { A.rpm = Math.max(0, A.rpm - 12 * dt); A.egt = Math.max(0, A.egt - 25 * dt); }
    this.irsT = s.irs && this.dc ? Math.min(SYS.irsAlignS, this.irsT + dt) : 0;
    this.derive();
    // ---- the engines
    for (let i = 0; i < 2; i++) {
      const e = this.eng[i], ae = this.ac.engines[i], starter = s[`start${i + 1}`] === 1, lever = s[`lever${i + 1}`] === 1, n = i + 1;
      if (e.phase === 'aborted') {
        e.n2 = Math.max(0, e.n2 - 4 * dt); e.egt = Math.max(0, e.egt - 30 * dt);
        e.coolT = lever ? 0 : e.coolT + dt;
        if (e.coolT >= SYS.abortCoolS) { e.phase = 'off'; this.events.push({ type: 'startReset', engine: i }); }
        continue;
      }
      if (e.phase === 'running' || e.phase === 'lightoff') {
        if (!lever || ae.failed) {            // the start lever to CUTOFF (or the engine failed): it runs down
          e.phase = 'off'; ae.running = false; ae.starting = false; ae.manualStart = false;
          if (!ae.failed) this.events.push({ type: 'engineShutdown', engine: i });
          continue;
        }
        const target = SYS.idleN2 + clamp((ae.n1 - AC.engines.idleN1) / (1 - AC.engines.idleN1), 0, 1) * 39;
        e.n2 += (target - e.n2) * Math.min(1, dt / (e.phase === 'lightoff' ? SYS.runUpTau : 1.5));
        e.egt += ((e.phase === 'lightoff' && e.n2 < 50 ? 640 : 410 + (ae.n1 - AC.engines.idleN1) * 520) - e.egt) * Math.min(1, dt / 3);
        if (e.phase === 'lightoff' && e.n2 >= SYS.cutoutN2) { s[`start${n}`] = 0; this.events.push({ type: 'starterCutout', engine: i }); }
        if (e.phase === 'lightoff' && e.n2 >= SYS.idleN2 - 2) { e.phase = 'running'; this.events.push({ type: 'engineRunning', engine: i }); }
        continue;
      }
      // off: the starter may be turning it
      const turning = starter && this.dc && this.duct >= SYS.ductStartMin;
      const motorTo = this.duct >= SYS.ductStartFull ? SYS.motorN2 : SYS.motorN2Low;
      if (turning) e.n2 += (motorTo - e.n2) * Math.min(1, dt / SYS.motorTau); else e.n2 = Math.max(0, e.n2 - 3 * dt);
      e.egt = Math.max(0, e.egt - 20 * dt);
      ae.manualStart = true; ae.starting = turning;      // the fan turns with the starter (the flight model shows N1)
      if (lever) {
        if (e.n2 >= SYS.fuelOnN2 && this.fuelPressure[i] && turning) {
          e.phase = 'lightoff'; ae.running = true; this.events.push({ type: 'lightoff', engine: i });
        } else {
          // fuel with too little airflow, no fuel pressure, or no starter: no start, and it must be cleared
          e.phase = 'aborted'; e.coolT = 0; e.egt = e.n2 > 5 ? 780 : e.egt; ae.starting = false; s[`start${n}`] = 0;
          this.events.push({ type: 'startAborted', engine: i, reason: !turning ? 'the starter was not turning the engine' : e.n2 < SYS.fuelOnN2 ? `start lever to IDLE at ${e.n2.toFixed(0)} % N2 (wait for ${SYS.fuelOnN2 + 5} %)` : 'no fuel pressure: the fuel pumps are off' });
        }
      }
    }
    this.derive();
    // ---- hydraulic pressure follows its pumps
    const run = (i) => this.eng[i].phase === 'running';
    const a = (this.on('hydEng1') && run(0)) || (s.hydElec2 && this.ac_), b = (this.on('hydEng2') && run(1)) || (s.hydElec1 && this.ac_);
    const k = Math.min(1, dt / SYS.hydTau);
    this.hyd.a += ((a ? SYS.hydPsi : 0) - this.hyd.a) * k; this.hyd.b += ((b ? SYS.hydPsi : 0) - this.hyd.b) * k;
  }

  /** The stand's power unit is unplugged (the pushback begins). */
  disconnectGroundPower() { this.groundPowerAvailable = false; this.sw.groundPower = 0; this.derive(); }

  /** The light beside a switch: { text, kind: 'amber' | 'blue' | 'green' } or null. */
  light(id) {
    const s = this.sw, run = (i) => this.eng[i].phase === 'running', A = this.apu;
    if (!this.dc) return null;
    switch (id) {
      case 'groundPower': return this.groundPowerAvailable ? { text: 'GRD POWER AVAILABLE', kind: 'blue' } : null;
      case 'apu': return A.state === 'starting' ? { text: `STARTING ${A.rpm.toFixed(0)} %`, kind: 'amber' } : A.state === 'running' ? { text: 'RUNNING', kind: 'green' } : null;
      case 'apuGen': return A.state === 'running' && !s.apuGen ? { text: 'APU GEN OFF BUS', kind: 'blue' } : null;
      case 'gen1': case 'gen2': { const i = id === 'gen1' ? 0 : 1; return !s[id] ? { text: run(i) ? 'GEN OFF BUS' : 'SOURCE OFF', kind: run(i) ? 'blue' : 'amber' } : !run(i) ? { text: 'SOURCE OFF', kind: 'amber' } : null; }
      case 'fuelPump1': case 'fuelPump2': return this.fuelPressure[id === 'fuelPump1' ? 0 : 1] ? null : { text: 'LOW PRESSURE', kind: 'amber' };
      case 'hydEng1': return this.on(id) && run(0) ? null : { text: 'LOW PRESSURE', kind: 'amber' };
      case 'hydEng2': return this.on(id) && run(1) ? null : { text: 'LOW PRESSURE', kind: 'amber' };
      case 'hydElec1': case 'hydElec2': return s[id] && this.ac_ ? null : { text: 'LOW PRESSURE', kind: 'amber' };
      case 'apuBleed': return s.apuBleed && A.state === 'running' ? { text: `DUCT ${this.duct.toFixed(0)} PSI`, kind: 'green' } : null;
      case 'start1': case 'start2': { const e = this.eng[id === 'start1' ? 0 : 1]; return e.phase === 'aborted' ? { text: 'START ABORTED', kind: 'amber' } : s[id] ? { text: 'START VALVE OPEN', kind: 'amber' } : null; }
      case 'irs': return !s.irs ? null : this.irsAligned ? { text: 'ALIGNED', kind: 'green' } : { text: `ALIGN ${Math.ceil(SYS.irsAlignS - this.irsT)} s`, kind: 'amber' };
      default: return null;
    }
  }

  /** The gauges of the panel page. */
  gauges() {
    return { source: this.acSource || (this.dc ? 'BATTERY ONLY' : 'NO POWER'), apuEgt: Math.round(this.apu.egt), apuRpm: Math.round(this.apu.rpm), duct: Math.round(this.duct),
      hydA: Math.round(this.hyd.a / 10) * 10, hydB: Math.round(this.hyd.b / 10) * 10,
      engines: this.eng.map((e, i) => ({ n2: e.n2, egt: Math.round(e.egt), n1: this.ac.engines[i].n1 * 100, phase: e.phase })) };
  }

  /** What is still wrong for a take-off, as the configuration warning names it. */
  takeoffProblems() {
    const p = [], s = this.sw, run = (i) => this.eng[i].phase === 'running';
    if (!(s.gen1 && s.gen2 && run(0) && run(1))) p.push('GENERATORS');
    if (!(this.hydA && this.hydB)) p.push('HYDRAULICS');
    if (!this.irsAligned) p.push('IRS');
    if (!s.yawDamper) p.push('YAW DAMPER');
    if (!s.probeHeat) p.push('PROBE HEAT');
    if (!s.beacon) p.push('ANTI-COLLISION LIGHT');
    return p;
  }

  /** What a pushback needs first: [] when the aircraft is ready for the tug. */
  pushbackProblems() {
    const p = [];
    if (!this.dc) p.push('battery ON');
    if (!(this.sw.apuGen && this.apu.state === 'running')) p.push('the APU running with its generator on the bus (the ground power is unplugged for the push)');
    if (!this.sw.beacon) p.push('anti-collision light ON');
    return p;
  }

  /**
   * The checklists, each item ticked once it is so: [{ title, items: [{ text, done }] }].
   * `ctx`: { pushed (the pushback has begun), flapsSet, trimSet, parkingBrake, rto }.
   */
  checklists(ctx = {}) {
    const s = this.sw, run = (i) => this.eng[i].phase === 'running', A = this.apu;
    const it = (text, done) => ({ text, done: !!done });
    const started = run(0) && run(1);   // what was needed for the start stays ticked once both engines run
    return [
      { title: 'POWER UP', items: [
        it('Battery ON', s.battery), it('Ground power ON', this.ac_), it('IRS to NAV (it aligns in 90 s; keep the aircraft still)', s.irs), it('Position lights ON', s.position) ] },
      { title: 'BEFORE START', items: [
        it('APU START, and wait for RUNNING', A.state === 'running' || started), it('APU generator ON', (s.apuGen && A.state === 'running') || started),
        it('Fuel pumps 1 and 2 ON', s.fuelPump1 && s.fuelPump2), it('Electric hydraulic pumps 1 and 2 ON', s.hydElec1 && s.hydElec2),
        it('APU bleed ON, packs OFF', (s.apuBleed && !s.pack1 && !s.pack2) || started), it('Anti-collision light ON', s.beacon), it('Pushback requested', ctx.pushed) ] },
      { title: 'ENGINE START (2, then 1)', items: [
        it('Start switch 2 to GRD', s.start2 || this.eng[1].phase !== 'off'), it('At 25 % N2: start lever 2 to IDLE', s.lever2 && this.eng[1].phase !== 'aborted'), it('Engine 2 stable at idle', run(1)),
        it('Start switch 1 to GRD', s.start1 || this.eng[0].phase !== 'off'), it('At 25 % N2: start lever 1 to IDLE', s.lever1 && this.eng[0].phase !== 'aborted'), it('Engine 1 stable at idle', run(0)) ] },
      { title: 'AFTER START', items: [
        it('Generators 1 and 2 ON', s.gen1 && s.gen2 && run(0) && run(1)), it('Probe heat ON', s.probeHeat), it('Window heat ON', s.windowHeat),
        it('Packs ON, APU bleed OFF', s.pack1 && s.pack2 && !s.apuBleed), it('APU OFF', A.state === 'off' && run(0) && run(1)), it('Yaw damper ON', s.yawDamper), it('IRS aligned', this.irsAligned) ] },
      { title: 'BEFORE TAKE-OFF', items: [
        it('Flaps 5', ctx.flapsSet), it('Stabiliser trim set', ctx.trimSet), it('Autobrake RTO', ctx.rto), it('Parking brake released', ctx.parkingBrake === false) ] },
    ];
  }
}
