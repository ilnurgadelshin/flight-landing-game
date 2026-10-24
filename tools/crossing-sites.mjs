// Original interpretation of the bundled public-domain 4_-1, 5_-1, 4_0 and 5_0
// NAIP tiles. Coordinates are metres in the game's registered scenery frame.
// Parcel outlines, building uses/finishes and planting are not surveyed data.
const building=(x,z,id,style,finish='paint',height)=>({x,z,id,style,finish,...(height?{height}:{})});
const lane=(points,width=3.8,connectsMainRoad=false)=>({points,width,...(connectsMainRoad?{connectsMainRoad:true}:{})});
const access=(points,width=3.8)=>({points,width,connectsRoad:true});
const trees=rows=>rows.map(([x,z,h=9,row=7])=>({x,z,h,row}));

// The central gap between the existing northern/southern cover regions contains
// real wooded parcels. Complete those boundaries together with the homes, while
// the shared building/road clearances and runtime site exclusions protect yards.
export const crossingCover=[
 ['woodland',[[4598,-108],[4620,-137],[4670,-166],[4701,-180],[4767,-189],[4803,-240],[4843,-263],[4881,-270],[4929,-244],[4946,-210],[4941,-174],[4970,-134],[4918,-95],[4882,-84],[4848,-51],[4801,-15],[4754,9],[4708,25],[4663,44],[4630,-11]]],
 ['woodland',[[4826,2],[4861,-19],[4874,-4],[4922,-3],[4948,-35],[4960,-20],[5024,-8],[5045,-34],[5088,-79],[5121,-92],[5153,-106],[5202,-159],[5257,-189],[5280,-143],[5271,-70],[5216,-7],[5156,69],[5124,170],[5045,205],[4940,208],[4853,180],[4828,114],[4848,57]]],
 ['woodland',[[4834,-342],[4870,-349],[4910,-315],[4955,-278],[4987,-248],[5028,-237],[5077,-247],[5093,-218],[5075,-192],[5039,-167],[5036,-205],[5010,-229],[4962,-231],[4918,-255],[4874,-282],[4839,-287]]],
 ['meadow',[[4450,-168],[4497,-185],[4522,-132],[4548,-81],[4576,-28],[4596,14],[4565,37],[4514,58],[4488,27],[4477,-49]]],
].map(([type,points])=>['4_-1',type,points.map(([x,z])=>[x-3984,z+1016]),1032]);

