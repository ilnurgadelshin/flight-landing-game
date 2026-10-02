// Authored CC0 recessed wall bays, merged by material and spatial tile. This
// small kit replaces selected close-approach walls; surveyed roof outlines stay.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export async function loadFacadeKit(world){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),models=[];
  const suffix=world.lowDetail||world.quality==='low'?'-low':'';
  try{
    for(const name of ['modular_factory_facade','modular_urban_apartments_facade'])
      models.push((await loader.loadAsync(new URL(`../../assets/scenery/${name}${suffix}.glb`,import.meta.url).href)).scene);
  }catch(error){
    disposeSources(models,true);throw error;
  }
  const batches=new Map(),materials=new Set();let bays=0,triangles=0;
  for(const model of models){model.updateMatrixWorld(true);model.traverse(o=>{
    if(!o.isMesh)return;const m=o.material;materials.add(m);m.vertexColors=true;
    for(const value of Object.values(m))if(value?.isTexture)value.anisotropy=world.maxAniso;
    if(m.userData.nightGlow){m.emissive.set(0xffd3a0);m.emissiveIntensity=world.night?.55:0;}
  });}
  return {
    materials:[...materials].filter(m=>m.userData.nightGlow),
    add(farm,name,tile,matrix,tint){
      const source=models[farm?0:1].getObjectByName(name);
      if(!source)throw new Error(`Missing facade bay ${name}`);
      bays++;
      source.traverse(o=>{
        if(!o.isMesh)return;
        // Decode quantized attributes before putting vertices in world metres.
        // Writing large coordinates back into normalized Int16 would overflow.
        const g=new THREE.BufferGeometry();g.setIndex(o.geometry.index.clone());
        for(const key of ['position','normal','uv']){
          const a=o.geometry.attributes[key],values=new Float32Array(a.count*a.itemSize);
          for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(i,k);
          g.setAttribute(key,new THREE.BufferAttribute(values,a.itemSize));
        }
        g.applyMatrix4(o.matrixWorld).applyMatrix4(matrix);
        const colors=new Float32Array(g.attributes.position.count*3);
        const color=o.material.userData.nightGlow?new THREE.Color(0xffffff):tint;
        for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        const key=`${tile}:${o.material.uuid}`;
        if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});
        batches.get(key).geometries.push(g);triangles+=(g.index?.count||g.attributes.position.count)/3;
      });
    },
    finish(group){
      for(const {material,geometries} of batches.values()){
        const geometry=mergeGeometries(geometries);geometry.computeBoundingSphere();
        const mesh=new THREE.Mesh(geometry,material);mesh.name='Authored approach facade';
        mesh.castShadow=mesh.receiveShadow=true;mesh.userData.sceneryPart=material.userData.nightGlow?'window':'authored-wall';
        group.add(mesh);geometries.forEach(g=>g.dispose());
      }
      disposeSources(models,false);return {bays,triangles,batches:batches.size};
    },
  };
}

function disposeSources(models,all){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  for(const model of models)model.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
  geometries.forEach(g=>g.dispose());
  if(all){materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();});textures.forEach(t=>t.dispose());}
}
