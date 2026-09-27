// Bake seven forms across three CC0 tree species, four views each, into one atlas.
// Run fetch-woodland.py and fetch-tree-variety.py first; sources stay in test/output.
import {chromium} from 'playwright';
import {startServer} from '../test/server.mjs';
import fs from 'node:fs/promises';
const {server,url}=await startServer(process.cwd());
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage();
  await page.goto(url+'/assets/credits.html');
  await page.evaluate(async()=>{
    const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{three:'/vendor/three.module.js'}});document.head.append(map);
    const T=await import('/vendor/three.module.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js');
    const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x7a8070,2.2));
    const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(-3,5,6);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-1.2;sun.shadow.camera.right=sun.shadow.camera.top=1.2;sun.shadow.camera.near=.1;sun.shadow.camera.far=15;sun.shadow.bias=-.0001;sun.shadow.normalBias=.002;scene.add(sun);
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);
    const camera=new T.OrthographicCamera(-.56,.56,1.04,-.04,.01,20);camera.position.set(0,0,4);camera.lookAt(0,0,0);
    window.bake={T,GLTFLoader,scene,renderer,camera};
    const atlas=window.atlas=document.createElement('canvas');atlas.width=2048;atlas.height=3584;
  });
  const species=[];
  const variants=[['tree_small_02',null],...['pine_sapling_small','fir_sapling_medium'].flatMap(name=>['a','b','c'].map(variant=>[name,variant]))];
  for(const [row,[name,variant]] of variants.entries()){
    const aspect=await page.evaluate(async ({row,name,variant})=>{
      const {T,GLTFLoader,scene,renderer,camera}=window.bake;
      const folder=name==='tree_small_02'?'/test/output/tree-source':`/test/output/tree-variety-source/${name}`;
      const {scene:source}=await new GLTFLoader().loadAsync(`${folder}/tree.gltf`);
      const model=variant?source.children.find(o=>o.name===`${name}_${variant}`||o.name===`${name}_${variant}_LOD0`):source;
      if(!model)throw new Error(`Missing ${name} ${variant}`);
      model.removeFromParent();model.position.set(0,0,0);
      const alpha=await new T.TextureLoader().loadAsync(`${folder}/leaves-alpha.png`);alpha.flipY=false;
      model.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
        m.transparent=false;m.roughness=1;m.metalness=0;
        if(/leaves|twig/.test(m.name)){m.alphaMap=alpha;m.alphaTest=variant?.28:.45;m.side=T.DoubleSide;}
      }o.castShadow=true;o.receiveShadow=true;});
      const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
      model.position.set(-center.x,-box.min.y,-center.z);
      const scaled=new T.Group();scaled.scale.setScalar(1/size.y);scaled.add(model);scene.add(scaled);
      // Different crown proportions are preserved when this atlas is used on planes.
      const aspect=Math.max(size.x,size.z)/size.y*1.08;
      camera.left=-aspect/2;camera.right=aspect/2;camera.updateProjectionMatrix();
      for(let view=0;view<4;view++){
        scaled.rotation.y=view*Math.PI/2;renderer.render(scene,camera);
        window.atlas.getContext('2d').drawImage(renderer.domElement,view*512,row*512);
      }
      scene.remove(scaled);
      const textures=new Set(),materials=new Set();model.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
      for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const t of textures)t.dispose();
      return aspect;
    },{row,name,variant});
    species.push({name,variant,row,aspect,source:`https://polyhaven.com/a/${name}`});console.log(name,variant,aspect);
  }
  const data=await page.evaluate(()=>window.atlas.toDataURL('image/png').split(',')[1]);
  await fs.writeFile('assets/scenery/tree-variety.png',Buffer.from(data,'base64'));
  const small=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1024;c.height=1792;c.getContext('2d').drawImage(window.atlas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];});
  await fs.writeFile('assets/scenery/tree-variety-low.png',Buffer.from(small,'base64'));
  await fs.writeFile('assets/scenery/tree-variety.json',JSON.stringify({license:'CC0-1.0',columns:4,rows:7,verticalMargin:.04/1.08,species},null,2)+'\n');
  console.log('Baked twenty-eight canopy views into assets/scenery/tree-variety.png');
}finally{await browser.close();server.close();}
