# Boeing 737-800 Landing Simulator

**Play it in the browser: https://ilnurgadelshin.github.io/flight-landing-game/**

A browser-based final-approach and landing simulator for the Boeing 737-800,
built with plain HTML/CSS/JavaScript, [Three.js](https://threejs.org) for the
3D world and cockpit, and [cannon-es](https://github.com/pmndrs/cannon-es) as
the rigid-body physics engine. No build step, no server-side code.

You sit in the captain's seat on final approach to runway 27 of a fictional
airport, Westhaven International, fly the ILS down a 3° glideslope, flare,
touch down in the touchdown zone and stop the aircraft, in clear weather, a
strong tailwind, a heavy crosswind or a severe storm with 900 m visibility.
The landing is graded, and mistakes have consequences: hard landings, gear
collapse, belly landings, runway excursions and overruns are all simulated.

## Project goal

The aim is a realistic, interactive landing simulator for the most demanding
few minutes of an airliner flight, playable on an ordinary laptop:

- **Realistic heavy-airliner handling.** A 62-tonne aircraft with the 737-800's
  mass, inertia, flap schedule and engines: slow to respond, energy that has to
  be managed with thrust and pitch, a real flare, and ground handling that
  weathervanes in a crosswind.
- **Conditions that change the physics, not just the scenery.** Each scenario
  sets the wind, gusts, turbulence, visibility, cloud, rain and runway friction
  that the flight model and the tyres actually use.
- **Consequences.** Touchdown point, sink rate, centreline, speed, alignment,
  configuration and stopping are graded; getting it wrong ends in a hard landing,
  a collapsed gear, a belly landing, an excursion, an overrun or a crash.
- **A believable flight deck.** A first-person 737 cockpit with working
  displays, levers and warnings, a runway with ICAO markings, approach lights
  and a PAPI computed from the pilot's eye, weather and night lighting.
- **Accessible.** Laptop keyboard and mouse controls, a skippable Flight School
  that walks through every instrument and control, instructor hints and a flight
  director.
- **Verified by playing it.** Frame-rate-independent physics, automated test
  suites, and scripted playtests that fly every scenario the way a new player
  would, with the findings fixed and replayed (see
  [Testing](#testing) and `test/PLAYTEST-FINDINGS.md`).

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
offline and can be hosted on any static host.

### GitHub Pages

The live site is served from the `gh-pages` branch, which holds only the game
files (`index.html`, `css/`, `js/`, `vendor/`) and an empty `.nojekyll` so
GitHub serves them as-is. All asset paths are relative, so the game runs from
the `/flight-landing-game/` sub-path unchanged. To publish the current `main`:

```bash
git fetch origin gh-pages
git worktree add ../flight-landing-game-site gh-pages
rm -rf ../flight-landing-game-site/css ../flight-landing-game-site/js ../flight-landing-game-site/vendor
cp -R index.html css js vendor ../flight-landing-game-site/
git -C ../flight-landing-game-site add -A
git -C ../flight-landing-game-site commit -m "Publish main $(git rev-parse --short HEAD)"
git -C ../flight-landing-game-site push origin gh-pages
git worktree remove ../flight-landing-game-site
```

GitHub rebuilds the site within a minute or two of the push ("pages build and
deployment" in the Actions tab).

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

## Scenarios and starting points

Every scenario changes the physics: the wind and gusts drive the flight model,
the visibility and cloud drive what you can see, and a wet runway lowers the
tyre friction.

| Landing conditions | Wind | Visibility and cloud | Runway |
| --- | --- | --- | --- |
| Clear Weather | 260° / 6 kts | 40 km, scattered cumulus, day | dry |
| Strong Tailwind | 090° / 18 kts, gusts +4 | 25 km, deck 2500–4000 ft | dry |
| Heavy Crosswind | 350° / 28 kts, gusts +8 | 20 km, deck 1500–2600 ft | dry |
| Severe Storm | 320° / 22 kts, gusts +14 | 900 m in heavy rain, base 260 ft, dusk, lightning | wet |

| Starting point | Distance and height | Configuration | Duration |
| --- | --- | --- | --- |
| Short final | 4 nm, 1300 ft, 145 kts | flaps 30, gear down | about 2 min |
| Standard final | 10 nm, 3000 ft, 175 kts | flaps 5, gear up | about 5 min |
| Full approach | 26 nm, 7000 ft, 210 kts | flaps 1, gear up | about 12 min |

The **Night** option in the menu flies any of these after dark.

## Project structure

| Path | Contents |
| --- | --- |
| `index.html`, `css/style.css` | Page, menu, HUD, Flight School and results overlays |
| `js/main.js` | Boot, render loop, test hooks (`window.__sim`) |
| `js/game.js` | Game state machine, go-around logic, instructor hints, debrief |
| `js/sim.js` | Fixed 120 Hz simulation loop and approach placement |
| `js/config.js` | Aircraft data, runway, scenarios and starting points |
| `js/physics/` | Flight model and landing gear (`aircraft.js`), atmosphere and wind, terrain |
| `js/world/` | Terrain, airport, runway textures, airfield lights and PAPI, weather |
| `js/cockpit/` | 3D flight deck and the canvas-drawn displays |
| `js/input.js`, `js/audio.js`, `js/gpws.js` | Keyboard and mouse yoke, synthesised sound and voice, warning system |
| `js/evaluate.js` | Landing grading and outcomes |
| `js/autopilot.js` | Test pilot used by the tests and the autoland demo |
| `vendor/` | Three.js and cannon-es (no install needed to play) |
| `test/` | Test suites, playtest harness and findings (below) |

## Testing

### Setup

The physics suite needs only Node.js 18 or newer. The browser tests use
Playwright with headless Chromium:

```bash
npm install
npx playwright install chromium
```

The browser tests start their own local web server and force software
rendering (SwiftShader), so they run the same on any machine, with or without a
GPU, at about 1–5 rendered frames per second.

### Automated suites

| Command | What it checks | Time |
| --- | --- | --- |
| `npm test` | Physics in Node, no browser: 62 checks in 12 groups (below) | ~3 min |
| `npm run test:e2e` | The real page in Chromium: 96 checks in 9 groups (below) | 15–25 min |
| `node test/e2e.mjs quick` | The same without the slow mouse-yoke landing (E9) | 10–20 min |
| `node test/e2e.mjs only=<group>` | E1 plus one group: `menu`, `keys`, `school`, `land`, `fail`, `ga`, `fps` or `keyboard` | 1–10 min |
| `npm run test:all` | Both suites | 20–30 min |
| `node test/robustness.mjs` | 18 short-final autolands, crosswind and storm with 9 gust seeds each; prints each result as a report, not pass/fail | under a minute |

`test/physics.test.mjs` flies the aircraft in Node and checks:

1. trimmed hands-off flight is stable;
2. the physics gives the same result at 30 and 144 frames per second;
3. pitch, roll and rudder inputs move the aircraft the right way;
4. idle thrust with full back stick stalls it and the nose drops;
5. an uncorrected crosswind drifts it off the centreline;
6. an autoland succeeds in every scenario;
7. the short-final and full-approach starts are flyable;
8. gear up, no flare, a push into the runway, no brakes, landing beside the
   runway, no decrab and landing too fast each produce the right outcome;
9. a go-around climbs away and the reposition works;
10. leaving the runway at speed collapses the gear;
11. hands off in a crosswind the aircraft weathervanes into the wind, and pedal
    inputs hold the roll-out within 2° of the runway heading;
12. the Flight School flight director computes its guidance on its own copy of
    the controls and never moves the aircraft's, from the approach to the stop.

The autolands are flown by a test pilot (`js/autopilot.js`) that uses only the
controls a player has.

`test/e2e.mjs` drives the real page:

- **E1** loads the page with a working WebGL renderer and no errors.
- **E2** chooses the mode, conditions and start with the mouse and starts the approach.
- **E3** presses every mapped key and checks the control it drives.
- **E4** walks through every Flight School step.
- **E5** autolands in every scenario by day and night and checks the callouts and sounds.
- **E6** provokes the failures and checks the warnings and outcomes.
- **E7** flies a keyboard-only go-around from 500 ft and repositions, in Fly the Approach and in Flight School.
- **E8** checks that simulated time follows wall time at any frame rate.
- **E9** lands with real mouse-yoke and keyboard events.

Screenshots go to `test/output/`.

### Playtesting all 12 scenarios

`test/playtest.mjs` plays the game the way a new player would and records
everything a reviewer needs to judge the visuals, the physics and the gameplay
at every step. For each scenario it:

1. clicks the mode, conditions, start point and night option in the menu, and in
   Flight School reads all 13 pages;
2. clicks the window to engage the mouse yoke and hands control to a human-like
   pilot (`test/human-pilot.browser.js`). The pilot runs inside the page and only
   produces mouse moves and key presses. It configures on schedule, flies the
   glideslope and localizer, flares, steers the roll-out, and makes the scenario's
   deliberate mistake, if any;
3. slows the simulation to match the software frame rate, typically 0.3×, so the
   pilot still reacts about 10 times per simulated second;
4. stops at every checkpoint to take a screenshot of the live view, then pauses
   with `P` and records the full state.

The checkpoints are:

- flaps 15 selected, gear down and flaps 30 (10 nm and 26 nm starts only);
- 1000 ft, 500 ft, 200 ft (minimums) and 50 ft;
- the flare, the touchdown and the roll-out through 80 kts;
- the stop and the results screen.

The go-around scenario adds three more: go-around initiated, climbing and
repositioned. At 1000 ft and at minimums the harness also captures the left
window, and at 500 ft and gear-down the view down at the pedestal.

Run all 12, or any comma-separated subset:

```bash
node test/playtest.mjs                            # all 12, about 3 hours on 4 CPU cores
node test/playtest.mjs clear,crosswind,gearup     # a subset, in this order
```

A short-final run takes 10–15 minutes, a 10 nm run 20–25 minutes and the
26 nm approach about an hour.

| # | Run | Mode, conditions, start | What the pilot does | What to check / expected outcome |
| --- | --- | --- | --- | --- |
| 1 | `training` | Flight School, clear, 10 nm | Reads all 13 school pages, then flies the approach with the instructor and flight director | Highlights point at the right controls; hints match the phase ("Nicely stable", "Flare!", "Rolling out"); the landing checklist ticks off. Lands, grade B or better |
| 2 | `clear` | Game, clear, 10 nm | Flaps 5 → 15 → gear → 30, arms the speedbrakes, autobrake 3, flies the ILS | Starts in trim; no flap overspeed; the yoke stays engaged after each pause; the MCP follows the flap setting. Lands and stops near the centreline |
| 3 | `tailwind` | Game, 18 kt tailwind, 4 nm | Flies the ILS with the tailwind | Ground speed about 15 kts above the airspeed; longer float and roll-out (about 1.3–1.5 km); airspeed reads 0 when stopped. Lands |
| 4 | `crosswind` | Game, 28 kt crosswind, 10 nm | Crabs down the approach, kicks it straight in the flare, holds the roll-out with the pedals | Starts above the sunlit cloud tops and breaks out below the base; crab about 8–10°; the runway sits to the side of the nose until the decrab. Lands and stops on the runway |
| 5 | `storm` | Game, severe storm, 10 nm | Flies the ILS in cloud and rain to minimums | Uniform murk inside the cloud with no false horizon; approach and runway lights emerge at minimums through the rain; wet runway. Lands |
| 6 | `night` | Game, clear, night, 4 nm | Flies the approach by the lights | Approach-light ladder, green threshold, edge and centreline lights, PAPI, town lights, stars and a lit panel. Lands |
| 7 | `goaround` | Game, clear, 4 nm | Calls a go-around at 300 ft: TOGA, pitch up, gear up, flaps 15, repositions above 1500 ft, lands on the second approach | "Go around, flaps fifteen" callout and mode message; climb at about 2500–3000 fpm; the debrief counts the go-around. Lands |
| 8 | `gearup` | Game, clear, 4 nm, gear left up | Never lowers the gear | "Too low, gear" from 500 ft and the configuration horn; belly landing with an engine strike, a slide of about 1 km, spoilers not deployed. Belly landing, 15/100 |
| 9 | `noflare` | Game, clear, 4 nm | Flies the 3° path into the runway without flaring | Arrives mains-first at about 650–700 fpm; the ground spoilers deploy when reverse is selected. Hard landing, grade D |
| 10 | `overrun` | Game, tailwind, 4 nm | Floats past the touchdown zone, no brakes, no reversers, no autobrake | The aircraft tracks straight but cannot stop in the tailwind. Runway overrun at about 80 kts |
| 11 | `stall` | Game, clear, 4 nm | Below 250 ft: thrust to idle and full back pressure | Stick shaker, "Stall, stall" and the red STALL banner; "Sink rate" and "Pull up". Impact short of the runway, 0/100 |
| 12 | `full` | Game, clear, 26 nm from 7000 ft | Descends, slows and configures from flaps 1, then flies the ILS | Starts at 210 kts indicated; reaches the glideslope by about 8 nm; the configuration schedule runs on time. Lands |

Each run writes to `test/output/playtest/<run>/`:

- `diary.md`: at every checkpoint the speeds, heights, attitude, engines,
  configuration, ILS and PAPI, wind and crosswind, instructor and warning
  captions, the voice callouts and the game events since the last checkpoint,
  then the debrief and the pilot's actions;
- numbered screenshots of the live view, the side window and the pedestal, and
  the results screen;
- `pfd-*.png` and `eng-*.png`: full-resolution dumps of the primary flight
  display and the engine display at the start, 500 ft, the flare and the stop;
- `trace.json`: the pilot's inputs and the aircraft state once per simulated
  second.

To review a run, read the diary top to bottom and open each checkpoint's
screenshot beside it. Ask at each step whether the picture, the numbers, the
callouts and the instructor agree with each other and with what a real
approach looks like at that point.

The human-like pilot flares a little late, so its touchdowns are usually firm,
about 450–700 fpm. The autoland tests and E9 flare earlier and land softly. The
results of two full playtest rounds, every issue found and how it was fixed,
are in [`test/PLAYTEST-FINDINGS.md`](test/PLAYTEST-FINDINGS.md).

### Visual review

`test/visual-tour.mjs` captures the view at every stage of an autoland in each
scenario, by day and night: 10 nm, 4 nm with the left, right and pedestal
views, 1.5 nm, 200 ft, 50 ft, the roll-out, the stop and the results. The
frames go to `test/output/visual/`.

```bash
node test/visual-tour.mjs                  # all scenarios, day and night
node test/visual-tour.mjs storm night      # one scenario at night
```

`test/screenshot.mjs <scenario> <start> [seconds]` takes a single screenshot
after flying with the autopilot for the given time.
