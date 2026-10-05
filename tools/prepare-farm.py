"""Original valley farm models, authored in metres in Blender; no source-model edits.
Run Blender --background --python tools/prepare-farm.py, then prepare-farm.mjs.
Retains the three registered roof footprints. Architecture is an interpretation.
"""
import bpy, json, math
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
 'door':material('Faded barn door',(.26,.085,.055),.9),
}
class Builder:
 def __init__(self,name):self.name=name;self.data={k:[[],[],[]] for k in M}
 def face(self,pts,mat,uv=None,up=False,outward=None):
  # Metric UVs on every orientation; reject coincident gable corners before export.
  pts=[Vector(v) for v in pts]
  pts=[v for i,v in enumerate(pts) if (v-pts[i-1]).length>1e-6]
  if len(pts)<3:return
  normal=(pts[1]-pts[0]).cross(pts[2]-pts[0])
  if normal.length<1e-8:return
  if (up and normal.y<0) or (outward is not None and normal.dot(Vector(outward))<0):pts.reverse()
  p,f,t=self.data[mat];i=len(p);p.extend((x,-z,y) for x,y,z in pts);f.append(tuple(range(i,i+len(pts))))
  if uv is None:
   if abs(normal.y)>max(abs(normal.x),abs(normal.z)):uv=[(v.x/1.8,v.z/1.8) for v in pts]
   else:
    horizontal=Vector((normal.z,0,-normal.x)).normalized()
    uv=[(v.dot(horizontal)/1.8,v.y/1.8) for v in pts]
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
manifest=[]
for b in bs:
 B=Builder(b['id']);w,d=b['w'],b['d'];rise=min(d*.27,b['height']*.38,4);eave=b['height']-rise
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
   doorW=3.8 if w>15 else 1.25;doorH=min(3.5,eave-.3)
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
    box((x0+x1)/2,(y0+y1)/2,-.10,x1-x0,y1-y0,.20,'siding')
  # Weathered board battens, broken at windows/doors rather than pasted over them.
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
    B.beam(at(lo+.18,bottom+.2,-.015),at(hi-.18,top-.2,-.015),.045,'trim',4)
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
 # Standing seams clipped against the actual concave footprint.
 umin,umax=min(p[0] for p in expanded),max(p[0] for p in expanded)
 for k in range(int((umax-umin)/.72)+1):
  u=umin+k*.72;hits=[]
  for i,a in enumerate(expanded):
   p=expanded[(i+1)%len(expanded)]
   if min(a[0],p[0])<=u<max(a[0],p[0]):hits.append(a[1]+(u-a[0])/(p[0]-a[0])*(p[1]-a[1]))
  hits.sort()
  for v0,v1 in zip(hits[::2],hits[1::2]):
   parts=[v0]+([0] if v0<0<v1 else [])+[v1]
   for a,p in zip(parts,parts[1:]):B.beam((u,roofY(a)+.13,a),(u,roofY(p)+.13,p),.025,'roof',4)
 for sign in [-1,1]:B.face([(umin,eave+rise+.20,0),(umax,eave+rise+.20,0),(umax,roofY(.24)+.14,sign*.24),(umin,roofY(.24)+.14,sign*.24)],'roof',up=True)
 if w>15:
  for u in [-w*.23,w*.23]:
   y=eave+rise;B.box((u,y+.27,0),(.9,.48,.7),'dark');B.box((u,y+.57,0),(1.16,.14,.92),'roof')
   for h in [.12,.24,.36]:B.box((u,y+h,.37),(.92,.028,.1),'roof');B.box((u,y+h,-.37),(.92,.028,.1),'roof')
 B.finish();manifest.append({k:b[k] for k in ['id','x','z','angle','w','d','height']})
bpy.ops.export_scene.gltf(filepath=str(OUT/'farm-source.glb'),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
(OUT/'placement.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'valley-farm.blend'))
print('Original farm geometry authored, footprints preserved')
