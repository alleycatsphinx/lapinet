/** Uniform -Y momentum kick, inverse-safe and restricted to V2 Linear.
 * This remains a position-independent triangular map: reversible even with
 * integer coordinate drift, reflective walls, and momentum-exchange contact.
 */
import {reflectiveDrift} from './flock-cpu.mjs';
export const GRAVITY_DENOM=8;
export function linearGravityKick(state,graph,{reverse=false}={}){
 const g=graph.gravity??0;
 if(!Number.isInteger(g)||g<0||g>64)throw Error('Invalid linear gravity');
 const out=state.slice(),dp=g*graph.precision*GRAVITY_DENOM*(reverse?1:-1);
 for(let i=0;i<graph.count;i++)out[i*8+5]+=dp;
 return out;
}
export function stepLinearV2(state,hidden,graph,{reverse=false}={}){
 if(reverse){
  const undrift=reflectiveDrift(state,graph,{reverse:true});
  return {state:linearGravityKick(undrift,graph,{reverse:true}),hidden:hidden.slice()};
 }
 const kicked=linearGravityKick(state,graph);
 return {state:reflectiveDrift(kicked,graph),hidden:hidden.slice()};
}
