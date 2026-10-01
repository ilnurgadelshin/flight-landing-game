// A small, cached reflection capture of the actual cabin. The outdoor sky alone
// makes panel paint reflect light through the roof. This records the windows,
// panel, liner and their illumination instead. Geometry and textures are shared.
import * as THREE from 'three';
import { bakeWindowLight } from './window-light.js';

// Half-float NaN/Infinity can silently black out every material using an env map.
// Validate once when capturing, not in the flight loop. A failed capture keeps
// the ordinary sky/fill lighting and is not retried until the scenario changes.
export function validCabinCapture(renderer,target) {
  const pixels=new Uint16Array(target.width*target.height*4);
  renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
  let lit=0;
  for(let i=0;i<pixels.length;i++)if(i%4!==3){
    if((pixels[i]&0x7c00)===0x7c00)return false;
    if(pixels[i]>0&&!(pixels[i]&0x8000))lit++;
  }
  return lit>100;
}

export class CabinEnvironment {
  constructor(world,root,eyeLocal) {
    this.world=world;this.root=root;this.captures=new Map();
    this.eyeLocal=eyeLocal.clone();this.eye=new THREE.Vector3();
    // Keep the fixed-size cabin filter separate from the outdoor PMREM's
    // resolution and render targets when a scenario changes.
    this.pmrem=new THREE.PMREMGenerator(world.renderer);
    this.rotation=new THREE.Quaternion();this.delta=new THREE.Quaternion();
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(100,24,12),world.envSkyMat);
    this.sky.name='Cabin reflection capture sky';
    this.windowLights=[];
    this.windowStrength={value:0};
    if(world.quality==='high'){
      // Broad sky illumination from the two side windows. These have no hard
      // shadow: small occluders are supplied by the baked cabin shading. The
      // separate directional light still casts the direct sun's frame shadows.
      for(const side of [-1,1]){
        const light=new THREE.RectAreaLight(0xd7e6f3,4.5,.65,.40);
        light.name='Window sky light';light.position.set(side*.82,.06,-.10);
        // Used only as aperture geometry for the CPU integral. Never add LTC
        // area lights to a rendered scene: some WebGL drivers produce NaNs.
        light.lookAt(0,-.50,-.72);this.windowLights.push(light);
      }
      bakeWindowLight(root,this.windowLights,this.windowStrength);
    }
  }
  reset() {
    for(const capture of this.captures.values())capture.target?.dispose();
    this.captures.clear();
  }
  update(key) {
    const w=this.world,scene=w.cockpitScene;
    const skyTransmission=w.sunI>0?w.sun.intensity/w.sunI:0;
    const strength=.015+w.daylight*4.5*(.35+.65*skyTransmission);
    this.windowStrength.value=strength;
    for(const light of this.windowLights)light.intensity=strength;
    this.root.getWorldQuaternion(this.rotation);
    let capture=this.captures.get(key);
    if(!capture){
      const previous={environment:scene.environment,intensity:scene.environmentIntensity,
        rotation:scene.environmentRotation.clone(),visible:this.root.visible};
      scene.environment=w.env[key].texture;
      scene.environmentIntensity=w.cabinOutdoorIntensity;
      scene.environmentRotation.set(0,0,0);
      this.root.visible=true;
      // The same finite, baked diffuse window light illuminates the reflection
      // capture and normal frames. No driver-dependent LTC area-light shader.
      // Looking down or leaning into an instrument must not bake the cabin
      // from inside that screen. Use the design eye in the airframe instead.
      const eye=this.root.localToWorld(this.eye.copy(this.eyeLocal));
      this.sky.position.copy(eye);scene.add(this.sky);
      let target;
      try{
        scene.updateMatrixWorld(true);
        target=this.pmrem.fromScene(scene,0,.025,120,{size:w.quality==='high'?128:64,position:eye});
        if(!validCabinCapture(w.renderer,target))throw new Error('Invalid cabin reflection pixels');
        capture={target,inverseRotation:this.rotation.clone().invert()};
      }catch(error){
        target?.dispose();
        capture={target:null,reason:String(error)};
      }finally{
        scene.remove(this.sky);this.root.visible=previous.visible;
        scene.environment=previous.environment;scene.environmentIntensity=previous.intensity;
        scene.environmentRotation.copy(previous.rotation);
        this.windowStrength.value=strength;
      }
      this.captures.set(key,capture);
    }
    if(!capture.target){
      scene.environment=w.env[key].texture;
      scene.environmentRotation.set(0,0,0);
      scene.environmentIntensity=w.cabinOutdoorIntensity;
      return;
    }
    scene.environment=capture.target.texture;
    // The captured cabin stays attached to the airframe during turns and bank.
    this.delta.copy(this.rotation).multiply(capture.inverseRotation);
    scene.environmentRotation.setFromQuaternion(this.delta);
    scene.environmentIntensity=1.25;
  }
}
