// Original interpretation of the bundled public-domain final-approach.webp.
// Source: 4000 px, world x=2000..10000, z=-4000..4000 (2 m/px).
// Reviewed crop: pixels [50,2515,1600,735]. Coordinates below are world metres.
// Leaf-off woodland is rendered with the existing leafy palette; not survey data.
export const approachHills={
 bounds:[2100,1030,3200,1470],width:1024,height:256,
 source:'final-approach.webp',sourceCrop:[50,2515,1600,735],
 areas:[{type:'woodland',points:[[2100,1030],[5300,1030],[5300,2500],[2100,2500]],holes:[
  // Connected pastures and residential gardens on the north-west shoulder.
  [[2100,1030],[2747,1030],[2795,1140],[2835,1260],[2862,1405],[2804,1455],[2747,1399],[2680,1330],[2634,1312],[2580,1345],[2533,1397],[2457,1450],[2354,1480],[2315,1570],[2257,1564],[2230,1498],[2165,1430],[2100,1410]],
  [[2835,1400],[2898,1384],[2934,1468],[2883,1497],[2859,1464]],
  // Small clearings remain open inside the wooded ridge.
  [[3160,1970],[3210,1910],[3250,1930],[3265,1990],[3221,2040],[3170,2050]],
  [[3834,1840],[3920,1852],[3940,1902],[3870,1910],[3830,1880]],
  [[4510,1415],[4570,1398],[4617,1435],[4612,1487],[4550,1500],[4504,1470]],
  [[4645,1824],[4725,1825],[4740,1880],[4680,1910],[4643,1870]],
 ]}],
 plantingZones:[{bounds:[2100,1030,3200,1470],seed:261023,highLimit:8000,lowLimit:1000,highSpacing:16,lowSpacing:32,uniform:true}],
};
