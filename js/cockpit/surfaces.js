// Surface finishes for verified parts of hakai315's cockpit. The source geometry
// and lettering remain intact. See assets/README.md for the finish/colour changes.
import * as THREE from 'three';

// These identities were checked against the original meshes in Blender. Do not
// infer other part identities from the numeric material names (many are shared).
const FINISH = {
  'Material.014': 'trim',       // Body.002/006/018: cabin liner
  'Material.008': 'frame',      // Body.020: windshield frame
  'Material.457': 'paint',      // Cube.008 and side panels
  'Material.103': 'paint',      // pedestal casing, instrument bezels and panels
  'Material.261': 'paint',      // overhead and MCP panel faces
  'Material.354': 'paint',      // overhead subpanels and switch bodies
  'Material.194': 'fabric',     // Cube.488/489/1088: seat cushions
};
const FINISHES = {
  // Tile width and relief in metres; microdetail should disappear at a distance.
  paint:  {tile: .12, relief: .000055, roughness: .64, variation: .16},
  frame:  {tile: .12, relief: .00004, roughness: .73, variation: .08},
  trim:   {tile: .30, relief: .00032, roughness: .88, variation: .06, scan:'liner'},
  fabric: {tile: .27, relief: .00065, roughness: .98, variation: .02, scan:'upholstery'},
  rubber: {tile: .08, relief: .000065, roughness: .53, variation: .12},
};

// Periodic, deterministic value noise. These small linear-data maps are original
// procedural surfaces, not photographs. Mipmaps average the subpixel texture.
function noise(x, y, period, seed) {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const fade=t=>t*t*(3-2*t),u=fade(fx),v=fade(fy);
  const at=(a,b)=>{
    let h=(a%period+period)%period*374761393+((b%period+period)%period)*668265263+seed;
    h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
  };
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),u),
    THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),u),v);
}

function makeSurfaceMap(kind) {
  const size=256,data=new Uint8Array(size*size*4),finish=FINISHES[kind];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    const fine=noise(u*96,v*96,96,31),grain=noise(u*32,v*32,32,97),broad=noise(u*4,v*4,4,53);
    let height=.65*grain+.35*fine,albedo=1-(.006*fine+.008*broad);
    if(kind==='trim')height=.8*grain+.2*fine;
    if(kind==='fabric'){
      // Rounded crossing yarns, not a flat checkerboard. The tile is 8 cm wide.
      const warp=.5+.5*Math.cos(u*Math.PI*2*64),weft=.5+.5*Math.cos(v*Math.PI*2*64);
      const crossing=(Math.floor(u*64)+Math.floor(v*64))%2;
      height=(crossing?warp:weft)*.65+fine*.35;
      albedo=.91+.07*height+.02*broad;
    }
    const i=(y*size+x)*4;
    data[i]=Math.round(height*255);
    data[i+1]=Math.round(THREE.MathUtils.clamp(finish.roughness+finish.variation*(broad-.5),0,1)*255);
    data[i+2]=Math.round(albedo*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.name=`Cockpit ${kind}: height / roughness / colour modulation`;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

const detailPars=/* glsl */`
  uniform sampler2D deckSurface;
  uniform float deckTile;
  uniform float deckRelief;
  varying vec3 vDeckPosition;
  vec3 deckSample(vec3 p) {
    // Derivatives give projection weights without extra normals or UV seams.
    vec3 n=abs(cross(dFdx(p),dFdy(p)));
    n/=max(max(n.x,n.y),max(n.z,1e-20));
    vec3 w=pow(n,vec3(4.0)); w/=max(w.x+w.y+w.z,1e-20);
    return texture2D(deckSurface,p.yz/deckTile).rgb*w.x
         + texture2D(deckSurface,p.xz/deckTile).rgb*w.y
         + texture2D(deckSurface,p.xy/deckTile).rgb*w.z;
  }
  vec3 deckBump(vec3 n,float height,float faceDirection) {
    // Surface-gradient bump mapping, in metres, independent of object UV scale.
    vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
    vec3 r1=cross(dy,n),r2=cross(n,dx);
    float det=dot(dx,r1)*faceDirection;
    vec3 gradient=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
    return normalize(abs(det)*n-gradient);
  }
`;

function finishMaterial(material, kind, texture) {
  const before=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
    before.call(this,shader,renderer); // Retain the shared atmosphere uniforms.
    // COLOR_0 in these particular assets is baked occlusion, not paint. Applying
    // it to indirect illumination keeps sunlight and instrument light intact.
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <color_fragment>','')
      .replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
        'rectAreaLight = rectAreaLights[ i ];',`rectAreaLight = rectAreaLights[ i ];
          #ifdef USE_COLOR
            rectAreaLight.color *= vColor.r;
          #endif`))
      .replace('#include <aomap_fragment>',/* glsl */`
        #include <aomap_fragment>
        #ifdef USE_COLOR
          float deckOcclusion=clamp(vColor.r,0.0,1.0);
          reflectedLight.indirectDiffuse*=deckOcclusion;
          #if defined(USE_ENVMAP) && defined(STANDARD)
            reflectedLight.indirectSpecular*=computeSpecularOcclusion(
              saturate(dot(geometryNormal,geometryViewDir)),deckOcclusion,material.roughness);
          #endif
        #endif
      `);
    if(!texture)return;
    shader.uniforms.deckSurface={value:texture};
    shader.uniforms.deckTile={value:FINISHES[kind].tile};
    shader.uniforms.deckRelief={value:FINISHES[kind].relief};
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute vec3 deckPosition;\nvarying vec3 vDeckPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvDeckPosition=deckPosition;');
    shader.fragmentShader=shader.fragmentShader
      .replace('void main() {',detailPars+'\nvoid main() {')
      .replace('#include <roughnessmap_fragment>',/* glsl */`
        #include <roughnessmap_fragment>
        vec3 deckTexel=deckSample(vDeckPosition);
        roughnessFactor*=deckTexel.g;
        diffuseColor.rgb*=deckTexel.b;
      `)
      .replace('#include <normal_fragment_maps>',/* glsl */`
        #include <normal_fragment_maps>
        normal=deckBump(normal,deckTexel.r*deckRelief,faceDirection);
      `);
  };
  material.customProgramCacheKey=()=>`cockpit-surface-v2:${texture?kind:'occlusion'}`;
  material.userData.cockpitFinish=kind||'occlusion';
  material.needsUpdate=true;
}

