import { TERRAIN } from '../physics/terrain.js';

// Height of the rendered terrain triangle, including the low-tier coarse grid.
// Roads and foundations must meet that triangle, not float above a smoother query.
export function sceneryGroundHeight(x,z,low=false) {
  const tx=Math.floor((x+60000)/10000)*10000-60000;
  const tz=Math.floor((z+55000)/10000)*10000-55000;
  const nearby=tx>=-10000&&tx<20000&&tz>=-15000&&tz<5000;
  const step=10000/(nearby?(low?64:160):(low?16:40));
  const ix=Math.floor((x-tx)/step),iz=Math.floor((z-tz)/step);
  const x0=tx+ix*step,z0=tz+iz*step,u=(x-x0)/step,v=(z-z0)/step;
  const h00=TERRAIN.heightAt(x0,z0),h10=TERRAIN.heightAt(x0+step,z0),h01=TERRAIN.heightAt(x0,z0+step);
  if(u+v<=1)return h00+(h10-h00)*u+(h01-h00)*v-.05;
  const h11=TERRAIN.heightAt(x0+step,z0+step);
  return h11+(h01-h11)*(1-u)+(h10-h11)*(1-v)-.05;
}

export function protectedScenery(x,z,margin=0) {
  return (Math.abs(x)<2100+margin&&Math.abs(z-120)<700+margin)||
    (x>1500-margin&&x<3400+margin&&Math.abs(z)<180+margin);
}
