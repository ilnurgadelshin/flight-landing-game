// Maintained turf follows the existing airport pavement. This changes surface
// colour only; the graded terrain, collision surfaces and runway markings stay put.
import {RUNWAY} from '../config.js';
import {HANGAR_APRON,TAXIWAY_CONNECTORS} from '../airport-layout.js';

const {xMin,xMax,zMin,zMax}=HANGAR_APRON;
const nearestConnector=TAXIWAY_CONNECTORS.map(x=>`abs(p.x-(${x}.0))`).reduce((a,b)=>`min(${a},${b})`);

// FAA AIM 2-3-4 gives taxiway centreline widths of 0.15–0.30 m. The old three
// texel stripe was 1.41 m wide on these 30 m slabs (4.69 m on the rotated strips).
// Analytic pixel coverage keeps a 0.30 m stripe sampled without a larger texture.
export function applyTaxiwayMarkings(material){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vTaxiwayXZ;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvTaxiwayXZ=(modelMatrix*vec4(position,1.)).xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec2 vTaxiwayXZ;
   float taxiwayCoverage(float coordinate,float halfPixel,float lo,float hi){
    return clamp((min(coordinate+halfPixel,hi)-max(coordinate-halfPixel,lo))/(2.*halfPixel),0.,1.);
   }`)
   .replace('#include <map_fragment>',`#include <map_fragment>
    vec2 p=vTaxiwayXZ,pixel=max(abs(dFdx(p))+abs(dFdy(p)),vec2(.0001))*.5;
    float centre=taxiwayCoverage(p.y,pixel.y,134.85,135.15);
    float stem=taxiwayCoverage(${nearestConnector},pixel.x,-.15,.15)*taxiwayCoverage(p.y,pixel.y,22.5,135.);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*vec3(.745404,.527115,.014444),max(centre,stem));
   `);
 };
 material.customProgramCacheKey=()=> 'airport-metric-taxiway-markings-v1';
}
export const HANGAR_APRON_GLSL=`
 float hangarApronMask(vec2 p){
  return step(${xMin}.0,p.x)*step(p.x,${xMax}.0)*step(${zMin}.0,p.y)*step(p.y,${zMax}.0);
 }
`;

export const AIRPORT_GROUND_GLSL=/* glsl */`
 float airportRectDistance(vec2 p,vec2 halfSize){
  vec2 q=abs(p)-halfSize;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0);
 }
 float airportVergeDistance(vec2 p){
  // Include the aggregate runway shoulder, then the taxiway/apron union. Taking
  // the union prevents a brown seam across a paved junction or the apron entrance.
  float d=airportRectDistance(p,vec2(${RUNWAY.length/2+RUNWAY.padLength}.0,${RUNWAY.width/2+6}));
  d=min(d,airportRectDistance(p-vec2(0.,135.),vec2(${RUNWAY.length/2}.0,15.)));
  d=min(d,airportRectDistance(p-vec2(0.,285.),vec2(700.,135.)));
  d=min(d,airportRectDistance(p-vec2(${(xMin+xMax)/2}.0,${(zMin+zMax)/2}.0),vec2(${(xMax-xMin)/2}.0,${(zMax-zMin)/2}.0)));
  float cx=${nearestConnector};
  d=min(d,airportRectDistance(vec2(cx,p.y-86.25),vec2(15.,63.75)));
  return d;
 }
 float airportPatch(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),
    dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
 }
 vec3 airportTurf(vec3 turf,vec2 p,float reach){
  float d=airportVergeDistance(p),pixel=max(.25,fwidth(d));
  float moisture=airportPatch(p*.007+vec2(13.8,4.1));
  float patches=airportPatch(p*.031+vec2(7.2,30.4));
  // Uneven dry clippings/soil outside the pavement, with a smooth footprint when
  // the thin verge becomes smaller than a screen pixel. No geometric trench.
  float edge=(1.-smoothstep(1.5-pixel,5.0+pixel,d))*smoothstep(-pixel,pixel,d);
  float worn=edge*mix(.18,.70,patches);
  vec3 maintained=turf*mix(.90,1.10,moisture);
  maintained=mix(maintained,maintained*vec3(1.24,1.02,.73),worn);
  // Subdued mowing follows the islands, rather than uniform stripes everywhere.
  float cut=.985+.015*cos(max(d,0.)*.44)*exp(-max(d,0.)*.025);
  return mix(turf,maintained*cut,reach);
 }
`;
