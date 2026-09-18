# Playtest findings

Round 1 played every scenario the way a new player would (`node test/playtest.mjs`):
menu clicks, mouse yoke, key presses, the Flight School read page by page, a pause
at every phase of the approach with the state, callouts, events and screenshots
recorded, and the deliberate mistakes (gear up, no flare, long landing without
brakes, stall, go-around). Every finding below is tagged and describes the fix
that was made; round 2 replays the same runs on the fixed build.

## Findings by scenario (round 1)

### Menu
- **M1** The airport carried a model-name-derived title. Renamed to Westhaven International.

### Clear weather, standard final (three runs)
- **G1 Gameplay.** Pausing (or opening the Flight School) disengaged the mouse yoke and
  resuming did not re-engage it: the aircraft flew hands-off after every pause and the
  only hint was the small "click to engage" HUD text; the first run dived into the
  terrain 8 km short. *Fix:* the yoke engagement is remembered across pause/help and
  fades back in over a second on resume, with a "MOUSE YOKE ON" message.
- **P1 Physics.** The approach started out of trim: a fixed lever setting bled 10 kts in
  the first seven seconds. *Fix:* `place()` solves thrust = drag + weight component for
  the start condition (the stabiliser trim was already solved).
- **P4 Handling.** A slow pitch/vertical-speed limit cycle (period 35 s, pitch −1…+5°,
  VS −280…−1330 fpm) locked to the trim follow-up, which ran the stabiliser 0.7°/s after
  1.2 s of any input and so chased every correction. *Fix:* the follow-up runs at
  0.3°/s, only after 2 s of the same input and only while the pitch rate is small.
- **P7 Trim.** The approach trim sat on the 16° stop, so the follow-up saturated in the
  flare. *Fix:* trim range 20°.
- **P2 Physics.** A destroyed airframe bounced 15 m back into the air after a belly
  impact. *Fix:* a wreck keeps 15 % of its lift.
- **P5/P6 Ground.** Heading swung ±6–9° in the first seconds of the roll-out: the
  autobrake could engage while only one main gear was down. *Fix:* the autobrake waits
  for both mains (0.5 s) and ramps in over a second.
- **G3 GPWS.** "Sink rate" and "Glideslope" fired on one-second transients. *Fix:* the
  descent-rate modes use a 0.9 s filtered vertical speed.
- **G4 GPWS.** "GLIDESLOPE" stayed on screen through the roll-out and after stopping.
  *Fix:* captions clear on the ground.
