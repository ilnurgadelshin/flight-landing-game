// Authored 737 flight deck, with the simulator's live instruments and controls.
// Coordinates below are measured on the source model, then converted by prepare-cockpit.mjs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { finishAuthoredDeck } from './materials.js';

const point=(x,y,z)=>new THREE.Vector3(-1.7*x,.14+1.7*(y-2.22),-1.7*(z-.9));

export async function loadFlightDeck(cockpit) {
  let model;
  try {
    ({scene:model}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(new URL(`../../assets/models/737-cockpit${cockpit.lowDetail?'-low':''}.glb`,import.meta.url).href));
  } catch(error) {
    cockpit.modelError=String(error);
    console.warn('Authored cockpit unavailable; using the fallback flight deck.',error);
    return;
  }
  const c=cockpit, root=c.root;
  // Keep the procedural deck only as a load-failure fallback. It is replaced as one unit,
  // rather than leaving another shell, another panel or overlapping seats underneath.
  const keep=new Set([c.camRig,c.dome,c.flood]);
  for(const child of root.children)if(!keep.has(child))child.visible=false;
  model.name='Authored Boeing 737-800 flight deck';
  model.traverse(o=>{
    if(!o.isMesh)return;
    o.material.side=THREE.DoubleSide;
    o.castShadow=true;o.receiveShadow=true;
  });
  root.add(model);c.authoredModel=model;
  // Align the eye with the forward pane of this authored shell. Its outboard
  // pillar otherwise sits almost exactly on the landing sightline.
  c.eyeLocal.set(-.28,.155,-.08);
  finishAuthoredDeck(model);
  // The open source omits the roof. Close it with a curved headliner so looking up
  // stays inside the cabin and sunlight enters through the glazing, not the ceiling.
  const roofPositions=[],roofIndices=[];
  for(let j=0;j<=12;j++)for(let i=0;i<=16;i++){
    const t=j/12,x=(i/16-.5)*1.65,z=1.42-t*1.40;
    const y=2.47+t*.39+.055*(1-Math.pow(x/.825,2));
    roofPositions.push(...point(x,y,z).toArray());
    if(i<16&&j<12){const a=j*17+i;roofIndices.push(a,a+1,a+17,a+1,a+18,a+17);}
  }
  const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roofPositions,3));roofGeometry.setIndex(roofIndices);roofGeometry.computeVertexNormals();
  const roof=new THREE.Mesh(roofGeometry,new THREE.MeshStandardMaterial({color:0x626763,roughness:.96,side:THREE.DoubleSide}));
  roof.name='Flight deck headliner';roof.castShadow=true;roof.receiveShadow=true;model.add(roof);
  // A very faint reflected sky on the forward glazing. Transmission cannot be
  // used in the separate cockpit pass (its buffer would contain no scenery).
  const glass=new THREE.MeshStandardMaterial({color:0xb8cfda,metalness:1,roughness:.16,
    transparent:true,opacity:.025,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.6});
  for(const side of [-1,1]){
    const corners=[[-.60,-.04,-.95],[0,-.04,-1.30],[0,.9,-1.05],[-.60,1,-.63]];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(([x,y,z])=>[x*side,y,z]),3));
    geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
    const pane=new THREE.Mesh(geometry,glass);pane.name='Forward windshield glazing';pane.renderOrder=2;model.add(pane);
  }

  const live=new THREE.Group();live.name='Live flight instruments';root.add(live);
  const screen=(tex,x,y,z,size=.102)=>{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size*1.7,size*1.7),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
    mesh.position.copy(point(x,y,z));live.add(mesh);return mesh;
  };
  const pfd=c.pfdScreen=screen(c.pfd.tex,.3223,1.8788,1.4555);
  c.ndScreen=screen(c.nd.tex,.19825,1.8782,1.4555);
  screen(c.upper.tex,.0063,1.8783,1.4555);
  screen(c.nd.tex,-.1549,1.8782,1.4555);
  screen(c.pfd.tex,-.2800,1.8782,1.4555);
  const lower=screen(c.lower.tex,.008,1.792,1.404,.096);lower.rotation.x=-Math.atan(1/.484);
  screen(c.standby.tex[0],.103,1.9047,1.453,.0385);
  screen(c.standby.tex[1],.103,1.854,1.453,.039);
  // Selected MCP values occupy the real model's display windows. Crop the live texture
  // instead of painting a second control panel over the authored switches and lettering.
  for(const [u,x,w] of [[80,.090,.046],[260,.015,.031],[440,-.055,.044],[620,-.110,.039]]){
    const geo=new THREE.PlaneGeometry(w*1.7,.018*1.7),uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(u+uv.getX(i)*90)/1024,(96-52+uv.getY(i)*34)/96);
    const display=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:c.mcpTex,toneMapped:false}));
    display.position.copy(point(x,2.065,1.428));live.add(display);
  }
  // Animate the authored quadrant itself, including the separate reverse handles.
  const bindControl=name=>{
    let source;model.traverse(o=>{if(o.userData.flightControl===name)source=o;});
    if(!source)throw new Error(`Missing ${name} in cockpit asset.`);
    const motion=new THREE.Group();motion.name=name;
    motion.position.fromArray(source.userData.controlOrigin);root.add(motion);
    source.position.sub(motion.position);source.removeFromParent();motion.add(source);return motion;
  };
  c.throttles=['left','right'].map(side=>{
    const piv=bindControl('throttle-'+side),rev=bindControl('reverse-'+side);
    rev.position.sub(piv.position);piv.add(rev);return {piv,rev};
  });
  c.sbLever=bindControl('speedbrake');c.flapLever=bindControl('flaps');
  c.flapLever.userData.rotaryGate=true;
  c.trimWheels=['left','right'].map(side=>bindControl('trim-'+side));
  c.gearLever.parent.remove(c.gearLever);live.add(c.gearLever);
  c.gearLever.position.copy(point(-.081,1.844,1.435));c.gearLever.scale.setScalar(.7);c.gearLever.visible=true;
  c.gearLights.forEach((l,i)=>{live.add(l);l.position.copy(point(-.078+(i===1?.012:i===2?-.012:0),1.93-(i===0?0:.016),1.435));});
  live.add(c.flapGauge);c.flapGauge.position.copy(point(-.088,1.99,1.435));c.flapGauge.scale.setScalar(.65);c.flapGauge.visible=true;
  c.wipers.forEach(w=>{w.visible=true;w.position.z=-.82;w.position.y=-.10;w.scale.set(.55,.55,.55);});
  // Separate the modeled columns and wheels for pitch and roll, with pilot-eye clearance.
  const yokeDrop=.16;
  c.yokes=[];
  for(const name of ['captain-yoke','officer-yoke']){
    let source,column;
    const captain=name==='captain-yoke';
    model.traverse(o=>{
      if(o.userData.controlPivot && (o.userData.controlPivot[0]<0)===captain)source=o;
      if(o.userData.columnPivot && (o.userData.columnPivot[0]<0)===captain)column=o;
    });
    if(!source||!column)throw new Error(`Missing ${name} assembly in cockpit asset.`);
    const pivot=new THREE.Vector3().fromArray(source.userData.controlPivot);
    const col=new THREE.Group(),hub=new THREE.Group();root.add(col);col.add(hub);
    // Pitch turns the column at its floor attachment; roll turns only the wheel.
    // Shorten the post with the lowered wheel so neither blocks the flight display.
    const base=new THREE.Vector3().fromArray(column.userData.columnPivot);
    col.position.copy(base);hub.position.copy(pivot).sub(base);hub.position.y-=yokeDrop;
    source.position.sub(pivot);source.removeFromParent();hub.add(source);
    const post=new THREE.Group();post.scale.y=(.758-yokeDrop)/.758;col.add(post);
    column.position.sub(base);column.removeFromParent();post.add(column);
    c.yokes.push({col,hub});
  }
  // EFIS range/mode detents remain readable and move with their selected settings.
  for(const knobs of Object.values(c.efisKnobs))for(const knob of knobs){root.add(knob);knob.visible=true;}
  for(const [i,side] of [1,-1].entries()){
    c.efisKnobs.mode[i].position.copy(point(side*.20,2.042,1.43));
    c.efisKnobs.range[i].position.copy(point(side*.24,2.042,1.43));
  }
  const anchor=(name,x,y,z)=>c.anchors[name]=point(x,y,z);
  c.anchors.pfd=pfd.position.clone();c.anchors.nd=c.ndScreen.position.clone();
  anchor('upper',.0063,1.8783,1.4555);c.anchors.lower=lower.position.clone();
  anchor('airspeed',.362,1.8788,1.4555);anchor('altimeter',.282,1.8788,1.4555);anchor('attitude',.322,1.89,1.4555);
  anchor('gear',-.081,1.844,1.42);anchor('flapGauge',-.088,1.99,1.435);
  anchor('mcp',.02,2.06,1.43);anchor('windshield',.30,2.17,1.41);
  anchor('yoke',.30,1.98-yokeDrop/1.7,1.25);anchor('rudder',.30,1.50,1.37);
  anchor('throttle',.012,1.85,1.19);anchor('speedbrake',.071,1.84,1.32);
  anchor('flapLever',-.050,1.85,1.31);anchor('trim',.08,1.744,1.244);
  c.modelLoaded=true;
}
