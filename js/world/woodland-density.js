// Quotas bound the whole allocation; they must not become visible forest edges.
// Blend each allocation's expected trees/m² across neighbouring rectangles before
// selecting candidates. This preserves the total, not a hard count on each tile.
import {makeRng} from '../physics/atmosphere.js';
// A common candidate grid can realize the blended close-forest density on either
// side of a join. Sparse outer grids otherwise clip that density at the seam.
export const WOODLAND_CANDIDATE_SPACING=9.5;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const taper=(zone,z)=>zone.taper?zone.taperFloor+(1-zone.taperFloor)*Math.max(0,Math.min(1,
  1-(zone.taperSide==='south'?zone.bounds[1]+zone.bounds[3]-z:z-zone.bounds[1])/zone.taper)):1;
const cellArea=WOODLAND_CANDIDATE_SPACING**2;
const solve=async(weights,target,checkpoint)=>{
 if(!target)return 0;
 let lo=0,hi=1;
 const sum=async k=>{
  let total=0;
  for(let i=0;i<weights.length;i++){
   total+=Math.min(1,k*weights[i]);
   if((i&2047)===0){const pause=checkpoint();if(pause)await pause;}
  }
  return total;
 };
 while(await sum(hi)<target&&hi<1e6)hi*=2;
 for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(await sum(mid)<target)lo=mid;else hi=mid;}
 return hi;
};

export async function blendWoodlandAllocations(allocations,radius=350,checkpoint=()=>null){
 const fields=[];let target=0;
 for(const [id,{zone,close,upper}] of allocations.entries()){
  let available=zone.highLimit;
  for(const [part,trees] of [close,upper].entries()){
   const count=Math.min(available,trees.length);available-=count;target+=count;
   if(!trees.length)continue;
   const bounds=zone.bounds.slice();
   if(!zone.uniform){
    const end=bounds[0]+bounds[2];
    if(part===0)bounds[2]=Math.min(end,4100)-bounds[0];
    else {bounds[0]=Math.max(bounds[0],4100);bounds[2]=end-bounds[0];}
   }
   // The previous taper applied only to the upper/uniform allocation.
   const profile=part===0?{...zone,taper:0}:zone;
   const weights=[];
   for(let i=0;i<trees.length;i++){
    weights.push(taper(profile,trees[i].z));
    if((i&2047)===0){const pause=checkpoint();if(pause)await pause;}
   }
   fields.push({id,zone:profile,bounds,trees,multiplier:await solve(weights,count,checkpoint)});
  }
 }
 const density=(x,z)=>{
  let sum=0,weight=0;
  for(const f of fields){
   const [x0,z0,w,d]=f.bounds;
   const blend=smooth((x-x0+radius)/(2*radius))*smooth((x0+w-x+radius)/(2*radius))*
    smooth((z-z0+radius)/(2*radius))*smooth((z0+d-z+radius)/(2*radius));
   if(!blend)continue;
   // Evaluate a neighbour at its nearest point, not at an extrapolated taper.
   const zz=Math.max(z0,Math.min(z0+d-1e-4,z));
   sum+=blend*Math.min(1,f.multiplier*taper(f.zone,zz))/cellArea;weight+=blend;
  }
  return weight?sum/weight:0;
 };
 const candidates=[],weights=[];
 for(const f of fields)for(let i=0;i<f.trees.length;i++){
  const tree=f.trees[i],weight=density(tree.x,tree.z)*cellArea;
  candidates.push({tree,id:f.id,weight});weights.push(weight);
  if((i&255)===0){const pause=checkpoint();if(pause)await pause;}
 }
 const scale=await solve(weights,target,checkpoint),rng=makeRng(281026);
 for(let i=candidates.length-1;i>0;i--){
  const j=Math.floor(rng()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  if((i&2047)===0){const pause=checkpoint();if(pause)await pause;}
 }
 let accumulated=rng();const trees=[],counts=allocations.map(()=>0);
 for(let i=0;i<candidates.length;i++){
  const c=candidates[i];
  accumulated+=Math.min(1,scale*c.weight);
  if(accumulated>=1&&trees.length<target){trees.push(c.tree);counts[c.id]++;accumulated-=1;}
  if((i&2047)===0){const pause=checkpoint();if(pause)await pause;}
 }
 return {trees,counts,target,scale,radius};
}
