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
direction, with reduced contrast under overcast; they supplement existing photographic shadows.

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

Reproduce after downloading the pinned Microsoft tile and the recorded Census layer-5 query:

```sh
python3 tools/prepare-approach-scenery.py buildings.geojsonl.gz local-roads.geojson
```

The converter requires Pillow, uses bundled imagery for roof colours, and runs offline.

## Woodland — CC0

`scenery/tree-canopies.png` is baked from **Tree Small 02** by **Rico Cilliers**, Poly Haven:
https://polyhaven.com/a/tree_small_02 — https://polyhaven.com/license (CC0).

Four alpha-preserving views retain the source's branches, leaves, bark and shading.
The simulator varies scale and tint and places the crowns in photographed woodland.
The full source model stays in ignored `test/output/tree-source`; it is not shipped.
To reproduce the atlas (curl, Python 3, Node and Playwright Chromium required):

```sh
python3 tools/fetch-woodland.py
node tools/bake-woodland.mjs
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
