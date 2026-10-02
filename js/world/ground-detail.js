// Bounded, local-only imagery: sharper final-approach tiles, no map API at runtime.
import * as THREE from 'three';
import { RUNWAY, APPROACH_STARTS } from '../config.js';

/** Where the short final starts: the one start inside the detail tiles (sim.js reposition). */
export const SHORT_FINAL_EYE=new THREE.Vector3(RUNWAY.thresholdX+APPROACH_STARTS.short.distanceNm*1852,0,0);

export const GROUND_DETAIL_GLSL=/* glsl */`
  uniform sampler2D uDetail0,uDetail1,uDetail2,uDetail3;
  uniform vec4 uDetailRect0,uDetailRect1,uDetailRect2,uDetailRect3;
  vec3 detailTile(vec3 base,sampler2D tex,vec4 rect,vec2 p){
    // Tiles are uploaded unflipped (row 0 = the image's north edge, at v=0).
    vec2 uv=(p-rect.xy)/max(rect.z,1.0)+.5;
    float edge=max(abs(uv.x-.5),abs(uv.y-.5));
    float mask=(1.0-smoothstep(.479,.496,edge))*rect.w;
    return mix(base,texture2D(tex,uv).rgb,mask);
  }
`;

export function groundDetailUniforms(fallback){
  return Object.fromEntries(Array.from({length:4},(_,i)=>[
    [`uDetail${i}`,{value:fallback}],[`uDetailRect${i}`,{value:new THREE.Vector4(0,0,1,0)}]
  ]).flat());
}

