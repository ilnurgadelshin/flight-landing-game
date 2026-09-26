# Visual audit — 2026-09-26

The main problem was a collection of weak visual cues: distorted cockpit proportions,
textureless foreground surfaces, flat photographed land, primitive trees and clouds, and
overbright lights. A more capable engine would still draw those assets poorly. This pass
keeps Three.js and changes the composition, scenery, materials and weather rendering.
It is a visible improvement, but does **not** reach the asset quality of a modern commercial
flight simulator. The remaining limitations below are part of the assessment.

These priorities reflect the ordinary daytime landing view. The fog defects in item 12
become critical in the storm scenario. Baseline screenshots are preserved locally in the
ignored `test/output/visual-audit-before/` folder; current captures are `test/output/rebuild-*.png`.

| Rank | Cause of the dated appearance | Changes made | Remaining limitation |
| --- | --- | --- | --- |
| 1 | Wide camera, obstructing windshield pillars, tiny instruments and runway | Desktop vertical FOV 70° → 58°; eye moved into the forward pane's sightline; panel pitch adjusted; narrow screens retain the wider view. Checked PFD and ND visibility. | The source model's pillars and glareshield are still bulky. Rebuilding these shapes is more valuable than another lighting adjustment. |
| 2 | Flat brown/grey cockpit surfaces with little material separation | Distinct panel, trim, padding and seal finishes; calibrated roughness; fine, mipmapped surface grain; retained modeled lettering and baked contact shading. | The source has no authored texture set. It still needs baked normal/roughness maps, seams, wear and better small-part geometry to look photographic. |
| 3 | A completely flat approach corridor | Rolling relief outside the protected runway/approach strip; denser terrain mesh near the airport; rendering and collision use the same height function. | Heights are synthetic, not surveyed elevation. The safe approach strip is deliberately flat. |
| 4 | Blurry aerial imagery ahead of the airport | Added a bundled 8 km final-approach image at 2 m/px, blended with the other layers; smaller equivalent on phones. | Imagery remains visibly flat near the ground. Photographed houses and roads outside the airport have no matching 3D geometry; the imagery has a muted seasonal palette. |
| 5 | Sparse, three-lobed tree blobs | Four canopy views baked from a detailed CC0 tree; instanced intersecting foliage planes, varied size/tint, grouped woodland stands, ground contact and alpha-to-coverage. | These are foliage impostors with limited species variety. Close flyovers reveal repetition and the underlying photo; full nearby tree geometry would improve them. |
| 6 | Thin cloud rings and weak volume | Taller, denser cloud shapes; varied rotation; deeper bases and multiple sun-occlusion samples in the high-tier volume shader. | Fair-weather clouds remain simplified noise volumes. Low quality retains sprites; overcast is not a complete volumetric cloud system. |
| 7 | Runway lights look like a luminous rectangle by day | Smaller daytime cores, lower daylight intensity, distinct PAPI/beacon sizing and fog attenuation without a minimum visibility floor. Night bloom retained. | Point-based lights approximate optical glare; no lens-scattering simulation. |
| 8 | Flat, muddy illumination and weak foreground depth | Balanced neutral daylight, hemisphere and cockpit fill; stronger environment contribution; retained sun shadows and baked cockpit occlusion. | No real-time global illumination. Baked shading and fill cannot replace correct geometry and texture detail. |
| 9 | Box-like airport and disconnected jet bridges | Terminal length matches all five stands; roof seams, flashing, HVAC, hangar ribs, building bases and articulated bridge ends reaching the aircraft. | Buildings are still procedural architecture. A detailed terminal asset would offer a larger further improvement. |
| 10 | Clean rectangular pavement pasted onto the terrain | Irregular runway shoulders, softer grass margins, subtle mowing, asphalt variation, apron slabs and expansion joints. | Ground-level wear, drainage and small debris remain sparse. |
| 11 | Windshields appear absent | Restrained reflective glazing on the forward panes. | Refraction, glass-specific dirt, water droplets and optical distortion are not implemented. The separate cockpit render pass limits physical transmission without restructuring the passes. |
| 12 | Hard black fog horizon, a dark sheet inside the cloud transition, and lights visible through opaque cloud | Fixed shared atmospheric uniforms on foliage/deck shaders; show cloud surfaces only from outside the deck; removed the lights' 3% fog visibility floor. Added rendered regression checks. | The earlier audit incorrectly blamed a CSS rain overlay: it was already disabled. Existing rain uses 3D streaks driven by relative velocity; realistic water on glass remains future work. |
| 13 | Jagged foliage, grain and inconsistent fine-detail sharpness | Alpha-to-coverage for foliage; mipmapped grain and anisotropic filtering; checked existing 4× world MSAA and antialiased cockpit rendering. | No temporal AA. Thin modeled labels and branches can still shimmer at distance. |
| 14 | Repeating facade grids and weak building contact | Higher-resolution facade texture, varied glazing, mullions, sills, roof edges and base details. | Repeated procedural facades remain recognizable close up. |
| 15 | Prototype-like desktop readout bar | Inset, quieter translucent status strip with restrained borders and spacing; controls and readouts retained. | The simulator intentionally retains training/status UI. This matters less than asset quality. |

The next substantial quality step is **asset production**, in this order: rework the cockpit
shell and bake a complete material set; add matching 3D buildings/roads and more varied nearby
vegetation; then replace the overcast/rain approximation with volumetric weather and water on
the windshield. An engine migration alone would not deliver those improvements.

All imported assets remain free and openly licensed. The new foliage atlas comes from
[Tree Small 02 by Rico Cilliers / Poly Haven](https://polyhaven.com/a/tree_small_02), CC0.
Sources, modifications and repeatable preparation commands are in
[`assets/README.md`](../assets/README.md).

## Verification

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

These checks establish rendering correctness and preserve flight behavior. They do not measure
hardware frame rates or establish photorealism; the asset limitations in the table remain.
