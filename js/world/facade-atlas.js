// Complete wall bays, rather than a window grid tiled over every building.
// Measurements also drive the nearby sills so relief matches the painted openings.
import * as THREE from 'three';
import { makeRng } from '../physics/atmosphere.js';

export function createFacadeAtlas(aniso,low) {
  const palettes=['#c4c2b6','#a6aca6','#a88872','#a39178'];
  const profiles=Array.from({length:12},(_,id)=>({id,width:id<3?6:id<9?8:12,
    height:id<9?2.8:5,color:palettes[Math.floor(id/3)],windows:[],doors:[]}));
  const cell=low?256:512,canvas=document.createElement('canvas');canvas.width=cell*4;canvas.height=cell*3;
  const glow=canvas.cloneNode(),rough=canvas.cloneNode(),relief=canvas.cloneNode();
  const g=canvas.getContext('2d'),e=glow.getContext('2d'),r=rough.getContext('2d'),n=relief.getContext('2d');
  for(const p of profiles){
    const wall=document.createElement('canvas');wall.width=wall.height=512;
    const light=wall.cloneNode(),c=wall.getContext('2d'),l=light.getContext('2d'),rng=makeRng(581+p.id);
    c.fillStyle=p.color;c.fillRect(0,0,512,512);l.fillStyle='black';l.fillRect(0,0,512,512);
    const family=Math.floor(p.id/3),side=p.id%3;
    if(family===3){
      for(let x=0;x<512;x+=12){c.fillStyle='rgba(30,25,20,.17)';c.fillRect(x,0,2,512);}
    }else for(let y=0;y<512;y+=family===2?12:24){
      c.fillStyle='rgba(40,35,30,.19)';c.fillRect(0,y,512,2);
      c.fillStyle='rgba(255,255,255,.12)';c.fillRect(0,y+2,512,1);
      if(family===2)for(let x=(y%24?12:0);x<512;x+=24)c.fillRect(x,y,1,12);
    }
    for(let i=0;i<18000;i++){c.fillStyle=`rgba(${rng()>.5?'255,255,255':'0,0,0'},.035)`;c.fillRect(rng()*512,rng()*512,1,1);}
    const rect=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x/p.width*512,(1-(y+h)/p.height)*512,w/p.width*512,h/p.height*512);};
    const window=(x,y,w,h,shutters=false)=>{
      p.windows.push({x,y,w,h});
      rect(c,x-.09,y-.08,w+.18,h+.16,'rgba(25,27,25,.55)');
      if(shutters)for(const sx of [x-.37,x+w+.07]){
        rect(c,sx,y,.28,h,'#485551');
        for(let sy=y+.1;sy<y+h;sy+=.12)rect(c,sx,sy,.28,.018,'#293c36');
      }
      rect(c,x-.035,y-.04,w+.07,h+.08,'#e0dcd1');
      const glass=c.createLinearGradient(0,(1-(y+h)/p.height)*512,0,(1-y/p.height)*512);
      glass.addColorStop(0,'#33464a');glass.addColorStop(.48,'#61716e');glass.addColorStop(1,'#2c3433');
      rect(c,x+.025,y+.025,w-.05,h-.05,glass);
      if(rng()>.4)rect(c,x+.04,y+.06,w*.23,h-.12,'rgba(185,174,149,.48)');
      rect(c,x+w*.5-.018,y,.035,h,'#c7c7bb');rect(c,x,y+h*.52,w,.035,'#c7c7bb');
      if(rng()>.62)rect(l,x+.05,y+.05,w-.1,h-.1,rng()>.5?'#806137':'#57482f');
    };
    const door=(x,w=1)=>{
      p.doors.push({x,w,h:2.12});
      rect(c,x-.08,0,w+.16,2.21,'#d5d0c1');rect(c,x,.02,w,2.12,family===2?'#4b5550':'#6d7267');
      for(const y of [.25,1.13])rect(c,x+.1,y,w-.2,.72,'rgba(23,29,26,.28)');
      rect(c,x+w-.13,1,.04,.06,'#c4b797');
    };
    if(family<3){
      const width=family===1?1.28:.96,height=family===2?1.4:1.2;
      if(side===0){
        window(.65,.85,width,height,family===0);door(p.width*.49);
        window(p.width-width-.7,.85,width,height,family===0);
      }else if(side===1){
        const n=family===0?2:3;
        for(let i=0;i<n;i++)window((i+.5)*p.width/n-width/2,.85,width,height,family===0);
      }else{
        window(p.width*.32,.98,width*.85,height*.83);
        if(family===1)window(p.width*.72,1.48,.64,.62);
      }
    }else{
      if(side!==1)for(const x of side===0?[2.4,7.4]:[.7,4.7,8.7]){
        rect(c,x-.12,0,3.04,3.5,'#d0c8b9');rect(c,x,.05,2.8,3.3,side===0?'#696c61':'#77817b');
        for(let y=.5;y<3.3;y+=.45)rect(c,x,y,2.8,.035,'rgba(30,32,28,.4)');
      }
      for(const x of side===1?[1.2,5.3,9.4]:[1.1,5.4,9.7])window(x,3.8,1.2,.65);
      if(side===1)door(7.8);
    }
    // Mild dirt beneath the eave and at the ground gives the wall a vertical scale.
    const dirt=c.createLinearGradient(0,0,0,512);dirt.addColorStop(0,'rgba(24,27,21,.22)');
    dirt.addColorStop(.13,'rgba(24,27,21,0)');dirt.addColorStop(.83,'rgba(24,27,21,0)');dirt.addColorStop(1,'rgba(37,36,25,.14)');
    c.fillStyle=dirt;c.fillRect(0,0,512,512);
    const x=p.id%4*cell,y=Math.floor(p.id/4)*cell,pad=cell/128;
    for(const [ctx,image] of [[g,wall],[e,light]]){
      ctx.drawImage(image,x,y,cell,cell);ctx.drawImage(image,x+pad,y+pad,cell-pad*2,cell-pad*2);
    }
    r.fillStyle='#ededed';r.fillRect(x,y,cell,cell);n.fillStyle='#808080';n.fillRect(x,y,cell,cell);
    // Fine siding/mortar relief remains independent of the painted window colours.
    n.fillStyle=family===3?'#656565':'#717171';
    if(family===3)for(let u=0;u<cell;u+=cell*12/512)n.fillRect(x+u,y,cell*2/512,cell);
    else for(let v=0;v<cell;v+=cell*(family===2?12:24)/512)n.fillRect(x,y+v,cell,cell*2/512);
    for(const opening of p.windows){
      const xx=x+pad+opening.x/p.width*(cell-pad*2),yy=y+pad+(1-(opening.y+opening.h)/p.height)*(cell-pad*2);
      const ww=opening.w/p.width*(cell-pad*2),hh=opening.h/p.height*(cell-pad*2);
      r.fillStyle='#505050';r.fillRect(xx,yy,ww,hh);n.fillStyle='#808080';n.fillRect(xx,yy,ww,hh);
    }
  }
  const texture=(c,color=true)=>{const t=new THREE.CanvasTexture(c);if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=aniso;return t;};
  const material=new THREE.MeshStandardMaterial({map:texture(canvas),emissiveMap:texture(glow),emissive:0xffd3a0,
    emissiveIntensity:0,roughness:.96,roughnessMap:texture(rough,false),
    bumpMap:low?null:texture(relief,false),bumpScale:.035,envMapIntensity:.45,vertexColors:true});
  const uv=(p,u,v)=>[(p.id%4+(1/128+u*126/128))/4,1-(Math.floor(p.id/4)+(1/128+(1-v)*126/128))/3];
  return {material,profiles,uv};
}
