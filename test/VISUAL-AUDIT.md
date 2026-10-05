# Visual audit — 2026-09-26

The main problem was a collection of weak visual cues: distorted cockpit proportions,
textureless foreground surfaces, flat photographed land, primitive trees and clouds, and
overbright lights. A more capable engine would still draw those assets poorly. This pass
keeps Three.js and changes the composition, scenery, materials and weather rendering.
It is a visible improvement, but does **not** reach the asset quality of a modern commercial
flight simulator. The remaining limitations below are part of the assessment.

**Correction after comparing the source in Blender and the Sketchfab viewer:** the earlier
recommendation to rebuild the cockpit shell was premature. Our conversion raised the upper
shell by 0.20 source units (34 cm at game scale), increasing the windshield frame's vertical
span from about 45 cm to 79 cm. It also darkened the source trim and changed material roughness.
These integration changes have been removed. The camera now fits the original cabin, and
the source colours/roughness are retained in the GLBs. A subsequent runtime finish pass targets
verified panel, liner, seat and yoke parts, documented in `assets/README.md`; it does not deform
the model. The source model has substantial geometric detail;
it has no texture images, and its author explicitly notes the missing roof and animations.
The game's added headliner and live controls remain necessary adaptations.

These priorities reflect the ordinary daytime landing view. The fog defects in item 12
become critical in the storm scenario. Baseline screenshots are preserved locally in the
ignored `test/output/visual-audit-before/` folder; current captures are `test/output/rebuild-*.png`.

| Rank | Cause of the dated appearance | Changes made | Remaining limitation |
| --- | --- | --- | --- |
| 1 | Distorted cockpit/window proportions and poorly placed camera | Removed the upper-shell stretch; fitted the eye to the original cabin; retained desktop 58° FOV and narrow-screen coverage. Checked PFD and ND visibility. | Some surfaces remain simple, but this comparison does not justify replacing the source geometry. |
| 2 | Muddy cockpit colours and flattened material separation | Restored source material values in the GLBs. Verified part assignments in Blender, then added distinct, subtle coated-panel, molded-trim, frame, seat-weave and yoke-rubber finishes at runtime. Modeled lettering is retained. | Liner/upholstery now use CC0 scans, with procedural panel/frame/rubber detail. A uniquely authored aircraft wear/texture set remains absent. See the 2026-09-30 followups. |
| 3 | A completely flat approach corridor | Registered USGS elevation follows the imagery; rendering, collision and navigation share it. The airport is locally graded and a rising terrain cap protects final. | Elevations are locally modified around the fictional airport. Distant mesh resolution and imagery shadows remain limitations. |
| 4 | Blurry aerial imagery ahead of the airport | Sixteen local 1 km detail tiles along the last 8 km, sampled at 0.5 m/px high and 1 m/px low, feather into the existing imagery; four textures stay resident. Distance-faded scanned colour, normal and roughness detail reconstructs fine surface grain in nearby fields and soil. | Underlying NAIP is generally 0.6 m; exports cannot supply finer survey detail. Coverage is a 2 km wide corridor. Five reviewed farm roofs fill prominent detection gaps. One three-building farm has a terrain-following scanned gravel yard. A 2 km interpreted land-cover stretch now replaces nearby field/woodland-floor colours and guides denser planting. Blur, missing buildings and photographic shadows remain beyond these mapped areas and at very low altitude. |
| 5 | Sparse, three-lobed tree blobs | Nine authored forms from three broadleaf sources plus pine/fir, four azimuths at three elevations each. Leaf masks are preserved in all nearby GLBs. One quad faces the eye in yaw and pitch and blends neighboring views. High retains bounded 3D branches and leaves within 180 m. | Distant/low trees remain impostors; view blending and repeated species are still visible. The wider palette is artistic, not a local botanical survey. Shared land-cover boundaries improve density and keep fields open in one 2 km stretch; density elsewhere and close-up silhouettes still expose the approximations. |
| 6 | Thin cloud rings and weak volume | Cached 3D density, connected billows, flatter bases, self-shadowing and directional scattering. Overcast has multiscale structure and matching near-eye relief. | Fair-weather volumes remain simplified and soft at close range. Low uses sprites; overcast is a surface plus shared fog, not a fully volumetric weather system. |
| 7 | Runway lights look like a luminous rectangle by day | Smaller daytime cores, lower daylight intensity, distinct PAPI/beacon sizing and fog attenuation without a minimum visibility floor. Night bloom retained. | Point-based lights approximate optical glare; no lens-scattering simulation. |
| 8 | Flat, muddy illumination and weak foreground depth | Reduced warm daytime lamps in favour of neutral sky light. Sun shadows plus a rebake of close contact and cabin sky access, including the fitted roof. Baked occlusion now affects indirect light rather than darkening the paint and direct sunlight. | No real-time global illumination. The bake approximates sky access and bounced light; it cannot replace fully authored materials. |
| 9 | Box-like airport and disconnected jet bridges | Five glazed gate halls with curved metal roofs and recessed piers connect through a lower concourse. Existing jet bridges reach their aircraft; roof seams, plant, hangar ribs and bases remain. | Buildings are still procedural architecture. A detailed terminal asset would offer a larger further improvement. |
| 10 | Clean rectangular pavement pasted onto the terrain | Irregular runway shoulders, softer grass margins, subtle mowing, asphalt variation, apron slabs and expansion joints. | Ground-level wear, drainage and small debris remain sparse. |
| 11 | Windshields appear absent | Removed the approximation planes fitted to the incorrectly stretched shell during the source-fidelity correction. | Glazing should follow the actual source panes. Refraction, water droplets and optical distortion remain unimplemented; the separate cockpit pass limits physical transmission. |
| 12 | Hard black fog horizon, a dark sheet inside the cloud transition, and lights visible through opaque cloud | Fixed shared atmospheric uniforms on foliage/deck shaders; show cloud surfaces only from outside the deck; removed the lights' 3% fog visibility floor. Added rendered regression checks. | The earlier audit incorrectly blamed a CSS rain overlay: it was already disabled. Existing rain uses 3D streaks driven by relative velocity; realistic water on glass remains future work. |
| 13 | Jagged foliage, grain and inconsistent fine-detail sharpness | Alpha-to-coverage for foliage, anisotropic filtering and mipmapped, metric-scale cockpit finishes. Removed the cockpit shadow normal offset that stippled the double-sided liner; existing 4× world MSAA and cockpit antialiasing remain. | No temporal AA. Thin modeled labels, shadow edges and branches can still shimmer at distance. |
| 14 | Repeating facade grids and weak building contact | Twelve approach facade bays share an atlas: house fronts with doors/shutters, upper floors, sparse sides, barns and loading bays. Houses have a principal entry bay; nearby bevels, smoother panes, canopies and thresholds add depth. Siding relief and roughness separate materials. Gables stay solid. Terrain-following projected shadows now have feathered edges. | Thirty-seven nearby buildings on high / thirteen low use CC0 wall modules. Three additional buildings at the valley farm have complete models, matching roofs and a gravel yard. Most architecture remains procedural; more complete sites and missing-footprint coverage remain needed. |
| 15 | Prototype-like desktop readout bar | Inset, quieter translucent status strip with restrained borders and spacing; controls and readouts retained. | The simulator intentionally retains training/status UI. This matters less than asset quality. |

