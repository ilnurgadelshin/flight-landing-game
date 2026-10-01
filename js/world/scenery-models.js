import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadParkedAircraft(world) {
  const loader=new GLTFLoader();
  const models=await Promise.all(['B737','A320'].map(name=>loader.loadAsync(new URL(`../../assets/models/${name}.glb`,import.meta.url).href)));
  models.forEach(({scene},i)=>{
    scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
    // These air-traffic models use different source units. Fit the actual airframe length.
    const scale=(i===0?39.5:37.6)/Math.max(size.x,size.z);
    const centered=new THREE.Group();centered.add(scene);scene.scale.multiplyScalar(scale);
    const b=new THREE.Box3().setFromObject(scene),c=b.getCenter(new THREE.Vector3());
    scene.position.sub(new THREE.Vector3(c.x,b.min.y,c.z));scene.position.y+=1.35;
    if(size.x>size.z)centered.rotation.y=Math.PI/2;
    centered.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.roughness=.48;o.material.metalness=.12;}});
    models[i]=centered;
  });
  for(let i=0;i<5;i++){
    const jet=models[i%2].clone(true);
    const stand=new THREE.Group();stand.name='Parked airliner';stand.add(jet);
    stand.position.set(-320+i*160,0,380);stand.rotation.y=Math.PI;
    // Air-traffic models omit the undercarriage. Add tyres/struts at real ground contact.
    const tyre=new THREE.MeshStandardMaterial({color:0x15191a,roughness:.9});
    const strut=new THREE.MeshStandardMaterial({color:0x929d9f,metalness:.7,roughness:.36});
    for(const [x,z] of [[-3.5,2],[3.5,2],[0,-13]]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,1.4,6),strut);leg.position.set(x,1.1,z);stand.add(leg);
      for(const dx of [-.22,.22]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.28,12),tyre);wheel.rotation.z=Math.PI/2;wheel.position.set(x+dx,.44,z);stand.add(wheel);}
    }
    world.parkedAircraft.add(stand);
  }
  if(world.sun.castShadow)world.sun.shadow.needsUpdate=true;
}
