"""Refresh bundled, openly licensed scenery. Requires Python 3 + Pillow, not used at runtime.

USDA NAIP orthophotography is public domain. Poly Haven materials are CC0;
amvlab's aircraft are CC BY 4.0. See assets/README.md for attribution.
"""
import json
import math
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlencode
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/scenery'
OUT.mkdir(parents=True, exist_ok=True)


def fetch(url, dest):
    subprocess.run(['curl', '-fL', '--retry', '2', '--silent', '--show-error', url, '-o', str(dest)], check=True)


with tempfile.TemporaryDirectory(prefix='flight-scenery-') as tmp:
    tmp = Path(tmp)
    sources = []
    # Pennsylvania farmland is used as a fictional landscape, not navigational imagery.
    lat, lon = 40.828, -77.615
    cx = 6378137 * math.radians(lon)
    cy = 6378137 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    scale = 1 / math.cos(math.radians(lat))
    for name, side, east, resolution in [('region', 80000, 16000, 2048), ('approach', 24000, 5000, 4000), ('airport', 8000, 0, 4000), ('final-approach', 8000, 6000, 4000)]:
        bbox = [cx + (east-side/2)*scale, cy-side/2*scale, cx+(east+side/2)*scale, cy+side/2*scale]
        query = dict(bbox=','.join(map(str, bbox)), bboxSR=3857, imageSR=3857,
                     size=f'{resolution},{resolution}', format='jpg', compressionQuality=93,
                     renderingRule=json.dumps({'rasterFunction': 'NaturalColor'}), f='image')
        url = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?' + urlencode(query)
        raw = tmp / f'{name}.jpg'
        fetch(url, raw)
        im = Image.open(raw).convert('RGB')
        im.save(OUT / f'{name}.jpg', quality=90, optimize=True)
        im.resize((1024, 1024), Image.Resampling.LANCZOS).save(OUT / f'{name}-low.jpg', quality=85, optimize=True)
        sources.append(dict(file=f'{name}.jpg', source=url, center=[east, 0], side=side, license='Public domain — USDA NAIP / USGS'))
        print(name, im.size, flush=True)
    for asset, prefix in [('aerial_grass_rock', 'grass'), ('aerial_asphalt_01', 'asphalt')]:
        meta = tmp / 'material.json'
        fetch(f'https://api.polyhaven.com/files/{asset}', meta)
        data = json.loads(meta.read_text())
        for source_key, dest in [('Diffuse', 'color'), ('nor_gl', 'normal'), ('Rough', 'rough')]:
            url = data[source_key]['1k']['jpg']['url']
            raw = tmp / 'material.jpg'
            fetch(url, raw)
            Image.open(raw).save(OUT / f'{prefix}-{dest}.jpg', quality=88, optimize=True)
            sources.append(dict(file=f'{prefix}-{dest}.jpg', source=url, license='CC0 — Poly Haven'))
    for name in ['B737', 'A320']:
        dest = ROOT / 'assets/models' / f'{name}.glb'
        dest.parent.mkdir(exist_ok=True)
        url = f'https://raw.githubusercontent.com/amvlab/aircraft-models/main/models/{name}_nologo.glb'
        fetch(url, dest)
        sources.append(dict(file=f'../models/{name}.glb', source=url, license='CC BY 4.0 — amvlab'))
    sources.append(dict(file='tree-canopies.png', source='https://polyhaven.com/a/tree_small_02',
                        license='CC0 — Rico Cilliers, Poly Haven',
                        modifications='Four alpha-preserving views baked from the model; see tools/bake-woodland.mjs.'))
    (OUT / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n')
