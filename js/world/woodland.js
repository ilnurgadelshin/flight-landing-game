// Forest stands tied to the orthophoto. Alpha-tested, multi-plane tree crowns
// replace opaque geometric blobs. The atlas is baked from a detailed CC0 broadleaf
// model; nearby views retain real branch silhouettes and interior gaps.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { TERRAIN } from '../physics/terrain.js';

function groveNoise(x,z) {
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}

function crownGeometry(type) {
  const positions=[],normals=[],uv=[],indices=[];
  // Three intersecting crown planes retain volume from side and oblique views.
  for(let j=0;j<3;j++){
    const a=j*Math.PI/3,dx=Math.cos(a)*.5,dz=Math.sin(a)*.5,b=j*4;
    positions.push(-dx,0,-dz,dx,0,dz,-dx,1,-dz,dx,1,dz);
    for(let k=0;k<4;k++)normals.push(Math.sin(a)*.4,.75,-Math.cos(a)*.4);
    const u=(type%2)/2,v=1-Math.floor(type/2)/2;
    // Crop the bake's transparent camera margin: the trunk must meet the ground.
    uv.push(u,v-.5+.02679,u+.5,v-.5+.02679,u,v-.02679,u+.5,v-.02679);
    indices.push(b,b+1,b+2,b+1,b+3,b+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return g;
}

export async function addWoodland(world,photo,approachPhoto) {
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../../assets/scenery/tree-canopies.png',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=world.maxAniso;
  const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.28,alphaToCoverage:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 treeUvOffset;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv+=treeUvOffset;');
  };
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(photo,0,0,1024,1024);
  const airportPixels=context.getImageData(0,0,1024,1024).data;
  context.drawImage(approachPhoto,0,0,1024,1024);
  const approachPixels=context.getImageData(0,0,1024,1024).data;
  const rng=makeRng(812),patches=new Map(),low=world.lowDetail||world.quality==='low';
  const limit=low?14000:52000;
  let count=0;
  for(let k=0;k<limit*30&&count<limit;k++){
    const x=-3900+rng()*13800,z=(rng()-.5)*7800;
    if(Math.abs(x)<2100&&Math.abs(z-120)<700)continue;
    if(Math.abs(z)<180&&x>1500&&x<3400)continue;
    const final=x>3900,pixels=final?approachPixels:airportPixels;
    const px=Math.floor(((x-(final?6000:0))/8000+.5)*1024),py=Math.floor((z/8000+.5)*1024),i=(py*1024+px)*4;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    // Dark, nearly neutral woodland; exclude brighter fields, blue shadows/water,
    // and brown ploughed ground. Adjacent crowns cluster in photographed stands.
    if(g<36||g>105||g<r*.94||g>b*1.7||b>g*1.08||r-g>8)continue;
    const grove=.75*groveNoise(x/380,z/380)+.25*groveNoise(x/110+9,z/110-3);
    if(grove<.53||rng()>Math.min(1,(grove-.53)*5))continue;
    const type=Math.floor(rng()*4),key=`${Math.floor(x/(low?2000:1000))}:${Math.floor(z/(low?2000:1000))}`;
    if(!patches.has(key))patches.set(key,[]);
    patches.get(key).push({x,z,type,h:11+rng()*10,w:15+rng()*8,yaw:rng()*Math.PI});count++;
  }
  const group=new THREE.Group();group.name='Photographed woodland stands';
  const geometry=crownGeometry(0),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const contact=document.createElement('canvas');contact.width=contact.height=64;
  const g=contact.getContext('2d'),fade=g.createRadialGradient(32,32,3,32,32,32);
  fade.addColorStop(0,'rgba(0,0,0,.24)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,64,64);
  const contactMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contactGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  for(const trees of patches.values()){
    const crown=geometry.clone(),offsets=new Float32Array(trees.length*2);
    const mesh=new THREE.InstancedMesh(crown,material,trees.length);
    const shadows=new THREE.InstancedMesh(contactGeo,contactMat,trees.length);
    trees.forEach((t,i)=>{
      offsets[i*2]=(t.type%2)/2;offsets[i*2+1]=-Math.floor(t.type/2)/2;
      q.setFromAxisAngle(up,t.yaw);
      matrix.compose(new THREE.Vector3(t.x,TERRAIN.heightAt(t.x,t.z)-.1,t.z),q,new THREE.Vector3(t.w,t.h,t.w));
      mesh.setMatrixAt(i,matrix);
      matrix.compose(new THREE.Vector3(t.x,TERRAIN.heightAt(t.x,t.z)+.04,t.z),q,new THREE.Vector3(t.w*.85,1,t.w*.85));shadows.setMatrixAt(i,matrix);
      const tint=.8+rng()*.2;mesh.setColorAt(i,new THREE.Color().setRGB(tint,tint,tint*.95));
    });
    crown.setAttribute('treeUvOffset',new THREE.InstancedBufferAttribute(offsets,2));
    mesh.computeBoundingSphere();shadows.computeBoundingSphere();group.add(mesh,shadows);
  }
  geometry.dispose();
  world.scene.add(group);world.woodland=group;world.woodlandMaterial=material;
}
