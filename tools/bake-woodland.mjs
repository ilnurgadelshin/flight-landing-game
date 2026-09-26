// Bake four detailed, alpha-preserving canopy views from Poly Haven's CC0
// Tree Small 02 by Rico Cilliers. The 95 MB source remains in ignored test/output.
// Run tools/fetch-woodland.py first. Requires Playwright's Chromium.
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
    const {scene:model}=await new GLTFLoader().loadAsync('/test/output/tree-source/tree.gltf');
    const alpha=await new T.TextureLoader().loadAsync('/test/output/tree-source/leaves-alpha.png');alpha.flipY=false;
    model.traverse(o=>{if(!o.isMesh)return;const m=o.material;m.transparent=false;m.roughness=1;m.metalness=0;if(m.name.includes('leaves')){m.alphaMap=alpha;m.alphaTest=.45;m.side=T.DoubleSide;}o.castShadow=true;o.receiveShadow=true;});
    let box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
    model.position.set(-center.x,-box.min.y,-center.z);
    const scaled=new T.Group();scaled.scale.setScalar(1/size.y);scaled.add(model);
    const scene=new T.Scene();scene.add(scaled,new T.HemisphereLight(0xffffff,0x7a8070,2.2));
    const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(-3,5,6);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-1.2;sun.shadow.camera.right=sun.shadow.camera.top=1.2;sun.shadow.camera.near=.1;sun.shadow.camera.far=15;sun.shadow.bias=-.0001;sun.shadow.normalBias=.002;scene.add(sun);
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);
    const camera=new T.OrthographicCamera(-.56,.56,1.06,-.06,.01,20);camera.position.set(0,0,4);camera.lookAt(0,0,0);
    window.bake={T,scene,scaled,renderer,camera};
    const atlas=window.atlas=document.createElement('canvas');atlas.width=atlas.height=1024;
  });
  for(let i=0;i<4;i++){
    await page.evaluate(i=>{const b=window.bake;b.scaled.rotation.y=i*Math.PI/2;b.renderer.render(b.scene,b.camera);window.atlas.getContext('2d').drawImage(b.renderer.domElement,(i%2)*512,Math.floor(i/2)*512);},i);
  }
  const data=await page.evaluate(()=>window.atlas.toDataURL('image/png').split(',')[1]);
  await fs.writeFile('assets/scenery/tree-canopies.png',Buffer.from(data,'base64'));
  console.log('Baked four canopy views into assets/scenery/tree-canopies.png');
}finally{await browser.close();server.close();}
