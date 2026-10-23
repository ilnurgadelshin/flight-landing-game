// Interpreted field/woodland boundaries traced from the bundled public-domain NAIP.
// Coordinates below refer to a 1600px review of each 1032m tile, including its 16m apron.
// Runtime uses one small shared mask for both surface treatment and tree placement.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {protectedScenery} from '../js/world/scenery-ground.js';
import {upperValleyTraces} from './upper-valley-cover.mjs';
import {crossingCover} from './crossing-sites.mjs';
import {approachHills} from './approach-hills.mjs';
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
 // Extend the interpreted cover up final through the two existing forest tiles.
 // Preserve the photographed residential yards, diagonal road and southern fields.
 ['4_0','woodland',[[0,0],[537,0],[530,109],[593,116],[568,213],[446,211],[371,217],[292,249],[275,327],[315,365],[406,365],[443,397],[384,446],[313,520],[246,573],[164,647],[0,719]]],
 ['4_0','woodland',[[0,747],[170,678],[267,614],[345,535],[404,457],[484,415],[592,368],[666,352],[706,404],[750,387],[784,425],[854,462],[1001,449],[1079,432],[1117,434],[1147,475],[1243,485],[1270,435],[1281,327],[1301,260],[1318,177],[1370,0],[1600,0],[1600,1600],[0,1600]]],
 ['4_0','meadow',[[868,339],[951,307],[1029,272],[1054,284],[1064,331],[1060,427],[984,444],[869,430],[851,384]]],
 ['5_0','woodland',[[0,0],[1600,0],[1600,1056],[1530,1072],[1429,1120],[1369,1162],[1326,1203],[1325,1300],[1108,1290],[1097,1335],[822,1354],[726,1334],[640,1280],[594,1272],[571,1220],[568,1160],[588,1110],[570,1048],[550,1090],[548,1200],[532,1276],[416,1289],[376,1333],[355,1438],[340,1496],[244,1499],[202,1457],[0,1419]]],
 ['5_0','meadow',[[390,1355],[430,1320],[530,1322],[565,1362],[570,1446],[510,1483],[372,1485]]],
 ['5_0','meadow',[[685,1370],[727,1373],[761,1418],[790,1427],[820,1387],[858,1388],[887,1450],[828,1479],[772,1487],[736,1512],[693,1495],[661,1452]]],
 ['5_0','stubble',[[1363,1231],[1394,1171],[1438,1137],[1462,1119],[1470,1190],[1492,1240],[1495,1283],[1402,1299],[1318,1294],[1341,1273],[1380,1263]]],

 // Opposite side of final: retain the diagonal residential lane and its yards.
 ['2_-1','woodland',[[0,0],[1180,0],[1157,80],[1050,116],[960,168],[929,230],[875,216],[815,255],[816,305],[729,356],[703,409],[642,421],[617,477],[550,512],[545,564],[479,602],[432,666],[361,709],[356,748],[284,786],[242,850],[161,898],[108,918],[69,967],[0,994]]],
 ['2_-1','woodland',[[0,1020],[93,970],[117,949],[192,933],[243,874],[312,808],[331,845],[330,909],[292,997],[350,1025],[319,1090],[244,1133],[229,1185],[188,1239],[141,1229],[108,1290],[91,1225],[12,1270],[0,1240]]],
 ['2_-1','woodland',[[391,740],[506,666],[580,697],[669,693],[708,746],[756,756],[747,865],[759,951],[792,1012],[803,1061],[748,1080],[680,1021],[642,948],[627,879],[598,816],[542,731],[505,749],[449,844],[425,925],[395,958],[363,1004],[324,980],[345,900],[344,839]]],
 ['2_-1','woodland',[[783,399],[990,278],[1018,321],[1043,356],[1086,402],[1102,458],[1071,499],[1036,483],[1014,438],[927,465],[932,504],[881,502],[863,463],[815,475]]],
 ['2_-1','woodland',[[1075,285],[1263,178],[1366,116],[1499,67],[1569,93],[1600,159],[1600,240],[1491,282],[1480,351],[1449,364],[1409,317],[1400,262],[1317,285],[1216,343],[1150,356],[1109,340]]],
 ['2_-1','woodland',[[1119,392],[1244,329],[1381,291],[1384,367],[1419,458],[1433,570],[1468,716],[1386,760],[1307,782],[1219,759],[1157,766],[1115,721],[1075,681],[1078,616],[1100,557],[1134,479]]],
 ['2_-1','woodland',[[1229,853],[1308,813],[1437,748],[1524,682],[1543,763],[1571,832],[1600,846],[1600,1250],[1538,1230],[1480,1122],[1414,1045],[1375,1034],[1334,1049],[1291,1109],[1288,1196],[1262,1249],[1201,1241],[1173,1136],[1129,1059],[1186,958]]],
 ['2_-1','stubble',[[706,603],[784,572],[823,604],[861,587],[894,651],[860,677],[809,689],[768,731],[723,710],[694,675]]],
 ['2_-1','stubble',[[535,729],[557,763],[591,820],[620,887],[584,952],[540,984],[521,940],[497,853],[495,790]]],
 ['2_-1','meadow',[[1420,352],[1518,295],[1600,273],[1600,568],[1549,607],[1530,667],[1474,713],[1442,558],[1430,472]]],
 ['2_-1','meadow',[[1078,794],[1142,774],[1179,799],[1227,771],[1250,815],[1189,883],[1100,956],[1053,1000],[1046,947],[1010,920]]],
 // Larger pasture and hay parcels farther up final, with wooded margins intact.
 ['3_-1','meadow',[[0,319],[125,267],[187,240],[272,230],[292,298],[303,399],[258,457],[246,500],[272,529],[238,605],[145,679],[48,696],[0,749]]],
 ['3_-1','meadow',[[335,241],[465,178],[516,213],[598,197],[654,128],[689,182],[730,166],[731,202],[776,257],[816,242],[843,282],[860,372],[871,492],[850,526],[893,570],[883,689],[950,783],[891,821],[890,864],[804,917],[783,884],[719,914],[673,901],[659,860],[804,788],[792,745],[682,779],[657,733],[715,678],[693,652],[646,655],[575,619],[517,638],[486,612],[462,496],[421,484],[388,393]]],
 ['3_-1','meadow',[[320,465],[342,509],[351,589],[386,654],[404,764],[458,832],[445,890],[431,972],[460,1005],[432,1028],[361,987],[373,909],[347,832],[330,740],[308,701],[321,640],[285,610],[297,538]]],
 ['3_-1','stubble',[[1286,484],[1416,359],[1440,411],[1474,521],[1515,619],[1547,753],[1593,849],[1600,948],[1503,986],[1446,971],[1420,893],[1390,832],[1358,719],[1328,682],[1301,571]]],
 ['3_-1','stubble',[[1397,35],[1432,24],[1496,96],[1512,140],[1476,174],[1414,235],[1365,266],[1320,167],[1328,105]]],
 ['3_-1','meadow',[[449,1219],[523,1229],[585,1244],[618,1311],[683,1322],[743,1404],[789,1488],[822,1600],[543,1600],[517,1480],[480,1368]]],
 ['3_-1','woodland',[[0,0],[555,0],[523,94],[465,160],[422,173],[356,212],[289,198],[271,223],[192,222],[134,248],[0,303]]],
 ['3_-1','woodland',[[0,775],[81,733],[131,711],[181,662],[214,632],[267,652],[298,735],[304,799],[283,860],[291,934],[265,994],[231,1057],[156,1042],[155,994],[112,997],[115,1068],[92,1104],[97,1132],[84,1168],[112,1206],[89,1285],[32,1271],[0,1192]]],
 ['3_-1','woodland',[[663,0],[989,0],[1035,68],[1014,115],[1054,159],[1064,216],[1165,271],[1122,358],[1218,429],[1267,509],[1301,631],[1368,768],[1406,916],[1505,1036],[1600,1040],[1600,1516],[1523,1550],[1458,1504],[1428,1404],[1319,1335],[1261,1386],[1210,1491],[1166,1558],[1068,1536],[1069,1444],[994,1327],[886,1265],[830,1194],[738,1145],[620,1182],[578,1175],[479,1187],[438,1170],[398,1211],[373,1226],[317,1218],[299,1191],[322,1147],[293,1084],[349,1047],[380,1031],[411,1064],[490,999],[614,1005],[707,966],[809,943],[843,915],[920,892],[920,851],[978,801],[1002,754],[946,727],[915,699],[920,632],[911,594],[886,537],[896,498],[882,390],[867,279],[834,230],[805,237],[760,186],[730,136],[710,146],[673,109],[623,105]]],
 ['3_-1','woodland',[[1147,0],[1257,0],[1248,54],[1197,64],[1160,108],[1151,169],[1102,132],[1080,103],[1113,64]]],

 ['3_-1','woodland',[[398,463],[447,492],[465,590],[502,625],[555,603],[605,635],[654,639],[682,627],[706,652],[697,684],[661,729],[680,757],[648,778],[584,767],[557,822],[490,850],[456,814],[433,750],[402,685],[375,629],[364,554]]],
 ['3_-1','woodland',[[438,830],[497,851],[540,882],[518,924],[582,921],[604,951],[550,979],[474,991],[437,1024],[452,951]]],

];
// Upper opposite approach, traced directly in the bundled 1032px low tiles.
// Keep the contour-cropped strips separate instead of painting the whole farm
// one colour. Yards, ponds, lanes and the open creek channel retain the photo.
const upperTraces=[
 ['4_-1','stubble',[[0,104],[91,18],[140,0],[209,47],[247,112],[231,167],[217,206],[258,250],[272,360],[254,433],[249,494],[56,576],[0,564]]],
 ['4_-1','meadow',[[0,164],[65,213],[132,244],[173,243],[204,224],[234,190],[242,209],[213,246],[177,268],[140,280],[91,264],[36,238],[0,219]]],
 ['4_-1','meadow',[[0,278],[62,312],[119,333],[157,338],[201,319],[210,337],[180,368],[148,382],[89,367],[0,325]]],
 ['4_-1','meadow',[[0,393],[80,426],[145,444],[192,426],[218,393],[231,356],[251,366],[244,415],[214,457],[182,478],[114,493],[46,510],[0,499]]],
 ['4_-1','woodland',[[221,201],[243,211],[263,248],[278,282],[278,307],[262,322],[253,295],[239,282],[224,295],[207,279],[204,241]]],
 ['4_-1','stubble',[[262,143],[293,166],[334,219],[376,245],[399,320],[423,374],[484,439],[450,466],[372,481],[320,466],[301,408],[295,350],[293,294],[278,269],[279,224]]],
 ['4_-1','meadow',[[0,597],[60,582],[200,538],[314,499],[346,508],[363,548],[341,570],[287,570],[246,585],[213,609],[158,627],[93,653],[49,647],[16,675],[0,659]]],
 ['4_-1','woodland',[[263,0],[302,0],[353,58],[374,107],[402,166],[426,220],[449,275],[470,326],[502,398],[521,442],[515,467],[497,485],[497,435],[458,389],[435,337],[408,296],[383,246],[362,218],[342,186],[321,146],[303,103]]],
 ['4_-1','meadow',[[354,0],[661,0],[703,71],[747,102],[803,126],[807,176],[770,193],[731,233],[688,254],[636,268],[568,253],[530,248],[501,208],[476,193],[456,209],[424,192],[407,150],[381,103]]],
 ['4_-1','woodland',[[709,0],[929,0],[973,37],[1032,65],[1032,129],[986,144],[954,154],[941,180],[914,171],[892,143],[873,161],[844,144],[818,128],[778,103],[756,86]]],
 ['4_-1','woodland',[[703,254],[747,222],[806,195],[845,176],[881,157],[913,182],[936,219],[983,258],[1032,277],[1032,369],[993,351],[970,373],[960,426],[933,454],[910,469],[897,516],[874,557],[853,606],[831,627],[804,608],[810,572],[843,533],[850,494],[868,453],[879,413],[862,376],[829,354],[788,333],[761,322],[733,336],[707,310]]],
 ['4_-1','woodland',[[0,713],[40,682],[89,673],[115,646],[166,644],[222,620],[266,612],[288,628],[321,636],[349,670],[322,695],[268,703],[233,713],[197,710],[170,739],[139,777],[106,800],[78,833],[35,857],[0,849]]],
 ['4_-1','woodland',[[0,875],[92,838],[158,785],[213,749],[280,731],[310,752],[353,792],[349,839],[317,854],[284,895],[267,932],[271,982],[236,1032],[0,1032]]],
 ['4_-1','woodland',[[642,739],[682,696],[723,679],[773,669],[808,652],[842,650],[855,684],[821,692],[797,717],[779,759],[752,790],[717,811],[675,830],[661,802]]],

 ['5_-1','stubble',[[0,0],[219,0],[243,36],[234,64],[135,79],[32,94],[0,83]]],
 ['5_-1','stubble',[[0,133],[67,118],[140,118],[219,121],[280,133],[301,171],[290,215],[284,268],[261,277],[218,272],[170,270],[125,290],[66,280],[0,254]]],
 ['5_-1','meadow',[[0,95],[137,89],[244,80],[269,56],[296,63],[305,91],[294,119],[203,110],[142,105],[72,105],[0,120]]],
 ['5_-1','meadow',[[359,353],[454,304],[568,249],[648,214],[695,188],[731,166],[789,165],[814,220],[837,304],[861,380],[880,436],[883,481],[815,523],[730,535],[723,509],[674,501],[634,512],[594,494],[574,424],[553,384],[485,414],[429,443],[405,431],[386,470],[363,489],[343,478],[334,437]]],
 ['5_-1','stubble',[[438,442],[491,419],[550,400],[571,459],[587,510],[570,539],[541,558],[462,571],[434,560],[415,532],[408,493]]],
 ['5_-1','meadow',[[345,634],[409,611],[450,614],[507,586],[546,575],[565,583],[582,634],[606,656],[607,683],[562,700],[497,716],[433,741],[408,744],[390,719],[360,709]]],
 ['5_-1','woodland',[[0,279],[57,294],[112,310],[152,301],[181,306],[186,334],[163,348],[173,393],[208,415],[223,440],[238,464],[261,462],[271,490],[258,541],[248,585],[224,629],[202,644],[162,632],[129,648],[92,642],[91,673],[64,704],[28,708],[0,728]]],
 ['5_-1','woodland',[[0,746],[60,723],[85,720],[101,743],[123,755],[112,775],[100,809],[72,827],[52,840],[20,817],[0,832]]],
 ['5_-1','woodland',[[346,173],[376,172],[412,191],[432,193],[427,218],[411,233],[407,253],[441,268],[449,290],[432,308],[409,315],[400,336],[373,351],[344,382],[327,390],[333,371],[358,343],[383,321],[389,304],[420,291],[423,279],[392,265],[388,248],[399,223],[402,209],[376,201],[349,194]]],
 ['5_-1','woodland',[[872,193],[910,211],[943,225],[980,233],[1032,247],[1032,494],[1001,506],[969,507],[948,488],[929,483],[915,447],[892,396],[876,355],[854,300],[843,258],[846,221]]],
 ['5_-1','woodland',[[625,573],[686,573],[730,553],[785,550],[830,530],[883,511],[931,502],[968,521],[1010,523],[1032,510],[1032,1032],[452,1032],[421,1009],[429,967],[402,942],[410,918],[435,874],[414,841],[418,813],[451,777],[487,742],[532,724],[593,705],[625,677],[645,650],[622,617]]],
 ['5_-1','woodland',[[222,727],[256,725],[288,707],[321,711],[366,716],[395,741],[370,781],[353,822],[376,864],[399,896],[382,923],[401,952],[397,986],[424,1017],[427,1032],[64,1032],[64,1009],[46,980],[53,950],[38,922],[59,898],[90,905],[113,892],[133,865],[164,853],[183,839],[196,811],[207,788]]],
];
traces.push(...upperTraces.map(([tile,type,points])=>[tile,type,points,1032]));
traces.push(...upperValleyTraces);
traces.push(...crossingCover);
const bounds=[2100,-1000,6900,2030],width=3450,height=1015;
// Preserve the original region's grid, feather and planting seed while adding the
// opposite side. Separate planting allocations avoid thinning the reviewed stands.
const plantingZones=[{bounds:[2100,180,4000,850],seed:94051,highLimit:13000,lowLimit:5800},
 {bounds:[2100,-1000,2000,820],seed:77021,highLimit:5500,lowLimit:2600},
 {bounds:[4100,-1000,2000,820],seed:62039,highLimit:3500,lowLimit:1400},
 {bounds:[6100,-1000,2900,2030],seed:251015,highLimit:18000,lowLimit:2600,highSpacing:16,lowSpacing:30},
 // Preserve existing stands: this central strip takes its allocation from the
 // wider photo-selected planting, within the unchanged whole-world tree budget.
 {bounds:[4400,-180,900,360],seed:261022,highLimit:700,lowLimit:300,highSpacing:12,lowSpacing:18}];
