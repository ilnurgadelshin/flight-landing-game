// ---------------------------------------------------------------------------
// Aircraft flight model: 6-DOF rigid body (cannon-es) driven by a
// coefficient-based aerodynamic model, engine spool dynamics, and a
// spring/damper landing gear with a tyre friction model.
//
// Runs at a fixed rate (PHYSICS_HZ) via `step(dt)`; the caller accumulates
// frame time and calls step() as many times as needed — rendering never
// affects the integration.
// ---------------------------------------------------------------------------
import * as CANNON from 'cannon-es';
import { AIRCRAFT as AC, KTS, DEG, G, RUNWAY, PHYSICS_DT } from '../config.js';
import { TERRAIN } from './terrain.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : 1);

// Pre-allocated temporaries
const _v1 = new CANNON.Vec3();
const _v2 = new CANNON.Vec3();
const _v3 = new CANNON.Vec3();
const _v4 = new CANNON.Vec3();
const _v5 = new CANNON.Vec3();
const _q1 = new CANNON.Quaternion();

// Height of the CG above the ground with the gear extended and compressed
// under static load. Used as the radio-altimeter datum.
export const CG_HEIGHT_ON_GROUND = 3.3;

export class Aircraft {
  /**
   * @param {object} opts { atmosphere, terrain }
   */
  constructor(opts) {
    this.atmosphere = opts.atmosphere;
    this.terrain = opts.terrain || TERRAIN;
    this.time = 0;

    // ----- cannon world --------------------------------------------------
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
    // cannon-es bounds each friction impulse by mu * |frictionGravity| * mass
    // PER STEP. For a 62 t body at 120 Hz the default (|g|) would allow a 35 g
    // deceleration; scale it to the physically meaningful mu * m * g * dt.
    world.frictionGravity = new CANNON.Vec3(0, G * PHYSICS_DT * 0.6, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 12;
    world.defaultContactMaterial.friction = 0.5;
    world.defaultContactMaterial.restitution = 0.0;
    world.defaultContactMaterial.contactEquationStiffness = 1.5e7;
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    this.world = world;

    const groundMat = new CANNON.Material('ground');
    const hullMat = new CANNON.Material('hull');
    world.addContactMaterial(new CANNON.ContactMaterial(groundMat, hullMat, {
      friction: 0.3, restitution: 0.0, contactEquationStiffness: 1.5e7, contactEquationRelaxation: 4,
    }));

    const ground = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // plane normal +Y
    world.addBody(ground);
    this.groundBody = ground;

    const body = new CANNON.Body({ mass: AC.mass, material: hullMat });
    this.hullShapes = {};
    for (const [name, h] of Object.entries(AC.hull)) {
      const shape = new CANNON.Box(new CANNON.Vec3(h.half[0], h.half[1], h.half[2]));
      shape.hullName = name;
      body.addShape(shape, new CANNON.Vec3(h.pos[0], h.pos[1], h.pos[2]));
      this.hullShapes[name] = shape;
    }
    // Override the inertia with realistic airliner values.
    // cannon local: X = pitch axis, Y = yaw axis, Z = roll axis
    body.inertia.set(AC.inertia.pitch, AC.inertia.yaw, AC.inertia.roll);
    body.invInertia.set(1 / AC.inertia.pitch, 1 / AC.inertia.yaw, 1 / AC.inertia.roll);
    body.updateInertiaWorld(true);
    body.linearDamping = 0;
    body.angularDamping = 0;
    body.allowSleep = false;
    world.addBody(body);
    this.body = body;

    // hull contact tracking (belly / tail / wing / nacelle strikes)
    this.hullContacts = new Set();
    this.hullContactImpulse = 0;
    this._hullTouching = false;
    this._hullTouchTimer = 0;
    // (hull contacts are collected from world.contacts after every step; the
    // 'collide' event only fires when a contact pair first appears)

    // ----- pilot inputs (all -1..1 or 0..1) --------------------------------
    this.input = {
      pitch: 0,       // +1 = nose up command (pull)
      roll: 0,        // +1 = roll right
      yaw: 0,         // +1 = nose right (right rudder)
      throttle: 0,    // 0..1 lever position
      brake: 0,       // 0..1
      reverse: false,
      speedbrake: 0,  // 0..1 lever
      speedbrakeArmed: false,
      gearDown: true,
      flapIndex: 0,   // detent index
      trim: 0,        // degrees of stabiliser trim (+ = nose up)
      autobrake: 0,   // 0 off, 1,2,3, 4 = MAX
    };

    // ----- internal state ---------------------------------------------------
    this.surfaces = { elevator: 0, aileron: 0, rudder: 0 }; // radians, actual positions
    this.engines = [{ n1: AC.engines.idleN1, thrust: 0 }, { n1: AC.engines.idleN1, thrust: 0 }];
    this.reverserPos = 0;         // 0 stowed .. 1 deployed
    this.flapDeg = 0;
    this.gearPos = 1;             // 0 up .. 1 down & locked
    this.speedbrakePos = 0;       // actual panel position 0..1
    this.gear = {
      nose: this.makeGear('nose', AC.gear.nose),
      left: this.makeGear('left', AC.gear.left),
      right: this.makeGear('right', AC.gear.right),
    };
    this.wind = [0, 0, 0];
    this.state = this.emptyState();
    this.resetDamage();
    this.events = [];             // physics-level events (touchdown, bounce, strikes)
    this.stallWarning = false;
    this.stalled = false;
    this.airborne = true;
    this.airborneTime = 100;
    this.groundTime = 0;
    this.touchdown = null;        // record of the first touchdown
    this.landingRollDistance = 0;
    this.maxG = 1;
    this.skidding = false;
    this.brakeApplied = 0;
    this.brakeTemp = 0;
    this._gFilt = 1;
    this._lastVy = undefined;
    this._bounces = 0;
    this._brakePower = 0;
    this.autoTrim = true;
    this._holdT = 0;
  }

  makeGear(name, cfg) {
    return {
      name, cfg,
      pos: new CANNON.Vec3(cfg.pos[0], cfg.pos[1], cfg.pos[2]),
      compression: 0, compressionRate: 0, load: 0, onGround: false, contactPoint: new CANNON.Vec3(),
      surface: 'grass', steer: 0, collapsed: false, wasOnGround: false, skid: false,
    };
  }

  resetDamage() {
    this.damage = { gearCollapsed: false, collapsedGear: [], tailStrike: false, wingStrike: false,
      engineStrike: false, bellyContact: false, hardLanding: false, destroyed: false, overstress: false, notes: [] };
  }

  emptyState() {
    return {
      x: 0, y: 0, z: 0, alt: 0, agl: 0, terrainH: 0,
      vx: 0, vy: 0, vz: 0, vs: 0, groundSpeed: 0,
      pitch: 0, roll: 0, heading: 0,
      p: 0, q: 0, r: 0,
      ias: 0, tas: 0, tasKts: 0, alpha: 0, beta: 0, mach: 0,
      track: 0, gamma: 0, gLoad: 1,
      n1: [0, 0], thrust: 0, flapDeg: 0, flapIndex: 0, gearPos: 1, gearDown: true, gearInTransit: false,
      speedbrake: 0, speedbrakeArmed: false, reverser: 0, reverseSelected: false, trim: 0,
      elevator: 0, aileron: 0, rudder: 0, throttle: 0, brake: 0, autobrake: 0,
      onGround: false, wheelsOnGround: 0, mainsOnGround: false, noseOnGround: false,
      surface: 'grass', anyOnRunway: false, skidding: false, brakeTemp: 0,
      locDev: 0, gsDev: 0, gsAngle: 3, gsAltitude: 0, distToThreshold: 0, distFromThreshold: 0,
      lateralOffset: 0, alongRunway: 0, crabDeg: 0, landingDirection: '27',
      windDirDeg: 0, windKts: 0, headwind: 0, crosswind: 0,
      stallWarning: false, stalled: false, aStallDeg: 13,
      CL: 0, CD: 0, qbar: 0, vref: AC.vref30, gearCollapsed: false, destroyed: false, time: 0,
      onRunwayStrip: false, beyondRunwayEnd: false, gearLoads: [0, 0, 0], gearCompression: [0, 0, 0], noseSteer: 0,
    };
  }

  // ----- placement -----------------------------------------------------------
  /** Place the aircraft at a position with heading (deg), speed (kts), config. */
  place({ x, y, z, headingDeg, iasKts, flapIndex = 4, gearDown = true, throttle = 'trim', gammaDeg = 0, onGround = false }) {
    const b = this.body;
    b.position.set(x, y, z);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.force.set(0, 0, 0);
    b.torque.set(0, 0, 0);
    this.time = 0;
    this.input.pitch = this.input.roll = this.input.yaw = 0;
    this.input.flapIndex = flapIndex;
    this.flapDeg = AC.flapDetents[flapIndex];
    this.input.gearDown = gearDown;
    this.gearPos = gearDown ? 1 : 0;
    this.input.throttle = throttle;
    this.input.speedbrake = 0;
    this.input.speedbrakeArmed = false;
    this.input.reverse = false;
    this.input.brake = 0;
    this.reverserPos = 0;
    this.speedbrakePos = 0;
    this.surfaces.elevator = this.surfaces.aileron = this.surfaces.rudder = 0;
    this.resetDamage();
    for (const g of Object.values(this.gear)) { g.collapsed = false; g.compression = 0; g.onGround = false; g.wasOnGround = false; g.load = 0; }
    this.events.length = 0;
    this.touchdown = null;
    this.landingRollDistance = 0;
    this.airborne = !onGround;
    this.airborneTime = onGround ? 0 : 100;
    this.groundTime = 0;
    this.maxG = 1;
    this._gFilt = 1;
    this._lastVy = undefined;
    this._bounces = 0;
    this.hullContacts.clear();
    this.hullContactImpulse = 0;
    this._hullTouching = false;
    this.brakeTemp = 0;
    this.stallWarning = false; this.stalled = false;

    const psi = headingDeg * DEG;
    const tas = iasKts * KTS;
    const rho = this.atmosphere.density(y);
    const qbar = 0.5 * rho * tas * tas;
    const CLreq = onGround ? 0 : (AC.mass * G * Math.cos(gammaDeg * DEG)) / Math.max(qbar * AC.wingArea, 1);
    const CL0 = AC.aero.CL0 + AC.flaps.dCL0[flapIndex];
    let alpha = onGround ? 0 : (CLreq - CL0) / AC.aero.CLa;
    alpha = clamp(alpha, -5 * DEG, 12 * DEG);
    const theta = onGround ? 0 : gammaDeg * DEG + alpha;
    const qYaw = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -psi);
    const qPitch = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), theta);
    b.quaternion.copy(qYaw.mult(qPitch));
    const wind = this.atmosphere.meanWind(y, [0, 0, 0]);
    const cg = Math.cos(gammaDeg * DEG);
    const dirX = Math.sin(psi) * cg, dirZ = -Math.cos(psi) * cg, dirY = Math.sin(gammaDeg * DEG);
    if (onGround) b.velocity.set(0, 0, 0);
    else b.velocity.set(dirX * tas + wind[0], dirY * tas + wind[1], dirZ * tas + wind[2]);
    // thrust for equilibrium on this flight path: T = D + W sin(gamma)
    if (throttle === 'trim') {
      const CLt = CL0 + AC.aero.CLa * alpha;
      const CDt = AC.aero.CD0 + AC.flaps.dCD0[flapIndex] + AC.aero.dCD_gear * (gearDown ? 1 : 0) + AC.aero.K * CLt * CLt;
      const Treq = onGround ? 0 : qbar * AC.wingArea * CDt + AC.mass * G * Math.sin(gammaDeg * DEG);
      const fracT = Math.pow(clamp(Treq / (AC.engines.count * AC.engines.maxThrust * (rho / 1.225)), 0, 1), 1 / 2.2);
      const n1t = 0.2 + 0.8 * fracT;
      throttle = clamp((n1t - AC.engines.idleN1) / (1 - AC.engines.idleN1), 0, 1);
      this.input.throttle = throttle;
    }
    // trim the stabiliser for pitch equilibrium at this alpha
    const Cm0 = AC.aero.Cm0 + AC.flaps.dCm0[flapIndex];
    // thrust below the CG produces a nose-up moment that the trim must hold too
    const n1 = lerp(AC.engines.idleN1, 1, throttle);
    const frac = clamp((n1 - 0.2) / 0.8, 0, 1);
    const thrust = AC.engines.count * AC.engines.maxThrust * Math.pow(frac, 2.2) * (rho / 1.225);
    const CmThrust = onGround ? 0 : thrust * (-AC.engines.thrustArmY) / Math.max(qbar * AC.wingArea * AC.chord, 1);
    const CmNeeded = -(Cm0 + AC.aero.Cma * alpha + CmThrust);
    const de = CmNeeded / AC.aero.Cmde; // elevator radians equivalent
    this.input.trim = onGround ? 0 : clamp(-de / DEG, -AC.controls.maxTrimDeg, AC.controls.maxTrimDeg);
    for (const e of this.engines) { e.n1 = n1; e.thrust = thrust / AC.engines.count; }
    const wv = onGround ? 0 : tas;
    this.updateState(0, { tas: wv, totalThrust: thrust, alpha, wind });
  }

  // ----- helpers ---------------------------------------------------------------
  currentVref() {
    const fi = this.input.flapIndex;
    if (fi >= 5) return AC.vref40;
    if (fi >= 4) return AC.vref30;
    if (fi >= 3) return AC.vref15;
    if (fi >= 2) return AC.vref15 + 10;
    if (fi >= 1) return AC.vref15 + 20;
    return AC.stallClean * 1.3;
  }

  // Lift curve with a smooth stall; works with the actual (continuous) flap angle
  liftCoefficient(alpha, dCL0f, aStall) {
    const A = AC.aero;
    const CL0 = A.CL0 + dCL0f;
    const CLmax = CL0 + A.CLa * aStall;
    const width = A.stallWidthDeg * DEG;
    let CL;
    if (alpha <= aStall && alpha >= -aStall * 0.8) {
      CL = CL0 + A.CLa * alpha;
    } else if (alpha > aStall) {
      const over = alpha - aStall;
      const t = clamp(over / width, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      const CLdeep = CLmax * A.postStallCLfrac;
      CL = CLmax - (CLmax - CLdeep) * smooth;
      if (alpha > aStall + width) {
        const beyond = alpha - aStall - width;
        CL = Math.max(0.2, CLdeep * Math.cos(Math.min(beyond, Math.PI / 2)));
      }
    } else {
      const aNeg = -aStall * 0.8;
      const CLmin = CL0 + A.CLa * aNeg;
      const over = aNeg - alpha;
      const t = clamp(over / width, 0, 1);
      CL = CLmin + (0 - CLmin) * 0.5 * t * t * (3 - 2 * t);
    }
    return { CL, CLmax, aStall, CL0 };
  }

  flapLerp(arr) {
    const d = this.flapDeg;
    const det = AC.flapDetents;
    for (let i = 1; i < det.length; i++) {
      if (d <= det[i]) { const t = (d - det[i - 1]) / (det[i] - det[i - 1]); return lerp(arr[i - 1], arr[i], t); }
    }
    return arr[arr.length - 1];
  }

  // ----- main fixed step ---------------------------------------------------------
  step(dt) {
    this.time += dt;
    const b = this.body;
    const inp = this.input;
    const E = AC.engines;
    const A = AC.aero;

    // --- control surfaces follow the inputs with an actuator lag
    const kS = 1 - Math.exp(-AC.controls.surfaceRate * dt);
    // pitch input +1 = nose up = elevator trailing edge UP = negative elevator angle (aero convention)
    const elevatorCmd = -inp.pitch * AC.controls.maxElevatorDeg * DEG;
    const aileronCmd = inp.roll * AC.controls.maxAileronDeg * DEG;
    this.surfaces.elevator += (elevatorCmd - this.surfaces.elevator) * kS;
    this.surfaces.aileron += (aileronCmd - this.surfaces.aileron) * kS;
    // rudder: pilot + yaw damper (uses the previous step's yaw rate).
    // Aero convention: positive rudder = trailing edge LEFT = nose-left moment
    // (Cndr < 0), so right pedal (yaw input +1) commands a negative deflection.
    // The damper deflects the rudder to oppose the yaw rate.
    // the yaw damper also works on the ground (it is engaged whenever it is switched on), which
    // gives the roll-out the directional damping a real aircraft has
    const yawDamper = AC.controls.yawDamperGain * this.state.r * (this.airborne ? 1 : 0.7);
    const rudderCmd = clamp(-inp.yaw * AC.controls.maxRudderDeg * DEG + yawDamper, -AC.controls.maxRudderDeg * DEG, AC.controls.maxRudderDeg * DEG);
    this.surfaces.rudder += (rudderCmd - this.surfaces.rudder) * kS;
    // trim follow-up: like the 737 speed-trim system, a sustained column input slowly
    // runs the stabiliser so the pilot can relax the input (can be disabled)
    // It only runs when the same input has been held for a while AND the aircraft is not
    // pitching (a pilot trims once the attitude is steady); a fast follow-up chasing a
    // moving input turns every correction into a slow pitch oscillation.
    if (this.autoTrim && this.airborne && this.state.ias > 60) {
      const s = Math.abs(inp.pitch) > 0.08 ? sign(inp.pitch) : 0;
      if (s !== 0 && s === this._holdSign) this._holdT += dt; else { this._holdT = 0; this._holdSign = s; }
      if (this._holdT > 2.0 && Math.abs(this.state.q) < 1.5 * DEG) inp.trim = clamp(inp.trim + s * 0.3 * dt, -AC.controls.maxTrimDeg, AC.controls.maxTrimDeg);
    }
    const trimRad = clamp(inp.trim, -AC.controls.maxTrimDeg, AC.controls.maxTrimDeg) * DEG;

    // flaps move at a fixed rate toward the selected detent
    const flapTarget = AC.flapDetents[inp.flapIndex];
    const dF = AC.flapMoveRate * dt;
    if (Math.abs(flapTarget - this.flapDeg) <= dF) this.flapDeg = flapTarget;
    else this.flapDeg += sign(flapTarget - this.flapDeg) * dF;

    // gear
    const gTarget = inp.gearDown ? 1 : 0;
    const dG = dt / AC.gear.retractTime;
    if (Math.abs(gTarget - this.gearPos) <= dG) this.gearPos = gTarget;
    else this.gearPos += sign(gTarget - this.gearPos) * dG;

    // speedbrake panels follow the lever
    this.speedbrakePos += (inp.speedbrake - this.speedbrakePos) * (1 - Math.exp(-dt / 0.6));

    // reversers only deploy on the ground (weight on wheels or within a few feet)
    const reverseAllowed = inp.reverse && (!this.airborne || this.state.agl < 2);
    this.reverserPos += ((reverseAllowed ? 1 : 0) - this.reverserPos) * (1 - Math.exp(-dt / 0.9));

    // --- engines: N1 spool dynamics
    let throttleForN1 = inp.throttle;
    if (reverseAllowed) throttleForN1 = Math.max(inp.throttle, E.reverseMaxN1);
    else if (this.reverserPos > 0.3) throttleForN1 = 0; // stowing: engines go to idle first
    const n1Target = lerp(E.idleN1, 1.0, clamp(throttleForN1, 0, 1));
    const rhoRatio = this.atmosphere.density(b.position.y) / 1.225;
    let totalThrust = 0;
    for (const eng of this.engines) {
      const up = n1Target > eng.n1;
      const tau = up ? (eng.n1 < 0.55 ? E.tauUpLow : E.tauUpHigh) : E.tauDown;
      eng.n1 += (n1Target - eng.n1) * (1 - Math.exp(-dt / tau));
      const frac = clamp((eng.n1 - 0.2) / 0.8, 0, 1);
      let thrust = E.maxThrust * Math.pow(frac, 2.2) * rhoRatio;
      thrust *= (1 - this.reverserPos) - this.reverserPos * E.reverseFraction;
      eng.thrust = thrust;
      totalThrust += thrust;
    }
    if (this.damage.destroyed) totalThrust = 0;

    // --- kinematics in the body frame
    const q = b.quaternion;
    const qInv = q.conjugate(_q1);
    const alt = b.position.y;
    const wind = this.atmosphere.windAt(alt, this.wind);
    _v1.set(b.velocity.x - wind[0], b.velocity.y - wind[1], b.velocity.z - wind[2]);
    const vRelBody = qInv.vmult(_v1, _v2);          // body frame relative air velocity
    const u = -vRelBody.z;                           // forward
    const v = vRelBody.x;                            // right
    const w = -vRelBody.y;                           // down
    const tas = Math.sqrt(u * u + v * v + w * w);
    const alpha = tas > 1 ? Math.atan2(w, Math.max(u, 0.1)) : 0;
    const beta = tas > 1 ? Math.asin(clamp(v / tas, -1, 1)) : 0;
    const rho = this.atmosphere.density(alt);
    const qbar = 0.5 * rho * tas * tas;
    const S = AC.wingArea, bSpan = AC.wingSpan, c = AC.chord;

    const wBody = qInv.vmult(b.angularVelocity, _v3);
    const p = -wBody.z;   // roll rate, right wing down +
    const qr = wBody.x;   // pitch rate, nose up +
    const r = -wBody.y;   // yaw rate, nose right +

    // --- aerodynamic coefficients
    const dCL0f = this.flapLerp(AC.flaps.dCL0);
    const dCD0f = this.flapLerp(AC.flaps.dCD0);
    const dCm0f = this.flapLerp(AC.flaps.dCm0);
    const aStallDeg = this.flapLerp(AC.flaps.alphaStallDeg);
    const lift = this.liftCoefficient(alpha, dCL0f, aStallDeg * DEG);

    const V = Math.max(tas, 5);
    const qhat = qr * c / (2 * V), phat = p * bSpan / (2 * V), rhat = r * bSpan / (2 * V);
    const de = this.surfaces.elevator, da = this.surfaces.aileron, dr = this.surfaces.rudder;
    const deTrim = -trimRad; // stabiliser acts like an additional elevator deflection

    // ground effect within about a wingspan of the ground
    const hAGL = Math.max(0, alt - this.terrain.heightAt(b.position.x, b.position.z) - CG_HEIGHT_ON_GROUND);
    const geExp = Math.exp(-2.5 * hAGL / bSpan);
    const geFactor = 1 - 0.5 * geExp;   // induced drag multiplier
    const geLift = 1 + 0.06 * geExp;

    const sbGround = !this.airborne;
    const dCLsb = this.speedbrakePos * (sbGround ? A.dCL_speedbrakeGround : A.dCL_speedbrakeFlight);
    const dCDsb = this.speedbrakePos * (sbGround ? A.dCD_speedbrakeGround : A.dCD_speedbrakeFlight);

    const CL = (lift.CL + A.CLq * qhat + A.CLde * de) * geLift + dCLsb;
    const CD = A.CD0 + dCD0f + A.dCD_gear * this.gearPos + dCDsb + A.K * CL * CL * geFactor
      + (this.damage.gearCollapsed ? 0.05 : 0);
    const CY = A.CYb * beta + A.CYdr * dr;
    const Cl = A.Clb * beta + A.Clp * phat + A.Clr * rhat + A.Clda * da + A.Cldr * dr;
    const stallExcess = Math.max(0, alpha - aStallDeg * DEG);
    const Cm = A.Cm0 + dCm0f + A.Cma * alpha + A.Cmq * qhat + A.Cmde * (de + deTrim) - 1.2 * stallExcess;
    const Cn = A.Cnb * beta + A.Cnp * phat + A.Cnr * rhat + A.Cnda * da + A.Cndr * dr;

    // --- forces
    if (tas > 0.5) {
      const dragDir = _v4.set(-vRelBody.x / tas, -vRelBody.y / tas, -vRelBody.z / tas);
      const symLen = Math.hypot(vRelBody.y, vRelBody.z) || 1;
      // lift direction = right × vSym, perpendicular to the symmetry-plane velocity (up for level flight)
      const liftDir = _v5.set(0, -vRelBody.z / symLen, vRelBody.y / symLen);
      const wreck = this.damage.destroyed ? 0.15 : 1;   // a wreck sliding on its belly makes no useful lift
      const L = qbar * S * CL * wreck, D = qbar * S * CD, Y = qbar * S * CY;
      const fBody = _v1.set(
        dragDir.x * D + liftDir.x * L + Y,
        dragDir.y * D + liftDir.y * L,
        dragDir.z * D + liftDir.z * L - totalThrust,   // thrust along -Z (forward)
      );
      const fWorld = q.vmult(fBody, _v2);
      b.applyForce(fWorld, CANNON.Vec3.ZERO);
      // moments (aero convention -> cannon local axes: pitch about +X, yaw about -Y, roll about -Z)
      const Lm = qbar * S * bSpan * Cl;
      const Mm = qbar * S * c * Cm + totalThrust * (-E.thrustArmY);
      const Nm = qbar * S * bSpan * Cn;
      const tBody = _v1.set(Mm, -Nm, -Lm);
      const tWorld = q.vmult(tBody, _v2);
      b.torque.vadd(tWorld, b.torque);
    } else {
      const fBody = _v1.set(0, 0, -totalThrust);
      b.applyForce(q.vmult(fBody, _v2), CANNON.Vec3.ZERO);
    }

    this.stallWarning = tas > 20 && alpha > (aStallDeg - 2.0) * DEG;
    this.stalled = tas > 20 && alpha > aStallDeg * DEG;

    // --- landing gear + tyres
    this.stepGear(dt);

    // --- integrate
    this.hullContacts.clear();
    this.hullContactImpulse = 0;
    // impact velocity is read before the solver changes the velocity
    const vyBefore = b.velocity.y;
    this.world.step(dt);
    for (const c of this.world.contacts) {
      if (c.bi !== b && c.bj !== b) continue;
      const shape = c.bi === b ? c.si : c.sj;
      if (shape && shape.hullName) this.hullContacts.add(shape.hullName);
    }
    if (this.hullContacts.size) {
      this.hullContactImpulse = Math.max(0, -vyBefore);
      this.handleHullContacts();
    }

    // --- terrain crash check (hills far from the airport)
    const th = this.terrain.heightAt(b.position.x, b.position.z);
    if (th > 0.5 && b.position.y < th + 1.5 && !this.damage.destroyed) {
      this.destroy('Controlled flight into terrain');
    }

    // --- G load from the change in vertical velocity
    const gz = this._lastVy === undefined ? 1 : 1 + (b.velocity.y - this._lastVy) / dt / G;
    this._lastVy = b.velocity.y;
    this._gFilt += (gz - this._gFilt) * (1 - Math.exp(-dt / 0.15));
    if (Math.abs(this._gFilt) > Math.abs(this.maxG)) this.maxG = this._gFilt;
    if (this.airborne && Math.abs(this._gFilt) > 3.5 && !this.damage.overstress) {
      this.damage.overstress = true; this.damage.notes.push('Airframe overstressed');
      this.events.push({ t: this.time, type: 'overstress' });
    }

    // --- airborne bookkeeping (debounced)
    const wheelsOnGround = Object.values(this.gear).filter((g) => g.onGround).length;
    const anyContact = wheelsOnGround > 0 || this.hullContacts.size > 0 || this._hullTouching;
    if (anyContact) {
      this.groundTime += dt;
      if (this.groundTime > 0.12 && this.airborne) { this.airborne = false; this.airborneTime = 0; this.onTouchdownConfirmed(); }
    } else {
      this.airborneTime += dt;
      if (this.airborneTime > 0.5 && !this.airborne) { this.airborne = true; this.groundTime = 0; if (this.touchdown) this.onLiftoffAfterTouchdown(); }
    }
    if (!this.airborne) this.landingRollDistance += Math.hypot(b.velocity.x, b.velocity.z) * dt;

    // brake temperature (display only)
    this.brakeTemp += (this._brakePower / 3.0e6) * dt - this.brakeTemp * 0.004 * dt;

    this.updateState(dt, { alpha, beta, tas, uFwd: u, p, q: qr, r, totalThrust, wind, aStallDeg, CL, CD, qbar });
  }

  // ----- landing gear ------------------------------------------------------------
  stepGear(dt) {
    const b = this.body;
    const inp = this.input;
    const T = AC.tyres;
    const gearExtended = this.gearPos > 0.98;
    let brakePower = 0;
    this.skidding = false;
    const gsNow = Math.hypot(b.velocity.x, b.velocity.z);

    // autobrake: target deceleration. Like the real system it engages only once both main
    // gears are on the ground (wheel spin-up) with the throttles closed, and ramps the
    // pressure in over a second, so it can never brake one wheel and slew the aircraft.
    let autoBrakeCmd = 0;
    const bothMains = this.gear.left.wasOnGround && this.gear.right.wasOnGround;
    this._mainsGroundT = bothMains ? (this._mainsGroundT || 0) + dt : 0;
    if (inp.autobrake > 0 && this.touchdown && this._mainsGroundT > 0.5 && inp.throttle < 0.05 && gsNow > 1) {
      const targets = [0, 1.1, 1.7, 2.3, 3.2];  // m/s^2
      const target = targets[inp.autobrake];
      const decel = this._lastGs === undefined ? 0 : -(gsNow - this._lastGs) / dt;
      this._abInt = clamp((this._abInt || 0) + (target - decel) * dt * 0.35, 0, 1);
      autoBrakeCmd = clamp((target - decel) * 0.25 + this._abInt, 0, 1) * clamp((this._mainsGroundT - 0.5) / 1.0, 0, 1);
    } else { this._abInt = 0; }
    this._lastGs = gsNow;
    const brakeCmd = clamp(Math.max(inp.brake, autoBrakeCmd), 0, 1);
    this.brakeApplied = brakeCmd;
    const wet = this.atmosphere.scenario.wet;

    for (const g of Object.values(this.gear)) {
      g.wasOnGround = g.onGround;
      g.onGround = false;
      g.load = 0;
      g.skid = false;
      if (!gearExtended || g.collapsed) { g.compression = 0; continue; }
      const attachWorld = b.pointToWorldFrame(g.pos, _v1);
      const downWorld = b.quaternion.vmult(_v2.set(0, -1, 0), _v3);
      const groundY = this.terrain.heightAt(attachWorld.x, attachWorld.z);
      if (downWorld.y > -0.2) { g.compression = 0; continue; }
      const s = (groundY - attachWorld.y) / downWorld.y;  // distance along the strut to the ground
      const compression = g.cfg.rest - s;
      if (compression <= 0) { g.compression = 0; g.compressionRate = 0; continue; }
      const prevComp = g.compression;
      g.compression = Math.min(compression, g.cfg.travel + 0.3);
      g.compressionRate = (g.compression - prevComp) / dt;
      g.onGround = true;
      const contact = _v4.set(attachWorld.x + downWorld.x * s, groundY, attachWorld.z + downWorld.z * s);
      g.contactPoint.copy(contact);
      g.surface = this.terrain.surfaceAt(contact.x, contact.z);

      // strut: spring + damper, hard stop past max travel
      const xr = g.compression / g.cfg.travel;
      let force = g.cfg.k * g.compression * (1 + 3 * xr * xr) + g.cfg.c * g.compressionRate;
      if (g.compression > g.cfg.travel) force += AC.gear.bottomOutK * (g.compression - g.cfg.travel);
      force = Math.max(0, force);
      g.load = force;
      const rel = _v1.set(contact.x - b.position.x, contact.y - b.position.y, contact.z - b.position.z);
      b.applyForce(_v2.set(0, force, 0), rel);

      // --- tyre forces
      const vel = b.getVelocityAtWorldPoint(contact, _v3);
      const fwd = b.quaternion.vmult(_v2.set(0, 0, -1), _v2);
      let fx = fwd.x, fz = fwd.z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      if (g.name === 'nose') {
        const maxSteer = g.cfg.steerMaxDeg * DEG * clamp(1.4 - gsNow / 40, 0.35, 1);
        g.steer = inp.yaw * maxSteer;
        const cs = Math.cos(g.steer), sn = Math.sin(g.steer);
        // rotate the forward vector clockwise (seen from above, +Y up) by the
        // steer angle: heading h -> h + steer. For west (-1,0) and +steer this
        // gives (-cos s, -sin s): west turning toward north = a right turn.
        const nx = fx * cs - fz * sn, nz = fx * sn + fz * cs;
        fx = nx; fz = nz;
      }
      const rx = -fz, rz = fx;                       // right vector (horizontal)
      const vLong = vel.x * fx + vel.z * fz;
      const vLat = vel.x * rx + vel.z * rz;

      const mu = g.surface === 'grass' ? T.muGrass : (wet ? T.muWet : T.muDry);
      const rolling = g.surface === 'grass' ? T.rollingGrass : T.rollingRunway;
      const N = force;
      let fLong = -rolling * N * sign(vLong) * clamp(Math.abs(vLong) / 0.5, 0, 1);
      if (g.name !== 'nose' && brakeCmd > 0) {
        const maxBrake = mu * T.brakeMuFrac * N;      // anti-skid limit
        const fb = -brakeCmd * maxBrake * sign(vLong) * clamp(Math.abs(vLong) / 0.3, 0, 1);
        fLong += fb;
        brakePower += Math.abs(fb * vLong);
      }
      const slip = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.5));
      let fLat = -mu * N * clamp(slip / T.corneringSlipPeakRad, -1, 1);
      const vMag = Math.hypot(vLong, vLat);
      if (vMag < 0.3) fLat *= vMag / 0.3;
      const fMag = Math.hypot(fLong, fLat);
      const limit = mu * N;
      if (fMag > limit) { const k = limit / fMag; fLong *= k; fLat *= k; g.skid = true; this.skidding = true; }
      if (Math.abs(slip) > T.corneringSlipPeakRad * 1.5 && vMag > 3) { g.skid = true; this.skidding = true; }
      if (g.surface === 'grass') fLong -= 0.04 * N * sign(vLong) * clamp(Math.abs(vLong), 0, 1);
      const fWorld = _v2.set(fx * fLong + rx * fLat, 0, fz * fLong + rz * fLat);
      b.applyForce(fWorld, rel);

      if (g.onGround && !g.wasOnGround) this.onGearTouch(g, vLong, vLat);
      if (g.surface === 'grass' && gsNow > 26 && !g.collapsed) {
        this.collapseGear(g, 'Runway excursion at high speed — gear dug into soft ground');
      }
    }
    this._brakePower = brakePower;
  }

  onGearTouch(g, vLong, vLat) {
    const sink = -this.body.velocity.y;   // positive down at the CG
    const st = this.state;
    this.events.push({ t: this.time, type: 'geartouch', gear: g.name, sink, ias: st.ias, surface: g.surface,
      crabDeg: st.crabDeg, bank: st.roll, pitch: st.pitch, lateralOffset: st.lateralOffset, distFromThreshold: st.distFromThreshold,
      groundSpeed: st.groundSpeed, onRunway: st.anyOnRunway });
    const mainsWereUp = !this.gear.left.wasOnGround && !this.gear.right.wasOnGround && !this.gear.left.onGround && !this.gear.right.onGround;
    if (g.name === 'nose' && mainsWereUp && this.airborne) {
      this.events.push({ t: this.time, type: 'nosefirst', sink });
      if (sink > 3.0) this.collapseGear(g, 'Nose gear collapsed — nose-wheel-first touchdown');
      else if (sink > 1.2) this.damage.notes.push('Nose-wheel-first touchdown');
    }
    if (g.name !== 'nose') {
      if (sink > AC.gear.collapseSink) this.collapseGear(g, `Main gear collapsed — vertical speed ${(sink / 0.00508).toFixed(0)} fpm`);
      else if (sink > AC.gear.hardSink && !this.damage.hardLanding) {
        this.damage.hardLanding = true; this.damage.notes.push('Hard landing — structural inspection required');
        this.events.push({ t: this.time, type: 'hardlanding', sink });
      }
      const crabDeg = Math.abs(Math.atan2(vLat, Math.max(Math.abs(vLong), 1))) / DEG;
      // side-load collapse belongs to the landing itself (first seconds); a wheel re-contacting
      // during a swerve on the roll-out scrubs its tyres instead
      const landingPhase = !this.touchdown || this.time - this.touchdown.t < 3;
      if (crabDeg > AC.gear.maxCrabDeg && Math.hypot(vLong, vLat) > 30) {
        if (landingPhase) this.collapseGear(g, `Main gear collapsed — landed with ${crabDeg.toFixed(0)}° of drift (side load)`);
        else this.events.push({ t: this.time, type: 'scrub', text: `${g.name} tyres scrubbed at ${crabDeg.toFixed(0)}° of drift` });
      }
    }
  }

  collapseGear(g, reason) {
    if (g.collapsed) return;
    g.collapsed = true;
    this.damage.gearCollapsed = true;
    this.damage.collapsedGear.push(g.name);
    this.damage.notes.push(reason);
    this.events.push({ t: this.time, type: 'gearcollapse', gear: g.name, reason });
    if (g.name !== 'nose') {
      const other = g.name === 'left' ? this.gear.right : this.gear.left;
      if (-this.body.velocity.y > AC.gear.collapseSink + 1.5 && !other.collapsed) { other.collapsed = true; this.damage.collapsedGear.push(other.name); }
    }
  }

  handleHullContacts() {
    const gs = this.state.groundSpeed;
    this._hullTouching = true;
    this._hullTouchTimer = 0.1;
    for (const name of this.hullContacts) {
      if (name === 'tail' && !this.damage.tailStrike) {
        this.damage.tailStrike = true; this.damage.notes.push('Tail strike'); this.events.push({ t: this.time, type: 'tailstrike' });
      }
      if ((name === 'wingL' || name === 'wingR' || name === 'wingTipL' || name === 'wingTipR') && !this.damage.wingStrike) {
        this.damage.wingStrike = true; this.damage.notes.push('Wing struck the ground'); this.events.push({ t: this.time, type: 'wingstrike', side: name });
        if (gs > 40) this.destroy('Wing struck the ground at high speed — aircraft cartwheeled');
      }
      if ((name === 'engL' || name === 'engR') && !this.damage.engineStrike) {
        this.damage.engineStrike = true; this.damage.notes.push('Engine nacelle strike'); this.events.push({ t: this.time, type: 'enginestrike', side: name });
      }
      if ((name === 'fuselage' || name === 'nose' || name === 'tail2' || this.gearPos < 0.98) && !this.damage.bellyContact) {
        this.damage.bellyContact = true;
        const reason = this.gearPos < 0.98 ? 'Belly landing — the gear was not down' : (this.damage.gearCollapsed ? 'Fuselage on the ground after gear collapse' : 'Fuselage struck the ground');
        this.damage.notes.push(reason);
        this.events.push({ t: this.time, type: 'bellycontact', reason, impact: this.hullContactImpulse });
      }
      if (name === 'nose' && this.hullContactImpulse > 4) this.destroy('Nose impact with the ground');
    }
    if (this.hullContactImpulse > 6) this.destroy('Impact with the ground');
  }

  destroy(reason) {
    if (this.damage.destroyed) return;
    if (!this.touchdown) this.onTouchdownConfirmed(); // make sure the debrief has a record of the impact
    this.damage.destroyed = true;
    this.damage.notes.push(reason);
    this.events.push({ t: this.time, type: 'destroyed', reason });
  }

  onTouchdownConfirmed() {
    if (this.touchdown) return;
    const st = this.state;
    const touches = this.events.filter((e) => e.type === 'geartouch');
    const mains = touches.filter((e) => e.gear !== 'nose');
    // the debrief describes the first contact: the first main gear, unless the nose wheel hit
    // first (then that impact is the landing); the sink rate is the hardest contact of the
    // touchdown sequence so a bounce cannot mask a hard arrival
    const noseFirst = touches.length > 0 && touches[0].gear === 'nose';
    const first = (noseFirst ? touches[0] : mains[0]) || touches[0] || { sink: -this.body.velocity.y, ias: st.ias, crabDeg: st.crabDeg, bank: st.roll, pitch: st.pitch,
      lateralOffset: st.lateralOffset, distFromThreshold: st.distFromThreshold, groundSpeed: st.groundSpeed, onRunway: st.anyOnRunway };
    const hardest = touches.reduce((m, e) => Math.max(m, e.sink), first.sink);
    this.touchdown = {
      t: this.time,
      sink: hardest,
      ias: first.ias, groundSpeed: first.groundSpeed,
      alongRunway: first.distFromThreshold, distFromThreshold: first.distFromThreshold,
      lateralOffset: first.lateralOffset,
      bank: first.bank, pitch: first.pitch, crabDeg: first.crabDeg,
      gearDown: this.gearPos > 0.98, flapIndex: this.input.flapIndex, flapDeg: this.flapDeg,
      surface: st.surface, onRunway: first.onRunway, direction: st.landingDirection,
      x: this.body.position.x, z: this.body.position.z,
      gLoad: this.maxG,
      speedbrakeArmed: this.input.speedbrakeArmed,
      hull: this.hullContacts.size > 0 || this.gearPos < 0.98,
    };
    this.events.push({ t: this.time, type: 'touchdown', ...this.touchdown });
    // auto speedbrakes need the air/ground logic: main gear on the ground (a belly landing does not trigger them)
    if (this.input.speedbrakeArmed && this.input.throttle < 0.1 && this.gearPos > 0.98 && (this.gear.left.onGround || this.gear.right.onGround)) {
      this.input.speedbrake = 1; this.input.speedbrakeArmed = false;
      this.events.push({ t: this.time, type: 'spoilers', auto: true });
    }
    this._bounces = 0;
  }

  onLiftoffAfterTouchdown() {
    this._bounces += 1;
    this.events.push({ t: this.time, type: 'liftoff', bounce: this._bounces });
    if (this.input.speedbrake > 0.5 && this.input.throttle > 0.5) this.input.speedbrake = 0;
  }

  // ----- derived state for instruments / game logic ------------------------------
  updateState(dt, extra = {}) {
    const b = this.body, st = this.state, q = b.quaternion;
    st.x = b.position.x; st.y = b.position.y; st.z = b.position.z;
    st.alt = b.position.y;
    st.terrainH = this.terrain.heightAt(st.x, st.z);
    st.agl = Math.max(0, st.alt - st.terrainH - CG_HEIGHT_ON_GROUND);
    st.vx = b.velocity.x; st.vy = b.velocity.y; st.vz = b.velocity.z;
    st.vs = b.velocity.y;
    st.groundSpeed = Math.hypot(st.vx, st.vz);
    const fwd = q.vmult(_v1.set(0, 0, -1), _v1);
    const right = q.vmult(_v3.set(1, 0, 0), _v3);
    st.pitch = Math.asin(clamp(fwd.y, -1, 1));
    st.heading = Math.atan2(fwd.x, -fwd.z);
    if (st.heading < 0) st.heading += Math.PI * 2;
    {
      const hl = Math.hypot(fwd.x, fwd.z) || 1;
      const hrx = -fwd.z / hl, hrz = fwd.x / hl;   // where the right wing would point if level
      const cosR = right.x * hrx + right.z * hrz;
      const sinR = -right.y;
      st.roll = Math.atan2(sinR, cosR);
    }
    st.p = extra.p || 0; st.q = extra.q || 0; st.r = extra.r || 0;
    st.tas = extra.tas !== undefined ? extra.tas : st.groundSpeed;
    const rho = this.atmosphere.density(st.alt);
    // indicated airspeed comes from the pitot: the forward component only (a tailwind on a
    // parked aircraft reads zero, not the wind speed)
    const pitot = extra.uFwd !== undefined ? Math.max(0, extra.uFwd) : st.tas;
    st.ias = pitot * Math.sqrt(rho / 1.225) / KTS;
    st.tasKts = st.tas / KTS;
    st.alpha = extra.alpha || 0; st.beta = extra.beta || 0;
    st.mach = st.tas / 340;
    st.track = st.groundSpeed > 0.5 ? Math.atan2(st.vx, -st.vz) : st.heading;
    if (st.track < 0) st.track += Math.PI * 2;
    st.gamma = st.groundSpeed > 0.5 ? Math.atan2(st.vy, st.groundSpeed) : 0;
    st.gLoad = this._gFilt;
    st.n1[0] = this.engines[0].n1; st.n1[1] = this.engines[1].n1;
    st.thrust = extra.totalThrust || 0;
    st.flapDeg = this.flapDeg; st.flapIndex = this.input.flapIndex;
    st.gearPos = this.gearPos; st.gearDown = this.gearPos > 0.98; st.gearInTransit = this.gearPos > 0.02 && this.gearPos < 0.98;
    st.speedbrake = this.speedbrakePos; st.speedbrakeArmed = this.input.speedbrakeArmed;
    st.reverser = this.reverserPos; st.reverseSelected = this.input.reverse;
    st.trim = this.input.trim;
    st.elevator = this.surfaces.elevator; st.aileron = this.surfaces.aileron; st.rudder = this.surfaces.rudder;
    st.throttle = this.input.throttle; st.brake = this.brakeApplied; st.autobrake = this.input.autobrake;
    st.brakeTemp = this.brakeTemp;
    const wheels = Object.values(this.gear);
    st.wheelsOnGround = wheels.filter((g) => g.onGround).length;
    st.onGround = !this.airborne;
    st.mainsOnGround = this.gear.left.onGround && this.gear.right.onGround;
    st.noseOnGround = this.gear.nose.onGround;
    st.surface = this.terrain.surfaceAt(st.x, st.z);
    st.anyOnRunway = st.surface === 'runway';
    st.skidding = this.skidding;
    st.stallWarning = this.stallWarning; st.stalled = this.stalled;
    st.aStallDeg = extra.aStallDeg || 13;
    st.CL = extra.CL || 0; st.CD = extra.CD || 0; st.qbar = extra.qbar || 0;
    st.vref = this.currentVref();
    st.gearCollapsed = this.damage.gearCollapsed; st.collapsedGear = this.damage.collapsedGear; st.destroyed = this.damage.destroyed;
    st.time = this.time;

    // wind (FROM direction)
    const wind = extra.wind || this.wind;
    const wdir = Math.atan2(-wind[0], wind[2]);
    st.windDirDeg = ((wdir / DEG) + 360) % 360;
    st.windKts = Math.hypot(wind[0], wind[2]) / KTS;
    const hx = Math.sin(st.heading), hz = -Math.cos(st.heading);
    st.headwind = -(wind[0] * hx + wind[2] * hz) / KTS;         // + = headwind
    st.crosswind = -(wind[0] * (-hz) + wind[2] * hx) / KTS;     // + = from the right

    // --- approach geometry relative to the runway (landing direction from heading)
    const rwyHdg = RUNWAY.headingDeg * DEG;
    let dHdg = st.heading - rwyHdg; while (dHdg > Math.PI) dHdg -= 2 * Math.PI; while (dHdg < -Math.PI) dHdg += 2 * Math.PI;
    const landingWest = Math.abs(dHdg) <= Math.PI / 2;
    st.landingDirection = landingWest ? RUNWAY.ident : RUNWAY.reciprocal;
    const thresholdX = landingWest ? RUNWAY.thresholdX : -RUNWAY.thresholdX;
    st.alongRunway = landingWest ? (thresholdX - st.x) : (st.x - thresholdX); // + past the threshold
    st.distFromThreshold = st.alongRunway;
    st.distToThreshold = -st.alongRunway;
    st.lateralOffset = landingWest ? -st.z : st.z;  // + = right of the centreline
    const dirHdg = landingWest ? rwyHdg : rwyHdg - Math.PI;
    let crab = st.heading - dirHdg; while (crab > Math.PI) crab -= 2 * Math.PI; while (crab < -Math.PI) crab += 2 * Math.PI;
    st.crabDeg = crab / DEG;
    // ILS-like deviations
    const locAntennaAlong = RUNWAY.length + 300;
    const dAlong = locAntennaAlong - st.alongRunway;
    st.locDev = Math.atan2(st.lateralOffset, Math.max(dAlong, 50)) / DEG;   // + = right of centreline
    const gsAntennaAlong = RUNWAY.papiDistance;
    const dGs = gsAntennaAlong - st.alongRunway;
    const hAboveThr = st.alt - RUNWAY.elevation;
    st.gsAngle = dGs > 100 ? Math.atan2(hAboveThr, dGs) / DEG : RUNWAY.glideslopeDeg;
    st.gsDev = st.gsAngle - RUNWAY.glideslopeDeg;                          // + = above
    st.gsAltitude = Math.tan(RUNWAY.glideslopeDeg * DEG) * Math.max(dGs, 0);
    st.onRunwayStrip = Math.abs(st.z) <= RUNWAY.width / 2 && Math.abs(st.x) <= RUNWAY.length / 2;
    st.beyondRunwayEnd = st.alongRunway > RUNWAY.length;
    st.gearLoads[0] = this.gear.nose.load; st.gearLoads[1] = this.gear.left.load; st.gearLoads[2] = this.gear.right.load;
    st.gearCompression[0] = this.gear.nose.compression; st.gearCompression[1] = this.gear.left.compression; st.gearCompression[2] = this.gear.right.compression;
    st.noseSteer = this.gear.nose.steer;
    if (this._hullTouching) { this._hullTouchTimer -= dt; if (this._hullTouchTimer <= 0) this._hullTouching = false; }
    return st;
  }
}
