"""Download checksummed CC0 architectural/tree sources for offline preparation only.

Uses Poly Haven's public API with an identifying User-Agent; the game never calls it.
Manifests retain the source URLs and MD5 checksums. Originals stay in test/output.
"""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'test/output/authored-sources'
NAMES = ['modular_factory_facade', 'modular_urban_apartments_facade',
         'jacaranda_tree', 'island_tree_02']


def fetch(path, url, checksum=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and (not checksum or hashlib.md5(path.read_bytes()).hexdigest() == checksum):
        return
    subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '240',
                    '-H', 'User-Agent: FlightLandingGame-AssetPreparation/1.0', url, '-o', str(path)], check=True)
    if checksum and hashlib.md5(path.read_bytes()).hexdigest() != checksum:
        raise ValueError(f'Checksum mismatch: {path}')


if __name__ == '__main__':
    for name in sys.argv[1:] or NAMES:
        if name not in NAMES:
            raise ValueError(name)
        folder = ROOT / name
        fetch(folder / 'files.json', f'https://api.polyhaven.com/files/{name}')
        fetch(folder / 'info.json', f'https://api.polyhaven.com/info/{name}')
        meta = json.loads((folder / 'files.json').read_text())
        gltf = meta['gltf']['1k']['gltf']
        jobs = [(folder / 'source.gltf', gltf)]
        jobs += [(folder / file, info) for file, info in gltf['include'].items()]
        if 'leaves_alpha' in meta:
            jobs.append((folder / 'leaves-alpha.png', meta['leaves_alpha']['1k']['png']))
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(lambda job: fetch(job[0], job[1]['url'], job[1]['md5']), jobs))
        print(name, 'downloaded and checksummed', flush=True)
