// Original, imagery-registered grounds for the farm's neighboring roadside cluster.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {sceneryGroundHeight,protectedScenery} from './scenery-ground.js';

function segmentDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function siteDistance(x,z,polygon){
 let inside=false,d=Infinity;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];d=Math.min(d,segmentDistance(x,z,a,b));
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside?d:-d;
}
export function siteCoverage(data,x,z,kind){
 let distance=Math.max(-Infinity,...data[kind].map(p=>siteDistance(x,z,p)));
 const paths=kind==='gravel'?data.paths:kind==='roads'?data.streets:[];
 for(const path of paths)for(let i=1;i<path.points.length;i++)
  distance=Math.max(distance,path.width/2-segmentDistance(x,z,path.points[i-1],path.points[i]));
 return distance;
}
// A narrow road needs only a terrain-following ribbon, not a parcel-sized grid.
// Shared cross-sections keep bends joined; the outer strips feather into imagery.
function roadGeometry(data,ground){
 const positions=[],uv=[],colors=[],alphas=[],indices=[],gravel=data.roadSurface==='gravel';
 for(const path of data.streets){
  const points=path.points,segments=points.slice(1).map((b,i)=>{
   const a=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return {length,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length};
  });
  const total=segments.reduce((sum,s)=>sum+s.length,0);let distance=0,previous;
  const crossSection=(i)=>{
   const a=segments[Math.max(0,i-1)],b=segments[Math.min(i,segments.length-1)],nx=-(a.dz+b.dz),nz=a.dx+b.dx;
   const projection=nx*-b.dz+nz*b.dx;return [nx/projection,nz/projection];
  };
  for(let i=0;i<segments.length;i++){
   const a=points[i],segment=segments[i],count=Math.ceil(segment.length/1.2),n0=crossSection(i),n1=crossSection(i+1);
   for(let k=i?1:0;k<=count;k++){
    const t=k/count,cx=a[0]+segment.dx*segment.length*t,cz=a[1]+segment.dz*segment.length*t;
    const nx=THREE.MathUtils.lerp(n0[0],n1[0],t),nz=THREE.MathUtils.lerp(n0[1],n1[1],t),base=alphas.length;
    const fade=THREE.MathUtils.smoothstep(Math.min(distance+t*segment.length,total-distance-t*segment.length),0,5);
    const sections=gravel?[[-path.width/2-.85,0],[-path.width/2+.35,1],[-.8,1],[0,1],[.8,1],[path.width/2-.35,1],[path.width/2+.85,0]]:
     [[-path.width/2-.85,0],[-path.width/2+.35,1],[path.width/2-.35,1],[path.width/2+.85,0]];
    for(const [offset,alpha] of sections){
     const x=cx+nx*offset,z=cz+nz*offset,variation=1+.065*Math.sin(x*.17+Math.sin(z*.23))+.035*Math.cos(z*.45+x*.12);
     positions.push(x,ground(x,z)+.10,z);uv.push(x/2.3,z/2.3);
     const wear=gravel?1-.18*Math.exp(-Math.pow((Math.abs(offset)-.8)/.35,2)):1;
     const tone=gravel?[.34,.35,.35]:[.105,.11,.108];colors.push(...tone.map(v=>v*variation*wear));
     alphas.push(protectedScenery(x,z,16)?0:alpha*fade);
    }
    if(previous!==undefined)for(let j=0;j<sections.length-1;j++)indices.push(previous+j,previous+j+1,base+j,previous+j+1,base+j+1,base+j);
    previous=base;
   }
   distance+=segment.length;
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);
 for(const [name,array,size] of [['position',positions,3],['uv',uv,2],['color',colors,3],['siteAlpha',alphas,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
function surfaceGeometry(data,kind,ground){
 if(kind==='roads')return roadGeometry(data,ground);
 const polygons=data[kind],paths=kind==='gravel'?data.paths:kind==='roads'?data.streets:[],all=polygons.flat().concat(paths.flatMap(p=>p.points));
 const minX=Math.min(...all.map(p=>p[0]))-5,minZ=Math.min(...all.map(p=>p[1]))-5;
 const step=kind==='roads'?.65:kind==='gravel'?1:1.5,nx=Math.ceil((Math.max(...all.map(p=>p[0]))+5-minX)/step),nz=Math.ceil((Math.max(...all.map(p=>p[1]))+5-minZ)/step);
 const positions=[],uv=[],colors=[],alphas=[],indices=[],lawn=kind==='lawns',rural=data.roadSurface==='gravel';
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const x=minX+i*step,z=minZ+j*step,d=siteCoverage(data,x,z,kind);
  const edge=rural?(Math.sin(x*1.3+Math.cos(z*.8))*Math.cos(z*1.7)*.24):0;
  const alpha=protectedScenery(x,z,16)?0:THREE.MathUtils.smoothstep(d+edge+(lawn?0:.3),lawn?-1.8:-.55,lawn?(rural?6:3.5):.65);
  positions.push(x,ground(x,z)+(lawn?.016:kind==='roads'?.10:.026),z);uv.push(x/(lawn?5:2.3),z/(lawn?5:2.3));alphas.push(alpha);
  const variation=1+.065*Math.sin(x*.17+Math.sin(z*.23))+.035*Math.cos(z*.45+x*.12);
  if(lawn){const mowing=1+.025*Math.sin((x*.85+z*.52)*Math.PI/3.5);colors.push(.115*variation*mowing,.145*variation*mowing,.060*variation*mowing);}
  else if(kind==='roads')colors.push(.105*variation,.11*variation,.108*variation);
  else {
   // Wheel-worn access, darker foundation margins and broad mottling break up yards.
   let track=0;for(const path of data.paths)for(let k=1;k<path.points.length;k++){const d=segmentDistance(x,z,path.points[k-1],path.points[k]);track=Math.max(track,Math.exp(-Math.pow((d-.9)/.4,2)));}
   const patches=rural?.045*Math.sin(x*.24+Math.sin(z*.31))*Math.cos(z*.18)+.025*Math.sin(x*.83+z*.61):0;
   const tone=(.34+patches+.025*Math.sin(x*.38+Math.sin(z*.19))-.035*track)*variation;
   colors.push(tone,tone*(rural?1.03:.97),tone*(rural?1.03:.91));
  }
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if([a,b,c,d].every(k=>alphas[k]===0))continue;
  indices.push(a,c,b,b,c,d);
 }
 // Discard unused grid vertices outside the irregular parcels before uploading.
 const used=[...new Set(indices)],remap=new Map(used.map((old,i)=>[old,i]));
 const geometry=new THREE.BufferGeometry();geometry.setIndex(indices.map(i=>remap.get(i)));
 for(const [name,array,size] of [['position',positions,3],['uv',uv,2],['color',colors,3],['siteAlpha',alphas,1]]){
  const packed=new Float32Array(used.length*size);used.forEach((old,i)=>{for(let k=0;k<size;k++)packed[i*size+k]=array[old*size+k];});
  geometry.setAttribute(name,new THREE.BufferAttribute(packed,size));
 }
 geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function buildValleySite(world,data,gravelMaterial,woodMaterial){
 const ground=(x,z)=>sceneryGroundHeight(x,z,world.groundLowDetail),group=new THREE.Group();group.name=data.name||'Valley roadside grounds';let triangles=0;
 const lawn=new THREE.MeshStandardMaterial({roughness:1,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 lawn.onBeforeCompile=shader=>{
  // The shared hook binds the atmosphere's uniforms, which every fogged material's haze reads;
  // without it the lawns went black in fog (the haze's sky terms were all zero).
  THREE.Material.prototype.onBeforeCompile.call(lawn,shader);
  shader.uniforms.uSiteGrass=world.groundUniforms.uGrass;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float siteAlpha;varying float vSiteAlpha;varying vec2 vSiteUV;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSiteAlpha=siteAlpha;vSiteUV=uv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSiteAlpha;varying vec2 vSiteUV;uniform sampler2D uSiteGrass;')
   .replace('#include <map_fragment>',`vec3 grassA=texture2D(uSiteGrass,vSiteUV).rgb;
    vec3 grassB=texture2D(uSiteGrass,mat2(.8,-.6,.6,.8)*vSiteUV*.63+vec2(.37,.61)).rgb;
    float grain=clamp(dot(mix(grassA,grassB,.5),vec3(.25,.5,.25))*7.5,.65,1.35);
    diffuseColor.rgb*=mix(1.0,grain,.23);`)
   .replace('#include <alphamap_fragment>','diffuseColor.a*=vSiteAlpha;if(diffuseColor.a<.005)discard;');
 };
 lawn.customProgramCacheKey=()=> 'valley-lawn-v2';
 const roadMaterial=data.roadSurface==='gravel'?gravelMaterial:new THREE.MeshStandardMaterial({roughness:.97,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 if(roadMaterial!==gravelMaterial){roadMaterial.onBeforeCompile=gravelMaterial.onBeforeCompile;roadMaterial.customProgramCacheKey=()=> 'valley-road-v1';}
 for(const kind of ['lawns','gravel','roads']){
  const geometry=surfaceGeometry(data,kind,ground),mesh=new THREE.Mesh(geometry,kind==='lawns'?lawn:kind==='roads'?roadMaterial:gravelMaterial);
  mesh.name='Roadside '+kind;mesh.receiveShadow=true;mesh.renderOrder=kind==='lawns'?-2:kind==='roads'?0:-1;mesh.userData.sceneryPart='site-ground';group.add(mesh);triangles+=geometry.index.count/3;
 }
 // Low timber boundaries follow the same terrain as the surfaces, including sloping runs.
 const parts=[],cube=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
 for(const line of data.fences)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/2.2),dx=(b[0]-a[0])/n,dz=(b[1]-a[1])/n;
  for(let k=0;k<=n;k++){
   const x=a[0]+dx*k,z=a[1]+dz*k;matrix.compose(new THREE.Vector3(x,ground(x,z)+.55,z),new THREE.Quaternion(),new THREE.Vector3(.12,1.15,.12));parts.push(cube.clone().applyMatrix4(matrix));
   if(k===n)continue;
   const x1=x+dx,z1=z+dz,y0=ground(x,z),y1=ground(x1,z1),direction=new THREE.Vector3(dx,y1-y0,dz);
   rotation.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.clone().normalize());
   for(const h of [.42,.86]){matrix.compose(new THREE.Vector3((x+x1)/2,(y0+y1)/2+h,(z+z1)/2),rotation,new THREE.Vector3(direction.length(),.11,.065));parts.push(cube.clone().applyMatrix4(matrix));}
  }
 }
 cube.dispose();const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());geometry.computeBoundingSphere();
 const fences=new THREE.Mesh(geometry,woodMaterial);fences.name='Roadside timber boundaries';fences.castShadow=fences.receiveShadow=true;group.add(fences);triangles+=geometry.index.count/3;
 const points=[...data.lawns.flat(),...data.gravel.flat(),...data.streets.flatMap(p=>p.points)],xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 const bounds=[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8];
 const within=(x,z)=>x>bounds[0]&&x<bounds[1]&&z>bounds[2]&&z<bounds[3];
 return {group,triangles,roadMaterial:roadMaterial===gravelMaterial?null:roadMaterial,trees:data.trees,roadExcludes:(x,z)=>within(x,z)&&siteCoverage(data,x,z,'roads')>-6,
  excludes:(x,z)=>within(x,z)&&(siteCoverage(data,x,z,'lawns')>-3||siteCoverage(data,x,z,'gravel')>-4||siteCoverage(data,x,z,'roads')>-7)};
}
