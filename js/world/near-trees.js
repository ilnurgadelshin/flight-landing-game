// A bounded pool of real branch/leaf geometry replaces nearby whole-tree cards.
// All sources are the same CC0 models used by the distant canopy atlas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const NEAR_TREE_LIMIT=48;
const TARGET_COUNT=32,OUTER=180,INNER=90,TARGET_TRIANGLES=1800000,MAX_TRIANGLES=2400000;

export function treeFadeShader(material,near) {
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float treeDetailFade; varying float vTreeDetailFade;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvTreeDetailFade=treeDetailFade;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTreeDetailFade;')
      .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        float treeDither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        if(${near?'treeDither >= vTreeDetailFade':'treeDither < vTreeDetailFade'})discard;`);
  };
  material.customProgramCacheKey=()=>`tree-fade-${near?'geometry':'impostor'}`;
}

export async function addNearTrees(world,trees,atlas) {
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names=[...new Set(atlas.species.map(s=>s.name))];
  const loaded=await Promise.all(names.map(n=>loader.loadAsync(new URL(`../../assets/scenery/${n}-near.glb`,import.meta.url).href)));
  if(world.quality!=='high'){
    for(const model of loaded)model.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    return; // Auto quality may have stepped down while the downloads completed.
  }
  const group=new THREE.Group();group.name='Nearby authored tree geometry';
  const pools=[],materials=new Map();
  const materialFor=source=>{
    if(materials.has(source))return materials.get(source);
    const material=new THREE.MeshStandardMaterial({map:source.map,normalMap:source.normalMap,
      color:source.color,roughness:1,metalness:0,side:source.side,alphaTest:source.alphaTest,
      alphaToCoverage:true,envMapIntensity:.85});
    for(const t of [material.map,material.normalMap])if(t)t.anisotropy=world.maxAniso;
    treeFadeShader(material,true);materials.set(source,material);return material;
  };
  for(const form of atlas.species){
    const scene=loaded[names.indexOf(form.name)].scene;scene.updateMatrixWorld(true);
    const name=form.variant?`${form.name}_${form.variant}`:`${form.name}_LOD0`;
    const source=scene.getObjectByName(name)||scene.getObjectByName(name+'_LOD0');
    if(!source)throw new Error(`Missing tree form: ${name}`);
    const meshes=[];let triangles=0;
    source.traverse(o=>{
      if(!o.isMesh)return;
      const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
      const fade=new THREE.InstancedBufferAttribute(new Float32Array(NEAR_TREE_LIMIT),1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('treeDetailFade',fade);
      const material=materialFor(o.material),mesh=new THREE.InstancedMesh(geometry,material,NEAR_TREE_LIMIT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:material.map,
        alphaTest:material.alphaTest,side:material.side});treeFadeShader(depth,true);mesh.customDepthMaterial=depth;
      mesh.name=`Nearby ${form.name} ${form.variant||''}`;meshes.push(mesh);group.add(mesh);
      triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;
    });
    pools.push({meshes,triangles,ids:[]});
  }
  for(const model of loaded)model.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  const cells=new Map();
  for(const t of trees){const key=`${Math.floor(t.x/200)}:${Math.floor(t.z/200)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);}
  const active=new Map(),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  let lastX=Infinity,lastZ=Infinity,targets=new Map(),shadowStale=false,shadowTime=-Infinity;
  const update=(dt,eye)=>{
    const moved=Math.hypot(eye.x-lastX,eye.z-lastZ)>12;
    // Also refresh on a vertical pass: selection uses true 3D distance to crowns.
    if(moved||Math.abs(eye.y-(api.lastY??Infinity))>12){
      lastX=eye.x;lastZ=eye.z;api.lastY=eye.y;
      const candidates=[];
      for(let x=Math.floor((eye.x-OUTER)/200);x<=Math.floor((eye.x+OUTER)/200);x++)
        for(let z=Math.floor((eye.z-OUTER)/200);z<=Math.floor((eye.z+OUTER)/200);z++)
          for(const t of cells.get(`${x}:${z}`)||[]){
            const distance=Math.hypot(t.x-eye.x,t.z-eye.z,t.y+t.h*.55-eye.y);
            if(distance<OUTER)candidates.push({t,distance});
          }
      candidates.sort((a,b)=>a.distance-b.distance);
      targets=new Map();let triangles=0;
      for(const {t} of candidates){
        const cost=pools[t.row].triangles;
        if(targets.size>=TARGET_COUNT||triangles+cost>TARGET_TRIANGLES)continue;
        targets.set(t.id,t);triangles+=cost;
      }
    }
    const dirty=new Set(),layoutDirty=new Set(),step=Math.min(1,Math.max(0,dt)/.35);
    const setFade=(attr,index,value)=>{
      if(Math.abs(attr.getX(index)-value)<1e-6)return;
      attr.setX(index,value);dirty.add(attr);
    };
    // Retiring trees keep their pool space until the complementary cards return.
    for(const [id,state] of active){
      if(targets.has(id))continue;
      state.fade=Math.max(0,state.fade-step);setFade(state.t.fade,state.t.index,state.fade);
      if(!state.fade)active.delete(id);
    }
    let reserved=[...active.values()].reduce((sum,s)=>sum+pools[s.t.row].triangles,0);
    for(const [id,t] of targets)if(!active.has(id)&&active.size<NEAR_TREE_LIMIT&&reserved+pools[t.row].triangles<=MAX_TRIANGLES){
      active.set(id,{t,fade:0});reserved+=pools[t.row].triangles;
    }
    const counts=Array(pools.length).fill(0);let triangleCount=0;
    for(const [id,state] of active){
      const t=state.t,distance=Math.hypot(t.x-eye.x,t.z-eye.z,t.y+t.h*.55-eye.y);
      const goal=targets.has(id)?1-THREE.MathUtils.smoothstep(distance,INNER,OUTER):0;
      state.fade+=THREE.MathUtils.clamp(goal-state.fade,-step,step);
      setFade(t.fade,t.index,state.fade);
      if(state.fade<=0)continue;
      const i=counts[t.row]++,pool=pools[t.row],width=t.w/atlas.species[t.row].aspect;
      // Trees don't move. A changing LOD fade needs one scalar upload, not new
      // transform/colour buffers and a bounding-sphere rebuild for every frame.
      if(pool.ids[i]!==id){
        pool.ids[i]=id;layoutDirty.add(pool);
        rotation.setFromAxisAngle(up,t.yaw+t.type*Math.PI/2);
        matrix.compose(new THREE.Vector3(t.x,t.y,t.z),rotation,new THREE.Vector3(width,t.h,width));
        for(const mesh of pool.meshes){mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,t.color);}
      }
      for(const mesh of pool.meshes)setFade(mesh.geometry.attributes.treeDetailFade,i,state.fade);
      triangleCount+=pool.triangles;
    }
    for(const attr of dirty)attr.needsUpdate=true;
    pools.forEach((pool,row)=>{if(pool.ids.length!==counts[row]){pool.ids.length=counts[row];layoutDirty.add(pool);}pool.meshes.forEach(mesh=>{
      mesh.count=counts[row];mesh.visible=mesh.count>0;
      if(mesh.count&&layoutDirty.has(pool)){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
    });});
    api.count=counts.reduce((a,b)=>a+b,0);api.triangles=triangleCount;
    // The airport's sun shadow map is large and static. Redraw it only when the set of
    // shadow-casting trees or their leaf fades change, at most once a second.
    // Membership can stay fixed as a tree finishes fading in; its depth shader
    // uses the fade too, so otherwise the map retains the first partial shadow.
    if(layoutDirty.size||dirty.size)shadowStale=true;
    if(shadowStale&&world.sun.castShadow&&world.time-shadowTime>=1){
      shadowStale=false;shadowTime=world.time;world.sun.shadow.needsUpdate=true;
    }
  };
  const api=world.nearWoodland={group,pools,active,update,count:0,triangles:0,settle:eye=>update(1,eye)};
  world.scene.add(group);
}
