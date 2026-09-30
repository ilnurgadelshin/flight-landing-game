// Bounded, local-only imagery: sharper final-approach tiles, no map API at runtime.
import * as THREE from 'three';

export const GROUND_DETAIL_GLSL=/* glsl */`
  uniform sampler2D uDetail0,uDetail1,uDetail2,uDetail3;
  uniform vec4 uDetailRect0,uDetailRect1,uDetailRect2,uDetailRect3;
  vec3 detailTile(vec3 base,sampler2D tex,vec4 rect,vec2 p){
    vec2 uv=(p-rect.xy)*vec2(1.0,-1.0)/max(rect.z,1.0)+.5;
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
  const cache=new Map(),loader=new THREE.TextureLoader(),errors=new Set();
  let desired=[],serial=0,lastX=Infinity,lastZ=Infinity,pending=Promise.resolve();
  const update=eye=>{
    if(Math.hypot(eye.x-lastX,eye.z-lastZ)<180)return pending;
    lastX=eye.x;lastZ=eye.z;
    const next=tiles.filter(t=>Math.hypot(t.center[0]-eye.x,t.center[1]-eye.z)<2300)
      .sort((a,b)=>Math.hypot(a.center[0]-eye.x,a.center[1]-eye.z)-Math.hypot(b.center[0]-eye.x,b.center[1]-eye.z)).slice(0,4);
    if(next.map(t=>t.id).join()===desired.join())return pending;
    desired=next.map(t=>t.id);const ticket=++serial;
    for(const [id,entry] of cache)if(!desired.includes(id)){
      entry.disposed=true;entry.texture?.dispose();cache.delete(id);
      for(let i=0;i<4;i++)if(uniforms[`uDetail${i}`].value===entry.texture){
        uniforms[`uDetail${i}`].value=fallback;uniforms[`uDetailRect${i}`].value.w=0;
      }
    }
    pending=Promise.all(next.map(t=>{
      if(!cache.has(t.id)){
        const entry={};cache.set(t.id,entry);
        entry.promise=loader.loadAsync(new URL(`../../assets/scenery/detail/${t.id}${low?'-low':''}.webp`,import.meta.url).href)
          .then(texture=>{
            if(entry.disposed){texture.dispose();return null;}
            texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=world.maxAniso;entry.texture=texture;return texture;
          }).catch(()=>{errors.add(t.id);return null;});
      }
      return cache.get(t.id).promise;
    })).then(loaded=>{
      if(ticket!==serial)return;
      for(let i=0;i<4;i++){
        uniforms[`uDetail${i}`].value=loaded[i]||fallback;
        const t=next[i];uniforms[`uDetailRect${i}`].value.set(t?.center[0]||0,t?.center[1]||0,t?.side||1,loaded[i]?1:0);
      }
    });
    return pending;
  };
  world.groundDetail={update,cache,errors,get ready(){return pending;},settle:update};
  await update(new THREE.Vector3(8500,0,0));
}
