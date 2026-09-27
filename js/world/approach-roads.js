import * as THREE from 'three';
import { sceneryGroundHeight } from './scenery-ground.js';

export async function addApproachRoads(world) {
  const response=await fetch(new URL('../../assets/scenery/approach-roads.json',import.meta.url));
  if(!response.ok)throw new Error(`Approach roads: HTTP ${response.status}`);
  const {roads}=await response.json(),low=world.lowDetail||world.quality==='low';
  const group=new THREE.Group();group.name='Valley roads and verge markers';
  const asphalt=new THREE.MeshStandardMaterial({color:0x777970,roughness:.97});
  const verge=new THREE.MeshStandardMaterial({color:0x8c8a77,roughness:1});
  const paint=new THREE.MeshStandardMaterial({color:0xb6ac70,roughness:1});
  const ground=(x,z)=>sceneryGroundHeight(x,z,low),segments=[],markers=[];
  for(const road of roads){
    const pts=road.points,p=[],uv=[],idx=[],v=[],vuv=[],vi=[],lines=[],li=[];
    let distance=0,nextMarker=0;
    for(let i=0;i<pts.length;i++){
      const a=pts[Math.max(i-1,0)],b=pts[Math.min(i+1,pts.length-1)],point=pts[i];
      const length=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length;
      if(i)distance+=Math.hypot(point[0]-pts[i-1][0],point[1]-pts[i-1][1]);
      const vertex=(offset,lift)=>{const x=point[0]+nx*offset,z=point[1]+nz*offset;return [x,ground(x,z)+lift,z];};
      for(const side of [-1,1]){
        p.push(...vertex(side*road.width/2,.10));uv.push((side+1)/2,distance/road.width);
        v.push(...vertex(side*(road.width/2+.7),.065));vuv.push((side+1)/2,distance/road.width);
        lines.push(...vertex(side*.06,.13));
      }
      if(i<pts.length-1){
        const n=i*2;idx.push(n,n+1,n+2,n+1,n+3,n+2);vi.push(n,n+1,n+2,n+1,n+3,n+2);
        if(Math.floor(distance/16)%2===0)li.push(n,n+1,n+2,n+1,n+3,n+2);
        segments.push({a:point,b:pts[i+1],width:road.width});
      }
      if(!low&&distance>=nextMarker){
        nextMarker=distance+65;
        for(const side of [-1,1]){const q=vertex(side*(road.width/2+1.2),0);markers.push(q);}
      }
    }
    const mesh=(pos,uvs,indices,mat)=>{
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      if(uvs)geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
      const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;group.add(m);
    };
    mesh(v,vuv,vi,verge);mesh(p,uv,idx,asphalt);mesh(lines,null,li,paint);
  }
  if(markers.length){
    const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.85,.1),new THREE.MeshStandardMaterial({color:0xc5c3b5,roughness:.9}),markers.length);
    const reflectors=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.12,.12),new THREE.MeshStandardMaterial({color:0xafa686,roughness:.5}),markers.length);
    const matrix=new THREE.Matrix4();markers.forEach(([x,y,z],i)=>{matrix.makeTranslation(x,y+.425,z);posts.setMatrixAt(i,matrix);matrix.makeTranslation(x,y+.72,z);reflectors.setMatrixAt(i,matrix);});
    posts.computeBoundingSphere();reflectors.computeBoundingSphere();group.add(posts,reflectors);
  }
  // Index short segments for crown-radius clearance when planting the woodland.
  const grid=new Map();
  for(const seg of segments){
    for(let x=Math.floor((Math.min(seg.a[0],seg.b[0])-16)/100);x<=Math.floor((Math.max(seg.a[0],seg.b[0])+16)/100);x++)
      for(let z=Math.floor((Math.min(seg.a[1],seg.b[1])-16)/100);z<=Math.floor((Math.max(seg.a[1],seg.b[1])+16)/100);z++){
        const key=`${x}:${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(seg);
      }
  }
  world.approachRoadExcludes=(x,z)=>{
    for(const {a,b,width} of grid.get(`${Math.floor(x/100)}:${Math.floor(z/100)}`)||[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
      if(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<width/2+11)return true;
    }return false;
  };
  world.approachRoads={group,roads,markers:markers.length};world.scene.add(group);
  // The shared CC0 asphalt set finishes loading separately from the geometry.
  world.approachRoadMaterial=asphalt;
}
