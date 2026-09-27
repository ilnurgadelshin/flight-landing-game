// Offline, georegistered footprints; the roof styles and facades are interpretations.
// All batches are spatially bounded so most of the valley can be frustum-culled.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { sceneryGroundHeight } from './scenery-ground.js';

function facade(style,aniso) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const glow=canvas.cloneNode(),g=canvas.getContext('2d'),e=glow.getContext('2d'),rng=makeRng(91+style);
  g.fillStyle=['#bebbb0','#b2a390','#a5aaa5'][style];g.fillRect(0,0,512,512);
  e.fillStyle='black';e.fillRect(0,0,512,512);
  // An 8 m wide, two-storey repeat, with siding or brick at physical scale.
  for(let y=0;y<512;y+=style===1?8:14){
    g.fillStyle=style===1?'rgba(58,48,38,.18)':'rgba(24,30,28,.12)';g.fillRect(0,y,512,1);
    g.fillStyle='rgba(255,255,255,.06)';g.fillRect(0,y+1,512,1);
    if(style===1)for(let x=(y%16?9:0);x<512;x+=18)g.fillRect(x,y,1,8);
  }
  for(let i=0;i<14000;i++){
    g.fillStyle=`rgba(${rng()>.5?'255,255,255':'0,0,0'},.025)`;g.fillRect(rng()*512,rng()*512,1,1);
  }
  for(let row=0;row<2;row++)for(let col=0;col<4;col++){
    const x=32+col*128,y=50+row*256,w=57,h=108;
    g.fillStyle='rgba(20,23,21,.42)';g.fillRect(x-5,y-5,w+12,h+15);
    g.fillStyle='#d2d0c5';g.fillRect(x-3,y-3,w+6,h+6);
    const pane=g.createLinearGradient(0,y,0,y+h);pane.addColorStop(0,'#34484c');pane.addColorStop(.5,'#526260');pane.addColorStop(1,'#232c2c');
    g.fillStyle=pane;g.fillRect(x+2,y+2,w-4,h-4);
    if(rng()>.5){g.fillStyle='rgba(161,153,132,.4)';g.fillRect(x+3,y+3,12,h-7);}
    g.fillStyle='#b8b9b1';g.fillRect(x+w/2-1,y,2,h);g.fillRect(x,y+h*.52,w,3);
    g.fillStyle='#dedbd0';g.fillRect(x-5,y+h,w+10,4);
    if(rng()>.6){e.fillStyle=['#6e542d','#a37b40','#50482f'][col%3];e.fillRect(x+3,y+3,w-6,h-6);}
  }
  const texture=c=>{const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;return t;};
  return new THREE.MeshStandardMaterial({map:texture(canvas),emissiveMap:texture(glow),
    emissive:0xffd3a0,emissiveIntensity:0,roughness:.89,vertexColors:true});
}

function roofMaterial(aniso) {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),rng=makeRng(592);
  g.fillStyle='#b5b5b5';g.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=16)for(let x=-32;x<256;x+=64){
    const v=158+Math.floor(rng()*40),xx=x+(y%32?32:0);
    g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(xx,y,63,15);
    g.fillStyle='rgba(0,0,0,.18)';g.fillRect(xx,y+14,64,2);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;
  return new THREE.MeshStandardMaterial({map:t,roughness:.92,vertexColors:true});
}

class Batch {
  constructor(){this.p=[];this.uv=[];this.c=[];}
  triangle(a,b,c,uv,color){this.p.push(...a,...b,...c);this.uv.push(...uv.flat());for(let i=0;i<3;i++)this.c.push(color.r,color.g,color.b);}
  quad(a,b,c,d,uv,color){this.triangle(a,b,c,[uv[0],uv[1],uv[2]],color);this.triangle(a,c,d,[uv[0],uv[2],uv[3]],color);}
  mesh(material){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeVertexNormals();g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
  }
}

function clipRidge(points,positive) {
  const result=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],inside=positive?a[1]>=0:a[1]<=0,next=positive?b[1]>=0:b[1]<=0;
    if(inside)result.push(a);
    if(inside!==next){const t=-a[1]/(b[1]-a[1]);result.push([a[0]+t*(b[0]-a[0]),0]);}
  }
  return result;
}

