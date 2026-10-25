// Forest stands tied to the orthophoto. Camera-facing, multi-view impostors
// replace crossed image planes. Nine authored forms across five CC0 sources
// retain their crown proportions, with understory clustered below the broadleaf canopy.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';
import { sceneryGroundHeight,protectedScenery } from './scenery-ground.js';
import { addNearTrees, treeFadeShader } from './near-trees.js';
import { addWoodlandShadows } from './woodland-shadows.js';

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
  // A small, linear-data atlas records shadowed directional response in source
  // coordinates. Missing optional response data retains the diffuse-sky atlas.
  const lighting={responseMap:null,error:null,uniforms:{treeSunDirection:{value:new THREE.Vector3(0,1,0)},
    treeSunColor:{value:new THREE.Color(1,1,1)},treeSunAmount:{value:0}}};
  try{
    lighting.responseMap=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/scenery/tree-light-response${low?'-low':''}.webp`,import.meta.url).href);
    const tile=low?atlas.lowResponseTileSize:atlas.responseTileSize;
    if(lighting.responseMap.image.width!==columns*tile||lighting.responseMap.image.height!==atlas.rows*3*tile){
      lighting.responseMap.dispose();lighting.responseMap=null;throw new Error('Tree lighting atlas dimensions do not match its views');
    }
    lighting.responseMap.anisotropy=world.maxAniso;
  }catch(error){lighting.error=String(error);console.warn('Tree directional lighting unavailable; using diffuse sky.',error);}
  world.woodlandLighting=lighting;
  // Four-view blending and mip filtering already reduce thin-leaf coverage.
  // Small crowns need a lower cutoff; large crowns keep the near model's outline.
  const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.15,alphaToCoverage:true,side:THREE.DoubleSide});
  if(lighting.responseMap)material.defines={TREE_DIRECTIONAL:1};
  material.addEventListener('dispose',()=>lighting.responseMap?.dispose());
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    Object.assign(shader.uniforms,lighting.uniforms,{treeLightResponse:{value:lighting.responseMap}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 treeUvOffset; attribute float treeYaw; attribute vec2 treeFrame;
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;
      varying float vTreeElevation; varying float vTreeRow; varying float vTreeScale;
      varying vec2 vTreeRotation;`)
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
        vTreeUV=uv;vTreeRow=treeUvOffset.y;vTreeElevation=treePitch/0.785398163397;vTreeScale=treeFrame.x;
        float treeRotation=treeYaw+treeUvOffset.x*1.57079632679;
        vTreeRotation=vec2(cos(treeRotation),sin(treeRotation));
      `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vTreeViews; varying float vTreeBlend; varying vec2 vTreeUV;
      varying float vTreeElevation; varying float vTreeRow; varying float vTreeScale;
      varying vec2 vTreeRotation;
      uniform sampler2D treeLightResponse; uniform vec3 treeSunDirection; uniform vec3 treeSunColor; uniform float treeSunAmount;`)
      .replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
      vec2 treeUV(float view,float elevation){
        vec2 tileUV=mix(vec2(.004),vec2(.996),vTreeUV);
        return vec2((view+tileUV.x)/${columns}.0,(${atlas.rows*3-1}.0-vTreeRow*3.0-elevation+tileUV.y)/${atlas.rows*3}.0);
      }
      vec4 treeTexel(float view,float elevation){return texture2D(map,treeUV(view,elevation));}
      vec4 treePremultiplied(vec4 c){return vec4(c.rgb*c.a,c.a);}
      #ifdef TREE_DIRECTIONAL
      vec4 treeResponse(float view,float elevation,vec2 dx,vec2 dy){
        vec4 n=textureGrad(treeLightResponse,treeUV(view,elevation),dx,dy);
        return vec4((n.rgb*2.0-1.0)*n.a,n.a);
      }
      #endif`)
      .replace('#include <map_fragment>',`
        float treeLower=floor(vTreeElevation),treeUpper=min(2.0,treeLower+1.0);
        vec4 treeA=mix(treePremultiplied(treeTexel(vTreeViews.x,treeLower)),treePremultiplied(treeTexel(vTreeViews.y,treeLower)),vTreeBlend);
        vec4 treeB=mix(treePremultiplied(treeTexel(vTreeViews.x,treeUpper)),treePremultiplied(treeTexel(vTreeViews.y,treeUpper)),vTreeBlend);
        vec4 treeColor=mix(treeA,treeB,fract(vTreeElevation));
        diffuseColor*=vec4(treeColor.rgb/max(.001,treeColor.a),treeColor.a);
        #ifdef TREE_DIRECTIONAL
        // Compute derivatives before any discard. Lighting samples can then run
        // only on surviving leaves without undefined implicit-LOD derivatives.
        vec2 treeResponseDx=dFdx(vTreeUV)*vec2(.992/${columns}.0,.992/${atlas.rows*3}.0);
        vec2 treeResponseDy=dFdy(vTreeUV)*vec2(.992/${columns}.0,.992/${atlas.rows*3}.0);
        #endif
      `)
      .replace('#include <alphatest_fragment>',`
        float treePixels=1.0/max(.00001,max(length(dFdx(vTreeUV)),length(dFdy(vTreeUV))))/vTreeScale;
        float treeAlphaTest=mix(alphaTest,.28,smoothstep(64.0,128.0,treePixels));
        #define alphaTest treeAlphaTest
        #include <alphatest_fragment>
        #undef alphaTest
        #ifdef TREE_DIRECTIONAL
        if(treeSunAmount>0.0){
        vec4 response=mix(mix(treeResponse(vTreeViews.x,treeLower,treeResponseDx,treeResponseDy),treeResponse(vTreeViews.y,treeLower,treeResponseDx,treeResponseDy),vTreeBlend),
                   mix(treeResponse(vTreeViews.x,treeUpper,treeResponseDx,treeResponseDy),treeResponse(vTreeViews.y,treeUpper,treeResponseDx,treeResponseDy),vTreeBlend),fract(vTreeElevation));
        // Keep the magnitude: occluded branches should respond less, not turn
        // into fully sunlit normals. Empty/mip-cancelled samples stay finite.
        vec3 n=response.rgb/max(.001,response.a);
        n=vec3(vTreeRotation.x*n.x+vTreeRotation.y*n.z,n.y,-vTreeRotation.y*n.x+vTreeRotation.x*n.z);
        float treeLambert=max(0.0,dot(n,treeSunDirection));
        diffuseColor.rgb*=mix(vec3(1.0),vec3(.78)+treeSunColor*min(1.6,3.5*treeLambert),treeSunAmount);
        }
        #endif
      `);
  };
  treeFadeShader(material,false);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(photo,0,0,1024,1024);
  const airportPixels=context.getImageData(0,0,1024,1024).data;
  context.drawImage(approachPhoto,0,0,1024,1024);
  const approachPixels=context.getImageData(0,0,1024,1024).data;
  const rng=makeRng(812),patches=new Map(),forms=Array(atlas.rows).fill(0);
  const corridor=world.approachCorridor,localTrees=[];
  const oppositeZones=corridor?.oppositeHills?.plantingZones||[];
  const upperZones=(corridor?.upperSlopes||[]).flatMap(t=>t.plantingZones);
  // The opposite and upper hills add bounded high-only allocations. Keep the older
  // mapped stands and their remaining background allowance, rather than thinning
  // the airport-side trees to populate another slope. Missing maps add no budget.
  const limit=low?14000:52000+[...oppositeZones,...upperZones].reduce((n,z)=>n+z.highLimit,0);
  // In the reviewed corridor, plant continuous canopy from the same land-cover
  // boundaries used by the ground. Jittered spacing avoids clumps and bare gaps.
  // Independent seeds and caps preserve the older stands' density.
  if(corridor){
    // (the hillside's zone only where the corridor uses its tile: see loadApproachCorridor)
    const zones=[...(corridor.manifest.plantingZones||[{bounds:corridor.manifest.bounds,seed:94051,highLimit:10000,lowLimit:4800}]),...(corridor.hills?.plantingZones||[]),...oppositeZones,...upperZones];
    const zoneCounts=[];
    for(const zone of zones){
      const [x0,z0,width,depth]=zone.bounds,localRng=makeRng(zone.seed),zoneTrees=[],upperTrees=[];
      // Keep the existing close canopy density. Higher parts of final can use
      // wider stand spacing, conserving the same overall tree-instance budget.
      for(let xx=x0;xx<x0+width;){
        const spacing=(low?zone.lowSpacing:zone.highSpacing)??(xx<4100?(low?14:9.5):(low?18:12));
        for(let zz=z0;zz<z0+depth;zz+=spacing){
          const x=xx+(localRng()-.5)*spacing*.8,z=zz+(localRng()-.5)*spacing*.8;
          const cover=corridor.sample(x,z),weight=cover[2];
          if(weight<.15||cover[0]+cover[1]>.35||localRng()>Math.min(1,weight*1.6))continue;
          if(world.approachSiteExcludes?.(x,z)||protectedScenery(x,z,14)||world.approachBuildingExcludes?.(x,z)||world.approachRoadExcludes?.(x,z))continue;
          const stand=groveNoise(x/95+4,z/95-7),choice=localRng();
          const species=localRng();
          const row=choice<.07?4+Math.floor(localRng()*3):choice<.12?1+Math.floor(localRng()*3):species<.2+stand*.25?7:species<.68+stand*.12?0:8;
          const edge=.76+.24*weight;
          const h=(row===0?14+localRng()*7:row===7?16+localRng()*7:row===8?12+localRng()*6:row<4?3+localRng()*3:10+localRng()*5)*edge;
          const w=Math.min(24,h*atlas.species[row].aspect*(.94+localRng()*.14));
          (xx<4100&&!zone.uniform?zoneTrees:upperTrees).push({x,z,type:Math.floor(localRng()*4),row,h,w,yaw:localRng()*Math.PI});
        }
        xx+=spacing;
      }
      // Retain the close stand when the denser upper section reaches the cap.
      // Uniformly thin only the remaining upper allocation, not both together.
      const cap=low?zone.lowLimit:zone.highLimit;
      for(const list of [zoneTrees,upperTrees])for(let i=list.length-1;i>0;i--){const j=Math.floor(localRng()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
      if(zone.taper){
        // Density tapers away from the shared edge (north by default, south on the
        // opposite hill) down to taperFloor of the close woods: each tree is kept with a probability scaled so the
        // kept trees fill the allocation. Systematic sampling over the shuffled candidates
        // keeps those probabilities and gives exactly the allocation, not just on average.
        const weight=t=>zone.taperFloor+(1-zone.taperFloor)*Math.max(0,Math.min(1,1-(zone.taperSide==='south'?z0+depth-t.z:t.z-z0)/zone.taper));
        let lo=0,hi=1/zone.taperFloor;
        for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(upperTrees.reduce((n,t)=>n+Math.min(1,mid*weight(t)),0)<cap)lo=mid;else hi=mid;}
        let sum=localRng();const kept=[];
        for(const t of upperTrees){sum+=Math.min(1,hi*weight(t));if(sum>=1){kept.push(t);sum-=1;}}
        upperTrees.length=0;upperTrees.push(...kept);
      }
      zoneTrees.length=Math.min(zoneTrees.length,cap);upperTrees.length=Math.min(upperTrees.length,cap-zoneTrees.length);
      localTrees.push(...zoneTrees,...upperTrees);zoneCounts.push(zoneTrees.length+upperTrees.length);
    }
    corridor.zoneCounts=zoneCounts;
  }
  // Individually placed garden/edge trees share the same geometry/instance budget.
  for(const [i,t] of (world.approachSiteTrees||[]).entries()){
    if(world.approachSiteRoadExcludes?.(t.x,t.z)||world.approachBuildingExcludes?.(t.x,t.z)||world.approachRoadExcludes?.(t.x,t.z)||protectedScenery(t.x,t.z,14))continue;
    localTrees.push({...t,type:i%4,w:t.h*atlas.species[t.row].aspect,yaw:i*2.399});
  }
  let count=0;
  for(let k=0;k<limit*30&&count<limit-localTrees.length;k++){
    // Spend more of the fixed instance budget in the approach corridor. Dense
    // near stands read as woodland; distant photo coverage can carry fewer cards.
    const close=rng()<.65;
    const x=close?2000+rng()*8000:-3900+rng()*13800,z=(rng()-.5)*(close?4000:7800);
    if(Math.abs(x)<2100&&Math.abs(z-120)<700)continue;
    if(Math.abs(z)<180&&x>1500&&x<3400)continue;
    if(world.approachSiteExcludes?.(x,z)||world.approachBuildingExcludes?.(x,z))continue;
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
  if(corridor)corridor.trees={count:localTrees.length,total:count,limit,spacing:low?[14,18]:[9.5,12],zones:corridor.zoneCounts};
  const group=new THREE.Group();group.name='Photographed woodland stands';
  const geometry=crownGeometry(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const records=[];
  for(const trees of patches.values()){
    const crown=geometry.clone(),offsets=new Float32Array(trees.length*2),yaws=new Float32Array(trees.length),frames=new Float32Array(trees.length*2);
    const fades=new THREE.InstancedBufferAttribute(new Float32Array(trees.length),1).setUsage(THREE.DynamicDrawUsage);
    crown.setAttribute('treeDetailFade',fades);
    const mesh=new THREE.InstancedMesh(crown,material,trees.length);
    trees.forEach((t,i)=>{
      offsets[i*2]=t.type;offsets[i*2+1]=t.row;yaws[i]=t.yaw;
      frames[i*2]=atlas.species[t.row].frameScale;frames[i*2+1]=atlas.species[t.row].aspect;
      q.setFromAxisAngle(up,t.yaw);
      const y=sceneryGroundHeight(t.x,t.z,world.groundLowDetail);
      matrix.compose(new THREE.Vector3(t.x,y-.08,t.z),q,new THREE.Vector3(t.w,t.h,t.w));
      mesh.setMatrixAt(i,matrix);
      const tint=.83+rng()*.17,warm=rng(),color=new THREE.Color().setRGB(tint*(.94+warm*.1),tint,tint*(.88+warm*.1));mesh.setColorAt(i,color);
      if(!low)records.push({...t,id:records.length,y:y-.08,color,fade:fades,index:i});
    });
    crown.setAttribute('treeUvOffset',new THREE.InstancedBufferAttribute(offsets,2));
    crown.setAttribute('treeYaw',new THREE.InstancedBufferAttribute(yaws,1));
    crown.setAttribute('treeFrame',new THREE.InstancedBufferAttribute(frames,2));
    mesh.computeBoundingSphere();group.add(mesh);
  }
  geometry.dispose();
  world.scene.add(group);world.woodland=group;world.woodlandMaterial=material;world.woodlandForms=forms;
  addWoodlandShadows(world,patches,atlas,texture);
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
