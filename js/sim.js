// Simulation session: atmosphere + aircraft + fixed-step integration with a
// frame-time accumulator. Shared by the game (browser) and the tests (Node).
import { Atmosphere } from './physics/atmosphere.js';
import { Aircraft } from './physics/aircraft.js';
import { SCENARIOS, APPROACH_STARTS, RUNWAY, PHYSICS_DT, NM, FT, KTS, DEG } from './config.js';

export class Simulation {
  constructor({ scenarioId = 'clear', startId = 'standard', seed = 7 } = {}) {
    this.scenario = SCENARIOS[scenarioId];
    this.start = APPROACH_STARTS[startId];
    this.atmosphere = new Atmosphere(this.scenario, seed);
    this.aircraft = new Aircraft({ atmosphere: this.atmosphere });
    this.accumulator = 0;
    this.fixedDt = PHYSICS_DT;
    this.maxSubSteps = 120;  // up to 1 s of physics per frame: never falls behind on slow machines
    this.timeScale = 1;
    this.paused = false;
    this.preStep = null;
    this.postStep = null;
    this.stepCount = 0;
    this.reposition();
  }

  /** Put the aircraft on final approach for the selected start. */
  reposition(startId) {
    if (startId) this.start = APPROACH_STARTS[startId];
    const s = this.start;
    const dist = s.distanceNm * NM;
    const x = RUNWAY.thresholdX + dist;                 // east of the threshold, flying west
    const alt = s.altFt * FT;
    // the standard/full starts are level slightly below the glideslope; the short final is on it.
    // place() sets the thrust and stabiliser trim for equilibrium so the aircraft starts stable.
    this.aircraft.place({
      x, y: alt, z: 0, headingDeg: RUNWAY.headingDeg, iasKts: s.iasKts,
      flapIndex: s.flaps, gearDown: s.gear, gammaDeg: s.id === 'short' ? -3 : 0,
    });
    this.accumulator = 0;
    this.stepCount = 0;
  }

  /** Advance by a frame's worth of wall-clock time (seconds). */
  update(frameDt) {
    if (this.paused) return 0;
    const dt = Math.min(frameDt, 1.0) * this.timeScale;
    this.accumulator += dt;
    let steps = 0;
    const maxSteps = Math.ceil(this.maxSubSteps * Math.max(1, this.timeScale));
    while (this.accumulator >= this.fixedDt && steps < maxSteps) {
      this.stepOnce();
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === maxSteps) this.accumulator = 0; // avoid a spiral of death
    return steps;
  }

  stepOnce() {
    if (this.preStep) this.preStep(this.fixedDt);
    this.atmosphere.step(this.fixedDt);
    this.aircraft.step(this.fixedDt);
    this.stepCount++;
    if (this.postStep) this.postStep(this.fixedDt);
  }

  /** Run exactly `seconds` of simulated time (tests). */
  run(seconds, perStep) {
    const n = Math.round(seconds / this.fixedDt);
    for (let i = 0; i < n; i++) {
      if (perStep) perStep(this.aircraft.state, this.aircraft, i * this.fixedDt);
      this.stepOnce();
    }
  }

  get state() { return this.aircraft.state; }
  get input() { return this.aircraft.input; }
}

export { RUNWAY, NM, FT, KTS, DEG };
