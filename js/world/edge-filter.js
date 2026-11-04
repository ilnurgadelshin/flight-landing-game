import * as THREE from 'three';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// Filter the already tone-mapped display image, after world and cabin. Keeping
// this copy in display space avoids changing the cockpit's calibrated colours.
export class EdgeFilter {
  constructor(){
    this.enabled=true;this.size=new THREE.Vector2();this.texture=null;
    this.displays=[];this.point=new THREE.Vector3();
    this.bounds=Array.from({length:16},()=>new THREE.Vector4());
    this.edges=Array.from({length:64},()=>new THREE.Vector3());
    this.material=new THREE.ShaderMaterial({...FXAAShader,
      uniforms:{...THREE.UniformsUtils.clone(FXAAShader.uniforms),displayCount:{value:0},displayBounds:{value:this.bounds},displayEdges:{value:this.edges}},
      fragmentShader:FXAAShader.fragmentShader.replace('float _SubpixelBlending = 1.0;','float _SubpixelBlending = 0.5;')
        .replace('void main()',`uniform int displayCount;
          uniform vec4 displayBounds[16];uniform vec3 displayEdges[64];
          void main()`),
      depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.material.fragmentShader=this.material.fragmentShader.replace(/void main\(\)\s*\{/,`void main(){
      // Live displays already have purpose-built texture filtering. Preserve
      // their pixels rather than filtering text a second time.
      for(int i=0;i<16;i++){
        if(i>=displayCount)break;
        vec4 b=displayBounds[i];
        if(vUv.x<b.x||vUv.y<b.y||vUv.x>b.z||vUv.y>b.w)continue;
        vec3 p=vec3(vUv,1.);
        if(dot(displayEdges[i*4],p)>=0.&&dot(displayEdges[i*4+1],p)>=0.&&dot(displayEdges[i*4+2],p)>=0.&&dot(displayEdges[i*4+3],p)>=0.){
          gl_FragColor=texture2D(tDiffuse,vUv);return;
        }
      }`);
    this.quad=new FullScreenQuad(this.material);
  }
  protectDisplays(root){
    this.displays=[];
    root.traverseVisible(mesh=>{
      if(!mesh.isMesh||!mesh.material?.map?.isCanvasTexture||mesh.material.toneMapped!==false)return;
      mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
      if(Math.abs(b.max.z-b.min.z)>.00001)return;
      this.displays.push({mesh,corners:[[b.min.x,b.min.y,b.max.z],[b.max.x,b.min.y,b.max.z],[b.max.x,b.max.y,b.max.z],[b.min.x,b.max.y,b.max.z]].map(p=>new THREE.Vector3(...p)),projected:Array.from({length:4},()=>new THREE.Vector2())});
    });
  }
  projectDisplays(camera,visible){
    let n=0;
    if(visible)for(const {mesh,corners,projected:p} of this.displays){
      if(n===16)break;let front=true;
      for(let i=0;i<4;i++){
        this.point.copy(corners[i]).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        if(this.point.z>=-camera.near)front=false;
        this.point.applyMatrix4(camera.projectionMatrix);p[i].set(this.point.x*.5+.5,this.point.y*.5+.5);
      }
      if(!front)continue;
      const b=this.bounds[n].set(Infinity,Infinity,-Infinity,-Infinity);
      for(const v of p){b.x=Math.min(b.x,v.x);b.y=Math.min(b.y,v.y);b.z=Math.max(b.z,v.x);b.w=Math.max(b.w,v.y);}
      if(b.z<0||b.w<0||b.x>1||b.y>1)continue;
      const sign=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x)>=0?1:-1;
      for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4];this.edges[n*4+i].set(a.y-b.y,b.x-a.x,a.x*b.y-a.y*b.x).multiplyScalar(sign);}
      n++;
    }
    this.material.uniforms.displayCount.value=n;
  }
  render(renderer,camera,cockpitVisible=true){
    if(!this.enabled)return;
    this.projectDisplays(camera,cockpitVisible);
    renderer.getDrawingBufferSize(this.size);
    const {x:w,y:h}=this.size;
    if(this.texture?.image.width!==w||this.texture?.image.height!==h){
      this.texture?.dispose();this.texture=new THREE.FramebufferTexture(w,h);
      this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
      this.material.uniforms.tDiffuse.value=this.texture;
      this.material.uniforms.resolution.value.set(1/w,1/h);
    }
    renderer.copyFramebufferToTexture(this.texture);
    const clear=renderer.autoClear;renderer.autoClear=false;
    try{this.quad.render(renderer);}finally{renderer.autoClear=clear;}
  }
  dispose(){this.texture?.dispose();this.texture=null;this.material.dispose();this.quad.dispose();}
}
