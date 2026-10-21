// Compact, independently mipmapped layers: no atlas seams or cross-material bleed.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const names=['grass_ground','brown_mud','dry_decay_leaves'];
const sources=[];
for(const name of names){
 const root=`test/output/ground-material-sources/${name}`;
 const info=JSON.parse(await fs.readFile(`${root}/info.json`)),files=JSON.parse(await fs.readFile(`${root}/files.json`));
 sources.push({id:name,name:info.name,authors:info.authors,url:`https://polyhaven.com/a/${name}`,license:'CC0-1.0',
  meters:info.dimensions[0]/1000,files:Object.fromEntries(['Diffuse','nor_gl','Rough'].map(k=>[k,files[k]['1k']['jpg']]))});
}
const srgb=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
for(const [size,suffix] of [[512,''],[256,'-low']]){
 const colors=[],surfaces=[];
 for(const [i,name] of names.entries()){
  const root=`test/output/ground-material-sources/${name}`;
  const read=async file=>sharp(`${root}/${file}.jpg`).resize(size,size).flip().removeAlpha().raw().toBuffer();
  const [color,normal,rough]=await Promise.all(['color','normal','rough'].map(read)),packed=Buffer.alloc(size*size*3);
  const mean=[0,0,0];
  for(let p=0;p<size*size;p++){
   for(let k=0;k<3;k++)mean[k]+=srgb(color[p*3+k]/255)/(size*size);
   packed[p*3]=normal[p*3];packed[p*3+1]=normal[p*3+1];packed[p*3+2]=rough[p*3];
  }
  if(!suffix)sources[i].meanLinear=mean;
  colors.push(color);surfaces.push(packed);
 }
 // Move the existing grass normal/roughness into the same array. This replaces
 // two old terrain samplers, staying within WebGL2's minimum 16 texture units.
 const legacyNormal=await sharp('assets/scenery/grass-normal.jpg').resize(size,size).flip().removeAlpha().raw().toBuffer();
 const legacyRough=await sharp('assets/scenery/grass-rough.jpg').resize(size,size).flip().removeAlpha().raw().toBuffer();
 const legacy=Buffer.alloc(size*size*3);
 for(let p=0;p<size*size;p++){legacy[p*3]=legacyNormal[p*3];legacy[p*3+1]=legacyNormal[p*3+1];legacy[p*3+2]=legacyRough[p*3];}
 surfaces.push(legacy);
 for(const [kind,buffers,quality] of [['color',colors,90],['surface',surfaces,95]]){
  const file=`assets/scenery/ground-${kind}${suffix}.webp`;
  await sharp(Buffer.concat(buffers),{raw:{width:size,height:size*buffers.length,channels:3}}).webp({quality}).toFile(file);
  console.log(file,(await fs.stat(file)).size);
 }
}
await fs.writeFile('assets/scenery/ground-materials.json',JSON.stringify({layers:sources,format:'Vertically stacked square layers, bottom-up rows within each layer. Color: three sRGB layers. Surface: four layers of normal X/Y and linear roughness; last is the existing CC0 Aerial Grass Rock.'},null,2)+'\n');
