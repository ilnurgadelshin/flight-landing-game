// Real material helper: subpixel paint keeps its area instead of flashing on/off.
import {launchBrowser} from './browser.mjs';
import {startServer} from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=(process.argv[2]||'taxiway-markings').replace(/[^a-z0-9_-]/gi,'-');
const {server,url}=await startServer(process.cwd()),browser=await launchBrowser();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/probe',r=>r.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><canvas></canvas>'}));await page.goto(url+'/probe');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),{applyTaxiwayMarkings}=await import('/js/world/airport-ground.js');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.outputColorSpace=T.LinearSRGBColorSpace;
  const black=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);black.needsUpdate=true;
  const material=new T.MeshBasicMaterial({map:black,toneMapped:false});applyTaxiwayMarkings(material);
  const mesh=new T.Mesh(new T.PlaneGeometry(4000,4000),material);mesh.rotation.x=-Math.PI/2;
  const scene=new T.Scene();scene.add(mesh);const camera=new T.OrthographicCamera(-1,1,1,-1,.1,100);camera.up.set(0,0,-1);
  const rt=new T.WebGLRenderTarget(128,128),pixels=new Uint8Array(128*128*4),reports=[];
  const render=(span,x,z)=>{Object.assign(camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2});camera.updateProjectionMatrix();camera.position.set(x,20,z);camera.lookAt(x,0,z);
   renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.readRenderTargetPixels(rt,0,0,128,128,pixels);
  };
  for(const span of [15,60,240]){
   const energy=[];for(let i=0;i<17;i++){render(span,200,135+i/8*span/128);let sum=0;for(let p=0;p<pixels.length;p+=4)sum+=pixels[p];energy.push(sum);}
   reports.push({span,energy,expected:128*128*.30/span*.745404*255});
  }
  const joins=[];for(const z of [23,72,120,128,134.9,136]){render(2,1450,z);const i=(64*128+64)*4;joins.push({z,rgb:[...pixels.slice(i,i+3)]});}
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {reports,joins,gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
 });
 assert.deepEqual(errors,[]);
 for(const r of result.reports){assert.ok(r.energy.every(e=>Math.abs(e/r.expected-1)<.05),'Integrated paint area represents a 30 cm stripe');assert.ok(Math.max(...r.energy)/Math.min(...r.energy)<1.05,'Thin line remains sampled through subpixel motion');}
 for(const j of result.joins)assert.ok(j.z===136?j.rgb[0]===0:j.rgb[0]>180,'Centreline joins the parallel taxiway and stops beyond it');
 await fs.mkdir('test/output',{recursive:true});await fs.writeFile(`test/output/${label}.json`,JSON.stringify({...result,errors},null,2)+'\n');console.log('Taxiway paint width, subpixel energy and junction samples passed.');
}finally{await browser.close();server.close();}
