/** Springs V2 soft dynamic contact force. CPU reference for flock-v2.wgsl.
 * Each pair uses an integer Q14 (1/16384) radial coefficient, tapered to
 * zero at the outer cutoff. Every pair is updated with equal-opposite force.
 * No floating point, damping, timestep, stored history or noninvertible
 * averaging appears in the state update.
 */
import {forces as legacyForces,stage as legacyStage,scaledRestSquared} from './springs-cpu.mjs';
import {reflectiveDrift} from './flock-cpu.mjs';
export const DYNAMIC_FORCE_Q=16384;
const trunc=Math.trunc;
export function smoothDynamicScalar(distance2,rest2,cutoff2,stiffness){
 if(stiffness===0||distance2>cutoff2||rest2<=0)return 0;
 // Compact support, with full strength at/below rest and a linear taper to 0
 // exactly at cutoff. All divisions truncate toward zero, including negatives.
 const radial=Math.max(-rest2,Math.min(rest2,distance2-rest2));
 const fade=cutoff2>rest2?
  Math.min(256,trunc((cutoff2-distance2)*256/(cutoff2-rest2))):256;
 const raw=trunc(radial*stiffness*fade/(4*rest2));
 // Rational gain compression keeps the high end tunable without the
 // explosive linear response of all-pairs contacts. At strength 64 the
 // effective gain is 12.8, not 64; low values remain sensitive.
 const softened=trunc(raw*16/(16+stiffness));
 return Math.max(-2048,Math.min(2048,softened));
}
export function dynamicForcesV2(state,graph){
 if(graph.dynamicForceModel==='legacy')return legacyForces(state,graph);
 const {count,precision,cutoff,restLength,restScale256=256,stiffness}=graph;
 const rest2=scaledRestSquared(restLength*restLength,restScale256);
 const cutoff2=cutoff*cutoff;
 const out=new Int32Array(count*3);
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
  const a=i*8,b=j*8;
  const d0=state[b]-state[a],d1=state[b+1]-state[a+1],d2=state[b+2]-state[a+2];
  const x=trunc(d0/precision),y=trunc(d1/precision),z=trunc(d2/precision);
  const r2=x*x+y*y+z*z;
  if(r2>cutoff2)continue;
  const k=smoothDynamicScalar(r2,rest2,cutoff2,stiffness);
  if(k===0)continue;
  for(let axis=0;axis<3;axis++){
   const d=axis===0?d0:axis===1?d1:d2;
   const impulse=trunc(k*d/DYNAMIC_FORCE_Q);
   out[i*3+axis]+=impulse;
   out[j*3+axis]-=impulse;
  }
 }
 return out;
}
export function dynamicKickV2(state,graph,{reverse=false}={}){
 if(graph.dynamicForceModel==='legacy')
  return legacyStage(state,graph,reverse?'unkick':'kick');
 const out=state.slice(),force=dynamicForcesV2(state,graph),sign=reverse?-1:1;
 for(let i=0;i<graph.count;i++)for(let axis=0;axis<3;axis++)
  out[i*8+4+axis]+=sign*force[i*3+axis];
 return out;
}
export function stepDynamicV2(state,hidden,graph,{reverse=false}={}){
 if(reverse){
  const undrift=reflectiveDrift(state,graph,{reverse:true});
  return {state:dynamicKickV2(undrift,graph,{reverse:true}),hidden:hidden.slice()};
 }
 const kicked=dynamicKickV2(state,graph);
 return {state:reflectiveDrift(kicked,graph),hidden:hidden.slice()};
}
