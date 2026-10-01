// Forest stands tied to the orthophoto. Camera-facing, multi-view impostors
// replace crossed image planes. Seven authored forms across three CC0 species
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
  // One camera-facing quad eliminates the edge-on planes of the old crossed cards.
  const g=new THREE.BufferGeometry(),bottom=1-(1-margin)/rows,top=1-margin/rows;
  g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0],3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([0,bottom,1,bottom,0,top,1,top],2));
  g.setIndex([0,1,2,1,3,2]);return g;
}

export async function addWoodland(world,photo,approachPhoto) {
  const low=world.lowDetail||world.quality==='low';
  const response=await fetch(new URL('../../assets/scenery/tree-variety.json',import.meta.url));
  if(!response.ok)throw new Error(`Tree atlas: HTTP ${response.status}`);
  const atlas=await response.json();
  const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/scenery/tree-variety${low?'-low':''}.webp`,import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=world.maxAniso;
  const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.28,alphaToCoverage:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 treeUvOffset; attribute float treeYaw;
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;`)
      .replace('#include <project_vertex>',`
        vec3 treeCenter=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vec2 treeFacing=normalize(cameraPosition.xz-treeCenter.xz+vec2(.00001));
        vec3 treeRight=vec3(treeFacing.y,0.0,-treeFacing.x);
        vec3 treeWorld=treeCenter+treeRight*position.x*length(instanceMatrix[0].xyz)
          +vec3(0.0,position.y*length(instanceMatrix[1].xyz),0.0);
        vec4 mvPosition=viewMatrix*vec4(treeWorld,1.0);
        gl_Position=projectionMatrix*mvPosition;
        float treeView=mod((treeYaw-atan(treeFacing.x,treeFacing.y))/1.57079632679+treeUvOffset.x+8.0,4.0);
        vTreeViews=vec2(floor(treeView),mod(floor(treeView)+1.0,4.0));vTreeBlend=fract(treeView);
        vTreeUV=vec2(uv.x,uv.y+treeUvOffset.y);
      `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;`)
      .replace('#include <map_fragment>',`
        vec4 treeA=texture2D(map,vec2((vTreeViews.x+mix(.002,.998,vTreeUV.x))*.25,vTreeUV.y));
        vec4 treeB=texture2D(map,vec2((vTreeViews.y+mix(.002,.998,vTreeUV.x))*.25,vTreeUV.y));
        float treeAlpha=mix(treeA.a,treeB.a,vTreeBlend);
        vec3 treeColor=mix(treeA.rgb*treeA.a,treeB.rgb*treeB.a,vTreeBlend)/max(.001,treeAlpha);
        diffuseColor*=vec4(treeColor,treeAlpha);
      `);
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
    const crown=geometry.clone(),offsets=new Float32Array(trees.length*2),yaws=new Float32Array(trees.length);
    const fades=new THREE.InstancedBufferAttribute(new Float32Array(trees.length),1).setUsage(THREE.DynamicDrawUsage);
    crown.setAttribute('treeDetailFade',fades);
    const mesh=new THREE.InstancedMesh(crown,material,trees.length);
    const shadows=new THREE.InstancedMesh(contactGeo,contactMat,trees.length);
    trees.forEach((t,i)=>{
      offsets[i*2]=t.type;offsets[i*2+1]=-t.row/atlas.rows;yaws[i]=t.yaw;
      q.setFromAxisAngle(up,t.yaw);
      const y=sceneryGroundHeight(t.x,t.z,world.groundLowDetail);
      matrix.compose(new THREE.Vector3(t.x,y-.08,t.z),q,new THREE.Vector3(t.w,t.h,t.w));
      mesh.setMatrixAt(i,matrix);
      matrix.compose(new THREE.Vector3(t.x,y+.04,t.z),q,new THREE.Vector3(t.w*.75,1,t.w*.75));shadows.setMatrixAt(i,matrix);
      const tint=.83+rng()*.17,warm=rng(),color=new THREE.Color().setRGB(tint*(.94+warm*.1),tint,tint*(.88+warm*.1));mesh.setColorAt(i,color);
      if(!low)records.push({...t,id:records.length,y:y-.08,color,fade:fades,index:i});
    });
    crown.setAttribute('treeUvOffset',new THREE.InstancedBufferAttribute(offsets,2));
    crown.setAttribute('treeYaw',new THREE.InstancedBufferAttribute(yaws,1));
    mesh.computeBoundingSphere();shadows.computeBoundingSphere();group.add(mesh,shadows);
  }
  geometry.dispose();
  world.scene.add(group);world.woodland=group;world.woodlandMaterial=material;world.woodlandForms=forms;
  if(!low){
    let pending;
    world.loadNearTrees=()=>pending??=addNearTrees(world,records,atlas).catch(error=>world.assetErrors.push(String(error)));
    let lastCheck=-Infinity;
    world.requestNearTrees=eye=>{
      if(pending||world.time-lastCheck<2)return;lastCheck=world.time;
      if(records.some(t=>Math.hypot(t.x-eye.x,t.z-eye.z,t.y+t.h*.55-eye.y)<450))world.loadNearTrees();
    };
  }
}