export async function loadGroundDetail(world,uniforms,fallback) {
  const res=await fetch(new URL('../../assets/scenery/detail/manifest.json',import.meta.url));
  if(!res.ok)throw new Error(`Ground detail: HTTP ${res.status}`);
  const {tiles}=await res.json(),low=world.lowDetail||world.quality==='low';
  const cache=new Map(),errors=new Set(),url=t=>new URL(`../../assets/scenery/detail/${t.id}${low?'-low':''}.webp`,import.meta.url).href;
  // Only four tiles are on the graphics card at a time, but every file is downloaded with the
  // scenery (12 MB, 3 MB on low): during a flight a tile is decoded from memory, not waited for.
  const files=new Map(tiles.map(t=>[t.id,fetch(url(t)).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.blob();})]));
  // Decoded off the main thread where the browser can (an ImageBitmap).
  const decode=async t=>{
    const blob=await files.get(t.id);
    // as decoded: no alpha premultiplication pass (the photographs are opaque anyway)
    if(typeof createImageBitmap==='function')return createImageBitmap(blob,{premultiplyAlpha:'none'});
    const src=URL.createObjectURL(blob),img=new Image();
    try{img.src=src;await img.decode();return img;}finally{URL.revokeObjectURL(src);}
  };

  // A 2064 px tile is 17 MB of pixels. Uploaded at once, as a texture normally is when it is
  // first drawn (and flipped on the way), it held up a frame for 170-180 ms each time the
  // aircraft crossed into a new tile: every kilometre of final. During a flight a tile is copied
  // into its texture one strip (a sixteenth) per animation frame instead, and appears once
  // complete: about 0.3 s later, far ahead of the aircraft. A fixed strip, not a time budget: the
  // browser does the copy in its GPU process, so the time the call takes here does not show its
  // cost. The preparation behind the menu, tests (settle) and a jump of the eye (a new flight, a
  // reposition: the view changes anyway) copy at once.
  const renderer=world.renderer,queue=[],region=new THREE.Box2(),at=new THREE.Vector2();
  const STRIPS=16;
  let immediate=0,scheduled=false;
  const tick=()=>{scheduled=false;pump(1);schedule();};
  const schedule=()=>{if(queue.length&&!scheduled){scheduled=true;requestAnimationFrame(tick);}};
  const step=entry=>{
    const source=entry.source,{width,height}=source;
    if(!entry.target){                                       // storage for the full mip chain, no pixels
      const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,colorSpace:THREE.SRGBColorSpace,
        generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,anisotropy:world.maxAniso});
      target.texture.name=`Ground detail ${entry.id}`;
      renderer.initRenderTarget(target);target.texture.generateMipmaps=false;
      entry.target=target;entry.copy=new THREE.Texture(source);entry.copy.flipY=false;entry.row=0;
      return false;
    }
    const rows=Math.ceil(height/STRIPS),end=Math.min(height,entry.row+rows);
    region.min.set(0,entry.row);region.max.set(width,end);at.set(0,entry.row);
    entry.target.texture.generateMipmaps=end===height;       // the last strip builds the mip chain
    renderer.copyTextureToTexture(entry.copy,entry.target.texture,region,at);
    entry.row=end;return end===height;
  };
  const finish=entry=>{
    entry.source.close?.();entry.source=entry.copy=null;
    entry.texture=entry.target.texture;entry.resolve(entry.texture);
  };
  const pump=steps=>{                                        // steps: Infinity copies everything
    for(let n=0;n<steps&&queue.length;){
      const entry=queue[0];
      if(entry.disposed){queue.shift();continue;}
      if(step(entry)){queue.shift();finish(entry);}
      n++;
    }
  };
  const release=entry=>{
    entry.disposed=true;entry.target?.dispose();entry.source?.close?.();entry.resolve?.(null);
  };
  const load=t=>{
    const entry={id:t.id};
    entry.promise=new Promise(resolve=>{entry.resolve=resolve;});
    decode(t).then(source=>{
      if(entry.disposed){source.close?.();return;}
      entry.source=source;queue.push(entry);
      if(immediate)pump(Infinity);else schedule();
    }).catch(()=>{errors.add(t.id);entry.resolve(null);});
    return entry;
  };

  let desired=[],serial=0,lastX=Infinity,lastZ=Infinity,pending=Promise.resolve();
  const choose=eye=>{
    if(Math.hypot(eye.x-lastX,eye.z-lastZ)<180)return pending;
    lastX=eye.x;lastZ=eye.z;
    const next=tiles.filter(t=>Math.hypot(t.center[0]-eye.x,t.center[1]-eye.z)<2300)
      .sort((a,b)=>Math.hypot(a.center[0]-eye.x,a.center[1]-eye.z)-Math.hypot(b.center[0]-eye.x,b.center[1]-eye.z)).slice(0,4);
    if(next.map(t=>t.id).join()===desired.join())return pending;
    desired=next.map(t=>t.id);const ticket=++serial;
    for(const t of next)if(!cache.has(t.id))cache.set(t.id,load(t));
    // The tiles on screen stay until the new set is complete: no holes while it uploads.
    pending=Promise.all(next.map(t=>cache.get(t.id).promise)).then(loaded=>{
      if(ticket!==serial)return;
      for(let i=0;i<4;i++){
        uniforms[`uDetail${i}`].value=loaded[i]||fallback;
        const t=next[i];uniforms[`uDetailRect${i}`].value.set(t?.center[0]||0,t?.center[1]||0,t?.side||1,loaded[i]?1:0);
      }
      for(const [id,entry] of cache)if(!desired.includes(id)){release(entry);cache.delete(id);}
    });
    return pending;
  };
  const settle=async eye=>{
    immediate++;
    try{const result=choose(eye);pump(Infinity);await result;return result;}finally{immediate--;}
  };
  // Every frame of a flight (World.update). More than a kilometre since the last frame is a jump.
  let lastEye=null;
  const update=eye=>{
    const jumped=!lastEye||Math.hypot(eye.x-lastEye.x,eye.z-lastEye.z)>1000;
    (lastEye??=new THREE.Vector3()).copy(eye);
    return jumped?settle(eye):choose(eye);
  };
  // Streams the tiles for a likely next view, e.g. the short final while the menu is up.
  const prefetch=eye=>choose(eye);
  world.groundDetail={update,settle,prefetch,cache,errors,get ready(){return pending;},get uploading(){return queue.length;}};
  await Promise.allSettled(files.values());
  await settle(SHORT_FINAL_EYE);
}
