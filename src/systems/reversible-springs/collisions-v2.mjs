/** Springs V2 position-selected, equal-mass contact exchange.
 * Mutual nearest neighbors depend only on positions. Swapping entire
 * integer momenta is an exact involution (not a normal-only hard sphere).
 */
import {stepFlock} from './flock-cpu.mjs';
import {stepDynamicV2} from './dynamic-force-v2.mjs';
import {stepBondedV2} from './bonded-force-v2.mjs';
import {stepLinearV2} from './linear-gravity-v2.mjs';
import {stepNormalizedFlockV2} from './flock-density-v2.mjs';

export function contactPartners(state,graph,radius=graph.collisionRadius??0){
 const {count,precision}=graph;
 if(count<1||!Number.isInteger(radius)||radius<0||radius>512||
    (radius>0&&count>512))
  throw Error('Invalid V2 contact configuration');
 const ids=new Int32Array(count).fill(-1),r2=radius*radius;
 if(radius===0)return ids;
 for(let i=0;i<count;i++){
  const a=8*i;let best=r2+1;
  for(let j=0;j<count;j++){
   if(i===j)continue;
   const b=8*j;
   const dx=Math.trunc((state[b]-state[a])/precision);
   const dy=Math.trunc((state[b+1]-state[a+1])/precision);
   const dz=Math.trunc((state[b+2]-state[a+2])/precision);
   const ds=dx*dx+dy*dy+dz*dz;
   if(ds<=r2&&ds<best){best=ds;ids[i]=j;}
  }
 }
 return ids;
}
export function contactPairs(state,graph,radius=graph.collisionRadius??0){
 const nearest=contactPartners(state,graph,radius),pairs=[];
 for(let i=0;i<nearest.length;i++){
  const j=nearest[i];
  if(j>i&&nearest[j]===i&&[4,5,6].some(a=>state[8*i+a]!==state[8*j+a]))
   pairs.push([i,j]);
 }
 return pairs;
}
export function collisionExchange(state,graph,radius=graph.collisionRadius??0){
 const out=state.slice(),pairs=contactPairs(state,graph,radius);
 for(const [i,j] of pairs)for(let a=4;a<7;a++){
  out[8*i+a]=state[8*j+a];
  out[8*j+a]=state[8*i+a];
 }
 return {state:out,pairs};
}
export function stepFlockV2(state,hidden,graph,{reverse=false}={}){
 if(reverse){
  const exchanged=collisionExchange(state,graph);
  return graph.mode==='straight'?
   stepLinearV2(exchanged.state,hidden,graph,{reverse:true}):
   graph.mode==='dynamic'?
   stepDynamicV2(exchanged.state,hidden,graph,{reverse:true}):
   graph.mode==='bonded'?
   stepBondedV2(exchanged.state,hidden,graph,{reverse:true}):
   stepNormalizedFlockV2(exchanged.state,hidden,graph,{reverse:true});
 }
 const moved=graph.mode==='straight'?stepLinearV2(state,hidden,graph):
  graph.mode==='dynamic'?stepDynamicV2(state,hidden,graph):
  graph.mode==='bonded'?stepBondedV2(state,hidden,graph):
  stepNormalizedFlockV2(state,hidden,graph);
 return {state:collisionExchange(moved.state,graph).state,hidden:moved.hidden};
}
