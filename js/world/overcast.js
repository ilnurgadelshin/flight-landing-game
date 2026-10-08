// Bounded overcast density near the upper/lower cloud boundaries.
// A reduced-resolution pass supplies soft edges; shared weather fog handles the interior.
import * as THREE from 'three';
import {SKY_GLSL} from './sky.js';
import {makeRng} from '../physics/atmosphere.js';

// Periodic height and baked slopes share one small field; no image requests are needed.
export function makeDeckField(size=256){
 const rng=makeRng(831),cells=8,centres=Array.from({length:cells*cells},()=>[.15+rng()*.7,.15+rng()*.7]);
 const fields=[4,16,48].map(n=>({n,values:Float32Array.from({length:n*n},()=>rng())}));
 const wrap=(x,n)=>(x%n+n)%n,mix=(a,b,t)=>a+(b-a)*t;
 const noise=(f,u,v)=>{
  const x=u*f.n,y=v*f.n,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const at=(i,j)=>f.values[wrap(j,f.n)*f.n+wrap(i,f.n)];
  return mix(mix(at(ix,iy),at(ix+1,iy),fx*fx*(3-2*fx)),mix(at(ix,iy+1),at(ix+1,iy+1),fx*fx*(3-2*fx)),fy*fy*(3-2*fy));
 };
 const height=new Float32Array(size*size),pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,px=(u+(noise(fields[0],u,v)-.5)*.10)*cells,py=(v+(noise(fields[0],u+.37,v+.61)-.5)*.10)*cells;
  const ix=Math.floor(px),iy=Math.floor(py);let d=Infinity;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
   const c=centres[wrap(iy+j,cells)*cells+wrap(ix+i,cells)];d=Math.min(d,(ix+i+c[0]-px)**2+(iy+j+c[1]-py)**2);
  }
  const billow=Math.sqrt(Math.max(0,1-d/.38));
  height[y*size+x]=Math.max(0,Math.min(1,billow*.72+noise(fields[1],u,v)*.21+noise(fields[2],u,v)*.07));
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const at=(i,j)=>height[wrap(j,size)*size+wrap(i,size)],i=(y*size+x)*4;
  const dx=(at(x+1,y)-at(x-1,y))*.5,dz=(at(x,y+1)-at(x,y-1))*.5;
  pixels[i]=Math.round(at(x,y)*255);pixels[i+1]=Math.round(THREE.MathUtils.clamp(.5+dx*4,0,1)*255);
  pixels[i+2]=Math.round(THREE.MathUtils.clamp(.5+dz*4,0,1)*255);pixels[i+3]=255;
 }
 return {pixels,size};
}

