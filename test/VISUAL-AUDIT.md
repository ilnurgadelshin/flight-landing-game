# Visual improvement audit

## Current status — 2026-10-23

This section is the current checklist. The original September audit and dated work log
below record how the scene evolved; their older counts, captures and priorities are not
the remaining-work list. Update this section after each reviewed visual pass, including
what changed, visible impact, measured cost, evidence and limitations.

The latest pass extends woodland onto the hillside visible through the pilot's left
windshield during early and middle final. **381.06 ha of wooded cover and 25.26 ha of
open clearings** bring combined interpreted cover to about 1337 ha. The original close
mask, five planting allocations and 62 complete buildings across eight sites remain.
A separate hill allocation uses the existing total tree budget, reducing wider random
planting. Distant buildings now omit tiny trim while retaining walls, roofs and glass.
This improves a visible gap in the normal pilot view; it does **not** close the broader
scenery category or improve the underlying distant tree forms.

Specific defects already addressed include the distorted source cockpit shell, black cabin
reflection failure and degenerate panel normal calculation, the narrow phone windshield/MCP
readout overlap, repeating rain resets, abrupt overcast boundary whiteout, and flat floating
canopy shade. Recent work also added complete airport halls, window depth, part-fitted cockpit
wear, filtered ground materials and directional tree lighting. Those completed corrections
should not be presented again as untouched tasks. Their broader quality limitations remain.

### Remaining priorities, ranked by likely visual impact

| Rank | Remaining work | Importance | Current limit / next acceptance evidence |
| --- | --- | --- | --- |
| 1 | Broader, coherent approach scenery | Very high | Eight complete sites and the newly wooded left hillside cover selected stretches; most buildings remain procedural and other hills remain photographic. Continue connected grounds and missing-footprint checks in pilot-visible areas. Evaluate wider coverage against the remaining background tree budget, with normal flight views and measured cost. |
| 2 | Mid-distance and distant vegetation | High | The hillside gap is denser, but distant/low-tier crowns still expose image planes, repeated species and thin silhouettes. The new coverage makes those form limits more apparent. Improve them within the existing instance budget and compare moving views before accepting additional geometry or sampling cost. |
| 3 | Complete cockpit material and lighting detail | High | Selected front panels, padding and grips have fitted wear; side consoles/overhead still lack a complete aircraft-specific texture set. Indirect light and local shadows remain approximations. Begin with source/game comparison and protect instrument readability on both tiers. |
| 4 | Temporal stability of fine detail | Medium–high | Thin labels, branches, roof details and shadow edges can shimmer in motion. Evaluate actual flight motion and GPU cost, not only static screenshots. |
| 5 | Finer cloud and wet-weather rendering | Medium overall; high in weather scenarios | Fair-weather clouds retain repeated forms; overcast uses bounded resolution/steps and a simplified deep interior. Water films and blade contact remain approximate. Preserve the corrected rain timing and cloud-entry visibility. |
| 6 | Airport ground-level detail and local shadows | Medium | Terminal glass and architecture improved, but wear, drainage, service clutter and shadows on raised surfaces remain sparse. Concentrate on details visible during flare/rollout. |

Performance and compatibility are acceptance requirements for every item, rather than a
separate cosmetic milestone. Current high-resolution scenes still fall below 60 FPS on
the M2 Pro; retain adaptive quality and report costs. Physical phones, ordinary laptops
and multiple GPU drivers need wider validation. Existing SwiftShader evidence in the log
does not certify the latest pass on those devices.

### Pilot-visible hillside: implementation and evidence

Baseline: published main `9c135d2`. Source: the existing public-domain
`final-approach.webp`, interpreted in `tools/approach-hills.mjs`. The photographed
leaf-off woods use the existing leafy palette; this is not a seasonal or botanical survey.

- A 3.2 × 1.47 km hillside tile retains six open pasture/clearing holes, building and road
  clearances, and soft outer coverage fades. Its weighted coverage is 406.32 ha. The
  original 3450 × 1015 mask pixels are byte-identical to the baseline.
- A coarser 1024 × 256 tile shares the existing mask texture and sampler. Combined upload:
  3450 × 1271 high / 2048 × 754 low. Cover data increases **17,855 bytes**, GPU texture
  storage **3.53 MB high / 1.24 MB low**, and packed CPU samples **0.52 MB**. No new
  imagery, models or materials are downloaded.
- The hill allocation is 8000 / 1000 high/low, within the unchanged **52,000 / 14,000**
  total instances. Earlier mapped zones keep their seeds, bounds and caps. This leaves
  fewer photo-selected background trees; it is a redistribution, not free extra coverage.
- Complete-building detail levels remove painted/ironwork triangles smaller than 0.08 m²
  beyond the group's bounding radius plus 550 m, with 12% return hysteresis. Far geometry
  totals **98,250 instead of 133,587 triangles**. Wall, roof and glass geometry/materials
  remain shared and unchanged; far levels add index buffers, not duplicate vertex data.
- Both tiers pass rendered ground contribution and clearance checks; the large pasture
  contains no planted trees. The elevated crossing view exposes the actual trim switch:
  fewer than 0.012% of image pixels differ by over 12 grey levels. Level selection and
  hysteresis checks pass for all six groups. This sample is not proof that every thin
  detail is temporally stable.
- All 18 Node suites pass. Both-tier corridor, authored-material/atmosphere, roof/contact,
  road connection, missing/invalid asset and delivery checks pass. Startup remains below
  15 MB high / 9 MB low; the new cover loads behind the menu. Shader checks used Chromium
  Metal; physical phones, other GPUs and the full functional flight suite were not repeated.
- Local [matched pilot and hillside review](output/approach-hills-review.html), plus
  [render measurements](RENDER-PERFORMANCE.md), records the visual gain and cost.
- High-tier frame rates on M2 Pro stay within −0.4% to +3.0% of baseline in the sampled
  views. Low-tier results vary: the repeated middle approach reaches 60 FPS on both
  builds, but storm samples span roughly 48–60 FPS. Stable low-tier performance under
  sustained load is not established. The log retains all initial and repeat measurements.
- A matched 480-frame descent uses the normal pilot camera at high 1×. The clips are
  visual comparisons, not frame-rate measurements; recording adds encoding overhead.

The improvement is coverage visible during the approach. The runway, cockpit, weather,
tree source geometry and complete-building count do not change. Low-tier woods remain
sparse, card transitions and fine-detail shimmer persist, and unmapped hills retain flat
photographic detail. More complete scenery and better distant crowns remain the priorities.

### Approach crossing: previous pass — 2026-10-22

Baseline: published main `9c30fd6`. Sources: existing registered building/road data and
bundled public-domain NAIP, interpreted in `tools/crossing-sites.mjs`. Architecture, heights,
parcel uses and planting are interpretations, not a survey. No new external assets or maps.

- Added 27 whole buildings on existing footprints, 14 lawns, 15 gravel areas, 14 street/drive
  ribbons, 22 access paths and 13 fence polylines. Existing finishes, roof maps and gravel
  scans are reused. Adjacent buildings share material batches with independent site fallbacks.
- Three woodland polygons and one meadow fill a gap between existing cover regions. A separate
  700 / 300 high/low planting allocation preserves the older zones' bounds, seeds and caps.
  Total trees remain 52,000 / 14,000. Eligible individually placed site trees increase 42 → 66.
- Both tiers pass 64 roof samples across all 62 buildings, 35 local access joins and 16 main-road
  joins. Maximum surface/terrain error is 0.034 mm; no planted trees intrude into roads, buildings
  or mapped fields. Missing/invalid site data retains the original nine-building valley site;
  missing cover retains photographic ground and fallback planting. All 18 Node suites pass.
- Building triangles increase 92,375 → 133,587; grounds/fences 175,866 → 273,132. Site draw batches
  increase 65 → 88 after merging adjacent building groups. The losslessly compressed cover mask
  partly offsets added geometry: net transfer **+624,047 bytes high / +624,103 low**, behind the menu.
- Local [matched full-frame review](output/approach-crossing-review.html) includes high/low,
  normal captain views, wide/close views, overcast and night. See
  [render measurements](RENDER-PERFORMANCE.md) and the dated reports in `benchmarks/` for costs.
- On M2 Pro at fixed 1.5×, upper-cockpit FPS changes 36.2 → 34.3 and wide crossing
  50.5 → 45.8; high p95 stays 33.4 ms. Low at 1× remains near 60 FPS. The shorter captain
  and storm views change little. This is a measured cost, not a performance improvement.
- Authored-material/atmosphere and missing model/material/site checks pass. Delivery checks
  keep startup below 15 MB high / 9 MB low and verify no new downloads during flight.
  The review page passes all 36 image loads, before/after direction and small-screen layout.

The visible gain is strongest across the crossing and its wooded margins. House forms, lawns,
ground shadows and distant trees remain simplified; photographic blur/shadows persist outside
authored surfaces. This pass does not provide a complete modern-simulator landscape or new
weather/cockpit rendering. These checks used hardware Chromium on the M2 Pro; SwiftShader,
physical phones and the full functional flight suite were not repeated for this scenery pass.

## Original assessment — 2026-09-26, with historical follow-ups

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

These were the original priorities for the ordinary daytime landing view. The fog defects
in item 12 were critical in the storm scenario. Baseline screenshots are preserved locally in
the ignored `test/output/visual-audit-before/` folder; the original rebuild captures are
`test/output/rebuild-*.png`. Follow-up notes below document subsequent fixes; use the dated
current checklist above for remaining work.

