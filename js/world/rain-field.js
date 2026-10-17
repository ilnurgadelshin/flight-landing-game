// A bounded, world-oriented pool around the eye. Drops leave the pool and are
// replaced on an upstream face, with a new position/size, rather than wrapping
// the same constellation through a periodic box. Independent RNG: weather must
// not change when scenery consumes additional random numbers.
import {makeRng} from '../physics/atmosphere.js';
import {DEG,KTS} from '../config.js';

export class RainField {
  constructor(count=2600,seed=21703){
    this.capacity=count;this.count=count;this.half=36;
    this.centers=new Float32Array(count*3);
    // fall speed, brightness, width, shutter exposure
    this.details=new Float32Array(count*4);
    this.generations=new Uint32Array(count);
    this.velocity=[0,0,0];this.reset(seed);
  }
  reset(seed=21703){
    this.rng=makeRng(seed);this.generations.fill(0);this.elapsed=0;
    for(let i=0;i<this.capacity;i++)this.spawn(i,false,0);
  }
  spawn(i,upstream,dt){
    const r=this.rng,p=i*3,d=i*4,h=this.half;
    this.details[d]=6+r()*4;
    this.details[d+1]=.45+r()*.55;
    this.details[d+2]=.6+r()*.65;
    this.details[d+3]=.006+r()*.007;
    this.centers[p]=(r()*2-1)*h;this.centers[p+1]=(r()*2-1)*h;this.centers[p+2]=(r()*2-1)*h;
    if(upstream){
      const vx=this.velocity[0],vy=this.velocity[1]-this.details[d],vz=this.velocity[2];
      // Equal-area cube faces: incoming flux is proportional to normal speed.
      const ax=Math.abs(vx),ay=Math.abs(vy),az=Math.abs(vz),pick=r()*(ax+ay+az);
      const axis=pick<ax?0:pick<ax+ay?1:2,v=axis===0?vx:axis===1?vy:vz;
      this.centers[p+axis]=-Math.sign(v)*h+v*r()*Math.min(dt,.05);
    }
    this.generations[i]++;
  }
  update(dt,state){
    const step=Math.max(0,Math.min(dt,.1));
    const wind=(state.windKts||0)*KTS,dir=(state.windDirDeg||0)*DEG;
    this.velocity[0]=-Math.sin(dir)*wind-(state.vx||0);
    this.velocity[1]=-(state.vy||0);
    this.velocity[2]=Math.cos(dir)*wind-(state.vz||0);
    if(!step)return false;
    this.elapsed+=step;
    const [vx,vy,vz]=this.velocity,p=this.centers,d=this.details,h=this.half;
    for(let i=0;i<this.count;i++){
      const k=i*3;p[k]+=vx*step;p[k+1]+=(vy-d[i*4])*step;p[k+2]+=vz*step;
      if(Math.abs(p[k])>h||Math.abs(p[k+1])>h||Math.abs(p[k+2])>h)this.spawn(i,true,step);
    }
    return true;
  }
}