export async function applyCockpitSurfaces(model,{lowDetail=false}={}) {
  const maps=new Map(),materials=new Map(),geometries=new Set();
  const errors=[];
  if(!lowDetail)await Promise.all(Object.entries(FINISHES).filter(([,f])=>f.scan).map(async([kind,f])=>{
    try{
      const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/cockpit/${f.scan}.png`,import.meta.url).href);
      texture.name=`Scanned cockpit ${kind}: height / roughness / colour modulation`;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
      // Packed linear channels, not an sRGB colour photograph.
      maps.set(kind,texture);
    }catch(error){errors.push(`${kind}: ${error}`);} // original finish is a load-failure fallback
  }));
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const source=mesh.material;
    let kind=FINISH[source.name],yoke=false;
    for(let node=mesh;node&&node!==model;node=node.parent)if(node.userData.controlPivot)yoke=true;
    // Black is shared with screens and lettering. Scope rubber to the animated
    // yoke assemblies; never brighten every black material in the source.
    if(yoke&&Math.max(source.color.r,source.color.g,source.color.b)<.005)kind='rubber';
    const key=source.uuid+':'+(kind||'occlusion');
    if(kind&&!lowDetail){
      if(!maps.has(kind))maps.set(kind,makeSurfaceMap(kind));
      if(geometries.has(mesh.geometry))mesh.geometry=mesh.geometry.clone();
      geometries.add(mesh.geometry);
      // Store coordinates before the model is attached to the moving aircraft.
      // The pattern then follows the object, including animated controls.
      const position=mesh.geometry.attributes.position,coords=new Float32Array(position.count*3),p=new THREE.Vector3();
      for(let i=0;i<position.count;i++)p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).toArray(coords,i*3);
      mesh.geometry.setAttribute('deckPosition',new THREE.BufferAttribute(coords,3));
    }
    if(!materials.has(key)){
      const material=source.clone();
      // Perfect black absorbs all diffuse light and loses the molded handle's
      // shape. Rubber has a small, neutral reflectance, even in unlit areas.
      if(kind==='rubber')material.color.setRGB(.022,.022,.022);
      if(kind&&lowDetail)material.roughness*=FINISHES[kind].roughness;
      finishMaterial(material,kind,maps.get(kind));materials.set(key,material);
    }
    mesh.material=materials.get(key);
  });
  model.userData.surfaceDetail={materials:materials.size,maps:maps.size,errors};
}
