"""Fetch checksummed CC0 farm materials for offline preparation; no runtime API calls."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fetcher', ROOT / 'tools/fetch-authored-scenery.py')
fetcher = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(fetcher)

for name in ['weathered_brown_planks', 'gravel_floor']:
    folder = ROOT / 'test/output/farm-sources' / name
    for kind in ['files', 'info']:
        fetcher.fetch(folder / f'{kind}.json', f'https://api.polyhaven.com/{kind}/{name}')
    files = json.loads((folder / 'files.json').read_text())
    for channel, key in [('color', 'Diffuse'), ('normal', 'nor_gl'), ('rough', 'Rough')]:
        entry = files[key]['1k']['jpg']
        fetcher.fetch(folder / f'{channel}.jpg', entry['url'], entry['md5'])
    print(name, 'downloaded and verified', flush=True)
