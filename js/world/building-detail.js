import * as THREE from 'three';

// Retain walls, roofs, glazing and substantial trim at every distance. Only tiny
// painted/ironwork triangles disappear after the entire group is over 550 m away.
// Both levels share vertex buffers and materials; the far level needs just indices.
export function buildingDetailLOD(group){
 let removed=0,total=0;const far=new THREE.Group();far.name=group.name+' distant';
 for(const source of group.children){
  const geometry=source.geometry,p=geometry.attributes.position,indices=geometry.index;
  total+=indices.count/3;
  if(!/^(Aged cream paint|Recess and door ironwork)$/.test(source.material.name)){
   far.add(source.clone());continue;
  }
  const kept=[];
  for(let i=0;i<indices.count;i+=3){
   const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
   const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a);
   const vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);
   const area=.5*Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
   if(area>=.08)kept.push(a,b,c);else removed++;
  }
  if(!kept.length)continue;
  const reduced=new THREE.BufferGeometry();reduced.setIndex(kept);
  for(const [name,attribute] of Object.entries(geometry.attributes))reduced.setAttribute(name,attribute);
  reduced.boundingSphere=geometry.boundingSphere.clone();
  const mesh=source.clone();mesh.geometry=reduced;far.add(mesh);
 }
 if(!removed)return {object:group,farTriangles:total,removedTriangles:0};
 const sphere=new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
 const lod=new THREE.LOD();lod.name=group.name+' detail levels';lod.position.copy(sphere.center);
 group.position.copy(sphere.center).negate();far.position.copy(group.position);
 lod.addLevel(group,0);lod.addLevel(far,sphere.radius+550,.12);
 lod.userData.buildingDetail={distance:sphere.radius+550,nearTriangles:total,farTriangles:total-removed};
 return {object:lod,farTriangles:total-removed,removedTriangles:removed};
}
