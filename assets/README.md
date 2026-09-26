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

Changes: removed stray geometry, converted coordinates and scale, adjusted the upper shell
for pilot eye clearance, repositioned the captain's seat, reduced geometry, merged static meshes,
changed material values, baked vertex contact shading, compressed with Meshopt, and separated
the yokes, columns, thrust/reverse levers, flap/speedbrake levers and trim wheels for animation.
The simulator adds working PFD/ND/engine displays, selected MCP values, standby instruments
and animated controls, and closes the source's open roof with a fitted headliner. The low
variant also omits the tiny molded lettering. It is a visual adaptation, not a certified cockpit trainer.

To reproduce, download the freely licensed **glTF** archive from that page (Sketchfab requires
sign-in), unzip it, run `npm install`, then:

```sh
node tools/prepare-cockpit.mjs /path/to/unzipped/scene.gltf
```

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
