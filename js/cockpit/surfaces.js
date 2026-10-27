// Surface finishes for verified parts of hakai315's cockpit. The source geometry
// and lettering remain intact. See assets/README.md for the finish/colour changes.
import * as THREE from 'three';
import {finishCoordinates,finishRegion} from './surface-layout.js';

// These identities were checked against the original meshes in Blender. Do not
// infer other part identities from the numeric material names (many are shared).
const FINISH = {
  'Material.014': 'trim',       // Body.002/006/018: cabin liner
  'Material.424': 'trim',       // Cube.1060/1061: left/right molded side consoles
  'Material.008': 'frame',      // Body.020: windshield frame
  'Material.457': 'paint',      // Cube.008 and side panels
  'Material.103': 'paint',      // pedestal casing, instrument bezels and panels
  'Material.261': 'paint',      // overhead and MCP panel faces
  'Material.354': 'paint',      // overhead subpanels and switch bodies
  'Material.194': 'fabric',     // Cube.488/489/1088: seat cushions
  FlightDeckHeadliner: 'trim',  // Fitted roof added by the simulator
};
const FINISHES = {
  // Tile width and relief in metres; microdetail should disappear at a distance.
  paint:  {tile: .12, relief: .000055, roughness: .64, variation: .16},
  frame:  {tile: .12, relief: .00004, roughness: .73, variation: .08},
  trim:   {tile: .30, relief: .00032, roughness: .88, variation: .06, scan:'liner'},
  fabric: {tile: .27, relief: .00065, roughness: .98, variation: .02, scan:'upholstery'},
  rubber: {tile: .08, relief: .000065, roughness: .53, variation: .12},
  padding:{tile: .16, relief: .00032, roughness: .90, variation: .08},
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

export const COCKPIT_SURFACE_GLSL=/* glsl */`
  uniform sampler2D deckSurface;
  uniform float deckTile;
  uniform float deckRelief;
  varying vec3 vDeckPosition;
  vec3 deckSample(vec3 p) {
    // Derivatives give projection weights without extra normals or UV seams.
    vec3 n=abs(cross(dFdx(p),dFdy(p)));
    n/=max(max(n.x,n.y),max(n.z,1e-20));
    vec3 w=pow(n,vec3(4.0)); w/=max(w.x+w.y+w.z,1e-20);
    // Most panel/console faces align to a model axis. Avoid three texture
    // lookups when only one contributes. Explicit gradients retain mip choice
    // at triangle/branch boundaries; curved faces keep the blended projection.
    vec3 dx=dFdx(p/deckTile),dy=dFdy(p/deckTile);
    if(w.x>.9999)return textureGrad(deckSurface,p.yz/deckTile,dx.yz,dy.yz).rgb;
    if(w.y>.9999)return textureGrad(deckSurface,p.xz/deckTile,dx.xz,dy.xz).rgb;
    if(w.z>.9999)return textureGrad(deckSurface,p.xy/deckTile,dx.xy,dy.xy).rgb;
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
    // Degenerate/projected-flat triangles can have zero derivatives in a cube
    // capture. normalize(0) is undefined and can poison the entire PMREM.
    vec3 bumped=abs(det)*n-gradient;
    float magnitude=dot(bumped,bumped);
    return magnitude>1e-30 ? bumped*inversesqrt(magnitude) : n;
  }
`;

function finishMaterial(material, kind, texture, wear, wearKind) {
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
    if(!texture&&!wear)return;
    let uniforms='',attributes='',varyings='',vertex='',roughness='',bump='';
    const scope=kind==='padding'?'vDeckFinish.z':'1.0';
    if(wear){
      shader.uniforms.deckWear=wear;uniforms+='uniform sampler2D deckWear;\n';
      attributes+='attribute vec3 deckFinish;\n';varyings+='varying vec3 vDeckFinish;\n';vertex+='vDeckFinish=deckFinish;\n';
      roughness+=`vec3 deckWearTexel=texture2D(deckWear,vDeckFinish.xy).rgb;
        diffuseColor.rgb*=mix(1.0,deckWearTexel.r*2.0,vDeckFinish.z);
        roughnessFactor*=mix(1.0,deckWearTexel.g*2.0,vDeckFinish.z);\n`;
    }
    if(texture){
      shader.uniforms.deckSurface={value:texture};
      shader.uniforms.deckTile={value:FINISHES[kind].tile};
      shader.uniforms.deckRelief={value:FINISHES[kind].relief};
      attributes+='attribute vec3 deckPosition;\n';vertex+='vDeckPosition=deckPosition;\n';
      roughness+=`vec3 deckTexel=deckSample(vDeckPosition);
        roughnessFactor*=mix(1.0,deckTexel.g,${scope});
        diffuseColor.rgb*=mix(1.0,deckTexel.b,${scope});\n`;
      const rim=wear&&['panel','overhead','headliner'].includes(wearKind)?`+(deckWearTexel.b-1.0)*${wearKind==='headliner'?'.00035':'.00065'}*vDeckFinish.z`:'';
      bump=`normal=deckBump(normal,deckTexel.r*deckRelief*${scope}${wear?'*mix(1.0,deckWearTexel.b,vDeckFinish.z)':''}${rim},faceDirection);`;
    }else if(kind==='padding')roughness+=`roughnessFactor*=mix(1.0,${FINISHES.padding.roughness},${scope});`;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\n'+attributes+varyings+(texture?'varying vec3 vDeckPosition;\n':''))
      .replace('#include <begin_vertex>','#include <begin_vertex>\n'+vertex);
    shader.fragmentShader=shader.fragmentShader
      .replace('void main() {',uniforms+varyings+(texture?COCKPIT_SURFACE_GLSL:'')+'\nvoid main() {')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+roughness)
      .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+bump);
  };
  material.customProgramCacheKey=()=>`cockpit-surface-v6:${texture?kind:'occlusion'}:${wear?wearKind:'plain'}`;
  material.userData.cockpitFinish=kind||'occlusion';
  material.needsUpdate=true;
}

