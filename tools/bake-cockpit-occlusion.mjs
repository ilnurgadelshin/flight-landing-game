// Deterministic, offline contact and cabin sky-access shading. At runtime this
// attenuates indirect light only; direct sunlight is handled by the shadow map.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { headlinerData } from '../js/cockpit/headliner.js';

export function bakeOcclusion(document) {
  const primitives=document.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
  const roof=headlinerData();
  let vertices=roof.positions.length/3,indices=roof.indices.length;
  for(const p of primitives){vertices+=p.getAttribute('POSITION').getCount();indices+=p.getIndices().getCount();}
  const positions=new Float32Array(vertices*3), triangles=new Uint32Array(indices);
  let vo=0,io=0;
  for(const p of primitives){
    const a=p.getAttribute('POSITION'),index=p.getIndices().getArray();
    positions.set(a.getArray(),vo*3);
    for(let i=0;i<index.length;i++)triangles[io+i]=index[i]+vo;
    vo+=a.getCount();io+=index.length;
  }
  positions.set(roof.positions,vo*3);
  for(let i=0;i<roof.indices.length;i++)triangles[io+i]=roof.indices[i]+vo;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(triangles,1));
  const tree=new MeshBVH(geometry,{targetLeafSize:12});
  const ray=new THREE.Ray(),normal=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),up=new THREE.Vector3(),cache=new Map();
  const count=24, contactRadius=.22, cabinRadius=2.5;
  let sampled=0;
  for(const p of primitives){
    const position=p.getAttribute('POSITION'),normals=p.getAttribute('NORMAL');if(!normals)continue;
    const colors=new Uint8Array(position.getCount()*3);
    for(let i=0;i<position.getCount();i++){
      const pos=position.getElement(i,[]),n=normals.getElement(i,[]);
      const key=pos.map(x=>Math.round(x*400)).join(',')+':'+n.map(x=>Math.round(x*8)).join(',');
      let shade=cache.get(key);
      if(shade===undefined){
        normal.fromArray(n).normalize();up.set(Math.abs(normal.y)<.9?0:1,Math.abs(normal.y)<.9?1:0,0);
        u.crossVectors(up,normal).normalize();v.crossVectors(normal,u);
        ray.origin.fromArray(pos).addScaledVector(normal,.0015);
        let contact=0, enclosed=0;
        for(let k=0;k<count;k++){
          const a=k*2.399963229728653,r=Math.sqrt((k+.5)/count),z=Math.sqrt(1-r*r);
          ray.direction.copy(normal).multiplyScalar(z).addScaledVector(u,Math.cos(a)*r).addScaledVector(v,Math.sin(a)*r).normalize();
          const hit=tree.raycastFirst(ray,THREE.DoubleSide,.001,cabinRadius);
          if(hit){
            contact+=Math.max(0,1-hit.distance/contactRadius);
            enclosed+=1;
          }
        }
        // Retain bounced light in enclosed areas. Rays escaping the cabin add
        // soft sky light near windows, while the pedestal and recesses stay shaded.
        shade=Math.round(255*(1-.50*contact/count)*(1-.55*enclosed/count));
        cache.set(key,shade);sampled++;
      }
      colors.fill(shade,i*3,i*3+3);
    }
    p.setAttribute('COLOR_0',document.createAccessor().setType('VEC3').setArray(colors).setNormalized(true).setBuffer(document.getRoot().listBuffers()[0]));
  }
  geometry.dispose();console.log(`Baked cabin shading: ${sampled} samples, ${Math.round((indices-roof.indices.length)/3)} model triangles`);
}
