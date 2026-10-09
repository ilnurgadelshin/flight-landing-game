// Complete, originally authored approach sites on registered building footprints.
// The delivered GLBs replace whole buildings; the optional site has a procedural fallback.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {sceneryGroundHeight} from './scenery-ground.js';
import {buildValleySite} from './valley-site.js';

const YARD=[[2474,283],[2498,278],[2507,284],[2513,302],[2508,320],[2500,345],[2480,348],[2472,330],[2458,318],[2457,300],[2468,291]];
const DRIVE=[[2492,288],[2497,273],[2495,266],[2489,260],[2495,256],[2503,269],[2505,283],[2503,291]];
function signedDistance(x,z,polygon){
 let inside=false,distance=Infinity;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return distance*(inside?1:-1);
}
function yardGeometry(ground,buildings){
 const p=[],uv=[],alpha=[],colors=[],indices=[],step=1.5,nx=42,nz=66;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const x=2453+i*step,z=254+j*step;
  const d=Math.max(signedDistance(x,z,YARD),signedDistance(x,z,DRIVE));
  const noise=Math.sin(x*1.7+Math.cos(z*.8))*Math.cos(z*2.3)*.24;
  alpha.push(Math.max(0,Math.min(1,(d+noise+.7)/1.9)));
  p.push(x,ground(x,z)+.022,z);uv.push((x-2453)/2.3,(z-254)/2.3);
  // Broad wheel-worn lanes and irregular tonal variation without image-baked shadows.
  const tracks=Math.exp(-Math.pow((x-2504-Math.sin(z*.09)*1.2)/.55,2))+Math.exp(-Math.pow((x-2501-Math.sin(z*.09)*1.2)/.55,2));
  let contact=1;
  for(const b of buildings){
   const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
   const distance=Math.hypot(Math.max(0,Math.abs(dx*c+dz*s)-b.w/2),Math.max(0,Math.abs(-dx*s+dz*c)-b.d/2));
   contact=Math.min(contact,.70+.30*Math.min(1,distance/1.5));
  }
  const tone=(.52+.065*Math.sin(x*.23+Math.sin(z*.18))*Math.cos(z*.25)+.025*Math.sin(x*.72+z*.43)-.09*tracks)*contact;
  colors.push(tone,tone*.98,tone*.93);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
  if([a,b,c,d].every(k=>alpha[k]===0))continue;
  indices.push(a,c,b,b,c,d);
 }
 const g=new THREE.BufferGeometry();g.setIndex(indices);
 for(const [name,array,size] of [['position',p,3],['uv',uv,2],['siteAlpha',alpha,1],['color',colors,3]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
 g.computeVertexNormals();g.computeBoundingSphere();return g;
}

export async function loadValleyFarm(world,buildings){
 const low=world.lowDetail||world.quality==='low',suffix=low?'-low':'';
 const url=name=>new URL(`../../assets/scenery/${name}`,import.meta.url).href;
 const response=await fetch(url('farm-sources.json'));
 if(!response.ok)throw new Error(`Valley farm manifest: HTTP ${response.status}`);
 const manifest=await response.json();
 const siteResponse=await fetch(url('valley-site.json'));
 if(!siteResponse.ok)throw new Error(`Valley site: HTTP ${siteResponse.status}`);
 const siteData=await siteResponse.json();
 // A missing extension retains the original complete valley site; only the new
 // sites fall back to their registered procedural buildings and photographic ground.
 const extension=await fetch(url('approach-sites.json')).then(async r=>{
  if(!r.ok)throw new Error(`Approach sites: HTTP ${r.status}`);
  const data=await r.json();
  if(!Array.isArray(data.sites)||data.sites.some(site=>!site.id||
   !['lawns','gravel','roads','streets','paths','fences','trees'].every(key=>Array.isArray(site[key]))))
   throw new Error('Approach sites: invalid site data');
  return data;
 }).catch(error=>{world.assetErrors.push(String(error));return {sites:[]};});
 const model=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url(`valley-farm${suffix}.glb`))).scene;
 const textures=[];
 try{
  const maps=await Promise.allSettled(['color','normal','rough'].map(async name=>{
   const texture=await new THREE.TextureLoader().loadAsync(url(`farm-gravel-${name}${suffix}.webp`));textures.push(texture);
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=world.maxAniso;
   if(name==='color')texture.colorSpace=THREE.SRGBColorSpace;
   return texture;
  }));
  if(maps.some(r=>r.status==='rejected'))throw new Error('Valley farm yard material unavailable');
  const ground=(x,z)=>sceneryGroundHeight(x,z,world.groundLowDetail),replaces=new Set(),batches=new Map(),glass=[];
  model.updateMatrixWorld(true);
  for(const placement of manifest.placements){
   const cluster=placement.cluster||'valley';
   if(cluster!=='valley'&&!extension.sites.some(site=>site.id===cluster))continue;
   if(!batches.has(cluster))batches.set(cluster,new Map());
   const clusterBatches=batches.get(cluster);
   const b=buildings.find(b=>Math.abs(b.x-placement.x)<.1&&Math.abs(b.z-placement.z)<.1);
   const source=model.getObjectByName(placement.id);
   if(!b||!source)throw new Error(`Valley farm placement missing: ${placement.id}`);
   replaces.add(b);
   const floor=Math.max(...b.outline.map(([x,z])=>ground(b.x+x,b.z+z)))+.15;
   const transform=new THREE.Matrix4().makeRotationY(-b.angle).setPosition(b.x,floor,b.z);
   source.traverse(o=>{
    if(!o.isMesh)return;
    // Quantized source attributes must be decoded before metre-scale world transforms.
    const g=new THREE.BufferGeometry();g.setIndex(o.geometry.index.clone());
    for(const name of ['position','normal','uv']){
     const a=o.geometry.attributes[name];if(!a)continue;
     const values=new Float32Array(a.count*a.itemSize);
     for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(i,k);
     g.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
    }
    g.applyMatrix4(o.matrixWorld).applyMatrix4(transform);
    const mat=o.material;
    for(const value of Object.values(mat))if(value?.isTexture)value.anisotropy=world.maxAniso;
    if(/glazing/.test(mat.name)){mat.emissive.set(0xffcf86);mat.emissiveIntensity=0;if(!glass.includes(mat))glass.push(mat);}
    if(!clusterBatches.has(mat))clusterBatches.set(mat,[]);clusterBatches.get(mat).push(g);
   });
  }
  const group=new THREE.Group();group.name='Authored valley farm';let triangles=0,batchCount=0;
  for(const [cluster,clusterBatches] of batches){
   const buildingsGroup=new THREE.Group();buildingsGroup.name='Complete buildings '+cluster;group.add(buildingsGroup);
   for(const [material,parts] of clusterBatches){
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.sceneryPart='authored-farm';
    mesh.name=cluster+' '+material.name;triangles+=geometry.index.count/3;buildingsGroup.add(mesh);batchCount++;
   }
  }
  const yardMaterial=new THREE.MeshStandardMaterial({map:maps[0].value,normalMap:maps[1].value,roughnessMap:maps[2].value,
   normalScale:new THREE.Vector2(.55,.55),roughness:1,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  yardMaterial.onBeforeCompile=shader=>{
   THREE.Material.prototype.onBeforeCompile.call(yardMaterial,shader);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float siteAlpha;varying float vSiteAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSiteAlpha=siteAlpha;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSiteAlpha;').replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=smoothstep(0.,1.,vSiteAlpha);if(diffuseColor.a<.005)discard;');
  };
  yardMaterial.customProgramCacheKey=()=> 'valley-yard-v1';
  const yard=new THREE.Mesh(yardGeometry(ground,replaces),yardMaterial);yard.name='Valley farm gravel yard';yard.receiveShadow=true;yard.renderOrder=-1;yard.userData.sceneryPart='farm-yard';group.add(yard);
  const wood=[...batches.values()].flatMap(batch=>[...batch.keys()]).find(m=>m.name.startsWith('Weathered timber'));
  const sites=[siteData,...extension.sites].map(data=>buildValleySite(world,data,yardMaterial,wood));
  for(const site of sites)group.add(site.group);
  const site={roadMaterial:sites[0].roadMaterial,trees:sites.flatMap(s=>s.trees),
   excludes:(x,z)=>sites.some(s=>s.excludes(x,z)),roadExcludes:(x,z)=>sites.some(s=>s.roadExcludes(x,z))};
  const sourceGeometry=new Set();model.traverse(o=>{if(o.isMesh)sourceGeometry.add(o.geometry);});sourceGeometry.forEach(g=>g.dispose());
  // Update projected shadows only after the whole replacement has succeeded.
  // Failed optional assets must leave the procedural buildings unchanged.
  for(const b of replaces)b.height=manifest.placements.find(p=>Math.abs(b.x-p.x)<.1&&Math.abs(b.z-p.z)<.1).height;
  return {group,replaces,site,materials:glass,stats:{buildings:replaces.size,triangles,yardTriangles:yard.geometry.index.count/3,batches:batchCount+1+sites.length*4,sites:sites.length,siteTriangles:sites.reduce((n,s)=>n+s.triangles,0),low}};
 }catch(error){
  const geometries=new Set(),materials=new Set();model.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
  for(const g of geometries)g.dispose();for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.push(v);m.dispose();}
  for(const t of new Set(textures))t.dispose();throw error;
 }
}
