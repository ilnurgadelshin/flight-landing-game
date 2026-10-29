import * as THREE from 'three';

export function airportCountryBlend(tile,x,z){
 const [x0,z0,w,d]=tile.bounds;
 if(x<x0||x>=x0+w||z<z0||z>=z0+d)return 0;
 const t=Math.max(0,Math.min(1,(x-tile.join[0])/(tile.join[1]-tile.join[0])));
 return 1-t*t*(3-2*t);
}

export function validateAirportCountryside(m){
 const fail=()=>{throw new Error('Invalid airport countryside allocation');};
 if(!m||!Array.isArray(m.bounds)||m.bounds.length!==4||!m.bounds.every(Number.isFinite)||
  !Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<1||m.height<1||m.width>1024||m.height>1024||m.width*m.height>640*768||
  m.bounds.some((v,i)=>v!==[-2100,-2500,4380,5000][i])||!Array.isArray(m.join)||m.join.length!==2||m.join[0]!==2100||m.join[1]!==2280||
  !Array.isArray(m.plantingZones)||m.plantingZones.length!==2)fail();
 for(const [i,z] of m.plantingZones.entries()){
  if(!z||!Array.isArray(z.bounds)||z.bounds.length!==4||!z.bounds.every((v,k)=>v===[[-2100,-2500,4200,1900],[-2100,850,4200,1650]][i][k])||
   !Number.isInteger(z.seed)||!Number.isInteger(z.highLimit)||z.highLimit<1||z.highLimit>2000||z.lowLimit!==0||
   !Number.isFinite(z.highSpacing)||z.highSpacing<12||z.highSpacing>40||z.uniform!==true||z.strictBounds!==true)fail();
 }
}

// Load only on high, behind the menu. Failure is local: preserve all earlier
// corridor maps and their tree allocations, plus the photographic airport ground.
export async function loadAirportCountryside(world,packCover){
 if(world.lowDetail||world.quality==='low')return null;
 const url=ext=>new URL('../../assets/scenery/airport-countryside.'+ext,import.meta.url).href;
 const response=await fetch(url('json'));if(!response.ok)throw new Error(`Airport countryside: HTTP ${response.status}`);
 const manifest=await response.json();validateAirportCountryside(manifest);
 const texture=await new THREE.TextureLoader().loadAsync(url('png'));
 if(texture.image.width!==manifest.width||texture.image.height!==manifest.height){texture.dispose();throw new Error('Airport countryside image does not match its manifest');}
 texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 const canvas=document.createElement('canvas');canvas.width=manifest.width;canvas.height=manifest.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);
 const cover=packCover(context.getImageData(0,0,manifest.width,manifest.height).data,manifest.width*manifest.height);
 canvas.width=canvas.height=0;
 const sample=(x,z)=>{
  const [x0,z0,w,d]=manifest.bounds,i=Math.floor((x-x0)/w*manifest.width),j=Math.floor((z-z0)/d*manifest.height);
  return i<0||j<0||i>=manifest.width||j>=manifest.height?[0,0,0]:cover(j*manifest.width+i);
 };
 world.groundUniforms.uAirportCountry.value=texture;
 world.groundUniforms.uAirportCountryReady.value=1;
 world.groundUniforms.uAirportCountryRect.value.fromArray(manifest.bounds);
 return {manifest,texture,sample,plantingZones:manifest.plantingZones};
}
