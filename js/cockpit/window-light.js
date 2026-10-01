// Diffuse window irradiance is view-independent. Integrate it once on the
// cabin's existing vertices instead of evaluating two LTC lights per pixel.
// The same finite irradiance lights the cabin reflection capture; no geometry moves.
import * as THREE from 'three';

export function bakeWindowLight(root,lights,strength) {
  root.updateMatrixWorld(true);
  const samples=[],position=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  const rootInverse=root.matrixWorld.clone().invert(),localMatrix=new THREE.Matrix4();
  for(const light of lights){
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(light.quaternion);
    for(let x=0;x<4;x++)for(let y=0;y<4;y++){
      const point=new THREE.Vector3(((x+.5)/4-.5)*light.width,((y+.5)/4-.5)*light.height,0)
        .applyQuaternion(light.quaternion).add(light.position);
      samples.push({point,direction,area:light.width*light.height/16});
    }
  }
  const materials=new Set(),geometries=new Set(),color={value:lights[0].color.clone()};
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.material.isMeshStandardMaterial)return;
    for(let o=mesh;o&&o!==root;o=o.parent)if(!o.visible)return;
    if(geometries.has(mesh.geometry))mesh.geometry=mesh.geometry.clone();
    geometries.add(mesh.geometry);
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
    if(!p||!n)return;
    // The cockpit root is offset to the aircraft nose. Integrate positions and
    // aperture samples in the same cabin frame, independent of that offset.
    localMatrix.multiplyMatrices(rootInverse,mesh.matrixWorld);
    normalMatrix.getNormalMatrix(localMatrix);
    const lightValues=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){
      position.fromBufferAttribute(p,i).applyMatrix4(localMatrix);
      normal.fromBufferAttribute(n,i).applyNormalMatrix(normalMatrix);
      let front=0,back=0;
      for(const s of samples){
        const dx=s.point.x-position.x,dy=s.point.y-position.y,dz=s.point.z-position.z;
        const d2=Math.max(.012,dx*dx+dy*dy+dz*dz);
        const surface=normal.x*dx+normal.y*dy+normal.z*dz;
        const aperture=Math.max(0,-s.direction.x*dx-s.direction.y*dy-s.direction.z*dz);
        const weight=s.area*aperture/(d2*d2);
        front+=Math.max(0,surface)*weight;back+=Math.max(0,-surface)*weight;
      }
      lightValues[i*2]=Math.min(Math.PI,front);lightValues[i*2+1]=Math.min(Math.PI,back);
    }
    g.setAttribute('windowIrradiance',new THREE.BufferAttribute(lightValues,2));
    const material=mesh.material;
    if(materials.has(material))return;
    materials.add(material);
    const before=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      before.call(this,shader,renderer);
      shader.uniforms.cabinWindowStrength=strength;shader.uniforms.cabinWindowColor=color;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>','#include <common>\nattribute vec2 windowIrradiance; varying vec2 vWindowIrradiance;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvWindowIrradiance=windowIrradiance;');
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nuniform float cabinWindowStrength; uniform vec3 cabinWindowColor; varying vec2 vWindowIrradiance;')
        .replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
          #if defined(RE_IndirectDiffuse)
            irradiance+=cabinWindowColor*(cabinWindowStrength*(gl_FrontFacing?vWindowIrradiance.x:vWindowIrradiance.y));
          #endif`);
    };
    material.customProgramCacheKey=()=>key+':window-irradiance-v1';material.needsUpdate=true;
  });
}
