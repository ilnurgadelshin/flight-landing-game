"""Original valley farm models, authored in metres in Blender; no source-model edits.
Run Blender --background --python tools/prepare-farm.py, then prepare-farm.mjs.
Retains the registered farm and neighboring roadside footprints. Architecture is an interpretation.
"""
import bpy, json, math, random
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test/output/farm-sources';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def material(name,color,rough=.8,metal=0,wood=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.use_backface_culling=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if wood:
  for file,slot in [('color','Base Color'),('rough','Roughness'),('normal','Normal')]:
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'weathered_brown_planks'/f'{file}.jpg'),check_existing=True)
   if file!='color':t.image.colorspace_settings.name='Non-Color'
   if file=='normal':
    n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.5;m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs[slot])
   else:m.node_tree.links.new(t.outputs['Color'],p.inputs[slot])
 return m
M={
 'siding':material('Weathered timber · CC0 Poly Haven',(.32,.23,.17),wood=True),
 'stone':material('Foundation concrete',(.29,.28,.25)),
 'trim':material('Aged cream paint',(.40,.39,.33)),
 'roof':material('Galvanized standing seam',(.22,.25,.25),.78,.18),
 'dark':material('Recess and door ironwork',(.025,.029,.028),.84),
 'glass':material('Window glazing',(.10,.16,.19),.22,.35),
 'paint':material('Weathered cream clapboard',(.49,.47,.40),.86),
 'redroof':material('Oxide red standing seam',(.24,.085,.065),.85,.12),
 'door':material('Faded barn door',(.26,.085,.055),.9),
 'silo':material('Weathered galvanized silo',(.34,.38,.38),.68,.28),
 'sage':material('Muted sage house siding',(.25,.30,.25),.88),
 'sand':material('Warm grey house siding',(.37,.34,.28),.88),
 'shingle':material('Charcoal residential roof',(.14,.147,.154),.96),
}
# Small surface relief belongs in a filtered normal map. Centimetre-wide raised
# strips become bright, broken lines at flight distances when built as geometry.
def relief(mat,name,axis,period,count,strength):
 size=512;image=bpy.data.images.new(name,width=size,height=size,alpha=False)
 pixels=[]
 for y in range(size):
  for x in range(size):
   phase=(((x if axis==0 else y)+.5)/size*count+.5)%1-.5
   slope=phase/.045*math.exp(-.5*(phase/.045)**2)*strength
   n=Vector((-slope if axis==0 else 0,-slope if axis==1 else 0,1)).normalized()
   pixels.extend((n.x*.5+.5,n.y*.5+.5,n.z*.5+.5,1))
 image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels)
 image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save()
 nodes=mat.node_tree.nodes;t=nodes.new('ShaderNodeTexImage');t.image=image
 n=nodes.new('ShaderNodeNormalMap');mat.node_tree.links.new(t.outputs['Color'],n.inputs['Color'])
 mat.node_tree.links.new(n.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
 return period*count
paint_uv=relief(M['paint'],'clapboard-relief',1,.19,8,.40)
# House colour variants share the filtered clapboard normal; no new image downloads.
for key in ['sage','sand']:
 t=M[key].node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images['clapboard-relief']
 n=M[key].node_tree.nodes.new('ShaderNodeNormalMap');M[key].node_tree.links.new(t.outputs['Color'],n.inputs['Color']);M[key].node_tree.links.new(n.outputs['Normal'],M[key].node_tree.nodes.get('Principled BSDF').inputs['Normal'])
roof_uv=relief(M['roof'],'seam-relief',0,.72,2,.60)
# Original filtered asphalt-shingle colour, subtle enough to avoid a bright grid
# at approach distances. Grain and courses are baked once, not evaluated per frame.
size=256;rng=random.Random(419);pixels=[]
courses=[[rng.uniform(.78,.92) for _ in range(8)] for _ in range(16)]
for y in range(size):
 row=y//16
 for x in range(size):
  sx=(x+(row%2)*16)%size;value=courses[row][sx//32]+rng.uniform(-.035,.035)
  value*=.91 if y%16<1 or sx%32<1 else 1
  pixels.extend((value,value,value,1))
image=bpy.data.images.new('shingle-grain',width=size,height=size,alpha=False);image.pixels.foreach_set(pixels)
image.filepath_raw=str(OUT/'shingle-grain.png');image.file_format='PNG';image.save()
t=M['shingle'].node_tree.nodes.new('ShaderNodeTexImage');t.image=image
mix=M['shingle'].node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
mix.inputs[2].default_value=(.14,.147,.154,1)
M['shingle'].node_tree.links.new(t.outputs['Color'],mix.inputs[1]);M['shingle'].node_tree.links.new(mix.outputs[0],M['shingle'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
# Reuse the same seam texture for the red-painted garage roof.
t=M['redroof'].node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images['seam-relief']
n=M['redroof'].node_tree.nodes.new('ShaderNodeNormalMap');M['redroof'].node_tree.links.new(t.outputs['Color'],n.inputs['Color']);M['redroof'].node_tree.links.new(n.outputs['Normal'],M['redroof'].node_tree.nodes.get('Principled BSDF').inputs['Normal'])
class Builder:
 def __init__(self,name,style='barn',finish=None,roof_finish=None):
  self.name=name;self.style=style;self.finish_material=finish;self.roof_finish=roof_finish;self.data={k:[[],[],[]] for k in M}
 def face(self,pts,mat,uv=None,up=False,outward=None):
  # Metric UVs on every orientation; reject coincident gable corners before export.
  pts=[Vector(v) for v in pts]
  pts=[v for i,v in enumerate(pts) if (v-pts[i-1]).length>1e-6]
  if len(pts)<3:return
  normal=(pts[1]-pts[0]).cross(pts[2]-pts[0])
  if normal.length<1e-8:return
  if (up and normal.y<0) or (outward is not None and normal.dot(Vector(outward))<0):pts.reverse()
  if mat=='siding' and self.style=='house':mat='paint'
  if self.finish_material and mat in ['siding','paint']:mat=self.finish_material
  if mat=='roof' and self.roof_finish:mat=self.roof_finish
  elif self.finish_material and mat=='roof':mat='shingle'
  if mat=='roof' and self.style=='garage' and not self.roof_finish:mat='redroof'
  p,f,t=self.data[mat];i=len(p);p.extend((x,-z,y) for x,y,z in pts);f.append(tuple(range(i,i+len(pts))))
  if uv is None:
   if abs(normal.y)>max(abs(normal.x),abs(normal.z)):
    scale=3.2 if mat=='shingle' else roof_uv if mat in ['roof','redroof'] else 1.8;uv=[(v.x/scale,v.z/scale) for v in pts]
   else:
    horizontal=Vector((normal.z,0,-normal.x)).normalized()
    scale=paint_uv if mat in ['paint','sage','sand'] else 1.8;uv=[(v.dot(horizontal)/scale,v.y/scale) for v in pts]
  t.append(uv)
 def box(self,c,size,mat='trim',basis=None):
  x,y,z=c;a,b,d=[s/2 for s in size]
  def v(u,h,w):
   if basis: u,w=u*basis[0]+w*basis[1],u*basis[2]+w*basis[3]
   return (x+u,y+h,z+w)
  q=[v(-a,-b,-d),v(a,-b,-d),v(a,b,-d),v(-a,b,-d),v(-a,-b,d),v(a,-b,d),v(a,b,d),v(-a,b,d)]
  for ids in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:
   pts=[Vector(q[i]) for i in ids];self.face(pts,mat,outward=sum(pts,Vector())/4-Vector(c))
 def beam(self,a,b,r,mat='roof',sides=6):
  a,b=Vector(a),Vector(b);direction=(b-a).normalized();cross=direction.cross(Vector((0,1,0)))
  if cross.length<.01:cross=direction.cross(Vector((1,0,0)))
  cross.normalize();other=direction.cross(cross);ring=[(cross*math.cos(i*2*math.pi/sides)+other*math.sin(i*2*math.pi/sides))*r for i in range(sides)]
  for i in range(sides):j=(i+1)%sides;self.face([a+ring[i],b+ring[i],b+ring[j],a+ring[j]],mat,outward=ring[i]+ring[j])
  self.face([a+d for d in ring],'dark',outward=-direction);self.face([b+d for d in reversed(ring)],mat,outward=direction)
 def finish(self):
  parent=bpy.data.objects.new(self.name,None);bpy.context.collection.objects.link(parent)
  for key,(p,f,uvs) in self.data.items():
   if not p:continue
   mesh=bpy.data.meshes.new(self.name+' '+key);mesh.from_pydata(p,[],f);mesh.materials.append(M[key]);mesh.update()
   uv=mesh.uv_layers.new(name='UVMap')
   for poly,coords in zip(mesh.polygons,uvs):
    for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
   # Preserve explicit winding: recalculating disconnected open roof faces can
   # flip one half of a ridge downward despite its initially correct normal.
   obj=bpy.data.objects.new(self.name+' '+key,mesh);bpy.context.collection.objects.link(obj);obj.parent=parent
  return parent

def silo(B,cx,cz,r,height):
 # Cylinders and shallow domed roofs, with substantial hoops and a ladder.
 # Skins, domes and hoops share a material; foundations and rails reuse existing ones.
 n=48;roof=min(2.2,height*.18);eave=height-roof
 def ring(radius,y):return [(cx+radius*math.cos(i*2*math.pi/n),y,cz+radius*math.sin(i*2*math.pi/n)) for i in range(n)]
 def skin(a,b,mat='silo'):
  for i in range(n):
   j=(i+1)%n;B.face([a[i],a[j],b[j],b[i]],mat,outward=(a[i][0]-cx,0,a[i][2]-cz))
 skin(ring(r+.16,-.1),ring(r+.16,.35),'stone');skin(ring(r,.30),ring(r,eave))
 for k in range(4):
  a=k*math.pi/8;b=(k+1)*math.pi/8
  skin(ring(r*math.cos(a),eave+roof*math.sin(a)),ring(r*math.cos(b),eave+roof*math.sin(b)))
 for y in [eave*.2,eave*.4,eave*.6,eave*.8]:
  skin(ring(r+.055,y-.045),ring(r+.055,y+.045))
  for sign in [-1,1]:skin(ring(r,y+sign*.045),ring(r+.055,y+sign*.045))
 for x in [-.27,.27]:B.beam((cx+x,.7,cz+r+.12),(cx+x,eave+.1,cz+r+.12),.035,'dark',5)
 for k in range(int((eave-.6)/.33)):
  y=.75+k*.33;B.beam((cx-.27,y,cz+r+.12),(cx+.27,y,cz+r+.12),.026,'silo',5)

def farmWing(B,x0,x1,z0,z1,eave,rise,axis='z'):
 # Separate pitched wings match the dairy's T-shaped roof instead of one broad roof.
 # Coordinates are in the source footprint frame; the runtime places the whole site.
 roof=lambda x,z:eave+rise*(1-abs(((x-x0)/(x1-x0) if axis=='z' else (z-z0)/(z1-z0))*2-1))
 points=[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]
 for a,b in zip(points,points[1:]+points[:1]):
  out=((a[0]+b[0])/2-(x0+x1)/2,0,(a[1]+b[1])/2-(z0+z1)/2)
  B.face([(a[0],.3,a[1]),(b[0],.3,b[1]),(b[0],eave,b[1]),(a[0],eave,a[1])],'siding',outward=out)
  mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
  if roof(*mid)>eave+.01:B.face([(a[0],eave,a[1]),(b[0],eave,b[1]),(mid[0],roof(*mid),mid[1])],'paint',outward=out)
  B.beam((a[0],eave,a[1]),(b[0],eave,b[1]),.10,'trim',4)
 if axis=='z':
  mid=(x0+x1)/2
  for edge in [x0-.3,x1+.3]:B.face([(edge,eave,z0-.3),(mid,eave+rise,z0-.3),(mid,eave+rise,z1+.3),(edge,eave,z1+.3)],'roof',up=True)
  B.beam((mid,eave+rise+.04,z0-.3),(mid,eave+rise+.04,z1+.3),.12,'roof',4)
 else:
  mid=(z0+z1)/2
  for edge in [z0-.3,z1+.3]:B.face([(x0-.3,eave,edge),(x0-.3,eave+rise,mid),(x1+.3,eave+rise,mid),(x1+.3,eave,edge)],'roof',up=True)
  B.beam((x0-.3,eave+rise+.04,mid),(x1+.3,eave+rise+.04,mid),.12,'roof',4)
 B.box(((x0+x1)/2,.12,(z0+z1)/2),(x1-x0+.12,.4,z1-z0+.12),'stone')

def clip(points,sign):
 out=[]
 for i,a in enumerate(points):
  b=points[(i+1)%len(points)];inside=a[1]*sign>=0;other=b[1]*sign>=0
  if inside:out.append(a)
  if inside!=other:
   t=-a[1]/(b[1]-a[1]);out.append((a[0]+t*(b[0]-a[0]),0))
 return out

bs=json.loads((ROOT/'assets/scenery/approach-infill.json').read_text())['buildings'][:2]
workshop=next(b for b in json.loads((ROOT/'assets/scenery/approach-buildings.json').read_text())['buildings'] if b['x']==2465.9 and b['z']==303.6)
bs.append(dict(workshop,id='valley-workshop'))
# Six neighboring buildings selected against the bundled 2_0 aerial tile.
# Retain footprints and interpreted source heights, with individual uses/materials.
registered=json.loads((ROOT/'assets/scenery/approach-buildings.json').read_text())['buildings']
for x,z,name,style in [(2490.9,241.6,'roadside-farmhouse','house'),(2567.0,425.5,'roadside-shed','barn'),(2601.1,425.8,'roadside-cottage','house'),(2606.2,442.6,'roadside-garage','garage'),(2624.0,466.4,'roadside-workbarn','barn'),(2660.7,359.2,'roadside-store','barn')]:
 b=next(b for b in registered if b['x']==x and b['z']==z)
 height={'roadside-farmhouse':6.1,'roadside-cottage':4.5,'roadside-garage':4.2,'roadside-workbarn':5.6,'roadside-store':5.0}.get(name,b['height'])
 bs.append(dict(b,id=name,style=style,height=height,sourceHeight=b['height']))
# Two further sites, checked against the existing 2_-1 and 3_-1 imagery.
# Preserve source footprints; architecture and complete-building heights are interpreted.
extras=json.loads((ROOT/'assets/scenery/approach-infill.json').read_text())['buildings']
for name in ['north-farm-barn','north-farm-annex']:
 b=next(b for b in extras if b['id']==name);bs.append(dict(b,cluster='north-farm',sparseBattens=True))
for x,z,name,style,height,cluster in [
 (2339.7,-329.7,'north-farm-workshop','barn',4.6,'north-farm'),
 (3168.2,-292.7,'ridge-garage','garage',3.4,'ridge-hamlet'),
 (3178.0,-263.8,'ridge-barn','garage',5.8,'ridge-hamlet'),
 (3186.0,-289.8,'ridge-store','garage',3.1,'ridge-hamlet'),
 (3225.5,-284.2,'ridge-house','house',5.7,'ridge-hamlet'),
]:
 b=next(b for b in registered if b['x']==x and b['z']==z)
 bs.append(dict(b,id=name,style=style,height=height,sourceHeight=b['height'],cluster=cluster,sparseBattens=True))
# The conspicuous upper-valley complex: two detected "buildings" are silos.
# Interpret their cylindrical forms from 4_-1; retain all registered footprints.
for x,z,name,style,height in [
 (4401.2,-503.4,'contour-dairy','dairy',8.4),
 (4403.7,-442.8,'contour-machinery-shed','garage',4.4),
 (4434.1,-443.2,'contour-tall-silo','silo',14),
 (4434.4,-468.3,'contour-twin-silos','silos',10.2),
 (4454.3,-490,'contour-store','barn',6),
 (4470.6,-522.4,'contour-service-shed','garage',3.2),
]:
 b=next(b for b in registered if b['x']==x and b['z']==z)
 bs.append(dict(b,id=name,style=style,height=height,sourceHeight=b['height'],cluster='contour-farm',sparseBattens=True))
# The residential frontage on 4_0: houses, detached garages and utility sheds.
# Keep the source footprints; the missing western garage is a reviewed roof trace.
for x,z,name,style,finish in [
 (4312.5,151.5,'garden-cottage','house','sand'),
 (4529.3,167,'lane-house','house','paint'),
 (4549.2,172.3,'lane-garage','garage','sand'),
 (4564.6,77.8,'orchard-store','garage','sage'),
 (4583.1,77.5,'orchard-house','house','sage'),
 (4637.6,14.5,'upper-house-garage','garage','sand'),
 (4653.7,22.5,'upper-house','house','paint'),
 (4708.2,88.4,'east-workshop','garage','paint'),
 (4716.4,153.1,'east-store','barn','sand'),
 (4717.9,112.6,'east-house','house','sand'),
 (4740.9,161,'east-cottage','house','sage'),
 (4749,235.8,'wood-edge-house','house','paint'),
]:
 b=next(b for b in registered if b['x']==x and b['z']==z)
 bs.append(dict(b,id=name,style=style,finish=finish,cluster='roadside-homes',sparseBattens=True))
b=next(b for b in extras if b['id']=='garden-cottage-garage')
bs.append(dict(b,style='garage',finish='sand',cluster='roadside-homes',sparseBattens=True))
# Complete the connected crossing neighborhood. Placements and original use/finish
# interpretations are shared with the reviewed parcel/access source, not duplicated.
for site in json.loads((ROOT/'assets/scenery/approach-sites.json').read_text())['sites']:
 for spec in site.get('buildings',[]):
  b=next(b for b in registered if b['x']==spec['x'] and b['z']==spec['z'])
  roof='redroof' if spec['id']=='bend-red-roof-house' else 'shingle' if spec['style']=='house' else 'roof'
  bs.append(dict(b,**{k:v for k,v in spec.items() if k not in ['x','z']},roofFinish=roof,sourceHeight=b['height'],cluster=site['id'],sparseBattens=True))
manifest=[]
for b in bs:
 placement={**{k:b[k] for k in ['id','x','z','angle','w','d','height']},'style':b.get('style','barn'),'sourceHeight':b.get('sourceHeight',b['height']),'cluster':b.get('cluster','valley')}
 if placement['cluster'].startswith('crossing-'):placement['batchGroup']='approach-crossing'
 if b.get('style') in ['silo','silos']:
  B=Builder(b['id'],b['style']);w,d=b['w'],b['d'];centres=[(0,0,min(w,d)*.46)] if b['style']=='silo' else [(-w*.25,0,min(w*.225,d*.43)),(w*.25,0,min(w*.225,d*.43))]
  for x,z,r in centres:silo(B,x,z,r,b['height'])
  # Projection uses the cylinders' plan shape, not the old rectangular facade.
  c,s=math.cos(b['angle']),math.sin(b['angle']);outline=[]
  for x,z,r in centres:
   for i in range(24):
    u=x+r*math.cos(i*math.pi/12);v=z+r*math.sin(i*math.pi/12);outline.append([round(u*c-v*s,3),round(u*s+v*c,3)])
  placement['shadowOutline']=outline;placement['roofSamples']=[[round(x*c-z*s,3),round(x*s+z*c,3)] for x,z,_ in centres]
  B.finish();manifest.append(placement);continue
 if b.get('style')=='dairy':
  B=Builder(b['id'],'dairy')
  farmWing(B,-18,-3,-19,8,5.9,2.5,'z');farmWing(B,-3,13,-19,8,5.9,2.5,'z');farmWing(B,-24,26,8,19,4.5,1.8,'x')
  # Recessed access doors and a continuous row of smaller dairy ventilation windows.
  for side,sign in [(-18,-1),(13,1)]:
   for z in [-12,-6,0,6]:
    B.box((side+sign*.025,3.2,z),(.09,1.25,2.1),'dark');B.box((side+sign*.08,3.2,z),(.035,1.02,1.86),'glass')
    for y in [2.53,3.87]:B.box((side+sign*.15,y,z),(.20,.10,2.24),'trim')
   for z in [-18.95,7.95]:B.box((side,3,z),(.18,5.85,.18),'trim')
  for x in [-10.5,5]:
   B.box((x,2,-19.03),(4.1,3.65,.09),'dark');B.box((x,2,-19.10),(3.8,3.4,.06),'door');B.box((x,3.93,-19.18),(4.4,.12,.3),'trim')
  for x in [-12,16]:
   B.box((x,2,19.03),(4.1,3.65,.09),'dark');B.box((x,2,19.10),(3.8,3.4,.06),'door');B.box((x,3.93,19.18),(4.4,.12,.3),'trim')
  placement['roofSamples']=[[x*math.cos(b['angle']),x*math.sin(b['angle'])] for x in [-10.5,5]]
  B.finish();manifest.append(placement);continue
 style=b.get('style','barn');B=Builder(b['id'],style,b.get('finish'),b.get('roofFinish'));w,d=b['w'],b['d'];rise=min(d*.27,b['height']*.38,4)
 if 'style' in b:rise=min(rise,max(.35,b['height']-2.65))
 eave=b['height']-rise
 c,s=math.cos(b['angle']),math.sin(b['angle']);points=[(x*c+z*s,-x*s+z*c) for x,z in b['outline']]
 roofY=lambda v:eave+rise*max(0,1-abs(v)/(d/2))
 for i,a in enumerate(points):
  p=points[(i+1)%len(points)];length=math.dist(a,p);dx,dz=(p[0]-a[0])/length,(p[1]-a[1])/length
  # Winding-independent outward vector, tested against the building centre.
  nx,nz=dz,-dx
  if (a[0]+p[0])*nx+(a[1]+p[1])*nz<0:nx,nz=-nx,-nz
  at=lambda along,y,out=0:(a[0]+dx*along+nx*out,y,a[1]+dz*along+nz*out)
  box=lambda along,y,out,width,height,depth,mat:B.box(at(along,y,out),(width,height,depth),mat,(dx,nx,dz,nz))
  front=length>w*.65 and (a[1]+p[1])/2<0
  openings=[]
  if front:
   doorW=1.15 if style=='house' else 3.8 if w>15 else 1.25;doorH=min(2.2 if style=='house' else 3.5,eave-.3)
   openings.append((length*.47-doorW/2,length*.47+doorW/2,.35,doorH,'door'))
  if length>7:
   for along in [2.2,length-2.2]:
    if any(lo-1<along<hi+1 for lo,hi,*_ in openings):continue
    openings.append((along-.65,along+.65,1.5,min(2.65,eave-.24),'glass'))
  xs=sorted(set([0,length]+[v for o in openings for v in o[:2]]));ys=sorted(set([.35,eave]+[v for o in openings for v in o[2:4]]))
  box(length/2,.12,0,length,.46,.32,'stone')
  for x0,x1 in zip(xs,xs[1:]):
   for y0,y1 in zip(ys,ys[1:]):
    if any(lo<(x0+x1)/2<hi and bottom<(y0+y1)/2<top for lo,hi,bottom,top,_ in openings):continue
    # Adjacent box cells expose bright internal edges at subpixel scale. The
    # continuous outer skin is split only for actual door/window openings;
    # their recessed panels and thick frames supply the visible reveal depth.
    B.face([at(x0,y0),at(x1,y0),at(x1,y1),at(x0,y1)],'siding',outward=(nx,0,nz))
  # Timber battens remain geometric; house clapboard uses filtered relief.
  if style!='house' and not b.get('sparseBattens'):
   for n in range(1,int(length/.42)):
    x=n*.42
    for bottom,top in zip(ys,ys[1:]):
     if not any(lo<x<hi and low<(bottom+top)/2<high for lo,hi,low,high,_ in openings):box(x,(bottom+top)/2,.016,.038,top-bottom,.032,'siding')
  for lo,hi,bottom,top,kind in openings:
   mid=(lo+hi)/2;h=top-bottom
   box(mid,(top+bottom)/2,-.19,hi-lo+.08,h+.08,.12,'dark')
   box(mid,(top+bottom)/2,-.11,hi-lo-.1,h-.08,.035,kind)
   for x in [lo,hi]:box(x,(top+bottom)/2,.018,.11,h+.2,.22,'trim')
   for y in [bottom,top]:box(mid,y,.035,hi-lo+.22,.12,.25,'trim')
   if kind=='glass':
    box(mid,(top+bottom)/2,.025,.055,h,.08,'trim');box(mid,(top+bottom)/2,.025,hi-lo,.045,.08,'trim')
   else:
    box(mid,top+.17,.10,hi-lo+.65,.085,.12,'dark');box(mid,bottom-.10,.3,hi-lo+.5,.16,.85,'stone')
    for x in [lo+.25,mid,hi-.25]:box(x,(top+bottom)/2,-.04,.04,h-.13,.07,'dark')
    if style!='house':B.beam(at(lo+.18,bottom+.2,-.015),at(hi-.18,top-.2,-.015),.045,'trim',4)
    else:
     box(mid,top+.22,.35,hi-lo+.7,.12,.95,'roof')
     box(mid,.10,.57,hi-lo+.75,.20,1.3,'stone')
    box(mid+.16,bottom+h*.52,.02,.045,.28,.10,'dark')
  # Solid gable above the eave and substantial corner/fascia boards.
  breaks=[0,length]
  if a[1]*p[1]<0:breaks.insert(1,-a[1]/(p[1]-a[1])*length)
  for x0,x1 in zip(breaks,breaks[1:]):
   y0,y1=roofY(a[1]+dz*x0),roofY(a[1]+dz*x1)
   if max(y0,y1)>eave+.001:B.face([at(x0,eave),at(x1,eave),at(x1,y1),at(x0,y0)],'siding',outward=(nx,0,nz))
   B.beam(at(x0,y0+.05,.13),at(x1,y1+.05,.13),.095,'trim',4)
  for x in [0,length]:box(x,eave/2,.025,.12,eave,.22,'trim')
  if abs(dz)<.2:
   B.beam(at(0,eave-.08,.25),at(length,eave-.08,.25),.10,'roof',8)
   for x in [.35,length-.35]:
    B.beam(at(x,.25,.16),at(x,eave-.2,.16),.045,'roof',6)
 # Roof with real thickness and folded ridge cap, matching the registered outline.
 expanded=[(u*(1+.7/w),v*(1+.7/d)) for u,v in points]
 for poly in [clip(expanded,1),clip(expanded,-1)]:
  if len(poly)<3:continue
  vectors=[Vector((u,roofY(v)+.12,v)) for u,v in poly]
  for triangle in tessellate_polygon([vectors]):B.face([vectors[v] if isinstance(v,int) else v for v in triangle],'roof',up=True)
 for i,a in enumerate(expanded):
  p=expanded[(i+1)%len(expanded)];B.face([(a[0],roofY(a[1]),a[1]),(p[0],roofY(p[1]),p[1]),(p[0],roofY(p[1])+.12,p[1]),(a[0],roofY(a[1])+.12,a[1])],'roof',outward=(a[0]+p[0],0,a[1]+p[1]))
 # Filtered standing-seam relief above; keep the substantial folded ridge cap.
 umin,umax=min(p[0] for p in expanded),max(p[0] for p in expanded)
 for sign in [-1,1]:B.face([(umin,eave+rise+.20,0),(umax,eave+rise+.20,0),(umax,roofY(.24)+.14,sign*.24),(umin,roofY(.24)+.14,sign*.24)],'roof',up=True)
 if style=='house':
  B.box((w*.27,eave+rise+.28,0),(.6,.56,.65),'stone');B.box((w*.27,eave+rise+.60,0),(.74,.08,.79),'dark')
 if w>15 and style!='house':
  for u in [-w*.23,w*.23]:
   y=eave+rise;B.box((u,y+.27,0),(.9,.48,.7),'dark');B.box((u,y+.57,0),(1.16,.14,.92),'roof')
   for h in [.12,.24,.36]:B.box((u,y+h,.37),(.92,.028,.1),'roof');B.box((u,y+h,-.37),(.92,.028,.1),'roof')
 B.finish();manifest.append(placement)
bpy.ops.export_scene.gltf(filepath=str(OUT/'farm-source.glb'),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
(OUT/'placement.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'valley-farm.blend'))
print('Original farm geometry authored, footprints preserved')
