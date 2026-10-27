import * as THREE from 'three';

// Optional retaining walls below level authored floors on sloping terrain.
// Polygons use the same local frame as the model, including compound roof wings.
export function farmFoundation(polygons,building,floor,ground,ramps=[]){
 const p=[],uv=[],indices=[],c=Math.cos(building.angle),s=Math.sin(building.angle);
 for(const polygon of polygons){
  const ring=polygon.map(([u,v])=>[building.x+u*c-v*s,building.z+u*s+v*c]);
  const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(area<0)ring.reverse();
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/2);
   for(let j=0;j<steps;j++){
    const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],q=at(j/steps),r=at((j+1)/steps);
    const bottomQ=Math.min(floor,ground(...q)-.08),bottomR=Math.min(floor,ground(...r)-.08),top=floor+.18,n=p.length/3;
    p.push(q[0],bottomQ,q[1],q[0],top,q[1],r[0],top,r[1],r[0],bottomR,r[1]);
    uv.push(j*length/steps,bottomQ,j*length/steps,top,(j+1)*length/steps,top,(j+1)*length/steps,bottomR);
    indices.push(n,n+1,n+2,n,n+2,n+3);
   }
  }
 }
 // Road-facing doors meet the occupied yard through short concrete ramps.
 // Each sampled edge stays above terrain and the far end lands on it.
 for(const ramp of ramps){
  const [u,v]=ramp.center,[du,dv]=ramp.out,sections=[],setback=.75,steps=Math.ceil((ramp.length-setback)/2);
  const point=(along,side)=>{
   const x=u+du*along-dv*side,z=v+dv*along+du*side;
   return [building.x+x*c-z*s,building.z+x*s+z*c];
  };
  for(let j=0;j<=steps;j++){
   const t=j/steps;
   sections.push([-1,1].map(sign=>{
    const q=point(setback+t*(ramp.length-setback),sign*ramp.width/2),end=point(ramp.length,sign*ramp.width/2),height=ground(...q);
    return [q[0],Math.max(height+.04,(floor+.30)*(1-t)+(ground(...end)+.04)*t),q[1],height-.08];
   }));
  }
  const face=(verts,up=false)=>{
   if(up){const a=verts[0],b=verts[1],d=verts[2];if((b[2]-a[2])*(d[0]-a[0])-(b[0]-a[0])*(d[2]-a[2])<0)verts.reverse();}
   const n=p.length/3;for(const [x,y,z] of verts){p.push(x,y,z);uv.push(x,z);}indices.push(n,n+1,n+2,n,n+2,n+3);
  };
  for(let j=0;j<steps;j++){
   const [a,b]=sections[j],[d,e]=sections[j+1];face([a,b,e,d],true);
   for(const [q,r] of [[d,a],[b,e]])face([q,[q[0],q[3],q[2]],[r[0],r[3],r[2]],r]);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.computeVertexNormals();return geometry;
}
