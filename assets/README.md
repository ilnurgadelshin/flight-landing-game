# Bundled visual assets

The simulator uses free assets that permit redistribution. No account, map subscription,
API token, or third-party request is needed when playing. The project code's MIT license
is separate from the asset licenses below. Player-facing attribution is in `credits.html`,
linked from the menu.

## Boeing 737-800 flight deck — CC BY 4.0

`models/737-cockpit.glb` and its `-low` variant are adapted from **Boeing 737-800 Cockpit** by **hakai315**:
https://sketchfab.com/3d-models/boeing-737-800-cockpit-d463256f98654b36af019d2d88bd5bbe

Author: https://sketchfab.com/hakai315
License: https://creativecommons.org/licenses/by/4.0/
Original download notice: `models/737-cockpit-LICENSE.txt`.

Changes: removed stray geometry, converted coordinates and scale, repositioned the captain's
seat, reduced geometry, merged static meshes, baked vertex contact shading, compressed with
Meshopt, and separated the yokes, columns, thrust/reverse levers, flap/speedbrake levers and
trim wheels for animation.
The simulator adds working PFD/ND/engine displays, selected MCP values, standby instruments
and animated controls, and closes the source's open roof with a fitted headliner. The low
variant also omits the tiny molded lettering. It is a visual adaptation, not a certified cockpit trainer.

The GLB files retain the source's shell/window proportions, material colours and roughness. The camera
is fitted to the original cabin. An earlier conversion stretched the upper shell and darkened
the trim; comparison with the source in Blender exposed these integration errors, and they
have been removed. The downloaded glTF contains no texture images. The extra glazing planes
fitted to the stretched shell were removed. `js/cockpit/glazing.js` now follows measured inner
rails of `Body.020` / `Material.008` in the delivered, source-faithful model. Six small curved
patches add glazing without altering either GLB, the camera, framing or instrument geometry.
The front patches interpolate both faceted rails; these are fitted visual surfaces rather
than surveyed aircraft glass. Mirroring uses the source frame's centreline at x = −0.01821 m.

Rain is generated in each pane's UV coordinates, so water stays on the glass as the eye moves.
An analytic sweep age clears drops behind two fitted blades and allows water to accumulate
again. It approximates beads and airflow, not fluid dynamics. High copies the already rendered
exterior into one RGBA8 texture while wet panes are in view, then samples small offsets for
refraction; low uses shaded drops without that copy or texture. A settled ND, HUD or dry view
skips copying. Resolution changes dispose and replace the texture; a new scenario or quality
downgrade disposes it. At 2160 × 1350 this buffer is 11,664,000 bytes, excluding driver overhead.
The glazing/wipers are excluded from cabin reflection captures and diffuse window-light
bakes, avoiding feedback from the exterior screenshot. Original model attribution remains;
no new source model, image, remote request or paid asset is introduced.

The subsequent rain-motion correction replaces the repeating outside line field with a
bounded pool of 2,600 high / 900 low drops. `js/world/rain-field.js` integrates their positions
using wind minus aircraft velocity and varied fall speeds. Drops fade out at the boundary,
then respawn at fresh positions on upstream faces; their seed stream is independent of scenery.
`js/world/rain.js` draws soft, tapered motion streaks in one instanced pass. The pool follows
eye translation but retains world orientation when the pilot looks around. Pane beads in
`glazing.js` now include the arrival index in their position/shape hashes. These are procedural
changes with no new image or model asset. Lightning, weather/flight physics and the source
cockpit geometry remain unchanged.

