// Shared by the runtime roof and the offline occlusion bake. Coordinates match
// prepare-cockpit.mjs, so the bake sees the same closed cabin as the renderer.
export function headlinerData() {
  const positions=[],indices=[];
  for(let j=0;j<=12;j++)for(let i=0;i<=16;i++){
    const t=j/12,x=(i/16-.5)*1.65,z=1.42-t*1.40;
    const y=2.27+t*.39+.055*(1-Math.pow(x/.825,2));
    positions.push(-1.7*x,.14+1.7*(y-2.22),-1.7*(z-.9));
    if(i<16&&j<12){const a=j*17+i;indices.push(a,a+1,a+17,a+1,a+18,a+17);}
  }
  return {positions,indices};
}