| Rank | Cause of the dated appearance | Changes made | Remaining limitation |
| --- | --- | --- | --- |
| 1 | Distorted cockpit/window proportions and poorly placed camera | Removed the upper-shell stretch; fitted the eye to the original cabin; retained desktop 58° FOV and narrow-screen coverage. Checked PFD and ND visibility. | Some surfaces remain simple, but this comparison does not justify replacing the source geometry. |
| 2 | Muddy cockpit colours and flattened material separation | Restored source material values in the GLBs. Verified part assignments in Blender, then added distinct, subtle coated-panel, molded-trim, frame, seat-weave and yoke-rubber finishes at runtime. Modeled lettering is retained. The 2026-10-18 pass adds part-fitted panel edge/contact masks, glareshield padding and polished yoke grips. | The new wear is restrained in the ordinary forward view. It covers selected front panels, rails, padding and grips; a complete aircraft-specific texture set, including side consoles and overhead, remains absent. See the dated followups. |
| 3 | A completely flat approach corridor | Registered USGS elevation follows the imagery; rendering, collision and navigation share it. The airport is locally graded and a rising terrain cap protects final. | Elevations are locally modified around the fictional airport. Distant mesh resolution and imagery shadows remain limitations. |
| 4 | Blurry aerial imagery ahead of the airport | Sixteen local 1 km detail tiles along the last 8 km, sampled at 0.5 m/px high and 1 m/px low, feather into the existing imagery; four textures stay resident. Distance-faded scanned colour, normal and roughness detail reconstructs fine surface grain; the 2026-10-21 pass separates nearby grass, soil and leaf litter. | Underlying NAIP is generally 0.6 m; exports cannot supply finer survey detail. Coverage is a 2 km wide corridor. Six reviewed roofs fill prominent detection gaps. Sixty-two complete building placements across eight sites have matching lawns, gravel yards, drives and lanes, including a dairy with three silos in place of two incorrect rectangular blocks. Interpreted land cover now spans 6.9 km and treats about 931 ha, including upper-valley woods visible from the normal early approach. Open fields retain photographed crop/soil variation at approach height. Photographed grass adds close turf/pasture cover on high only, without a visible change in the sampled forward cockpit views. Blur, missing buildings and photographic shadows remain beyond mapped areas; distant fields and site lawns remain simple. |
| 5 | Sparse, three-lobed tree blobs | Nine authored forms from three broadleaf sources plus pine/fir, eight azimuths at three elevations each, baked from the delivered geometry. Leaf masks are preserved in all nearby GLBs. One quad faces the eye in yaw and pitch and blends neighboring views. High retains bounded 3D branches and leaves within 180 m. A shadowed directional-response bake now follows the sun instead of keeping fixed highlights on camera-facing cards. Terrain-following canopy silhouettes replace flat contact circles on the ground. Small crowns now retain more filtered leaves; denser upper mapped planting uses the same total tree budgets and prioritizes existing close stands. | Distant/low trees remain impostors; view blending and repeated species are still visible. The wider palette is artistic, not a local botanical survey. Shared land-cover boundaries improve density and keep fields open along 6.9 km of final; density elsewhere and close-up silhouettes still expose the approximations. |
| 6 | Thin cloud rings and weak volume | Six distinct cached 3D forms, smaller connected billows, flatter bases, self-shadowing and directional scattering; fixed midpoint integration removes screen-locked sampling grain. Overcast integrates density near both boundaries at reduced resolution, with soft billows, self-shadowing and a fog interior. | Fair-weather volumes remain simplified and soft at close range. Low uses sprites; overcast uses a bounded boundary volume plus shared fog, not a fully volumetric weather system. |
| 7 | Runway lights look like a luminous rectangle by day | Smaller daytime cores, lower daylight intensity, distinct PAPI/beacon sizing and fog attenuation without a minimum visibility floor. Night bloom retained. | Point-based lights approximate optical glare; no lens-scattering simulation. |
| 8 | Flat, muddy illumination and weak foreground depth | Reduced warm daytime lamps in favour of neutral sky light. Sun shadows plus a rebake of close contact and cabin sky access, including the fitted roof. Baked occlusion now affects indirect light rather than darkening the paint and direct sunlight. | No real-time global illumination. The bake approximates sky access and bounced light; it cannot replace fully authored materials. |
| 9 | Box-like airport and disconnected jet bridges | Five stepped gate halls connect through glazed galleries and solid stair cores. Recessed glazing, mezzanines, braces and end wings give the terminal a clearer structure; pitched hangars and a sloped eight-sided tower cab replace basic boxes/cylinders. Existing jet bridges still reach their aircraft. | Architecture remains simplified. Opaque glass now has view-dependent room depth and sky reflections. Interiors remain simple; no actual transmission or reflections of airport geometry. Wear, apron equipment and finer local shadows remain sparse. |
| 10 | Clean rectangular pavement pasted onto the terrain | Textured aggregate shoulders with feathered soil margins, subtle mowing, asphalt resurfacing/repairs and tyre deposits, apron slabs and expansion joints. | Ground-level wear, drainage and small debris remain sparse. |
| 11 | Windshields appear absent | Glazing follows the source frame rails. Faint reflections and moving water stay attached to six panes; fitted wipers clear front sectors. High refracts the exterior through droplets; low uses shaded drops. Short touch screens now use a closer lens, larger windshield band and readouts above the MCP. | Droplets and blade contact are approximations, not fluid simulation. Glass has no scratches, ice, condensation or fully physical transmission. Phone controls still compete for limited screen space. |
| 12 | Hard black fog horizon, a dark sheet inside the cloud transition, and lights visible through opaque cloud | Fixed shared atmospheric uniforms on foliage/deck shaders; show cloud surfaces only from outside the deck; removed the lights' 3% fog visibility floor. Added rendered regression checks. | The earlier audit incorrectly blamed a CSS rain overlay: it was already disabled. Existing rain uses 3D streaks driven by relative velocity. Pane-bound water and wiper clearing now complement those streaks; richer water films remain future work. |
| 13 | Jagged foliage, grain and inconsistent fine-detail sharpness | Alpha-to-coverage for foliage, anisotropic filtering and mipmapped, metric-scale cockpit finishes. Removed the cockpit shadow normal offset that stippled the double-sided liner; existing 4× world MSAA and cockpit antialiasing remain. | No temporal AA. Thin modeled labels, shadow edges and branches can still shimmer at distance. |
| 14 | Repeating facade grids and weak building contact | Twelve approach facade bays share an atlas: house fronts with doors/shutters, upper floors, sparse sides, barns and loading bays. Houses have a principal entry bay; nearby bevels, smoother panes, canopies and thresholds add depth. Siding relief and roughness separate materials. Gables stay solid. Terrain-following projected shadows now have feathered edges. | Twenty-four nearby buildings on high / eight low use CC0 wall modules. Sixty-two building placements across eight sites have complete models, matching grounds, access and placed vegetation. Rounded silo shadows retain the same terrain-following projection. Most architecture remains procedural; more complete sites and missing-footprint coverage remain needed. |
| 15 | Prototype-like desktop readout bar | Inset, quieter translucent status strip. Phone readouts clear the MCP, and PANEL centers the instruments while hiding duplicate floating readouts. | The simulator intentionally retains training/status UI. This matters less than asset quality. |

Further cockpit work should begin with a source-versus-game comparison, not a replacement
model. The approach now has matching building footprints and two valley roads. The next large
scenery gaps are broader coverage of complete buildings with matching ground detail, missing building detections and more convincing crown density;
weather still needs finer cloud structure and richer water films beyond the fitted pane droplets. An engine migration alone would not
provide those assets or effects.

Canopy ground-shade follow-up, 2026-10-21:

- Replaced horizontal radial patches with tree-atlas silhouettes fitted to the rendered
  terrain triangles. They project away from sunlight, become weaker top-view shade under
  an overcast deck, and are hidden at night. Tree placement, forms and model budgets stay
  unchanged. No additional assets or ground-material samplers are needed.
- The visible improvement is modest around woodland edges and on slopes; the normal
  forward cockpit view changes very little. These remain ground-only approximations,
  with discrete atlas views and bounded low-sun stretch. They do not shadow buildings,
  raised roads/site surfaces or other trees, or remove shadows baked into the imagery.
- Both tiers passed actual-scene contribution/weather checks; the existing crown-lighting
  checks also pass. All 18 Node suites pass, including terrain-fit, area-preservation and
  opposite-sun tests. No full browser functional suite or physical-phone run was repeated.
- High clear-scene FPS fell about 2–3% on this M2 Pro comparison; high storm was within 1%.
  Low reached 60 FPS in the new run, with a variable baseline. Terrain-fitting geometry
  increases buffer storage and adds roughly 0.4–0.6 s high / 0.04–0.07 s low CPU preparation
  when lighting changes. See `RENDER-PERFORMANCE.md` for the full cost and limits.
- Local [full-frame before/after review](output/woodland-shadow-review.html), baseline
  main `12bceb3`. Broader scenery coverage, distant tree forms, complete cockpit texturing
  and temporal shimmer remain open items; this does not close the vegetation category.
- Review follow-up, same day: the shade is now hidden below an overcast deck, as at night,
  instead of switching to a faint top-view variant. Overcast captures change by only
  0.05 (high) / 0.02 (low) mean grey levels, and a change of weather no longer rebuilds the
  geometry when a flight starts (it took 0.5–0.9 s high here). See `RENDER-PERFORMANCE.md`.

Close-ground follow-up, 2026-10-21:

- Mapped meadows, soil/stubble, forest floors and maintained airport turf now use separate
  grass, soil and leaf-litter scans at physical scale. Three shared-seed texture rotations and offsets
  reduce repeated rows; normal and roughness samples follow the same placement.
- The effect is strongest a few metres above the ground. The matched captain and forward
  rollout captures show little difference. It fades out by 260 m, retaining distant imagery;
  this does **not** close the broader ground/scenery item. Complete-site lawns, missing
  buildings, photographic shadows, distant blur and tree silhouettes remain limitations.
- Both quality tiers passed nine matched views (grass, soil, forest, turf, captain, rollout,
  distant, rain and night), nearby material-contribution checks and the distance-fade check.
  Six actual-material Float32 readbacks across overhead/grazing views were finite and lit.
  The shader used 15 fragment samplers high / 14 low, within the tested 16-unit limit.
