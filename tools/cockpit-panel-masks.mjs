// Derive coating islands and edge masks from the credited cockpit's real faces.
// Connected surface triangles join before outlining, including curved housings,
// so neither tessellation nor a normal change becomes a painted seam.
import * as THREE from 'three';
import sharp from 'sharp';
import {finishCoordinates,finishRegion} from '../js/cockpit/surface-layout.js';
const key=p=>p.map(x=>Math.round(x*10000)).join(',');
const gray=x=>`rgb(${x},${x},${x})`;
const frame=layout=>{
 const [, ,w,h]=layout.rect,[l,b,r,t]=layout.bounds;
 return {w,h,xy:p=>[2+(p[0]-l)/(r-l)*(w-4),2+(1-(p[2]-b)/(t-b))*(h-4)]};
};
const raster=async(svg,blur=0)=>{
 let image=sharp(Buffer.from(svg));if(blur)image=image.blur(blur);
 return image.removeAlpha().greyscale().raw().toBuffer();
};

export async function panelMasks(document,layout,kind){
 const {w,h,xy}=frame(layout),faces=[],edgeOwners=new Map(),parent=[];
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const allowed=new Set(kind==='overhead'?['Material.261','Material.354']:['Material.103','Material.457']);
 for(const node of document.getRoot().listNodes())for(const prim of node.getMesh()?.listPrimitives()||[]){
  const material=prim.getMaterial().getName();if(!allowed.has(material))continue;
  let moving=false;for(let n=node;n;n=n.getParentNode())if(Object.keys(n.getExtras()).some(k=>/Pivot|flightControl/.test(k)))moving=true;
  if(moving)continue;
  const m=new THREE.Matrix4().fromArray(node.getWorldMatrix()),pos=prim.getAttribute('POSITION'),idx=prim.getIndices();
  const points=Array.from({length:pos.getCount()},(_,i)=>new THREE.Vector3().fromArray(pos.getElement(i,[])).applyMatrix4(m));
  for(let i=0;i<idx.getCount();i+=3){
   const p=[0,1,2].map(j=>points[idx.getScalar(i+j)]),centre=p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3);
   const n=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),area=n.length()/2;if(area<1e-10)continue;n.normalize();
   if(finishRegion('panel',centre.x,centre.y,centre.z)!==kind||finishCoordinates('panel',centre.x,centre.y,centre.z,0,n.y)[2]<.5)continue;
   const f={p:p.map(v=>v.toArray()),n,area,material},id=faces.length;faces.push(f);parent.push(id);
   for(let j=0;j<3;j++){
    const edge=[key(f.p[j]),key(f.p[(j+1)%3])].sort().join('/'),owners=edgeOwners.get(edge)||[];
    for(const other of owners)if(faces[other].material===material)parent[find(id)]=find(other);
    owners.push(id);edgeOwners.set(edge,owners);
   }
  }
 }
 const groups=new Map();
 for(let i=0;i<faces.length;i++){
  const root=find(i);if(!groups.has(root))groups.set(root,{faces:[],area:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
  const g=groups.get(root),f=faces[i];g.faces.push(f);g.area+=f.area;
  for(const p of f.p)for(let j=0;j<3;j++){g.min[j]=Math.min(g.min[j],p[j]);g.max[j]=Math.max(g.max[j],p[j]);}
 }
 const plates=[...groups.values()].filter(g=>g.area>.002);
 // Closest horizontal-facing layer wins where a backing plate and a subpanel overlap.
 plates.sort((a,b)=>(kind==='overhead'?-1:1)*(a.min[1]+a.max[1]-b.min[1]-b.max[1]));
 let paths='',tone='';let boundaries=0;
 for(const g of plates){
  const edges=new Map();for(const f of g.faces)for(let j=0;j<3;j++){
   const a=f.p[j],b=f.p[(j+1)%3],k=[key(a),key(b)].sort().join('/');
   if(edges.has(k))edges.get(k).count++;else edges.set(k,{a,b,count:1});
  }
  const seed=Math.sin((g.min[0]+g.max[0])*73+(g.min[2]+g.max[2])*119)*43758.5453;
  const coating=Math.round(128*(.96+.08*(seed-Math.floor(seed))));
  tone+=`<path d="${g.faces.map(f=>'M'+f.p.map(p=>xy(p).join(',')).join('L')+'Z').join('')}" fill="${gray(coating)}"/>`;
  const boundary=[...edges.values()].filter(e=>e.count===1);boundaries+=boundary.length;
  paths+=boundary.map(e=>`M${xy(e.a).join(',')}L${xy(e.b).join(',')}`).join('');
 }
 // Small coated islands identify real control bases. Wear rings sit around their
 // footprint; no invented labels, bolts or switch graphics are painted over them.
 const contacts=new Map();
 for(const g of groups.values()){
  const width=g.max[0]-g.min[0],depth=g.max[2]-g.min[2];
  if(g.area<.00035||g.area>.003||width<.012||depth<.012||width>.08||depth>.08)continue;
  const c=g.min.map((v,i)=>(v+g.max[i])/2),k=[c[0],c[2]].map(v=>Math.round(v*100)).join(',');contacts.set(k,{c,width,depth});
 }
 const rings=[...contacts.values()].map(({c,width,depth})=>{
  const [x,y]=xy(c),[l,b,r,t]=layout.bounds,rx=(width/2+.006)/(r-l)*(w-4),ry=(depth/2+.006)/(t-b)*(h-4);
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="white" stroke-width="3"/>`;
 }).join('');
 const svg=content=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${content}</svg>`;
 const edges=svg(`<rect width="100%" height="100%" fill="black"/><path d="${paths}" fill="none" stroke="white" stroke-width="1.25" stroke-linecap="round"/>`);
 return {edge:await raster(edges),grime:await raster(edges,2.2),tone:await raster(svg(`<rect width="100%" height="100%" fill="${gray(128)}"/>${tone}`)),touch:await raster(svg(`<rect width="100%" height="100%" fill="black"/>${rings}`),1.4),report:{plates:plates.length,boundaries,controls:contacts.size}};
}

export async function linerMask(layout){
 const {w,h,xy}=frame(layout),line=points=>'M'+points.map(([x,z])=>xy([x,0,z]).join(',')).join('L');
 // Authored shallow molded joins in the upper liner, aligned around the actual
 // overhead opening. These are surface interpretations, not surveyed panel seams.
 const paths=[line([[-1.42,-.42],[-.38,-.42]]),line([[.38,-.42],[1.42,-.42]])].join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="black"/><path d="${paths}" fill="none" stroke="white" stroke-width=".8"/></svg>`;
 return {seam:await raster(svg),edge:await raster(svg,1.2)};
}