const vertexShader=`varying vec3 vWorld;
 void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragmentShader=`
 varying vec3 vWorld;
 uniform sampler2D deckField;
 uniform vec3 uEye,uLight,uColor;
 uniform vec2 uDrift;
 uniform float uTop,uRelief,uBoundary,uFog,uSteps;
 ${SKY_GLSL}
 float profile(vec3 p){return texture2D(deckField,p.xz/2304.+uDrift).r;}
 void main(){
  vec3 ray=vWorld-uEye;float entry=length(ray);vec3 rd=ray/max(entry,.001);
  float stepM=clamp((uRelief+140.)/uSteps/max(abs(rd.y),.08),7.,70.);
  float jitter=.25+.5*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  float trans=1.,first=entry;vec3 result=vec3(0.);
  for(int i=0;i<28;i++){
   if(float(i)>=uSteps)break;
   float distanceM=(float(i)+jitter)*stepM;
   vec3 p=vWorld+rd*distanceM;
   vec3 field=texture2D(deckField,p.xz/2304.+uDrift).rgb;
   float surface=uBoundary+(uTop>.5?-1.:1.)*(8.+(1.-field.r)*uRelief);
   float depth=uTop>.5?surface-p.y:p.y-surface;
   float erosion=(profile(p*3.13+vec3(p.y*.7,0.,p.y*.4))-.5)*18.;
   float density=smoothstep(-12.,32.,depth-erosion);
   if(density<.002)continue;
   if(trans>.995)first=entry+distanceM;
   float alpha=1.-exp(-density*stepM*.038);
   vec2 slope=(field.gb-.5)*uRelief/36.;
   vec3 normal=normalize(vec3(-slope.x,uTop>.5?1.:-1.,-slope.y));
   float sun=max(0.,dot(normal,uLight));
   vec3 col;
   if(uTop>.5){
    // Soft self-shadow from the neighboring billow in the light direction.
    vec3 q=p+uLight*95.;float neighbor=uBoundary-8.-(1.-profile(q))*uRelief;
    float shadow=smoothstep(-25.,45.,neighbor-q.y);
    float lit=(.35+.65*sun)*(1.-.5*shadow);
    col=uColor*mix(vec3(.30,.39,.53),vec3(1.35,1.32,1.28),lit);
   }else{
    float pockets=smoothstep(.1,.9,field.r);
    col=uColor*(.68+.30*pockets+.12*dot(normal.xz,uLight.xz));
   }
   result+=trans*alpha*col;trans*=1.-alpha;
   if(trans<.015)break;
  }
  // This is a continuous deck: unresolved grazing rays see its diffuse interior.
  result+=trans*uColor*(uTop>.5?.8:.78);
  float fog=1.-exp(-uFog*uFog*first*first);
  vec3 radiance=max(vec3(0.),mix(result,hazeColor(rd),fog)+skyFlash);
  // Store highlights in an RGBA8 target; the composite decodes before tone mapping.
  gl_FragColor=vec4(sqrt(radiance/(1.+radiance)),1.);
 }`;

export function buildOvercast(world){
 const {pixels,size}=makeDeckField(),map=new THREE.DataTexture(pixels,size,size);
 map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
 const geometry=new THREE.PlaneGeometry(80000,80000),target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
 world.deckDrift={value:new THREE.Vector2()};
 const uniforms={...world.atmo.uniforms,deckField:{value:map},uEye:{value:new THREE.Vector3()},uDrift:world.deckDrift,
  uLight:{value:new THREE.Vector3()},uColor:{value:new THREE.Color()},uTop:{value:0},uRelief:{value:90},uBoundary:{value:0},uFog:{value:0},uSteps:{value:28}};
 const volumeMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
 const scene=new THREE.Scene(),volume=new THREE.Mesh(geometry,volumeMaterial);volume.rotation.x=Math.PI/2;volume.frustumCulled=false;scene.add(volume);
 const clear=new THREE.Color(),viewport=new THREE.Vector4(),drawingSize=new THREE.Vector2(),screen={value:new THREE.Vector2(1,1)};
 const meshes=[false,true].map(top=>{
  // The proxy places the cloud image at its boundary so terrain still depth-tests normally.
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:true,fog:false});
  material.onBeforeCompile=shader=>{
   THREE.Material.prototype.onBeforeCompile.call(material,shader);
   shader.uniforms.deckImage={value:target.texture};shader.uniforms.deckScreen=screen;
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D deckImage;uniform vec2 deckScreen;')
    .replace('#include <map_fragment>',`vec4 deck=texture2D(deckImage,gl_FragCoord.xy/deckScreen);
     if(deck.a<.001)discard;
     // Normalize the filtered horizon edge so transparent clear pixels cannot darken it.
     vec3 encoded=clamp(deck.rgb/deck.a,0.,.998);vec3 compressed=encoded*encoded;
     diffuseColor.rgb=compressed/(1.-compressed);diffuseColor.a*=deck.a;`);
  };
  material.customProgramCacheKey=()=> 'overcast-density-composite-v1';
  const mesh=new THREE.Mesh(geometry,material);mesh.name=top?'Overcast cloud tops':'Overcast cloud base';mesh.rotation.x=Math.PI/2;mesh.visible=false;mesh.renderOrder=2;
  mesh.onBeforeRender=renderer=>{renderer.getCurrentViewport(viewport);screen.value.set(viewport.z,viewport.w);material.uniformsNeedUpdate=true;};
  world.scene.add(mesh);return mesh;
 });
 world.overcast=meshes[0];world.overcastTop=meshes[1];let thickness=400;
 return {scene,target,uniforms,textureBytes:pixels.byteLength,
  configure(depth,sun){thickness=depth;uniforms.uLight.value.copy(sun);},
  render(camera){
   const top=meshes[1].visible,source=top?meshes[1]:meshes[0];if(!source.visible)return;
   const renderer=world.renderer,high=world.quality==='high';renderer.getDrawingBufferSize(drawingSize);
   const scale=Math.min(high?.5:.4,Math.sqrt((high?560000:160000)/(drawingSize.x*drawingSize.y)));
   const width=Math.max(1,Math.floor(drawingSize.x*scale)),height=Math.max(1,Math.floor(drawingSize.y*scale));
   if(target.width!==width||target.height!==height)target.setSize(width,height);
   uniforms.uSteps.value=high?28:14;uniforms.uTop.value=top?1:0;uniforms.uBoundary.value=source.position.y;
   uniforms.uRelief.value=Math.min(top?190:110,thickness*(top?.32:.22));uniforms.uColor.value.copy(source.material.color);uniforms.uFog.value=world.scene.fog.density;
   camera.getWorldPosition(uniforms.uEye.value);volume.position.copy(source.position);volume.updateMatrixWorld();
   const previous=renderer.getRenderTarget(),savedClear=renderer.getClearColor(clear),alpha=renderer.getClearAlpha(),auto=renderer.autoClear;
   try{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(scene,camera);}
   finally{renderer.setRenderTarget(previous);renderer.setClearColor(savedClear,alpha);renderer.autoClear=auto;}
  }
 };
}
