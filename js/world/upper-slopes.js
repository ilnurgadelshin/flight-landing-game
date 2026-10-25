// Shared CPU/GPU overlay rules. The 180m overlaps replace the old outer fades
// gradually, without editing the old maps or changing the low tier.
export function upperSlopeBlend(tile,x,z){
 const [x0,z0,w,d]=tile.bounds;
 if(x<x0||x>=x0+w||z<z0||z>=z0+d)return 0;
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 return smooth((x-x0)/180)*smooth((tile.side==='north'?z0+d-z:z-z0)/180);
}

export function validateUpperSlopes(manifest){
 const tiles=manifest.upperSlopes;if(tiles===undefined)return;
 const {bounds:[x,z,w,d],width,height,textureHeight,hills,oppositeHills}=manifest;
 const invalid=()=>{throw new Error('Invalid upper slope land-cover allocation');};
 if(!hills||!oppositeHills||!Array.isArray(tiles)||tiles.length!==2)invalid();
 let end=oppositeHills.atlas[0]+oppositeHills.width,total=0;
 for(let i=0;i<2;i++){
  const t=tiles[i],b=t?.bounds,a=t?.atlas,zone=t?.plantingZones?.[0],near=i===0?oppositeHills:hills;
  if(!t||t.side!==(i===0?'north':'south')||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||
   b[0]!==near.bounds[0]+near.bounds[2]-180||b[0]+b[2]!==x+w||b[2]<=180||
   b[1]!== (i===0?near.bounds[1]:z+d-180)||b[1]+b[3]!== (i===0?z+180:near.bounds[1]+near.bounds[3])||b[3]<=180||
   !Number.isInteger(t.width)||t.width<1||t.width>1024||t.height!==hills.height||
   !Array.isArray(a)||a.length!==2||!a.every(Number.isInteger)||a[0]<end+6||a[0]+t.width>width||
   a[1]!==hills.atlas[1]||a[1]<height||a[1]+t.height!==textureHeight||
   !Array.isArray(t.plantingZones)||t.plantingZones.length!==1||!zone||
   !Array.isArray(zone.bounds)||zone.bounds.length!==4||!zone.bounds.every(Number.isFinite)||
   zone.bounds[0]!==b[0]+180||zone.bounds[2]!==b[2]-180||
   zone.bounds[1]!== (i===0?b[1]:z+d)||zone.bounds[3]!==b[3]-180||
   !Number.isInteger(zone.seed)||!Number.isInteger(zone.highLimit)||zone.highLimit<1||zone.highLimit>5000||zone.lowLimit!==0||
   !Number.isFinite(zone.highSpacing)||zone.highSpacing<16||!Number.isFinite(zone.lowSpacing)||zone.lowSpacing<32||zone.uniform!==true||
   !Number.isFinite(zone.taper)||zone.taper<=0||zone.taper>1000||!Number.isFinite(zone.taperFloor)||zone.taperFloor<=0||zone.taperFloor>1||
   (i===0?zone.taperSide!=='south':zone.taperSide!==undefined))invalid();
  end=a[0]+t.width;total+=zone.highLimit;
 }
 if(total>8000)invalid();
}