Further cockpit work should begin with a source-versus-game comparison, not a replacement
model. The approach now has matching building footprints and two valley roads. The next large
scenery gaps are broader coverage of complete buildings with matching ground detail, missing building detections and more convincing crown density;
weather still needs better overcast and windshield water. An engine migration alone would not
provide those assets or effects.

All imported assets remain free and openly licensed. The foliage atlases use
[Tree Small 02](https://polyhaven.com/a/tree_small_02), [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small),
[Fir Sapling Medium](https://polyhaven.com/a/fir_sapling_medium),
[Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree) and
[Island Tree 02](https://polyhaven.com/a/island_tree_02) from Poly Haven, CC0.
Sources, modifications and repeatable preparation commands are in
[`assets/README.md`](../assets/README.md).

## Verification

The broad scenery/rendering pass was verified before the source-restoration correction:

- 364 Node assertions passed across physics, phone, controller, sky, HUD, navigation and game
  suites. This includes new protected-terrain/slope checks and automated landings in every
  weather scenario, including the storm go-around and circuit.
- Browser graphics, navigation maps, Flight School and mobile checks passed across the initial
  run and targeted recheck. One instructor-hint check initially depended on wall time under
  software-rendering load; it now waits for simulated time and passed on rerun.
- The final graphics-only browser run passed 23 checks after the fog fixes, including all
  day/night scenarios on both tiers, sunlight/shadows, HUD alignment and night bloom.
- `node test/visual-review.mjs` checks asset loading, unobstructed PFD/ND, missing-model fallback
  and rendered cloud-transition pixels on both tiers. The horizon must blend into cloud grey,
  and lights well beyond visibility must contribute no visible bright strip.
  The final run passed: mean sky/ground values were 98/99.3 (high) and 98/98.7 (low), with
  at most one 8-bit channel level contributed by the obscured lights.
- Reviewed renderer captures of cockpit, HUD, ND, pedestal, overhead, night, airport,
  and clear/crosswind/storm at close approach. Functional assertions alone did not expose the
  fog defects; screenshots did.

After restoring the cockpit source proportions and materials:

- Both delivered model variants pass `test/cockpit-asset.test.mjs`: source frame dimensions,
  sampled original material colours/roughness, and the live-control bindings are preserved.
- The complete `test/visual-review.mjs` run passed again, including display visibility,
  missing-model fallback and cloud-transition pixels on both quality tiers.
- Graphics, maps, Flight School and mobile browser checks passed across the broad run and
  targeted graphics recheck (101 distinct checks). Two former brightness heuristics depended
  on the altered cockpit: these now check actual sunlit pixels and compare HUD mode with a
  world-only render at the same camera. The final graphics run passed all 23 checks.
- Reviewed the original model in Blender and the Sketchfab viewer, then the game's corrected
  captain, overhead, pedestal and navigation-display captures. The local
  [before/after comparison](output/cockpit-source-comparison.html) includes an original-source
  reference; its Blender lighting is for inspecting geometry, not comparing illumination.
- The flight-physics unit suites were not rerun for this asset/camera-only correction.

Material and cabin-lighting follow-up, verified 2026-09-27:

- Both rebaked GLBs pass the source-dimension, material-value and control-binding checks.
  Geometry and camera placement are unchanged; the bake adds no model triangles.
- The final graphics browser run passed all 23 checks, covering every weather scenario by
  day and night on both quality tiers, sunlight/shadows, HUD visibility/alignment and night lights.
- The full visual review passed again: assets load, PFD/ND remain unobstructed, the missing-model
  fallback works, and rendered cloud/fog transitions remain correct on both tiers.
- Compared daylight candidates and isolated sidewall speckling by switching off shadows.
  Removing the shadow normal offset corrected the double-sided liner's sunlit area. Reviewed
  the final captain, pedestal and night captures; the original source proportions remain intact.
- The local [material/lighting comparison](output/cockpit-material-comparison.html) uses the
  committed source-restoration pass as its baseline. The updated desktop model is 8.2 MB and
  the low-detail model 3.6 MB; detailed surface maps are generated locally only on the high tier.

These checks establish rendering correctness and preserve flight behavior. They do not measure
hardware frame rates or establish photorealism; the asset limitations in the table remain.

## 3D approach scenery — 2026-09-27

The first approach pass uses Microsoft building footprints under CDLA Permissive 2.0,
registered to the existing NAIP imagery. It adds 2,160 houses/farm buildings with original
procedural roof/facade interpretations. The high tier adds roof-edge and nearby window relief;
both tiers retain complete footprints, foundations, modest daytime ground shadows and selected
lit windows at night. The airport/approach-light area stays clear. Buildings remain visual scenery.

Two principal valley roads use public-domain Census centerlines; inaccurate small private drives
were excluded after comparing the data to the photos. Three clipped road sections follow each
graphics tier's actual terrain triangles, with CC0 asphalt detail and high-tier verge markers.
The former 6 km straight airport road is shortened to 3.5 km inside the airfield. Woodland
placement excludes both roads and building bounds, including canopy clearance.

Sources, modifications and reproduction commands are in `assets/README.md`; the runtime
loads two local data files totaling about 460 KB, with no external requests. This creates real
parallax over the photographed settlements, but remains an interpreted scenery layer: it does
not solve close-up ground blur, repetitive tree species or fully authored architecture.

Verified with `node test/approach-scenery.mjs` on both tiers: 2,160 footprints load,
operational-area clearances hold, no planted tree intrudes into building/road clearance,
roof/road triangles face upward, and the scenery ground query agrees with ray intersections
against the actual terrain within 0.001 m. Missing both vector files still leaves the game
and woodland available. Inspected captain, village, close and night captures. The high tier
has about 189,000 building/detail/shadow triangles in total, spatially culled with nearby
window relief dropped at distance; low has about 84,000. These are geometry counts, not FPS.

The full visual review passed again: cockpit assets, PFD/ND visibility, missing-model fallback
and rendered fog/cloud continuity. High and low sky/ground intensities remained approximately
98/99.3 and 98/98.7, with only one channel level contributed by lights behind opaque cloud.
The final graphics browser suite passed all 23 checks, including every weather scenario by
day/night on both tiers, cockpit sunlight/shadows, HUD alignment and Flight School view behavior.


## Ground detail and scenery variety — 2026-09-27

The previous approach pass is committed on main as `2535479`; this followup addresses
its ground blur and repeated vegetation/facades. The new local imagery uses 16 m gutters
and a four-texture cache with disposal, stale-load protection and a base-photo fallback.
The high/low tile set adds about 24 MB on disk. Seven authored tree forms become 28
atlas views (6.5 MB high / 1.8 MB low); the runtime keeps the existing 52,000 / 14,000
instance budgets and concentrates planting along the approach. Trunks now use the actual
rendered terrain height for each tier. Facades share one atlas, reducing building batches
while adding ground-floor doors, shutters, different window spacing and agricultural bays.

The close-up review intentionally includes incomplete source footprint coverage: large
photographic roofs without matching 3D buildings remain visible. Higher-resolution ground
makes this limitation clearer; it is not solved by sharpening or by a rendering-engine swap.

The scenery test freezes its review camera while awaiting streamed imagery. Pausing physics
alone still lets the live camera update tile selection, which initially made the review
captures show the coarse fallback. It now checks active tile uniforms and compares actual
near-ground pixels with detail enabled/disabled, in addition to camera-matched screenshots.


Validation: `node test/approach-scenery.mjs` passes for both tiers, including all 2,160
buildings, seven populated tree forms, twelve populated facade profiles, a maximum of
four resident detail tiles, stale-load races, missing-tile fallback and clear road/building
exclusions. With the review camera fixed, enabling detail changes the sampled close-ground
pixels by a mean 10.13/255 (high) and 15.45/255 (low). These deltas establish that the tiles
reach the rendered image; visual review, not the metric alone, establishes sharper detail.
The approach geometry uses 593 batches / 176,592 triangles high and 207 / 102,336 low.

`node test/visual-review.mjs` also passes: unobstructed PFD/ND, missing-cockpit fallback,
night and close-approach weather views. In-cloud sky/ground intensity stays approximately
98/99.48 high and 98/98.74 low; distant lamp contribution remains 1/255 and 2/255. Fixed
captain, village, close and night views were inspected on high and low. The local
`test/output/approach-scenery-review.html` compares them with the committed baseline.
Hardware frame rate has not been benchmarked; the additional imagery is memory-bounded,
and low quality uses smaller imagery, foliage and facade atlases.


## Close-range geometry and missing farm roofs — 2026-09-27

Five visually reviewed roof traces now supplement the ML footprints, including the long
flat photographic barn in the close view. They use the existing public-domain tiles;
raw pixel vertices are retained in `approach-infill.json`. Metal roof seams, interpreted
agricultural openings, eaves and terrain-fitted foundations give these sites real parallax.
This is a targeted repair, not complete roof detection or surveyed reconstruction.

Nearby high-quality trees now use the same CC0 source geometry as the canopy atlas.
A first aggressive reduction visibly thinned the crowns and was rejected. The final
broadleaf retains about 159,000 triangles, including separately preserved wood geometry;
a matched oblique source comparison retained approximately 85% of opaque canopy coverage
(71,677 versus 84,255 pixels). That single view is a simplification check, not a complete
shape-fidelity metric. Pine and fir forms keep about 19,000–122,000 triangles each.
The fir comparison also rejected an over-simplified candidate; the retained version has
48,829 opaque pixels against the source’s 43,724 in the same view. The slight increase
reflects triangulation, masking and quantization changes; it is not added botanical detail.

Only trees within 180 m are eligible, with complementary card/geometry dithering from
90–180 m. The pool targets 32 trees / 1.8 million triangles and allows retiring instances
within hard limits of 48 trees / 2.4 million triangles. Low quality does not download these
models, and failed model loads retain the full atlas woodland. Hardware frame rates have
not been benchmarked; the high tier trades a bounded geometry cost for nearby depth.

Validation: `node test/approach-scenery.mjs` passes on both tiers with 2,165 buildings,
including the five additions, and no tree/building or road-clearance violations. The
review position selects 18 geometry trees / 1,799,957 triangles. Camera moves and vertical
passes stay within the hard pool limits; low quality makes no near-tree GLB requests.
Missing supplementary footprints, model failures and ground-tile failures retain their
fallbacks. Ground tiles remain bounded to four resident textures. The approach building
geometry uses 596 batches / 177,663 triangles high and 210 / 102,551 low, excluding trees.

`node test/visual-review.mjs` also passes: cockpit assets, unobstructed PFD/ND, missing-model
recovery, and rendered cloud transitions on high and low. Cloud sky/ground values remain
98/99.48 high and 98/98.74 low; distant light contribution is 1/255 and 2/255. Inspected the
final close, woodland, night and captain captures. The local scenery review offers both
the previous scenery pass and committed baseline, plus matched card/geometry tree views.
Close-ground imagery, simple farm walls and hard approximate building shadows still limit
these low-altitude views; this pass adds depth without establishing photorealism.


## Surface depth, distant trees and GPU measurement — 2026-09-28

The preceding scenery work was committed and pushed to main at `b707c85` before this
followup. This pass addresses the four remaining causes identified in the close review:

- Ground: finer scanned colour at two rotated scales, plus distance-faded normal and
  roughness detail, retains the imagery's large field boundaries. Colour masks suppress
  bright roofs and neutral roads. This supplies interpreted surface texture, not finer
  aerial survey data. Baked photo shadows and missing features remain.
- Trees: one camera-facing quad blends adjacent source azimuth views. Six triangles
  become two per distant tree, eliminating crossed/edge-on planes and reducing overdraw.
  High-quality near geometry retains its previous budgets. Distant and low-quality trees
  are still upright impostors; overhead views and silhouette interpolation remain limits.
- Facades: a principal house entrance replaces repeated front doors. Raised, beveled
  surrounds put smoother panes behind their frames; lintel canopies and thresholds add
  depth. Independent siding bump/roughness maps distinguish wall surfaces from glass.
  These remain procedural interpretations, not individually authored architecture.
- Shadows: projected convex silhouettes now feather over roughly 0.6–1.8 m, fade further
  under overcast, and subdivide to follow terrain. They still supplement shadows baked
  into the aerial photo; they are not physically traced penumbrae.

The first full scenery run passed on both tiers, including missing imagery/model/data
fallbacks, all 2,165 buildings, seven tree forms and twelve populated facade profiles.
The rendered close-surface toggle changed mean ground pixels by 4.34/255 high and
4.92/255 low; close, ground-level and village captures were inspected. These pixel
checks establish rendering coverage, not photorealism.

Hardware measurements use `test/render-benchmark.mjs`, separate from the SwiftShader
correctness suite. An initial camera-restoration/streaming setup error was corrected
before the retained comparison. The benchmark uses the actual Apple M2 Pro through
ANGLE Metal, paused flight physics, fixed render scale and a gently moving near-ground
camera. RAF pacing is capped near 60 Hz. See `RENDER-PERFORMANCE.md` for the retained
resolution, frame times and limits; these are renderer measurements, not full-flight
physics or cross-device performance guarantees.

Final verification: the hardware captures of the ground, farm shadows and entrance-side
facades completed without renderer errors on both tiers. Three sun directions over all
2,165 footprints produced no reversed or non-finite shadow faces after discarding tiny
slivers before float32 conversion. `node test/visual-review.mjs` passed again: cockpit
assets, PFD/ND clearance, missing-model recovery and cloud continuity. The final high/low
cloud sky-ground means were 98/98.90 and 98/98.38, with distant light contribution 1/255.
Hardware frame pacing was close to pushed main: high 31.5 FPS captain, 40.5 nearby and
47.9 storm at 1.5× render scale; low stayed near the 60 Hz ceiling at 1×.


## Cockpit light and surveyed landscape — 2026-09-30

This pass addresses the first two remaining priorities: cockpit material/light response and
landscape structure. The source cockpit geometry, eye point, animated controls and GLB
material values are retained. It adds CC0 scanned liner grain and woven upholstery, refines
paint/frame/rubber roughness, and adds two broad side-window lights on high quality. The
lights use the existing baked cabin occlusion; direct sunlight retains its frame shadows.
Their diffuse integral is cached on the existing vertices in cabin coordinates, with
separate front/back values. Per-pixel area lighting runs only for reflection captures.
A regression test checks that translating/rotating the cockpit leaves this integral unchanged.
Both tiers cache interior reflection maps from the fixed pilot eye, with separate above-
and below-cloud captures. The cabin filter has its own PMREM generator. Looking down or
leaning into the ND cannot move the capture point; captured cabin orientation follows the
airframe. Scenario changes dispose the previous captures.

The old 1.4 km-wide, almost approach-length flat strip and synthetic hills have been replaced
with registered public-domain USGS 3DEP heights. Two bundled grids cover the same 80 km region
and 24 km approach as the photographs; exact requests, sample spacing and hashes are recorded
in the asset manifest. The fictional airport is locally levelled, with a rising terrain cap
protecting final and climb-out. Ridges follow photographed forest bands and valleys carry
the existing fields/roads. Shared edge normals and buried skirts close terrain-patch seams.
Physics uses the same height data from startup; the hull support plane also follows ground
height so valleys below airport datum do not produce invisible collisions.

Validation:

- `npm test` passes, including surveyed-height registration, flight below airport datum,
  airport grading, approach clearance, source model dimensions and control bindings. The
  game suite completes full approaches, adverse-weather landings, go-arounds and circuits.
- `test/approach-scenery.mjs` passed on both tiers during the terrain pass: 2,165 building
  footprints, foundations/roads matching terrain triangles, tree clearances, bounded
  imagery/model pools and failure fallbacks. Maximum placement-query error was below 0.001 m.
- Final `VISUAL_GPU=metal node test/cockpit-lighting.mjs` passes repeated day/night/weather
  changes on both tiers, finite reflection pixels, bounded reuse across a cloud layer,
  disposal on restart and missing-scan fallback. It measures non-emissive panel pixels so
  a loaded-but-black cabin fails. Day and night brightness are checked separately.
- Final `VISUAL_GPU=metal node test/visual-review.mjs` passes PFD/ND visibility, missing-model
  recovery and cloud transitions. High sky/ground means were 98/99.09; low 98/98.54, with
  distant lamp contribution 1/255 in both cases. Night screenshots were inspected.
- A software-renderer day-to-night capture exposed a black-cabin candidate before the
  capture/filter changes. Final software retries on 2026-09-30 could not complete browser
  initialization (one reported WebGL context creation failure; another timed out). Those
  retries are **not** counted as passes. Final render checks above use the Apple GPU.

Matched before/after images and a local comparison are in
`test/output/deck-terrain-review.html`; baseline is committed main `e66583b`.

Final Apple M2 Pro renderer measurements against that baseline: high captain 30.1 → 28.5
FPS, nearby 37.7 → 36.1 and storm 46.3 → 44.5 at 2160 × 1350 render pixels. Low remained
at the 60 Hz ceiling at 1440 × 900. High captain p95 frame time increased from 33.5 to
50.0 ms. Caching diffuse window illumination recovered most of the initial area-light
cost, but the finished change still has a measured 4–5% high-tier average FPS cost.
Draw calls are unchanged. See `RENDER-PERFORMANCE.md` and the retained JSON reports for
the paused-physics method and limits; loading and capture stalls are not benchmarked.

Remaining limits: cockpit finishes are still an interpretation rather than an aircraft
photogrammetry set; reflections are captured from one point and are not continuously
rebaked as sunlight moves during a turn. Airport grading modifies the real DEM locally.
Distant mesh resolution, vegetation cards, simplified facades, cloud shapes, photographic
shadows and the missing fitted windshield still limit realism. The camera-matched valley
comparison shows a substantial change in landform; the cockpit change is more restrained.

## Review fixes: portable lighting, delivery and quality — 2026-09-30

The external review correctly identified an unguarded cabin capture. Passing on the M2 Pro
did not establish portability. Area lights are now absent from every rendered scene; the
finite baked window irradiance also lights the capture. Before use, each half-float target
is read once and rejected for NaN/Infinity or no illumination. Failure disposes the target
and retains the ordinary sky/fill environment, caching that result until the next scenario.
The unused area-light lookup libraries were removed. The original cockpit geometry remains.

The lighting regression passes day/night/weather transitions on both tiers and deliberately
injects invalid pixels and a thrown capture error. It verifies a lit painted panel in the
fallback, one attempt per weather layer and no rendered area lights. Hardware validation
uses ANGLE Metal on the Apple M2 Pro. SwiftShader on this Mac failed to create WebGL before
the simulator initialized (`BindToCurrentSequence failed`); its result is **not** a pass and
the external reviewer's GPU/driver remains independently unverified.

Startup now waits for the flight deck and four small imagery previews. Full photos, detail
tiles, roads, buildings, planting and parked aircraft stream after the first playable frame.
Near-tree models are requested separately only within 450 m of woodland. Lossy WebP retains
the imagery's pixel dimensions; canopy alpha and the losslessly encoded packed cockpit scans
were compared with the originals and are unchanged. Fir geometry is reduced conservatively;
broadleaf/pine triangle counts remain unchanged. Source and delivery sizes are recorded in
`assets/delivery.json`. The asset directory decreases from 82.61 MB to approximately 57.7 MB
(decimal), rather than retaining duplicate JPG/PNG delivery copies.

Desktop automatic mode starts at 1× scale and tests actual rendered-frame pacing, retaining
high effects only when the sample's p90 is at most 22.5 ms. Explicit URL tiers remain fixed.
Adaptive resolution monitors the real flight, including streamed scenery; sustained slow
frames at the resolution floor drop shadows, post-processing and volumetric cumulus without
restarting. Incomplete calibration selects low. Tests cover slow/unstable samples, isolated
hitches versus repeated stalls, manual overrides and a simulated slow browser cadence.

Functional browser groups retain the real low-detail cockpit, live displays, flight physics
and controls. A test helper suppresses optional scenery downloads and repeated reflection
bakes; the graphics group explicitly restores the complete scene and selects high. E3 now
asserts the intended 58° desktop FOV and −14° cockpit pitch. All **270 browser checks passed
in 352 seconds with three processes** on ANGLE Metal, including mouse/keyboard, touch, tilt
and controller landings and all graphics checks. This is not a software-renderer timing
comparison with the reviewer's machine. The final Node suites also passed. Separate scenery
checks cover both tiers, missing assets, tree budgets and placement; visual checks preserve
PFD/ND visibility and cloud transitions. Performance and transfer measurements are retained
in `RENDER-PERFORMANCE.md` with their limits.

## Follow-up: reflection source, Retina recovery and hidden tabs — 2026-09-30

The second external review found that rejecting invalid captures prevented a black cockpit
but did not remove every source of invalid radiance. The surface-gradient bump shader could
normalize a zero vector on degenerate/projected-flat geometry. It now preserves the original
normal when the bumped vector has negligible magnitude; ordinary relief is unchanged. The
shader cache key is updated. Capture validation and the lit fallback remain as safeguards.
No cockpit geometry, asset files or material assignments were changed.

Automatic desktop resolution still starts at 1×, but stable fast frames can now increase it
to the native screen ratio, capped at 1.5×. Existing slow-frame backoff reduces that ceiling
after a failed increase. Phones retain their existing starting ceiling, and explicit DRS
settings are respected. This permits sharper output where measured pacing allows it; it is
not a claim that the previously benchmarked M2 Pro can sustain high at 1.5×. Calibration now
waits for a visible tab, discards interrupted samples and measures again in the foreground.

Verification for this follow-up:

- All Node suites passed, including fast-frame resolution recovery, backoff, native 1× and
  manual limits, initially hidden calibration and a sample interrupted by hiding the tab.
- The lighting suite passed on ANGLE Metal / Apple M2 Pro. A new rendered test uses the actual
  surface GLSL with zero and near-zero derivatives: both preserve the unit normal `(0,0,1)`.
  The ordinary case still applies relief. Both tiers produce finite, illuminated reflection
  captures across day/night/weather changes; normal scenarios reject any use of the fallback.
  Invalid-readback and failed-capture fault injection still verifies a lit fallback.
- Delivery checks passed with a simulated hidden Retina startup followed by slow foreground
  frames: calibration waits, then selects low from measured frames and retains a 1.5× ceiling.
  Startup budgets, streamed downloads and terrain registration still pass.
- Visual checks passed for loaded assets, PFD/ND visibility, missing-model fallback and cloud
  transitions. The full functional browser suite was not rerun for this follow-up.

The external reviewer independently reported 270/270 functional checks passing on their
software renderer before this follow-up, and passing lighting checks with their own shader
guard. Locally, a fresh SwiftShader probe still cannot create WebGL
(`BindToCurrentSequence failed`), so this exact revision remains unverified on that backend.
Streaming pop-in/decode stalls, the high cockpit download before automatic tier selection,
phone framing/HUD placement and the retained historical asset bytes remain unchanged.

## Measured performance, vegetation and cloud sequence — 2026-10-01

The sequence was implemented and benchmarked in separate stages at the same resolution.
A cached density volume replaces the high-tier cloud shader's repeated noise calculations;
near-tree instance buffers and bounds now change only when their content changes. On the
M2 Pro at 1.5×, final captain FPS rises from 28.5–29.3 to 41.3 and nearby FPS from 34.7–37.4
to 52.8. Storm remains within the baseline range; low stays near 60 FPS. Stage results,
frame percentiles and measurement limits are in `RENDER-PERFORMANCE.md`.

The existing CC0 source trees were rebaked into 84 views: four azimuths at side, 45° and
90° elevations. Distant quads now pitch toward the eye, use source-specific padded framing
and blend neighbouring elevation/azimuth samples with premultiplied alpha. A rendered
regression measured zero overhead coverage for the old upright tree, versus 4,780 covered
pixels for the new crown; the new side/oblique views cover 3,529 / 4,190 pixels. Geometry
and instance budgets are unchanged. Smaller individual atlas frames reduce the combined
atlas bytes from 1.77 MB to 0.83 MB, despite adding viewpoints.

Four connected cloud shapes retain empty filtering borders in a cached density volume.
Self-shadowing remains three-dimensional; a finer ray march and directional scattering
change the lighting at roughly 1–3 FPS cost relative to the preceding optimized stages.
Overcast now uses warped multiscale texture, correlated surface relief and denser sampling
near the eye using the existing vertices. The prescribed ceiling, visibility, rain,
lightning and flight physics are unchanged. Explicit gzip keeps cloud transfer to 79 KB;
missing/corrupt data or unavailable decompression retains the analytic shader. The loader
also accepts data already decoded by the host.

Verification: Node suites, the approach-scenery suite on both tiers, 23 browser graphics
checks, visual/fog/display checks and staged-delivery budgets pass on ANGLE Metal. The new
vegetation/weather test covers overhead canopy area, stable settled-tree buffers, volume
loading/disposal and fallback paths. The full functional browser suite and software
renderer were not rerun. Matched local before/after views and stage measurements are in
[the comparison page](output/performance-vegetation-clouds.html).

Remaining limits: species repetition, image-based distant/low vegetation, simplified cloud
microstructure, sprite clouds on low and a surface-based overcast deck. Tree model downloads
and scenery streaming can still produce loading stalls. These changes do not add authored
houses, windshield glazing/water, or change phone camera/HUD framing.


## Authored architecture and mature-tree diversity — 2026-10-01

This pass follows `e5cc6ed`, addressing buildings/airport first and vegetation second, with
separate stage measurements. Two CC0 Poly Haven kits by James Ray Cock supply recessed
windows, doors, brick/plaster finishes and utility bays. They replace walls on 40 selected
close-approach buildings on high quality (306 bays, 211,908 triangles, 24 batches), or 16 on
low (125 bays, 72,279 triangles, 15 batches). Source UVs and material maps remain; normalized
attributes are decoded before world transforms, and the source +Z facade normal faces out.
Footprints, roofs, foundations and feathered ground shadows retain their registration.
If a kit fails, all 2,165 procedural buildings remain available.

The airport's long slab becomes five glazed gate halls with curved metal roofs, recessed
piers and entrance canopies, joined by a low concourse. These are original procedural
architecture, not a downloaded complete terminal. They give the stands a more articulated
silhouette, but still lack the clutter, material variation and bespoke detail of a major
commercial simulator's airport.

Jacaranda Tree and Island Tree 02 add two CC0 mature crown silhouettes, spatially grouped
alongside the original broadleaf and conifers. Nine forms now have 108 baked views; high
quality uses all five source GLBs within the existing 32 target / 48 hard instance and
1.8M target / 2.4M hard triangle budgets. The new palette is fictional, not a claim that
these species occur in the Pennsylvania source imagery. Total tree counts and building/road
clearance rules remain unchanged. Distant/low crowns are still image-based.

Close-up inspection also found a pre-existing conversion defect: Sharp removed the newly
joined leaf alpha, leaving opaque leaf rectangles in all three original near-tree GLBs.
The corrected pipeline separates alpha removal and joining. Delivered original models
have repaired masks without geometry changes; the two additions use the corrected pipeline.
A Node regression checks both transparent and opaque pixels in every MASK material.

Validation: the Node suites, authored-scenery integration/fallback test, approach-scenery
test on both tiers, download/automatic-quality test, vegetation/cloud fallback test, and
23 browser graphics checks pass on Chromium 141 / ANGLE Metal. Both matched real-time
streaming autolands finish with score 100/A. The complete functional browser suite was not
rerun for this scenery-only change; SwiftShader cannot initialize on this local machine.
Matched farm, village, airport and woodland views, plus final close-building/night views,
are available in [the local review](output/authored-scenery-review.html).

High at 1.5× remains about 42 FPS captain / 55 nearby / 45 storm on the M2 Pro; low remains
60 FPS. New detail did not cause a material measured FPS regression, but high streamed
payload rises from 45.07 to 51.49 MB. The real-time high 1× flight averages about 58 FPS,
with approximately 1.1-second startup stalls and shorter descent stalls still present.
See [the staged measurements and limits](RENDER-PERFORMANCE.md#authored-facades-gate-halls-and-mature-trees--2026-10-01).

Remaining priorities: streaming/decode/upload stalls; complete authored roofs/building
models and missing-footprint coverage; ground-level photographic blur/shadows; distant
canopy transitions and density; windshield water and more detailed overcast. The cockpit
source geometry is unchanged in this pass.


## Remote performance integration — 2026-10-02

Remote commits `858f9d5` / `e0b0b69` have been combined with the local authored scenery.
Their shadow-pass reduction and menu preparation address actual costs without removing
cockpit geometry or the new assets. Tree fade changes now invalidate the cached shadow map,
within its one-second limit; cancellation is checked before warm-up and after asynchronous
shader compilation. These corrections have regression coverage.

With the same local assets on both sides, the M2 captain view stays at 40.6 FPS at 1.5×,
although about 586k fewer triangles are submitted per frame. In the complete high 1× flight,
worst recorded frame time improves from 1.22 s to 183 ms and average FPS from 57.7 to 59.4.
Start waits 5.73 s rather than 0.60 s on localhost; no scenery requests begin during the
prepared flight. Smaller stalls remain, so the earlier remaining-stalls priority is reduced,
not closed. Menu preparation transfers about 59 MB on high before normal Start completes.

Both complete landings, the selected 139 browser checks, Node suites, scenery fallbacks,
download/quality selection and cockpit lighting checks pass. See the detailed methodology,
tradeoffs and saved reports in [the integration measurements](RENDER-PERFORMANCE.md#remote-performance-integration--reviewed-2026-10-02).


A complete desktop-auto flight at device pixel ratio 2 also succeeds: 59.37 FPS, high effects
retained, a single 1.1× probe rejected and the rest at 1×. This smoothness comes with lower
Retina sharpness than forced 1.5×. It does not establish 60 FPS at full high resolution.


## Complete farm buildings and matching ground — 2026-10-05

The valley farm beside final now replaces three whole buildings rather than only their
wall bays. Original Blender models retain the registered footprints and interpreted heights,
with weathered timber siding, recessed windows, sliding doors, roof seams and vents, gutters,
downpipes, fascia and foundations. The yard and access drive follow the rendered terrain,
using scanned gravel with irregular feathered margins, worn lanes and foundation contact
shading. Wood and gravel maps are CC0, documented in the asset credits and source manifest.
The 737 source model and flight physics are unchanged.

This is one completed site, not a general replacement for NAIP imagery or the 2,165-building
layer. Its architecture is interpreted, not a reconstruction of a surveyed farm. Low uses
smaller textures on the same bounded geometry. All three original buildings remain if the
new GLB or a yard texture is unavailable. Tree exclusion, distant footprint shadows and
night window lighting remain active.

Matched high/low farm, workshop, wider-approach and night views are in
[the local before/after review](output/valley-farm-review.html); overcast captures verify
that the added material follows the atmosphere. Thin roof seams still alias at 1×.
Outside the yard, blurred photographic surfaces and shadows remain visible. The next large
scenery priorities remain more complete sites with matching ground, denser and better-blended
vegetation, and improved overcast/windshield weather. The farm pass does not close those items.

The full high 1× flight remains 59.9 FPS on the M2 Pro. The fixed nearby high 1.5× view changes
from 51.3 to 50.3 FPS; low stays at 60. The site adds 1.65 MB high / 0.86 MB low and eight draw
batches before accounting for the removed facade geometry. See the saved reports and limits
in [the performance record](RENDER-PERFORMANCE.md#complete-valley-farm-and-ground-tile-flight-follow-up--2026-10-05).

Validation includes the Node suites and new asset checks for bounded geometry/transfer,
finite attributes and nondegenerate timber UVs. Browser checks cover roof orientation and
height, yard-to-terrain alignment, tree exclusion, both quality tiers, night/overcast,
and complete fallback when the farm model or yard material fails to load. The existing
approach-scenery integration tests also pass, including ground streaming and missing data.

The graphics group passes **23/23** on ANGLE Metal, covering all day/night weather scenarios,
lighting, shadows and quality tiers. Download/hidden-tab checks also pass. A SwiftShader run
failed before simulator initialization; an isolated blank-page probe confirmed that this
Chromium build cannot create a SwiftShader WebGL2 context. Software-renderer validation of
this pass remains unverified; the successful results above are hardware-renderer checks.


## Continuous approach ground and woodland — 2026-10-05

A 2 km × 850 m rectangle beside final now shares an interpreted land-cover mask between
ground shading and woodland placement. Fifteen parcels were traced from the bundled NAIP
detail imagery. About 21.12 ha of meadow, 6.40 ha of stubble and 33.22 ha of woodland receive
blended reconstructed surfaces. The remaining area retains its photo, road or yard material.
This reduces blurred photographic crowns and baked shadows within the mapped parcels,
while the existing scanned ground grain, normal and roughness detail remains active.

Woodland is planted with irregular spacing and mixed mature crown forms; the same map
keeps fields open. There are 3,842 high / 1,783 low explicitly placed woodland trees,
reallocated from the existing 52,000 / 14,000 total rather than added on top. Within the
rectangle, total trees change from 4,311 to 5,500 high and 1,148 to 2,209 low, concentrated
in the interpreted forest parcels. Mapped building/road clearances and the protected airport
area remain intact. Missing land-cover assets retain the previous surface and planting.

This is a limited coverage pass. Distant and low-tier trees still use image-based crowns;
up-close canopies, transitions and species repetition remain visible. Fields still lack
convincing ground-level crop/grass geometry. Two blade experiments were rejected after
visual inspection because their sparse repetition added little realism. The surrounding
unmapped imagery still shows blur, baked shadows and missing buildings. More complete
sites, broader land-cover coverage, overcast and windshield water remain priorities.

Matched high/low wide, canopy, field, final and overcast views are in
[the local comparison](output/approach-corridor-review.html). Performance measurements and
validation are recorded in [the performance log](RENDER-PERFORMANCE.md#continuous-approach-ground-and-woodland--2026-10-05).

All 14 Node suites, both-tier corridor/fallback checks, existing approach/vegetation/authored
scenery checks, delivery/automatic quality and 23 graphics checks pass on Chromium Metal.
The complete high 1× landing stays at 59.88 FPS (59.89 before), p99 16.8 ms, with no in-flight
requests. High 1.5× wide corridor pacing changes from 55.1 to 53.1 FPS; low remains 60 FPS
on the M2 Pro. Other devices and SwiftShader are unverified. The full functional browser
suite was not rerun.