- Missing one new map retains photographic terrain and reports one asset error. Existing
  corridor tests still pass with zero tree intrusions into fields/buildings/roads, and the
  missing-land-cover fallback works. All 17 existing Node suites pass.
- Matched high-tier recordings cross 30 m of meadow and soil in 180 updates each.
  The new detail remains attached to the terrain; existing grass-card dither, tree transitions
  and distant field patterns are still visible. This is not temporal antialiasing.
- Downloads and memory are bounded: net +265,622 bytes high / −322,164 low relative to
  the replaced grass normal/roughness files. Estimated mipmapped RGBA storage falls from
  10.67 MiB to 9.33 / 2.33 MiB. No geometry, draw calls or render passes were added.
- The Apple M2 Pro comparison shows 4–5% lower FPS in close high-tier views and
  nearly unchanged captain/storm high views. Low clear scenes reach 60 FPS; low storm
  varied (51.8 → 46.8 FPS in the full run, 60 → 60 in a targeted repeat). See the dated measurements in
  `RENDER-PERFORMANCE.md`. No physical phone or software renderer was measured.
- Local review: [ground materials](output/ground-material-review.html), with labelled full
  before/after views and motion recordings. Baseline is committed main `ff17260`.

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


## Tree transitions and extended woodland — 2026-10-06

The canopy atlas now uses the actual delivered near-tree GLBs rather than the fuller source
geometry. Eight azimuths replace four, reducing the angular gap between adjacent silhouettes.
High uses 192 px frames and low 96 px, so texture area grows 12.5% rather than doubling.
The tree quad count and four texture samples per fragment remain unchanged. Near selection
retains a tree when a similarly distant neighbour competes for its place; retiring trees
now fade once per frame, fixing their former double-speed fade. Instance and triangle
budgets remain 32 target / 48 maximum and 1.8 / 2.4 million triangles.

A repeatable rendered 420 m woodland pass records 216 tree entries/exits versus 277 before,
with maximum fade change reduced from 0.0952 to 0.0476 per 1/60-second update. Mean
image/geometry silhouette intersection-over-union rises from 0.269 to 0.397 across four
forms at four rotations. This is a limited diagnostic, not a perceptual realism score;
imperfect overlap and the dither pattern are still visible, especially very close up.
The paired before/after videos and matched frames are in
[the local moving review](output/vegetation-transition-review.html).

The interpreted land cover now spans 4 km × 850 m, extending across two more bundled NAIP
tiles. Twenty-two parcels cover approximately 23.66 ha meadow, 6.97 ha stubble and 173.14 ha
woodland. The original close spacing is retained; wider spacing in the extension allocates
9,994 high / 4,727 low trees from the same overall 52,000 / 14,000 budget. Unmapped imagery
continues to use the original surface and planting. No new source models or paid assets
were introduced. This is an artistic land-cover interpretation, not a seasonal or botanical
reconstruction of the source region.

