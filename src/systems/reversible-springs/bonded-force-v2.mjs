/** V2 smooth bonded spring reference: reversible pair-central Q14 kick.
 * The force is position-only and every directed bond has its opposite.
 * No velocity damping, non-invertible clamp, or loss of integer state.
 */
import {forces as legacyForces,stage as legacyStage,scaledRestSquared} from './springs-cpu.mjs';
import {reflectiveDrift} from './flock-cpu.mjs';
const trunc=Math.trunc;
export const BONDED_Q=16384;
export function smoothBondedScalar(distance2,rest2,stiffness){
 if(stiffness===0||rest2<=0)return 0;
 // Bound large deformations; scale strength before rounding the impulse.
 // ratio is Q8; all intermediates fit in i32 for supported demo fixtures.
 const radial=Math.max(-rest2,Math.min(rest2,distance2-rest2));
 const ratio=trunc(radial*256/rest2);
 const raw=trunc(ratio*stiffness/4);
 const softened=trunc(raw*16/(16+stiffness));
 return Math.max(-2048,Math.min(2048,softened));
}
export function bondedForcesV2(state,graph){
 if(graph.bondedForceModel==='legacy')return legacyForces(state,graph);
 const {count,offsets,indices,rests,precision,stiffness,restScale256=256}=graph;
 const out=new Int32Array(count*3);
 for(let i=0;i<count;i++)for(let e=offsets[i];e<offsets[i+1];e++){
  const a=i*8,b=indices[e]*8,base=e*4;
  const dx=state[b]-state[a],dy=state[b+1]-state[a+1],dz=state[b+2]-state[a+2];
  const x=trunc(dx/precision),y=trunc(dy/precision),z=trunc(dz/precision);
  const rx=trunc(rests[base]/precision),ry=trunc(rests[base+1]/precision),
   rz=trunc(rests[base+2]/precision);
  const rest2=scaledRestSquared(rx*rx+ry*ry+rz*rz,restScale256);
  const coeff=smoothBondedScalar(x*x+y*y+z*z,rest2,stiffness);
  for(let axis=0;axis<3;axis++){
   const d=axis===0?dx:axis===1?dy:dz;
   out[i*3+axis]+=trunc(coeff*d/BONDED_Q);
  }
 }
 return out;
}
export function bondedKickV2(state,graph,{reverse=false}={}){
 if(graph.bondedForceModel==='legacy')
  return legacyStage(state,graph,reverse?'unkick':'kick');
 const out=state.slice(),f=bondedForcesV2(state,graph),sign=reverse?-1:1;
 for(let i=0;i<graph.count;i++)for(let axis=0;axis<3;axis++)
  out[i*8+4+axis]+=sign*f[i*3+axis];
 return out;
}
export function stepBondedV2(state,hidden,graph,{reverse=false}={}){
 if(reverse){
  const undrift=reflectiveDrift(state,graph,{reverse:true});
  return {state:bondedKickV2(undrift,graph,{reverse:true}),hidden:hidden.slice()};
 }
 const kicked=bondedKickV2(state,graph);
 return {state:reflectiveDrift(kicked,graph),hidden:hidden.slice()};
}
