// Synchronous shared data: physics, navigation and both rendering tiers see the
// same heights from their first frame, including offline and headless use.
import { REGION, APPROACH } from '../../assets/scenery/elevation.js';

function unpack(grid) {
  const bytes=atob(grid.data),data=new Uint16Array(bytes.length/2);
  for(let i=0;i<data.length;i++)data[i]=bytes.charCodeAt(2*i)|bytes.charCodeAt(2*i+1)<<8;
  return {...grid,data};
}
const region=unpack(REGION),approach=unpack(APPROACH);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function sample(g,x,z) {
  const u=clamp((x-g.x)/g.step,0,g.count-1),v=clamp((z-g.z)/g.step,0,g.count-1);
  const ix=Math.min(g.count-2,Math.floor(u)),iz=Math.min(g.count-2,Math.floor(v)),a=u-ix,b=v-iz,i=iz*g.count+ix;
  return ((g.data[i]*(1-a)+g.data[i+1]*a)*(1-b)+(g.data[i+g.count]*(1-a)+g.data[i+g.count+1]*a)*b)*g.quantum;
}

export function surveyedHeight(x,z) {
  const broad=sample(region,x,z),edge=Math.min(x+7000,17000-x,z+12000,12000-z);
  // Two resolutions overlap over 1.5 km, rather than making a height step.
  const blend=smooth(edge/1500);
  return broad+(sample(approach,x,z)-broad)*blend-350;
}

export function landscapeHeight(x,z) {
  let h=surveyedHeight(x,z);
  // Local airport earthworks, with rounded corners. Preserve every existing
  // runway, light, apron and service-road position. No kilometre-wide strip
  // continues down the rest of the approach.
  const dx=Math.max(0,Math.abs(x)-3000),dz=Math.max(0,Math.abs(z-175)-475);
  h*=smooth(Math.hypot(dx,dz)/1900);
  // Protect the final and missed-approach corridor with a rising terrain cap.
  // Unlike the former flat strip, relief is retained below this envelope. A
  // 700 m shoulder blends the excavation without a vertical seam.
  const along=Math.max(0,Math.abs(x)-3000),cap=along*.030;
  const corridor=1-smooth((Math.abs(z)-350)/700);
  if(h>cap)h+=(cap-h)*corridor;
  return h;
}
