import * as THREE from 'three';

// The phone asset omits source text objects. Restore the forward labels from
// their original shapes and placement; a failed download keeps the existing deck.
export async function loadForwardLabels(model,loader){
  try{
    const {scene}=await loader.loadAsync(new URL('../../assets/models/737-forward-labels.glb',import.meta.url).href);
    const labels=scene.children.filter(n=>n.isMesh);
    if(!labels.length)throw new Error('Empty forward-label asset');
    prepareCoverage(scene);
    for(const label of labels)label.material.depthWrite=false;
    model.add(scene);
    model.userData.forwardLabels={glyphs:scene.userData.glyphs,patches:scene.userData.patches,triangles:labels.reduce((s,m)=>s+m.geometry.index.count/3,0),atlas:[scene.userData.width,scene.userData.height]};
    return scene;
  }catch(error){model.userData.forwardLabels={error:String(error)};console.warn('Forward lettering unavailable; keeping source model.',error);}
}

// Coverage needs one linear channel, not an RGBA colour texture. Share it across
// the four materials and release the temporary canvas/decoded image immediately.
function prepareCoverage(scene){
  const materials=new Set(scene.children.filter(n=>n.isMesh).map(n=>n.material));
  const old=[...materials][0].map,image=old.image,canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height;
  let texture;
  try{
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8Array(canvas.width*canvas.height);
    for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
    texture=new THREE.DataTexture(alpha,canvas.width,canvas.height,THREE.RedFormat);
    // glTF UVs address image rows top to bottom; DataTexture does not flip them.
    texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
  }finally{canvas.width=canvas.height=1;}
  for(const material of materials)material.map=texture;
  old.dispose();image.close?.();
}

export function filterForwardLabels(scene){
  if(!scene)return;
  for(const material of new Set(scene.children.filter(n=>n.isMesh).map(n=>n.material))){
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','diffuseColor.a *= texture2D(map,vMapUv).r;');
    };
    material.customProgramCacheKey=()=>key+'|filtered-forward-labels-v1';material.needsUpdate=true;
  }
}
