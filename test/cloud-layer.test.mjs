import assert from 'node:assert/strict';
import {cloudDensityAt,cloudPathLength,CLOUD_EXTINCTION} from '../js/world/cloud-layer.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),base=100,top=1000;
// Clear rays are clear even arbitrarily close to a boundary. A full crossing's
// column is the thickness minus the area missing from its two triangular ramps.
for(const y of [99.99,1000.01])close(cloudDensityAt(y,base,top),0);
close(cloudPathLength(1012,1,20000,base,top),0);
close(cloudPathLength(1012,0,20000,base,top),0);
close(cloudPathLength(88,-1,20000,base,top),0);
close(cloudPathLength(1012,-1,12,base,top),0);
close(cloudPathLength(1012,-1,2000,base,top),868);
close(cloudPathLength(88,1,2000,base,top),868);
close(cloudPathLength(1012,-.5,4000,base,top),1736);
close(cloudPathLength(984,1,2000,base,top),4); // half of a 16 m × 0.5-density triangle
close(cloudPathLength(116,-1,2000,base,top),4);
close(Math.exp(-CLOUD_EXTINCTION*cloudPathLength(500,0,120,base,top)),.05);
close(cloudPathLength(500,0,10,base,top),10); // nearby foreground is not a cloud wall
for(const dy of [-1,-.3,-.001,.001,.3,1])for(const y of [0,116,500,984,1100]){
 const first=cloudPathLength(y,dy,400,base,top),last=cloudPathLength(y+dy*400,dy,1600,base,top);
 close(first+last,cloudPathLength(y,dy,2000,base,top));
 close(cloudPathLength(y,dy,2000,base,top),cloudPathLength(y+dy*2000,-dy,2000,base,top));
}
// A grazing ray can cross the fringe even when its vertical component is tiny.
close(cloudPathLength(1004,-.00009,60000,base,top),1.4*1.4/(2*32*.00009));
close(cloudPathLength(984,.00001,120,base,top),120*(16-.00001*60)/32);
close(cloudPathLength(0,1,500,100,120),10); // thin layers shorten both ramps safely
close(cloudPathLength(0,1,500,100,100),0);
console.log('Cloud rays: clear sky, boundary exit, opaque interior, foreground, symmetry and thin layers passed');