- **E1 Evaluation.** A wreck still collected points (alignment 15/15, "in the aiming
  zone"). *Fix:* a destroyed aircraft scores 0, a collapse or belly landing at most 15,
  and the centreline note reads "Not on the runway" when the touchdown was off it.
- **C1 Cockpit.** The MCP windows were a static texture (145 / 270 / 3000 / −700) that
  contradicted the flight. *Fix:* live windows (selected speed for the flap setting,
  runway heading, missed-approach altitude, V/S blank).
- **C2 Cockpit.** The standby instruments were blank discs. *Fix:* standby attitude with
  speed/altitude, standby altimeter and a clock drawn on canvases.
- **V1 Visual.** The over-the-nose cut-off was ~11° (real 737 ≈ 17°): at flare attitude
  the runway vanished behind the glareshield. *Fix:* shelf, lip, MCP and panel lowered,
  camera pitched to −15°, glass extended: ~15° cut-off, verified by capture at 200 ft
  and on the ground.
- **V3/V8 Visual.** By day the runway was a hair-thin dark line and the approach lights
  invisible beyond ~1.5 nm. *Fix:* medium-grey asphalt and taxiways, larger approach
  and threshold lights, 3 px minimum point size, lights 90 % bright by day.
- **V4/V6 Visual.** Town buildings were uniform dark navy boxes and the hangars dark
  grey. *Fix:* lighter building faces, hangars, neutral (not blue) sky light, stronger
  daytime hemisphere light.
- **V5 Visual.** The pedestal view was very dark by day. *Fix:* daytime cockpit lighting
  raised.
- **V7 Visual.** PAPI reds rendered orange because the lights were blended additively
  over the terrain. *Fix:* normal blending.
- **U1 UI.** GPWS cautions were shown in a blue "info" box. *Fix:* cautions amber,
  warnings red.
- **U2 UI.** After a gear collapse the HUD and engine display still showed three greens.
  *Fix:* HUD "GEAR FAIL" and red "FAIL" lights.

### Flight School (training mode)
- **T1 Instructor.** "Speed low (−23): add thrust" at the very start, because the hint
  targets (190/170 kts) were the flap extension limits, not targets. *Fix:* targets 175 /
  162 / Vref+5 with a wider tolerance.
- **T2 Training.** The landing checklist was drawn on the lower display, hidden under
  the HUD on small windows. *Fix:* an HTML checklist overlay top-right.
- **E2 Evaluation.** 136 kts after a normal flare was graded "close to the stall". *Fix:*
  Vref −9…+8 is on target; "close to the stall" only below Vref −15; centreline bands
  one metre wider.
- School pages, highlight anchors and phase hints ("Approaching the flare", "Flare!",
  "Rolling out") were correct.

### Strong tailwind (short final)
- Ground speed, vertical speed and the 1293 m roll-out (vs 1003 m in calm wind) were
  consistent with an 18 kt tailwind.
- **I1 Instrument.** IAS read 13 kts at a standstill with a 13 kt tailwind. *Fix:* the
  pitot uses the forward component of the relative wind.
- **U3 HUD.** The wind cell's "x2" (crosswind) read like a time multiplier. *Fix:* a
  labelled X-WIND cell with L/R.

### Heavy crosswind (standard final)
- Crab angles (10–11° for 25 kts at 140 kts), the wind gradient, the decrab and the
  runway sitting 11° left of the nose were all correct.
- **V9 Visual.** The overcast had no top: everything above the 1500 ft base was in
  cloud, so the first half of the approach was a featureless void. *Fix:* each deck has a
  thickness; above it the sunlit top is drawn, inside it is white-out with no false
  horizon, below it the ragged base is visible. Verified at 3000, 2200 and 1300 ft.
- The hard landing (685 fpm) was the P4 oscillation.

### Severe storm (standard final)
- Gusts, the wind gradient, breaking out at minimums with the runway and approach lights
  through the rain, the wet runway and the callouts all worked.
- **V10 Visual.** Airfield lights kept a 10 % floor through fog and showed as a blob from
  3 nm in 900 m visibility. *Fix:* 3 % floor.
- **V11 Visual.** A hard horizon line in 900 m visibility. *Fix:* the sky merges into
  the fog colour below 1500 m visibility.

### Night (short final)
- Stars, the approach-light ladder, runway and town lights and the lit panel were fine.
- **V12 Visual.** The apron floodlights merged into a solid white block from 4 nm. *Fix:*
  smaller, warm floodlights.
- The crash in this run was the test pilot chasing the glideslope below 100 ft, where the
  beam is geometrically meaningless; the pilot now flies the last 200 ft visually.

### Go-around (called at 300 ft)
- TOGA, "Go around, flaps fifteen", gear up, flaps 15, reposition and the second
  approach all worked and the debrief noted the go-around. (Harness: the go-around
  checkpoints were ordered after minimums and so missed the climb; reordered.)

### Gear up
- "Too low, gear", the configuration horn, the red GEAR UP cell, the belly-landing
  outcome and the slide to a stop were right.
- **P8 Physics.** The ground spoilers auto-deployed on the belly. *Fix:* automatic
  deployment needs the main gear on the ground.

### No flare
- The nose-first arrival, the collapses and the engine strike were right.
- **E3 Evaluation.** The debrief graded a post-bounce contact as a greaser (−211 fpm,
  25/25). *Fix:* the record uses the first contact when the nose hits first and the
  hardest contact of the sequence for the sink rate.

### Long landing without brakes (overrun case)
- **P9 Ground.** The roll-out was under-damped: rudder taps built into a swerve, 12° of
  drift at 105 kts and an excursion. *Fix:* the yaw damper also works on the ground.
- **E4 Physics.** The "landed with drift" collapse rule fired on a wheel re-contact during
  the swerve. *Fix:* it applies only within 3 s of the touchdown; later re-contacts log a
  tyre scrub. (Harness: the long-landing pilot now floats past 1300 m so the case
  actually overruns.)

### Stall on final
- **G5 GPWS.** No stick shaker at 123 kts (1.055 Vs). *Fix:* the warning comes 3.5°
  before the stall (about 1.08 Vs) like the real shaker. (Harness: the stall pilot now
  pulls fully.)

### Full approach (26 nm)
- **P10 Physics.** The start speed was applied as a true airspeed, so the 210 kt start
  read 187 kts at 7000 ft. *Fix:* the start speed is an indicated airspeed.
- (Harness: the checkpoint waits were too short for the 26 nm leg; lengthened.)

## Round 2 (replay on the fixed build)

_Filled in after the replay._
