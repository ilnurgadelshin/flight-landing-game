// Reviewed ground outlines in the bundled 1032 px low NAIP tiles (1 px / metre,
// including the 16 m gutter). No new imagery, map service or inferred survey data.
import fs from 'node:fs/promises';
const sites=[{
 id:'north-farm',name:'Opposite approach farm',tile:'2_-1',roadSurface:'gravel',
 lawns:[[[365,601],[389,598],[439,638],[455,675],[403,711],[349,711],[335,681],[355,659]]],
 gravel:[[[380,615],[415,607],[440,642],[443,654],[397,682],[377,658]],[[342,667],[365,668],[374,691],[351,701],[339,688]]],
 streets:[{points:[[325,430],[337,475],[350,517],[365,563],[379,601],[390,628],[400,660],[430,695],[453,724],[446,743]],width:4.2}],
 paths:[{points:[[413,648],[410.4,672.1]],width:4.2,connectsRoad:true},{points:[[359,690],[382,692],[405,688],[427.2,691.7]],width:3.5,connectsRoad:true}],
 fences:[[[425,676],[450,659],[472,695]],[[340,660],[333,680],[344,713]]],
 trees:[[368,618,9,7],[351,649,11,0],[338,666,10,8],[345,708,11,7],[402,714,8,0],[460,676,10,7],[460,694,11,8]],
},{
 id:'ridge-hamlet',name:'Opposite wooded hamlet',tile:'3_-1',roadSurface:'gravel',
 lawns:[[[142,696],[181,677],[216,681],[233,704],[261,706],[264,744],[232,770],[171,772],[143,746]]],
 gravel:[[[177,729],[190,713],[212,703],[220,714],[204,733]],[[166,728],[179,727],[187,744],[173,752]],[[227,713],[244,709],[254,727],[241,740],[227,732]]],
 streets:[{points:[[83,645],[104,677],[120,703],[144,722],[165,731],[189,727],[212,716],[245,720]],width:3.6}],
 paths:[{points:[[198,749],[194,737],[189,727]],width:3.2,connectsRoad:true}],
 fences:[[[216,687],[238,697],[257,704]],[[172,770],[201,775],[232,768]]],
 trees:[[143,707,10,0],[153,752,12,7],[178,772,9,8],[219,773,11,0],[257,746,10,7],[268,726,13,8],[235,684,11,0],[164,686,10,7]],
}];
for(const site of sites){
 const [tx,tz]=site.tile.split('_').map(Number),point=([x,z])=>[tx*1000-16+x,tz*1000-16+z];
 site.sourcePixels={lawns:site.lawns,gravel:site.gravel,streets:site.streets,paths:site.paths,fences:site.fences,trees:site.trees};
 site.lawns=site.lawns.map(p=>p.map(point));site.gravel=site.gravel.map(p=>p.map(point));site.fences=site.fences.map(p=>p.map(point));
 site.streets=site.streets.map(r=>({...r,points:r.points.map(point)}));site.paths=site.paths.map(r=>({...r,points:r.points.map(point)}));site.roads=[];
 site.trees=site.trees.map(([x,z,h,row])=>{const [px,pz]=point([x,z]);return {x:px,z:pz,h,row};});
}
await fs.writeFile('assets/scenery/approach-sites.json',JSON.stringify({license:'MIT; original site interpretations from bundled public-domain USDA NAIP imagery. Not a surveyed reconstruction.',sites},null,2)+'\n');