export const crossingSites=[{
 id:'crossing-lane',name:'Approach crossing lane',imageryTiles:['4_-1','4_0'],roadSurface:'gravel',gravelTone:.29,
 buildings:[
  building(4500.9,-284.2,'crossing-north-shed','garage','paint'),
  building(4569.3,-173.1,'crossing-lane-cottage','house','sand',4.4),
  building(4576.8,-156.8,'crossing-lane-store','garage','sage'),
  building(4591.2,-143.2,'crossing-lane-house','house','paint',5.2),
  building(4626,-192.5,'crossing-field-store','garage','sand'),
  building(4729.2,-204.3,'crossing-garden-house','house','sage',4.4),
  building(4744.9,-207.8,'crossing-garden-workshop','garage','sand'),
  building(4749.5,-226.3,'crossing-garden-shed','garage','sage'),
  building(4762.4,-221.9,'crossing-garden-cottage','house','paint',4.3),
  building(4796,-307.9,'crossing-orchard-house','house','sand',5.1),
 ],
 lawns:[
  [[4480,-310],[4508,-310],[4525,-283],[4524,-262],[4492,-263],[4478,-284]],
  [[4550,-197],[4583,-203],[4603,-186],[4609,-162],[4614,-126],[4589,-114],[4562,-133],[4547,-166]],
  [[4709,-226],[4732,-242],[4774,-244],[4788,-216],[4777,-189],[4739,-185],[4712,-195]],
  [[4777,-335],[4809,-338],[4830,-317],[4826,-277],[4798,-263],[4780,-286]],
 ],
 gravel:[
  [[4494,-302],[4510,-303],[4515,-276],[4501,-270],[4492,-281]],
  [[4558,-178],[4577,-186],[4589,-166],[4598,-151],[4590,-130],[4571,-141],[4557,-162]],
  [[4613,-200],[4635,-200],[4636,-184],[4618,-182]],
  [[4718,-208],[4736,-223],[4758,-233],[4774,-225],[4776,-205],[4750,-196],[4722,-192]],
  [[4788,-316],[4809,-316],[4813,-291],[4804,-276],[4794,-283]],
 ],
 // Complete the previously photographed lane between the dairy road and the
 // main crossing; the spur serves all four garden buildings and the orchard.
 streets:[lane([[4490,-412],[4497,-367],[4509,-316],[4523,-262],[4540,-211],[4557,-162],[4583,-111],[4610,-55],[4635,-2],[4665,68]],4.4,true),
  lane([[4584,-127],[4624,-151],[4668,-175],[4706,-196],[4743,-208],[4782,-230],[4802,-256],[4805,-288]],3.8)],
 paths:[access([[4500,-286],[4511,-300],[4510.7,-309.6]]),
  access([[4568,-169],[4555,-167],[4555.3,-166.9]]),
  access([[4591,-137],[4584,-127]]),
  access([[4626,-192],[4633,-171],[4635,-157]],3.3),
  access([[4730,-204],[4724,-201.7]]),
  access([[4751,-219],[4756,-215.4]],3.4),
  access([[4798,-304],[4805,-288]])],
 fences:[[[4480,-280],[4486,-260],[4520,-257]],[[4585,-117],[4598,-109],[4613,-123]],
  [[4710,-224],[4733,-245],[4771,-247]],[[4778,-330],[4774,-302],[4783,-277]]],
 trees:trees([[4478,-300,9,0],[4527,-272,10,7],[4597,-197,8,8],[4615,-145,9,0],
  [4578,-114,9,7],[4707,-214,10,8],[4723,-240,9,0],[4778,-190,8,7],
  [4818,-330,10,8],[4825,-285,11,7],[4790,-267,9,0]]),
},{
 id:'crossing-frontage',name:'Approach crossing frontage',imageryTiles:['4_-1','4_0','5_-1'],roadSurface:'gravel',gravelTone:.30,
 buildings:[
  building(4803.1,81.6,'crossing-wood-house','house','sage',5),
  building(4810.1,36.8,'crossing-wood-garage','garage','sand'),
  building(4880,-60.8,'crossing-west-garage','garage','paint'),
  building(4883.3,-37.9,'crossing-west-store','garage','sand'),
  building(4896.8,-31.7,'crossing-long-house','house','paint',4.5),
  building(4972.1,-58.2,'crossing-front-house','house','sand',5.4),
  building(4984.9,-200.3,'crossing-machinery-barn','barn','paint',6.7),
  building(4987.7,-89.4,'crossing-front-garage','garage','sage'),
  building(4997.4,-155.4,'crossing-white-house','house','paint',5.8),
  building(5001.4,-176.1,'crossing-courtyard-garage','garage','sand',3.8),
  building(5010.4,-58.5,'crossing-front-workshop','garage','sage',4.3),
 ],
 lawns:[
  [[4787,18],[4812,12],[4837,33],[4830,77],[4822,101],[4792,105],[4782,79]],
  [[4866,-79],[4885,-83],[4896,-60],[4881,-47],[4864,-53]],
  [[4876,-46],[4903,-53],[4920,-29],[4915,-10],[4885,-10],[4867,-24]],
  [[4949,-80],[4964,-100],[4998,-108],[5020,-90],[5032,-55],[5020,-27],[4989,-24],[4961,-39]],
  [[4962,-218],[4992,-226],[5018,-198],[5025,-177],[5014,-149],[4985,-134],[4973,-164],[4959,-189]],
 ],
 gravel:[
  [[4798,29],[4816,20],[4824,40],[4811,63],[4809,91],[4796,91]],
  [[4869,-68],[4887,-73],[4892,-62],[4883,-48],[4869,-53]],
  [[4874,-41],[4893,-48],[4907,-33],[4905,-20],[4883,-23]],
  [[4959,-71],[4973,-84],[4981,-100],[4999,-98],[5005,-78],[5021,-68],[5021,-51],[4982,-47]],
  [[4973,-213],[4997,-215],[5008,-197],[5014,-177],[5008,-158],[4993,-141],[4982,-156],[4972,-184]],
 ],
 // Each street is an actual short drive meeting the existing registered road.
 streets:[lane([[4803,87],[4806,64],[4818,40],[4812,22],[4809,-2]],3.7,true),
  lane([[4880,-64],[4879,-53],[4878,-46]],3.8,true),
  lane([[4896,-30],[4885,-34],[4882,-48]],3.5,true),
  lane([[4973,-58],[4977,-78],[4985,-99],[4982,-121]],4,true),
  lane([[5011,-58],[5000,-65],[4976,-71]],3.6),
  lane([[4984,-202],[4993,-187],[5006,-168],[5003,-137]],4.4,true)],
 paths:[access([[4803,78],[4805,71.7]]),access([[4810,37],[4818,40]]),
  access([[4880,-61],[4880,-64]]),access([[4896,-26],[4896,-30]]),
  access([[4972,-58],[4973,-58]]),access([[4988,-88],[4981,-88.5]]),
  access([[5010,-58],[5011,-58]]),access([[4985,-200],[4984,-202]],4.5),
  access([[4997,-155],[5004.6,-153.5]],4.4)],
 fences:[[[4785,54],[4784,82],[4794,104],[4815,105]],[[4888,-9],[4917,-12],[4922,-26]],
  [[4995,-26],[5018,-29],[5033,-51]],[[4959,-199],[4961,-217],[4990,-225]]],
 trees:trees([[4788,28,9,7],[4828,70,11,0],[4819,101,9,8],[4864,-71,9,0],
  [4907,-14,8,7],[4920,-37,10,8],[4954,-52,9,7],[5026,-80,9,0],[5010,-29,8,8],
  [4960,-203,10,7],[4994,-221,9,0],[5020,-188,10,8]]),
},{
 id:'crossing-bend',name:'Approach bend homes',imageryTiles:['5_-1'],roadSurface:'gravel',gravelTone:.28,
 buildings:[
  building(5090.2,-156.6,'bend-red-roof-house','house','sand',6.2),
  building(5122.6,-142.9,'bend-workshop','garage','paint',3.7),
  building(5129.8,-227.7,'bend-white-cottage','house','paint',4.6),
  building(5173.4,-261.3,'bend-garden-house','house','sage',5.1),
  building(5175.4,-312.1,'bend-north-garage','garage','paint',4),
  building(5203.3,-243.4,'bend-terrace-house','house','sand',4.7),
 ],
 lawns:[
  [[5072,-167],[5088,-180],[5116,-173],[5140,-157],[5144,-132],[5110,-119],[5085,-127]],
  [[5114,-246],[5133,-253],[5149,-232],[5135,-212],[5116,-214]],
  [[5152,-277],[5176,-286],[5191,-269],[5183,-250],[5158,-244],[5147,-257]],
  [[5156,-335],[5186,-333],[5201,-313],[5186,-291],[5162,-295]],
  [[5189,-245],[5202,-262],[5220,-251],[5228,-228],[5214,-212],[5194,-223]],
 ],
 gravel:[
  [[5079,-166],[5097,-172],[5106,-156],[5128,-154],[5136,-143],[5129,-130],[5091,-138]],
  [[5121,-237],[5137,-242],[5142,-228],[5132,-215],[5118,-225]],
  [[5164,-270],[5179,-274],[5187,-263],[5178,-250],[5162,-255]],
  [[5167,-325],[5187,-326],[5195,-314],[5182,-297],[5166,-303]],
  [[5195,-249],[5208,-255],[5218,-242],[5214,-228],[5199,-227]],
 ],
 streets:[lane([[5090,-153],[5096,-167],[5095,-183]],3.8,true),
  lane([[5124,-143],[5117,-150],[5090,-153]],3.7),
  lane([[5129,-228],[5138,-220],[5138,-205]],3.5,true),
  lane([[5173,-260],[5181,-250],[5182,-243]],3.5,true),
  lane([[5175,-309],[5195,-305],[5209,-303]],4,true),
  lane([[5203,-242],[5208,-228],[5188,-250]],3.8,true)],
 paths:[access([[5090,-157],[5090,-153]]),access([[5122,-143],[5124,-143]]),
  access([[5129,-228],[5132,-225.3]]),access([[5174,-260],[5173,-260]]),
  access([[5175,-312],[5175,-309]],4),access([[5203,-241],[5203,-242]])],
 fences:[[[5080,-129],[5111,-119],[5140,-132]],[[5114,-239],[5112,-224],[5120,-213]],
  [[5150,-260],[5156,-246],[5173,-245]],[[5158,-329],[5154,-309],[5163,-292]],
  [[5212,-216],[5226,-231],[5220,-250]]],
 trees:trees([[5077,-145,10,0],[5104,-125,9,7],[5140,-139,9,8],[5115,-244,8,0],
  [5146,-228,9,7],[5152,-274,9,8],[5182,-282,8,0],[5160,-332,10,7],
  [5190,-331,9,8],[5225,-231,10,7],[5203,-215,9,0]]),
}];

// Join to the real rendered road centreline, rather than an approximate pixel
// trace. The manually reviewed drive points above remain in the source module.
export function prepareRoadJoinedSites(roads,sources){
 const nearest=([x,z])=>{
  let best,dist=Infinity;
  for(const road of roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
   const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
   const p=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(p[0]-x,p[1]-z);
   if(d<dist){best=p;dist=d;}
  }
  if(dist>8)throw new Error(`Unreviewed road join ${x},${z}: ${dist} m`);
  return best.map(v=>Math.round(v*100)/100);
 };
 return sources.map(source=>{
  const site=structuredClone(source);site.roads=[];
  for(const street of site.streets)if(street.connectsMainRoad)street.points[street.points.length-1]=nearest(street.points.at(-1));
  return site;
 });
}
export const prepareCrossingSites=roads=>prepareRoadJoinedSites(roads,crossingSites);
