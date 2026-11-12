// Filtered runway coverage and airport-edge aggregate. The operational pavement
// stays fixed; aggregate shares the existing asphalt scan and a feathered margin.
import * as THREE from 'three';
import {RUNWAY} from '../config.js';

// Raster support for partial pixels at the operational pavement boundary. The
// shader clips coverage to the original [0,1] UV rectangle, including its ends.
// Preserve the original central quad: stretching its triangles across the fringe
// destabilizes grazing-angle interpolation on SwiftShader. The 16 fringe triangles
// add raster support, not physical pavement, and share the same draw/material.
export function runwayGeometry(){
 const xs=[-RUNWAY.length/2-512,-RUNWAY.length/2,RUNWAY.length/2,RUNWAY.length/2+512];
 const ys=[RUNWAY.width/2+32,RUNWAY.width/2,-RUNWAY.width/2,-RUNWAY.width/2-32];
 const geometry=new THREE.PlaneGeometry(1,1,3,3),positions=geometry.attributes.position,uv=geometry.attributes.uv;
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  const i=row*4+col,x=xs[col],y=ys[row];
  positions.setXYZ(i,x,y,0);uv.setXY(i,x/RUNWAY.length+.5,y/RUNWAY.width+.5);
 }
 return geometry;
}

export function filterRunwayMaterial(material){
 const previous=material.onBeforeCompile;
 material.transparent=true;
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec2 runwayDx=dFdx(vMapUv),runwayDy=dFdy(vMapUv);
   vec2 runwayFootprint=max(abs(runwayDx)+abs(runwayDy),vec2(1e-8));
   vec2 runwayCoverage=clamp((min(vMapUv+.5*runwayFootprint,vec2(1.0))-
     max(vMapUv-.5*runwayFootprint,vec2(0.0)))/runwayFootprint,0.0,1.0);
   diffuseColor.a*=runwayCoverage.x*runwayCoverage.y;
   if(diffuseColor.a<=0.0)discard;
   // Four positions inside the pixel retain the paint at grazing angles. Each
   // has the derivatives of a half-size pixel, retaining hardware anisotropy.
   vec4 runwaySample=(
     textureGrad(map,vMapUv-.25*runwayDx-.25*runwayDy,.5*runwayDx,.5*runwayDy)+
     textureGrad(map,vMapUv+.25*runwayDx-.25*runwayDy,.5*runwayDx,.5*runwayDy)+
     textureGrad(map,vMapUv-.25*runwayDx+.25*runwayDy,.5*runwayDx,.5*runwayDy)+
     textureGrad(map,vMapUv+.25*runwayDx+.25*runwayDy,.5*runwayDx,.5*runwayDy))*.25;
   diffuseColor*=runwaySample;
  `);
 };
 material.customProgramCacheKey=()=> 'runway-pixel-coverage-v1';
}

export function addRunwayShoulders(world){
 const positions=[],uv=[],indices=[];
 const count=Math.ceil(RUNWAY.length/3),half=RUNWAY.length/2,edge=RUNWAY.width/2;
 for(const side of [-1,1]){
  const start=positions.length/3;
  for(let i=0;i<=count;i++){
   const x=-half+i*RUNWAY.length/count;
   // Long irregularities read as ground erosion, rather than a sawtooth border.
   const outer=5.5+.30*Math.sin(x*.13)+.45*Math.sin(x*.037)+.18*Math.sin(x*.51);
   for(const distance of [-.12,2.8,outer-1.2,outer+.8]){
    positions.push(x,.005,side*(edge+distance));uv.push(x,distance/(outer+.8));
   }
   if(i<count)for(let j=0;j<3;j++){
    const a=start+i*4+j,b=a+4;
    if(side===1)indices.push(a,a+1,b,a+1,b+1,b);
    else indices.push(a,b,a+1,a+1,b,b+1);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const uniforms={uShoulderColor:{value:world.groundTex},uShoulderRough:{value:world.groundTex},uShoulderReady:{value:0},uShoulderWet:world.groundUniforms.uWet};
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,depthWrite:false});
 material.onBeforeCompile=(shader,renderer)=>{
  THREE.Material.prototype.onBeforeCompile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vShoulderXZ;varying float vShoulderEdge;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvShoulderXZ=position.xz;vShoulderEdge=uv.y;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec2 vShoulderXZ;varying float vShoulderEdge;
   uniform sampler2D uShoulderColor,uShoulderRough;uniform float uShoulderReady,uShoulderWet;
  `).replace('#include <map_fragment>',`
   vec3 aggregate=texture2D(uShoulderColor,vShoulderXZ/3.0).rgb;
   float grain=mix(1.0,clamp(dot(aggregate,vec3(.25,.5,.25))*4.0,.55,1.45),uShoulderReady);
   float weathering=.94+.045*sin(vShoulderXZ.x*.059+sin(vShoulderXZ.y*1.9))+.04*cos(vShoulderXZ.x*.27);
   vec3 surface=mix(vec3(.100,.106,.100),vec3(.116,.107,.077),smoothstep(.25,.85,vShoulderEdge));
   diffuseColor.rgb*=surface*grain*weathering*mix(1.0,.64,uShoulderWet);
   float erosion=.045*sin(vShoulderXZ.x*2.9)+.025*sin(vShoulderXZ.x*7.3);
   diffuseColor.a*=1.0-smoothstep(.57,1.0,vShoulderEdge+erosion);
  `).replace('#include <normal_fragment_begin>','#define vNormalMapUv (vShoulderXZ/3.0)\n#include <normal_fragment_begin>')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n#undef vNormalMapUv')
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=mix(1.0,.84+.16*texture2D(uShoulderRough,vShoulderXZ/3.0).g,uShoulderReady);`);
 };
 material.customProgramCacheKey=()=> 'runway-aggregate-shoulder-v1';
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Runway aggregate shoulders';mesh.receiveShadow=true;world.scene.add(mesh);
 world.runwayShoulders={mesh,material,uniforms,setTextures({color,normal,rough}){
  uniforms.uShoulderColor.value=color;uniforms.uShoulderRough.value=rough;uniforms.uShoulderReady.value=1;
  material.normalMap=normal;material.normalScale.set(.35,.35);material.needsUpdate=true;
 }};
 return mesh;
}
