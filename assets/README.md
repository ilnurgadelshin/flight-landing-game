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
fitted to the stretched shell were also removed; proper glass would need to follow the source panes.

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
is sampled from the public-domain photo; roof pitch, facades, windows and eaves are original
procedural interpretations. Ground shadows approximate the building silhouette in the sun's
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

`scenery/approach-infill.json` supplements the ML dataset with **five reviewed roof
traces** from the bundled public-domain NAIP detail imagery: two connected valley barns,
a barn and annex north of final, and an eastern farm shed. Pixel coordinates and source
tile IDs are retained so the traces can be checked. They follow visible roofs, excluding
photographic shadows; heights, pitch and agricultural facades are interpretations.
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

## Woodland — CC0

`scenery/tree-variety.webp`, its smaller `-low` variant and `tree-variety.json` are baked
from these **CC0** Poly Haven assets (https://polyhaven.com/license):

- **Tree Small 02**, Rico Cilliers: https://polyhaven.com/a/tree_small_02
- **Pine Sapling Small**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/pine_sapling_small
- **Fir Sapling Medium**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/fir_sapling_medium

Seven authored forms have four azimuths at three elevations (0°, 45°, 90°), 84 views in total. The simulator retains crown
proportions, varies orientation/scale/tint, and groups smaller conifers beneath broadleaf
woodland. Each distant tree uses one quad facing the eye in yaw and pitch, blending adjacent
azimuth and elevation views with premultiplied alpha. Source framing is recorded per form;
the quad still costs two triangles. These remain impostors: azimuth transitions, repeated
species and extreme close-up silhouettes are less convincing than full 3D branches.
The atlases are 1024×5376 (high, 484,430 bytes) and 512×2688 (low, 350,086 bytes). Smaller
individual frames are sufficient for distant crowns and offset the added elevation views.
The full models stay in ignored `test/output/tree-source` and `tree-variety-source`;
they are not shipped. These atlases replace the older single-species `tree-canopies.png`.
To reproduce the atlas (curl, Python 3, Node and Playwright Chromium required):

```sh
python3 tools/fetch-woodland.py
python3 tools/fetch-tree-variety.py
node tools/bake-woodland.mjs
```

The three `scenery/*-near.glb` assets use the **same CC0 sources and seven forms** for
real nearby branches, trunks and leaf geometry on the high tier. They are normalized
to unit height, simplified separately for foliage and wood, texture-packed and Meshopt
compressed. The broadleaf keeps about 159,000 triangles to retain its canopy; conifers
use about 19,000–79,000. Files total approximately 10.7 MB (decimal). Exact sizes, triangle
counts and source URLs are in `tree-geometry.json`.

At runtime, nearby trees transition between geometry and cards over 90–180 m using
complementary dithering. Selection targets at most 32 trees / 1.8 million triangles;
retiring instances share a hard 48-tree / 2.4-million-triangle budget. Distant trees and
the low tier retain the cheaper atlas. Low quality never requests the GLBs. If they fail
to load, all foliage cards remain visible. Downloads start only after the flight starts and
a tree crown is within 450 m of the camera. These assets add no collision bodies.

Regenerate after the source downloads above (Node dependencies include Sharp):

```sh
node tools/prepare-trees.mjs
```

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

The initial scene loads four 512px previews, the selected flight deck and (on high) 79 KB of cloud density. The flight becomes
interactive before full imagery, roads, buildings, planting and parked aircraft load. Detail
tiles stay bounded to four; near-tree models are separately requested only near woodland.
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

The older preparation commands produce inputs to this conversion step. The canopy baker
now writes final WebP directly; the conversion preserves those newer atlases.
Original JPG/PNG delivery copies and unused area-light lookup tables are not shipped.

## Procedural weather — original project data

`weather/cumulus-density.bin.gz` stores four 64³ unsigned-byte density fields, packed along Z
in a 64×64×256 volume. Red values decode to density 0–5; the outside border is empty so
linear interpolation cannot leak between variants. It is 79,064 bytes compressed and
1,048,576 bytes decoded, generated by
`node tools/bake-cloud-volume.mjs` from original deterministic noise and connected billows
under the project's MIT license. No external asset or service is used. The high tier loads
it at startup; the low tier does not request it. Missing or malformed data uses the previous
analytic cloud shader, and automatic quality reduction disposes the volume texture.
