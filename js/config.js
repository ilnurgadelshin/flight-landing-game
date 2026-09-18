// ---------------------------------------------------------------------------
// Boeing 737-800 landing simulator — shared constants and scenario definitions
// All physics is SI (metres, kilograms, seconds, newtons, radians).
// World frame: +X = east, +Y = up, +Z = south (so north = -Z). Heading is
// measured clockwise from north, direction = (sin ψ, 0, -cos ψ).
// Aircraft body frame (cannon/three local axes): +X = right wing, +Y = up,
// +Z = tail (nose points along -Z).
// ---------------------------------------------------------------------------

export const KTS = 0.514444;     // m/s per knot
export const FT = 0.3048;        // metres per foot
export const FPM = 0.00508;      // m/s per foot-per-minute
export const NM = 1852;          // metres per nautical mile
export const DEG = Math.PI / 180;
export const RHO0 = 1.225;       // sea-level air density kg/m^3
export const G = 9.81;

export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

// ---------------------------------------------------------------------------
// Aircraft: Boeing 737-800 at a typical landing weight
// ---------------------------------------------------------------------------
export const AIRCRAFT = {
  name: 'Boeing 737-800',
  mass: 62000,                 // kg (MLW is 66,360 kg)
  wingArea: 124.6,             // m^2
  wingSpan: 34.32,             // m
  chord: 4.17,                 // mean aerodynamic chord, m
  // Moments of inertia about aero axes (kg m^2): roll (about longitudinal),
  // pitch (about lateral), yaw (about vertical).
  inertia: { roll: 1.25e6, pitch: 2.75e6, yaw: 3.9e6 },

  // Engines: 2 x CFM56-7B
  engines: {
    count: 2,
    maxThrust: 110000,         // N per engine (sea level, static)
    idleN1: 0.21,
    reverseMaxN1: 0.85,
    reverseFraction: 0.42,     // fraction of forward thrust available in reverse
    thrustArmY: -1.4,          // engine thrust line below CG (m) -> nose-up moment with thrust
    // spool dynamics (first order), seconds
    tauUpLow: 3.2,             // slow spool below ~55 % N1
    tauUpHigh: 1.1,            // fast above
    tauDown: 1.6,
  },

  // Flap detents (degrees) and their aerodynamic effects
  flapDetents: [0, 1, 5, 15, 30, 40],
  flapMoveRate: 3.0,           // deg/s
  flaps: {
    // per detent, indexed by detent number
    dCL0: [0.0, 0.12, 0.30, 0.50, 0.75, 0.85],
    dCD0: [0.0, 0.004, 0.013, 0.032, 0.070, 0.095],
    dCm0: [0.0, -0.03, -0.07, -0.13, -0.22, -0.26],
    alphaStallDeg: [16.5, 16.0, 15.5, 15.0, 14.0, 13.5],
    // maximum IAS per detent (kts) — used for warnings and for the airspeed tape flap limits
    vfe: [340, 250, 250, 200, 175, 162],
  },

  aero: {
    CL0: 0.20,       // lift at zero alpha, clean
    CLa: 5.2,        // per rad
    CLq: 4.5,        // pitch-rate lift
    CLde: 0.30,      // elevator lift
    CD0: 0.022,
    K: 0.045,        // induced drag factor (1 / (pi AR e))
    dCD_gear: 0.020,
    dCD_speedbrakeFlight: 0.045,
    dCD_speedbrakeGround: 0.10,
    dCL_speedbrakeFlight: -0.12,
    dCL_speedbrakeGround: -0.60,   // lift dump
    Cm0: 0.05,
    Cma: -1.45,
    Cmq: -24.0,
    Cmde: -0.95,     // per rad of elevator; negative => trailing-edge-down elevator pitches nose down
    CYb: -0.90,
    CYdr: 0.20,
    Clb: -0.12,
    Clp: -0.46,
    Clr: 0.10,
    Clda: 0.085,
    Cldr: 0.012,
    Cnb: 0.16,
    Cnp: -0.08,
    Cnr: -0.26,
    Cnda: 0.006,
    Cndr: -0.105,
    // post-stall shaping
    stallWidthDeg: 6.0,    // how many degrees past alpha_stall the lift collapses over
    postStallCLfrac: 0.55, // CL retained deep in the stall relative to CLmax
  },

  controls: {
    maxElevatorDeg: 25,
    maxAileronDeg: 20,
    maxRudderDeg: 25,
    maxTrimDeg: 16,
    trimRateDegPerSec: 1.2,
    surfaceRate: 3.5,    // how fast the control surfaces follow the input (1/s)
    yawDamperGain: 1.4,  // artificial yaw damping (rudder per rad/s of yaw rate)
  },

  // Landing gear geometry (body frame; y is the fuselage attachment height)
  gear: {
    retractTime: 8.0,   // s
    // attach point, strut rest length (m), stiffness (N/m), damping (N s/m), max travel (m)
    // struts are progressive gas springs: F = k x (1 + 3 (x/travel)^2) + c dx/dt
    nose: { pos: [0, -1.55, -13.2], rest: 1.95, k: 5.0e5, c: 7.0e4, travel: 0.45, steerMaxDeg: 14 },
    left: { pos: [-2.86, -1.55, 1.6], rest: 1.95, k: 1.25e6, c: 1.6e5, travel: 0.55 },
    right: { pos: [2.86, -1.55, 1.6], rest: 1.95, k: 1.25e6, c: 1.6e5, travel: 0.55 },
    bottomOutK: 2.0e7,
    // vertical touchdown speeds (m/s, positive down)
    firmSink: 1.5,      // ~300 fpm  -> firm
    hardSink: 3.05,     // ~600 fpm  -> hard landing (structural inspection)
    collapseSink: 4.6,  // ~900 fpm  -> gear collapse
    maxCrabDeg: 11,     // gear side-load limit
  },

  tyres: {
    muDry: 0.80,
    muWet: 0.42,
    muGrass: 0.45,
    rollingRunway: 0.012,
    rollingGrass: 0.09,
    brakeMuFrac: 0.62,      // max braking friction as fraction of tyre mu (anti-skid keeps it below the peak)
    corneringSlipPeakRad: 0.14,
  },

  // Collision hull (body frame) used for belly / nacelle / tail / wing strikes.
  // The fuselage tapers aft so a tail strike happens at ~10° pitch with the
  // struts compressed, nacelle strike at ~7° bank, wing tip at ~10° bank.
  hull: {
    fuselage: { half: [1.9, 1.9, 11.5], pos: [0, 0, -2.9] },
    nose:     { half: [1.2, 1.3, 2.6], pos: [0, -0.3, -17.0] },
    tail:     { half: [1.4, 0.9, 2.7], pos: [0, -0.15, 11.3] },
    tail2:    { half: [0.9, 0.7, 2.8], pos: [0, 0.5, 16.8] },
    engL:     { half: [1.1, 0.9, 2.6], pos: [-5.75, -1.45, -1.0] },
    engR:     { half: [1.1, 0.9, 2.6], pos: [5.75, -1.45, -1.0] },
    wingL:    { half: [4.0, 0.25, 2.6], pos: [-6.0, -0.9, 2.0] },
    wingR:    { half: [4.0, 0.25, 2.6], pos: [6.0, -0.9, 2.0] },
    wingTipL: { half: [3.6, 0.2, 1.6], pos: [-13.6, -0.15, 3.6] },
    wingTipR: { half: [3.6, 0.2, 1.6], pos: [13.6, -0.15, 3.6] },
  },

  pilotEye: [-0.52, 0.55, -12.3], // left-seat eye point relative to CG

  // Reference speeds (kts) at this weight
  vref30: 142,
  vref40: 138,
  vref15: 152,
  stallClean: 135,
};

