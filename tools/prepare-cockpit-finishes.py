"""Pack CC0 Poly Haven scans into linear height / roughness / colour detail maps.
Requires Pillow. Download source maps from the API into a local reproducible cache.
"""
import json
from pathlib import Path
import subprocess
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'test/output/cockpit-finish-source'
OUT=ROOT/'assets/cockpit'
CACHE.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
def fetch(url,dest):
    if not dest.exists():subprocess.run(['curl','-fLsS','--retry','2',url,'-o',str(dest)],check=True)

sources=[]
for asset,finish,tile in [('leather_white','liner',.30),('poly_wool_herringbone','upholstery',.27)]:
    meta=CACHE/f'{asset}.json';fetch(f'https://api.polyhaven.com/files/{asset}',meta)
    files=json.loads(meta.read_text());images={};urls=[]
    for key in ['Diffuse','Rough','Displacement']:
        url=files[key]['1k']['jpg']['url'];source=CACHE/f'{asset}-{key}.jpg';fetch(url,source)
        images[key]=Image.open(source).convert('L').resize((512,512),Image.Resampling.LANCZOS);urls.append(url)
    # Neutralized colour modulation retains the source cockpit's paint. The
    # leather scan supplies embossed liner grain, not a leather colour overlay.
    color=images['Diffuse'].point(lambda v:round((.79+.21*v/255)*255))
    rough=images['Rough'].point(lambda v:round((.76+.22*v/255)*255))
    packed=Image.merge('RGB',(images['Displacement'],rough,color))
    packed.save(OUT/f'{finish}.png',optimize=True)
    sources.append(dict(file=f'{finish}.png',asset=f'https://polyhaven.com/a/{asset}',
        license='CC0 — Poly Haven',sources=urls,tileMetres=tile,
        modifications='512px linear height/roughness/neutral colour modulation; remapped roughness and colour range.'))
(OUT/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
