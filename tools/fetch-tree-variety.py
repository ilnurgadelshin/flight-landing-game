"""Fetch two CC0 source models for offline atlas baking; never shipped as GLTF."""
import json
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

OUT=Path(__file__).resolve().parents[1]/'test/output/tree-variety-source'

def fetch(dest,url):
    dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():
        subprocess.run(['curl','-fLsS','--retry','2','--max-time','180',url,'-o',str(dest)],check=True)

if __name__=='__main__':
    for name in ['pine_sapling_small','fir_sapling_medium']:
        folder=OUT/name;fetch(folder/'files.json',f'https://api.polyhaven.com/files/{name}')
        meta=json.loads((folder/'files.json').read_text());gltf=meta['gltf']['1k']['gltf']
        alpha=next(k for k in meta if k.endswith('_alpha'))
        jobs=[(folder/'tree.gltf',gltf['url']),(folder/'leaves-alpha.png',meta[alpha]['1k']['png']['url'])]
        jobs += [(folder/file,info['url']) for file,info in gltf['include'].items()]
        with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda job:fetch(*job),jobs))
        print(name,flush=True)
