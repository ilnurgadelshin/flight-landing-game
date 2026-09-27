"""Small, reviewed roof traces for conspicuous gaps in the ML footprints.

Coordinates below are pixels in the bundled 2064 px NAIP detail tiles. Traces
follow visible roof edges, not shadows; heights/forms are scenery interpretations.
This is deliberately a reviewed subset, not automatic detection or surveyed data.
"""
import importlib.util
import json
import math
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('footprints',ROOT/'tools/prepare-approach-scenery.py')
footprints=importlib.util.module_from_spec(spec);spec.loader.exec_module(footprints)
TRACES=[
    ('valley-barn-north','2_0',7.5,[(999,610),(1016,611),(1018,657),(1000,657)]),
    ('valley-barn-south','2_0',6.3,[(1000,657),(1024,656),(1027,718),(1008,718),(1007,693),(1002,693)]),
    ('north-farm-barn','2_-1',8.2,[(764,1272),(834,1229),(850,1257),(782,1298)]),
    ('north-farm-annex','2_-1',5.5,[(807,1277),(834,1261),(848,1285),(821,1300)]),
    ('east-farm-shed','4_0',4.8,[(1543,583),(1592,582),(1593,604),(1543,604)]),
]

def prepare():
    buildings=[]
    for name,tile,height,pixels in TRACES:
        tx,tz=map(int,tile.split('_'));points=[(tx*1000-16+x*.5,tz*1000-16+y*.5) for x,y in pixels]
        x,z,w,d,angle=footprints.rectangle(points)
        assert not footprints.protected(x,z,math.hypot(w,d)/2+2),name
        image=Image.open(ROOT/f'assets/scenery/detail/{tile}.jpg').convert('RGB')
        sample=(sum(p[0] for p in pixels)/len(pixels),sum(p[1] for p in pixels)/len(pixels))
        roof=list(image.getpixel(tuple(round(v) for v in sample)))
        buildings.append(dict(id=name,x=round(x,1),z=round(z,1),w=round(w,1),d=round(d,1),angle=round(angle,5),
            height=height,estimatedHeight=False,pitched=True,roofKind='metal',use='farm',roof=roof,
            outline=[[round(px-x,1),round(pz-z,1)] for px,pz in points],sourceTile=tile,sourcePixels=pixels))
    data=dict(license='Public domain — original roof traces from USDA NAIP / USGS imagery',
        source='detail/manifest.json',origin=[-77.615,40.828],
        modifications='Five visually checked missing roofs. Heights, pitch and materials interpreted; roof traces are approximate, not surveyed footprints.',buildings=buildings)
    (ROOT/'assets/scenery/approach-infill.json').write_text(json.dumps(data,indent=2)+'\n')
    print(f'{len(buildings)} reviewed infill roofs prepared')

if __name__=='__main__':prepare()
