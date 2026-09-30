"""Prepare offline approach footprints from Microsoft's CDLA-Permissive-2.0 data.

Usage: python tools/prepare-approach-scenery.py downloaded-tile.geojsonl.gz
Optional second argument: TIGERweb local-roads GeoJSON (layer 5).
Uses Pillow to sample the bundled public-domain orthophotos. No runtime map API.
The pinned source tile and license are recorded alongside the resulting data.
"""
import gzip
import json
import math
import statistics
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/scenery'
SOURCE = 'https://bfppub.z5.web.core.windows.net/2026-08-13/global-buildings.geojsonl/RegionName=UnitedStates/quadkey=032010001/part-00134-110f5303-ff85-4c71-a2bf-c6070024fec8.c000.csv.gz'
LAT, LON = 40.828, -77.615
R = 6378137
SCALE = math.cos(math.radians(LAT))
CX = R * math.radians(LON)
CY = R * math.log(math.tan(math.pi / 4 + math.radians(LAT) / 2))


def project(lon, lat):
    return [(R * math.radians(lon) - CX) * SCALE,
            (CY - R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))) * SCALE]


def protected(x, z, margin=0):
    return (abs(x) < 2100 + margin and abs(z - 120) < 700 + margin or
            1500 - margin < x < 3400 + margin and abs(z) < 180 + margin)


def rectangle(points):
    """Minimum edge-aligned bounding rectangle; retains the original polygon too."""
    best = None
    for a, b in zip(points, points[1:] + points[:1]):
        angle = math.atan2(b[1] - a[1], b[0] - a[0])
        c, s = math.cos(angle), math.sin(angle)
        u = [x*c + z*s for x, z in points]
        v = [-x*s + z*c for x, z in points]
        box = [min(u), max(u), min(v), max(v)]
        area = (box[1]-box[0]) * (box[3]-box[2])
        if best is None or area < best[0]:
            best = area, angle, box
    _, a, (u0, u1, v0, v1) = best
    u, v = (u0+u1)/2, (v0+v1)/2
    x, z = u*math.cos(a)-v*math.sin(a), u*math.sin(a)+v*math.cos(a)
    w, d = u1-u0, v1-v0
    if w < d:
        w, d, a = d, w, a+math.pi/2
    return x, z, w, d, a


def prepare(filename):
    photos = [Image.open((OUT / n) if (OUT / n).exists() else (OUT / n).with_suffix('.webp')).convert('RGB') for n in ['airport.jpg', 'final-approach.jpg']]
    buildings = []
    with gzip.open(filename, 'rt') as source:
        for line in source:
            f = json.loads(line)
            if f['geometry']['type'] != 'Polygon':
                continue
            ps = [project(*p[:2]) for p in f['geometry']['coordinates'][0][:-1]]
            if len(ps) < 3 or not all(-3500 < x < 9900 and abs(z) < 3800 for x, z in ps):
                continue
            x, z, w, d, a = rectangle(ps)
            # Keep the airport and the approach-light installation clear, including eaves.
            radius = math.hypot(w, d)/2
            if protected(x, z, radius+2):
                continue
            area = abs(sum(p[0]*q[1]-q[0]*p[1] for p, q in zip(ps, ps[1:]+ps[:1])))/2
            confidence = f['properties'].get('confidence', 1)
            if area < 24 or d < 3 or w > 180 or confidence < .7:
                continue
            photo = photos[int(x > 3900)]
            center = 6000 if x > 3900 else 0
            samples = []
            for dx, dz in [(0,0),(-1,0),(1,0),(0,-1),(0,1)]:
                px, py = int((x+dx-center+4000)/2), int((z+dz+4000)/2)
                samples.append(photo.getpixel((px, py)))
            roof = [int(statistics.median(p[k] for p in samples)) for k in range(3)]
            # Height estimates are uncertain: cap outliers, retain missingness in the data.
            h = f['properties'].get('height', -1)
            measured = h is not None and h > 0
            h = max(3, min(14 if area < 500 else 22, h)) if measured else (5.8 if area < 500 else 8)
            buildings.append(dict(x=round(x,1), z=round(z,1), w=round(w,1), d=round(d,1),
                angle=round(a,5), height=round(h,1), estimatedHeight=measured,
                pitched=area/(w*d)>.78 and d<30 and h<14,
                roof=roof, outline=[[round(px-x,1),round(pz-z,1)] for px,pz in ps]))
    buildings.sort(key=lambda b:(b['x'],b['z']))
    data = dict(source=SOURCE, attribution='Microsoft Global ML Building Footprints',
                license='CDLA-Permissive-2.0', licenseFile='CDLA-Permissive-2.0.txt',
                origin=[LON,LAT], coordinates='local metres: x east, z south; scaled Web Mercator',
                buildings=buildings)
    (OUT/'approach-buildings.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    print(f'{len(buildings)} building footprints prepared')


def prepare_roads(filename):
    # These two principal valley routes were checked against the orthophoto.
    # TIGER also contains historic driveways and inaccurate estate loops: exclude
    # those rather than covering the correct photographed road with a wrong one.
    names = {'Upper Georges Valley Rd', 'Lower Georges Valley Rd'}
    roads = []
    for f in json.loads(Path(filename).read_text())['features']:
        if f['properties']['NAME'] not in names:
            continue
        points = [project(*p) for p in f['geometry']['coordinates']]
        segments, current = [], []
        for a, b in zip(points, points[1:]):
            steps = max(1, math.ceil(math.dist(a,b)/8))
            for i in range(steps):
                p = [a[k]+(b[k]-a[k])*i/steps for k in (0,1)]
                if -3400 < p[0] < 9800 and abs(p[1]) < 3700 and not protected(*p,12):
                    current.append([round(v,1) for v in p])
                elif current:
                    segments.append(current);current=[]
        if current:
            segments.append(current)
        for segment in segments:
            if len(segment)>4:
                roads.append(dict(name=f['properties']['NAME'],width=6.2,points=segment))
    data=dict(attribution='U.S. Census Bureau, TIGERweb Physical Features, 2026 vintage',
        license='Public domain',source='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_PhysicalFeatures/MapServer/5',
        query=dict(geometry='-77.656,40.793,-77.496,40.863',geometryType='esriGeometryEnvelope',inSR=4326,outSR=4326,outFields='NAME,MTFCC',where='1=1',f='geojson'),
        origin=[LON,LAT],modifications='Selected two imagery-checked routes, reprojected, resampled and clipped around the fictional airport. Widths and roadside fixtures are interpretations.',roads=roads)
    (OUT/'approach-roads.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    print(f'{len(roads)} road sections prepared')


if __name__ == '__main__':
    prepare(sys.argv[1])
    if len(sys.argv)>2:
        prepare_roads(sys.argv[2])
