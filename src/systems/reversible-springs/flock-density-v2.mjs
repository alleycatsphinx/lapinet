/** Springs V2: population-normalized reversible flock shears and kicks.
 * Every pair contributes equal/opposite integer impulse. The divisor scales
 * with population, so increasing the preset from 160 to 512 particles does
 * not multiply every particle's response by its number of neighbors.
 *
 * The normalization is a constant for each fixture, never computed from
 * velocities, history, or the direction of time. Thus each positional kick
 * and each triangular visible/hidden momentum shear is exactly invertible.
 * Original flock-cpu.mjs and original Springs are unchanged.
 */
import {stage as springStage} from './springs-cpu.mjs';
import {flockPairs,reflectiveDrift} from './flock-cpu.mjs';
const trunc=Math.trunc;
export function flockInteractionDivisor(graph){
 return Math.max(1,Math.ceil(graph.count/16));
}
function pairShear(state,hidden,graph,kind,sign){
 const pairs=flockPairs(state,graph),p=state.slice(),h=hidden.slice();
 const divisor=256*flockInteractionDivisor(graph),strength=
  kind==='hidden'?(graph.alignment??0):(graph.coupling??0);
 const deltas=new Int32Array(graph.count*3);
 if(strength){
  for(let n=0;n<pairs.length;n+=2){
   const i=pairs[n],j=pairs[n+1],ia=i*8+4,ja=j*8+4,ih=i*4,jh=j*4;
   for(let axis=0;axis<3;axis++){
    const a=kind==='hidden'?state[ia+axis]:hidden[ih+axis];
    const b=kind==='hidden'?state[ja+axis]:hidden[jh+axis];
    const impulse=trunc((b-a)*strength/divisor);
    const signed=kind==='hidden'?impulse:-impulse;
    deltas[i*3+axis]+=signed;
    deltas[j*3+axis]-=signed;
   }
  }
 }
 for(let i=0;i<graph.count;i++)for(let axis=0;axis<3;axis++){
  if(kind==='hidden')h[i*4+axis]+=sign*deltas[i*3+axis];
  else p[i*8+4+axis]+=sign*deltas[i*3+axis];
 }
 return {state:p,hidden:h};
}
export function normalizedBoidKick(state,graph,{reverse=false}={}){
 const out=state.slice(),cohesion=graph.cohesion??0,
  separation=graph.separation??0;
 if(!(cohesion||separation))return out;
 const pairs=flockPairs(state,graph),delta=new Int32Array(graph.count*3);
 const denominator=256*flockInteractionDivisor(graph);
 const inner=trunc(graph.cutoff*2/3),r2=inner*inner,q=graph.precision;
 for(let n=0;n<pairs.length;n+=2){
  const i=pairs[n],j=pairs[n+1],a=i*8,b=j*8;
  const dx=trunc((state[b]-state[a])/q);
  const dy=trunc((state[b+1]-state[a+1])/q);
  const dz=trunc((state[b+2]-state[a+2])/q);
  const near=dx*dx+dy*dy+dz*dz<=r2;
  for(let axis=0;axis<3;axis++){
   const d=state[b+axis]-state[a+axis];
   const impulse=trunc(d*cohesion/denominator)-
    (near?trunc(d*separation/denominator):0);
   delta[i*3+axis]+=impulse;
   delta[j*3+axis]-=impulse;
  }
 }
 const sign=reverse?-1:1;
 for(let i=0;i<graph.count;i++)for(let axis=0;axis<3;axis++)
  out[i*8+4+axis]+=sign*delta[i*3+axis];
 return out;
}
export function stepNormalizedFlockV2(state,hidden,graph,{reverse=false}={}){
 if(reverse){
  const drift=reflectiveDrift(state,graph,{reverse:true});
  const spring=springStage(drift,graph,'unkick');
  const navigated=normalizedBoidKick(spring,graph,{reverse:true});
  const visible=pairShear(navigated,hidden,graph,'visible',-1);
  return pairShear(visible.state,visible.hidden,graph,'hidden',-1);
 }
 const phase=pairShear(state,hidden,graph,'hidden',1);
 const visible=pairShear(phase.state,phase.hidden,graph,'visible',1);
 const navigated=normalizedBoidKick(visible.state,graph);
 const kicked=springStage(navigated,graph,'kick');
 return {state:reflectiveDrift(kicked,graph),hidden:visible.hidden};
}
