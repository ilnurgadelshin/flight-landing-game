// Original interpretation of the bundled 5_-1 public-domain NAIP photograph.
// Building use, elevations, finishes and planting are artistic estimates.
import {prepareRoadJoinedSites} from './crossing-sites.mjs';
export const ridgeFarmSites=[{
 id:'ridge-farm',name:'Ridge farm and pond lane',imageryTiles:['5_-1'],roadSurface:'gravel',gravelTone:.27,
 buildings:[
  {x:5453,z:-426.8,id:'ridge-lane-store',style:'garage',finish:'sage',height:4.7},
  {x:5610.8,z:-483.4,id:'ridge-farmhouse',style:'ridge-house',finish:'sand',height:5.7},
  {x:5682.7,z:-474.4,id:'ridge-workshop',style:'ridge-workshop',finish:'paint',height:6.4},
 ],
 // Confine turf and gravel to the occupied margins. Keep the pond, crop rows
 // and intervening pasture photographic rather than filling a bounding box.
 lawns:[[[5434,-437],[5465,-447],[5475,-420],[5442,-407]],
  [[5582,-500],[5627,-501],[5640,-484],[5634,-469],[5590,-470],[5579,-484]],
  [[5666,-499],[5699,-500],[5710,-482],[5712,-458],[5686,-449],[5663,-461]]],
 gravel:[[[5440,-436],[5464,-442],[5470,-425],[5455,-415],[5441,-419]],
  [[5588,-487],[5628,-491],[5634,-476],[5620,-463],[5595,-462],[5584,-473]],
  [[5668,-484],[5697,-489],[5709,-472],[5717,-459],[5702,-444],[5679,-447],[5661,-459]]],
 streets:[{points:[[5740,-454],[5712,-452],[5685,-457],[5658,-465],[5625,-473],[5594,-472],[5562,-466],[5520,-448],[5480,-429],[5440,-415],[5395,-397],[5350,-380],[5305,-365],[5260,-350],[5220,-345]],width:4.1,connectsMainRoad:true}],
 paths:[{points:[[5453,-427],[5455,-420.25]],width:3.6,connectsRoad:true},
  {points:[[5611,-482],[5611,-472.55]],width:3.6,connectsRoad:true},
  {points:[[5683,-473],[5685,-457]],width:5.1,connectsRoad:true}],
 fences:[[[5431,-437],[5463,-447],[5480,-438]],
  [[5577,-491],[5583,-504],[5626,-506],[5639,-495]],
  [[5663,-500],[5699,-506],[5714,-487]],
  [[5480,-438],[5517,-455],[5558,-474]],
  [[5485,-423],[5527,-444],[5568,-460]]],
 trees:[[5433,-434,8,0],[5472,-436,9,7],[5582,-494,9,8],
  [5629,-497,8,0],[5637,-484,7,7],[5665,-492,9,8],[5705,-483,9,0],[5714,-468,8,7]]
  .map(([x,z,h,row])=>({x,z,h,row})),
}];
export const prepareRidgeFarmSites=roads=>prepareRoadJoinedSites(roads,ridgeFarmSites);