The runtime adds surface finishes to verified parts of this model. Original procedural maps
distinguish coated panels, window framing and yoke rubber. On high quality, the liner and seats
now use packed **CC0 Poly Haven scans**: [Leather White](https://polyhaven.com/a/leather_white)
supplies neutral embossed grain for the molded liner, and
[Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone) supplies the seat weave.
These are material interpretations, not photographs of the original aircraft's upholstery.
`cockpit/liner.webp` and `upholstery.webp` store linear height, roughness and neutral colour
modulation at 512², with metric scale, seamless projection and mipmaps. The source paint
colours remain. Low quality uses average roughness without these maps; a failed scan download
uses the original procedural finish. Exact source files and modifications are in
`cockpit/sources.json`. Reproduce with `python3 tools/prepare-cockpit-finishes.py`.

The yoke's pure-black grip alone is given 2.2% neutral diffuse reflectance, so its shape remains
visible; screens, lettering and other black parts keep their original colours.

The 2026-10-18 finish pass adds `cockpit/service-wear.webp` (1024² high) and
`service-wear-low.webp` (512² low). These are original, non-repeating material masks
fitted to the source parts, with panel boundaries derived from the credited cockpit
geometry above (CC BY 4.0). They are interpretations of light service wear, not
photographs or a surveyed aircraft livery. R stores colour modulation / 2, G stores
roughness modulation / 2, and B stores grain retention or the forward panel's shallow
edge profile. All channels are linear and the WebP encoding is lossless.

Panel rims follow 1,033 measured boundary segments, including display cutouts;
coplanar tessellation edges, lettering and emissive screens are excluded. High quality
adds a rolled paint edge under 0.6 mm through bump shading. Both tiers vary coating
and roughness around measured controls, lower window rails and yoke grip locations.
The forward glareshield reuses the CC0 leather grain on high, with the finish gated
to its measured volume because its source material is shared with distant fittings.
The UVs stay attached to animated controls. Low adds only the small colour/roughness
mask, without grain or bump sampling. A failed mask request retains the prior finishes.
Reproduce these two maps with `node tools/prepare-cockpit-wear.mjs`; the measured
layout is in `js/cockpit/surface-layout.js`. No model geometry, lettering, base material
colours, camera position or lighting calibration is changed by this pass.

The material assignments were checked in Blender against these source meshes:

| Source material | Verified parts | Runtime finish |
| --- | --- | --- |
| `Material.014` | `Body.002`, `Body.006`, `Body.018` cabin liner | Molded trim |
| `Material.008` | `Body.020` windshield frame | Coated frame |
| `Material.457` | `Cube.008` main panel and side panels | Coated panel |
| `Material.103` | Pedestal casing, panel faces and instrument bezels | Coated panel |
| `Material.261`, `Material.354` | Overhead/MCP faces, subpanels and switch bodies | Coated panel |
| `Material.194` | `Cube.488`, `Cube.489`, `Cube.1088` cushions | Woven upholstery |
| Black material within the two animated yoke groups only | Yoke grips | Rubber |
| `Material.481`, only x −0.73…0.70 m, y −0.265…−0.06 m, z −1.025…−0.85 m | Forward glareshield, verified by ray picking and component bounds | Matte padding; other shared fittings retain their source finish |

The offline shading bake samples both close contacts and light access through the cabin,
including the same added headliner used at runtime. The vertex values attenuate indirect
illumination, rather than darkening the paint and direct sunlight. This remains an approximation
of bounced light; it is not a full global-illumination bake.
Daytime cabin lamps are reduced in favour of sky illumination. Two broad side-window lights
on high quality supply illumination, attenuated by the baked cabin shading. Their diffuse
contribution is integrated once onto the existing vertices, separately for front/back faces
in the cabin's local frame. Weather scales it at runtime. Captures use this same baked
illumination; no area lights are added to the rendered scene. Direct sunshine
still uses the frame shadow map. Both tiers cache a small PMREM reflection capture of the
actual cabin and windows from the fixed pilot eye for each weather layer, instead of reflecting an unobstructed outdoor
sky through the ceiling. The cabin uses a separate fixed-resolution PMREM generator. Captures rotate with the airframe and are disposed on a scenario
change. This is a single-position approximation, not ray tracing or full global illumination;
sunlit cabin reflections are not continuously rebaked during turns. Night flood lighting
and the instrument displays retain their existing brightness. Every new capture is checked
for finite, nonzero half-float radiance before use. Invalid pixels or a failed capture dispose
the target and keep sky/fill lighting for that scenario; the failure is cached to avoid repeated
stalls. The unused area-light lookup tables have been removed.

To reproduce, download the freely licensed **glTF** archive from that page (Sketchfab requires
sign-in), unzip it, run `npm install`, then:

```sh
node tools/prepare-cockpit.mjs /path/to/unzipped/scene.gltf
```

Pass an optional output directory after the source path to build comparison assets without
overwriting the game files. `npm run test:assets` checks the delivered models' frame dimensions,
source materials and animated-control bindings.

For a repeatable source inspection in Blender (optional; not required to build or play):

```sh
blender --background --python tools/review-cockpit-source.py -- /path/to/scene.gltf test/output/source-review
```

This saves the source at the former and corrected eye positions, a material/dimension report
and a Blender inspection file. The workbench images isolate geometry and camera placement;
their lighting is not intended to match the game renderer.

The source archive is about 88 MB unpacked and is deliberately not shipped. The conversion
runs offline; development tools are recorded in `package-lock.json`.

## Parked aircraft — CC BY 4.0

`models/B737.glb` and `models/A320.glb` are the logo-free aircraft by **amvlab**:
https://github.com/amvlab/aircraft-models
License: https://creativecommons.org/licenses/by/4.0/
Notice: `models/amvlab-LICENSE.txt`.

The original files are unchanged. The game adjusts scale/material properties and adds ground
undercarriage for static airport use.

## Ground imagery — public domain

`scenery/region.webp`, `approach.webp`, `airport.webp`, `final-approach.webp` and their `-low` variants are USDA NAIP
natural-color orthophotography, distributed by USGS / The National Map:
https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer

Public-domain documentation:
https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip

Downloaded 2026-09-25–26. The Pennsylvania imagery is repositioned around the fictional
Westhaven airport, with a maintained airfield overlay and locally graded USGS elevation data.
It is scenery, not a geographic or navigation reference. Four images cover the 80 km region, 24 km approach, 8 km airfield and an additional
8 km final-approach area at 2 m/px; phones load 1024 px variants. Exact export requests and extents are recorded
in `scenery/sources.json`. Files are recompressed for delivery.

`scenery/detail/` adds sixteen overlapping 1 km tiles along the last 8 km of the
approach (x 2–10 km, z ±1 km). Downloaded 2026-09-27 from the same public-domain
service, with each exact export URL and extent in `detail/manifest.json`. High quality
uses 2064 px exports sampled at 0.5 m/px; low uses 1032 px at 1 m/px. NAIP's underlying
survey is generally 0.6 m: output sampling does not create finer survey detail.
The 16 m gutters feather into adjoining tiles and the original imagery. At most four
detail textures are resident; movement evicts/disposes old textures. Missing tiles leave
the broad imagery visible. Delivery uses WebP at the original pixel dimensions; exact
encoded sizes are in `delivery.json`.

Reproduce with `python3 tools/fetch-ground-detail.py` (Pillow and curl required).

### Elevation — public domain

`scenery/elevation.js` contains two bundled **USGS 3DEP** bare-earth height grids, obtained
2026-09-28 from the [3DEP elevation service](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer).
[USGS's dataset documentation](https://catalog.data.gov/dataset/1-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-collec)
states that all 3DEP products are public domain. The grids share the imagery's EPSG:3857
registration, corrected for pixel centres. The 80 km region is sampled every 156.25 m and the
24 km approach every 46.875 m, each 513², quantized to 0.25 m. Sampling and quantization do
not imply equivalent survey accuracy. The synchronous module is approximately 1.5 MB and
requires no runtime service, token or delayed physics update. Exact requests and source TIFF
hashes are in `scenery/elevation-sources.json`.

The fictional airport datum is 350 m below the source elevations. A local earthwork blend
keeps x ±3 km, z −300…650 m level; a rising obstacle-clearance envelope protects final and
climb-out while retaining relief below it. Valleys may lie below airport altitude. The hull
support plane now follows the local ground height, preventing invisible Y=0 collisions;
wheel heights and radar altitude use the same query. As before, the hull support plane is
locally horizontal, not a full terrain collision mesh. Outside the 80 km imagery bounds,
heights hold the nearest grid edge, matching the clamped imagery.

Terrain patches share boundary normals and have buried skirts to close gaps between their
different mesh resolutions. Building/road/tree placement continues to follow each quality
tier's actual terrain triangles. Reproduce with `python3 tools/prepare-elevation.py`.

Below 650 m viewing distance, vegetation and warm soil colours receive finer scanned
surface frequencies at 6 m and 10.7 m scales, with rotated sampling to reduce repetition.
Normal and roughness detail fades with the same distance mask; bright roofs and neutral
roads are suppressed by the colour mask. This is an interpreted surface layer, not newly
recovered survey detail. Baked shadows and missing photographic features remain.

## Approach buildings and roads

`scenery/approach-buildings.json` contains 2,160 footprints adapted from
[Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints),
under **CDLA Permissive 2.0**. The required license text is bundled in
`scenery/CDLA-Permissive-2.0.txt`. The pinned 2026-08-13 source-tile URL is in the data file.

The footprints use exactly the scaled Web Mercator registration of the NAIP images:
origin 40.828° N, 77.615° W; local x east and z south. Low-confidence/tiny detections and
buildings inside the fictional airport or approach-light clearance are excluded. Coordinates
are rounded to 10 cm. Source height estimates are capped and missing heights get defaults;
these are not surveyed elevations. The original polygon outlines are retained. Roof colour
is sampled from the public-domain photo; roof pitch and most facades/windows/eaves are
procedural interpretations. Selected nearby walls use the authored CC0 kits described below. Ground shadows approximate the building silhouette in the sun's
direction, with terrain-following triangles and a roughly 0.6–1.8 m feathered edge. Contrast
is reduced under overcast; they supplement existing photographic shadows rather than removing them.
Twelve original facade bays share one atlas: house fronts, upper floors, sparse side walls,
barn doors and loading bays. Building dimensions select residential or agricultural layouts;
bay widths and storey counts keep openings at plausible sizes. Doors stay on the ground
floor, houses get one entrance bay, and gables remain solid. High quality adds beveled
window surrounds, panes recessed behind those surrounds, lintel canopies and thresholds.
The atlas has separate roughness and siding/mortar bump maps; nearby panes use a smoother
reflecting material. Glass and relief disappear at 650/1,200 m respectively.
These layouts are interpretations, not photographs of the source buildings.

`scenery/approach-roads.json` adapts public-domain **U.S. Census Bureau TIGERweb Physical
Features** centerlines (2026 vintage). Source endpoint, query and modifications are in the
file. Only Upper and Lower Georges Valley Road were retained after checking the orthophotos;
some smaller private drives in the source do not match the imagery. The two routes become
three sections when clipped around the fictional airfield. Widths, markings and verge markers
are interpretations. This repackaging is not an official Census Bureau product.

Both files are bundled and require no network while playing. High quality includes roof-edge
trim, nearby window ledges along the flight corridor, and roadside markers; low quality uses fewer, larger spatial batches and omits those
small details. Terrain-following surfaces use the rendered triangle height for each tier.
Buildings and roadside fixtures are visual scenery, not new physics obstacles.

`scenery/approach-infill.json` supplements the ML dataset with **six reviewed roof
traces** from the bundled public-domain NAIP detail imagery: two connected valley barns,
a barn and annex north of final, an eastern farm shed and a detached residential garage. Pixel coordinates and source
tile IDs are retained so the traces can be checked. They follow visible roofs, excluding
photographic shadows; heights, pitch and facades are interpretations.
This small supplement does not fill every missing building in the imagery. Its failure
leaves the main footprint layer available. Regenerate with:

```sh
python3 tools/prepare-approach-infill.py
```

Reproduce after downloading the pinned Microsoft tile and the recorded Census layer-5 query:

```sh
python3 tools/prepare-approach-scenery.py buildings.geojsonl.gz local-roads.geojson
```

The converter requires Pillow, uses bundled imagery for roof colours, and runs offline.

## Authored approach facades — CC0

Forty nearby buildings on high quality, sixteen on low, use four selected modules from each
of these **CC0** Poly Haven kits, both by **James Ray Cock**:

- [Modular Factory Facade](https://polyhaven.com/a/modular_factory_facade): blank wall, window, door and garage.
- [Modular Urban Apartments Facade](https://polyhaven.com/a/modular_urban_apartments_facade): blank wall, two window sizes and door.

The modules retain source UVs, recessed openings, frames and material maps. Geometry is
simplified and Meshopt-compressed; WebP maps are 1024 px high / 512 px low. Wall bay width
and height fit the existing footprint and storey, with source depth retained in metres.
Glass becomes an opaque reflective material with night emission. Runtime batches group
walls by material and spatial tile. Roofs, foundations and unselected walls keep their
existing interpreted forms; these are not complete authored houses or surveyed architecture.
A missing kit retains the full procedural building layer.

Both kits together are **2,512,888 bytes high / 670,672 bytes low**, loaded with scenery
behind the menu, before a normal UI Start completes. File sizes, author records, module dimensions and triangle counts are
in `scenery/facade-sources.json`. The five new curved-roof airport halls and connecting
concourse are original project geometry, not imported Poly Haven assets.

Reproduce (original downloads are cached under ignored `test/output/authored-sources/`):

```sh
python3 tools/fetch-authored-scenery.py
node tools/prepare-facades.mjs
```

The preparation downloader uses an identifying User-Agent and verifies the checksums from
Poly Haven's saved download manifests. It obtains current manifests on the first download;
it is not a version-pinned mirror. The game never calls the Poly Haven API.

## Interpreted approach land cover — public-domain imagery / original mask

`scenery/approach-corridor.png` and `.json` describe meadow, stubble and woodland
along 6.9 km of final, over combined bounds of 6.9 × 2.03 km. The original bilateral
4 km coverage now continues another 2.9 km through the upper valley, including the
woods beneath the early short-final view. Boundaries and clearing holes are original
interpretations of bundled USDA NAIP / USGS `scenery/detail/2_0.webp` through `8_0.webp`
and `2_-1.webp` through `8_-1.webp`. They are artistic land-cover interpretations, not
a land-use survey. The photographs show leaf-off woodland; the scenery interprets
those stands with the existing leafy tree palette. No new imagery or models are used.
The mask and code are original MIT project work; the source imagery is public domain.

Linear RGB stores meadow/stubble/woodland coverage. The 3450 × 1015 mask preserves
2 m/px for CPU planting clearances. High uploads that full mask; low filters it to
2048 × 603 for ground colour, retaining the full CPU sample buffer. Upload dimensions
also respect the renderer's maximum texture size. The existing ground shader still
uses one land-cover lookup and adds no draw call. The larger mask requires about
14.01 MB each for its high-tier RGBA8 texture and retained CPU pixels (previously
8.12 MB each); low's GPU copy is about 4.94 MB, below the previous 8.12 MB.

Coverage is approximately 73.80 ha meadow, 46.24 ha stubble and 790.23 ha woodland:
910.27 ha total, versus 383.14 ha previously. Clearing holes preserve the large
harvested field and lawns inside the upper woods. Airport, building, road and complete
site exclusions remain. The outer extension tapers over 160–180 m where woods continue
outside the interpreted area, avoiding a sharp rectangular treeline. The old mask is
unchanged west of x=5980; the added tile overlaps its former upper edge beyond that.

The three existing planting allocations remain 13,000 / 5,800, 5,500 / 2,600 and
3,500 / 1,400 (high / low). The extension receives up to 18,000 / 2,600 at 16 / 30 m
candidate spacing, uniformly thinned to its cap. These allocations replace wider
photo-selected planting within the unchanged **52,000 / 14,000 total tree budgets**.
The close spacing remains 9.5 / 14 m and the older upper stands 12 / 18 m. Thirty
existing site trees remain individually placed. Background positions/tints and some
near-tree selections change when the fixed budget is redistributed.

Open fields retain surveyed crop and soil variation. Nearby forest floors retain the
existing scanned detail; distant floors now retain photographic light/shade between
crowns instead of becoming uniform green surfaces. Tree cards, sparse low-tier canopy,
photographic shadows and unmapped hills remain approximations.

The PNG/JSON pair is 435,319 bytes, below a 450 KB budget, versus 322,507 before this
extension: **112,812 extra bytes**. It still loads with optional scenery. Reproduce with
`node tools/bake-corridor.mjs` (upper traces are in `tools/upper-valley-cover.mjs`);
validate with `npm run test:corridor`. The bake indexes road/building clearance bounds;
its distance calculation and feathering are unchanged.

## Complete approach sites — original geometry / CC0 materials

`scenery/valley-farm.glb` and its `-low` variant contain thirty-five complete building placements, originally
authored by `tools/prepare-farm.py` in Blender under the project's MIT license. The original
two valley barns, two opposite-side barns and the detached residential garage use NAIP-traced infill outlines; the other
thirty placements retain their Microsoft footprints. The models include clapboard homes,
red-roofed working buildings, workshops, timber barns and three domed silos in two groups.
Recessed openings, thick roof edges/ridge caps, gutters, door
canopies, foundations and home chimneys are geometry. Fine clapboard laps and standing seams
use original 512 px repeating normal maps, filtered through mipmaps instead of thin raised
strips that produced bright broken lines at flight distances. Source heights are estimates; the
new buildings use interpreted roof heights recorded alongside `sourceHeight` in the manifest.
Architecture, wear and grounds are interpretations, not a surveyed reconstruction.

`scenery/valley-site.json` traces lawns, gravel yards, five road connections, an internal
access path, an unmarked local lane and timber boundaries from bundled public-domain NAIP
`detail/2_0.webp`. The original farm yard remains. Surface meshes follow the rendered terrain
on each tier; alpha edges blend into the original ground. Lawn grain and asphalt reuse the
existing CC0 ground materials. Photographed structures and shadows beneath these surfaces
are covered. Fourteen eligible boundary/garden trees replace random planting inside the site,
within the unchanged overall tree budget; roads, yards and buildings remain clear.

`scenery/approach-sites.json` adds a three-building farm, a four-building wooded hamlet
and a six-placement dairy/silo complex on the opposite side of final. It retains the source
pixel outlines from the bundled `detail/2_-1-low.webp`, `detail/3_-1-low.webp` and
`detail/4_-1-low.webp` images (1032 px, one metre per pixel including
the 16 m gutter). `tools/prepare-approach-sites.mjs` converts these to world coordinates.
Three terrain-following gravel lanes, six access connections, seven aprons, lawns and timber
boundaries form the grounds. Existing gravel scans provide fine texture; vertex colours
add broad variation and paired wheel wear. The dairy has two parallel pitched roofs and a
crosswing, recessed doors and side ventilation windows. Three 48-sided silos with domes,
hoops and ladders replace two incorrect rectangular blocks; their projected shadows use
rounded plan outlines. The dairy's interpreted 8.4 m ridge replaces the 3.4 m source estimate.
Thirty eligible garden/boundary trees now serve all four sites, within the same total
planting budget. Heights, lane widths, planting and architecture are artistic interpretations.

The siding and gravel yard use these **CC0** scans:

- [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks), photography by
  Dimitrios Savva and processing by Rico Cilliers.
- [Gravel Floor](https://polyhaven.com/a/gravel_floor), photography by Matterfield and
  processing by Jenelle van Heerden.

Source URLs, authors, checksums, placements and exact delivered byte counts are retained in
`scenery/farm-sources.json`. Wood textures use 1024 px high / 512 px low WebP. The gravel
colour map follows those sizes; gravel normal and roughness maps use 512 px high / 256 px low.
Meshes are Meshopt-compressed. Building meshes merge by material within each site, retaining
local culling bounds. The five sites use 65 draw batches before subtracting replaced procedural
facades: 44 building material batches, the original yard and four grounds/boundary batches per
site. Buildings use 92,375 triangles; grounds/fences use 175,866 triangles, plus the original
2,924-triangle yard. Only referenced parcel-grid vertices are uploaded; narrow drives use
feathered ribbons. Preparation happens behind the menu. Missing models or yard materials
retain procedural buildings and imagery. Missing or invalid extension data keeps the original
nine complete valley buildings and falls back for the other 26 placements.

The 2026-10-19 residential frontage adds 13 models, including one previously missing garage,
to the existing four sites. Twelve retain Microsoft footprints; the garage roof is traced from
bundled high-resolution `detail/4_0.webp`. Grounds follow its low-resolution counterpart:
six lawn parcels, seven yards, five road-connected drives and seven local access joins. The
pool is preserved in the underlying imagery and remains excluded from tree planting. Forty-two
eligible placed trees serve all five sites, within the unchanged 52,000 high / 14,000 low budget.
The new cream, sage and warm grey siding shares the existing clapboard normal. An original
256 px baked shingle texture adds restrained roof variation; its charcoal multiplier is restored
explicitly during delivery because Blender's exporter omits that MixRGB factor. Parcel gravel
has a separate colour scale. These are visual interpretations, not surveyed buildings.


Models, grounds and gravel maps total 2,908,267 bytes high / 1,955,309 bytes low, excluding the shared manifest. Relative to `396c522`, this adds 423,260 / 421,900 bytes.

Reproduce (download cache and Blender source remain under ignored `test/output/farm-sources/`):

```sh
python3 tools/fetch-farm-materials.py
python3 tools/prepare-approach-infill.py
blender --background --python tools/prepare-farm.py
node tools/prepare-approach-sites.mjs
node tools/prepare-farm.mjs
```

For geometry-only updates with existing delivered gravel maps, use
`node tools/prepare-farm.mjs --geometry-only` to preserve those map bytes.

The downloader verifies each map against Poly Haven's manifest. The game makes no requests
to Poly Haven and does not distribute the intermediate Blender file or original JPGs.

## Woodland — CC0

`scenery/tree-variety.webp`, its smaller `-low` variant and `tree-variety.json` are baked
from these **CC0** Poly Haven assets (https://polyhaven.com/license):

- **Tree Small 02**, Rico Cilliers: https://polyhaven.com/a/tree_small_02
- **Pine Sapling Small**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/pine_sapling_small
- **Fir Sapling Medium**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/fir_sapling_medium
- **Jacaranda Tree**, Rico Cilliers, guidance by Rob Tuytel: https://polyhaven.com/a/jacaranda_tree
- **Island Tree 02**, scanning/processing by Rob Tuytel, cleanup/processing by Rico Cilliers: https://polyhaven.com/a/island_tree_02

Nine authored forms have eight azimuths at three elevations (0°, 45°, 90°), 216 views in total. The simulator retains crown
proportions, varies orientation/scale/tint, and groups smaller conifers beneath broadleaf
woodland. Each distant tree uses one quad facing the eye in yaw and pitch, blending adjacent
azimuth and elevation views with premultiplied alpha. Source framing is recorded per form;
the quad still costs two triangles. An alpha cutoff of 0.15 retains more filtered leaf
coverage for crowns up to approximately 64 rendered pixels, blending back to the original
0.28 at 128 pixels
to preserve close geometry transitions. UV derivatives estimate size in the current render
target, so this follows resolution changes automatically. Standard alpha-to-coverage
smoothing remains on multisampled targets, with a hard cutoff on single-sample targets.
No new texture sample, mip chain or alpha-blending pass is added. These remain impostors: azimuth transitions, repeated
species and extreme close-up silhouettes are less convincing than full 3D branches.
The atlases are 1536×5184 (high, 1,845,660 bytes) and 768×2592 (low, 543,018 bytes).
High frames are 192 px and low frames 96 px. Eight directions reduce silhouette doubling
between adjacent views; using the delivered geometry also avoids the fuller source model
changing into a different simplified crown at close range. Texel count rises 12.5% over
the previous four-direction layout. WebP alpha quality is 90.
The three broadleaf sources are spatially grouped to break up repeated mature crowns.
They are an artistic palette for fictional Westhaven, not an ecological reconstruction of Pennsylvania.
The full models stay in ignored `test/output/tree-source`, `tree-variety-source` and
`authored-sources`; they are not shipped. These atlases replace the older single-species `tree-canopies.png`.
To reproduce the atlas from the bundled GLBs (Node and Playwright Chromium required):

```sh
node tools/bake-woodland.mjs
```

The five `scenery/*-near.glb` assets use the **same CC0 sources and nine forms** for
real nearby branches, trunks and leaf geometry on the high tier. They are normalized
to unit height, simplified separately for foliage and wood, texture-packed and Meshopt
compressed. The original broadleaf keeps about 159,000 triangles to retain its canopy; the added
broadleaf forms use 50,288 and 27,871 triangles, and conifers use about 19,000–79,000.
Files total **14,398,432 bytes** (14.40 MB decimal), including 2,729,492 bytes for the two additions. Exact sizes, triangle
counts and source URLs are in `tree-geometry.json`.

At runtime, nearby trees transition between geometry and cards over 90–180 m using
complementary dithering. A 14% selection preference retains existing trees when distances
are similar; entering and retiring fades both advance at most once per frame over 0.35 s.
Selection targets at most 32 trees / 1.8 million triangles;
retiring instances share a hard 48-tree / 2.4-million-triangle budget. Distant trees and
the low tier retain the cheaper atlas. Low quality never requests the GLBs. If they fail
to load, all foliage cards remain visible. Normal menu preparation now loads the high-tier
models before flight; a flight begun directly by an automation hook can still request them
when a tree crown is within 450 m of the camera. These assets add no collision bodies.

Regenerate model reductions after fetching the originals with `fetch-woodland.py`,
`fetch-tree-variety.py` and `fetch-authored-scenery.py` (Node dependencies include Sharp):

```sh
node tools/prepare-trees.mjs
node tools/prepare-broadleaf.mjs
```

Leaf base-colour textures include the original silhouette alpha masks. An earlier Sharp
conversion removed the newly joined alpha channel, making nearby leaves opaque rectangles;
`prepare-trees.mjs` now separates those operations. `tools/repair-tree-alpha.mjs` repairs
legacy optimized GLBs without changing their geometry. Restoring alpha added 938,056 bytes
to the original three delivered models. The asset test checks transparent and opaque
pixels in every MASK material, including the new broadleaf models.

## Scanned surfaces — CC0

Grass: **Aerial Grass Rock**, Poly Haven, https://polyhaven.com/a/aerial_grass_rock
Asphalt: **Aerial Asphalt 01**, Poly Haven, https://polyhaven.com/a/aerial_asphalt_01
License: https://polyhaven.com/license (CC0)

The albedo, OpenGL normal and roughness maps are bundled at 1K. Source URLs are in
`scenery/sources.json`. Powered by Poly Haven assets; the game does not use its API at runtime.

To refresh the imagery, surfaces and parked aircraft (Python 3, Pillow, and curl):

```sh
python3 tools/fetch-scenery.py
```

## Libraries

The vendored Three.js glTF loader and geometry utilities are MIT licensed (`vendor/addons/LICENSE`).
The bundled Meshopt decoder is MIT licensed (`vendor/addons/libs/meshoptimizer-LICENSE.md`).


## Delivery optimization — 2026-09-30

The initial scene loads four 512px previews, the selected flight deck and (on high) 209 KB of cloud density. The menu appears
before full imagery, roads, buildings, planting and parked aircraft load. Current menu
preparation then fetches all sixteen detail files, all high-tier near-tree models and facade
kits, and warms their GPU resources before normal Start completes. Four detail textures stay
on the GPU; the other compressed tile blobs stay in memory. Direct automation starts can
still stream resources, and the UI stops waiting after a minute on slow connections.
`world.loadScenery()` and `world.loadNearTrees()` allow visual checks to explicitly await these
stages. Each stage preserves existing fallback surfaces when a request fails.

Aerial photos and detail tiles use WebP quality 84 with unchanged dimensions. Canopy atlases
use quality 90 with full-quality alpha. Packed cockpit data uses **lossless** WebP so its
height/roughness channels are unchanged. Near-tree textures use WebP; fir geometry is reduced
conservatively (65% target, 0.003 normalized error) and unused tangents removed. Broadleaf and
pine triangle counts remain unchanged. `delivery.json` records the September 30 conversion;
the canopy sizes above supersede its historical atlas entries.

Reproduce the delivery conversion from a snapshot of commit `a406f27` (or regenerated source
assets with the original JPG/PNG names):

```sh
node tools/optimize-delivery.mjs /path/to/source-snapshot
```

The older preparation commands produce inputs to this conversion step. To reproduce the
current near-tree delivery starting from that historical snapshot, run the conversion first,
then `node tools/repair-tree-alpha.mjs` (original leaf masks must be downloaded), followed
by `node tools/prepare-broadleaf.mjs`. The conversion rewrites the tree manifest from its
source snapshot, so the two new forms must be appended afterwards. Current tree sizes in
`scenery/tree-geometry.json` supersede the historical `delivery.json` entries. The canopy baker
now writes final WebP directly; the conversion preserves those newer atlases.
Original JPG/PNG delivery copies and unused area-light lookup tables are not shipped.

## Procedural weather — original project data

`weather/cumulus-density.bin.gz` stores six 80³ unsigned-byte density fields in a
160×80×240 texture (two columns by three depth slabs). Every axis fits within 256 texels;
empty borders and half-texel UV insets prevent interpolation between neighbouring forms.
Red values decode to density 0–5. It is **208,555 bytes compressed / 3,072,000 decoded**,
up 129,491 transfer bytes and 2,023,424 decoded bytes from the four-field version.
The retained CPU data and GPU texture each incur the decoded increase; there are no mipmaps.

`node tools/bake-cloud-volume.mjs` generates this original project data under MIT. The six
forms use different parent shapes: a spreading low cloud, leaning tower, paired turrets,
compact tower, uneven bank and broad low bank. Smaller connected billows, warped erosion
and a shared condensation base are baked offline. The grid layout is shared with runtime
through `js/world/cumulus-layout.js`. These are artistic cloud shapes, not weather observations.

The high tier loads the volume at startup; low does not request it. The 26 cloud placements,
wind drift and sprite fallback are retained. Cached rendering retains 36 view samples
and three shadow lookups at occupied samples, with fixed midpoints replacing the previous
jittered ray start.
This reduces screen-locked grain while retaining fine silhouette changes. Directional
scattering and three-tap self-shadowing remain approximations. Missing/malformed data or a
missing decompressor retains analytic clouds; host-decoded gzip bodies are accepted directly.
Automatic quality reduction disposes the volume texture. No external asset or service is used.


## Near-ground grass — CC0

`scenery/grass-patches.webp` is eight unlit views of two arrangements of [Grass Bermuda
01](https://polyhaven.com/a/grass_bermuda_01), by Rico Cilliers / Poly Haven, under
[CC0](https://polyhaven.com/license). Source alpha is restored from the separate mask;
photographed blade colours are retained, then adapted to the ground at runtime. The 1024×256
atlas is 154,114 bytes; the low tier has no near-ground grass and no atlas. The original model
and its source textures are offline inputs only; neither is delivered to players. The atlas is
prepared behind the menu and the underlying terrain remains if it fails to load.

Reproduce with Python 3, curl, Node dependencies and Playwright Chromium:

```sh
python3 tools/fetch-ground-cover.py
VISUAL_GPU=metal node tools/bake-ground-cover.mjs
```

Source files remain in ignored `test/output/grass-source/`. The manifest records the source,
license and atlas layout. Runtime crossed patches are original geometry, planted in a fixed
near-camera pool on airport turf and strongly mapped meadow, with pavement, roads, buildings
and complete-site grounds excluded. They are interpreted scenery, not a local vegetation survey.

## Airport architecture — original project geometry

`js/world/airport-architecture.js` builds the fictional Westhaven terminal, three
hangars and control tower. The original project geometry, facade paintings and signage
are MIT-licensed; no downloaded building, image, font or network service is used.
The gate locations and aircraft/jet-bridge placements are retained. Architecture
remains visual scenery and does not change the runway, taxiways or flight physics.

Five stepped curved roofs, recessed curtain walls, mezzanine bands and V-shaped
supports connect through four glazed galleries and solid stair cores. The end wings
have continuous shaded glazing. Hangars have pitched roofs, glazed sliding doors,
side ribs and service doors. The tower uses an eight-sided outward-sloping cab with a
balcony, support transition, roof and aerials over a core and entrance annex.

The opaque glass approximates reflected sky and interior/blind silhouettes. It has
no true transparency, interior parallax or reflected airport geometry. Eight small
original facade paintings share a colour/emission atlas, and lettering uses one local
canvas. Night lighting changes emissive intensity without rebuilding textures. High
uses two 512×256 facade maps and a 1024×128 sign; initial low quality uses half those dimensions.
Estimated RGBA GPU storage including mipmaps is **2 MiB high / 0.5 MiB low**, replacing
one previous 512×256 map (about 0.67 MiB). These are residency estimates, not downloads;
the canvases also retain their uncompressed base images on the CPU.

Materials are shared across spatial batches for frustum culling. Low omits fine hall
roof seams and reduces hangar side ribs, while retaining the complete silhouette.
Automatic downgrade keeps this small static geometry and its existing maps.
The resulting buildings remain simplified original architecture, not a detailed
commercial airport asset. Surface weathering, richer apron equipment, transparent
interiors and finer local shadows remain possible improvements.

`VISUAL_GPU=metal npm run test:airport` records matched pilot/airport/terminal/tower/
hangar/night/storm views on both tiers and checks finite geometry, clear operational
areas, outward-facing glazing and bounded geometry/texture cost. Use `REVIEW_ROOT`
to capture the same views against an archived baseline.
