import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bakeWindowLight} from '../js/cockpit/window-light.js';

function sample(translate,rotate=0){
  const root=new THREE.Group();root.position.fromArray(translate);root.rotation.y=rotate;
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(.3,.3,2,2),new THREE.MeshStandardMaterial());
  const window=new THREE.RectAreaLight(0xffffff,1,.6,.4);
  window.position.set(.2,.1,.7);window.lookAt(0,0,0);root.add(panel,window);
  bakeWindowLight(root,[window],{value:1});
  return [...panel.geometry.attributes.windowIrradiance.array];
}
const original=sample([0,0,0]),moved=sample([250,30,-1500],1.2);
for(let i=0;i<original.length;i++){
  assert.ok(Number.isFinite(original[i]));
  assert.ok(Math.abs(original[i]-moved[i])<1e-6,'Window lighting is invariant under airframe translation and rotation');
  if(i%2===0)assert.ok(original[i]>.05&&original[i]<Math.PI,'The face toward the window is illuminated');
  else assert.equal(original[i],0,'The back face is not lit through the panel');
}
console.log('Window lighting: translated/rotated cabin, finite irradiance and separate face directions passed');
