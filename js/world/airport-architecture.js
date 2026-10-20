// Original architecture for the fictional airport. Metric geometry, window rooms
// and signage share the world's ordinary lighting, haze and shadow path.
import * as THREE from 'three';
import {applyAirportGlass,paneFrame} from './airport-glass.js';

export function buildAirportArchitecture(scene,low=false,aniso=1){
  const root=new THREE.Group();root.name='Westhaven airport architecture';scene.add(root);
  const materials={
    solid:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}),
    metal:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.52,metalness:.42}),
    glass:new THREE.MeshStandardMaterial({roughness:.10,metalness:0,envMapIntensity:1.25,emissive:0xe9e2d2,emissiveIntensity:0}),
    roof:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.67,metalness:.27,side:THREE.DoubleSide}),
  };
  applyAirportGlass(materials.glass);
  const batches=new Map(),unit=new THREE.BoxGeometry(1,1,1).toNonIndexed();
  const color=new THREE.Color();let zone='terminal';
  const data=kind=>{
    const key=zone+':'+kind;
    if(!batches.has(key))batches.set(key,{zone,kind,p:[],n:[],uv:[],color:[],paneUV:[],paneSize:[],paneRight:[],paneUp:[],paneVariant:[]});
    return batches.get(key);
  };
  const box=(kind,x,y,z,w,h,d,tint=0xb1b6b1,yaw=0)=>{
    const b=data(kind),p=unit.attributes.position,n=unit.attributes.normal,co=Math.cos(yaw),si=Math.sin(yaw);color.set(tint);
    for(let i=0;i<p.count;i++){
      const xx=p.getX(i)*w,zz=p.getZ(i)*d,nx=n.getX(i),nz=n.getZ(i);
      b.p.push(x+xx*co+zz*si,y+p.getY(i)*h,z-xx*si+zz*co);
      b.n.push(nx*co+nz*si,n.getY(i),-nx*si+nz*co);b.uv.push(0,0);b.color.push(color.r,color.g,color.b);
    }
  };
  const quad=(kind,a,b,c,d,tint=0xffffff,id=0,span=1,offset=0,gap=0)=>{
    const batch=data(kind),normal=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a))).normalize();
    color.set(tint);
    const corners=[a,b,c,...(c.every((v,i)=>v===d[i])||a.every((v,i)=>v===d[i])?[]:[a,c,d])];
    const uvs=b[1]>a[1]?[[0,0],[0,1],[1,1],[0,0],[1,1],[1,0]]:[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];
    if(kind==='glass'){
      const frame=paneFrame(a,b,c,d),stride=frame.size[0]+gap,width=stride*span;
      // Include the mullion gaps in the room coordinates: neighboring panes
      // look into one continuous hall, not slightly shifted copies of it.
      for(const uv of uvs){batch.paneUV.push((uv[0]*frame.size[0]+offset*stride+gap/2)/width,uv[1]);batch.paneSize.push(width,frame.size[1]);batch.paneRight.push(...frame.right);batch.paneUp.push(...frame.up);batch.paneVariant.push(id);}
    }
    corners.forEach((p,i)=>{batch.p.push(...p);batch.n.push(normal.x,normal.y,normal.z);batch.uv.push(...uvs[i]);batch.color.push(color.r,color.g,color.b);});
  };
  const beam=(a,b,width,tint=0xa7ada8)=>{
    // Uprights and horizontal beams are boxes; sloping braces use a transformed unit box.
    const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b),mid=aa.clone().add(bb).multiplyScalar(.5);
    const m=new THREE.Matrix4().compose(mid,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),bb.clone().sub(aa).normalize()),new THREE.Vector3(width,aa.distanceTo(bb),width));
    const rot=new THREE.Matrix3().getNormalMatrix(m),p=new THREE.Vector3(),n=new THREE.Vector3(),batch=data('metal');color.set(tint);
    for(let i=0;i<unit.attributes.position.count;i++){
      p.fromBufferAttribute(unit.attributes.position,i).applyMatrix4(m);n.fromBufferAttribute(unit.attributes.normal,i).applyMatrix3(rot).normalize();
      batch.p.push(p.x,p.y,p.z);batch.n.push(n.x,n.y,n.z);batch.uv.push(0,0);batch.color.push(color.r,color.g,color.b);
    }
  };
  for(let gate=0;gate<5;gate++){
    zone=`hall-${gate}`;
    const center=-320+gate*160,width=112,base=[17,19,22,19,17][gate];
    const roofY=z=>base+5.5*Math.sin((z-416)/91*Math.PI);
    // Masonry plinth, recessed ground level and an expressed mezzanine slab.
    box('solid',center,.65,462,width,1.3,71,0x858c87);
    box('solid',center,6.8,461,width,1,72,0xb2b6af);
    for(const z of [426,497]){
      for(let j=0;j<16;j++){
        const x=center-width/2+j*7;
        for(const [bottom,top] of [[1.3,6.3],[7.3,base-1],[base-.8,roofY(z)-.5]]){
          if(z===426)quad('glass',[x+.15,bottom,z],[x+.15,top,z],[x+6.85,top,z],[x+6.85,bottom,z],0xffffff,(Math.floor(j/4)+gate*3)%8,4,j%4,.3);
          else quad('glass',[x+6.85,bottom,z],[x+6.85,top,z],[x+.15,top,z],[x+.15,bottom,z],0xffffff,(Math.floor(j/4)+gate*3)%8,4,3-j%4,.3);
        }
        box('metal',x,base/2,z+(z===426?-.25:.25),.18,base,.4,0x9aa7a6);
      }
      for(const y of [1.2,7.1,base-1])box('metal',center,y,z+(z===426?-.3:.3),width,.22,.5,0xc1c6c0);
    }
    for(const side of [-1,1]){
      const x=center+side*width/2;
      for(let j=0;j<10;j++){
        const z=426+j*7.1,h=roofY(z+3.55)-.8;
        const a=[x,1.3,z+.1],b=[x,1.3,z+7],c=[x,h,z+7],d=[x,h,z+.1];
        if(side<0)quad('glass',a,b,c,d,0xffffff,(j+gate)%8);else quad('glass',b,a,d,c,0xffffff,(j+gate)%8);
        box('metal',x+side*.24,h/2,z,.38,h,.18,0x9ba5a1);
      }
    }
    // Roof panels use metric seams; wider front overhang shades the curtain wall.
    for(let z=416;z<507;z+=7){
      const end=Math.min(507,z+7),a=roofY(z),b=roofY(end),left=center-61,right=center+61;
      quad('roof',[left,a,z],[left,b,end],[right,b,end],[right,a,z],gate===2?0x9da7a6:0x899698);
      for(const x of [left,right])quad('roof',[x,a-.6,z],[x,a,z],[x,b,end],[x,b-.6,end],0x606e72);
      if(!low)for(let x=left+4;x<right;x+=4)quad('roof',[x,a+.03,z],[x,b+.03,end],[x+.07,b+.03,end],[x+.07,a+.03,z],0x5c6b70);
    }
    // Deep front fascia, V-shaped supports and screened rooftop equipment.
    box('metal',center,base-.3,416,122,.65,.4,0xb5bfbd);
    for(const x of [center-48,center,center+48]){
      box('solid',x,3.2,420,1,6.4,1.2,0xbac0b6);
      beam([x,6.4,420],[x-3.5,base-.6,420],.26);beam([x,6.4,420],[x+3.5,base-.6,420],.26);
    }
    box('metal',center,7.1,420,115,.45,11,0x899694);
    box('solid',center,roofY(490)+.8,490,18,1.6,9,0x4c595a);
    for(const z of [485.2,494.8])for(let y=0;y<3;y++)box('metal',center,roofY(490)+.3+y*.5,z,20,.16,.18,0x8c9797);
  }
  zone='connections';
  // Four enclosed galleries replace the disconnected appearance between halls.
  for(const x of [-240,-80,80,240]){
    box('solid',x,.6,460,48,1.2,58,0x939b94);box('solid',x,7,460,48,.65,58,0xb3b9b1);
    box('roof',x,12.3,460,50,.55,60,0x7d8b8b);
    box('solid',x,6.6,489,48,11.4,.3,0xa7b0a9);
    for(let j=0;j<8;j++){
      const left=x-24+j*6;
      quad('glass',[left,1.2,431],[left,11.8,431],[left+5.8,11.8,431],[left+5.8,1.2,431],0xffffff,Math.floor(j/4),4,j%4,.2);
      box('metal',left,6.5,430.8,.18,11,.35,0x9ca8a6);
    }
    // Stair/service cores provide quiet solid areas between glass volumes.
    box('solid',x+15,8,478,15,16,29,0xa7aaa2);
    box('metal',x+15,16.1,478,16,.35,30,0x727f7e);
  }
  for(const side of [-1,1]){
    const x=side*430;
    box('solid',x,5.8,480,103,11.6,72,0xb4b8ae);box('roof',x,11.9,480,106,.6,75,0x7f8d8c);
    for(let j=0;j<17;j++){
      const left=x-50+j*6;
      quad('glass',[left,3,443.9],[left,8.8,443.9],[left+5.6,8.8,443.9],[left+5.6,3,443.9],0xffffff,j%8);
    }
    box('metal',x,9,442,104,.3,4,0x8c9997);
  }
  zone='hangars';
  for(let i=0;i<3;i++){
    const x=700+i*110;
    box('solid',x,12,300,90,24,70,0x9da5a1);
    box('metal',x,10.5,264.6,80,21,.4,0x485a61);
    for(let dx=-40;dx<=40;dx+=8){
      box('metal',x+dx,10.5,264.2,.3,21,.5,0x9aa7a7);
      if(dx<40)quad('glass',[x+dx+.4,14,264.25],[x+dx+.4,18,264.25],[x+dx+7.6,18,264.25],[x+dx+7.6,14,264.25],0xffffff,(i+dx/8+5)%8);
    }
    box('metal',x,21.6,263,84,.8,3,0x687878);
    for(const side of [-1,1]){
      const a=[x,27,262],b=[x+side*47,24,262],c=[x+side*47,24,338],d=[x,27,338];
      if(side<0)quad('roof',a,b,c,d,0x83928f);else quad('roof',d,c,b,a,0x83928f);
      // Solid eaves avoid exposing a zero-thickness roof edge from the runway.
      quad('roof',[a[0],a[1]-.5,a[2]],a,b,[b[0],b[1]-.5,b[2]],0x6d7e7b);
      quad('roof',d,[d[0],d[1]-.5,d[2]],[c[0],c[1]-.5,c[2]],c,0x6d7e7b);
    }
    box('solid',x,1,264.05,90,2,.3,0x677773);
    // Close the pitched gables, then articulate the broad approach-facing sides.
    quad('solid',[x-45,24,264.9],[x,27,264.9],[x+45,24,264.9],[x+45,24,264.9],0x9da5a1);
    quad('solid',[x+45,24,335.1],[x,27,335.1],[x-45,24,335.1],[x-45,24,335.1],0x9da5a1);
    for(const side of [-1,1]){
      const sx=x+side*45.08;
      for(let z=268;z<335;z+=low?12:4)box('metal',sx,12,z,.12,24,.13,0x899995);
      box('solid',sx,1,300,.18,2,70,0x7d8d86);
      box('metal',sx+side*.15,2,279,.15,3,2,0x405651);
      box('metal',sx+side*1,3.8,279,2,.16,3.2,0x748a83);
    }
  }
  zone='tower';
  const tx=-250,tz=330;
  box('solid',tx,.45,tz,26,.9,24,0x8c9992);
  box('solid',tx-8,2.5,tz+3,15,5,16,0xa8b2aa);
  box('roof',tx-8,5.2,tz+3,16,.4,17,0x758780);
  box('metal',tx-8,2.1,tz-5.1,2.2,3,.12,0x30474c);
  box('metal',tx-8,4.1,tz-6.2,4,.2,2.4,0x81918c);
  box('solid',tx,24,tz,9,48,10,0xb6bdb5);
  for(const side of [-1,1])box('solid',tx+side*5,24,tz,1.5,48,12,0x899793);
  for(let y=8;y<47;y+=6)quad('glass',[tx-1.1,y,tz-5.02],[tx-1.1,y+3.2,tz-5.02],[tx+1.1,y+3.2,tz-5.02],[tx+1.1,y,tz-5.02],0xffffff,6);
  // Outward-sloping eight-sided cab, deep roof and open maintenance balcony.
  const sides=8,point=(i,r,y)=>[tx+Math.cos(i*Math.PI/4)*r,y,tz+Math.sin(i*Math.PI/4)*r];
  for(let i=0;i<sides;i++){
    const a=point(i,8.4,50),b=point(i+1,8.4,50),c=point(i+1,10.5,57),d=point(i,10.5,57);
    quad('glass',b,a,d,c,0xffffff,2);
    quad('roof',point(i+1,4.8,47.8),point(i,4.8,47.8),a,b,0x8c9996);
    beam(a,d,.22,0x55666c);
    quad('roof',point(i+1,11.7,58),point(i,11.7,58),[tx,59,tz],[tx,59,tz],0x6b7d80);
    quad('metal',point(i,11.7,57.3),point(i+1,11.7,57.3),point(i+1,11.7,58),point(i,11.7,58),0x788a8c);
    quad('roof',[tx,49.7,tz],point(i+1,12,49.7),point(i,12,49.7),[tx,49.7,tz],0x81918d);
    beam(point(i,11.7,49.7),point(i,11.7,51),.09,0x9aa6a3);
    for(const y of [50.2,51])beam(point(i,11.7,y),point(i+1,11.7,y),.07,0x9aa6a3);
  }
  box('metal',tx+3,61,tz+1,.14,5,.14,0xbac1ba);
  box('metal',tx-3,60.1,tz-2,.24,3,.24,0xbac1ba);
  // Flush terminal lettering uses one small atlas, with no external font request.
  const signs=document.createElement('canvas');signs.width=low?512:1024;signs.height=low?64:128;
  const sc=signs.getContext('2d');if(low)sc.scale(.5,.5);sc.fillStyle='#243d46';sc.fillRect(0,0,1024,128);sc.fillStyle='#dee3db';
  sc.font='500 52px sans-serif';sc.textAlign='center';sc.fillText('WESTHAVEN',512,53);sc.font='22px sans-serif';sc.fillText('I N T E R N A T I O N A L',512,91);
  const signMap=new THREE.CanvasTexture(signs);signMap.colorSpace=THREE.SRGBColorSpace;signMap.anisotropy=aniso;
  const signMat=new THREE.MeshStandardMaterial({map:signMap,roughness:.7,emissiveMap:signMap,emissive:0xffffff,emissiveIntensity:0});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(48,6),signMat);sign.rotation.y=Math.PI;sign.position.set(0,17.8,425.85);root.add(sign);sign.name='Terminal name';
  for(const batch of batches.values()){
    const geometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',batch.p,3],['normal',batch.n,3],['uv',batch.uv,2],['color',batch.color,3]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
    if(batch.kind==='glass')for(const [name,size] of [['paneUV',2],['paneSize',2],['paneRight',3],['paneUp',3],['paneVariant',1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(batch[name],size));
    geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,materials[batch.kind]);mesh.name=batch.zone+':'+batch.kind;
    mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  unit.dispose();
  const triangles=root.children.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
  return {root,materials,triangles,textures:[signMap],setTimeOfDay(tod){
    materials.glass.emissiveIntensity=tod==='night'?.65:tod==='dusk'?.22:0;
    signMat.emissiveIntensity=tod==='night'?.45:tod==='dusk'?.16:0;
  }};
}
