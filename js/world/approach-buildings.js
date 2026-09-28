// Offline, georegistered footprints; the roof styles and facades are interpretations.
// All batches are spatially bounded so most of the valley can be frustum-culled.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { sceneryGroundHeight } from './scenery-ground.js';
import { createFacadeAtlas } from './facade-atlas.js';
import { buildShadowMeshes } from './building-shadows.js';

function roofMaterial(aniso,metal=false) {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),rng=makeRng(592);
  g.fillStyle='#b5b5b5';g.fillRect(0,0,256,256);
  if(metal)for(let x=0;x<256;x+=43){
    g.fillStyle='#8e9390';g.fillRect(x,0,2,256);g.fillStyle='#d1d4cd';g.fillRect(x+2,0,1,256);
  }
  else for(let y=0;y<256;y+=16)for(let x=-32;x<256;x+=64){
    const v=158+Math.floor(rng()*40),xx=x+(y%32?32:0);
    g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(xx,y,63,15);
    g.fillStyle='rgba(0,0,0,.18)';g.fillRect(xx,y+14,64,2);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;
  return new THREE.MeshStandardMaterial({map:t,roughness:metal?.58:.92,metalness:metal?.25:0,vertexColors:true});
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
  const infill=fetch(new URL('../../assets/scenery/approach-infill.json',import.meta.url)).then(async r=>{
    if(!r.ok)throw new Error(`Approach infill: HTTP ${r.status}`);return r.json();
  });
  world.assetJobs.push(infill); // A missing supplement leaves the main footprints available.
  const response=await fetch(new URL('../../assets/scenery/approach-buildings.json',import.meta.url));
  if(!response.ok)throw new Error(`Approach buildings: HTTP ${response.status}`);
  const {buildings}=await response.json(),low=world.lowDetail||world.quality==='low';
  const extra=await infill.catch(()=>({buildings:[]}));buildings.push(...extra.buildings);
  const atlas=createFacadeAtlas(world.maxAniso,low),materials=[atlas.material],roof=roofMaterial(world.maxAniso),metalRoof=roofMaterial(world.maxAniso,true);
  const glass=new THREE.MeshStandardMaterial({map:atlas.material.map,emissiveMap:atlas.material.emissiveMap,
    emissive:0xffd3a0,emissiveIntensity:0,roughness:.24,metalness:.08,envMapIntensity:.7,vertexColors:true});
  materials.push(glass);
  const wallFill=new THREE.MeshStandardMaterial({roughness:.93,vertexColors:true});
  const trim=new THREE.MeshStandardMaterial({color:0xaca99e,roughness:.87,vertexColors:true});
  const foundation=new THREE.MeshStandardMaterial({color:0x77766e,roughness:1,vertexColors:true});
  const group=new THREE.Group();group.name='Georegistered approach buildings';
  const tiles=new Map(),details=new Map(),index=new Map(),profileCounts=Array(12).fill(0),rng=makeRng(9482),white=new THREE.Color(0xffffff);
  const ground=(x,z)=>sceneryGroundHeight(x,z,low);
  for(const b of buildings){
    const tile=low?2000:1000,key=`${Math.floor(b.x/tile)}:${Math.floor(b.z/tile)}`;
    if(!tiles.has(key))tiles.set(key,Array.from({length:6},()=>new Batch()));
    if(!low&&!details.has(key))details.set(key,{trim:new Batch(),glass:new Batch()});
    const batches=tiles.get(key),style=Math.floor(rng()*3),wall=batches[0],top=batches[b.roofKind==='metal'?5:1],edge=batches[2],base=batches[3],fill=batches[4];
    const farm=b.use==='farm'||b.w*b.d>300||Math.min(b.w,b.d)>18;
    const cos=Math.cos(b.angle),sin=Math.sin(b.angle),rise=b.pitched?Math.min(b.d*.27,b.height*.38,4):0;
    const floor=Math.max(...b.outline.map(([x,z])=>ground(b.x+x,b.z+z)))+.15;
    const eave=floor+Math.max(2.6,b.height-rise),roofY=v=>eave+rise*Math.max(0,1-Math.abs(v)/(b.d/2));
    let points=b.outline.map(([x,z])=>[x*cos+z*sin,-x*sin+z*cos]);
    if(THREE.ShapeUtils.isClockWise(points.map(p=>new THREE.Vector2(...p))))points.reverse();
    const wallPoints=points;
    const front=wallPoints.map((a,i)=>({i,length:Math.hypot(a[0]-wallPoints[(i+1)%wallPoints.length][0],a[1]-wallPoints[(i+1)%wallPoints.length][1])})).sort((a,b)=>b.length-a.length)[0].i;
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
    for(let i=0;i<wallPoints.length;i++){
      const a=wallPoints[i],p=wallPoints[(i+1)%wallPoints.length],len=Math.hypot(p[0]-a[0],p[1]-a[1]);
      if(len<.01)continue;
      const du=(p[0]-a[0])/len,dv=(p[1]-a[1])/len;
      const at=(along,y,out=0)=>vertex(a[0]+du*along+dv*out,a[1]+dv*along-du*out,y);
      const levels=farm?1:Math.max(1,Math.round((eave-floor)/2.8)),storey=(eave-floor)/levels;
      for(let level=0;level<levels;level++){
        const side=Math.abs(du)>.65?1:2;
        const ordinary=atlas.profiles[farm?(i===front?11:10):style*3+side];
        const bays=Math.max(1,Math.round(len/ordinary.width)),bayWidth=len/bays,y=floor+level*storey;
        for(let bay=0;bay<bays;bay++){
          // A building has one principal entry bay, not a front door every six metres.
          const entrance=i===front&&level===0&&bay===Math.floor(bays/2);
          const profile=entrance?atlas.profiles[farm?9:style*3]:ordinary;profileCounts[profile.id]++;
          const x=bay*bayWidth;
          wall.quad(at(x,y),at(x,y+storey),at(x+bayWidth,y+storey),at(x+bayWidth,y),
            [[0,0],[0,1],[1,1],[1,0]].map(([u,v])=>atlas.uv(profile,u,v)),tint);
          if(!low&&b.x>1800&&Math.abs(b.z)<1500&&b.w<90&&b.height<15){
            const detail=details.get(key).trim,glazing=details.get(key).glass,sx=bayWidth/profile.width,sy=storey/profile.height;
            for(const opening of profile.windows){
              const left=x+opening.x*sx,right=left+opening.w*sx,bottom=y+opening.y*sy,top=bottom+opening.h*sy;
              const paneUV=[[opening.x,opening.y],[opening.x,opening.y+opening.h],[opening.x+opening.w,opening.y+opening.h],[opening.x+opening.w,opening.y]].map(([u,v])=>atlas.uv(profile,u/profile.width,v/profile.height));
              glazing.quad(at(left,bottom,.025),at(left,top,.025),at(right,top,.025),at(right,bottom,.025),paneUV,white);
              const uv=[[0,0],[0,1],[1,1],[1,0]];
              // Raised surrounds put the reflecting pane behind a real bevel.
              for(const [a,b,c,d] of [
                [[left-.08,bottom-.08,.14],[left-.08,top+.08,.14],[left,top,.025],[left,bottom,.025]],
                [[right,bottom,.025],[right,top,.025],[right+.08,top+.08,.14],[right+.08,bottom-.08,.14]],
                [[left,top,.025],[left-.08,top+.08,.14],[right+.08,top+.08,.14],[right,top,.025]],
                [[left-.08,bottom-.08,.14],[left,bottom,.025],[right,bottom,.025],[right+.08,bottom-.08,.14]]])detail.quad(at(...a),at(...b),at(...c),at(...d),uv,white);
              for(const h of [y+opening.y*sy,y+(opening.y+opening.h)*sy]){
                const uv=[[0,0],[0,1],[1,1],[1,0]];
                detail.quad(at(left-.06,h,.01),at(right+.06,h,.01),at(right+.06,h,.14),at(left-.06,h,.14),uv,white);
                detail.quad(at(left-.06,h-.06,.14),at(left-.06,h,.14),at(right+.06,h,.14),at(right+.06,h-.06,.14),uv,white);
              }
            }
            if(entrance&&!farm)for(const door of profile.doors){
              const left=x+door.x*sx-.2,right=left+door.w*sx+.4,top=y+door.h*sy+.22,uv=[[0,0],[0,1],[1,1],[1,0]];
              // A small lintel canopy and threshold establish the entry's depth.
              detail.quad(at(left,top,.02),at(right,top,.02),at(right,top,.7),at(left,top,.7),uv,white);
              detail.quad(at(left,top-.1,.7),at(left,top,.7),at(right,top,.7),at(right,top-.1,.7),uv,white);
              detail.quad(at(left,y+.05,0),at(right,y+.05,0),at(right,y+.05,.45),at(left,y+.05,.45),uv,white);
            }
          }
        }
      }
      // Gable ends remain solid siding: windows cannot climb into the roof ridge.
      const breaks=[0,len];
      if(a[1]*p[1]<0)breaks.splice(1,0,-a[1]/(p[1]-a[1])*len);
      const fillTint=new THREE.Color(atlas.profiles[farm?9:style*3].color).multiply(tint);
      for(let j=0;j<breaks.length-1;j++){
        const x=breaks[j],end=breaks[j+1],ya=roofY(a[1]+dv*x),yb=roofY(a[1]+dv*end);
        if(ya>eave+.001||yb>eave+.001)fill.quad(at(x,eave),at(x,ya),at(end,yb),at(end,eave),[[0,0],[0,1],[1,1],[1,0]],fillTint);
      }
      const va=vertex(...a,floor),vb=vertex(...p,floor);
      base.quad([va[0],ground(va[0],va[2])-.4,va[2]],va,vb,[vb[0],ground(vb[0],vb[2])-.4,vb[2]],[[0,0],[0,1],[1,1],[1,0]],white);
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
    const mesh=batches[i].mesh([atlas.material,roof,trim,foundation,wallFill,metalRoof][i]);mesh.name=`Approach ${key} ${i}`;mesh.userData.sceneryPart=i===1||i===5?'roof':'wall';group.add(mesh);
  }
  for(const [key,batches] of details)for(const [kind,batch] of Object.entries(batches))if(batch.p.length){
    const mesh=batch.mesh(kind==='glass'?glass:trim),center=mesh.geometry.boundingSphere.center.clone();
    mesh.userData.sceneryPart=kind==='glass'?'window':'relief';
    mesh.geometry.translate(-center.x,-center.y,-center.z);
    const lod=new THREE.LOD();lod.name=`Window ${kind} ${key}`;lod.position.copy(center);
    lod.addLevel(mesh,0);lod.addLevel(new THREE.Object3D(),kind==='glass'?650:1200,.15);group.add(lod);
  }
  world.approachBuildingExcludes=(x,z)=>{
    for(const b of index.get(`${Math.floor(x/100)}:${Math.floor(z/100)}`)||[]){
      const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
      if(Math.abs(dx*c+dz*s)<b.w/2+12&&Math.abs(-dx*s+dz*c)<b.d/2+12)return true;
    }return false;
  };
  const shadows=new THREE.Group();shadows.name='Approach building ground shadows';group.add(shadows);
  const shadowMat=new THREE.MeshBasicMaterial({color:0x131a21,transparent:true,opacity:.19,vertexColors:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  let shadowKey='';
  const updateShadows=()=>{
    shadows.visible=!world.night;
    shadowMat.opacity=world.hasDeck?.035:.19;
    if(world.night)return;
    const sun=world.sun.position.clone().sub(world.sun.target.position).normalize();
    const key=sun.toArray().map(v=>v.toFixed(3)).join(',');if(key===shadowKey)return;shadowKey=key;
    for(const mesh of [...shadows.children]){mesh.geometry.dispose();shadows.remove(mesh);}
    shadows.add(...buildShadowMeshes(buildings,sun,ground,shadowMat));
  };
  world.approachBuildings={group,shadows,count:buildings.length,infillCount:extra.buildings.length,materials,footprints:buildings,profileCounts,updateShadows};
  world.scene.add(group);
  updateShadows();
  for(const m of materials)m.emissiveIntensity=world.night?.55:0;
  if(world.sun.castShadow)world.sun.shadow.needsUpdate=true;
}
