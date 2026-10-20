// Opaque window interiors: intersect a bounded room behind each pane. The room
// moves in perspective while the curtain wall stays on its real geometry.
import * as THREE from 'three';

export function paneFrame(a,b,c,d) {
  const origin=new THREE.Vector3(...a),vertical=b[1]>a[1];
  const right=new THREE.Vector3(...(vertical?d:b)).sub(origin);
  const up=new THREE.Vector3(...(vertical?b:d)).sub(origin);
  const width=right.length();right.normalize();
  up.addScaledVector(right,-up.dot(right));const height=up.length();up.normalize();
  return {right:right.toArray(),up:up.toArray(),size:[width,height]};
}

export function applyAirportGlass(material) {
  material.onBeforeCompile=(shader,renderer)=>{
    // Preserve the world's shared atmosphere, including cloud entry and night.
    THREE.Material.prototype.onBeforeCompile.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec2 paneUV; attribute vec2 paneSize;
      attribute vec3 paneRight; attribute vec3 paneUp; attribute float paneVariant;
      varying vec2 vPaneUV; varying vec3 vPaneRoom; varying vec3 vPaneEye; varying float vPaneVariant;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 toEye=cameraPosition-(modelMatrix*vec4(position,1.0)).xyz;
      vPaneEye=vec3(dot(toEye,mat3(modelMatrix)*paneRight),dot(toEye,mat3(modelMatrix)*paneUp),dot(toEye,mat3(modelMatrix)*normal));
      vPaneUV=paneUV;vPaneVariant=paneVariant;
      vPaneRoom=vec3(paneSize,clamp(paneSize.x*.9,3.0,18.0));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vPaneUV; varying vec3 vPaneRoom; varying vec3 vPaneEye; varying float vPaneVariant;
      // Signed epsilon protects both axis-parallel rays and pane corners.
      vec3 roomSafe(vec3 v){return mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),v))*max(abs(v),vec3(.0001));}
      float roomBox(vec3 p,vec3 ray,vec3 lo,vec3 hi){
        vec3 a=(lo-p)/roomSafe(ray),b=(hi-p)/roomSafe(ray);
        vec3 nearHit=min(a,b),farHit=max(a,b);
        float entry=max(nearHit.x,max(nearHit.y,nearHit.z));
        float exit=min(farHit.x,min(farHit.y,farHit.z));
        return entry>0.0&&entry<exit?entry:1e5;
      }
      vec3 airportRoom(out vec3 glow){
        vec3 size=max(vPaneRoom,vec3(.05));
        vec3 p=vec3(clamp(vPaneUV,vec2(.001),vec2(.999))*size.xy,0.0);
        vec3 ray=normalize(vec3(-vPaneEye.xy,max(abs(vPaneEye.z),.001)));
        vec3 farHit=(mix(vec3(0.0),size,step(vec3(0.0),ray))-p)/roomSafe(ray);
        float t=min(farHit.x,min(farHit.y,farHit.z));vec3 hit=p+ray*t;
        float back=step(farHit.z,min(farHit.x,farHit.y));
        float horizontal=step(farHit.y,min(farHit.x,farHit.z));
        float ceiling=horizontal*step(0.0,ray.y),floorHit=horizontal-ceiling;
        vec3 wall=mix(vec3(.16,.19,.18),vec3(.24,.235,.205),mod(vPaneVariant,3.0)/2.0);
        vec3 room=wall*(.8+.2*back);
        room=mix(room,vec3(.095,.12,.125),floorHit);
        room=mix(room,vec3(.32,.34,.31),ceiling);
        // Corners and rear wall stay quieter than the daylight entrance.
        float edge=min(min(hit.x,size.x-hit.x),min(hit.y,size.y-hit.y));
        room*=mix(.65,1.0,smoothstep(0.0,.45,max(0.0,edge)))*mix(1.0,.68,hit.z/size.z);
        // Rear wall: door and gate information board, with a real depth offset.
        float door=back*step(abs(hit.x-size.x*.22),.62)*step(hit.y,2.35);
        room=mix(room,vec3(.055,.075,.076),door);
        float boardY=min(3.0,size.y*.68);
        float board=back*step(abs(hit.x-size.x*.67),min(2.4,size.x*.16))*step(abs(hit.y-boardY),.36);
        room=mix(room,vec3(.023,.05,.065),board);
        room*=1.0-.22*(1.0-smoothstep(.10,.14,hit.y))*(1.0-horizontal);
        vec2 joint=abs(fract(hit.xz/1.8)-.5),aa=max(fwidth(hit.xz/1.8),vec2(.001));
        float seams=max(smoothstep(.49-aa.x,.50+aa.x,joint.x),smoothstep(.49-aa.y,.50+aa.y,joint.y));
        room*=1.0-.12*seams*floorHit;
        // One bench/counter volume in front of the wall gives occlusion and
        // parallax across each bay without extra geometry or transparency.
        float benchTop=min(.55,size.y*.3);
        vec3 lo=vec3(size.x*.43,.32,size.z*.55),hi=vec3(size.x*.84,benchTop,size.z*.59);
        float bench=roomBox(p,ray,lo,hi);
        float seatBack=roomBox(p,ray,vec3(lo.x,benchTop,size.z*.59),vec3(hi.x,min(.95,size.y*.4),size.z*.60));
        bench=min(bench,seatBack);
        if(bench<t){
          vec3 q=p+ray*bench;room=vec3(.035,.052,.057)*mix(.7,1.2,smoothstep(benchTop-.06,benchTop,q.y));
          board=0.0;ceiling=0.0;
        }
        // Ceiling strips use derivatives to remain stable in distant panes.
        float lightWidth=max(fwidth(hit.x)*1.5,.035);
        float strip=1.0-smoothstep(.10,.10+lightWidth,abs(mod(hit.x+2.0,4.0)-2.0));
        float lamp=ceiling*strip*step(.15,hit.z/size.z)*step(hit.z/size.z,.88);
        float occupied=((vPaneVariant>1.5&&vPaneVariant<2.5)||vPaneVariant>6.5)?.16:1.0;
        glow=(room*.5+vec3(.65,.59,.44)*lamp+vec3(.06,.14,.17)*board)*occupied;
        return room*vec3(.38,.49,.51);
      }
    `).replace('#include <map_fragment>',`
      vec3 roomGlow;vec3 room=airportRoom(roomGlow);
      // Interior dominates head-on; the environment specular grows at grazing
      // angles through the standard material's Fresnel term.
      diffuseColor.rgb*=room;
    `).replace('#include <emissivemap_fragment>','totalEmissiveRadiance*=roomGlow;');
  };
  material.customProgramCacheKey=()=> 'airport-room-v1';
}
