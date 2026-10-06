// Forest stands tied to the orthophoto. Camera-facing, multi-view impostors
// replace crossed image planes. Nine authored forms across five CC0 sources
// retain their crown proportions, with understory clustered below the broadleaf canopy.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { sceneryGroundHeight,protectedScenery } from './scenery-ground.js';
import { addNearTrees, treeFadeShader } from './near-trees.js';

function groveNoise(x,z) {
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}

function crownGeometry() {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,-.5,.5,0,.5,.5,0],3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
  // Vertex shader lifts the centre and rotates the billboard in pitch. Include
  // its padded frame in CPU culling bounds, including the narrow conifer forms.
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.5,0),2);
  g.setIndex([0,1,2,1,3,2]);return g;
}

export async function addWoodland(world,photo,approachPhoto) {
  const low=world.lowDetail||world.quality==='low';
  const response=await fetch(new URL('../../assets/scenery/tree-variety.json',import.meta.url));
  if(!response.ok)throw new Error(`Tree atlas: HTTP ${response.status}`);
  const atlas=await response.json();
  const columns=atlas.columns,azimuthStep=2*Math.PI/columns;
  const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/scenery/tree-variety${low?'-low':''}.webp`,import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=world.maxAniso;
  const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.28,alphaToCoverage:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 treeUvOffset; attribute float treeYaw; attribute vec2 treeFrame;
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;
      varying float vTreeElevation; varying float vTreeRow;`)
      .replace('#include <project_vertex>',`
        vec3 treeCenter=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float treeHeight=length(instanceMatrix[1].xyz);
        float treeWidth=length(instanceMatrix[0].xyz)/treeFrame.y;
        treeCenter.y+=treeHeight*.5;
        vec3 treeToEye=cameraPosition-treeCenter;
        vec2 treeFacing=normalize(treeToEye.xz+vec2(.00001));
        float treePitch=clamp(atan(treeToEye.y,max(length(treeToEye.xz),.0001)),0.0,1.57079632679);
        vec3 treeRight=vec3(treeFacing.y,0.0,-treeFacing.x);
        vec3 treeUp=vec3(-treeFacing.x*sin(treePitch),cos(treePitch),-treeFacing.y*sin(treePitch));
        vec3 treeWorld=treeCenter+treeRight*position.x*treeWidth*treeFrame.x
          +treeUp*position.y*mix(treeHeight,treeWidth,pow(sin(treePitch),2.0))*treeFrame.x;
        vec4 mvPosition=viewMatrix*vec4(treeWorld,1.0);
        gl_Position=projectionMatrix*mvPosition;
        float treeView=mod((treeYaw-atan(treeFacing.x,treeFacing.y))/${azimuthStep}+treeUvOffset.x*${columns/4}.0+${columns*2}.0,${columns}.0);
        vTreeViews=vec2(floor(treeView),mod(floor(treeView)+1.0,${columns}.0));vTreeBlend=fract(treeView);
        vTreeUV=uv;vTreeRow=treeUvOffset.y;vTreeElevation=treePitch/0.785398163397;
      `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;
      varying float vTreeElevation; varying float vTreeRow;`)
      .replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
      vec4 treeTexel(float view,float elevation){
        vec2 tileUV=mix(vec2(.004),vec2(.996),vTreeUV);
        return texture2D(map,vec2((view+tileUV.x)/${columns}.0,(${atlas.rows*3-1}.0-vTreeRow*3.0-elevation+tileUV.y)/${atlas.rows*3}.0));
      }
      vec4 treePremultiplied(vec4 c){return vec4(c.rgb*c.a,c.a);}`)
      .replace('#include <map_fragment>',`
        float treeLower=floor(vTreeElevation),treeUpper=min(2.0,treeLower+1.0);
        vec4 treeA=mix(treePremultiplied(treeTexel(vTreeViews.x,treeLower)),treePremultiplied(treeTexel(vTreeViews.y,treeLower)),vTreeBlend);
        vec4 treeB=mix(treePremultiplied(treeTexel(vTreeViews.x,treeUpper)),treePremultiplied(treeTexel(vTreeViews.y,treeUpper)),vTreeBlend);
        vec4 treeColor=mix(treeA,treeB,fract(vTreeElevation));
        diffuseColor*=vec4(treeColor.rgb/max(.001,treeColor.a),treeColor.a);
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
  const corridor=world.approachCorridor,localTrees=[],localRng=makeRng(94051);
  // In the reviewed corridor, plant continuous canopy from the same land-cover
  // boundaries used by the ground. Jittered spacing avoids clumps and bare gaps.
  // Reserve part of the EXISTING instance budget, rather than adding a new layer.
  if(corridor){
    const [x0,z0,width,depth]=corridor.manifest.bounds;
    // Keep the existing close canopy density. Higher parts of final can use
    // wider stand spacing, conserving the same overall tree-instance budget.
    for(let xx=x0;xx<x0+width;){
      const spacing=xx<4100?(low?14:9.5):(low?23:16);
      for(let zz=z0;zz<z0+depth;zz+=spacing){
        const x=xx+(localRng()-.5)*spacing*.8,z=zz+(localRng()-.5)*spacing*.8;
        const cover=corridor.sample(x,z),weight=cover[2];
        if(weight<.15||cover[0]+cover[1]>.35||localRng()>Math.min(1,weight*1.6))continue;
        if(protectedScenery(x,z,14)||world.approachBuildingExcludes?.(x,z)||world.approachRoadExcludes?.(x,z))continue;
        const stand=groveNoise(x/95+4,z/95-7),choice=localRng();
        const species=localRng();
        const row=choice<.07?4+Math.floor(localRng()*3):choice<.12?1+Math.floor(localRng()*3):species<.2+stand*.25?7:species<.68+stand*.12?0:8;
        const edge=.76+.24*weight;
        const h=(row===0?14+localRng()*7:row===7?16+localRng()*7:row===8?12+localRng()*6:row<4?3+localRng()*3:10+localRng()*5)*edge;
        const w=Math.min(24,h*atlas.species[row].aspect*(.94+localRng()*.14));
        localTrees.push({x,z,type:Math.floor(localRng()*4),row,h,w,yaw:localRng()*Math.PI});
      }
      xx+=spacing;
    }
    // Uniform thinning if future boundary edits exceed this site's allocation.
    for(let i=localTrees.length-1;i>0;i--){const j=Math.floor(localRng()*(i+1));[localTrees[i],localTrees[j]]=[localTrees[j],localTrees[i]];}
    localTrees.length=Math.min(localTrees.length,low?4800:10000);
  }
  let count=0;
  for(let k=0;k<limit*30&&count<limit-localTrees.length;k++){
    // Spend more of the fixed instance budget in the approach corridor. Dense
    // near stands read as woodland; distant photo coverage can carry fewer cards.
    const close=rng()<.65;
    const x=close?2000+rng()*8000:-3900+rng()*13800,z=(rng()-.5)*(close?4000:7800);
    if(Math.abs(x)<2100&&Math.abs(z-120)<700)continue;
    if(Math.abs(z)<180&&x>1500&&x<3400)continue;
    if(world.approachBuildingExcludes?.(x,z))continue;
    if(world.approachRoadExcludes?.(x,z))continue;
    const cover=corridor?.sample(x,z);
    if(cover&&cover[0]+cover[1]+cover[2]>.15)continue; // Reviewed fields stay open, woodland is planted below.
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
    const broadleaf=groveNoise(x/240-15,z/240+7);
    const row=choice<(conifer>.56?.55:.22)?(rng()<.4?1:4)+Math.floor(rng()*3):broadleaf<.4?8:broadleaf>.6?7:0;
    const h=row===0?10+rng()*12:row===7?14+rng()*8:row===8?10+rng()*7:row<4?2.5+rng()*3.5:8+rng()*8;
    const w=Math.min(23.5,h*atlas.species[row].aspect*(.88+rng()*.24));
    const type=Math.floor(rng()*4),key=`${Math.floor(x/(low?2000:1000))}:${Math.floor(z/(low?2000:1000))}`;
    if(!patches.has(key))patches.set(key,[]);
    patches.get(key).push({x,z,type,row,h,w,yaw:rng()*Math.PI});forms[row]++;count++;
  }
  for(const t of localTrees){
    const key=`${Math.floor(t.x/(low?2000:1000))}:${Math.floor(t.z/(low?2000:1000))}`;
    if(!patches.has(key))patches.set(key,[]);patches.get(key).push(t);forms[t.row]++;count++;
  }
  if(corridor)corridor.trees={count:localTrees.length,total:count,limit,spacing:low?[14,23]:[9.5,16]};
  const group=new THREE.Group();group.name='Photographed woodland stands';
  const geometry=crownGeometry(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const contact=document.createElement('canvas');contact.width=contact.height=64;
  const g=contact.getContext('2d'),fade=g.createRadialGradient(32,32,3,32,32,32);
  fade.addColorStop(0,'rgba(0,0,0,.24)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,64,64);
  const contactMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contactGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const records=[];
  for(const trees of patches.values()){
    const crown=geometry.clone(),offsets=new Float32Array(trees.length*2),yaws=new Float32Array(trees.length),frames=new Float32Array(trees.length*2);
    const fades=new THREE.InstancedBufferAttribute(new Float32Array(trees.length),1).setUsage(THREE.DynamicDrawUsage);
    crown.setAttribute('treeDetailFade',fades);
    const mesh=new THREE.InstancedMesh(crown,material,trees.length);
    const shadows=new THREE.InstancedMesh(contactGeo,contactMat,trees.length);
    trees.forEach((t,i)=>{
      offsets[i*2]=t.type;offsets[i*2+1]=t.row;yaws[i]=t.yaw;
      frames[i*2]=atlas.species[t.row].frameScale;frames[i*2+1]=atlas.species[t.row].aspect;
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
    crown.setAttribute('treeFrame',new THREE.InstancedBufferAttribute(frames,2));
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
