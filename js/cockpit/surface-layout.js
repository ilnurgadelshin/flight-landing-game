// Non-repeating finish masks in the delivered cockpit's metre coordinates.
// Layout shared by the offline texture authoring tool and runtime UV assignment.
export const SURFACE_LAYOUT = {
 panel: {rect:[0,0,1024,512],bounds:[-.82,-.64,.79,-.075]},
 padding: {rect:[0,512,1024,256],bounds:[-.73,-1.025,.70,-.85]},
 rubber: {rect:[0,768,512,256],bounds:[-.205,-.385,.205,-.155]},
 frame: {rect:[512,768,512,256],bounds:[-1.10,-.23,1.07,.24]},
};
const clamp=x=>Math.max(0,Math.min(1,x));
const fade=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function finishCoordinates(kind,x,y,z,yokeCentre=0) {
 const layout=SURFACE_LAYOUT[kind];let u=x,v=y,weight=1;
 if(kind==='panel')weight=fade(-.985,-.968,z)*(1-fade(-.875,-.85,z));
 if(kind==='padding') {v=z;weight=fade(-.265,-.245,y)*(1-fade(-.08,-.06,y));}
 if(kind==='rubber')u-=yokeCentre;
 const [left,bottom,right,top]=layout.bounds;
 weight*=Number(u>=left&&u<=right&&v>=bottom&&v<=top);
 const [rx,ry,rw,rh]=layout.rect;
 // Inset one texel on the low (512px) atlas to prevent neighboring tile bleed.
 return [(rx+2+clamp((u-left)/(right-left))*(rw-4))/1024,
  1-(ry+2+(1-clamp((v-bottom)/(top-bottom)))*(rh-4))/1024,weight];
}