// ---------------------------------------------------------------------------
// Airport / runway
// ---------------------------------------------------------------------------
export const RUNWAY = {
  ident: '27',            // landing runway (aircraft flies heading 270 = west)
  reciprocal: '09',
  headingDeg: 270,
  length: 3000,
  width: 45,
  elevation: 0,
  // centre of the runway is at the world origin; threshold of 27 is at +X
  thresholdX: 1500,
  // touchdown zone (from threshold) for a "good" landing
  tdzStart: 150,
  tdzIdeal: 300,
  tdzEnd: 900,
  papiDistance: 320,      // m from threshold
  papiOffset: 45,         // m left of centreline (looking along the landing direction)
  glideslopeDeg: 3.0,
  thresholdCrossingHeight: 15, // m (50 ft)
  approachLightLength: 900,
  tdzLightsLength: 900,
  name: 'Fable International (FBL)',
};

// ---------------------------------------------------------------------------
// Scenarios — these directly set the atmosphere / physics parameters
// ---------------------------------------------------------------------------
export const SCENARIOS = {
  clear: {
    id: 'clear',
    name: 'Clear Weather',
    tagline: 'Calm winds, unlimited visibility. Learn the aircraft.',
    windDirDeg: 260, windKts: 6, gustKts: 0,
    turbulence: 0.0,
    visibility: 40000, cloudBase: 99999,
    rain: 0, wet: false, lightning: false,
    timeOfDay: 'day',
    icon: '☀️',
  },
  tailwind: {
    id: 'tailwind',
    name: 'Strong Tailwind',
    tagline: '18 kt tailwind. High ground speed, long float, brakes get hot.',
    windDirDeg: 90, windKts: 18, gustKts: 4,
    turbulence: 0.25,
    visibility: 25000, cloudBase: 2500,
    rain: 0, wet: false, lightning: false,
    timeOfDay: 'day',
    icon: '💨',
  },
  crosswind: {
    id: 'crosswind',
    name: 'Heavy Crosswind',
    tagline: '28 kt crosswind from the north. Crab in, kick it straight with rudder.',
    windDirDeg: 350, windKts: 28, gustKts: 8,
    turbulence: 0.5,
    visibility: 20000, cloudBase: 1500,
    rain: 0, wet: false, lightning: false,
    timeOfDay: 'day',
    icon: '↔️',
  },
  storm: {
    id: 'storm',
    name: 'Severe Storm',
    tagline: 'Heavy rain, 900 m visibility, gusts to 40 kt, wet runway. Fly the ILS.',
    windDirDeg: 320, windKts: 22, gustKts: 14,
    turbulence: 0.75,
    visibility: 900, cloudBase: 260,
    rain: 1, wet: true, lightning: true,
    timeOfDay: 'dusk',
    icon: '⛈️',
  },
};

// Approach starting positions (distance from threshold along the extended centreline)
export const APPROACH_STARTS = {
  short: { id: 'short', name: 'Short final', distanceNm: 4, altFt: 1300, iasKts: 145, flaps: 4, gear: true,
           desc: '4 nm, 1300 ft, fully configured. About 2 minutes.' },
  standard: { id: 'standard', name: 'Standard final', distanceNm: 10, altFt: 3000, iasKts: 175, flaps: 2, gear: false,
           desc: '10 nm, 3000 ft, flaps 5. Configure and intercept the glideslope. About 5 minutes.' },
  full: { id: 'full', name: 'Full approach', distanceNm: 26, altFt: 7000, iasKts: 210, flaps: 1, gear: false,
           desc: '26 nm, 7000 ft, flaps 1. Descend, slow down and configure. About 12 minutes.' },
};

export const DEFAULTS = {
  scenario: 'clear',
  start: 'standard',
  invertPitch: false,   // false: up-arrow / mouse-up = nose up. true: pilot yoke style.
  mouseSensitivity: 1.0,
};
