// A small, cached reflection capture of the actual cabin. The outdoor sky alone
// makes panel paint reflect light through the roof. This records the windows,
// panel, liner and their illumination instead. Geometry and textures are shared.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { bakeWindowLight } from './window-light.js';

let areaLightsReady=false;

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
      if(!areaLightsReady){RectAreaLightUniformsLib.init();areaLightsReady=true;}
      // Broad sky illumination from the two side windows. These have no hard
      // shadow: small occluders are supplied by the baked cabin shading. The
      // separate directional light still casts the direct sun's frame shadows.
      for(const side of [-1,1]){
        const light=new THREE.RectAreaLight(0xd7e6f3,4.5,.65,.40);
        light.name='Window sky light';light.position.set(side*.82,.06,-.10);
        light.lookAt(0,-.50,-.72);light.visible=false;root.add(light);this.windowLights.push(light);
      }
      bakeWindowLight(root,this.windowLights,this.windowStrength);
    }
  }
  reset() {
    for(const capture of this.captures.values())capture.target.dispose();
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
      // Area-light BRDFs run only for the cached reflection capture. Normal
      // frames use their baked diffuse integral and the resulting reflections.
      this.windowStrength.value=0;
      for(const light of this.windowLights)light.visible=true;
      // Looking down or leaning into an instrument must not bake the cabin
      // from inside that screen. Use the design eye in the airframe instead.
      const eye=this.root.localToWorld(this.eye.copy(this.eyeLocal));
      this.sky.position.copy(eye);scene.add(this.sky);
      try{
        scene.updateMatrixWorld(true);
        const target=this.pmrem.fromScene(scene,0,.025,120,{size:w.quality==='high'?128:64,position:eye});
        capture={target,inverseRotation:this.rotation.clone().invert()};this.captures.set(key,capture);
      }finally{
        scene.remove(this.sky);this.root.visible=previous.visible;
        scene.environment=previous.environment;scene.environmentIntensity=previous.intensity;
        scene.environmentRotation.copy(previous.rotation);
        this.windowStrength.value=strength;
        for(const light of this.windowLights)light.visible=false;
      }
    }
    scene.environment=capture.target.texture;
    // The captured cabin stays attached to the airframe during turns and bank.
    this.delta.copy(this.rotation).multiply(capture.inverseRotation);
    scene.environmentRotation.setFromQuaternion(this.delta);
    scene.environmentIntensity=1.25;
  }
}
