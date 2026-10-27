// Original, restrained service wear fitted to hakai315's CC BY 4.0 source parts.
// Reproducible: node tools/prepare-cockpit-wear.mjs. No remote assets or GLB edits.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {SURFACE_LAYOUT,SURFACE_ATLAS} from '../js/cockpit/surface-layout.js';
import {panelMasks,linerMask} from './cockpit-panel-masks.mjs';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read('assets/models/737-cockpit.glb');
const edges=new Map(),layout=SURFACE_LAYOUT.panel;
const xy=p=>[(p[0]-layout.bounds[0])/(layout.bounds[2]-layout.bounds[0])*1020+2,
 (1-(p[1]-layout.bounds[1])/(layout.bounds[3]-layout.bounds[1]))*508+2];
// Trace actual forward-facing panel boundaries and screen cutouts. Coplanar
// tessellation edges cancel; source lettering and switches never enter this mask.
for(const node of doc.getRoot().listNodes())for(const prim of node.getMesh()?.listPrimitives()||[]) {
 if(!['Material.457','Material.103','Material.261'].includes(prim.getMaterial().getName()))continue;
 const pos=prim.getAttribute('POSITION'),idx=prim.getIndices(),m=node.getWorldMatrix(),points=[];
 for(let i=0;i<pos.getCount();i++) {
  const [x,y,z]=pos.getElement(i,[]);points.push([m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]);
 }
 for(let i=0;i<idx.getCount();i+=3) {
  const p=[0,1,2].map(j=>points[idx.getScalar(i+j)]);
  if(p.some(v=>v[2]<-.966||v[2]>-.89||v[1]<-.64||v[1]>-.075))continue;
  const a=p[1].map((v,j)=>v-p[0][j]),b=p[2].map((v,j)=>v-p[0][j]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  if(Math.abs(n[2])<Math.hypot(...n)*.95||Math.hypot(...n)<1e-10)continue;
  for(let j=0;j<3;j++) {
   const a=p[j],b=p[(j+1)%3],key=[a,b].map(v=>v.map(x=>Math.round(x*10000)).join(',')).sort().join('/');
   if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});
  }
 }
}
const boundary=[...edges.values()].filter(e=>e.count===1);
const path=boundary.map(e=>`M${xy(e.a).join(',')}L${xy(e.b).join(',')}`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512"><rect width="1024" height="512" fill="black"/><path d="${path}" fill="none" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const edge=await sharp(Buffer.from(svg)).removeAlpha().greyscale().raw().toBuffer();
const grime=await sharp(Buffer.from(svg)).blur(2.4).removeAlpha().greyscale().raw().toBuffer();
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const hash=(x,y,s=0)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263)+s;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
function noise(x,y,s=0){const ix=Math.floor(x),iy=Math.floor(y);let u=x-ix,v=y-iy;u*=u*(3-2*u);v*=v*(3-2*v);const a=hash(ix,iy,s)*(1-u)+hash(ix+1,iy,s)*u,b=hash(ix,iy+1,s)*(1-u)+hash(ix+1,iy+1,s)*u;return a*(1-v)+b*v;}
const spot=(x,y,cx,cy,rx,ry)=>Math.exp(-2*((x-cx)**2/rx**2+(y-cy)**2/ry**2));
const [atlasWidth,atlasHeight]=SURFACE_ATLAS,data=Buffer.alloc(atlasWidth*atlasHeight*3);
const masks={pedestal:await panelMasks(doc,SURFACE_LAYOUT.pedestal,'pedestal'),overhead:await panelMasks(doc,SURFACE_LAYOUT.overhead,'overhead')};
const liner=await linerMask(SURFACE_LAYOUT.headliner);
// Locations measured on the source: panel selector knobs and MCP/EFIS controls.
const contacts=[[-.445,-.300,.060,.026],[.372,-.300,.060,.026],[-.30,-.16,.055,.025],[.27,-.16,.055,.025],[-.014,-.15,.17,.026],[-.18,-.26,.034,.07]];
for(const [kind,{rect:[rx,ry,rw,rh],bounds:[left,bottom,right,top]}] of Object.entries(SURFACE_LAYOUT)) {
 for(let j=0;j<rh;j++)for(let i=0;i<rw;i++) {
  const u=clamp((i-2)/(rw-4)),v=clamp((j-2)/(rh-4));
  const x=left+(right-left)*u,y=top+(bottom-top)*v;
  const broad=noise(x*21,y*21,34)-.5,fine=noise(x*210,y*210,17)-.5;
  let color=1,rough=1,relief=1;
  if(kind==='panel') {
   const e=edge[j*1024+i]/255,g=grime[j*1024+i]/255;
   let touch=0;for(const p of contacts)touch=Math.max(touch,spot(x,y,...p));
   // Slightly lighter, rubbed coating at genuine rims, with accumulated dust in
   // the adjacent recess. No fake metal chips or invented markings.
   const broken=.25+.75*noise(x*190,y*190,71);
   color=1+.16*broad+.04*fine+.30*e*broken-.19*g-.075*touch;
   rough=1+.20*broad-.30*touch-.25*e*broken;
   // The high tier uses this as a shallow rolled paint rim (under 0.6 mm),
   // aligned to actual panel/cutout boundaries, not tessellation diagonals.
   relief=1-.80*e;
  } else if(kind==='padding') {
   const lip=Math.exp(-(((y+.885)/.016)**2)),dust=Math.exp(-(((y+1.001)/.019)**2));
   const rubbed=lip*(.25+.75*noise(x*7,y*13,66));
   color=1+.11*broad+.035*fine+.11*dust-.09*rubbed;
   rough=1+.07*broad-.20*rubbed;relief=1-.60*rubbed;
  } else if(kind==='rubber') {
   const grip=Math.max(spot(x,y,-.15,-.235,.045,.095),spot(x,y,.15,-.235,.045,.095));
   const thumb=Math.max(spot(x,y,-.12,-.184,.035,.025),spot(x,y,.12,-.184,.035,.025));
   const worn=Math.max(grip,thumb)*(.85+.15*noise(x*85,y*85,8));
   color=1+.05*broad+.25*worn;rough=1-.48*worn+.08*broad;relief=1-.82*worn;
  } else if(masks[kind]) {
   const mask=masks[kind],p=j*rw+i,e=mask.edge[p]/255,g=mask.grime[p]/255,touch=mask.touch[p]/255;
   const broken=.4+.6*noise(x*190,y*190,71);
   color=mask.tone[p]/128*(1+.07*broad+.02*fine+.20*e*broken-.15*g-.10*touch);
   rough=1+.14*broad-.22*touch-.22*e*broken;relief=1-.80*e;
  } else if(kind==='headliner') {
   const p=j*rw+i,seam=liner.seam[p]/255,edge=liner.edge[p]/255;
   color=1+.055*broad-.10*seam+.025*edge;
   rough=1+.06*broad+.08*seam;relief=1-.9*seam;
  } else {
   // Soft cleaning variation on painted rails; no seam lines projected through
   // the sloping pillar. Keep the original colour and overall matte finish.
   const sill=Math.exp(-(((y+.13)/.07)**2))*(.4+.6*noise(x*11,y*11,61));
   color=1+.13*broad-.045*sill;rough=1+.16*broad-.14*sill;relief=1-.4*sill;
  }
  const k=((ry+j)*atlasWidth+rx+i)*3;
  data[k]=Math.round(clamp(color/2)*255);data[k+1]=Math.round(clamp(rough/2)*255);data[k+2]=Math.round(clamp(relief)*255);
 }
}
await fs.mkdir('assets/cockpit',{recursive:true});
for(const scale of [1,.5])await sharp(data,{raw:{width:atlasWidth,height:atlasHeight,channels:3}}).resize(atlasWidth*scale,atlasHeight*scale).webp({lossless:true,effort:6}).toFile(`assets/cockpit/service-wear${scale===.5?'-low':''}.webp`);
console.log('Authored seven fitted finishes:',{forwardEdges:boundary.length,pedestal:masks.pedestal.report,overhead:masks.overhead.report,dimensions:SURFACE_ATLAS});
