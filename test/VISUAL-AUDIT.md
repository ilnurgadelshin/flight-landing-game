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
| 4 | Blurry aerial imagery ahead of the airport | Added a bundled 8 km final-approach image at 2 m/px, blended with the other layers. Added 2,160 buildings from registered footprints, pitched roofs, eaves, foundations, nearby window relief and night windows; two checked valley roads follow the terrain. | Near-ground imagery remains blurry and seasonally muted. Footprints follow the photo, but roof forms/facades and road widths are interpretations; minor roads remain photographic. |
| 5 | Sparse, three-lobed tree blobs | Four canopy views baked from a detailed CC0 tree; instanced intersecting foliage planes, varied size/tint, grouped woodland stands, ground contact and alpha-to-coverage. | These are foliage impostors with limited species variety. Close flyovers reveal repetition and the underlying photo; full nearby tree geometry would improve them. |
| 6 | Thin cloud rings and weak volume | Taller, denser cloud shapes; varied rotation; deeper bases and multiple sun-occlusion samples in the high-tier volume shader. | Fair-weather clouds remain simplified noise volumes. Low quality retains sprites; overcast is not a complete volumetric cloud system. |
| 7 | Runway lights look like a luminous rectangle by day | Smaller daytime cores, lower daylight intensity, distinct PAPI/beacon sizing and fog attenuation without a minimum visibility floor. Night bloom retained. | Point-based lights approximate optical glare; no lens-scattering simulation. |
| 8 | Flat, muddy illumination and weak foreground depth | Reduced warm daytime lamps in favour of neutral sky light. Sun shadows plus a rebake of close contact and cabin sky access, including the fitted roof. Baked occlusion now affects indirect light rather than darkening the paint and direct sunlight. | No real-time global illumination. The bake approximates sky access and bounced light; it cannot replace fully authored materials. |
| 9 | Box-like airport and disconnected jet bridges | Terminal length matches all five stands; roof seams, flashing, HVAC, hangar ribs, building bases and articulated bridge ends reaching the aircraft. | Buildings are still procedural architecture. A detailed terminal asset would offer a larger further improvement. |
| 10 | Clean rectangular pavement pasted onto the terrain | Irregular runway shoulders, softer grass margins, subtle mowing, asphalt variation, apron slabs and expansion joints. | Ground-level wear, drainage and small debris remain sparse. |
| 11 | Windshields appear absent | Removed the approximation planes fitted to the incorrectly stretched shell during the source-fidelity correction. | Glazing should follow the actual source panes. Refraction, water droplets and optical distortion remain unimplemented; the separate cockpit pass limits physical transmission. |
| 12 | Hard black fog horizon, a dark sheet inside the cloud transition, and lights visible through opaque cloud | Fixed shared atmospheric uniforms on foliage/deck shaders; show cloud surfaces only from outside the deck; removed the lights' 3% fog visibility floor. Added rendered regression checks. | The earlier audit incorrectly blamed a CSS rain overlay: it was already disabled. Existing rain uses 3D streaks driven by relative velocity; realistic water on glass remains future work. |
| 13 | Jagged foliage, grain and inconsistent fine-detail sharpness | Alpha-to-coverage for foliage, anisotropic filtering and mipmapped, metric-scale cockpit finishes. Removed the cockpit shadow normal offset that stippled the double-sided liner; existing 4× world MSAA and cockpit antialiasing remain. | No temporal AA. Thin modeled labels, shadow edges and branches can still shimmer at distance. |
| 14 | Repeating facade grids and weak building contact | Higher-resolution airport facades; approach buildings now have varied siding/brick textures, roof edges, terrain-fitted foundations, nearby sills/lintels and approximate sun-direction ground shadows. | Repeated procedural facades remain recognizable close up. The approach uses three facade families, not individually authored houses. |
| 15 | Prototype-like desktop readout bar | Inset, quieter translucent status strip with restrained borders and spacing; controls and readouts retained. | The simulator intentionally retains training/status UI. This matters less than asset quality. |

Further cockpit work should begin with a source-versus-game comparison, not a replacement
model. The approach now has matching building footprints and two valley roads. The next large
scenery gaps are varied nearby vegetation, richer house/farm assets and ground detail;
weather still needs better overcast and windshield water. An engine migration alone would not
provide those assets or effects.

All imported assets remain free and openly licensed. The new foliage atlas comes from
[Tree Small 02 by Rico Cilliers / Poly Haven](https://polyhaven.com/a/tree_small_02), CC0.
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
