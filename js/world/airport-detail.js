// Static airport fittings. Repeated pieces are instanced to keep the cost small.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';

export function addAirportDetail(scene, lowDetail) {
  const batches = new Map(), rng = makeRng(941);
  const add = (color, x, y, z, w, h, d, yaw = 0, metallic = false) => {
    const key = `${color}:${metallic}`;
    if (!batches.has(key)) batches.set(key, { color, metallic, transforms: [] });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x,y,z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(w,h,d));
    batches.get(key).transforms.push(m);
  };
  // Terminal curtain wall, horizontal bands and roof plant.
  for (let x=-205;x<=205;x+=9) {
    add(0x354f58,x,11,429.75,7.8,15,0.25,0,true);
    add(0xc7c8bf,x+4.25,11,429.4,0.55,20,0.8,0,true);
  }
  for (const y of [4,11,18]) add(0xa6aaa4,0,y,429.3,420,0.5,0.8,0,true);
  add(0xc9cac2,0,22.5,454,435,1.2,78,0,true);
  for (let x=-180;x<200;x+=28) add(0x818a89,x,24.4,467,10,3,8,0,true);
  // Hangar door reveals, ribs and roof ridge caps.
  for (let i=0;i<3;i++) {
    const x=700+i*110;
    add(0x414a4a,x,10.5,264.6,78,20,0.6,0,true);
    for (let dx=-39;dx<=39;dx+=6) add(0xa0a8a5,x+dx,10.5,264.2,0.45,20,0.6,0,true);
    add(0xc4c8c1,x,24.5,300,94,1,74,0,true);
  }
  // Jet bridges, yellow stand guidance and ramp service vehicles.
  for (let i=0;i<5;i++) {
    const x=-320+i*160;
    add(0xa6acaa,x-11,4.8,414,4.2,3.2,34,0,true);
    add(0x485b61,x-13.2,5,414,0.12,1.2,31,0,true);
    add(0x747e7c,x-11,2,401,1.6,4,1.6,0,true);
    add(0xc8a24a,x,0.037,331,0.22,0.01,66);
    add(0xc8a24a,x,0.038,357,16,0.01,0.22);
    add(0xc8a24a,x-40,0.037,348,0.2,0.01,80);
    add(0xc8a24a,x+40,0.037,348,0.2,0.01,80);
    add(0xdddcd1,x+24,1,383,2.4,1.8,5.8);
    add(0x2d424b,x+24,1.75,381.4,2.15,0.8,1.5,0,true);
    for (const dx of [-1.25,1.25]) for (const dz of [-1.8,1.8]) add(0x202523,x+24+dx,0.45,383+dz,0.3,0.8,0.8);
  }
  // Airport service-road dashes, perimeter posts and fine fence rails.
  for (let x=-2850;x<=2850;x+=16) add(0xc9c7b7,x,0.04,620,6,0.01,0.16);
  for (const z of [-270,650]) {
    const count=lowDetail?100:200;
    for (let i=0;i<=count;i++) add(0x737e76,-1900+i*3800/count,1.2,z,0.07,2.4,0.07,0,true);
    for (const y of [0.8,1.5,2.1]) add(0x68746c,0,y,z,3800,0.025,0.025,0,true);
  }
  // Parking beside the terminal gives it a believable land-side footprint.
  add(0x525756,30,0.025,555,500,0.018,85);
  for (let x=-200;x<260;x+=7) for (const z of [535,565]) {
    add(0xb3b1a3,x,0.04,z,0.13,0.01,5.5);
    if (rng()<0.2) continue;
    const colors=[0xc9cbc7,0x6c7c83,0x303938,0x8a4840];
    add(colors[Math.floor(rng()*colors.length)],x+3,0.8,z,1.8,1.5,4.1);
  }
  const geometry=new THREE.BoxGeometry(1,1,1);
  for (const batch of batches.values()) {
    const material=new THREE.MeshStandardMaterial({color:batch.color,roughness:batch.metallic?0.48:0.85,metalness:batch.metallic?0.3:0});
    const mesh=new THREE.InstancedMesh(geometry,material,batch.transforms.length);
    batch.transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));
    mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
  }
}

export function addWater(scene) {
  const water = new THREE.MeshStandardMaterial({ color:0x243f40,roughness:0.23,metalness:0.15 });
  const bank = new THREE.MeshStandardMaterial({ color:0x636751,roughness:1 });
  const strip = (width, y, mat) => {
    const vertices=[], indices=[];
    for (let i=0;i<=240;i++) {
      const z=-14000+i*115, x=6500+Math.sin(z/1800)*450+Math.sin(z/570)*95;
      const w=width*(1+0.2*Math.sin(z/1300));
      vertices.push(x-w,y,z,x+w,y,z);
      if(i<240){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);scene.add(mesh);
  };
  strip(58,0.002,bank);strip(48,0.009,water);
  const shape=new THREE.Shape();
  for(let i=0;i<=100;i++){
    const a=i/100*Math.PI*2,r=1100+Math.sin(a*3)*180+Math.cos(a*7)*55;
    const x=Math.cos(a)*r,y=Math.sin(a)*r*0.7;
    if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  const lake=new THREE.Mesh(new THREE.ShapeGeometry(shape),water);
  lake.rotation.x=-Math.PI/2;lake.position.set(-8000,0.009,-5500);scene.add(lake);
}
