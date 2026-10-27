// Reviewed ground outlines in the bundled 1032 px low NAIP tiles (1 px / metre,
// including the 16 m gutter). No new imagery, map service or inferred survey data.
import fs from 'node:fs/promises';
import {prepareCrossingSites} from './crossing-sites.mjs';
import {prepareValleyLaneSites} from './valley-lane-sites.mjs';
import {prepareRidgeFarmSites} from './ridge-farm-site.mjs';
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
},{
 id:'contour-farm',name:'Contour-crop dairy and silos',tile:'4_-1',roadSurface:'gravel',
 lawns:[[[374,481],[441,477],[457,487],[491,478],[511,488],[510,520],[514,556],[511,587],[479,590],[448,588],[413,590],[393,579],[393,550],[375,535]]],
 gravel:[[[389,482],[441,480],[449,494],[482,497],[497,511],[498,546],[498,574],[477,582],[425,582],[409,572],[407,548],[393,532]],[[476,482],[496,481],[501,497],[486,505],[473,499]]],
 streets:[{points:[[490,472],[505,487],[506,514],[502,543],[505,574],[506,604]],width:4.6}],
 paths:[{points:[[411,530],[437,534],[467,538],[502.7,538]],width:5.5,connectsRoad:true},
        {points:[[421,572],[450,579],[479,579],[505.2,579]],width:5,connectsRoad:true},
        {points:[[454,495],[486,490],[505.3,493]],width:4.5,connectsRoad:true}],
 fences:[[[395,549],[392,573],[410,594],[466,600],[488,593]],[[375,480],[369,500],[375,526]]],
 trees:[[381,474,10,7],[510,473,9,0],[525,581,10,8]],
},{
 id:'roadside-homes',name:'Residential approach frontage',tile:'4_0',roadSurface:'gravel',
 gravelTone:.28,
 // Distinct parcels leave the fields, wood margins and main asphalt road intact.
 lawns:[[[278,139],[306,117],[350,112],[382,120],[399,148],[397,184],[376,204],[347,207],[296,193],[281,174]],
 [[523,172],[542,154],[571,154],[603,167],[610,193],[586,210],[547,207],[524,193]],
 [[554,87],[567,70],[607,68],[620,88],[614,105],[588,121],[567,120]],
 [[629,24],[650,10],[683,15],[710,32],[711,53],[687,70],[658,70],[636,50]],
 [[706,83],[741,76],[767,98],[781,132],[783,177],[760,199],[721,186],[710,151]],
 [[742,227],[773,218],[798,231],[797,264],[777,275],[748,264]]],
 // Retain the photographed swimming pool rather than paint grass over it.
 preserve:[[[309,141],[333,137],[339,157],[315,162]]],
 gravel:[[[338,159],[361,139],[370,127],[387,136],[383,150],[366,165],[352,183]],
 [[538,175],[550,164],[580,167],[592,184],[579,196],[551,192]],
 [[564,93],[573,83],[597,85],[607,99],[592,108],[570,108]],
 [[640,28],[657,22],[666,40],[653,55],[637,46]],
 [[725,88],[751,84],[765,106],[764,139],[746,154],[725,146]],
 [[756,165],[777,162],[782,178],[768,189],[754,179]],
 [[754,238],[781,234],[790,249],[782,264],[758,260]]],
 streets:[{points:[[361,187],[371,201],[382.6,218.8]],width:3.8},
 {points:[[553,176],[540,161],[535.1,159.6]],width:3.8},
 {points:[[579,104],[570,112],[567.2,140.6]],width:3.6},
 {points:[[656,43],[671,51],[681.4,83.6]],width:3.7},
 {points:[[771,255],[772,217],[774,178],[774,143],[771,113],[772,83],[759.3,52.2]],width:3.8}],
 paths:[{points:[[358,170],[361,187]],width:4,connectsRoad:true},
 {points:[[573,183],[553,176]],width:4,connectsRoad:true},
 {points:[[594,98],[579,104]],width:3.6,connectsRoad:true},
 {points:[[649,41],[656,43]],width:3.8,connectsRoad:true},
 {points:[[739,125],[762,125],[772.2,125]],width:5,connectsRoad:true},
 {points:[[769,178],[774,178]],width:3.5,connectsRoad:true},
 {points:[[777,247],[771.2,247]],width:3.6,connectsRoad:true}],
 fences:[[[291,175],[297,195],[341,211]],[[532,199],[548,212],[590,213]],
 [[624,30],[627,56],[654,75]],[[713,142],[710,171],[722,190]],[[744,236],[741,261],[767,276]]],
 trees:[[282,151,10,7],[300,119,9,0],[395,174,9,8],[608,202,10,7],
 [541,213,9,0],[561,70,8,8],[618,81,9,7],[689,26,10,0],[709,46,9,8],
 [714,176,9,7],[794,170,10,0],[799,240,10,8],[748,271,9,7]],
}];
for(const site of sites){
 const [tx,tz]=site.tile.split('_').map(Number),point=([x,z])=>[tx*1000-16+x,tz*1000-16+z];
 site.sourcePixels={lawns:site.lawns,gravel:site.gravel,streets:site.streets,paths:site.paths,fences:site.fences,trees:site.trees,...(site.preserve?{preserve:site.preserve}:{})};
 site.lawns=site.lawns.map(p=>p.map(point));site.gravel=site.gravel.map(p=>p.map(point));site.fences=site.fences.map(p=>p.map(point));
 site.streets=site.streets.map(r=>({...r,points:r.points.map(point)}));site.paths=site.paths.map(r=>({...r,points:r.points.map(point)}));site.roads=[];
 if(site.preserve)site.preserve=site.preserve.map(p=>p.map(point));
 site.trees=site.trees.map(([x,z,h,row])=>{const [px,pz]=point([x,z]);return {x:px,z:pz,h,row};});
}
sites.push(...prepareCrossingSites(JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads));
sites.push(...prepareValleyLaneSites(JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads));
sites.push(...prepareRidgeFarmSites(JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads));
await fs.writeFile('assets/scenery/approach-sites.json',JSON.stringify({license:'MIT; original site interpretations from bundled public-domain USDA NAIP imagery. Not a surveyed reconstruction.',sites},null,2)+'\n');
