// Measured-space finishes for the textureless CC BY cockpit. The UVs remain
// attached to each part when a yoke or lever moves, and mipmaps remove grain at
// instrument-reading distance instead of producing screen-space speckle.
import * as THREE from 'three';
import { surfaceGrain } from './finish.js';

export function finishAuthoredDeck(model) {
  const grain=surfaceGrain();grain.repeat.set(1,1);
  const finishes={
    'Material.014': [[.26,.29,.30],.82],       // moulded window/sidewall trim
    'Material.048': [[.48,.50,.49],.78],       // warm off-white trim
    'Material.492': [[.15,.175,.185],.79],     // painted instrument panel
    'Material.103': [[.18,.205,.215],.78],
    'Material.219': [[.038,.045,.047],.93],    // glare-absorbing padding
    'Material.008': [[.20,.23,.24],.83],
    'Material.016': [[.025,.03,.032],.95],     // seals
  };
  const done=new Set();
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
    const uv=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      uv[i*2]=(nx>ny&&nx>nz?p.getZ(i):p.getX(i))*18;
      uv[i*2+1]=(ny>nx&&ny>nz?p.getZ(i):p.getY(i))*18;
    }
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const m=mesh.material;if(done.has(m))return;done.add(m);
    const finish=finishes[m.name];
    if(finish){m.color.setRGB(...finish[0]);m.roughness=finish[1];}
    // Preserve tiny vector lettering, colored annunciators and metal hardware.
    if(finish || (m.color.r<.3 && m.color.g<.3 && m.color.b<.3)){
      m.bumpMap=grain;m.bumpScale=.00016;
      m.roughness=Math.max(.62,m.roughness);m.needsUpdate=true;
    }
  });
}
