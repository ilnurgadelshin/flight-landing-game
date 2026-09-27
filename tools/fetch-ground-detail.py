"""Bundle local NAIP detail tiles; run offline from the game, Python + Pillow.

1 km tiles, sampled at 0.5 m/px (high) / 1 m/px (low). The underlying NAIP
survey is generally 0.6 m; output pixel spacing is not new survey detail.
"""
import json
import math
import subprocess
from pathlib import Path
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/scenery/detail'
OUT.mkdir(exist_ok=True)
R=6378137
scale=1/math.cos(math.radians(40.828))
cx=R*math.radians(-77.615)
cy=R*math.log(math.tan(math.pi/4+math.radians(40.828)/2))

def tile(cell):
    x,z=cell
    # 16 m gutters let the shader feather neighboring exports without seams.
    center=[x*1000+500,z*1000+500];side=1032
    bbox=[cx+(center[0]-side/2)*scale,cy-(center[1]+side/2)*scale,
          cx+(center[0]+side/2)*scale,cy-(center[1]-side/2)*scale]
    query=dict(bbox=','.join(map(str,bbox)),bboxSR=3857,imageSR=3857,size='2064,2064',
        format='jpg',compressionQuality=94,renderingRule=json.dumps({'rasterFunction':'NaturalColor'}),f='image')
    url='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?'+urlencode(query)
    name=f'{x}_{z}'
    dest=OUT/(name+'.jpg')
    if not dest.exists():
        subprocess.run(['curl','-fLsS','--retry','2','--max-time','90',url,'-o',str(dest)],check=True)
        im=Image.open(dest).convert('RGB');im.save(dest,quality=91,optimize=True)
    im=Image.open(dest)
    im.resize((1032,1032),Image.Resampling.LANCZOS).save(OUT/(name+'-low.jpg'),quality=88,optimize=True)
    print(name,flush=True)
    return dict(id=name,center=center,side=side,source=url)

if __name__=='__main__':
    # Last 8 km of final approach, including the nearest photographed villages.
    with ThreadPoolExecutor(max_workers=2) as pool:
        tiles=list(pool.map(tile,[(x,z) for x in range(2,10) for z in [-1,0]]))
    (OUT/'manifest.json').write_text(json.dumps(dict(license='Public domain — USDA NAIP / USGS',
        origin=[-77.615,40.828],highPixelMetres=.5,lowPixelMetres=1,tiles=tiles),indent=2)+'\n')
