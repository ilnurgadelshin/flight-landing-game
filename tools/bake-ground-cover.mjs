// Bake photographed CC0 grass into eight small unlit patch views. No source GLTF ships.
import {chromium} from 'playwright';
import {startServer} from '../test/server.mjs';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const {server,url}=await startServer(process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
try{
 const page=await browser.newPage();await page.goto(url+'/assets/credits.html');
 const data=await page.evaluate(async()=>{
  const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{three:'/vendor/three.module.js'}});document.head.append(map);
  const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js');
  const {scene:source}=await new GLTFLoader().loadAsync('/test/output/grass-source/grass.gltf');
  const alpha=await new T.TextureLoader().loadAsync('/test/output/grass-source/alpha.png');alpha.flipY=false;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-.4,.4,.4,0,.01,10);
  camera.position.set(0,0,2);camera.lookAt(0,0,0);
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,256);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=512;const ctx=atlas.getContext('2d');
  let seed=3107;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const names=['medium_a','medium_b','medium_c','medium_d','small_a','small_b'];
  for(let row=0;row<2;row++){
   const patch=new T.Group();scene.add(patch);
   for(let i=0;i<90;i++){
    const src=source.getObjectByName('grass_bermuda_01_'+names[i%names.length]);
    const object=src.clone();object.position.set(0,0,0);object.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(object),center=box.getCenter(new T.Vector3()),height=box.max.y-box.min.y;
    const normalized=new T.Group();normalized.add(object);object.position.sub(new T.Vector3(center.x,box.min.y,center.z));
    const scale=(.13+random()*.16)/height;normalized.scale.setScalar(scale);
    normalized.position.set((random()-.5)*.72,0,(random()-.5)*.72);normalized.rotation.y=random()*Math.PI*2;
    normalized.traverse(o=>{if(o.isMesh)o.material=new T.MeshBasicMaterial({map:o.material.map,alphaMap:alpha,alphaTest:.35,side:T.DoubleSide});});
    patch.add(normalized);
   }
   for(let view=0;view<4;view++){patch.rotation.y=view*Math.PI/4;renderer.render(scene,camera);ctx.drawImage(renderer.domElement,view*512,row*256);}
   scene.remove(patch);
  }
  return atlas.toDataURL('image/png').split(',')[1];
 });
 const source=Buffer.from(data,'base64');await fs.writeFile('test/output/grass-patches-source.png',source);
 // Pad RGB through the transparent border before filtering, keeping fine blades dark-fringe free.
 const {data:pixels,info}=await sharp(source).raw().toBuffer({resolveWithObject:true});
 let occupied=Uint8Array.from({length:info.width*info.height},(_,i)=>pixels[i*4+3]>32?1:0);
 for(let pass=0;pass<4;pass++){
  const next=occupied.slice(),copy=Buffer.from(pixels);
  for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){
   const i=y*info.width+x;if(occupied[i])continue;
   const neighbors=[i-1,i+1,i-info.width,i+info.width].filter(j=>occupied[j]);if(!neighbors.length)continue;
   for(let c=0;c<3;c++)pixels[i*4+c]=Math.round(neighbors.reduce((n,j)=>n+copy[j*4+c],0)/neighbors.length);next[i]=1;
  }occupied=next;
 }
 for(const [suffix,width] of [['',1024],['-low',512]])await sharp(pixels,{raw:info}).resize(width).webp({quality:92,alphaQuality:95}).toFile(`assets/scenery/grass-patches${suffix}.webp`);
 await fs.writeFile('assets/scenery/grass-patches.json',JSON.stringify({source:'https://polyhaven.com/a/grass_bermuda_01',author:'Rico Cilliers / Poly Haven',license:'CC0-1.0',columns:4,rows:2,width:1024,height:256,lowWidth:512,lowHeight:128,patchWidth:.8,patchHeight:.4,description:'Eight unlit views of original arrangements of the source grass clumps; alpha repaired from the separate source mask.'},null,2)+'\n');
 console.log('Baked eight CC0 grass patch views.');
}finally{await browser.close();server.close();}
