// Interpreted field/woodland boundaries traced from the bundled public-domain NAIP.
// Coordinates below refer to a 1600px review of each 1032m tile, including its 16m apron.
// Runtime uses one small shared mask for both surface treatment and tree placement.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {protectedScenery} from '../js/world/scenery-ground.js';
const traces=[
 ['2_0','meadow',[[104,0],[195,0],[619,580],[695,734],[642,847],[549,927],[424,698]]],
 ['2_0','stubble',[[206,0],[336,0],[522,279],[610,492],[678,664],[698,732],[623,637]]],
 ['2_0','meadow',[[345,0],[511,0],[724,272],[724,487],[840,592],[965,606],[834,719],[710,856],[695,731],[610,476],[523,274]]],
 ['2_0','stubble',[[0,156],[64,231],[300,596],[488,891],[451,996],[351,1116],[241,1059],[115,823],[0,614]]],
 ['2_0','meadow',[[0,40],[100,64],[440,607],[551,930],[635,883],[530,1106],[377,1205],[323,1148],[456,984],[482,889],[234,501]]],
 ['2_0','woodland',[[1120,0],[1600,0],[1600,1080],[1415,1080],[1360,985],[1230,1030],[1150,870],[1020,782],[999,701],[1050,615],[1090,488],[1005,450],[1100,341]]],
 ['2_0','woodland',[[882,604],[966,598],[1064,721],[1160,853],[1107,997],[947,1039],[876,1180],[676,1268],[575,1204],[624,1050],[739,1002],[721,893],[810,748]]],
 ['2_0','woodland',[[1094,1240],[1230,1255],[1245,1490],[1170,1600],[917,1600],[917,1500],[1052,1443]]],
 ['3_0','meadow',[[777,0],[969,0],[1085,232],[1123,383],[997,458],[824,355],[767,303],[797,213]]],
 ['3_0','meadow',[[606,0],[765,0],[794,203],[759,300],[823,357],[867,433],[797,611],[707,702],[651,746],[518,674],[554,575],[549,501],[612,404],[632,299],[586,227]]],
 ['3_0','meadow',[[870,443],[1118,378],[1148,449],[1066,589],[1018,706],[947,963],[802,1032],[733,1028],[724,809],[693,731],[797,630]]],
 ['3_0','stubble',[[485,856],[694,770],[723,1024],[506,1032],[464,940]]],
 ['3_0','woodland',[[0,0],[568,0],[553,90],[615,186],[591,298],[529,445],[450,482],[407,633],[319,783],[352,849],[259,1024],[157,945],[221,827],[231,647],[136,556],[206,333],[134,233],[0,271]]],
 ['3_0','woodland',[[1250,0],[1600,0],[1600,402],[1477,395],[1443,508],[1317,570],[1271,692],[1110,824],[1034,757],[1036,676],[1100,551],[1162,449],[1147,314]]],
 ['3_0','woodland',[[505,1053],[774,1020],[892,985],[963,913],[1055,834],[1221,798],[1213,858],[1056,931],[955,1027],[863,1112],[632,1230],[448,1270],[428,1171]]],
];
const bounds=[2100,180,2000,850],width=1000,height=425;
const areas=traces.map(([tile,type,points])=>({tile,type,points:points.map(([x,z])=>[Number((Number(tile[0])*1000-16+x*1032/1600).toFixed(2)),Number((-16+z*1032/1600).toFixed(2))])}));
function signedDistance(x,z,points){
 let inside=false,distance=Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return distance*(inside?1:-1);
}
const buildings=[...JSON.parse(await fs.readFile('assets/scenery/approach-buildings.json')).buildings,...JSON.parse(await fs.readFile('assets/scenery/approach-infill.json')).buildings].filter(b=>b.x>2000&&b.x<4200&&b.z>100&&b.z<1100);
const roads=JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads;
function roadDistance(x,z){let d=Infinity;for(const r of roads)for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 d=Math.min(d,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
}return d;}
const pixels=new Uint8Array(width*height*3),counts=[0,0,0];
for(let j=0;j<height;j++)for(let i=0;i<width;i++){
 const x=bounds[0]+(i+.5)*bounds[2]/width,z=bounds[1]+(j+.5)*bounds[3]/height;
 if(protectedScenery(x,z,16))continue;
 let clearance=Math.min(1,Math.max(0,(roadDistance(x,z)-7)/7));
 for(const b of buildings){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
  const d=Math.hypot(Math.max(0,Math.abs(dx*c+dz*s)-b.w/2),Math.max(0,Math.abs(-dx*s+dz*c)-b.d/2));
  clearance=Math.min(clearance,Math.max(0,Math.min(1,(d-12)/12)));
 }
 const boundary=Math.min(1,(x-bounds[0])/35,(bounds[0]+bounds[2]-x)/35,(z-bounds[1])/25,(bounds[1]+bounds[3]-z)/25);
 const weights=[0,0,0];
 for(const a of areas){const d=signedDistance(x,z,a.points),channel=['meadow','stubble','woodland'].indexOf(a.type);
  weights[channel]=Math.max(weights[channel],Math.max(0,Math.min(1,d/(channel===2?12:6))));
 }
 // Woods take precedence at shared field margins; keep total coverage <= 1.
 weights[1]*=(1-weights[2])*(1-weights[0]);weights[0]*=1-weights[2];
 for(let c=0;c<3;c++){pixels[(j*width+i)*3+c]=Math.round(weights[c]*clearance*boundary*255);counts[c]+=pixels[(j*width+i)*3+c]/255;}
}
await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile('assets/scenery/approach-corridor.png');
await fs.writeFile('assets/scenery/approach-corridor.json',JSON.stringify({bounds,width,height,licence:'Interpreted boundaries derived from public-domain USDA NAIP / USGS imagery already bundled in detail/2_0.webp and detail/3_0.webp. Not a land-use survey.',areas,hectares:counts.map(c=>Number((c*bounds[2]/width*bounds[3]/height/10000).toFixed(2)))},null,2)+'\n');
console.log('Corridor meadow/stubble/woodland hectares',counts.map(c=>c*4/10000),'mask bytes',(await fs.stat('assets/scenery/approach-corridor.png')).size);