export async function applyCockpitSurfaces(model,{lowDetail=false}={}) {
  const maps=new Map(),materials=new Map(),geometries=new Set(),regions={};
  // The part-fitted atlas loads behind the menu (loadSurfaceWear). Until then, or if it
  // fails, all its materials share one exactly neutral texel: colour, roughness and relief ×1.
  const neutral=new THREE.DataTexture(new Float32Array([.5,.5,1,1]),1,1,THREE.RGBAFormat,THREE.FloatType);
  neutral.needsUpdate=true;
  const errors=[],wear={value:neutral};
  await Promise.all(lowDetail?[]:Object.entries(FINISHES).filter(([,f])=>f.scan).map(async([kind,f])=>{
    try{
      const texture=await new THREE.TextureLoader().loadAsync(new URL(`../../assets/cockpit/${f.scan}.webp`,import.meta.url).href);
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
    let kind=FINISH[source.name],yoke=false,yokeCentre=0;
    for(let node=mesh;node&&node!==model;node=node.parent)if(node.userData.controlPivot){yoke=true;yokeCentre=node.userData.controlPivot[0];}
    // Black is shared with screens and lettering. Scope rubber to the animated
    // yoke assemblies; never brighten every black material in the source.
    if(yoke&&Math.max(source.color.r,source.color.g,source.color.b)<.005)kind='rubber';
    // Ray-picked on the delivered deck and checked against source bounds. This
    // shared material also covers distant fittings: only the measured forward
    // glareshield volume receives padding (deckFinish.z gates every channel).
    if(source.name==='Material.481')kind='padding';
    const wearKind=kind==='rubber'||kind==='frame'||kind==='padding'?kind:
      ['Material.014','FlightDeckHeadliner'].includes(source.name)?'headliner':
      source.name==='Material.354'?'overhead':
      ['Material.457','Material.103','Material.261'].includes(source.name)?'panel':null;
    const partWear=wearKind?wear:null;
    const key=source.uuid+':'+(kind||'occlusion');
    if(kind&&!lowDetail&&!maps.has(kind))maps.set(kind,kind==='padding'&&maps.has('trim')?maps.get('trim'):makeSurfaceMap(kind));
    if((kind&&!lowDetail)||partWear){
      if(geometries.has(mesh.geometry))mesh.geometry=mesh.geometry.clone();
      geometries.add(mesh.geometry);
      // Store coordinates before the model is attached to the moving aircraft.
      // The pattern then follows the object, including animated controls.
      const position=mesh.geometry.attributes.position,coords=kind&&!lowDetail?new Float32Array(position.count*3):null;
      const finish=partWear?new Float32Array(position.count*3):null,p=new THREE.Vector3(),n=new THREE.Vector3();
      const normals=mesh.geometry.attributes.normal,normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      for(let i=0;i<position.count;i++){
        p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        if(coords)p.toArray(coords,i*3);
        if(finish){
          n.fromBufferAttribute(normals,i).applyNormalMatrix(normalMatrix);
          const uv=finishCoordinates(wearKind,p.x,p.y,p.z,yokeCentre,n.y);finish.set(uv,i*3);
          if(uv[2]>.5){const region=finishRegion(wearKind,p.x,p.y,p.z);regions[region]=(regions[region]||0)+1;}
        }
      }
      if(coords)mesh.geometry.setAttribute('deckPosition',new THREE.BufferAttribute(coords,3));
      if(finish)mesh.geometry.setAttribute('deckFinish',new THREE.BufferAttribute(finish,3));
    }
    if(!materials.has(key)){
      const material=source.clone();
      // Perfect black absorbs all diffuse light and loses the molded handle's
      // shape. Rubber has a small, neutral reflectance, even in unlit areas.
      if(kind==='rubber')material.color.setRGB(.022,.022,.022);
      if(kind&&kind!=='padding'&&lowDetail)material.roughness*=FINISHES[kind].roughness;
      finishMaterial(material,kind,maps.get(kind),partWear,wearKind);materials.set(key,material);
    }
    mesh.material=materials.get(key);
  });
  const detail=model.userData.surfaceDetail={materials:materials.size,maps:maps.size,wearSize:0,regions,errors};
  // A scenery job: requested after the menu appears, so it is outside the startup budget.
  // Replacing the shared uniform's texture needs no shader recompilation.
  let wearLoad;
  model.userData.loadSurfaceWear=()=>wearLoad??=new THREE.TextureLoader()
    .loadAsync(new URL(`../../assets/cockpit/service-wear${lowDetail?'-low':''}.webp`,import.meta.url).href)
    .then(texture=>{
      texture.name='Part-fitted cockpit colour / roughness / relief';texture.anisotropy=4;
      wear.value=texture;neutral.dispose();detail.wearSize=texture.image.width;
    },error=>{errors.push(`service wear: ${error}`);});
}
