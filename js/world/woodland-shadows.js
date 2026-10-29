// Ground-only canopy projections. Reuse the delivered tree silhouettes rather
// than loading a shadow atlas or rendering tens of thousands of shadow casters.
// These do not shadow buildings or other trees, and are not full ray tracing.
import * as THREE from 'three';
import {sceneryGroundCell,sceneryGroundHeight} from './scenery-ground.js';

// Clip both positions and UVs against a half plane. Splitting at the actual
// terrain edges prevents the buried/floating patches of a horizontal tree quad.
function clip(polygon,distance){
  const result=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);
    if(da>=0)result.push(a);
    if((da>=0)!==(db>=0)){
      const f=da/(da-db);result.push(a.map((v,j)=>v+(b[j]-v)*f));
    }
  }
  return result;
}

export function canopyFootprint(tree,form,sun){
  // Bound low-sun stretch; an enormous grazing projection would add overdraw
  // and imply precision that these discrete, ground-only silhouettes cannot offer.
  const horizontal=Math.hypot(sun.x,sun.z),sy=Math.max(.25,sun.y);
  const sx=horizontal>.00001?sun.x/horizontal:0,sz=horizontal>.00001?sun.z/horizontal:1;
  // Match one of the three baked elevations. Light direction changes on scenario
  // selection, not every frame; UVs never turn with the viewer.
  const elevation=Math.round(Math.atan2(sy,horizontal)/(Math.PI/4));
  const pitch=elevation*Math.PI/4,ratio=horizontal/sy;
  const width=tree.w/form.aspect*form.frameScale;
  const depth=(tree.h*(1-Math.sin(pitch)**2)+tree.w/form.aspect*Math.sin(pitch)**2)*form.frameScale;
  const projection=Math.sin(pitch)+Math.cos(pitch)*ratio;
  const cx=tree.x-sx*ratio*tree.h*.5,cz=tree.z-sz*ratio*tree.h*.5;
  const view=((Math.round((tree.yaw-Math.atan2(sx,sz))/(Math.PI/4)+tree.type*2)%8)+8)%8;
  // Winding is clockwise in x/z, hence upward-facing in Three's x/y/z space.
  const quad=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>[
    cx+sz*(u-.5)*width-sx*(v-.5)*depth*projection,
    cz-sx*(u-.5)*width-sz*(v-.5)*depth*projection,u,v
  ]);
  return {quad,view,elevation};
}

export function drapeCanopy(quad,low,emit){
  const minX=Math.min(...quad.map(p=>p[0])),maxX=Math.max(...quad.map(p=>p[0]));
  const minZ=Math.min(...quad.map(p=>p[1])),maxZ=Math.max(...quad.map(p=>p[1]));
  // A crown may cross a terrain-grid seam. Query each cell rather than assuming
  // a global grid spacing (the outer landscape uses a coarser mesh).
  for(let x=minX;x<maxX-.00001;){
    let nextX=maxX;
    for(let z=minZ;z<maxZ-.00001;){
      const cell=sceneryGroundCell(x+.000001,z+.000001,low),x1=cell.x+cell.step,z1=cell.z+cell.step;
      nextX=Math.min(nextX,x1);
      let p=clip(quad,v=>v[0]-cell.x);p=clip(p,v=>x1-v[0]);
      p=clip(p,v=>v[1]-cell.z);p=clip(p,v=>z1-v[1]);
      const diagonal=v=>cell.step-(v[0]-cell.x)-(v[1]-cell.z);
      for(const half of [clip(p,diagonal),clip(p,v=>-diagonal(v))]){
        for(let i=1;i<half.length-1;i++){
          const a=half[0],b=half[i],c=half[i+1];
          if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>.0001)emit(a,b,c);
        }
      }
      z=z1;
    }
    x=nextX;
  }
}

function* shadowGeometry(trees,atlas,sun,low){
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<trees.length;i++){
    if((i&63)===0)yield;
    const tree=trees[i];
    const {quad,view,elevation}=canopyFootprint(tree,atlas.species[tree.row],sun);
    const vertices=new Map();
    drapeCanopy(quad,low,(...triangle)=>{
      for(const p of triangle){
        if(vertices.has(p)){indices.push(vertices.get(p));continue;}
        const [x,z,u,v]=p,index=positions.length/3;vertices.set(p,index);indices.push(index);
        positions.push(x,sceneryGroundHeight(x,z,low)+.035,z);
        uvs.push((view+.004+.992*u)/atlas.columns,(atlas.rows*3-1-tree.row*3-elevation+.004+.992*v)/(atlas.rows*3));
      }
    });
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeBoundingSphere();return g;
}

export async function addWoodlandShadows(world,patches,atlas,texture,checkpoint=()=>null){
  const group=new THREE.Group();group.name='Terrain-following canopy shade';
  const material=new THREE.MeshBasicMaterial({map:texture,color:0x000000,transparent:true,opacity:.18,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.onBeforeCompile=shader=>{
    THREE.Material.prototype.onBeforeCompile.call(material,shader);
    // Only coverage comes from the shared colour atlas. A small mip bias softens
    // leaf edges without another texture or multi-tap filtering pass.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      diffuseColor.a*=texture2D(map,vMapUv,1.0).a;
    `);
  };
  let key='';
  const stats={trees:[...patches.values()].reduce((n,p)=>n+p.length,0),triangles:0,bytes:0,buildMs:0,builds:0};
  function visible(){
    group.visible=!world.night&&!world.hasDeck&&world.baseOvercast<=.5;
    material.opacity=world.scenario?.timeOfDay==='dusk'?.14:.18;
    return group.visible;
  }
  function* build(){
    const sun=world.lightDir.clone();key=sun.toArray().map(v=>v.toFixed(3)).join(',');
    const start=performance.now();stats.triangles=stats.bytes=0;stats.builds++;
    for(const child of [...group.children]){child.geometry.dispose();group.remove(child);}
    for(const trees of patches.values()){
      const g=yield* shadowGeometry(trees,atlas,sun,world.groundLowDetail),mesh=new THREE.Mesh(g,material);
      mesh.name='Projected tree silhouettes';mesh.renderOrder=1;group.add(mesh);
      stats.triangles+=g.index.count/3;
      stats.bytes+=g.attributes.position.array.byteLength+g.attributes.uv.array.byteLength+g.index.array.byteLength;
    }
    stats.buildMs=performance.now()-start;
  }
  function update(){
    // Weather changes keep the sunlit geometry. A new sun direction still rebuilds
    // synchronously; initial preparation below yields without exposing partial shade.
    if(!visible()||world.lightDir.toArray().map(v=>v.toFixed(3)).join(',')===key)return;
    const task=build();while(!task.next().done){};
  }
  if(visible()){
    const task=build();
    while(!task.next().done){const pause=checkpoint();if(pause)await pause;}
  }
  world.scene.add(group);const shadows={group,material,stats,update};world.woodlandShadows=shadows;
  update();return shadows;

}
