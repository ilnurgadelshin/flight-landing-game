import * as THREE from 'three';
import {RainField} from './rain-field.js';

const VERT=`
attribute vec3 dropCenter;
attribute vec4 dropDetail;
uniform vec3 uVelocity;
uniform vec2 uResolution;
uniform float uDpr;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){
  vec3 velocity=uVelocity-vec3(0.,dropDetail.x,0.);
  vec4 head=modelViewMatrix*vec4(dropCenter,1.);
  vec4 tail=head-modelViewMatrix*vec4(velocity*dropDetail.w,0.);
  vec4 a=projectionMatrix*head,b=projectionMatrix*tail;
  vec2 delta=(a.xy/max(a.w,.1)-b.xy/max(b.w,.1))*uResolution*.5;
  float lengthPx=length(delta);
  vec2 direction=lengthPx>.001?delta/lengthPx:vec2(0.,-1.);
  // Projected motion sets streak direction; bound very close streaks and retain
  // a small visible bead when looking directly along its trajectory.
  vec2 tailNdc=a.xy/max(a.w,.1)-direction*clamp(lengthPx,.8*uDpr,22.*uDpr)*2./uResolution;
  b.xy=tailNdc*b.w;
  gl_Position=mix(b,a,uv.y);
  vec2 side=vec2(direction.y,-direction.x);
  gl_Position.xy+=side*position.x*dropDetail.z*uDpr/uResolution*gl_Position.w;
  vUv=uv;
  float edge=max(abs(dropCenter.x),max(abs(dropCenter.y),abs(dropCenter.z)));
  vAlpha=dropDetail.y*(1.-smoothstep(27.,36.,edge))*smoothstep(2.5,6.,length(dropCenter))*step(.5,-head.z);
  #include <logdepthbuf_vertex>
}`;
const FRAG=`
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float width=1.-abs(vUv.x*2.-1.);
  float taper=smoothstep(0.,.22,vUv.y)*(1.-smoothstep(.65,1.,vUv.y));
  float alpha=width*width*taper*vAlpha*uIntensity*.55;
  if(alpha<.002)discard;
  gl_FragColor=vec4(uColor,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Rain {
  constructor(scene,{lowDetail=false}={}){
    this.field=new RainField(lowDetail?900:2600);
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0,1,1,0],3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));g.setIndex([0,1,2,1,3,2]);
    this.centers=new THREE.InstancedBufferAttribute(this.field.centers,3).setUsage(THREE.DynamicDrawUsage);
    this.details=new THREE.InstancedBufferAttribute(this.field.details,4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('dropCenter',this.centers);g.setAttribute('dropDetail',this.details);g.instanceCount=this.field.count;
    this.material=new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:false,
      uniforms:{uVelocity:{value:new THREE.Vector3()},uResolution:{value:new THREE.Vector2(1,1)},uDpr:{value:1},uIntensity:{value:0},uColor:{value:new THREE.Color()}}});
    this.mesh=new THREE.Mesh(g,this.material);this.mesh.name='Nonperiodic wind-driven rain';
    this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=3;
    scene.add(this.mesh);
  }
  reset(){this.field.reset();this.centers.needsUpdate=this.details.needsUpdate=true;}
  reduceQuality(){this.field.count=Math.min(900,this.field.capacity);this.mesh.geometry.instanceCount=this.field.count;}
  update(dt,state,eye,renderer){
    this.mesh.position.copy(eye); // Translation only: looking around cannot rotate the rain.
    if(!this.mesh.visible)return;
    if(this.field.update(dt,state))this.centers.needsUpdate=this.details.needsUpdate=true;
    const u=this.material.uniforms;u.uVelocity.value.fromArray(this.field.velocity);
    renderer.getDrawingBufferSize(u.uResolution.value);u.uDpr.value=renderer.getPixelRatio();
  }
}
