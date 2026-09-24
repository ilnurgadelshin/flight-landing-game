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
few minutes of an airliner flight, playable on an ordinary laptop, phone or
tablet:

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
- **Accessible.** Laptop keyboard and mouse controls, game controllers, on-screen
  touch controls, tilt steering and a head-up display on phones and tablets, a
  skippable Flight School that
  walks through every instrument and control, instructor hints and a flight
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
On a phone or tablet, open the same address (or the live link) and hold the
device in landscape; see [Phones and tablets](#controls-phones-and-tablets-landscape).
Everything (Three.js, cannon-es) is vendored in `vendor/`, so it also works
offline and can be hosted on any static host.

### GitHub Pages

The live site is served from the `gh-pages` branch, which holds only the game
files (`index.html`, `manifest.webmanifest`, `assets/`, `audio/`, `css/`, `icons/`, `js/`, `vendor/`) and an empty `.nojekyll` so
GitHub serves them as-is. All asset paths are relative, so the game runs from
the `/flight-landing-game/` sub-path unchanged. To publish the current `main`:

```bash
git fetch origin gh-pages
git worktree add ../flight-landing-game-site gh-pages
rm -rf ../flight-landing-game-site/assets ../flight-landing-game-site/audio ../flight-landing-game-site/css ../flight-landing-game-site/icons ../flight-landing-game-site/js ../flight-landing-game-site/vendor
cp -R index.html manifest.webmanifest assets audio css icons js vendor ../flight-landing-game-site/
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
   white and two red lights. In strong or gusty wind, add half the steady
   headwind plus the full gust, up to Vref + 20. Keep the gust part to
   touchdown. In turbulence, don't chase the airspeed: set the thrust and
   correct only the speed trend.
4. Configure on the way down: flaps 5 → 15 → 30, gear down at glideslope
   intercept, arm the speedbrakes, set the autobrake.
5. Below 100 ft, hold the approach attitude: the glideslope is too sensitive
   to chase that low, and in gusts the nose should not chase the vertical
   speed either. At "thirty" raise the nose 2–3°, close the throttles, touch
   down in the touchdown zone, reversers, brakes, stop. If a gust balloons
   you in the flare, hold the attitude and add a little thrust. Never push
   the nose down to regain the runway.
6. Not stable below 500 ft? **Go around**: TOGA, pitch up, gear up, flaps 15,
   then reposition on final or fly a visual circuit.

### Views

Both views are first-person, from the captain's eye point, so the runway
looks the same in each. The choice is remembered on the device.

- **Cockpit**: the 737 flight deck around you, with its displays and levers.
  The panel look tilts down to the displays and the pedestal.
- **Head-up** (`C`, **VIEW**, or the controller's right stick press): the
  flight deck is hidden and a head-up display is drawn over the outside world,
  like X-Plane's "forward with HUD" or a 737 flown on its head-up guidance
  system (HGS). It suits phones, where the flight deck takes half the screen,
  and it is lighter to draw.

The head-up display's symbols are conformal: each is drawn where it lies in
the world.

- **Horizon line**, with heading marks, and a **pitch ladder** every 5°
  (dashed below the horizon).
- **Aircraft reference** (the small gull wing): where the nose points.
- **Flight path marker** (the circle with wings): where the aircraft is
  actually going, including the wind's drift. To land, put it on the
  touchdown zone and keep it there.
- **−3° line**: on a normal approach the flight path marker sits on it.
- **Speed error tape** on the marker's left wing, in the landing
  configuration. It rises when fast and hangs below when slow; full length is
  15 kt. The **acceleration caret** beside it sits level with the wing when
  the speed is steady.
- **Runway outline** on the approach, useful in fog or rain.
- **Guidance cue** (Flight School's flight director): fly the marker into the
  circle.
- **FLARE** below 50 ft.

The speed, altitude, radio altitude, vertical speed, wind and ILS scales are
shown at the sides, as on a phone. The display leaves the view when you look
away. Flight School always shows the cockpit, because its pages point at the
flight deck.

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
| View: cockpit / head-up | `C` |
| Navigation display: range, mode | `,` / `.` shorter / longer range · `K` MAP → APP → PLN |
| ND view: lean in to the navigation display (from either view) | `J` · its buttons (or `,` `.` `K`) set the range and mode · `J`, ✕ or `C` goes back |
| Approach chart | `E` (also in the pause menu) · `Esc` closes it |
| Reposition on final (after a go-around) | `Backspace` |
| Pause / Flight School / menu | `P` / `H` / `Esc` |

The pitch axis defaults to "game style" (up arrow / mouse up = nose up). Tick
*Pilot-style pitch* in the menu for the yoke convention (push forward = nose
down).

### Controls (game controller)

Xbox, PlayStation, Switch Pro and most Bluetooth controllers are read through
the browser's Gamepad API, which Chrome, Edge, Firefox and Safari provide on
desktop and on phones (the automated tests run in Chromium with a simulated
controller). Connect one and press any of its buttons: browsers only reveal a
controller once it has been used. The
layout follows Microsoft Flight Simulator's default controller scheme. The
table uses Xbox names; PlayStation and Switch controllers are worded with their
own buttons throughout the game.

| Control | Controller |
| --- | --- |
| Pitch and roll | Left stick (stick up = nose up; tick *Pilot-style pitch* for push forward = nose down) |
| Rudder / nose-wheel steering | LT / RT, analog |
| Thrust | A (more) / B (less), held |
| Thrust reversers | On the ground at idle, keep holding B: reverse is selected and stays until A |
| Wheel brakes | X (hold) |
| Landing gear | Y |
| Flaps | LB up / RB down |
| Speedbrakes | D-pad →: tap to arm, hold to extend / retract |
| Autobrake | D-pad ← cycles OFF/1/2/3/MAX |
| Trim | D-pad ↑ nose down / ↓ nose up |
| TO/GA | View; pressed again during the go-around, it puts you back on final |
| Look around / views | Right stick (lets go straight ahead) · press it for the next view: cockpit → panel → head-up |
| Navigation display | Left stick press: tap for the next range, hold for the next mode (MAP → APP → PLN). In the head-up view it first leans in to the ND (the ND view); the right stick press goes back |
| Approach chart | Y in the pause menu; A, B or Y closes it |
| Pause, menus | Menu: start the approach from the menu, pause and resume, skip Flight School, fly again. In menus A confirms and B goes back; in Flight School A / B turn the pages |

- **Switching devices.** The controller is in use from its first press until a
  key, the mouse or a touch is used; the hints and Flight School follow the
  device in use.
- **Held buttons.** A button still held from the press that starts or resumes a
  flight does nothing until it is released, so the A that resumes does not also
  add thrust.
- **Unplugging.** Unplugging the controller mid-flight pauses the game.
- **Rumble** (Chrome and Edge, and Safari on a Mac): the controller rumbles for
  the gear locking down, the touchdown (harder for a harder landing), a crash and
  the stick shaker. *Vibration* in the menu turns it off.
- **Phones.** With a controller in use, the touch controls are hidden and the
  head-up display stays. Tilt steering, if it is on, waits while the controller
  is in use, so a phone tilted in a controller clip does not fly the aircraft.
- **iPhone and iPad** (a PS5 DualSense, PS4, Xbox, Switch Pro or MFi controller
  paired in Bluetooth settings). Safari reports these controllers in the
  standard layout, and the PlayStation ones are worded with their own buttons
  (✕ ○ □ △, Options, Create). The controller's first press counts as a tap in
  Safari. It starts the sound and keeps the screen awake while a controller is
  connected, so the game can be played without touching the screen. After a
  phone call or a trip to another app, the sound needs a tap on the screen,
  and the game says so. There is no rumble: Safari supports it only on a Mac.
  Safari keeps the PS button from iOS, and the game gives it nothing to do.
  Controllers do not work in Lockdown Mode.
- **Joysticks with their own layout.** They fly pitch and roll with their stick;
  use the keyboard for the rest.

### Controls (phones and tablets, landscape)

On a touch screen the game shows on-screen controls and a head-up display
instead of the keyboard hints and the readout strip. The layout follows mobile
flight simulators and RC transmitters: a self-centring stick for one thumb, a
thrust lever that stays where it is left for the other.

| Control | Touch |
| --- | --- |
| Pitch and roll | **Stick** (right thumb): it appears where the thumb lands in the lower right and springs back to centre when released. The aircraft then holds its attitude and trims itself. Stick up = nose up (tick *Pilot-style pitch* for stick up = nose down). Or tick **Tilt to fly** (below) |
| Thrust | **Thrust lever** at the left edge: drag it, and it stays where you leave it. **TO/GA** on top (beside it on short screens) gives go-around thrust |
| Thrust reversers | On the ground, pull the lever down past idle into **REV**. It stays there until you push it back up |
| Rudder / nose-wheel steering | **RUDDER** strip next to the lever; springs back to centre |
| Gear, flaps, speedbrakes, autobrake | **GEAR**, **FLAPS − / +**, **ARM** and **EXT** (speedbrakes), **A/BRK** buttons at the top left. Each shows its current setting |
| Wheel brakes | **BRAKE** (hold): appears on the ground, above the stick's area |
| Reposition on final | **REPOSITION**: appears during a go-around |
| Look around / views | Drag on the windshield (lets go straight ahead) · **VIEW** steps cockpit → panel → head-up, and names the one shown |
| Navigation display | **MAP** (between the rudder strip and the stick) leans in to the flight deck's ND, from the cockpit or the head-up view: the ND fills the space between the controls, the speed and the altitude beside it. **−** / **+** set its range and the mode button (MAP, APP, PLN) its mode, in the bottom row. **✕** or **VIEW** (it reads MAP) goes back |
| Approach chart | **❚❚**, then **Approach chart**. A tap zooms it to full size (then drag to move it); **✕** closes it |
| Pause / Flight School | **❚❚** / **?** at the top right |

The head-up display in the windshield shows what is needed to land: speed
against Vref + 5, N1, altitude, radio altitude, vertical speed, wind, the
localizer and glideslope diamonds, and the flight director in Flight School.
Flight School and the instructor hints name the touch controls instead of keys,
and highlight them.

**Short screens.** In landscape, Safari's address and tab bars leave an
iPhone's page only 265–330 px tall (Chrome on Android about 300). When the
full layout does not fit, a compact one takes over. The gear, autobrake,
flaps and speedbrake buttons sit in two rows of three, and TO/GA moves beside
the thrust lever, above the rudder strip. The lever takes the height that is
left. Added to the Home Screen, the game has the whole screen. On short
screens the menu and results scroll.

### Tilt to fly

Tick **Tilt to fly** in the menu to steer by tilting the phone, as in mobile
flight simulators. Both thumbs are then free for the thrust lever, the rudder
and the buttons, which helps in a crosswind flare.

- **Pitch.** Tip the top edge towards you to raise the nose (like pulling a
  yoke), away to lower it. The pilot-style option does not reverse this.
- **Roll.** Lower the left or right side to bank that way.
- **Level.** The way you hold the phone when a flight starts or resumes counts
  as level. **CENTER**, where the stick was, makes the way you hold it now
  level. The stick's circle shows your tilt from level.
- **Sensitivity.** 20° of tilt is full nose up or down; 25° is full bank.
- **Permission and fallback.** iPhones (and recent Chrome) ask for motion access
  when you tick the option or tap Start. If access is declined or the device has
  no motion sensor, the option switches itself off, says why, and the stick
  stays on. If the sensor stops reporting mid-flight, tilt lets go of the
  controls.
- **Implementation.** Tilt uses only the direction of gravity from the
  `deviceorientation` event, so turning on the spot never steers.
  Browsers report the screen angle in different directions; since the picture
  is always upright in your hands, centring checks which way gravity points and
  corrects the angle if needed.

### Vibration and the home-screen app

- **Vibration** (Android; iPhone Safari has no vibration API): a tick when a
  touch control is pressed, a click through the reverse gate, a thump when the
  gear locks down, a jolt at touchdown that grows with the sink rate, a long
  shake for a crash, and stick-shaker pulses during a stall warning. Untick
  **Vibration** in the menu to turn it off.
- **Home-screen app.** `manifest.webmanifest` and the icons in `icons/` let the
  game be added to the home screen. It then opens full screen in landscape on
  Android, and without the browser bars on iPhone. `node tools/make-icons.mjs`
  renders the PNG icons from `icons/icon.svg`.
- **Remembered.** The Tilt and Vibration choices are remembered on the device.

- **Orientation and full screen.** On Android, starting a flight goes full
  screen and locks landscape. iPhone Safari cannot do either, so holding the
  phone upright shows a "rotate to landscape" screen, and the menu suggests
  *Share → Add to Home Screen*, which opens the game without the browser bars.
- **Sound on iPhone and iPad.** Sound starts with the first tap and, like a
  video's, plays even with the ring/silent switch set to silent. On older iOS
  versions a silent media element is kept playing for that. After a phone call
  or a trip to the app switcher, the next tap brings the sound back. Untick
  **Sound & voice callouts** to leave other apps' audio (music) alone. The
  voice callouts and warnings are recordings played the same way as the engine,
  so whenever the engine is heard, so are they. Engine rumble is low-pitched and
  phone speakers barely reproduce it (headphones do), so touchdowns and impacts
  also carry a tyre chirp, crunch and scrape pitched where a phone speaker
  plays them.
- **Interruptions.** Turning the phone upright or switching away from the
  browser pauses the flight. While flying, the screen is kept awake where the
  browser supports it.
- **Performance.** Phones get the lighter scene detail, the rendering
  resolution adapts to the frame rate, and still screens (menu, pause, results)
  are drawn at about 15 fps.
- **Detection.** The touch layout appears on touch-first devices and switches
  with the pointer in use (a touch on a laptop, a mouse on an iPad). Add
  `?touch=1` or `?touch=0` to the address to force it, and `?drs=1` or `?drs=0`
  to force the adaptive resolution on or off.

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
layer, and continuous turbulence from the Dryden model of MIL-F-8785C /
MIL-HDBK-1797. That model is the standard that flight simulators are
qualified against.

- The gusts are a frozen field the aircraft flies through. Along the track
  they have a first-order spectrum; across it and vertically they have
  second-order spectra. Each has a time scale of L / V (length scale over
  airspeed).
- Below 1000 ft the length scales and intensities follow the low-altitude
  formulas. The vertical scale L_w is the height itself;
  L_u = L_v = h / (0.177 + 0.000823 h)^1.2 (in ft). σ_w is 0.1 × W20, the
  wind at 20 ft, and σ_u = σ_v = σ_w / (0.177 + 0.000823 h)^0.4. Between
  1000 and 2000 ft they blend into the medium-altitude values.
- Close to the ground, the gusts along the track are therefore stronger and
  quicker. At 50 ft in the storm they are about 6 kt rms and last about 1.3 s;
  at 500 ft, about 4 kt and 4 s. The vertical gusts get quicker towards the
  ground too, and the wingspan averages much of them out there: about 1.3 kt
  rms at 50 ft, against 2.6 kt at 500 ft.
- The wingspan averages out the smallest lateral and vertical gusts
  (MIL-F-8785C's gust penetration lag, 4 b / (π V)). The fuselage averages
  out along-track eddies shorter than about 10 m.
- The turbulence is what makes a scenario's reported gusts; there is no
  separate gust model. W20 is raised where the report needs more: a wind
  gusting G kt above its mean needs W20 ≈ 2.4 G for the peak 3-second gusts
  at a 20 ft anemometer to reach G. This gives light turbulence in the
  tailwind (W20 12 kt), light to moderate in the crosswind (19 kt), and
  moderate to severe in the storm (34 kt, from "22 kt gusting 36"). Clear
  weather has smooth air.

**Autothrottle** (`js/autopilot.js`, the autoland demo and the test pilot):
modelled on a 737's in speed mode.

- The approach speed is Vref plus the wind additive: half the steady headwind
  plus the full gust, between 5 and 20 kt.
- The speed it controls is the airspeed blended with the aircraft's inertial
  acceleration (a 5 s complementary filter). Gusts barely reach the thrust
  levers, while a real change of speed shows at once.
- A servo moves the levers at up to 8 % of their travel per second when
  adding thrust, and 4 % when taking it off: Boeing's gust protection, which
  keeps the average thrust a little high in gusts.
- From 27 ft, RETARD brings the levers to idle over about 2 s. Above 27 ft
  the speed mode stays on, so a gust that balloons the aircraft back up in
  the flare gets thrust again as the speed decays. If the speed has decayed
  below Vref − 5, the thrust stays in to the ground.
- The flight mode annunciator on the flight deck's primary flight display
  shows MCP SPD, RETARD and ARM, and GA in a go-around.

In the storm the levers move a few percent at a time, as a real 737's do,
between about 45 and 70 %. Before this model they swung between idle and full
several times a second, chasing every gust.

**Go-around** (`js/autopilot.js`, the autoland demo and the test pilot): when
an approach or a landing goes bad, the autoland goes around, as Boeing's
stabilised-approach criteria and rejected-landing guidance ask. Each limit must
hold for a moment, so a single gust does not trigger it:

| Goes around when | Limit |
| --- | --- |
| off the glideslope, 1000–200 ft | more than 0.7° (about 2 dots), for 3 s |
| off the localizer, 1000–200 ft | more than 1.25° (about 1 dot), for 3 s |
| sinking fast, 1000–100 ft | more than 1400 fpm, for 3 s |
| slow or fast, below 1000 ft | the gust-filtered speed 5 kt below Vref for 3 s, or 15 kt above the approach speed for 5 s below 500 ft |
| banked, below 300 ft | more than 15°, for 1 s |
| not lined up, 150–40 ft | more than 10 m off the centreline, for 1 s |
| a balloon in the flare | climbing back more than 12 ft above the flare's lowest height |
| the speed decaying in the flare | 10 kt below Vref above 15 ft, for 1 s |
| a long landing | still airborne 1000 m past the threshold, beyond the touchdown zone |

Once the wheels are on the runway the landing is committed. The go-around:

- **TO/GA:** the game announces it with the reason ("Go around, flaps fifteen").
  The levers go full forward until the aircraft climbs at 1500 fpm, then back to
  a reduced go-around thrust, as a 737's autothrottle does in GA mode. Flaps go
  to 15, and the speedbrakes and autobrake are disarmed.
- **Pitch:** the nose comes up at about 3°/s towards 15° (8° until clear of the
  runway, where more would strike the tail). Once climbing, the pitch flies
  Vref + 15, never letting the speed fall below the approach's Vref.
- **Gear:** up with a positive rate of climb.
- **At 1000 ft:** flaps 5, then a climb at up to 2000 fpm and 180 kt to 3000 ft.
- **The circuit:** radar vectors round a left-hand circuit: a left turn at
  2000 ft onto the crosswind leg (heading 180), downwind (090) 4 nm abeam,
  base (360) 13 nm out, and a 30° intercept (300) onto the localizer. Then a
  normal approach: flaps 15, gear and flaps 30 on the usual schedule.
- **Touch-and-go:** if the wheels touch during the go-around, that touch is
  not the landing the debrief grades. The debrief counts the go-arounds.

Each turn of the circuit starts early by the distance the turn covers, as
radar vectors are given, so the legs lie where the approach chart and the
navigation display draw them: the downwind 4 nm abeam, and the localizer joined
about 11 nm out, 2 nm before the final approach fix.

The go-around from 200 ft loses about 30 ft before climbing. The circuit and
the second approach take about 13 minutes; REPOSITION puts the aircraft back
on final at once, and the autoland flies that approach. After two go-arounds a
crew would divert; the autoland then lands. The Flight School flight director
never goes around by itself: that is the pilot's decision.

**Navigation** (`js/nav.js`, `js/nd.js`, `js/chart.js`, `js/debrief.js`). One
set of navigation data for the (fictional) Westhaven International, WHV, feeds
the navigation display, the approach chart, the debrief map and the autoland's
missed approach, so they always agree:

- **ILS 27** (IWH 110.30, course 270°, glideslope 3°, decision altitude 200 ft)
  with the coverage ICAO Annex 10 gives it. The localizer is received within
  ±10° out to 25 nm and ±35° out to 17 nm, measured from its antenna 300 m
  beyond the far end, and not behind it. The glideslope is received within ±8°
  out to 10 nm. Outside that, the PFD, the head-up display and the ND show no
  pointer at all, as a real receiver does. The DME reads the slant distance to
  the threshold.
- **The approach**: HAVEN (26 nm, 7000 ft) → WESTY (13 nm, 3000 ft) → FI27, the
  final approach fix, where the glideslope meets 3000 ft (9.2 nm). Then the
  threshold. The minimum sector altitude (4500 ft) is the highest ground within
  25 nm plus 1000 ft, rounded up.
- **The mode control panel and the FMA**: the autoland shows what it has
  selected: its speed, the heading of each circuit leg and 3000 ft. The flight
  mode annunciator reads LOC and G/S on the approach, then FLARE and ROLLOUT.
  Where the ILS is not received yet (the full approach's first miles), it
  reads LNAV and VNAV PTH instead. The PFD's selected speed and its bug show
  the MCP speed.
  In a go-around it reads GA, TO/GA, TO/GA. In the circuit it reads HDG SEL with
  V/S, ALT ACQ and ALT HOLD.

The **navigation display** is a 737's, set from the EFIS panel on the
glareshield, whose knobs turn:

- **MAP**, track up: the route in magenta with the next fix and its distance.
  It also shows the missed approach (dashed cyan until a go-around makes it
  the active leg), the runway, the selected heading's bug (with a dashed line
  while HDG SEL flies it), the ground speed, true airspeed and wind, and the
  offset from the centreline on final.
- **APP**, heading up: the ILS course through the runway, the course
  deviation bar (1° a dot) and the glideslope pointer (0.35° a dot), with the
  ILS's ident, course and DME.
- **PLN**, north up round the airport: the whole approach and circuit.
- **Ranges 5–160 nm.** Until the pilot turns the knob, the range is the one a
  crew would pick: 40 nm beyond 12 nm, 20 nm inside that and in a go-around's
  circuit, 10 nm inside 4 nm.

**Where the map is shown.** There is one navigation display, the flight deck's,
and nothing copies it over the view. Simulators handle this the same way.
Microsoft Flight Simulator reads a cockpit display through *instrument views*:
camera positions that frame one display. It keeps its moving map on a separate
page, the tablet's Map page in MSFS 2024. X-Plane Mobile opens its map from the
head-up view. So:

- **The cockpit view** shows the ND where it is, on the panel.
- **The ND view** (`J`, **MAP**, or the controller's left stick press in the
  head-up view) is this game's instrument view. The camera leans in over
  0.45 s until it looks square at the captain's ND, which then fills most of
  the screen, and the EFIS range and mode buttons appear beside it. It works
  from the head-up view too: the flight deck comes back while you look at it,
  and the head-up view returns when you lean back out.
- **Sharp on phones.** A phone renders the 3D view at 1.5 times its pixels or
  fewer (less when it is busy), too soft for the ND's small print. Once the
  camera is there, the ND is drawn again at the screen's full resolution,
  exactly over its 3D screen.
- **Phone layout.** The display takes the largest square the touch controls
  leave free. A dark backdrop fades in over the rest of the flight deck while the
  camera leans in, so MAP shows only the map: the PFD and the standby
  instruments beside it do not show through. The speed and the altitude sit
  either side (the head-up readouts), and the buttons use the gap between the
  rudder strip and the stick, where MAP is. VIEW reads MAP while it is open. On
  the smallest screens the ✕ is left out and VIEW goes back.
- **On a computer** (`J`) there is no backdrop: the flight deck stays around the
  display, as in Microsoft Flight Simulator's instrument views.
- **The approach chart** is the separate page (the electronic flight bag's),
  and the **debrief map** is on the results screen.

The **approach chart** is the ILS 27 plate an electronic flight bag shows. It
has the aircraft's own position on its plan view, and its height against the
glidepath on the profile. It also carries the glideslope check heights (D7
2280 ft … D2 690 ft), the descent rates (740 fpm at 140 kt), the minimums, the
missed approach and the typical radar vectors. The flight goes on under it, as
it would for a pilot reading it.

The **debrief map** on the results screen replays the recorded flight (a
sample every half second) in three views:

- the **track**, north up at one scale, showing any go-around and circuit;
- the **profile**, the height against the glidepath and the decision altitude
  on the final approaches and the climb-out;
- the **runway**, drawn with its width stretched: the touchdown zone, each
  touchdown and where the aircraft stopped.

The approaches are blue, a go-around and its circuit amber, the roll-out
green.

**World** (`js/world/`): terrain, an airport with a 3000 m × 45 m runway with
ICAO markings, ALSF-2 approach lights with sequenced flashers, threshold,
edge, centreline and touchdown-zone lights, a PAPI computed from the pilot's
eye position, taxiways, buildings, a town, forests, clouds, rain, fog and
lightning.

**Light and atmosphere** (`js/world/sky.js`, `js/world/scene.js`): one
scattering model of the sky (Preetham, as in three.js' Sky) gives the sky dome,
the haze over the land (it takes the colour of the horizon sky in each
direction: warm and bright towards the sun, blue away from it), the colour of
the sunlight and the light the sky sheds. The sky is captured into an
environment map that lights, and is reflected by, every surface outside and
inside the cockpit, so water mirrors the sky and a wet runway shines. The sun
casts shadows: over the airport, and through the flight-deck windows, whose
frames throw moving shadows across the glareshield and panel. Under a cloud
deck the sun is hidden and the light turns flat and grey; above it, sunshine
and a clear sky return. At night there are stars, moonlight, and runway and
town lights that glow.

Computers get the **high** graphics tier: sun shadows, and the outside view
drawn into a floating-point frame with 4× multisampling and a bloom pass (the
sun, glints, the lights at night) before tone mapping. Phones and tablets get
the **low** tier: the same sky, haze and lighting, drawn straight to the screen,
without shadows or bloom. Add `?quality=high` or `?quality=low` to the address
to choose.

The terrain uses a bundled aerial countryside texture with close-range ground detail and a
separate maintained-grass surface around the airport. Both tiers include:

- rounded cockpit surfaces, recessed display bezels and panel fittings;
- broadleaf vegetation;
- towns grown along their streets, with houses facing the street and pitched, tiled roofs;
- terminal glazing, jet bridges and ramp vehicles;
- irregular water boundaries.

At night the flight deck's flood and dome lights are turned well down, as crews fly, so the
panel is dimmer than by day and the displays stand out. The high tier also draws fair-weather
cumulus as ray-marched 3D density volumes with self-shadowing. Each ray marches only through
the box around its cloud and skips the noise outside the cloud's shape. The low tier uses the
lighter sprite clouds. Cloud-deck visibility and storm physics are shared. Asset provenance and
the generation prompt are in `assets/README.md`.

**Head-up view** (`js/hud.js`, `js/view.js`): the flight deck hidden and a
conformal head-up display modelled on the 737's HGS (see *Views* above).

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
shaker, gear configuration horn, flap overspeed. Touchdowns, hard landings and
crashes have their own impact sounds (tyre chirp, thump, crunch, metal and
scrape), and thunder follows lightning. The warnings and impacts are pitched
and set so that a phone speaker, which plays almost nothing below 400 Hz, still
plays them well above the engines.

The voice is a set of short recordings in `audio/voice/` (26 phrases, about
220 KB), played through Web Audio like every other sound. Browsers' built-in
speech sounds different on each device and often stays silent on iPhone, so it
is used only for a phrase whose recording failed to load. The phrase list is
`audio/voice/phrases.json`. `tools/make-voice.py` renders the clips with the
open Kokoro text-to-speech model (Apache-2.0; its docstring has the setup), and
band-limits them like a flight-deck speaker. After changing a phrase in the
code, add it to the list and run the tool; `test/game.test.mjs` fails while a
spoken phrase has no recording.

**Evaluation** (`js/evaluate.js`): touchdown point, vertical speed, centreline,
speed (in gusts, Vref plus the gust increment carried to touchdown),
alignment (crab and bank), configuration and stopping are scored;
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

## Architecture

The game is layered so that each part can change, or be tested, on its own. Arrows point from
a module to what it uses; nothing points back up.

```
                          main.js  (builds and wires everything, runs the frame loop)
        ┌──────────────────┬───────────┴───────┬──────────────────────┐
  Presentation         GameView            Game (rules)          player's devices
  sound, vibration,    aircraft, flight    state machine,        InputManager + touch,
  screens              deck, world         actions, go-around,   tilt, gamepad
  (listens to the      (reads the          finish, grading,      (send actions; move
   game's events)       game's state)      instructor            the controls when asked)
                                               │
                        ┌──────────────────────┼─────────────┐
                  FlightControls           Simulation      GPWS
                  one owner of the         fixed 120 Hz    callouts and
                  aircraft's controls      steps           warnings
                  (player or autoland)         │
                                   physics/  +  avionics.js
                                   flight model   runway geometry, ILS, Vref
```

- **Physics** (`js/physics/`) knows only the aircraft, the air and the ground. It publishes its
  state after every step; the Simulation adds the approach geometry through a hook
  (`js/avionics.js`), so the flight model knows nothing about runways.
- **The rules** (`js/game.js`) have no DOM, Three.js or sound, and run in Node
  (`test/game.test.mjs`). They say what happened through events (`state`, `control`,
  `touchdown`, `damage`, `finish`, `message`, …). They never call the screen or the speakers.
- **The controls** of the aircraft have one owner (`js/flightcontrols.js`). Either the player's
  devices or the autoland demo has command, and grabbing a control takes it back. Gear, flaps and
  the other switches are applied in one place. The Flight School flight director flies a copy.
- **Presentation** (`js/presentation.js`) turns the events into sound, vibration and screens, and
  looks after the devices around a flight (they only fly while flying; the mouse yoke comes back
  after a pause).
- **The view** (`js/view.js`) places the aircraft from the published state and draws the flight
  deck and the world; it never changes the game.

## Project structure

| Path | Contents |
| --- | --- |
| `index.html`, `css/style.css` | Page, menu, HUD, Flight School and results overlays |
| `js/main.js` | Boot, wiring, frame loop, test hooks (`window.__sim`) |
| `js/game.js` | The rules: state machine, actions, go-around detection, finish and grading, instructor hints; emits events |
| `js/flightcontrols.js` | The one owner of the aircraft's controls: player or autoland in command, discrete actions, the flight director's copy |
| `js/avionics.js` | Runway-relative geometry, ILS deviations, Vref, terrain ahead |
| `js/presentation.js`, `js/view.js` | Sound, vibration and screens from the game's events; the 3D view from the game's state, and the cockpit and head-up views |
| `js/hud.js` | The head-up view's display: conformal geometry (tested in Node) and its drawing |
| `js/nav.js` | Navigation data (the airport, the ILS 27 and its coverage, the fixes, the missed approach, the MSA) and the ILS signals |
| `js/nd.js`, `js/chart.js`, `js/debrief.js` | The navigation display, the approach chart and the debrief map: each a pure model (tested in Node) and its drawing |
| `js/sim.js` | Fixed 120 Hz simulation loop and approach placement |
| `js/config.js` | Aircraft data, runway, scenarios and starting points |
| `js/physics/` | Flight model and landing gear (`aircraft.js`), atmosphere and wind, terrain |
| `js/world/` | Terrain, airport, runway textures, airfield lights and PAPI, weather; the sky and haze model (`sky.js`); lighting, shadows and post-processing (`scene.js`) |
| `js/cockpit/` | 3D flight deck and the canvas-drawn displays |
| `js/input.js`, `js/audio.js`, `js/gpws.js` | Keyboard, mouse yoke and touch input, synthesised sound and the recorded voice, warning system |
| `audio/voice/`, `tools/make-voice.py` | The voice callouts and warnings (MP3 clips and their phrase list), and the script that records them |
| `js/touch.js`, `js/platform.js`, `js/controls.js` | On-screen touch controls; phone support (orientation, full screen, pausing, wake lock, adaptive resolution); the control glossary that words hints for keys, touch or tilt |
| `js/tilt.js`, `js/haptics.js`, `js/gamepad.js` | Tilt steering from the motion sensor; vibration and controller rumble; game controllers |
| `manifest.webmanifest`, `icons/`, `tools/make-icons.mjs` | Home-screen app: manifest, icons, and the script that renders the icons |
| `js/evaluate.js` | Landing grading and outcomes |
| `js/autopilot.js` | Test pilot used by the tests and the autoland demo |
| `vendor/` | Three.js, its post-processing add-ons (`vendor/addons/`) and cannon-es (no install needed to play) |
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
GPU. Software rendering is about 95% of each frame's cost: 0.6–3 drawn frames per
second, against 30–50 when the 3D scene is not drawn. So the pages run with the
3D drawing switched off (`window.__sim.setDrawing(false)`). The game loop, physics,
rules, displays and interface all run as usual. A frame is drawn for every
screenshot (`window.__sim.drawNow()`). E1 and E16 check drawn pixels, and E16
draws every scenario by day and night on both graphics tiers.

### Automated suites

| Command | What it checks | Time |
| --- | --- | --- |
| `npm test` | Node, no browser: physics (71 checks in 13 groups), phone features (59 checks in 7 groups), game controllers (40 checks in 6 groups), the sky model (12 checks in 3 groups), the head-up display (23 checks in 5 groups), navigation (57 checks in 4 groups) and the game's rules (99 checks in 10 groups), below | ~10 s |
| `npm run test:e2e` | The real page in Chromium: 270 checks in 17 groups (below), run in 3 parallel processes (`test/e2e-parallel.mjs`) | ~13–17 min |
| `npm run test:e2e:quick` | The same without the four landings flown in real time (E9, E11, E13, E15) | ~6 min |
| `node test/e2e.mjs only=<groups>` | E1 plus the groups listed, in one process, comma-separated: `menu`, `keys`, `school`, `land`, `fail`, `ga`, `maps`, `fps`, `keyboard`, `mobile`, `touchland`, `tilt`, `tiltland`, `gamepad`, `padland`, `graphics` (e.g. `only=tilt,tiltland`) | 10 s – 3 min each |
| `npm run test:e2e:serial` | All browser groups in one process | ~25 min |
| `npm run test:all` | The Node suites, then the browser suite in parallel | ~13–17 min |
| `node test/robustness.mjs` | 18 short-final autolands, crosswind and storm with 9 gust seeds each; prints each result as a report, not pass/fail | under a minute |

**What to run when.** After any change, run `npm test` (seconds). While working on one area,
run its browser groups with `only=`. Before merging to `main` or publishing, run
`npm run test:all`.

**Timing.** Each browser run ends with the time each group took. The parallel runner shares the
groups out by the durations in `test/e2e-parallel.mjs` (`GROUP_SECONDS`), so update those when a
group changes a lot (they are measured with 3 processes running, so they include the slow-down
from sharing the CPU). It uses 3 processes by default (`workers=N` to change). On 4 cores, 3
processes already keep the CPU busy, so groups take 1.5–2× longer than alone. A fourth process made
the whole run slower: the real-time landings could no longer keep up with real time. How long a
run takes depends on which groups overlap: a real-time landing next to the graphics group (the only
one that draws a lot) slows down, which is why E16 uses a small page.

**Real time.** E9, E11, E13 and E15 fly a whole approach with the human-like pilot sending real
input events. They run at real time (1×) when the frame rate allows about 10 of the pilot's
decisions per simulated second, and slower otherwise. Faster than real time, a simulated touch or
button press takes longer in simulated time and the flare comes late, so these landings are never
sped up. The autolands (E5, E6) have no such input delay and run at 16×.

**Waiting in the tests.** Waits are for simulated time (`simWait`, `simWaitOn`) or a number of
frames, not fixed sleeps, so they hold at any frame rate. Tilt checks also let the sensor readings
settle, then wait for frames to flow steadily (`steady`). In software rendering, the graphics work
queued when a flight starts can hold frames back for up to a second some time later.

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
    the controls and never moves the aircraft's, from the approach to the stop;
13. the turbulence follows the Dryden model. At 50 and 500 ft it checks the
    along-track and lateral intensities and the along-track gusts' time scale
    L_u / V against the specification, and the vertical intensity at 500 ft.
    It checks that near the ground the vertical gusts are quicker and
    averaged out by the wingspan, and the along-track ones stronger and
    shorter. It checks that the storm's peak 3-second gusts at a 20 ft
    anemometer come within 5 kt of its reported 14, and that clear weather is
    smooth.

The autolands are flown by a test pilot (`js/autopilot.js`) that uses only the
controls a player has. It flies as a pilot does:

- From 150 ft down it gradually stops chasing the glideslope (it has stopped
  by 50 ft). Below 100 ft it holds the approach's average attitude, with only
  a small correction for the sink rate.
- It removes the crab with rudder between 25 and 5 ft. It holds the
  centreline with a wing-low sideslip into the steady crosswind, with the
  bank limited to 6° and brought back towards 4° at the ground.
- In a balloon it holds the attitude and never pushes the nose down through
  it. In the last 6 ft it holds the attitude it has reached.

Over 80 autolands (the four windy and clear scenarios, both final starts,
10 turbulence seeds each), every one lands on the runway. The average
touchdown is about 100 fpm in clear weather, 250 fpm in the tailwind, 330 fpm
in the crosswind and 400 fpm in the storm. The storm's firmest touchdowns are
about 600 fpm. Only one of the 80 goes around (a float past the touchdown zone
in the storm), and it lands from the next approach.

Over 80 more storm approaches (seeds 11–50):

- **Go-arounds:** the autoland goes around 7 times: 2 balloons and 5 floats
  past the touchdown zone. Each lands from the next approach, at 200–430 fpm;
  one needs two go-arounds.
- **Hard landings:** the go-around cannot help when a downdraft sets in below
  about 60 ft, too late for one. The firmest touchdowns are then 670–840 fpm,
  and in one approach of the 80 (short final, seed 32) the gear collapses at
  940 fpm.

`test/e2e.mjs` drives the real page:

- **E1** loads the page with a working WebGL renderer and no errors, and draws a frame.
- **E2** chooses the mode, conditions and start with the mouse and starts the approach.
- **E3** presses every mapped key and checks the control it drives, and `C` switching to the head-up view and back.
- **E4** walks through every Flight School step.
- **E5** autolands in every scenario by day and night and checks the callouts and sounds. The
  voice recordings load after the first key press, and in one landing with sound on every callout
  plays its recording, with none left to the browser's speech.
- **E6** provokes the failures and checks the warnings and outcomes. It also renders sounds offline
  and checks that, between 400 Hz and 8 kHz (what a phone speaker plays), a touchdown, a hard
  landing, a crash, a voice warning and the stick shaker are clearly louder than the engines.
- **E7** flies a keyboard-only go-around from 500 ft and repositions, in Fly the Approach and in Flight School.
- **E8** checks that simulated time matches the frame time the game loop hands the physics, at any frame rate, and that the 4× time scale runs the physics 4× as fast.
- **E9** lands with real mouse-yoke and keyboard events.
- **E10** runs on a phone-sized landscape screen (852×393, touch, simulated notch
  insets). It checks:
  - the menu fits the screen;
  - every touch control sits inside the safe area, with no overlaps and targets
    of at least 34×40 px, also on an iPhone SE, an iPhone 13 mini and a 640×360
    Android;
  - the same on short screens (iPhones with Safari's toolbars at 265–320 px, and
    Android Chrome at 304 px), where the compact layout is used. Each size is
    checked with BRAKE, REPOSITION and tilt's CENTER shown, and in the ND view
    (the display, the speed and altitude beside it, and the EFIS buttons clear of
    every control, the display at least 140 px). The thrust lever must keep at
    least 80 px of travel;
  - the head-up display replaces the readout strip;
  - each button drives its control;
  - two thumbs work at once, the stick and rudder spring back and the lever
    stays put;
  - the reverse gate stays shut in the air;
  - look-around, VIEW (cockpit → panel → head-up), TO/GA and REPOSITION work;
  - rotating the phone or leaving the browser pauses the flight;
  - touching the stick takes over from the autoland demo;
  - Flight School and the instructor name the touch controls and highlight them.

  Touches are real multi-finger touch events sent through the DevTools protocol.
- **E11** lands on the phone screen using only the touch controls: stick,
  thrust lever, rudder strip and buttons. The roll-out uses the REV gate.
- **E12** checks tilt steering, vibration and the home-screen app on the phone
  screen, with a simulated motion sensor (`test/tilt-pose.browser.js`). It
  covers:
  - the fallbacks: no sensor, and motion access declined;
  - access asked for from the tap, and the choice remembered;
  - centring at the start, on resume and with CENTER;
  - pitch and bank directions, including with the pilot-style option;
  - a sensor that stops reporting;
  - a browser with a reversed screen angle;
  - tilting to take over from the demo;
  - Flight School's tilt wording;
  - vibration on a tap and at gear lock, and none when switched off;
  - the manifest and every icon;
  - sound on an iPhone (its user agent): tapping Start starts the sound, the
    silent-switch workaround plays, and speech is unlocked.
- **E13** lands by tilting the phone, with the thrust lever, rudder, REV gate and
  buttons by touch, and checks the touchdown is felt as a vibration.
- **E14** uses a simulated controller (`test/gamepad-stub.browser.js`; browsers
  cannot emulate one). It checks:
  - the connection message, and Menu starting the approach;
  - the stick with and without pilot-style pitch;
  - the triggers, thrust, gear, flaps, autobrake, speedbrakes (tap and hold),
    trim, brakes and look-around, and the right stick press stepping through the views;
  - the left stick press: the ND's range, and in the head-up view the ND view, left with the
    right stick press;
  - rumble at gear lock;
  - View for TO/GA, then back on final;
  - pause and resume, and a resume that adds no thrust;
  - B back to the menu;
  - Flight School and the instructor in controller words;
  - switching back to keys;
  - PlayStation button names;
  - unplugging mid-flight;
  - a joystick with its own layout;
  - the touch controls hiding on a phone;
  - an iPhone with a PS5 controller, as Safari reports it ("… Extended
    Gamepad", no rumble, the PS button as button 16) and with Safari's wake
    lock rule (granted only to a request made in a gesture). Its first press
    (Safari's gamepadconnected gesture) starts the sound and keeps the screen
    awake; Options starts the flight; there is no Vibration option. After the
    sound is interrupted, "Tap the screen for sound" shows until a tap brings
    it back. Without the controller, the screen may sleep again.
- **E15** lands with the controller only: stick, A/B thrust, triggers, buttons,
  reverse by holding B, stowed with A. It checks the touchdown rumble.
- **E16** checks the graphics tiers, and draws every scenario by day and night on both tiers
  (each one's materials compile and draw without errors). The high tier (a computer) must have 4×
  MSAA, bloom, sun shadows and sky lighting; the low tier (phones and the other
  groups) must have neither post-processing nor shadow maps. On pixels read
  back from the canvas it checks:
  - the sky is blue up high, paler and brighter at the horizon, and the land is
    darker;
  - the flight deck is darker with its shadows than without, but brighter than
    with the sun off, because sunlight comes in through the windows.

  It also checks sunshine above a cloud deck and overcast light inside and
  below it, and stars, moonlight and glowing lights at night. In the head-up
  view it checks:
  - the flight deck is not drawn (fewer draw calls) and the land shows where
    the panel was;
  - the head-up display is drawn;
  - on short final the flight path marker is on the −3° line and the runway;
  - Flight School switches to the cockpit and back;
  - the choice survives a reload.

- **E17** checks the maps in the page:
  - the flight deck's ND and its knobs with `,` `.` and `K`;
  - that the cockpit view shows only the flight deck's ND, and the ND view with `J`. Once leaning
    in, the sharp copy lies exactly on the 3D screen at the screen's resolution, and its buttons
    set the range and the mode. ✕ goes back. From the head-up view, the range key leans in first,
    and `J` returns to the head-up view;
  - the chart with `E`, its moving own-ship, and the pause menu's button with `Esc`;
  - an autoland go-around at 200 ft flown round the circuit to a landing, with the PFD's FMA, the
    MCP and the ND read at each stage: before it, in TO/GA, on each of the five legs and back on
    the ILS;
  - the debrief map on the results screen, drawn in its colours;
  - on a phone: the head-up display's ILS diamonds for exactly the signals received; no copy of
    the ND in the cockpit view; MAP leaning in, with the ND at the phone's full resolution on its
    3D screen, the backdrop hiding the other displays (VIEW reading MAP), and the display, the speed, the altitude and the buttons clear
    of the controls; the buttons; VIEW leaning back out; and the chart from the pause menu,
    zoomed by a tap and closed with ✕.

The other browser groups run on the fast low tier with the 3D drawing off.

`test/phone.test.mjs` checks the phone features in Node:

1. the W3C orientation angles give the right gravity in every holding position;
2. tipping the top edge, lowering a side or turning like a steering wheel gives
   the right pitch and roll, for both landscape directions and holding angles
   of 10°, 35° and 60°;
3. centring corrects a browser that reports the screen angle the other way round;
4. deflection scales to full at the tilt range and centres when held as at the start;
5. the browser tests' simulated sensor matches the rotation-matrix phone model;
6. each vibration pattern and controller rumble, and silence when switched off
   or on an iPhone;
7. sound on iPhone and iPad, with fake Safari audio: a tap starts it, playing a
   silent sample inside the gesture. The page asks to play through the silent
   switch (the Audio Session API, or a silent looping media element on older
   iOS). Speech is unlocked with an empty utterance. The next tap brings the
   sound back after an interruption. Switching sound off releases other apps'
   audio. The voice recordings load after the first tap. A callout plays its
   recording rather than the browser's speech, one at a time, and an urgent
   warning cuts in. A phrase without a recording falls back to speech.

`test/sky.test.mjs` checks the atmosphere model in Node:

1. by day, the sky is blue overhead and paler and brighter at the horizon. It
   glows towards the sun, and its light on the ground is bluish. The sunlight
   is yellowish white;
2. under a low sun the light is orange and weaker. At night there is no
   sunlight and the sky is dark. Under an overcast the sky and its light are
   one grey;
3. colours given as they should look on screen tone-map back to themselves.

`test/hud.test.mjs` checks the head-up display's geometry in Node, against the exact projection of
a camera placed like the game's:

1. the horizon is 6° above the middle in level flight and drops as the nose rises; the ladder
   rungs are at their angles, dashed below the horizon; the heading marks put "27" ahead;
2. in a 20° bank the horizon and the rungs tilt 20°;
3. on a 3° path the flight path marker is on the −3° line and on the aiming point it heads for,
   inside the runway outline. It is 5° left of the nose when crabbed 5° into a crosswind. There
   is no outline on the ground and no marker when stopped;
4. the speed error tape, the acceleration caret, the guidance cue and the FLARE cue;
5. the field of view is about 100° across on a computer screen and on a wide phone.

`test/game.test.mjs` runs the game's rules in Node, with no browser, recording their events:

1. a flight starts and the physics advances;
2. every action: the control moves, it is announced and logged; flaps stop at the ends; TO/GA
   starts a go-around; repositioning; pause stops time and actions;
3. the autoland demo has command, the devices only keep time, and grabbing a control or a
   configuration action takes over;
4. a whole landing by the test pilot: touchdown, spoilers, the finish and grade, the GPWS
   callouts through its voice output;
5. training: Flight School before and during the flight, the flight director, the checklist, the
   instructor;
6. one owner of the controls: actions report what changed; the flight director never moves the
   aircraft's controls;
7. every phrase the game speaks is in the voice phrase list, the list has nothing else, and each
   phrase has its MP3 file;
8. the autoland's autothrottle in the storm:
   - the approach speed is Vref plus the wind additive;
   - the levers move no faster than the servo's 8 %/s up and 4 %/s down, reverse fewer than 15
     times a minute, and never reach idle or full on the approach;
   - the controlled speed changes at under half the airspeed's rate (gusts filtered), with
     Vref + 20 held on average;
   - the flight mode annunciator shows MCP SPD → RETARD → ARM, and the landing succeeds;
9. the autoland goes around when an approach or a landing goes bad:
   - each limit on made-up states: the sink rate (not before 3 s), the glideslope, the localizer,
     a low speed, the bank, the lateral offset, a balloon of more than 12 ft (not a smaller one)
     and a long landing; never once the wheels have touched, and never for the flight director,
     the failure tests or after two go-arounds;
   - a go-around forced at 200 ft, through the game:
     - announced with its reason;
     - go-around thrust within 3 s and the pitch at most 17°, losing under 60 ft;
     - gear up with a positive climb, and GA on the mode annunciator;
     - the circuit's legs in order, downwind level at 3000 ft, and no "too low" warnings;
     - the second approach lands, and the debrief grades that landing and counts the go-around;
   - in the storm, a balloon and a float past the touchdown zone each go around and land from the
     next approach; the float's touch-and-go is not the landing graded; an approach within the
     limits does not go around;
   - repositioned on final during the go-around, the autoland flies the new approach and lands.
10. what the navigation display, the FMA and the MCP show, through that go-around and its circuit:
   - the EFIS panel: the range knob steps from the range shown and stops at 5 and 160 nm (the
     controller's tap goes round), the mode selector goes MAP → APP → PLN, the knobs do nothing
     while paused, and a new flight resets them; the pilot's own TO/GA shows the circuit;
   - on the approach: LOC and G/S, the route active and the bug on 270;
   - in TO/GA: GA, TO/GA, TO/GA, the go-around speed, the missed approach as the active leg and
     FI27 next;
   - on every circuit leg: HDG SEL with the leg's heading on the MCP and the ND (and its line),
     180 kt and 3000 ft, V/S, ALT ACQ and ALT HOLD at the right heights, and the bug at the top
     of the track-up map once the heading is flown;
   - the range the crew would pick, all the way; back on the localizer, the route again, with
     FI27 then the threshold next;
   - the ILS only where it is received: none climbing out past the localizer antenna, only the
     localizer's wide sector on the downwind, both on the final approach again;
   - the circuit where the chart draws it (the downwind 4 nm abeam, the localizer joined 2 nm
     outside FI27);
   - the recorded path (approach, go-around and circuit, approach, roll-out) and its marks, and
     the debrief map's counts and touchdown, which match the grading's;
   - repositioned on final from the circuit: the ND back on the route and the path on a new line;
   - the full approach from 26 nm: LNAV then LOC as the localizer comes into coverage, VNAV PTH
     then G/S with the glideslope, the range 40 → 20 → 10 nm and the next fix WESTY → FI27 → RW27;
   - in the tailwind, the crosswind and the storm (whose approach goes around), at every moment:
     the automatic range, the APP pointers only with their signals, LOC and G/S only with them,
     the route or the missed approach active as the phase says, the bug on the MCP heading, and
     the path's colour.

`test/nav.test.mjs` checks the navigation in Node, each figure against the geometry it should
show:

1. the ILS 27: zero deviations on the centreline and the glidepath, 1° off the course and 0.35°
   above the glidepath read as such, the slant DME, the localizer's two coverage sectors from its
   antenna and nothing behind it, the glideslope's; the final approach fix where the glideslope
   meets 3000 ft; the MSA clear of the ground within 25 nm by 1000 ft;
2. the navigation display: in MAP the threshold ahead at its distance on the range's scale and
   the next fix stepping down the route; the circuit's active leg; the automatic and the pilot's
   range; MAP track up and APP heading up in a crosswind drift; the heading bug and its line;
   APP's deviation bar and glideslope pointer, and nothing outside the coverage; PLN north up;
   the wind, the speeds and the centreline offset;
3. the approach chart: one scale both ways on the plan, the fixes where the data puts them, the
   glideslope check heights and descent rates, the missed approach's shape and words (the same
   path the ND draws, and the radar vectors' legs), the
   minimums, and the aircraft on the plan and exactly on the profile's glidepath (or off the
   chart, and saying so);
4. the debrief map on a made-up flight with a go-around: its runs by colour, the whole circuit on
   the plan, the profile without the downwind leg but with the climb-out, the touchdown in the
   touchdown zone on the runway strip, on the correct side of the centreline, a reposition breaking
   the line, and an empty flight.

`test/gamepad.test.mjs` checks the controller module against a fake
`navigator.getGamepads()`, and InputManager's controller thrust:

1. controller families and dead zones;
2. the standard layout: announced but not in use until used; sticks, triggers,
   buttons once per press; D-pad → tap versus hold, even across a slow frame;
   handing back to other devices; rumble only while in use; unplugging;
3. joysticks with their own layout: stick only;
4. thrust at the keyboard's rate; the hold-off after a start; reverse only on
   the ground after 0.4 s of B at idle; stowing with A without added thrust;
   pilot-style pitch; a controller not in use drives nothing;
5. controllers as Safari on iPhone and iPad reports them: each family by its name, a PS5 controller's
   Options and Create, the PS button doing nothing, no rumble;
6. tilt steering does not take over from the autoland demo while a controller is in use.

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
