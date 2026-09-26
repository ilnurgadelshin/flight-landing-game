"""Download the CC0 source tree for offline canopy baking; never shipped to players."""
import json
from pathlib import Path
import subprocess
from concurrent.futures import ThreadPoolExecutor

OUT = Path(__file__).resolve().parents[1] / 'test/output/tree-source'
OUT.mkdir(parents=True, exist_ok=True)


def fetch(item):
    name, url = item
    dest = OUT / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '-fL', '--silent', '--show-error', '--retry', '2', url, '-o', str(dest)], check=True)


fetch(('files.json', 'https://api.polyhaven.com/files/tree_small_02'))
meta = json.loads((OUT / 'files.json').read_text())
gltf = meta['gltf']['1k']['gltf']
jobs = [('tree.gltf', gltf['url']), ('leaves-alpha.png', meta['leaves_alpha']['1k']['png']['url'])]
jobs += [(name, info['url']) for name, info in gltf['include'].items()]
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(fetch, jobs))
print('CC0 source tree downloaded. Run node tools/bake-woodland.mjs.')
