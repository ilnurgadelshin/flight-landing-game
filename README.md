# Boeing 737-800 Landing Simulator

A browser-based final-approach and landing simulator for the Boeing 737-800,
built with plain HTML/CSS/JavaScript, [Three.js](https://threejs.org) for the
3D world and cockpit, and [cannon-es](https://github.com/pmndrs/cannon-es) as
the rigid-body physics engine. No build step, no server-side code.

You sit in the captain's seat on final approach to runway 27 of a fictional
airport, fly the ILS down a 3° glideslope, flare, touch down in the touchdown
zone, and stop the aircraft — in clear weather, a strong tailwind, a heavy
crosswind, or a severe storm with 900 m visibility. The landing is graded, and
mistakes have consequences: hard landings, gear collapse, belly landings,
runway excursions and overruns are all simulated.

## Running it

The game uses ES modules, so it must be served over HTTP (browsers block
module imports from `file://`). Any static server works:

```bash
npm start                      # http-server on http://localhost:8080
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a current Chrome, Edge, Firefox or Safari.
Everything (Three.js, cannon-es) is vendored in `vendor/`, so it also works
offline and can be hosted on any static host (GitHub Pages, S3, …).

## How to play

1. Pick a mode: **Flight School** (guided onboarding, instructor hints and a
   flight director, clear weather) or **Fly the Approach** (choose the
   conditions, get graded).
2. Pick the **landing conditions** and the **starting point** (4 nm short
   final fully configured, 10 nm standard final, or a 26 nm full approach).
3. Fly the ILS: keep the magenta localizer and glideslope diamonds centred,
   the airspeed at Vref + 5 (147 kts with flaps 30), and the PAPI showing two
   white and two red lights.
4. Configure on the way down: flaps 5 → 15 → 30, gear down at glideslope
   intercept, arm the speedbrakes, set the autobrake.
5. At "thirty" raise the nose 2–3°, close the throttles, touch down in the
   touchdown zone, reversers, brakes, stop.
6. Not stable below 500 ft? **Go around**: TOGA, pitch up, gear up, flaps 15,
   then reposition on final or fly a visual circuit.

### Controls (laptop keyboard + mouse)

| Control | Keys |
| --- | --- |
| Pitch | `↑` / `↓` (or mouse yoke: click the window to engage, `Esc` to release) |
| Roll | `←` / `→` (or mouse yoke) |
| Rudder / nose-wheel steering | `A` / `D` — essential for crosswind landings |
| Throttle | `W` up / `S` down · `T` = TOGA (go-around thrust) |
| Flaps | `F` extend one notch · `V` retract one notch |
| Landing gear | `G` |
| Speedbrakes / spoilers | `Space` extend/retract · `X` arm for automatic deployment at touchdown |
| Wheel brakes | `B` (hold) · `N` cycles the autobrake OFF/1/2/3/MAX |
| Thrust reversers | `R` (hold, ground only) |
| Trim | `[` / `]` or `PageUp` / `PageDown` (a trim follow-up also runs the stabiliser after a sustained input) |
| Look down at the pedestal | `L` (hold) · right-mouse drag to look around |
| Reposition on final (after a go-around) | `Backspace` |
| Pause / Flight School / menu | `P` / `H` / `Esc` |

The pitch axis defaults to "game style" (up arrow / mouse up = nose up). Tick
*Pilot-style pitch* in the menu for the yoke convention (push forward = nose
down).

## What is simulated

**Flight dynamics** (`js/physics/aircraft.js`): a 6-DOF rigid body in
cannon-es with realistic 737-800 mass and inertia, driven by a
coefficient-based aerodynamic model — lift curve with a smooth stall per flap
setting, induced and parasite drag (flaps, gear, spoilers), ground effect,
pitch/roll/yaw stability and control derivatives, a yaw damper, engine spool
dynamics with reverse thrust, a progressive oleo landing gear with tyre
cornering and braking friction (dry / wet / grass), nose-wheel steering,
anti-skid, autobrake, and a collision hull for tail, wing, nacelle and belly
strikes. The physics runs at a fixed 120 Hz through a frame-time accumulator,
so it is independent of the rendering frame rate.

**Atmosphere** (`js/physics/atmosphere.js`): ISA density, a wind boundary
layer, gusts and Dryden-style turbulence; each scenario sets these directly.

**World** (`js/world/`): terrain, an airport with a 3000 m × 45 m runway with
ICAO markings, ALSF-2 approach lights with sequenced flashers, threshold,
edge, centreline and touchdown-zone lights, a PAPI computed from the pilot's
eye position, taxiways, buildings, a town, forests, clouds, rain, fog and
lightning.

**Cockpit** (`js/cockpit/`): a first-person 737 flight deck with a PFD
(attitude, airspeed and altitude tapes, vertical speed, ILS deviation,
heading, flight director), navigation display, engine display (N1, EGT, flap
gauge, gear lights, speedbrake and autobrake annunciations), a systems page,
animated thrust / reverse / speedbrake / flap levers, gear lever, trim wheels,
yokes and windshield wipers.

**Warnings and callouts** (`js/gpws.js`, `js/audio.js`): synthesised engine,
wind, rain and rolling sounds; altitude callouts (2500 … 10), "approaching
minimums", "minimums", "sink rate", "pull up", "too low gear / flaps /
terrain", "glideslope", "bank angle", "terrain", stall warning with a stick
shaker, gear configuration horn, flap overspeed.

**Evaluation** (`js/evaluate.js`): touchdown point, vertical speed, centreline,
speed, alignment (crab and bank), configuration and stopping are scored;
failures produce the matching outcome (crash, gear collapse, belly landing,
runway excursion, overrun, landed short, missed the runway).

## Testing

```bash
npm test          # physics test-suite in Node (no browser needed, ~2 min)
npm run test:e2e  # browser QA with Playwright + headless Chromium (~25 min)
```

`test/physics.test.mjs` checks trim stability, frame-rate independence,
control geometry, a realistic stall, crosswind drift, successful autolands
in every scenario and every starting point (flown by a test pilot that uses
only the same input channels as a human), and the failure cases (gear up,
no flare, pushed into the runway, no brakes, beside the runway, no decrab,
too fast) plus a go-around and reposition.

`test/e2e.mjs` loads the real page, drives the menu, presses every mapped key
and moves the mouse yoke, walks through all Flight School steps, autolands in
each scenario by day and night while checking that the voice callouts and
sounds fired, provokes each failure mode, flies a keyboard-only go-around and
a keyboard-only landing, and verifies that simulated time tracks wall time
regardless of the frame rate. Screenshots land in `test/output/`.