Remaining: image-based trees at distance and throughout low quality, repeated species,
imperfect 3D transitions, blurred ground and photographed shadows outside treated parcels,
and convincing ground-level vegetation. This pass does not change clouds, windshield
water, cockpit textures, architecture or phone framing. Performance and validation are in
[the measurement record](RENDER-PERFORMANCE.md#tree-transitions-and-extended-woodland--2026-10-06).


Validation: all 14 Node suites and the targeted scenery, moving-tree, weather, delivery and
23 graphics checks pass on Chromium Metal. The extended high 1.5× view measures 50.43 FPS
versus 51.01 before; all five low views remain at 60 FPS on the M2 Pro. The complete high 1×
landing averages 59.88 FPS, p99 16.8 ms, with zero in-flight requests. The assets add about
1.17 MB high / 85 KB low after menu display. Other devices, SwiftShader and the full
functional browser suite were not validated for this pass.


## Connected roadside buildings and grounds — 2026-10-07

Baseline: published `0597454`. Six neighboring buildings extend the existing three-building
farm into a coherent roadside cluster. All nine now have complete models; the additions
include two clapboard homes, a red-roofed garage and three timber working buildings. Roof
edges/ridge caps, recessed openings, trim, gutters, foundations and chimneys retain real
geometry. Small clapboard laps and roof seams use mipmapped normal maps: thin raised strips
produced bright, broken lines in the close rendered review and were removed. Adjacent wall
cells now share an outer skin instead of exposing lit internal box edges.

Three lawn areas, four additional gravel aprons, five connections to a reconstructed lane,
an internal path and timber fences replace the photo surface around the buildings. Ground
meshes follow the rendered terrain, with feathered edges and existing CC0 grass/gravel/asphalt
materials. Fourteen individually placed garden/boundary trees replace random planting inside
the site, within the unchanged 52,000 / 14,000 tree budgets. The lane is interpreted from
bundled NAIP imagery; it is separate from the two existing Census roads. Protected approach
areas remain clear. Footprints are retained; architecture, grounds and some source-estimated
building heights are interpretations, not a surveyed reconstruction. The source and interpreted
heights are both recorded in the manifest.

Matched high/low wider, roadside, farmhouse, overcast and night views, plus three normal
captain-eye positions and an eight-second simulated descent, are in
[the local before/after review](output/roadside-site-review.html). The gain is strongest in
close roadside views; from the ordinary forward cockpit view it is a subtler change through
the left windshield. This remains one small cluster, not complete coverage of the approach.
Untreated ground still has photographic blur/shadows; most architecture remains procedural,
and distant/low trees and clouds retain their existing approximations. Ground-level vegetation,
more complete sites, overcast and windshield weather remain unfinished.

Both tiers pass nine roof-height/upward-normal checks, terrain contact within 0.001 m,
upward-facing road connections, no unplanned trees in the grounds and 14 eligible placed trees.
Toggling the grounds changes the sampled close-view pixels by 21.98/255 high and 21.22 low;
this demonstrates their visible contribution, not a perceptual-quality score. The underlying
terrain-grain and streamed-imagery tests temporarily hide the authored grounds to isolate
those layers, while the new site check tests their replacement in the normal visible scene.
Missing model, yard texture or site data retains all original buildings and photo ground.

All 14 Node suites pass, including delivery bounds and nondegenerate UVs on normal-mapped
surfaces. Chromium Metal passes authored-scenery and fallback checks, approach streaming,
corridor planting, delivery/quality checks and all 23 graphics checks. Exact site, asset,
delivery and timing results are retained in `test/benchmarks/2026-10-07-roadside-*.json`.
The full functional browser suite was not rerun; SwiftShader remains unavailable on this
machine. See the corresponding roadside section of [the performance record](RENDER-PERFORMANCE.md)
for measured cost and hardware limitations.


## Ground and woodland on the opposite side of final — 2026-10-07

Baseline: published `fec4cb3`. The previous land-cover treatment was confined to one side
of the approach. This pass adds 23 interpreted parcels along 2 km on the opposite side,
using the already bundled `2_-1.webp` and `3_-1.webp` NAIP tiles. Meadow, stubble and woodland
floor share their boundaries with planting, replacing more of the flat photographic trees
and broad ground shadows while preserving open fields, roads and building clearances.
Mapped surface coverage increases from about 203.77 to **296.00 hectares**: 41.92 ha meadow,
13.28 ha stubble and 240.80 ha woodland across 45 parcels. The expansion is interpreted
scenery, not a land-use or botanical survey. No new third-party asset is introduced.

The original region's 2,550,000 mask channel values are unchanged. Independent seeds and
allocations preserve its mapped planting rather than thinning it to make room for the new
region. New stands use up to 5,500 high / 2,600 low trees, reallocated from the wider original
photographic planting. Total budgets remain 52,000 high / 14,000 low. Other background positions
and tints can change. The actual mapped planting totals 15,377 / 7,281, plus the existing 14
site trees. Data validation bounds the texture and planting allocations; missing cover retains
photographic ground and original planting.

The first rendered comparison exposed two missed wooded strips and visible repeated grain
in the pasture. The strips were included in the mask, and reconstructed field grain now has
lower contrast and fades earlier with distance. Near-eye scanned colour/normal/roughness
remain active. Matched high/low overview, pasture, ground-level, overcast and three normal
captain-eye views are in [the local comparison](output/opposite-approach-review.html).
The added canopy appears mostly through the right windshield during the landing approach.

The expanded corridor reports no tree centres in mapped fields, buildings or roads. The
existing site still has all nine upward-facing roofs, matching ground contact and 14 valid
garden trees. Toggling reconstructed ground changes sampled opposite-field pixels by
7.79/255 high and 8.11 low; this verifies a visible surface contribution, not realism. All
14 Node suites and hardware-browser corridor, approach streaming, site, vegetation/weather,
delivery and 23 graphics checks pass. The full functional browser suite was not rerun;
SwiftShader remains unavailable on this machine. Costs and full-flight timing are recorded
in the corresponding section of [the performance record](RENDER-PERFORMANCE.md).

Remaining: the map still covers selected parcels only. Photographic shadows and blurred
surfaces remain in unmapped gaps and beyond its limits. Very low views lack real grass/crop
geometry, the original source imagery is limited in resolution, distant/low trees are
image-based, and most buildings remain procedural. This pass does not improve clouds,
windshield water or cockpit material detail. More complete scenery and near-ground vegetation
remain the largest ground-related gaps; overcast and windshield weather remain separate work.


## Runway shoulders and pavement — 2026-10-08

Baseline: published `c9b53bd`. The broad, untextured grey shoulder strips are replaced by
a single strip mesh using the already delivered asphalt colour, normal and roughness scans.
A muted soil-coloured outer margin feathers into the grass. Irregularities are sampled every
3 m rather than the previous 25 m sawtooth outline. Both sides have upward-facing triangles;
the old geometry used the same winding on both sides and relied on a double-sided material.
Weather darkens the aggregate and the shared atmospheric shading remains active. Missing
surface scans retain a plain, feathered edge without preventing flight preparation.

The runway's repeating transverse concrete-joint grid is removed from its asphalt surface.
Subtle resurfacing lanes and occasional repair patches replace it. Narrow, overlapping rubber
deposits have feathered ends and include the centre nose-wheel track; they are drawn after
the paint. Runway dimensions and the layout of its numbers, threshold/TDZ/aiming/centre/edge
markings are unchanged. This is an artistic pavement treatment, not a surveyed airport asset.

Matched high/low shoulder, touchdown-area, ordinary captain-eye short-final/flare/rollout,
night and storm captures are in [the local comparison](output/runway-surface-review.html).
The improvement is strongest in exterior views beside the runway. Its contribution from
the cockpit is smaller, especially in the flare; this is not a large scenery replacement.

A local curved-blade grass prototype was also reviewed and rejected. Its sparse tufts did
not convincingly fill the foreground despite up to 559,872 high / 115,248 low triangles.
Initial prototype cockpit captures used flight trim for the rollout pose, so they are not
reliable evidence of its cockpit contribution. The final runway review corrects this to an
on-ground attitude for rollout and approach/flare attitudes in flight. The prototype is not integrated or
delivered. Ground-level grass/crops remain unfinished; more blades alone are not an adequate
solution. Broader complete scenery, distant/low tree approximations, overcast, windshield
water and unique cockpit wear textures remain separate priorities.

All 14 Node suites, all 23 graphics checks and the seven-view high/low surface browser checks pass, including
upward-facing geometry and the missing scan fallback. The full high 1× landing completes
100/A at 59.87 FPS with no in-flight resource requests. Paired 1.5× timings show small
changes (approximately +2.5% to -1.8%) rather than a material frame-rate gain. Startup
still has a 200 ms hitch. See the runway section of [the performance record](RENDER-PERFORMANCE.md)
for exact costs, recorded reports and device/test limitations.


## Two complete sites on the opposite approach — 2026-10-08

Baseline: published `89f9691`. Seven more registered buildings become complete models: a
three-building farm and a four-building wooded hamlet. This brings the total to sixteen
across three sites. Timber/painted walls, recessed doors and windows, roof edges/seams,
gutters and foundations replace the earlier simple walls and roofs. The small new buildings
omit geometric timber battens, retaining scanned surface relief instead. Existing registered
footprints are preserved; architecture and some estimated heights are interpreted. All materials
are existing CC0 scans and all new geometry is original project work.

Matching lawns, five gravel aprons, two private access lanes, three connections and timber
boundaries replace the photographic surface beneath these buildings. Ground meshes follow the
rendered terrain on both quality tiers. Gravel includes paired wheel wear and broad variation;
soft, irregular edges blend the grounds into their surroundings. Twenty-seven eligible placed
trees now serve all three sites, replacing random trees inside the grounds within the unchanged
52,000 / 14,000 total budget. Original pixel outlines are retained with the converted geometry
in `approach-sites.json`; these are interpretations of bundled imagery, not a survey.

Matched close/wide, overcast/night and three ordinary forward captain views are in
[the local review](output/complete-approach-sites-review.html). The gain is strongest at the
sites: coherent buildings and connected yards replace blurry roof/shadow photographs. The
ordinary forward cockpit improvement is smaller and appears through the right windshield.
Ground still looks flat at very low altitude, the lawns remain simple and the new buildings
reuse a limited material set. This is two additional small sites, not comprehensive scenery.

Buildings merge by material within each site so their culling bounds stay local. The GLBs
add 205,148 bytes high / 205,096 low; site data adds 16,200 bytes shared by both tiers. No new
photography or material map is downloaded. Missing or invalid extension data retains the
original nine complete valley buildings while the seven new placements retain their procedural
fallback. Missing common model or yard assets still retains all original procedural buildings.

Remaining priorities: broader coherent ground/scenery coverage, convincing low-altitude
vegetation, distant/low tree appearance, overcast and windshield weather, unique cockpit wear
and phone framing. The new sites do not solve those separate limitations. Fixed-resolution
cost and full-flight validation are recorded in the matching section of
[the performance record](RENDER-PERFORMANCE.md).

Validation: all 14 Node suites, 23 graphics checks, both-tier site/roof/ground/planting checks,
existing valley and approach-streaming checks, asset-failure fallbacks and delivery/quality
selection checks pass on Chromium Metal. Two defects found during review were corrected:
a fence crossing a lane now leaves an entrance, and a garden tree inside a mapped field
was moved to the boundary. Both clearances have regression checks. The full functional
browser suite and other GPUs/phones were not tested; SwiftShader remains unavailable here.

The full high 1× landing finishes 100/A at 59.90 FPS, p99 16.8 ms, with no requests begun
during flight. Startup still stalls for 166.7 ms in this sample. The high 1.5× close-farm
view costs 4.4%; low storm timing varies between runs and is reported separately rather
than claiming a universal 60 FPS result.


## Overcast shape and boundary visibility — 2026-10-08

**Correction, 2026-10-09:** the boundary-fog assessment below missed a regression.
The 60 m altitude-only fringe greyed the whole exterior even outside the cloud; the
comparison slider was correctly labelled. See the cloud-entry correction below for the
replacement, tests that preserve clear outside rays, and new matched captures.

The flat white upper deck and stretched underside bands now have softly shaded billows on
both tiers. A generated field supplies density near the cloud boundaries; the interior uses
shared fog. The pass adds no image or model download, caps its pixel/step budget and skips
clear weather and cloud interiors. This improves the view from the normal captain position
as well as the exterior review cameras. The [matched comparison](output/overcast-review.html)
includes above/below, both boundaries, cockpit, night and storm views.

Review also found that crosswind cloud entry briefly revealed the terrain: blending visibility
distances kept the air too clear inside a high-visibility scenario's cloud. Fog now blends
inverse visibility across a 60 m fringe centered on the boundary. The configured cloud heights
and flight physics are unchanged. Above-cloud lights are blocked, the interior has no false
floor/ceiling, and foreground rain remains visible against the deck.

The source is original procedural code; no external cloud asset or license was added. The
result remains a simplified weather effect: repeated cells, some close-boundary grain and
uniform interior fog are visible. Cloud/terrain depth uses the nominal boundary plane.
The small black patches near the ground in the storm comparison predate this change.

All 14 Node suites and 23 graphics checks pass on Chromium Metal. Both tiers pass cloud pixel,
light occlusion, resize, quality reduction and renderer-state checks; cockpit display/fallback
and warm-up/Start-timeout checks also pass. The fixed 1.5× high cockpit above the deck measures
45.46 → 46.79 FPS, with no clear regression and no claimed speed-up; exterior views stay at
the 60 FPS display cap. The full high 1× crosswind short landing finishes successfully at
84/B and 59.89 FPS, p99 16.8 ms, with no in-flight requests. Startup still stalls for about
200 ms. See [the performance record](RENDER-PERFORMANCE.md) for conditions and raw reports.

Remaining priorities: convincing ground-level vegetation and broader complete scenery,
distant/low tree appearance, windshield glazing/water, finer cloud structure, unique cockpit
wear and phone framing. This pass improves overcast without closing the broader weather item.


## Near-ground turf and pasture — 2026-10-09

Baseline: published `9f1c625`. Short grass at runway margins and taller grass in strongly
mapped meadow now use photographed blades baked from Poly Haven's CC0 **Grass Bermuda 01**
by Rico Cilliers. Eight patch views retain green and dry blades, with colours adapted to
the existing ground. The atlases add 154,114 bytes high / 50,808 low and prepare behind the
menu. The source model is an offline input only. Attribution and reproduction commands are
in [the asset record](../assets/README.md).

The pool follows the eye, within 40 m high / 36 m low. Roots meet each tier's rendered
terrain triangles. Pavement, road/building clearances and complete-site grounds stay clear;
stubble, woodland floor and unmapped land are unchanged. Distance reduces both height and
coverage, new tiles grow over 0.45 seconds, and a small wind bend softens still patches.
Wetness, scene lighting and haze remain shared. No grass shadow pass is added.

The final patches use two crossed planes. Three planes cost about 18% in the high 1.5×
close-pasture measurement; two retain useful coverage while reducing that measured cost
to about 8%. The earlier sparse curved-blade prototype remains rejected. Geometry and
updates are bounded, including hidden grass on unplanted ground and a quality reduction
while the optional atlas is arriving. Missing imagery retains the underlying terrain.

The [local before/after review](output/ground-cover-review.html) includes both tiers, normal
forward landing poses, a side look, HUD view, close ground, wet/night views and movement.
The result improves close exterior views. **The sampled straight-ahead cockpit rollout,
flare and final views show no visible contribution from this grass.** A side look has a
small contribution. These comparisons do not establish a major improvement to the main
landing view, and this pass does not close the broader ground/scenery item.

Remaining limits: repeated patch forms and crossed image planes close up, simple distant
fields and site lawns, no crops or grass shadows, and no improvement outside mapped meadow
and airport turf. Wider complete scenery and more convincing distant/low trees remain
larger priorities for the forward landing view. Windshield glazing/water, finer cloud
structure, unique cockpit wear and phone framing also remain. Measurements and validation
are recorded in [the performance record](RENDER-PERFORMANCE.md).

Validation: all 15 Node suites, 23 graphics checks, both-tier rendered grass checks,
cockpit/cloud regressions, delivery/quality selection and warm-up/Start-timeout integration
checks pass. The full high 1× landing finishes 100/A at 59.92 FPS, p99 16.8 ms, with no
in-flight downloads. A 166.7 ms startup hitch remains. The close high 1.5× pasture view costs
7.8%; low rollout measures 58.75 rather than 60 FPS, while the other low samples remain
display-capped. Physical phones, other GPUs and the full functional suite were not tested.


## Review fixes: lawns in fog, grass on high only — 2026-10-09

Baseline: `5b85f57`. The roadside lawns of the valley sites went black in fog: their shader
hook skipped the shared one that binds the atmosphere, so their haze had no sky colour. In
the storm they averaged 60 against 94 for the ground around them; they now match at 94, and
a rendered check covers every fogged material on both tiers. The near-ground grass, which
the forward cockpit views do not show, is now drawn on the high tier only; phones keep the
existing ground and its scanned detail. Details are in
[the performance record](RENDER-PERFORMANCE.md).

## Cloud-entry correction — 2026-10-09

The user's comparison screenshots exposed an overstatement in the previous overcast pass.
The images were correctly labelled: published `5b85f57` really did turn the exterior grey
12 m above cloud top, and nearly uniform grey 24 m inside either edge. An altitude-only fog
fringe affected every direction, including rays pointing into clear air. The old tests checked
that cloud obscured terrain but did not also require a clear outside view.

Cloud extinction now integrates the viewing ray through a continuous layer, with a 32 m
linear density ramp on the **inside** of each edge. Sky, fogged world materials, cumulus and
runway lights use the same path calculation. Ordinary scenario haze remains separate. Looking
away from the deck outside it stays clear; looking out through a short path near an edge can
show blue sky or terrain; long paths and the deep interior still produce a whiteout. The
cockpit is not cloud-fogged. Cloud heights and flight physics are unchanged.

The boundary density pass remains visible during initial entry and blends into the interior.
Its proxy stays beyond nearby geometry; grazing rays blend to the same interior colour as
the sky, avoiding a hard horizontal seam. The generated field and the existing pixel/step
caps are unchanged. No image/model asset was added.

The [new matched comparison](output/cloud-boundary-review.html) uses published `5b85f57`
on the left and the correction on the right, with explicit camera offsets and full-image
buttons. It includes the original problem views, a separate deep-cloud whiteout example,
and exterior/captain descent recordings. The earlier comparison is preserved as history.

This is still an approximation: detailed edge billows and the smooth vertical extinction
profile are separate, the proxy depth is approximate, and the deep interior remains uniform.
It does not implement a full 3D density field for all scenery intersections. Broad weather
realism, windshield effects and the other outstanding visual items remain separate work.

Validation: all 16 Node suites and 23 graphics checks pass, along with cockpit display/
fallback, storm-entry, startup/warm-up and delivery checks. The new both-tier pixel tests
preserve clear outside rays, retain short exits, obscure deep cloud, check nearby foreground,
and compare grazing-ray math on CPU and GPU. The comparison controls and both videos were
also exercised in Chromium. Only Metal on this Mac was tested for this correction.

The matched fixed-resolution cloud exterior views remain at about 60 FPS; high 1.5× cockpit
samples are 1.2–3.4% lower, within a single measured before/after pair. The real-time high 1×
short landing completes at 84/B in both runs: 59.60 FPS initially, 59.87 FPS on repeat,
against 59.89 FPS on published main. Two mid-flight hitches in the first corrected run do
not recur in the repeat; startup still hitches. See [the performance record](RENDER-PERFORMANCE.md)
for every run and its limits; this pass does not claim a performance improvement or
stutter-free flight.


## Integrating remote scenery fixes with cloud entry — 2026-10-10

Reviewed and fast-forwarded to remote `d844549`, retaining the cloud-entry correction above.
The runtime changes are compatible and useful:

- The lawn shader now calls the shared atmosphere hook. This fixes its black haze and also
  supplies the new cloud layer and eye-position uniforms; without it the local cloud fix
  would leave lawns inconsistent with the surrounding terrain. The authored-scenery check
  now verifies **all shared uniform references**, rather than one uniform's presence.
- Near-ground grass is high-only. Its limited contribution in forward cockpit views supports
  this tradeoff. Quality reduction disposes its private mesh, geometry, material and atlas,
  retains the shared ground textures, and skips construction if quality drops during loading.
- Low gravel normal/roughness maps are 256 px; high remains 512 px. The preparation tool and
  asset byte records agree. Together with removing the low grass atlas, this saves 210,986
  asset bytes on the low tier. No cockpit, terrain registration or physics change is needed.
- Portable browser defaults and optional videos preserve the checks. The new cloud tests
  now follow those conventions too: explicit Metal here, SwiftShader by default, and fixed
  descent updates with representative renders and no FPS claims when video is disabled.

Only the appended audit/performance histories conflicted textually; both were retained.
The cloud comparison's still images now show the combined build; its recordings remain the
pre-integration cloud correction and are labelled accordingly. The baseline is still `5b85f57`.

Integration validation passes on Chromium Metal: all 16 Node suites, 23 graphics checks,
both-tier cloud/scenery/grass checks, asset fallbacks, download and automatic-quality checks,
and the cloud descent without recording. Cockpit PFD/ND visibility and storm horizon/light
checks pass too. The full functional suite, other GPUs and new FPS benchmarks were not run.
[The integration performance record](RENDER-PERFORMANCE.md#cloudscenery-integration--2026-10-10)
contains exact transfer sizes and the preserved raw results. No merge-related regression
was found in these checks; broader visual limitations above remain.


## Cloud colour by side — 2026-10-10

Baseline: `e962658`. Seen from above, the deck's distant tops turned into a grey band at the
horizon with a hard edge against the sky, also from the captain's seat at the full-approach
start: all cloud took the grey of the deck's underside. Cloud now takes the colour of the side
being seen: sunlit tops from above, grey base from below, a blend by depth inside, through the
haze in front of it. The horizon above the deck is smooth again; below it nothing changes.
A rendered check guards the band. Details are in [the performance record](RENDER-PERFORMANCE.md).


## Upper opposite approach coverage — 2026-10-11

Baseline: published `4433b0b`, including the cloud-colour and portable capture fixes.
This pass prioritizes the remaining ground/scenery coverage gap. Twenty-six more interpreted
polygons from the bundled `4_-1` and `5_-1` NAIP tiles extend the opposite region by 2 km.
The mapped area grows from 296.00 to **383.14 ha**: 68.43 ha meadow, 32.35 ha stubble and
282.36 ha woodland. Contour crop strips, open pastures and wooded creek margins follow
those photographs; this is an artistic interpretation, not a new land-use survey.

The first candidate revealed that the existing reconstruction erased too much open-field
variation. Fields now retain more of the already sampled aerial albedo at approach distance,
with scanned grain near the eye. The common, incorrectly aligned procedural cultivation bands
are removed. Forest floor still suppresses photographed tree crowns beneath the planted trees.
No shader texture fetch, terrain draw call or new material is added.

The combined PNG/JSON grows by **93,998 bytes**, to 322,507 bytes. Its 2000 × 1015 dimensions
and approximately 8.12 MB RGBA8 GPU texture / CPU sample buffer each remain unchanged. The
original planting seeds and allocations remain independent of the new region. Total tree
counts remain 52,000 high / 14,000 low; allocations come from the wider photographic planting.
The extension uses 1,674 high / 818 low mapped trees; including the remaining photo-selected
trees, its review region contains 2,662 / 974. This does change some background tree positions
and tints. No imagery, material or model download is added.

[Matched before/after views](output/upper-approach-review.html) include both tiers, an overview,
contour crops and the unchanged captain camera at 4, 3 and 1.9 km before the threshold. The
improvement is clearest in the wider views; its straight-ahead cockpit contribution is modest.
It does not make the woodland fully volumetric or fill the missing building/site assets.
Low scenery is still visibly sparse and its aerial detail is softer. Unmapped woods and
photographic shadows remain conspicuous. Broader scenery, more complete sites, distant/low
vegetation, windshield effects, finer clouds, aircraft-specific wear and phone framing remain.

The scenery review waits for static GPU frames before screenshots, following the remote
capture fix. Its material-isolation assertion temporarily hides settled foreground grass
for both samples; the review images retain that grass. Otherwise the added grass can hide
the ground pixels being tested. Both tiers preserve empty mapped fields, road/building
clearances and fixed total tree budgets, and a missing mask still falls back to the photos
and original planting. See the performance record for measured cost and validation.

Final validation passes: all 16 Node suites, 23 graphics checks and the both-tier scenery
and missing-mask checks on Metal. Matched samples show no frame-rate regression; draw calls
are unchanged, high 1.5× remains roughly 37–39 FPS in the sampled cockpit views and low 1×
is display capped near 60 FPS. These are paused-physics samples, not a full flight benchmark.


## Upper-valley dairy and silos — 2026-10-13

Baseline: published `ae16093`. The farm beside the newly mapped contour fields contained two
conspicuous windowed rectangular blocks where the aerial imagery indicates cylindrical silos.
The six existing placements near (4400, −500) now use original Blender geometry: a dairy with
two parallel pitched roofs and a crosswing, three smaller working barns/sheds, and three domed
silos in two groups. Doors, ventilation windows, roof edges, silo hoops and ladders add shape.
The architecture is interpreted from the existing photographs, not a surveyed reconstruction;
the dairy ridge is 8.4 m versus the source's 3.4 m estimate. Source footprint data is unchanged.

The site adds feathered gravel yards, lawns, three connecting drives, a local gravel lane,
timber fences and three eligible boundary trees. It reuses existing material images. Rounded
silo outlines also drive the terrain-following projected shadows, applied only after the
complete optional replacement succeeds. A missing/invalid extension keeps the original nine
complete valley buildings and falls back to procedural geometry at the extension sites.

There are now 22 complete building placements across four sites. The pass adds **184,777
bytes high / 184,757 bytes low**, including manifest/site data, **12,222 building triangles**
and **38,682 site triangles**. It adds no new texture or external asset. Total trees stay
within the existing budgets; site planting replaces random planting inside the grounds.

[Matched before/after views](output/contour-farm-review.html) include high/low close and wide
views, storm, night, and unchanged captain views at 4 and 2.8 km before threshold. The local
silhouette is substantially more appropriate, but the forward cockpit contribution is small
or hidden by the panel. Yards are still clean and sparsely furnished; there is no machinery,
and distant/low tree planes, repeated siding and photographic ground outside the site remain.
This is a bounded scenery improvement, not completion of the wider realism plan.

All 16 Node suites pass, including asset bounds, UVs, licensing and delivery budgets. The
rounded-shadow regression distinguishes a cylinder from the original rectangular footprint.
Both-tier browser checks pass for all 22 roofs (24 ridge/dome samples), terrain contact,
six extension-road connections, planting clearance and missing/invalid site data. The wider
authored-scenery checks pass, including shared atmosphere uniforms on 194 high / 175 low
compiled materials and missing model/material/site fallback. An isolated shadow visibility
check confirms ground darkening and both rounded outlines on the rendered farm.

Matched M2 Pro samples at fixed high 1.5× show upper-captain FPS **37.90 → 36.27**, closer
captain **38.81 → 38.56**, and farm detail **49.68 → 50.10**; low 1× stays about 60 FPS.
The upper view has 14 additional draw calls. These short measurements include scheduling
variation and do not establish full-flight or other-device performance. See the
[performance record](RENDER-PERFORMANCE.md#upper-valley-dairy-and-silos--2026-10-13).


## Woodland crown coverage and upper stand density — 2026-10-14

Baseline: published `3089610`. Blending four atlas views and filtering the result removed
fine foliage at distance. The cutout threshold now varies with the crown's approximate
rendered size: 0.15 up to 64 pixels, smoothly returning to the original 0.28 at 128 pixels.
Large crowns retain their original outline during the transition to nearby geometry.
High still uses alpha-to-coverage; low retains hard cutouts. UV derivatives make the size
estimate follow the render-target resolution, including adaptive resolution changes.

Upper mapped planting changes from 16 to 12 m spacing on high and 23 to 18 m on low.
Close stands retain 9.5 / 14 m spacing and take priority within each zone's allocation.
Mapped caps rise to 22,000 high / 9,800 low; actual mapped counts rise from 17,081 to
**21,497 high** and 8,129 to **9,750 low**. Total woodland remains **52,000 / 14,000**:
these allocations replace wider photo-selected planting. Background positions, tints and
some nearby-tree selections change as a result. All existing field, road, building, site
and airport exclusions remain. The land-cover image, geometry and texture assets are unchanged.

[The local review](output/woodland-coverage-review.html) contains matched high/low canopy,
upper approach, field, storm and night views, two unchanged captain cameras, and a moving
420 m pass. The benefit is clearest in the wider mapped woods. The forward cockpit gain is
subtle; distant image planes, repeated species, shimmer, sparse unmapped hills and photographic
shadows remain. This does not complete the vegetation work or the wider realism plan.

The isolated coverage check passes 54 size/azimuth/elevation cases per tier using the actual
atlas and shader. At 24 / 64 pixels, summed leaf alpha increases by **46.1% high / 45.4% low**;
empty borders stay transparent. That diagnostic does not mean every scene gains 46% forest.
At 128 pixels coverage stays within 1% of the original. Sixteen close card-versus-geometry
silhouettes match the baseline exactly (mean overlap 0.397); this preserves the existing
approximation rather than proving a perfect match. An initial constant-threshold candidate
reduced that overlap and was replaced by the size-dependent version.

The moving check preserves the 0.35-second complementary fade and stays within 48 nearby
trees / 2.4 million triangles: this path reaches 33 trees and 2,391,378 triangles. Both-tier
scenery tests find no trees in mapped fields or protected clearances and retain the missing-mask
fallback. See the [performance record](RENDER-PERFORMANCE.md#woodland-crown-coverage-and-upper-stand-density--2026-10-14)
for the matched hardware measurements and retained reports.

The largest remaining scenery gaps are incomplete coverage of authored sites and ground
outside the mapped corridor. Vegetation still needs better distant volume and species variety;
weather needs finer cloud structure and windshield water. Cockpit-specific wear and phone
framing also remain. No engine replacement is needed to address those asset/effect gaps.

Final validation also passes all 16 Node suites and the vegetation/weather browser checks
on Metal. The review page's image selections, labels, videos and benchmark table are verified.
The full functional suite and mobile/other-GPU performance remain unmeasured for this pass.


## Fitted glazing, water and wipers — 2026-10-14

Baseline: published `e9b194f`. The authored flight deck previously had open window holes:
its animated fallback wipers had been repositioned, but there was no corresponding wet glass.
Six glazing patches now follow measured source frame rails. Neither the source GLBs nor
camera/eye position changes. Dry reflections are deliberately faint. Two replacement blades
follow the front panes; their shared sweep phase also clears the water shader.

Water is attached to pane UVs rather than the screen. High refracts the already rendered
exterior through beads and moving rivulets; low draws shaded highlights without a framebuffer
copy. Wiped sectors gradually collect water again. The existing outside rain streaks remain.
Clear weather starts dry, and leaving rain lets moisture fade. HUD and settled ND views skip
refraction copying, as does low quality; adaptive quality changes release the texture.
Glazing is hidden during cabin reflection capture and excluded from the baked diffuse light.

No new model or texture download is added. This adds shader code, geometry and a high-tier
wet-view framebuffer copy; its cost is recorded in the performance report. Droplet flow,
blade contact on the faceted source and dry reflectance remain approximations. This does not
add ice, condensation, scratches, physically complete transmission or a water-fluid simulation.
Phone framing and the broader ground/scenery gaps remain.

The [local review](output/windshield-review.html) contains matched high/low clear, storm,
side and night views, moving wiper recordings and landscape touch captures. All 16 Node
suites pass. The existing visual and cabin-lighting checks pass on Chromium Metal, including
missing-model/material fallback, finite reflection captures and weather/night transitions.
The lighting test's cloud-crossing probe now changes camera height, matching the atmosphere's
current input; the previous aircraft-altitude-only probe also failed on published main.
No cloud-rendering behavior was changed for this pass.

The new both-tier windshield check verifies visible pane water, zero changed PFD/ND pixels,
moving droplets and bounded clearing (the sampled wiped alpha is 70.6% of the unwiped alpha).
Dry reset leaves no water; HUD and settled ND cause no exterior copies. Resolution changes
replace and dispose the texture, and adaptive low quality releases it and uses the simpler
shader. The water shader uses the renderer's logarithmic depth and computes UV derivatives
before discarding fragments. This is verified on Metal; another GPU, real mobile hardware
and the full functional browser suite were not exercised for this pass.

Two paired M2 Pro samples at fixed high 1.5× show captain FPS **39.81 → 37.31** and
**38.56 → 38.06**, and storm **42.38 → 38.20** and **40.00 → 38.56**. High therefore has a
measurable cost (1.3–6.3% captain / 3.6–9.9% storm across these short pairs); low stays near
60 FPS. The existing adaptive policy remains and drops refraction when it lowers quality.
See the [performance record](RENDER-PERFORMANCE.md#fitted-glazing-water-and-wipers--2026-10-14)
for raw reports, transfer/memory cost and measurement limits.

The review page also passes all eight image/quality selections, before/after paths,
both-tier video playback, landscape touch image dimensions, benchmark rows, zoom and
narrow-screen layout. It remains a local review artifact in ignored `test/output/`.


## Rain repetition and motion — 2026-10-15

Baseline: published `c8869d5`. The reported short storm loop was real. The outside shader
translated one fixed constellation through a 44 × 30 × 40 m wrapping box. At 70 m/s ground
speed, ten seconds moved it down three box heights and forward fourteen box depths, returning
every drop to the same location. Multiplying the current velocity by total elapsed time also
made speed changes reposition the whole field. Streaks had a fixed shape and the box rotated
with the pilot's view. The newly added pane beads reused their positions on 4–8 second cycles.

Outside rain now integrates a bounded, world-oriented pool. Drops fade near its edges and
respawn at fresh upstream positions with varied fall speeds, widths and exposures. Soft,
tapered streaks follow projected wind-minus-aircraft motion, including sideways views and
stopped aircraft. Looking around does not rotate the field. High retains 2,600 drops; low
uses 900, including desktop low and adaptive downgrade (desktop low previously kept 2,600).
This reduces the uniform white-dash clutter and adds no image, model or additional rain pass.
The independent rain RNG preserves repeatable scenarios without a short animation loop;
the established cloud/lightning RNG sequence is retained. Lightning and flight physics are
unchanged. Pane hashes now include the arrival number, giving each arrival a new shape/location.
Wipers retain their regular mechanical sweep and clearing behavior.

The actual old shader's isolated frames ten seconds apart overlap by **99.89%**. The new
frames overlap by **0.33% high / 0.17% low**. Normalizing the pane arrival clock in an isolated
shader check gives **100% old / 8.02% new** overlap across successive arrivals. These numbers
demonstrate removal of repeated patterns, not a physical realism score. Both rain tiers remain
visible in the isolated render. The regression also checks clear-weather removal, world
orientation during a side look and the 900-drop adaptive limit.

All 17 Node suites pass, including deterministic replay, bounded recycling, continuous
acceleration without position jumps and wind direction. The windshield browser checks pass
on both tiers: PFD/ND pixels remain unchanged, wipers clear water, dry reset removes it, HUD/ND
skip copies, resize disposes the buffer, and low quality removes refraction. The night check
now allows fewer refracted bright pixels after removal of the dense hard dashes, while still
requiring visible distortion and unchanged instruments. No extra night glow was introduced.

[The local review](output/rain-motion-review.html) contains matched storm, side, night and
stopped views, twenty-second motion recordings on both tiers and the isolated repetition
comparison. Rain still approximates individual drops; local precipitation shafts, spray,
splashes and fuller water films remain future work. The broader ground/cloud/cockpit plan is
not completed by this correction. Hardware cost is recorded in the performance report.

The paired M2 Pro measurement is roughly unchanged: high storm **40.97 → 41.64 FPS** and
clear captain **39.61 → 39.56 FPS**, low about **60 FPS**, with unchanged draw-call totals.
These are short fixed-resolution samples, not evidence of a speedup or mobile performance.
See the [performance record](RENDER-PERFORMANCE.md#rain-repetition-and-continuous-motion--2026-10-15)
for rendering/transfer cost, raw reports and limits.

The review page passes all eight view/quality selections, both-tier motion playback,
isolated image dimensions, benchmark rows, zoom and narrow layout. Diagnostic mask panels
are brightened for legibility; their overlap metrics use the original unaltered alpha.


## Upper-valley ground cover and connected woodland — 2026-10-15

Baseline: published `d9a30ef`. The upper short-final view still showed broad leaf-off
photographic woods as bare-looking grey hills with sparse, randomly clustered trees.
The interpreted ground cover now extends from x=6100 to x=9000 on both sides, adding
another 2.9 km to the existing four-kilometre section. Fifteen original polygons from
six already bundled NAIP tiles add woodland, meadow and a large harvested clearing;
holes retain fields and residential clearings inside the stands. This is a leafy scenery
interpretation of the photographs, not a survey or a change to the terrain elevation.

Mapped coverage rises from **383.14 to 910.27 ha**: 73.80 meadow, 46.24 stubble and
790.23 woodland. The extension's outer edges taper over 160–180 m where the forest
continues beyond the map. Forest-floor colour retains photographic light/shade at
longer distances, avoiding a uniform green sheet between widely spaced low-tier trees.
The original mask is unchanged west of x=5980; the additional source tiles overlap
its former upper edge farther east. Airport, roads, buildings and site exclusions remain.

The extension receives up to 18,000 high / 2,600 low trees from the existing **52,000 /
14,000 overall budgets**. Existing mapped allocations are retained; wider background
planting is reduced. Candidate spacing is 16 / 30 m before uniform thinning. Actual
mapped counts, including the existing 30 site trees, are **39,848 high / 12,430 low**.
No tree model, atlas, aerial tile or new shader texture sample is added. The mask/manifest
add **112,812 bytes**; high GPU mask memory increases by 5.887 MB, while low uses a reduced
2048 × 603 mask and saves about 3.18 MB. Both retain the full 2 m CPU map, adding 5.887 MB.

[The matched review](output/upper-valley-review.html) starts with the normal captain view
at 7.5 and 6 km before threshold, followed by the closer approach, wide field/woodland
views and night. The extended woods visibly change the early cockpit view; closer views
change less. Low still has conspicuous sparse image-based trees. Repeated crowns,
unmapped hills, photographic shadows and incomplete building/site coverage remain.
The ground-detail tile loader is unchanged: a view-prioritisation experiment showed too
little benefit in the sampled later cockpit views to retain in this pass.

All 17 Node suites pass. Both-tier rendered scenery checks pass, including all-field,
road and building tree clearances, fixed tree totals, low GPU mask dimensions, close
surface visibility and missing-mask fallback. The paired Metal benchmark measures a
3–6.2% FPS cost in the newly wooded high 1.5× views (about 35–36 FPS), while low stays
near 60 FPS. This is a measured visual tradeoff; fixed high 1.5× still does not meet 60 FPS.
See the performance record for raw measurements and the full-flight check.

The complete real-time short-final autoland also succeeds (score 100). At fixed high
1× it averages 58.94 FPS over 137.61 s, p95 16.8 ms, with no in-flight resource requests.
A 199.9 ms flight-start spike and two additional intervals over 50 ms remain in the
record. This is one local M2 Pro flight, not a cross-device performance claim.

All 23 browser graphics regression checks pass. The comparison page also passes all
16 view/quality selections, eight benchmark rows, full-width comparison, zoom and
narrow-screen layout checks, with no page or resource errors.


## Fair-weather cloud forms and shading — 2026-10-16

Baseline: published `0b3c2c5`. The ordinary clear-weather sky still used four similarly
arranged density fields. The replacement has six distinct forms: spreading/low banks,
leaning and compact towers, paired turrets and an uneven bank. Smaller attached billows
and erosion are baked at 80³ rather than 64³. Increased opacity and a closer first light
sample separate the sunlit lobes from their shaded body. The result remains stylised,
especially close up; it does not constitute a full weather or fluid simulation.

The existing pixel-random ray start became conspicuous with stronger billow shading.
Cached rendering now uses 36 fixed midpoint samples in place of 36 jittered samples.
Three shadow lookups, 26 volumes, placement, wind drift and the low-tier sprites remain.
The visual benefit is visible from the normal cockpit as well as the exterior views.
Overcast boundaries, rain, cloud-deck visibility and all flight physics are unchanged.

The packed 160×80×240 field is 208,555 bytes compressed, adding 129,491 bytes to high startup;
low does not download it. CPU density and GPU texture each add about 2.02 MB. The six
fields fit below 256 texels on every texture axis. Empty borders prevent variant leakage.

All 17 Node suites pass, including density bounds, distinct occupied volumes and transfer
limits. Actual Metal shader checks verify all six silhouettes, response to a changed sun
direction, darker night lighting and a lit interior. These establish rendering
behaviour, not physical accuracy. Matched captures and measured costs are recorded in the
performance record and the local `output/cumulus-review.html` page.

The attempted software-renderer check is unavailable on this host: even an isolated
`WebGLRenderer` cannot create a SwiftShader context. No software-renderer pass is claimed.

All 23 graphics regression checks pass on Metal. Corrupt-volume, missing-decompressor,
host-decoded gzip and automatic-quality disposal checks also pass. The review page passes
all 16 matched image selections, eight benchmark rows, full-width comparison, zoom and
narrow-screen layout without page or resource errors.


## Airport architecture and night glazing — 2026-10-16

Baseline: published `0a59a48`. Five almost identical halls, window-grid end blocks and
a cylinder tower remained conspicuous around the landing destination. The revised
original geometry gives the central hall a taller roof, steps the outer halls down,
connects their fronts with glazed galleries and solid stair cores, and adds mezzanine
bands and V-shaped supports. Curtain walls are recessed behind the eaves. The end
wings use shaded continuous glazing, while pitched hangars gain sliding-door panels,
service doors and side ribs. An eight-sided sloping control cab, balcony, supported
underside, annex and aerials replace the cylinder tower.

Small original glass/interior paintings and a sign canvas share the existing sky
reflections. Their emission changes at dusk/night without regenerating textures.
The glass remains opaque; its faint interior marks are an approximation without
parallax. No downloaded assets are added. The same design reaches low quality with
smaller canvases and fewer fine seams. The ordinary approach improvement is modest;
the new structure is clearest during rollout, a side look and closer airport views.

All 17 Node suites and 23 graphics browser checks pass on Metal. The dedicated
both-tier airport check verifies finite, non-degenerate geometry, outward-facing
front glazing, preserved operational clearance, bounded geometry/texture cost and
scenario lighting, and captures ten matched views per tier. Roof-normal inspection
and close captures also removed reversed normals and thin hangar roof strips that
aliased at shallow viewing angles. Shadows beneath narrow eaves still expose the
coarse airport-wide shadow map at close range. The full flight suite, real phones
and another GPU were not exercised for this static scenery pass.

The [local comparison](output/airport-architecture-review.html) shows all matched
views, including ordinary cockpit views where the difference is smaller. See the
performance report for paired measurements and residency cost. The broader plan
still includes incomplete landscape/building coverage, distant tree impostors,
unique cockpit wear textures, finer atmospheric structure and sparse apron detail.

The paired M2 Pro run is effectively unchanged: high captain **38.78 → 39.03 FPS**,
rollout **41.05 → 41.11**, airport **56.76 → 57.26**, and terminal **53.43 → 53.69**;
low stays at about **60 FPS**. The 0.1–0.9% high differences are too small to establish
a speedup. Cockpit draw calls decrease from 936 to 917, with no added asset requests.
Generated texture residency is 2 MiB high / 0.5 MiB low, replacing a 0.67 MiB map.

## Phone cockpit framing and readouts — 2026-10-17

Baseline: published `758d903`. On a short landscape touch screen the 58° vertical
lens made the windshield and instruments small, floating speed/altitude readouts
overlapped the autopilot panel, and PANEL tilted 54° down toward the floor.

The forward view now uses a 48° lens and an 11° downward gaze, preserving the
original pilot eye point and source geometry. PANEL smoothly widens back to 58°
and looks 27° down, centering the primary instruments and pedestal. The floating
readouts move upward in the forward cockpit and hide during the panel look. MAP
moves above the rudder on these screens, clearing the larger captain displays.
The rule follows the active touch scheme and viewport (height ≤600 px, aspect
≥1.35), independently of graphics quality. Taller tablets, desktop cameras,
Flight School camera anchors, and MAP/head-up framing retain their existing values.

Matched full-scene captures measure the center of the captain's forward pane at
103.4 → 125.5 CSS pixels on an 852×393 phone: about 21% taller. The altitude column
ends 61.6 px above the MCP anchor instead of overlapping it by 12.1 px. Even on the
812×265 Safari viewport it clears that anchor by 20 px. Primary PFD/ND corners
remain inside the screen, and MAP clears both displays. The before/after page is
`output/phone-cockpit-review.html`; it includes storm, panel, MAP, HUD, three smaller
phone sizes, tablet and desktop captures.

All 17 Node suites pass. Desktop keyboard/camera, navigation and phone groups pass
110 browser checks; graphics passes 23. After relocating MAP, the final phone
group (including its common setup checks) passes 45/45, covering multiple sizes,
safe insets, touch input, rotation, MAP and Flight School. Dedicated full-scene
captures and projected geometry/readout checks pass. Tests use Chromium/Metal,
with emulated touch and safe areas; physical iOS/Android devices remain untested.

Paired M2 Pro samples at 852×393, low, fixed 1× remain display-capped at 60 FPS in
clear and storm. Draw calls fall 575 → 540 and 555 → 521 because the lens excludes
more objects; this does not establish a speedup or physical-phone performance.
There are no added models, images, textures or render passes. The closer lens
trades some peripheral view for larger detail; touch controls still occupy scarce
space. Broader scenery coverage, unique cockpit wear, distant vegetation and finer
weather remain open visual work.

## Cockpit panel, padding and grip finishes — 2026-10-18

Baseline `0b14a19`. The previous generic micrograin leaves broad painted surfaces nearly
uniform from the captain's seat, and the glareshield has no material finish. Its source
`Material.481` is shared with other fittings, so applying a global padding material would
also change unrelated parts.

- Added one non-repeating packed atlas per tier, fitted in model coordinates to the forward
  panel, glareshield, yoke grips and window rails. The offline generator traces 1,033 actual
  forward panel boundary segments; screen cutouts remain empty and lettering is untouched.
- Colour and roughness vary gently around controls and contact areas. High quality adds a
  shallow rolled paint rim, under 0.6 mm, and reuses existing CC0 leather grain on the
  glareshield. Grip areas retain smoother rubber; their masks follow the animated yokes.
- The glareshield mask selects 352 high / 282 low vertices, while 1,449 high / 1,109 low
  vertices sharing its material remain outside the finish. All UVs/weights are finite and
  bounded, and live screens have no wear attributes.
- Model geometry, original base colours, eye point and lighting calibration are unchanged.
  Low quality uses only the small colour/roughness atlas; the preceding low roughness
  treatment stays in place. Failed atlas requests retain the previous materials.

This is **a modest material refinement**, not a transformation of the flight deck. The normal
forward view remains dominated by broad, simple source surfaces and the existing lighting.
The edge treatment and grip response are easier to assess at full size and in angled/panel
views. Side consoles, overhead, many small components and the added roof do not have unique
wear maps. This does not complete the aircraft-specific material work or address shadow
resolution and indirect illumination.

Validation on Chromium / ANGLE Metal:

- All 17 Node suites pass, including the delivered model's proportions and control bindings.
- Ten matched high/low captain, left-looking, panel, night and storm captures pass the new
  material checks. Ten phone/tablet/desktop layout views retain the prior framing and readout
  clearances. Graphics browser group: **23/23**.
- Cabin lighting checks pass both tiers across clear, night and overcast/storm transitions:
  finite illuminated captures, bounded reuse/disposal, degenerate derivative guards,
  missing scans/atlas, and rejected/throwing reflection-capture fallbacks.
- Paired hardware runs retain the same draw calls and triangles. High fixed 1.5× samples
  measure 36.95 → 37.56 FPS clear and 38.23 → 39.31 storm; low remains display-capped at 60.
  These small changes are run variation, not evidence of a speedup. See the performance log.

The local `output/cockpit-surfaces-review.html` presents clearly labeled before/after images
and timings. Reproduce images with `VISUAL_GPU=metal npm run test:cockpit-surfaces`, using
`REVIEW_ROOT=/path/to/0b14a19` and a separate label for the baseline. Raw final capture and
benchmark records are under `benchmarks/2026-10-18-cockpit-surfaces-*`.
The complete flight suite and software-renderer coverage were not rerun for this pass;
SwiftShader cannot initialize WebGL on this host. Physical phone/GPU measurements remain open.
Broader complete approach scenery is still a major remaining visual item.


## Residential approach frontage — 2026-10-19

The next complete-site pass covers the residential stretch at x ≈ 4.3–4.8 km on the
left of the normal approach. Twelve generic footprints now have complete house,
workshop and garage models. A thirteenth, a previously missing detached garage,
follows a reviewed roof trace from the existing public-domain `4_0` imagery. The
full scene now contains 2,166 building placements, with 35 complete placements
across five sites. Source footprints remain registered. Heights, architecture,
parcel edges and planting are interpretations, not surveyed reconstruction.

Cream, sage and warm grey siding reuses the filtered clapboard normal. Recessed
openings, eaves, gutters, chimney caps and door steps supply depth. A small,
original 256 px shingle texture breaks up the new roofs. The delivery tool restores
its charcoal multiplier explicitly; Blender's exporter preserved the image but
omitted the MixRGB factor. An asset assertion protects that correction.

Six lawn parcels, seven yards and five drives replace blurred ground around the
homes. Seven local access joins and all five drive-to-main-road joins are checked
against rendered geometry. Gravel colour can now vary by site. The existing pool
is kept visible through a lawn opening, while that opening still excludes tree
planting. The 42 eligible site trees stay within the existing total budgets of
52,000 high / 14,000 low. Missing extension data still retains the original nine
complete valley buildings and the procedural footprints elsewhere.

The [local comparison](output/roadside-homes-review.html) includes three normal
captain positions, a wide frontage view, two site views, storm and night on both
tiers. It compares the working tree with `396c522` at the same camera and 1×
resolution. The change is clearer looking toward the sites than in the normal
forward cockpit view. It is another completed stretch, not a general replacement
for the aerial scenery. Lawns and yards remain simple at close range; distant
facades, photo shadows and imagery blur outside these parcels remain unresolved.

Validation: all 17 Node suites; the complete-site rendered checks on both tiers;
authored scenery atmosphere bindings and missing-model/material/data fallbacks;
approach footprint, road, ground-detail streaming and planting tests. All 35 roofs
are present, with 37 roof samples, 13 local access joins, five main-road joins and
no trees intruding into the reconstructed sites. Maximum site-ground error is
below 0.04 mm. Tests use Chromium ANGLE Metal on this Mac; software-renderer and
physical-phone performance were not measured. See the paired measurements in
[the performance record](RENDER-PERFORMANCE.md#residential-approach-frontage--2026-10-19).


## Directional woodland lighting — 2026-10-19

The previous crown images included a fixed baked sun. Turning a camera-facing
impostor could turn that highlight with it, and every stand retained similar
illumination regardless of its orientation. The new colour bake averages diffuse
sky access, while a compact response atlas records how the delivered branches
and leaves respond to six opposing lights, including their self-occlusion.
Signed directional differences are blended with the same four views as colour,
rotated with each tree, and evaluated against the actual sun direction and colour.
The response fades into diffuse lighting under cloud and at night.

This improves light and shade across existing crowns. It does not add species,
coverage, tree instances, geometry, draw batches, runtime shadow maps or new
external sources. Near-tree models and their 48-tree / 2.4-million-triangle ceiling
are unchanged. The wider daytime woodland views show clearer crown separation;
the normal forward cockpit comparison is more restrained. Distant and low-tier
trees remain image planes, and repeated forms, sparse unmapped hills, photographic
shadows and view-blend imperfections remain visible. This is a first-order lighting
approximation, not complete dynamic self-shadowing.

The linear response texture is half the colour atlas resolution in each dimension.
Net image transfer grows by 607,980 bytes high / 199,768 low, including the rebaked
colour maps, with about 10.1 / 2.5 MiB additional mipmapped GPU storage. It loads
with existing scenery preparation. Missing or incorrectly sized optional response
data keeps the diffuse-sky colour atlas; branches do not disappear or become black.
The bake writes opaque surviving MASK pixels before canvas readback, avoiding
normal/response data corruption from fractional-alpha unpremultiplication.

Validation completed on Chromium ANGLE Metal: all 17 Node suites; atlas data,
framing and size budgets; rendered directional response and diffuse-light invariance
on both tiers; missing and wrong-size response fallbacks; 108 leaf-coverage views;
and a 420 m moving pass checking tree counts, triangle limits and fade continuity.
The same 28 scene captures compare main `2dbf3a7` and this pass at 1×, including
two captain positions, canopy, hillside, dusk, overcast and night. See the local
[lighting comparison](output/woodland-light-review.html) and
[performance record](RENDER-PERFORMANCE.md). Full functional flight tests,
software-renderer checks and physical-phone benchmarks were not rerun.


## Airport glazing and interior depth — 2026-10-20

The terminal's painted window interiors stayed fixed to the glass while the eye moved.
They are replaced by bounded analytic rooms: rear walls, floor and ceiling planes, doors,
information boards and a seat/back volume. Main hall and gallery fronts span four panes,
with consistent coordinates across the mullions. Side elevations and the sloped tower cab
use individual bays. Cooler tinted daylight interiors sit behind lower-roughness,
nonmetallic glazing; night adds ceiling strips and varies occupancy by bay.

This changes the appearance most at the terminal and in moving close views. It is subtler
from the ordinary approach. Airport geometry, operational clearances, jet bridges and
parked aircraft are unchanged. The rooms remain an opaque visual approximation, with
simple furnishings and sky-only reflections; there are no walkable interiors, object
reflections or physically transmitted light. Existing coarse building shadows remain.

The pass introduces no new downloaded assets, draw calls, triangles or render passes.
Removing the old generated colour/emission maps saves about 1.33 / 0.33 MiB of GPU texture
storage (high/low), while static room attributes add 182,424 bytes on either tier. The
shader substitutes room intersections and shading for two painted-atlas reads. Performance
and verification are recorded in [the performance log](RENDER-PERFORMANCE.md).

The local [glazing comparison](output/airport-glass-review.html) includes matched views
from main `a4e2bad`, both tiers, daytime, night, overcast, normal pilot views, and a moving
terminal inspection. Ground blur, incomplete rural scenery and tree coverage remain
separate, larger scenery limitations.

Validation completed: all 17 Node suites, both-tier airport geometry and atmosphere
checks, 120 continuous four-pane hall rooms, six finite-output/parallax views and
matched 100 m motion recordings. The comparison page passed all 56 image loads,
ten measurement rows, zoom/full-width controls, both video controls and a 390 px
layout without page errors. On this M2 Pro, high terminal views measured about
2–3% fewer FPS, with all sampled low views near 60 FPS; draw/triangle counts are
unchanged. Other GPUs, physical phones and the full functional-flight suite were
not retested for this material pass.
