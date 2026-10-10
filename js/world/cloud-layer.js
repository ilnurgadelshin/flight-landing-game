// Analytic optical depth through a layer with linear density ramps on its INSIDE edges.
// The boundary renderer supplies billows; this keeps sky, terrain and lights consistent
// without extra texture lookups or marching through the scene's every material.
export const CLOUD_FRINGE=32;
export const CLOUD_EXTINCTION=Math.log(20)/120;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function cloudDensityAt(y,base,top,fringe=CLOUD_FRINGE){
 const f=Math.min(fringe,(top-base)/2);
 return f>0?clamp(Math.min(y-base,top-y)/f,0,1):0;
}
export function cloudPathLength(y,dy,distance,base,top,fringe=CLOUD_FRINGE){
 const f=Math.min(fringe,(top-base)/2);if(f<=0||distance<=0)return 0;
 if(dy===0)return cloudDensityAt(y,base,top,f)*distance;
 const times=[base,base+f,top-f,top].map(h=>(h-y)/dy);
 let path=0;
 for(let i=0;i<3;i++){
  const start=clamp(Math.min(times[i],times[i+1]),0,distance),end=clamp(Math.max(times[i],times[i+1]),0,distance);
  const height=dy*(start+end)*.5;
  const density=i===0?clamp((y-base+height)/f,0,1):i===2?clamp((top-y-height)/f,0,1):1;
  path+=(end-start)*density;
 }
 return path;
}
export const CLOUD_LAYER_GLSL=/* glsl */`
 uniform vec4 cloudLayer; // base, top, inner fringe, extinction (zero in clear weather)
 uniform vec3 cloudEye;
 // Clip the ray to each linear band, then integrate its midpoint density.
 // This avoids subtracting nearly equal height primitives for grazing rays.
 vec2 cloudInterval(float a,float b,float distanceM){return clamp(vec2(min(a,b),max(a,b)),0.,distanceM);}
 float cloudPath(vec3 dir,float distanceM){
  if(cloudLayer.w<=0.||distanceM<=0.)return 0.;
  float y=cloudEye.y,base=cloudLayer.x,top=cloudLayer.y,f=cloudLayer.z;
  if((y<=base&&dir.y<=0.)||(y>=top&&dir.y>=0.))return 0.;
  if(dir.y==0.)return clamp(min(y-base,top-y)/f,0.,1.)*distanceM;
  vec4 t=(vec4(base,base+f,top-f,top)-y)/dir.y;
  vec2 lo=cloudInterval(t.x,t.y,distanceM),mid=cloudInterval(t.y,t.z,distanceM),hi=cloudInterval(t.z,t.w,distanceM);
  float loDensity=clamp((y-base+dir.y*(lo.x+lo.y)*.5)/f,0.,1.);
  float hiDensity=clamp((top-y-dir.y*(hi.x+hi.y)*.5)/f,0.,1.);
  return (lo.y-lo.x)*loDensity+(mid.y-mid.x)+(hi.y-hi.x)*hiDensity;
 }
 float cloudOpacity(vec3 dir,float distanceM){return 1.-exp(-cloudLayer.w*cloudPath(dir,distanceM));}
`;
