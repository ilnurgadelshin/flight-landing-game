// Forest stands tied to the orthophoto. Alpha-tested, multi-plane tree crowns
// replace opaque geometric blobs. Seven authored forms across three CC0 species
// retain their crown proportions, with understory clustered below the broadleaf canopy.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { sceneryGroundHeight } from './scenery-ground.js';
import { addNearTrees, treeFadeShader } from './near-trees.js';

function groveNoise(x,z) {
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}

function crownGeometry(rows,margin) {
  const positions=[],normals=[],uv=[],indices=[];
  // Three intersecting crown planes retain volume from side and oblique views.
  for(let j=0;j<3;j++){
    const a=j*Math.PI/3,dx=Math.cos(a)*.5,dz=Math.sin(a)*.5,b=j*4;
    positions.push(-dx,0,-dz,dx,0,dz,-dx,1,-dz,dx,1,dz);
    for(let k=0;k<4;k++)normals.push(Math.sin(a)*.4,.75,-Math.cos(a)*.4);
    const u=j/4+.0005,right=(j+1)/4-.0005,bottom=1-(1-margin)/rows,top=1-margin/rows;
    // Each crossed plane gets a different authored view. Crop the vertical margin
    // so every trunk meets the terrain; horizontal aspect comes from the bake.
    uv.push(u,bottom,right,bottom,u,top,right,top);
    indices.push(b,b+1,b+2,b+1,b+3,b+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return g;
}

export async function addWoodland(world,photo,approachPhoto) {
  const low=world.lowDetail||world.quality==='low';
  const response=await fetch(new URL('../../assets/scenery/tree-variety.json',import.meta.url));
  if(!response.ok)throw new Error(`Tree atlas: HTTP ${response.status}`);
  const atlas=await response.json();
  const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/scenery/tree-variety${low?'-low':''}.png`,import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=world.maxAniso;
  const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.28,alphaToCoverage:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 treeUvOffset;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv.x=(mod(floor(vMapUv.x*4.0)+treeUvOffset.x,4.0)+fract(vMapUv.x*4.0))*.25;\nvMapUv.y+=treeUvOffset.y;');
  };
  treeFadeShader(material,false);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(photo,0,0,1024,1024);
  const airportPixels=context.getImageData(0,0,1024,1024).data;
  context.drawImage(approachPhoto,0,0,1024,1024);
  const approachPixels=context.getImageData(0,0,1024,1024).data;
  const rng=makeRng(812),patches=new Map(),forms=Array(atlas.rows).fill(0);
  const limit=low?14000:52000;
  let count=0;
  for(let k=0;k<limit*30&&count<limit;k++){
    // Spend more of the fixed instance budget in the approach corridor. Dense
    // near stands read as woodland; distant photo coverage can carry fewer cards.
    const close=rng()<.65;
    const x=close?2000+rng()*8000:-3900+rng()*13800,z=(rng()-.5)*(close?4000:7800);
    if(Math.abs(x)<2100&&Math.abs(z-120)<700)continue;
    if(Math.abs(z)<180&&x>1500&&x<3400)continue;
    if(world.approachBuildingExcludes?.(x,z))continue;
    if(world.approachRoadExcludes?.(x,z))continue;
    const final=x>3900,pixels=final?approachPixels:airportPixels;
    const px=Math.floor(((x-(final?6000:0))/8000+.5)*1024),py=Math.floor((z/8000+.5)*1024),i=(py*1024+px)*4;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    // Dark, nearly neutral woodland; exclude brighter fields, blue shadows/water,
    // and brown ploughed ground. Adjacent crowns cluster in photographed stands.
    if(g<36||g>105||g<r*.94||g>b*1.7||b>g*1.08||r-g>8)continue;
    const grove=.75*groveNoise(x/380,z/380)+.25*groveNoise(x/110+9,z/110-3);
    if(grove<.53||rng()>Math.min(1,(grove-.53)*5))continue;
    // Mostly broadleaf woodland, with local groups of young pine/fir rather than
    // an alternating species pattern. Smaller saplings keep a believable scale.
    const conifer=groveNoise(x/170+27,z/170-19),choice=rng();
    const row=choice<(conifer>.56?.55:.22)?(rng()<.4?1:4)+Math.floor(rng()*3):0;
    const h=row===0?10+rng()*12:row<4?2.5+rng()*3.5:8+rng()*8;
    const w=Math.min(23.5,h*atlas.species[row].aspect*(.88+rng()*.24));
    const type=Math.floor(rng()*4),key=`${Math.floor(x/(low?2000:1000))}:${Math.floor(z/(low?2000:1000))}`;
    if(!patches.has(key))patches.set(key,[]);
    patches.get(key).push({x,z,type,row,h,w,yaw:rng()*Math.PI});forms[row]++;count++;
  }
  const group=new THREE.Group();group.name='Photographed woodland stands';
  const geometry=crownGeometry(atlas.rows,atlas.verticalMargin),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const contact=document.createElement('canvas');contact.width=contact.height=64;
  const g=contact.getContext('2d'),fade=g.createRadialGradient(32,32,3,32,32,32);
  fade.addColorStop(0,'rgba(0,0,0,.24)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,64,64);
  const contactMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contactGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const records=[];
  for(const trees of patches.values()){
    const crown=geometry.clone(),offsets=new Float32Array(trees.length*2);
    const fades=new THREE.InstancedBufferAttribute(new Float32Array(trees.length),1).setUsage(THREE.DynamicDrawUsage);
    crown.setAttribute('treeDetailFade',fades);
    const mesh=new THREE.InstancedMesh(crown,material,trees.length);
    const shadows=new THREE.InstancedMesh(contactGeo,contactMat,trees.length);
    trees.forEach((t,i)=>{
      offsets[i*2]=t.type;offsets[i*2+1]=-t.row/atlas.rows;
      q.setFromAxisAngle(up,t.yaw);
      const y=sceneryGroundHeight(t.x,t.z,low);
      matrix.compose(new THREE.Vector3(t.x,y-.08,t.z),q,new THREE.Vector3(t.w,t.h,t.w));
      mesh.setMatrixAt(i,matrix);
      matrix.compose(new THREE.Vector3(t.x,y+.04,t.z),q,new THREE.Vector3(t.w*.75,1,t.w*.75));shadows.setMatrixAt(i,matrix);
      const tint=.83+rng()*.17,warm=rng(),color=new THREE.Color().setRGB(tint*(.94+warm*.1),tint,tint*(.88+warm*.1));mesh.setColorAt(i,color);
      if(!low)records.push({...t,id:records.length,y:y-.08,color,fade:fades,index:i});
    });
    crown.setAttribute('treeUvOffset',new THREE.InstancedBufferAttribute(offsets,2));
    mesh.computeBoundingSphere();shadows.computeBoundingSphere();group.add(mesh,shadows);
  }
  geometry.dispose();
  world.scene.add(group);world.woodland=group;world.woodlandMaterial=material;world.woodlandForms=forms;
  if(!low)await addNearTrees(world,records,atlas);
}
