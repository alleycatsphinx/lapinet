/** V2 fixtures, including 1/96 precision and the 512-particle sphere.
 * The 11-cell source sphere has 515 sites. Remove its center and the pair
 * of polar sites at opposite ±Y, maintaining inversion symmetry.
 */
import {createLatticeFixture,createSphereFixture,validateGraph} from './springs-cpu.mjs';
function cappedSphere512(source){
 if(source.graph.count!==515)throw Error('Expected 515-source-site sphere');
 const {graph,state}=source,q=graph.precision;
 const midpoint=Math.floor(graph.count/2);
 const center=Array.from({length:graph.count},(_,i)=>i).reduce((best,i)=>{
  const n=i*8,a=best*8;
  return state[n]**2+state[n+1]**2+state[n+2]**2<
   state[a]**2+state[a+1]**2+state[a+2]**2?i:best;
 },midpoint);
 let max=-1,min=-1;
 for(let i=0;i<graph.count;i++){
  if(i===center)continue;
  if(max<0||state[i*8+1]>state[max*8+1])max=i;
  if(min<0||state[i*8+1]<state[min*8+1])min=i;
 }
 const removed=new Set([center,max,min]);
 if(removed.size!==3)throw Error('Expected three distinct trimmed sites');
 const keep=Array.from({length:graph.count},(_,i)=>i).filter(i=>!removed.has(i));
 const remap=new Int32Array(graph.count).fill(-1);
 keep.forEach((old,i)=>remap[old]=i);
 const reduced=new Int32Array(keep.length*8),offsets=new Uint32Array(keep.length+1);
 const indices=[],rest=[];
 for(let i=0;i<keep.length;i++){
  const old=keep[i];reduced.set(state.subarray(old*8,old*8+8),i*8);
  for(let e=graph.offsets[old];e<graph.offsets[old+1];e++){
   const j=remap[graph.indices[e]];
   if(j<0)continue;
   indices.push(j);
   for(let a=0;a<4;a++)rest.push(graph.rests[e*4+a]);
  }
  offsets[i+1]=indices.length;
 }
 const reducedGraph={...graph,count:keep.length,offsets,
  indices:new Uint32Array(indices),rests:new Int32Array(rest)};
 validateGraph(reducedGraph);
 return {state:reduced,graph:reducedGraph};
}
export function createFixtureV2(config){
 const {shape='lattice',mode='bonded',precision=32}=config;
 const baseConfig={...config,mode:mode==='straight'?'bonded':
  mode==='flock'?'dynamic':mode,precision:precision===96?32:precision};
 const capped=shape==='sphere'&&config.side===11&&
  (['dynamic','flock','straight'].includes(mode)||config.collisions);
 let fixture;
 if(capped){
  fixture=cappedSphere512(createSphereFixture({...baseConfig,mode:'bonded'}));
  fixture.graph.mode=baseConfig.mode;
 }else{
  fixture=shape==='sphere'?createSphereFixture(baseConfig):createLatticeFixture(baseConfig);
 }
 if(precision===96){
  for(let p=0;p<fixture.state.length;p+=8)
   for(let axis=0;axis<3;axis++)fixture.state[p+axis]*=3;
  for(let e=0;e<fixture.graph.rests.length;e+=4)
   for(let axis=0;axis<3;axis++)fixture.graph.rests[e+axis]*=3;
  fixture.graph.precision=96;
 }
 return fixture;
}
