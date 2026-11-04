// Bake the delivered CC BY 4.0 forward-panel lettering, not a substitute font.
// Usage: node tools/prepare-cockpit-labels.mjs [source.glb] [output.glb]
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const input=process.argv[2]||'assets/models/737-cockpit.glb',output=process.argv[3]||'assets/models/737-forward-labels.glb';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const source=await io.read(input),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Source forward lettering');
const groups=[],glyphs=[],density=2560,pad=8,margin=4;
for(const node of source.getRoot().listNodes()){
  if(!/^Text/.test(node.getName())||node.getParentNode())continue; // Moving yokes are outside this pass.
  for(const primitive of node.getMesh()?.listPrimitives()||[]){
    const p=primitive.getAttribute('POSITION'),ao=primitive.getAttribute('COLOR_0'),indices=primitive.getIndices();
    const count=p.getCount(),pos=new Float64Array(count*3),parent=new Int32Array(count),positions=new Map();
    const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),v=new THREE.Vector3();
    const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{parent[root(a)]=root(b);};
    for(let i=0;i<count;i++){
      v.fromArray(p.getElement(i,[])).applyMatrix4(matrix);v.toArray(pos,i*3);parent[i]=i;
      const key=v.toArray().map(x=>Math.round(x*20000)).join(',');
      if(positions.has(key))join(i,positions.get(key));else positions.set(key,i);
    }
    for(let i=0;i<indices.getCount();i+=3){const a=indices.getScalar(i);join(a,indices.getScalar(i+1));join(a,indices.getScalar(i+2));}
    const components=new Map();
    for(let i=0;i<count;i++){
      const id=root(i);if(!components.has(id))components.set(id,{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],vertices:[],faces:[]});
      const c=components.get(id);c.vertices.push(i);
      for(let k=0;k<3;k++){c.min[k]=Math.min(c.min[k],pos[i*3+k]);c.max[k]=Math.max(c.max[k],pos[i*3+k]);}
    }
    for(let i=0;i<indices.getCount();i+=3)components.get(root(indices.getScalar(i))).faces.push(i);
    const group={source:node.getName(),vertexCount:count,indexCount:indices.getCount(),remove:[],glyphs:[],material:primitive.getMaterial()};
    for(const c of components.values()){
      const size=c.max.map((v,i)=>v-c.min[i]);
      // Thin, forward-facing marks on the MCP and main panel. Joined source
      // meshes also contain solid parts: exclude every thick/large component.
      if(!(c.min[0]>-.85&&c.max[0]<.75&&c.min[1]>-.65&&c.max[1]<0&&c.min[2]>-1.01&&c.max[2]<-.85&&size[2]<.0016&&Math.max(size[0],size[1])<.05&&Math.min(size[0],size[1])>.00015))continue;
      const normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),cc=new THREE.Vector3();
      for(const face of c.faces){
        a.fromArray(pos,indices.getScalar(face)*3);b.fromArray(pos,indices.getScalar(face+1)*3).sub(a);cc.fromArray(pos,indices.getScalar(face+2)*3).sub(a);
        b.cross(cc);if(b.z>0&&b.z/b.length()>.9)normal.add(b);
      }
      if(normal.lengthSq()<1e-16)continue;
      normal.normalize();const depth=Math.max(...c.vertices.map(i=>normal.dot(v.fromArray(pos,i*3))));
      const glyph={...c,group,pos,indices,normal:normal.toArray(),depth,w:Math.ceil(size[0]*density)+2,h:Math.ceil(size[1]*density)+2,
        ao:c.vertices.reduce((s,i)=>s+ao.getElement(i,[])[0],0)/c.vertices.length};
      glyphs.push(glyph);group.glyphs.push(glyph);group.remove.push(...c.faces);
    }
    if(group.glyphs.length)groups.push(group);
  }
}
// Combine neighbouring coplanar glyphs before filtering. Filtering each character
// on a separate transparent quad loses area when their filter footprints overlap.
const glyphCount=glyphs.length;glyphs.length=0;
for(const group of groups){
  const originals=group.glyphs,parents=originals.map((_,i)=>i),root=i=>{while(parents[i]!==i)i=parents[i];return i;};
  for(let i=0;i<originals.length;i++)for(let j=i+1;j<originals.length;j++){
    const a=originals[i],b=originals[j];
    if(a.normal.reduce((s,v,k)=>s+v*b.normal[k],0)<.9999||Math.abs(a.depth-b.depth)>.00015)continue;
    const dx=Math.max(0,a.min[0]-b.max[0],b.min[0]-a.max[0]),dy=Math.max(0,a.min[1]-b.max[1],b.min[1]-a.max[1]);
    if(dx<.003&&dy<.001)parents[root(i)]=root(j);
  }
  const merged=new Map();for(let i=0;i<originals.length;i++){
    const g=originals[i],id=root(i);if(!merged.has(id))merged.set(id,{...g,min:[...g.min],max:[...g.max],faces:[],ao:0,weight:0});
    const m=merged.get(id);m.faces.push(...g.faces);m.ao+=g.ao*g.faces.length;m.weight+=g.faces.length;
    for(let k=0;k<3;k++){m.min[k]=Math.min(m.min[k],g.min[k]);m.max[k]=Math.max(m.max[k],g.max[k]);}
  }
  group.glyphs=[...merged.values()];
  for(const g of group.glyphs){g.ao/=g.weight;g.w=Math.ceil((g.max[0]-g.min[0])*density)+2;g.h=Math.ceil((g.max[1]-g.min[1])*density)+2;glyphs.push(g);}
}
// Transparent gutters separate the label patches during minification.
const width=2048;let x=0,y=0,row=0;
for(const g of [...glyphs].sort((a,b)=>b.h-a.h)){
  if(x+g.w+pad*2>width){x=0;y+=row;row=0;}
  g.tx=x+pad;g.ty=y+pad;x+=g.w+pad*2;row=Math.max(row,g.h+pad*2);
}
const height=2**Math.ceil(Math.log2(y+row)),paths=[];
for(const g of glyphs){
  const path=[];
  for(const face of g.faces){
    const points=[0,1,2].map(k=>{const i=g.indices.getScalar(face+k)*3;return [g.tx+1+(g.pos[i]-g.min[0])*density,g.ty+1+(g.max[1]-g.pos[i+1])*density];});
    const [a,b,c]=points;if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-7)continue;
    // Consistent winding makes the projected cap and bevel a union, including
    // the counters of letters, rather than cancelling front/back faces.
    if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0)points.reverse();
    path.push('M'+points.map(p=>p.map(v=>v.toFixed(3)).join(',')).join('L')+'Z');
  }
  paths.push(`<path d="${path.join('')}" fill="white"/>`);
}
const rgba=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths.join('')}</svg>`)).ensureAlpha().raw().toBuffer();
// Transparent texels carry white too: filtering coverage must not darken the
// letter a second time through a black RGB fringe.
for(let i=0;i<rgba.length;i+=4)rgba[i]=rgba[i+1]=rgba[i+2]=255;
const png=await sharp(rgba,{raw:{width,height,channels:4}}).png({palette:true,colours:256,dither:0,effort:10,quality:100}).toBuffer();
const decoded=await sharp(png).ensureAlpha().raw().toBuffer();
for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==decoded[i])throw new Error('Palette encoding altered label coverage');
const texture=doc.createTexture('Source forward label coverage').setImage(png).setMimeType('image/png');
const accessor=(name,type,data)=>doc.createAccessor(name).setType(type).setArray(data).setBuffer(buffer);
for(const group of groups){
  const positions=[],normals=[],colors=[],uv=[],index=[];
  for(const g of group.glyphs){
    const left=g.min[0]-(1+margin)/density,right=left+(g.w+margin*2)/density,top=g.max[1]+(1+margin)/density,bottom=top-(g.h+margin*2)/density;
    const start=positions.length/3;
    for(const [xx,yy,u,v]of [[left,bottom,g.tx-margin,g.ty+g.h+margin],[right,bottom,g.tx+g.w+margin,g.ty+g.h+margin],[right,top,g.tx+g.w+margin,g.ty-margin],[left,top,g.tx-margin,g.ty-margin]]){
      const [nx,ny,nz]=g.normal,z=(g.depth-nx*xx-ny*yy)/nz+.00005;
      positions.push(xx,yy,z);normals.push(nx,ny,nz);colors.push(g.ao,g.ao,g.ao);uv.push(u/width,v/height);
    }
    index.push(start,start+1,start+2,start,start+2,start+3);
  }
  const ranges=[];for(const i of group.remove.sort((a,b)=>a-b)){const last=ranges.at(-1);if(last&&last[0]+last[1]===i)last[1]+=3;else ranges.push([i,3]);}
  const original=group.material,material=doc.createMaterial(original.getName()).setBaseColorFactor(original.getBaseColorFactor())
    .setMetallicFactor(original.getMetallicFactor()).setRoughnessFactor(original.getRoughnessFactor()).setAlphaMode('BLEND').setDoubleSided(true).setBaseColorTexture(texture);
  const primitive=doc.createPrimitive().setAttribute('POSITION',accessor('Position','VEC3',new Float32Array(positions)))
    .setAttribute('NORMAL',accessor('Normal','VEC3',new Float32Array(normals))).setAttribute('COLOR_0',accessor('Occlusion','VEC3',new Float32Array(colors)))
    .setAttribute('TEXCOORD_0',accessor('Coverage UV','VEC2',new Float32Array(uv))).setIndices(accessor('Triangles','SCALAR',new Uint16Array(index))).setMaterial(material);
  const mesh=doc.createMesh('TextAtlas '+group.source).addPrimitive(primitive);
  scene.addChild(doc.createNode('TextAtlas '+group.source).setMesh(mesh).setExtras({source:group.source,vertexCount:group.vertexCount,indexCount:group.indexCount,remove:ranges,glyphs:group.glyphs.length}));
}
scene.setExtras({sourceHash:crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex'),glyphs:glyphCount,patches:glyphs.length,width,height,density});
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeTexcoord:16}));
await io.write(output,doc);
console.log({glyphs:glyphCount,patches:glyphs.length,groups:groups.length,sourceTriangles:groups.reduce((s,g)=>s+g.remove.length,0),addedTriangles:glyphs.length*2,width,height,bytes:(await fs.stat(output)).size});
