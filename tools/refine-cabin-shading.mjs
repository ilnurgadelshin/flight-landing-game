// Refine only the broad painted cockpit faces. Sampling their existing corners
// cannot resolve contact with bezels, the glareshield or neighboring console parts.
// Subdivision is linear: it adds shading samples without smoothing silhouettes.
import * as THREE from 'three';
import {cabinOcclusionSampler} from './bake-cockpit-occlusion.mjs';

const MATERIALS=new Set(['Material.424','Material.219','Material.457','Material.103','Material.261','Material.354']);
const inCabin=p=>Math.abs(p[0])<1.12&&p[1]>-1.04&&p[1]<1.25&&p[2]>-1.45&&p[2]<.25;

export function refineCabinShading(document,{lowDetail=false}={}) {
  // Build against the original triangles: subdivision does not change their shape.
  const sampler=cabinOcclusionSampler(document,{count:128,contactOnly:true}),buffer=document.getRoot().listBuffers()[0];
  const maxEdge=lowDetail?.14:.09,report={parts:0,addedVertices:0,addedTriangles:0,samples:0,details:[]};
  for(const node of document.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
    if(!MATERIALS.has(p.getMaterial()?.getName()))continue;
    // This pass is intentionally limited to static finishes, never moving controls.
    let moving=false;for(let n=node;n;n=n.getParentNode())if(Object.keys(n.getExtras()).some(k=>/Pivot|flightControl/.test(k)))moving=true;
    if(moving)continue;
    const attributes=p.listSemantics(),pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL');
    if(!normal||p.listTargets().length||attributes.some(s=>s.startsWith('JOINTS')))continue;
    const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),nm=new THREE.Matrix3().getNormalMatrix(matrix);
    const v=new THREE.Vector3(),n=new THREE.Vector3(),count=pos.getCount();
    const data=Object.fromEntries(attributes.map(s=>[s,Array.from({length:count},(_,i)=>p.getAttribute(s).getElement(i,[]))]));
    const world=data.POSITION.map(a=>v.fromArray(a).applyMatrix4(matrix).toArray());
    const original=Array.from(p.getIndices().getArray()),indices=[],midpoints=new Map(),parents=[];
    const distance=(a,b)=>world[a].reduce((sum,x,i)=>sum+(x-world[b][i])**2,0);
    function midpoint(a,b){
      const key=a<b?`${a}/${b}`:`${b}/${a}`;
      if(midpoints.has(key))return midpoints.get(key);
      const i=world.length;midpoints.set(key,i);parents.push([a,b]);
      for(const semantic of attributes){
        const value=data[semantic][a].map((x,j)=>(x+data[semantic][b][j])/2);
        if(semantic==='NORMAL')n.fromArray(value).normalize().toArray(value);
        data[semantic].push(value);
      }
      world.push(v.fromArray(data.POSITION[i]).applyMatrix4(matrix).toArray());return i;
    }
    const pending=[];for(let i=0;i<original.length;i+=3)pending.push(original.slice(i,i+3));
    while(pending.length){
      const tri=pending.pop(),[a,b,c]=tri,ds=[distance(a,b),distance(b,c),distance(c,a)],edge=ds.indexOf(Math.max(...ds));
      const centre=[0,1,2].map(j=>(world[a][j]+world[b][j]+world[c][j])/3);
      if(ds[edge]>maxEdge**2&&inCabin(centre)){
        const first=tri[edge],second=tri[(edge+1)%3],third=tri[(edge+2)%3],mid=midpoint(first,second);
        pending.push([first,mid,third],[mid,second,third]);
      }else indices.push(...tri);
    }
    // A different angular sample count alone is not a reason to change tiny parts.
    if(world.length===count)continue;
    // Preserve the existing smoothly interpolated cabin sky-access shading.
    // Replace only its coarse contact component. Re-baking long-range sky access
    // at every new vertex exposes sampling noise as blotches on broad flat panels.
    const coarse=[];
    for(let i=0;i<count;i++){
      n.fromArray(data.NORMAL[i]).applyNormalMatrix(nm);
      coarse.push(inCabin(world[i])?sampler.sample(world[i],n.toArray()):255);
    }
    for(const [a,b] of parents)coarse.push((coarse[a]+coarse[b])/2);
    const shades=[];
    for(let i=0;i<world.length;i++){
      n.fromArray(data.NORMAL[i]).applyNormalMatrix(nm);
      const ratio=inCabin(world[i])?sampler.sample(world[i],n.toArray())/coarse[i]:1;
      const shade=Math.min(255,Math.round((data.COLOR_0?.[i]?.[0]??1)*255*ratio));
      shades.push(shade,shade,shade);
    }
    for(const semantic of attributes){
      const old=p.getAttribute(semantic),a=document.createAccessor().setType(old.getType()).setBuffer(buffer);
      if(semantic==='COLOR_0')a.setArray(new Uint8Array(shades)).setNormalized(true);
      else a.setArray(new Float32Array(data[semantic].flat()));
      p.setAttribute(semantic,a);
    }
    p.setIndices(document.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(indices)));
    report.parts++;report.addedVertices+=world.length-count;report.addedTriangles+=(indices.length-original.length)/3;
    report.details.push({material:p.getMaterial().getName(),vertices:world.length-count,triangles:(indices.length-original.length)/3});
  }
  report.samples=sampler.samples;sampler.dispose();console.log('Refined cockpit contact shading:',report);return report;
}
