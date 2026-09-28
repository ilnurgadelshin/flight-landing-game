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
| 2 | Muddy cockpit colours and flattened material separation | Restored source material values in the GLBs. Verified part assignments in Blender, then added distinct, subtle coated-panel, molded-trim, frame, seat-weave and yoke-rubber finishes at runtime. Modeled lettering is retained. | The detail maps are small original procedural surfaces, not photographic scans or a uniquely authored wear/texture set. Material refinement remains partial. |
| 3 | A completely flat approach corridor | Rolling relief outside the protected runway/approach strip; denser terrain mesh near the airport; rendering and collision use the same height function. | Heights are synthetic, not surveyed elevation. The safe approach strip is deliberately flat. |
| 4 | Blurry aerial imagery ahead of the airport | Sixteen local 1 km detail tiles along the last 8 km, sampled at 0.5 m/px high and 1 m/px low, feather into the existing imagery; four textures stay resident. Distance-faded scanned colour, normal and roughness detail reconstructs fine surface grain in nearby fields and soil. | Underlying NAIP is generally 0.6 m; exports cannot supply finer survey detail. Coverage is a 2 km wide corridor. Five reviewed farm roofs now fill prominent detection gaps. Other missing buildings and photographic shadows remain visible from very low views. |
| 5 | Sparse, three-lobed tree blobs | Seven authored forms across broadleaf, pine and fir, four views each; one camera-facing quad blends adjacent source azimuths instead of exposing crossed planes. Crown proportions and smaller understory heights are retained. More of the fixed tree budget goes into approach stands. High quality now uses simplified 3D trunks/branches/leaves within 180 m, with complementary LOD fading and fixed geometry budgets. | Distant and low-tier trees remain impostors; steep overhead angles still expose the limits of upright images. Only one broadleaf source model is available, and simplified leaves and LOD transitions remain visible close up. |
| 6 | Thin cloud rings and weak volume | Taller, denser cloud shapes; varied rotation; deeper bases and multiple sun-occlusion samples in the high-tier volume shader. | Fair-weather clouds remain simplified noise volumes. Low quality retains sprites; overcast is not a complete volumetric cloud system. |
| 7 | Runway lights look like a luminous rectangle by day | Smaller daytime cores, lower daylight intensity, distinct PAPI/beacon sizing and fog attenuation without a minimum visibility floor. Night bloom retained. | Point-based lights approximate optical glare; no lens-scattering simulation. |
| 8 | Flat, muddy illumination and weak foreground depth | Reduced warm daytime lamps in favour of neutral sky light. Sun shadows plus a rebake of close contact and cabin sky access, including the fitted roof. Baked occlusion now affects indirect light rather than darkening the paint and direct sunlight. | No real-time global illumination. The bake approximates sky access and bounced light; it cannot replace fully authored materials. |
| 9 | Box-like airport and disconnected jet bridges | Terminal length matches all five stands; roof seams, flashing, HVAC, hangar ribs, building bases and articulated bridge ends reaching the aircraft. | Buildings are still procedural architecture. A detailed terminal asset would offer a larger further improvement. |
| 10 | Clean rectangular pavement pasted onto the terrain | Irregular runway shoulders, softer grass margins, subtle mowing, asphalt variation, apron slabs and expansion joints. | Ground-level wear, drainage and small debris remain sparse. |
| 11 | Windshields appear absent | Removed the approximation planes fitted to the incorrectly stretched shell during the source-fidelity correction. | Glazing should follow the actual source panes. Refraction, water droplets and optical distortion remain unimplemented; the separate cockpit pass limits physical transmission. |
| 12 | Hard black fog horizon, a dark sheet inside the cloud transition, and lights visible through opaque cloud | Fixed shared atmospheric uniforms on foliage/deck shaders; show cloud surfaces only from outside the deck; removed the lights' 3% fog visibility floor. Added rendered regression checks. | The earlier audit incorrectly blamed a CSS rain overlay: it was already disabled. Existing rain uses 3D streaks driven by relative velocity; realistic water on glass remains future work. |
| 13 | Jagged foliage, grain and inconsistent fine-detail sharpness | Alpha-to-coverage for foliage, anisotropic filtering and mipmapped, metric-scale cockpit finishes. Removed the cockpit shadow normal offset that stippled the double-sided liner; existing 4× world MSAA and cockpit antialiasing remain. | No temporal AA. Thin modeled labels, shadow edges and branches can still shimmer at distance. |
| 14 | Repeating facade grids and weak building contact | Twelve approach facade bays share an atlas: house fronts with doors/shutters, upper floors, sparse sides, barns and loading bays. Houses have a principal entry bay; nearby bevels, smoother panes, canopies and thresholds add depth. Siding relief and roughness separate materials. Gables stay solid. Terrain-following projected shadows now have feathered edges. | These are procedural interpretations. Shared bays and simple roof forms remain recognizable close up; individually authored houses would improve architectural detail. |
| 15 | Prototype-like desktop readout bar | Inset, quieter translucent status strip with restrained borders and spacing; controls and readouts retained. | The simulator intentionally retains training/status UI. This matters less than asset quality. |

Further cockpit work should begin with a source-versus-game comparison, not a replacement
model. The approach now has matching building footprints and two valley roads. The next large
scenery gaps are additional mature tree species, authored house/farm assets and wider coverage for missing building detections;
weather still needs better overcast and windshield water. An engine migration alone would not
provide those assets or effects.

All imported assets remain free and openly licensed. The foliage atlases use
[Tree Small 02](https://polyhaven.com/a/tree_small_02), [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small)
and [Fir Sapling Medium](https://polyhaven.com/a/fir_sapling_medium) from Poly Haven, CC0.
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
