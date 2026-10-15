// Glazing follows the inner rails of Body.020 / Material.008 in the delivered
// source-faithful flight deck. The slightly curved front panes use both measured
// rails, not the old stretched-shell approximation. Coordinates are cabin metres.
import * as THREE from 'three';

const FRONT={top:[[-.53809,.14338,-.73537],[-.39179,.14699,-.82881],[-.20530,.15066,-.89442],[-.05417,.15223,-.91043]],
 bottom:[[-.55725,-.09030,-.99066],[-.49614,-.09810,-1.04585],[-.34324,-.10479,-1.22309],[-.17314,-.11886,-1.36318],[-.05430,-.13480,-1.42464]]};
const SIDE={top:[[-.60783,.14425,-.67710],[-.79657,.13601,-.40378]],
 bottom:[[-.61987,-.09301,-.93496],[-.69824,-.11770,-.88370],[-.85478,-.16851,-.71390],[-.92307,-.17704,-.56811]]};
const AFT={top:[[-.83218,.14386,-.31778],[-.96702,.14567,.03712],[-.98930,.12113,.05126]],
 bottom:[[-.95710,-.16690,-.46144],[-1.02520,-.13789,-.23587],[-1.05652,-.06274,-.02328]]};
const panes=[FRONT,SIDE,AFT];
const railLengths=new Map();
for(const pane of panes)for(const points of [pane.top,pane.bottom]){
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(...points[i].map((v,j)=>v-points[i-1][j])));
 railLengths.set(points,lengths);
}
const rail=(points,u)=>{
 const lengths=railLengths.get(points);
 const d=u*lengths.at(-1);let i=1;while(i<lengths.length-1&&d>lengths[i])i++;
 const t=(d-lengths[i-1])/(lengths[i]-lengths[i-1]);return points[i-1].map((v,j)=>v+(points[i][j]-v)*t);
};
export function panePoint(index,u,v){
 const pane=panes[index%3],bottom=rail(pane.bottom,u),top=rail(pane.top,u);
 const p=bottom.map((b,i)=>b+(top[i]-b)*v);if(index>=3)p[0]=-.03641725-p[0];return p;
}
export function paneGeometry(index){
 const positions=[],uv=[],indices=[];
 for(let j=0;j<=4;j++)for(let i=0;i<=24;i++){
  const u=i/24,v=j/4;positions.push(...panePoint(index,u,v));uv.push(u,v);
  if(i<24&&j<4){const a=j*25+i;indices.push(a,a+1,a+25,a+1,a+26,a+25);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
const WET_VERT=`varying vec2 vPaneUV;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){vPaneUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
 #include <logdepthbuf_vertex>
}`;
const WET_FRAG=`
varying vec2 vPaneUV;
#include <logdepthbuf_pars_fragment>
uniform float uTime,uWet,uSpeed,uDay,uPhase,uFront,uSeed,uDpr;
uniform vec2 uResolution;
uniform sampler2D uOutside;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 drops(vec2 uv,vec2 cells,float seed){
 vec2 cell=floor(uv*cells),q=fract(uv*cells)-.5;
 float h=hash(cell+seed),h2=hash(cell+seed+7.3);
 q-=vec2(h-.5,h2-.5)*.52;
 vec2 radius=vec2(.075+.045*h,.10+.08*h2);
 vec2 d=q/radius;float r=dot(d,d);
 float age=fract(uTime*(.13+.12*h)+h2);
 float life=smoothstep(0.,.08,age)*(1.-smoothstep(.85,1.,age));
 float mask=(1.-smoothstep(.65,1.,r))*life;
 return vec3(d*mask,mask);
}
void main(){
 // Derivatives must precede per-pixel discards (some GPU drivers otherwise
 // return undefined gradients at the edge of a droplet).
 #ifdef REFRACT_PANES
  vec2 uvDx=dFdx(vPaneUV),uvDy=dFdy(vPaneUV);
 #endif
 #include <logdepthbuf_fragment>
 if(uWet<.001)discard;
 vec2 uv=vPaneUV;
 vec3 bead=drops(uv,vec2(45.,30.),uSeed);
 // Airflow carries larger rivulets up the raked pane; slow taxiing lets them fall.
 vec2 flow=vec2(.007,smoothstep(8.,65.,uSpeed)*.12-.02)*uTime;
 vec3 moving=drops(uv-flow,vec2(27.,15.),uSeed+21.);
 moving.xy*=vec2(.65,1.4);
 vec3 water=bead+moving*.8;
 float wet=uWet;
 if(uFront>.5){
  vec2 p=(uv-vec2(.10,-.025))*vec2(.58,.56);
  float radius=length(p),angle=atan(p.y,p.x);
  float t=clamp((angle-.20)/1.40,0.,1.);
  float crossing=acos(1.-2.*t);
  float age=min(mod(uPhase-crossing+6.2831853,6.2831853),mod(uPhase-(6.2831853-crossing)+6.2831853,6.2831853))/2.8;
  float swept=smoothstep(.13,.17,radius)*(1.-smoothstep(.48,.51,radius))*step(.20,angle)*step(angle,1.60);
  wet*=mix(1.,.04+.96*smoothstep(.06,1.8,age),swept);
 }
 float mask=clamp(water.z,0.,1.)*wet;
 if(mask<.003)discard;
 #ifdef REFRACT_PANES
  vec2 gradient=vec2(dot(water.xy,uvDx),dot(water.xy,uvDy));
  vec2 offset=gradient/max(.00001,length(gradient))*min(5.,length(water.xy)*6.)*uDpr/uResolution;
  vec2 screen=gl_FragCoord.xy/uResolution;
  vec3 col=texture2D(uOutside,clamp(screen+offset,vec2(.001),vec2(.999))).rgb;
  col*=1.-.08*mask;
  col+=vec3(.055)*(.15+.85*uDay)*max(0.,-water.y)*wet;
  gl_FragColor=vec4(col,mask*.9);
 #else
  float light=clamp(.62-water.y*.55,0.,1.);
  gl_FragColor=vec4(vec3(light)*(.2+.8*uDay),mask*.23);
 #endif
}`;

export class Windshield {
 constructor(root,{lowDetail=false}={}){
  this.lowDetail=lowDetail;this.group=new THREE.Group();this.group.name='Source-fitted cockpit glazing';
  this.group.userData.excludeCabinCapture=true;root.add(this.group);
  this.time=0;this.phase=0;this.wet=0;this.size=new THREE.Vector2();this.copyCount=0;
  this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();
  this.uniforms={uTime:{value:0},uWet:{value:0},uSpeed:{value:0},uDay:{value:1},uPhase:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uDpr:{value:1},uOutside:{value:null}};
  const reflection=new THREE.MeshPhysicalMaterial({color:0xd9e4df,metalness:0,roughness:.12,transparent:true,opacity:.055,envMapIntensity:.45,side:THREE.DoubleSide,depthWrite:false});
  reflection.name='Windshield faint cabin reflection';reflection.forceSinglePass=true;
  reflection.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
    diffuseColor.a*=.3+.7*pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
    #include <opaque_fragment>`);};
  this.rainMeshes=[];this.blades=[];
  for(let i=0;i<6;i++){
   const g=paneGeometry(i),glass=new THREE.Mesh(g,reflection);glass.name=`Cabin glazing ${i}`;glass.renderOrder=8;this.group.add(glass);
   const wetMat=new THREE.ShaderMaterial({uniforms:{...this.uniforms,uFront:{value:i%3===0?1:0},uSeed:{value:i*31.7}},defines:lowDetail?{}:{REFRACT_PANES:1},vertexShader:WET_VERT,fragmentShader:WET_FRAG,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
   wetMat.forceSinglePass=true;
   const rain=new THREE.Mesh(g,wetMat);rain.name=`Water on cabin pane ${i}`;rain.renderOrder=7;rain.visible=false;this.group.add(rain);this.rainMeshes.push(rain);
   if(i%3===0){
    const material=new THREE.MeshStandardMaterial({color:0x171c1e,roughness:.75});
    const parts=[.006,.010].map(width=>new THREE.Mesh(new THREE.BoxGeometry(width,1,.006),material));
    parts.forEach(m=>{m.name='Fitted windshield wiper';this.group.add(m);});this.blades.push({index:i,parts});
   }
  }
  this.update(0,false,0,1);
 }
 reset(){this.time=0;this.phase=0;this.wet=0;this.releaseOutside();this.update(0,false,0,1);}
 releaseOutside(){this.outside?.dispose();this.outside=null;this.uniforms.uOutside.value=null;}
 reduceQuality(){
  if(this.lowDetail)return;
  this.lowDetail=true;this.releaseOutside();
  for(const mesh of this.rainMeshes){delete mesh.material.defines.REFRACT_PANES;mesh.material.needsUpdate=true;}
 }
 update(dt,rain,speed,day){
  const step=Math.max(0,Math.min(dt,.1));this.time+=step;this.wet+=(Number(rain)-this.wet)*Math.min(1,step*(rain?1.8:.6));
  if(rain)this.phase=(this.phase+step*2.8)%(Math.PI*2);else this.phase=0;
  const u=this.uniforms;u.uTime.value=this.time;u.uWet.value=this.wet;u.uSpeed.value=speed;u.uDay.value=day;u.uPhase.value=this.phase;
  this.rainMeshes.forEach(m=>m.visible=this.wet>.001);
  const angle=.20+1.40*(1-Math.cos(this.phase))*.5;
  const p=r=>[.10+Math.cos(angle)*r/.58,-.025+Math.sin(angle)*r/.56];
  for(const {index,parts} of this.blades){
   const points=[0,.17,.49].map(r=>{const [u,v]=p(r),p3=new THREE.Vector3(...panePoint(index,u,v));p3.z+=.007;return p3;});
   for(let k=0;k<2;k++){const a=points[k],b=points[k+1],m=parts[k],dir=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=dir.length();m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());}
  }
 }
 captureOutside(renderer,camera){
  if(this.lowDetail||this.wet<=.001||!this.group.visible||this.viewVisible===false)return;
  this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  if(!this.rainMeshes.some(mesh=>this.frustum.intersectsObject(mesh)))return;
  renderer.getDrawingBufferSize(this.size);
  if(!this.outside||this.outside.image.width!==this.size.x||this.outside.image.height!==this.size.y){
   this.outside?.dispose();this.outside=new THREE.FramebufferTexture(this.size.x,this.size.y);this.outside.minFilter=this.outside.magFilter=THREE.LinearFilter;
   this.uniforms.uOutside.value=this.outside;
  }
  this.uniforms.uResolution.value.copy(this.size);this.uniforms.uDpr.value=renderer.getPixelRatio();
  renderer.copyFramebufferToTexture(this.outside);this.copyCount++;
 }
}
