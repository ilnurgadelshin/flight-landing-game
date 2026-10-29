// Non-repeating finish masks in the delivered cockpit's metre coordinates.
// Layout shared by the offline texture authoring tool and runtime UV assignment.
export const SURFACE_ATLAS = [2048,1024];
export const SURFACE_LAYOUT = {
 panel: {rect:[0,0,1024,512],bounds:[-.82,-.64,.79,-.075]},
 padding: {rect:[0,512,1024,256],bounds:[-.73,-1.025,.70,-.85]},
 rubber: {rect:[0,768,512,256],bounds:[-.205,-.385,.205,-.155]},
 frame: {rect:[512,768,512,256],bounds:[-1.10,-.23,1.07,.24]},
 pedestal: {rect:[1024,0,512,1024],bounds:[-.34,-1.0,.30,.85]},
 overhead: {rect:[1536,0,512,640],bounds:[-.43,-.90,.43,.90]},
 headliner: {rect:[1536,640,512,384],bounds:[-1.42,-.91,1.42,1.5]},
};
const clamp=x=>Math.max(0,Math.min(1,x));
const fade=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function finishRegion(kind,x,y,z) {
 if(kind==='panel'){
  if(y>.07)return 'overhead';
  if(y<-.3&&z>-.93&&Math.abs(x)<.36)return 'pedestal';
 }
 return kind;
}
export function finishCoordinates(kind,x,y,z,yokeCentre=0,normalY=1) {
 kind=finishRegion(kind,x,y,z);
 const layout=SURFACE_LAYOUT[kind];let u=x,v=y,weight=1;
 if(kind==='panel')weight=fade(-.985,-.968,z)*(1-fade(-.875,-.85,z));
 if(kind==='padding') {v=z;weight=fade(-.265,-.245,y)*(1-fade(-.08,-.06,y));}
 if(kind==='rubber')u-=yokeCentre;
 if(kind==='pedestal'){v=z;weight=fade(-.92,-.88,y)*(1-fade(-.32,-.27,y))*fade(.3,.7,Math.abs(normalY));}
 if(kind==='overhead'){v=z;weight=fade(.07,.13,y)*(1-fade(1.1,1.25,y))*fade(.3,.7,Math.abs(normalY));}
 if(kind==='headliner'){v=z;weight=fade(.06,.12,y)*(1-fade(1.16,1.34,y))*fade(.15,.55,Math.abs(normalY));}
 const [left,bottom,right,top]=layout.bounds;
 weight*=Number(u>=left&&u<=right&&v>=bottom&&v<=top);
 const [rx,ry,rw,rh]=layout.rect;
 // Inset one texel on the low (half-resolution) atlas to prevent tile bleed.
 return [(rx+2+clamp((u-left)/(right-left))*(rw-4))/SURFACE_ATLAS[0],
  1-(ry+2+(1-clamp((v-bottom)/(top-bottom)))*(rh-4))/SURFACE_ATLAS[1],weight];
}

// A single interpolated UV cannot cross disjoint atlas slots. Leave the tiny
// shared boundary faces neutral, including their shared vertices, rather than
// dragging unrelated atlas contents across the panel/pedestal seam.
export function guardFinishBoundaries(indices,regions,finish){
 let guarded=0;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i],b=indices[i+1],c=indices[i+2];
  if(regions[a]===regions[b]&&regions[a]===regions[c])continue;
  if(Math.max(finish[a*3+2],finish[b*3+2],finish[c*3+2])>0)guarded++;
  finish[a*3+2]=finish[b*3+2]=finish[c*3+2]=0;
 }
 return guarded;
}