// Feather the outside of the coverage, not the internal planting-budget boundary.
const coverRegions=[[2100,180,6900,850],[2100,-1000,6900,820],[6100,-230,2900,460],[4400,-230,900,460]];
const areas=traces.map(([tile,type,points,size=1600,holes=[]])=>{
 const project=ps=>ps.map(([x,z])=>[Number((Number(tile.split('_')[0])*1000-16+x*1032/size).toFixed(2)),Number((Number(tile.split('_')[1])*1000-16+z*1032/size).toFixed(2))]);
 return {tile,type,points:project(points),...(holes.length?{holes:holes.map(project)}:{})};
});
// Polygon bounds reject distant pixels before the more expensive edge distances.
const boundedAreas=areas.map(a=>({...a,rect:[Math.min(...a.points.map(p=>p[0])),Math.min(...a.points.map(p=>p[1])),Math.max(...a.points.map(p=>p[0])),Math.max(...a.points.map(p=>p[1]))]}));
function signedDistance(x,z,points){
 let inside=false,distance=Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return distance*(inside?1:-1);
}
const buildings=[...JSON.parse(await fs.readFile('assets/scenery/approach-buildings.json')).buildings,...JSON.parse(await fs.readFile('assets/scenery/approach-infill.json')).buildings];
const roads=JSON.parse(await fs.readFile('assets/scenery/approach-roads.json')).roads;
// Clearance is already saturated 14 m from roads and 24 m from buildings.
// Index just those bounds so extending the map doesn't test every road segment
// and roof for every pixel. The distance/feather calculation is unchanged.
const roadCells=new Map(),buildingCells=new Map(),cellSize=64;
const index=(map,rect,item)=>{
 for(let x=Math.floor(rect[0]/cellSize);x<=Math.floor(rect[2]/cellSize);x++)for(let z=Math.floor(rect[1]/cellSize);z<=Math.floor(rect[3]/cellSize);z++){
  const key=`${x}:${z}`;if(!map.has(key))map.set(key,[]);map.get(key).push(item);
 }
};
for(const r of roads)for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i];index(roadCells,[Math.min(a[0],b[0])-14,Math.min(a[1],b[1])-14,Math.max(a[0],b[0])+14,Math.max(a[1],b[1])+14],[a,b]);
}
for(const b of buildings){const radius=Math.hypot(b.w,b.d)/2+24;index(buildingCells,[b.x-radius,b.z-radius,b.x+radius,b.z+radius],b);}
function roadDistance(x,z,segments){let d=Infinity;for(const [a,b] of segments){
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 d=Math.min(d,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
}return d;}
const pixels=new Uint8Array(width*height*3),counts=[0,0,0];
for(let j=0;j<height;j++)for(let i=0;i<width;i++){
 const x=bounds[0]+(i+.5)*bounds[2]/width,z=bounds[1]+(j+.5)*bounds[3]/height;
 if(protectedScenery(x,z,16))continue;
 const cell=`${Math.floor(x/cellSize)}:${Math.floor(z/cellSize)}`;
 let clearance=Math.min(1,Math.max(0,(roadDistance(x,z,roadCells.get(cell)||[])-7)/7));
 for(const b of buildingCells.get(cell)||[]){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
  const d=Math.hypot(Math.max(0,Math.abs(dx*c+dz*s)-b.w/2),Math.max(0,Math.abs(-dx*s+dz*c)-b.d/2));
  clearance=Math.min(clearance,Math.max(0,Math.min(1,(d-12)/12)));
 }
 let boundary=Math.max(0,...coverRegions.map(([rx,rz,rw,rd])=>Math.min(1,(x-rx)/35,(rx+rw-x)/35,(z-rz)/25,(rz+rd-z)/25)));
 // These woods continue beyond our interpreted area. Taper their outer coverage
 // over several crowns instead of presenting the rectangular map edge as a treeline.
 const extension=Math.max(0,Math.min(1,(x-5980)/160));
 const outer=Math.max(0,Math.min(1,(9000-x)/180,(z+1000)/160,(1030-z)/160));
 boundary*=1-extension*(1-outer);
 if(!boundary)continue;
 const weights=[0,0,0];
 for(const a of boundedAreas){if(x<a.rect[0]||z<a.rect[1]||x>a.rect[2]||z>a.rect[3])continue;const d=Math.min(signedDistance(x,z,a.points),...(a.holes||[]).map(h=>-signedDistance(x,z,h))),channel=['meadow','stubble','woodland'].indexOf(a.type);
  weights[channel]=Math.max(weights[channel],Math.max(0,Math.min(1,d/(channel===2?12:6))));
 }
 // Woods take precedence at shared field margins; keep total coverage <= 1.
 weights[1]*=(1-weights[2])*(1-weights[0]);weights[0]*=1-weights[2];
 for(let c=0;c<3;c++){pixels[(j*width+i)*3+c]=Math.round(weights[c]*clearance*boundary*255);counts[c]+=pixels[(j*width+i)*3+c]/255;}
}
// A coarser, separately registered hill tile is packed below the original map.
// The existing 2 m RGB pixels are retained exactly; no new ground sampler.
const hills={...approachHills,atlas:[0,height]},textureHeight=height+hills.height;
const atlas=new Uint8Array(width*textureHeight*3);atlas.set(pixels);const hillCounts=[0,0,0];
for(let j=0;j<hills.height;j++)for(let i=0;i<hills.width;i++){
 const [x0,z0,w,d]=hills.bounds,x=x0+(i+.5)*w/hills.width,z=z0+(j+.5)*d/hills.height;
 if(protectedScenery(x,z,16))continue;
 const area=hills.areas[0],edge=Math.min(signedDistance(x,z,area.points),...area.holes.map(h=>-signedDistance(x,z,h)));
 // The forest continues beyond this crop. Broad outer fades avoid a cut edge.
 const boundary=Math.max(0,Math.min(1,(x-x0)/150,(x0+w-x)/180,(z-z0)/35,(z0+d-z)/180));
 const woods=Math.max(0,Math.min(1,edge/18));
 const meadow=Math.max(0,...area.holes.map(h=>Math.min(1,signedDistance(x,z,h)/12)))*(1-woods);
 let clearance=1;
 const cell=`${Math.floor(x/cellSize)}:${Math.floor(z/cellSize)}`;
 clearance*=Math.max(0,Math.min(1,(roadDistance(x,z,roadCells.get(cell)||[])-7)/7));
 for(const b of buildingCells.get(cell)||[]){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
  const distance=Math.hypot(Math.max(0,Math.abs(dx*c+dz*s)-b.w/2),Math.max(0,Math.abs(-dx*s+dz*c)-b.d/2));
  clearance=Math.min(clearance,Math.max(0,Math.min(1,(distance-12)/12)));
 }
 for(const [c,weight] of [[0,meadow],[2,woods]]){
  const value=Math.round(weight*boundary*clearance*255);atlas[((height+j)*width+i)*3+c]=value;hillCounts[c]+=value/255;
 }
}
hills.hectares=hillCounts.map(n=>Number((n*hills.bounds[2]*hills.bounds[3]/hills.width/hills.height/10000).toFixed(2)));
await sharp(atlas,{raw:{width,height:textureHeight,channels:3}}).png({compressionLevel:9,adaptiveFiltering:true}).toFile('assets/scenery/approach-corridor.png');
await fs.writeFile('assets/scenery/approach-corridor.json',JSON.stringify({bounds,width,height,textureHeight,plantingZones,hills,licence:'Interpreted boundaries derived from public-domain USDA NAIP / USGS imagery already bundled in detail/2_0.webp through detail/8_0.webp, detail/2_-1.webp through detail/8_-1.webp and final-approach.webp. Not a land-use survey.',areas,hectares:counts.map(c=>Number((c*bounds[2]/width*bounds[3]/height/10000).toFixed(2)))},null,2)+'\n');
console.log('Corridor meadow/stubble/woodland hectares',counts.map(c=>c*4/10000),'mask bytes',(await fs.stat('assets/scenery/approach-corridor.png')).size);
console.log('Additional hillside woodland hectares',hills.hectares);
