// Terrain-following projected silhouettes with a feathered edge. Kept local and
// batched because a valley-wide shadow map cannot resolve small farm buildings.
import * as THREE from 'three';

function convexHull(points){
  const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=list=>{const h=[];for(const v of list){while(h.length>1&&cross(h.at(-2),h.at(-1),v)<=0)h.pop();h.push(v);}return h;};
  return half(p).slice(0,-1).concat(half([...p].reverse()).slice(0,-1));
}

function offsetHull(hull,distance){
  return hull.map((p,i)=>{
    const a=hull[(i+hull.length-1)%hull.length],b=hull[(i+1)%hull.length];
    const n1=new THREE.Vector2(p[1]-a[1],a[0]-p[0]).normalize();
    const n2=new THREE.Vector2(b[1]-p[1],p[0]-b[0]).normalize();
    const bisector=n1.clone().add(n2).normalize();
    const offset=Math.min(Math.abs(distance)/Math.max(.25,bisector.dot(n1)),Math.abs(distance)*2)*Math.sign(distance);
    return [p[0]+bisector.x*offset,p[1]+bisector.y*offset];
  });
}

export function buildShadowMeshes(buildings,sun,ground,material){
  const batches=new Map();
  for(const b of buildings){
    const key=`${Math.floor(b.x/1000)}:${Math.floor(b.z/1000)}`;
    if(!batches.has(key))batches.set(key,{positions:[],colors:[]});
    const batch=batches.get(key),dx=-sun.x/Math.max(.25,sun.y)*b.height,dz=-sun.z/Math.max(.25,sun.y)*b.height;
    const hull=convexHull(b.outline.flatMap(([x,z])=>[[b.x+x,b.z+z],[b.x+x+dx,b.z+z+dz]]));
    const feather=Math.min(1.8,.35+b.height*.075,Math.min(b.w,b.d)*.15);
    const inner=offsetHull(hull,-feather*.4),outer=offsetHull(hull,feather);
    const vertex=(p,alpha)=>[p[0],p[1],alpha];
    const emit=(a,b,c,depth=0)=>{
      // Discard slivers that can reverse winding after world coordinates become float32.
      if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<.001)return;
      // Subdivide long triangles to follow the same terrain used by the imagery.
      const pairs=[[a,b,c],[b,c,a],[c,a,b]].sort((p,q)=>Math.hypot(q[0][0]-q[1][0],q[0][1]-q[1][1])-Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]));
      const [u,v,w]=pairs[0];
      if(depth<7&&Math.hypot(u[0]-v[0],u[1]-v[1])>16){
        const mid=u.map((x,i)=>(x+v[i])*.5);emit(u,mid,w,depth+1);emit(mid,v,w,depth+1);return;
      }
      for(const p of [a,c,b]){batch.positions.push(p[0],ground(p[0],p[1])+.10,p[1]);batch.colors.push(1,1,1,p[2]);}
    };
    for(let i=1;i<inner.length-1;i++)emit(vertex(inner[0],1),vertex(inner[i],1),vertex(inner[i+1],1));
    for(let i=0;i<hull.length;i++){
      const j=(i+1)%hull.length,a=vertex(inner[i],1),b=vertex(outer[i],0),c=vertex(outer[j],0),d=vertex(inner[j],1);
      emit(a,b,c);emit(a,c,d);
    }
  }
  return [...batches.values()].map(({positions,colors})=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);mesh.name='Feathered building shadow';mesh.renderOrder=1;return mesh;
  });
}
