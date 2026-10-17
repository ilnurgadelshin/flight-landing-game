// Six original density fields fit a 160 × 80 × 240 WebGL2 texture. Every axis
// stays below WebGL2's minimum 256-texel 3D-texture limit; variants have empty borders.
export const CUMULUS_SIZE=80;
export const CUMULUS_VARIANTS=6;
export const CUMULUS_GRID=[2,1,3];
export const CUMULUS_DIMENSIONS=CUMULUS_GRID.map(n=>n*CUMULUS_SIZE);
export const CUMULUS_BYTES=CUMULUS_DIMENSIONS.reduce((a,b)=>a*b,1);
