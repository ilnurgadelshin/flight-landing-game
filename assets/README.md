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

The runtime adds restrained surface finishes to verified parts of this model. The small,
original procedural maps distinguish coated panels, molded liner, window framing, seat weave
and yoke rubber. They store height, roughness and slight colour modulation, with metric scale,
seamless projection and mipmaps; they are not photographic scans. The high tier uses relief
and variation, while the low tier uses each finish's average roughness without detail maps.
The yoke's pure-black grip alone is given 1.2% neutral diffuse reflectance, so its shape remains
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
Daytime cabin lamps are reduced in favour of neutral sky illumination; night flood lighting
and the instrument displays retain their existing brightness.

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

`scenery/region.jpg`, `approach.jpg`, `airport.jpg`, `final-approach.jpg` and their `-low` variants are USDA NAIP
natural-color orthophotography, distributed by USGS / The National Map:
https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer

Public-domain documentation:
https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip

Downloaded 2026-09-25–26. The Pennsylvania imagery is repositioned around the fictional
Westhaven airport, with a maintained airfield overlay and synthetic terrain heights.
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
the broad imagery visible. The complete high/low set is approximately 24 MB on disk.

Reproduce with `python3 tools/fetch-ground-detail.py` (Pillow and curl required).

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

`scenery/tree-variety.png`, its smaller `-low` variant and `tree-variety.json` are baked
from these **CC0** Poly Haven assets (https://polyhaven.com/license):

- **Tree Small 02**, Rico Cilliers: https://polyhaven.com/a/tree_small_02
- **Pine Sapling Small**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/pine_sapling_small
- **Fir Sapling Medium**, model by Rico Cilliers, photos by Rob Tuytel: https://polyhaven.com/a/fir_sapling_medium

Seven authored forms have four alpha-preserving views each. The simulator retains crown
proportions, varies orientation/scale/tint, and groups smaller conifers beneath broadleaf
woodland. Each distant tree uses one upright camera-facing quad, blending the two nearest
source azimuth views. This removes crossed/edge-on planes and reduces each tree from six
to two triangles; trunks meet each tier's rendered terrain. These remain impostors and
are less convincing from steep overhead angles than full 3D branches. The atlases are 2048×3584 (high,
approximately 6.5 MB) and 1024×1792 (low, approximately 1.8 MB).
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
use about 19,000–122,000. Files total approximately 13.2 MB (decimal). Exact sizes, triangle
counts and source URLs are in `tree-geometry.json`.

At runtime, nearby trees transition between geometry and cards over 90–180 m using
complementary dithering. Selection targets at most 32 trees / 1.8 million triangles;
retiring instances share a hard 48-tree / 2.4-million-triangle budget. Distant trees and
the low tier retain the cheaper atlas. Low quality never requests the GLBs. If they fail
to load, all foliage cards remain visible. These assets add no collision bodies.

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