export async function addApproachBuildings(world) {
  const response=await fetch(new URL('../../assets/scenery/approach-buildings.json',import.meta.url));
  if(!response.ok)throw new Error(`Approach buildings: HTTP ${response.status}`);
  const {buildings}=await response.json(),low=world.lowDetail||world.quality==='low';
  const materials=[0,1,2].map(i=>facade(i,world.maxAniso)),roof=roofMaterial(world.maxAniso);
  const trim=new THREE.MeshStandardMaterial({color:0xaca99e,roughness:.87,vertexColors:true});
  const foundation=new THREE.MeshStandardMaterial({color:0x77766e,roughness:1,vertexColors:true});
  const group=new THREE.Group();group.name='Georegistered approach buildings';
  const tiles=new Map(),details=new Map(),index=new Map(),rng=makeRng(9482),white=new THREE.Color(0xffffff);
  const ground=(x,z)=>sceneryGroundHeight(x,z,low);
  for(const b of buildings){
    const tile=low?2000:1000,key=`${Math.floor(b.x/tile)}:${Math.floor(b.z/tile)}`;
    if(!tiles.has(key))tiles.set(key,Array.from({length:6},()=>new Batch()));
    if(!low&&!details.has(key))details.set(key,new Batch());
    const batches=tiles.get(key),style=Math.floor(rng()*3),wall=batches[style],top=batches[3],edge=batches[4],base=batches[5];
    const cos=Math.cos(b.angle),sin=Math.sin(b.angle),rise=b.pitched?Math.min(b.d*.27,b.height*.38,4):0;
    const floor=Math.max(...b.outline.map(([x,z])=>ground(b.x+x,b.z+z)))+.15;
    const eave=floor+Math.max(2.6,b.height-rise),roofY=v=>eave+rise*Math.max(0,1-Math.abs(v)/(b.d/2));
    let points=b.outline.map(([x,z])=>[x*cos+z*sin,-x*sin+z*cos]);
    if(THREE.ShapeUtils.isClockWise(points.map(p=>new THREE.Vector2(...p))))points.reverse();
    if(rise){
      const split=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],p=points[(i+1)%points.length];split.push(a);
        if(a[1]*p[1]<0){const t=-a[1]/(p[1]-a[1]);split.push([a[0]+t*(p[0]-a[0]),0]);}
      }points=split;
    }
    const vertex=(u,v,y)=>[b.x+u*cos-v*sin,y,b.z+u*sin+v*cos];
    const roofTint=new THREE.Color().setRGB(...b.roof.map(v=>Math.max(.18,Math.min(.82,v/255*1.15))),THREE.SRGBColorSpace);
    const tint=new THREE.Color().setRGB(.78+rng()*.18,.78+rng()*.16,.74+rng()*.15);
    for(let i=0;i<points.length;i++){
      const a=points[i],p=points[(i+1)%points.length],len=Math.hypot(p[0]-a[0],p[1]-a[1]);
      const ya=roofY(a[1]),yb=roofY(p[1]);
      // Consistent metre-scale repeats: larger buildings do not acquire giant windows.
      wall.quad(vertex(...a,floor),vertex(...a,ya),vertex(...p,yb),vertex(...p,floor),[[0,0],[0,(ya-floor)/5.6],[len/8,(yb-floor)/5.6],[len/8,0]],tint);
      const va=vertex(...a,floor),vb=vertex(...p,floor);
      base.quad([va[0],ground(va[0],va[2])-.4,va[2]],va,vb,[vb[0],ground(vb[0],vb[2])-.4,vb[2]],[[0,0],[0,1],[1,1],[1,0]],white);
      if(!low&&len>1&&b.x>1800&&Math.abs(b.z)<1500&&b.w<45&&b.height<12){
        // Raised sills/lintels at the actual texture's window positions make the
        // glass read as recessed on close passes; a spatial LOD drops them far away.
        const batch=details.get(key),du=(p[0]-a[0])/len,dv=(p[1]-a[1])/len;
        const at=(along,y,out)=>vertex(a[0]+du*along+dv*out,a[1]+dv*along-du*out,y);
        for(let y=floor+5.6*(1-414/512);y+1.25<Math.min(ya,yb,floor+5.6)-.12;y+=2.8){
          for(let x=.5;x+1<len-.1;x+=2)for(const h of [y,y+1.2]){
            const uv=[[0,0],[0,1],[1,1],[1,0]];
            batch.quad(at(x-.07,h,.01),at(x+.97,h,.01),at(x+.97,h,.16),at(x-.07,h,.16),uv,white);
            batch.quad(at(x-.07,h-.07,.16),at(x-.07,h,.16),at(x+.97,h,.16),at(x+.97,h-.07,.16),uv,white);
          }
        }
      }
    }
    // Split at the ridge BEFORE triangulation: no diagonal folds across concave roofs.
    const expanded=points.map(([u,v])=>[u*(1+.6/b.w),v*(1+.6/b.d)]);
    for(const polygon of rise?[clipRidge(expanded,false),clipRidge(expanded,true)]:[expanded]){
      const triangles=THREE.ShapeUtils.triangulateShape(polygon.map(p=>new THREE.Vector2(...p)),[]);
      for(const t of triangles){const pts=t.map(i=>polygon[i]);
        // x/z planar winding is opposite to the upward-facing x/y convention.
        top.triangle(vertex(...pts[2],roofY(pts[2][1])),vertex(...pts[1],roofY(pts[1][1])),vertex(...pts[0],roofY(pts[0][1])),
          [pts[2].map(v=>v/4),pts[1].map(v=>v/4),pts[0].map(v=>v/4)],roofTint);
      }
    }
    if(!low)for(let i=0;i<expanded.length;i++){
      const a=expanded[i],p=expanded[(i+1)%expanded.length];
      edge.quad(vertex(...a,roofY(a[1])-.16),vertex(...a,roofY(a[1])),vertex(...p,roofY(p[1])),vertex(...p,roofY(p[1])-.16),[[0,0],[0,1],[1,1],[1,0]],white);
    }
    // Spatial exclusion for woodland, including crown width rather than just the trunk.
    const r=Math.hypot(b.w,b.d)/2+16;
    for(let x=Math.floor((b.x-r)/100);x<=Math.floor((b.x+r)/100);x++)for(let z=Math.floor((b.z-r)/100);z<=Math.floor((b.z+r)/100);z++){
      const cell=`${x}:${z}`;if(!index.has(cell))index.set(cell,[]);index.get(cell).push(b);
    }
  }
  for(const [key,batches] of tiles)for(let i=0;i<batches.length;i++)if(batches[i].p.length){
    const mesh=batches[i].mesh([...materials,roof,trim,foundation][i]);mesh.name=`Approach ${key} ${i}`;group.add(mesh);
  }
  for(const [key,batch] of details)if(batch.p.length){
    const mesh=batch.mesh(trim),center=mesh.geometry.boundingSphere.center.clone();
    mesh.geometry.translate(-center.x,-center.y,-center.z);
    const lod=new THREE.LOD();lod.name=`Window relief ${key}`;lod.position.copy(center);
    lod.addLevel(mesh,0);lod.addLevel(new THREE.Object3D(),1600,.15);group.add(lod);
  }
  world.approachBuildingExcludes=(x,z)=>{
    for(const b of index.get(`${Math.floor(x/100)}:${Math.floor(z/100)}`)||[]){
      const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
      if(Math.abs(dx*c+dz*s)<b.w/2+12&&Math.abs(-dx*s+dz*c)<b.d/2+12)return true;
    }return false;
  };
  const shadows=new THREE.Group();shadows.name='Approach building ground shadows';group.add(shadows);
  const shadowMat=new THREE.MeshBasicMaterial({color:0x131a21,transparent:true,opacity:.24,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  let shadowKey='';
  const updateShadows=()=>{
    shadows.visible=!world.night;
    shadowMat.opacity=world.hasDeck?.07:.24;
    if(world.night)return;
    const sun=world.sun.position.clone().sub(world.sun.target.position).normalize();
    const key=sun.toArray().map(v=>v.toFixed(3)).join(',');if(key===shadowKey)return;shadowKey=key;
    for(const mesh of [...shadows.children]){mesh.geometry.dispose();shadows.remove(mesh);}
    const batches=new Map();
    for(const b of buildings){
      const key=`${Math.floor(b.x/1000)}:${Math.floor(b.z/1000)}`;
      if(!batches.has(key))batches.set(key,new Batch());
      const batch=batches.get(key),dy=Math.max(.25,sun.y),dx=-sun.x/dy*b.height,dz=-sun.z/dy*b.height;
      // A conservative convex silhouette supplements the baked photographic shadow.
      const pts=b.outline.flatMap(([x,z])=>[[b.x+x,b.z+z],[b.x+x+dx,b.z+z+dz]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
      const half=list=>{const h=[];for(const p of list){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h;};
      const hull=half(pts).slice(0,-1).concat(half([...pts].reverse()).slice(0,-1));
      const v=p=>[p[0],ground(...p)+.13,p[1]];
      for(let i=1;i<hull.length-1;i++)batch.triangle(v(hull[0]),v(hull[i+1]),v(hull[i]),[[0,0],[0,0],[0,0]],white);
    }
    for(const batch of batches.values()){const mesh=batch.mesh(shadowMat);mesh.castShadow=false;mesh.receiveShadow=false;shadows.add(mesh);}
  };
  world.approachBuildings={group,count:buildings.length,materials,footprints:buildings,updateShadows};
  world.scene.add(group);
  updateShadows();
  for(const m of materials)m.emissiveIntensity=world.night?.55:0;
  if(world.sun.castShadow)world.sun.shadow.needsUpdate=true;
}
