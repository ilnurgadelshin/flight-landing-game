"""Download CC0 Bermuda grass for offline atlas baking; source files stay out of the game."""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'test/output/grass-source'


def fetch(destination, url):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '120', url, '-o', str(destination)], check=True)


if __name__ == '__main__':
    fetch(OUT / 'files.json', 'https://api.polyhaven.com/files/grass_bermuda_01')
    metadata = json.loads((OUT / 'files.json').read_text())
    source = metadata['gltf']['1k']['gltf']
    jobs = [(OUT / 'grass.gltf', source['url']), (OUT / 'alpha.png', metadata['Alpha']['1k']['png']['url'])]
    jobs += [(OUT / name, item['url']) for name, item in source['include'].items()]
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda item: fetch(*item), jobs))
    print('CC0 Bermuda grass source downloaded. Run node tools/bake-ground-cover.mjs.')
