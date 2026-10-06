// Bake eight azimuths at three elevations from the DELIVERED CC0 tree geometry.
// Matching the near models avoids a different crown appearing during the LOD fade.
// Bundled GLBs contain their leaf alpha; no external source downloads are needed.
import {chromium} from 'playwright';
import {startServer} from '../test/server.mjs';
import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('test/output',{recursive:true});
const {server,url}=await startServer(process.cwd());
const browser=await chromium.launch({headless:true,args:[`--use-angle=${process.env.VISUAL_GPU||'metal'}`]});
try {
  const page=await browser.newPage();
  await page.goto(url+'/assets/credits.html');
  await page.evaluate(async()=>{
    const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{three:'/vendor/three.module.js'}});document.head.append(map);
    const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js');
    const {MeshoptDecoder}=await import('/vendor/addons/libs/meshopt_decoder.module.js');
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x7a8070,2.2));
    const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(-3,5,6);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-1.2;sun.shadow.camera.right=sun.shadow.camera.top=1.2;sun.shadow.camera.near=.1;sun.shadow.camera.far=15;sun.shadow.bias=-.0001;sun.shadow.normalBias=.002;scene.add(sun);
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);
    const camera=new T.OrthographicCamera(-.56,.56,1.04,-.04,.01,20);camera.position.set(0,0,4);camera.lookAt(0,0,0);
    window.bake={T,loader,scene,renderer,camera};
    const atlas=window.atlas=document.createElement('canvas');atlas.width=2048;atlas.height=6912;
  });
  const species=[];
  const variants=[['tree_small_02',null],...['pine_sapling_small','fir_sapling_medium'].flatMap(name=>['a','b','c'].map(variant=>[name,variant])),['jacaranda_tree',null],['island_tree_02',null]];
  for(const [row,[name,variant]] of variants.entries()){
    const framing=await page.evaluate(async ({row,name,variant})=>{
      const {T,loader,scene,renderer,camera}=window.bake;
      const {scene:source}=await loader.loadAsync(`/assets/scenery/${name}-near.glb`);
      const objectName=variant?`${name}_${variant}`:`${name}_LOD0`;
      const model=source.getObjectByName(objectName)||source.getObjectByName(objectName+'_LOD0');
      if(!model)throw new Error(`Missing ${name} ${variant}`);
      model.removeFromParent();
      model.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
        m.transparent=false;m.roughness=1;m.metalness=0;m.alphaToCoverage=false;
      }o.castShadow=true;o.receiveShadow=true;});
      // Delivered models already use unit height and the near renderer's origin.
      // Do not recenter/normalize again: the atlas and geometry must share it.
      const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
      const scaled=new T.Group();scaled.add(model);scene.add(scaled);
      // Different crown proportions are preserved when this atlas is used on planes.
      const aspect=Math.max(size.x,size.z)*1.08;
      const frameScale=Math.hypot(1,aspect)*1.08;
      camera.left=camera.bottom=-frameScale/2;camera.right=camera.top=frameScale/2;camera.updateProjectionMatrix();
      for(let elevation=0;elevation<3;elevation++)for(let view=0;view<8;view++){
        const angle=elevation*Math.PI/4;
        camera.position.set(0,.5+4*Math.sin(angle),4*Math.cos(angle));
        camera.up.set(0,Math.cos(angle),-Math.sin(angle));camera.lookAt(0,.5,0);
        scaled.rotation.y=view*Math.PI/4;renderer.render(scene,camera);
        window.atlas.getContext('2d').drawImage(renderer.domElement,view*256,(row*3+elevation)*256);
      }
      scene.remove(scaled);
      const textures=new Set(),materials=new Set();model.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
      for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const t of textures)t.dispose();
      return {aspect,frameScale};
    },{row,name,variant});
    species.push({name,variant,row,...framing,source:`https://polyhaven.com/a/${name}`});console.log(name,variant,framing);
  }
  const data=await page.evaluate(()=>window.atlas.toDataURL('image/png').split(',')[1]);
  const source=Buffer.from(data,'base64');
  await fs.writeFile('test/output/tree-matched-atlas.png',source);
  // Eight 192 px views retain intermediate silhouettes with only 12.5% more texels
  // than the previous four 256 px views; low uses 96 px frames.
  await sharp(source).resize(1536,5184).webp({quality:90,alphaQuality:90}).toFile('assets/scenery/tree-variety.webp');
  await sharp(source).resize(768,2592).webp({quality:90,alphaQuality:90}).toFile('assets/scenery/tree-variety-low.webp');
  await fs.writeFile('assets/scenery/tree-variety.json',JSON.stringify({license:'CC0-1.0',columns:8,rows:9,elevations:[0,45,90],tileSize:192,lowTileSize:96,geometrySource:"bundled near-tree GLBs",species},null,2)+'\n');
  console.log('Baked 216 matching canopy views into the high and low WebP atlases');
}finally{await browser.close();server.close();}
