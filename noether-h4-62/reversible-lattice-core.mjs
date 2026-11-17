/** Local reversible-lattice teaching fixture. No large-simulation files are imported or published. */
import {
 E8_ROOT_STEPS,E8_STRIDE,packE8,unpackE8,stepE8,scatterPairE8,
 e8Dot,e8Norm,e8RootReflection,equivariantGatePhaseE8,physical4E8,
 toIcosianNumerator
} from './icosian-e8.mjs';
import {
 autonomousFrameE8,interactionControlE8,scheduleExactSiteInteractionsE8
} from '../helios-determinism/helios-e8-autonomous.mjs';

export const DEMO_IDS=Uint32Array.of(17,43);
export const DEMO_SITE=Object.freeze([2048,2037,2019,2027,2051,2011,2039,2063]);
export const DEMO_COLLISION_FRAME=24;
const key=coords=>coords.join(',');
export const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
/** Two explicitly named maps from exact E8 integer sites to display R3.
 * "orthogonal" chooses three orthonormal coordinates in the ambient E8
 * Euclidean embedding. "golden" drops one real H4 quaternion component.
 * Neither map is injective and neither is simulation-authoritative.
 */
function project(k,anchor=DEMO_SITE,mode='golden'){
 if(mode==='orthogonal'){
   const difference=k.map((value,i)=>value-anchor[i]);
   const z=toIcosianNumerator(difference);
   return [z[0],z[2],z[4]].map(x=>x/Math.SQRT2);
 }
 if(mode==='golden'){
   const q=physical4E8(k), c=physical4E8(anchor);
   return [q[1]-c[1],q[2]-c[2],q[3]-c[3]];
 }
 throw Error('Unknown display projection: '+mode);
}
export const projectTo3D=project;
export function gateFor(p,frame,seed=17,threshold=3072){
 const phase=equivariantGatePhaseE8(p.coords,p.ch,frame,seed);
 return {phase,threshold,moves:phase<threshold,frame,channel:p.ch};
}
function projectRoot(ch,mode='golden'){
 const v=E8_ROOT_STEPS[ch];
 return project(v,[0,0,0,0,0,0,0,0],mode);
}
function len(v){return Math.hypot(...v);}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
const RAD=180/Math.PI;
function unit(v){
 const l=len(v);
 return l>1e-9?v.map(x=>x/l):null;
}
function headingsFromRoot(ch){
 const v=projectRoot(ch,'golden'),l=len(v);
 if(l<.42)return null;
 return Object.freeze({
   azimuth:(Math.atan2(v[2],v[0])*RAD+360)%360,
   elevation:Math.asin(Math.max(-1,Math.min(1,v[1]/l)))*RAD,
   unit:Object.freeze(v.map(x=>x/l))
 });
}
const rootHeadings=Array.from({length:240},(_,i)=>headingsFromRoot(i));
function unitFromAngles({azimuth,elevation}){
 if(!Number.isFinite(azimuth)||!Number.isFinite(elevation)
   ||azimuth<0||azimuth>=360||elevation<-90||elevation>90)
   throw Error('Incoming angles require azimuth [0,360), elevation [-90,90]');
 const a=azimuth/RAD,e=elevation/RAD;
 return [Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)];
}
function angularError(wanted,actual){
 return Math.acos(Math.max(-1,Math.min(1,dot(wanted,actual))))*RAD;
}
const candidateCache=new Map();
function collisionCandidates(frame,site){
 const control=interactionControlE8(site,DEMO_IDS[0],DEMO_IDS[1],frame);
 const cacheKey=frame+'@'+key(site);
 const cached=candidateCache.get(cacheKey);
 if(cached)return cached;
 const candidates=[];
 let defaultBest=null;
 for(let a=0;a<240;a++)for(let b=a+1;b<240;b++){
   if(b===(a^1))continue;
   const result=scatterPairE8(a,b,control);
   if(!result.changed)continue;
   if([a,b].includes(result.a)||[a,b].includes(result.b))continue;
   const pa=projectRoot(a),pb=projectRoot(b);
   const qa=projectRoot(result.a),qb=projectRoot(result.b);
   if(Math.min(len(pa),len(pb),len(qa),len(qb))<.42)continue;
   const angleChange=(1-dot(pa,qa)/(len(pa)*len(qa)))+
     (1-dot(pb,qb)/(len(pb)*len(qb)));
   const separation=1-Math.abs(dot(qa,qb)/(len(qa)*len(qb)));
   const score=angleChange+separation;
   const base={a,b,control,outA:result.a,outB:result.b,score};
   candidates.push(Object.freeze(base));
   candidates.push(Object.freeze({
     a:b,b:a,control,outA:result.b,outB:result.a,score
   }));
   if(score>(defaultBest?.score??-1))defaultBest=base;
 }
 if(!defaultBest)throw Error('No nontrivial projected collision available');
 const data={candidates,defaultBest};
 candidateCache.set(cacheKey,data);
 return data;
}
/** Independent requested 3D headings are snapped to the nearest feasible
 * ordered E8 root pair. Pair momentum eligibility and the real E8 reflection
 * remain authoritative; display angles do not affect the E8 rules.
 * A pair must be chosen jointly, not as two independent continuous vectors.
 */
export function chooseCollisionChannels(
 frame=DEMO_COLLISION_FRAME,site=DEMO_SITE,incomingAngles=null
){
 const {candidates,defaultBest}=collisionCandidates(frame,site);
 let best=defaultBest,requested=null;
 if(incomingAngles!==null&&incomingAngles!==undefined){
   if(!Array.isArray(incomingAngles)||incomingAngles.length!==2)
     throw Error('Require two desired incoming headings');
   requested=incomingAngles.map(a=>({
     azimuth:a.azimuth,elevation:a.elevation
   }));
   const v=requested.map(unitFromAngles);
   let bestCost=Infinity;
   for(const c of candidates){
     const h1=rootHeadings[c.a],h2=rootHeadings[c.b];
     if(!h1||!h2)continue;
     const err1=angularError(v[0],h1.unit);
     const err2=angularError(v[1],h2.unit);
     const cost=err1*err1+err2*err2;
     if(cost<bestCost-1e-9){
       best=c;bestCost=cost;
     }
   }
 }
 const realized=[rootHeadings[best.a],rootHeadings[best.b]]
   .map(h=>({azimuth:h.azimuth,elevation:h.elevation}));
 const errors=requested?requested.map((r,i)=>
   angularError(unitFromAngles(r),rootHeadings[i===0?best.a:best.b].unit)
 ):[0,0];
 return Object.freeze({...best,
   realized,requested,errors,candidateCount:candidates.length,
   // score is a display-only aesthetic metric, not collision energy.
 });
}
export function wordsForPair(channels,site=DEMO_SITE){
 return Uint32Array.from([
   ...packE8(site,channels.a),...packE8(site,channels.b)
 ]);
}
export function unpackRecords(words,ids=DEMO_IDS){
 return Array.from(ids,(id,i)=>({id,
   ...unpackE8(words,i),
   projection:project(unpackE8(words,i).coords)
 }));
}
function collideAtSite(words,ids,frame){
 const out=words.slice();
 const schedule=scheduleExactSiteInteractionsE8(words,ids,frame);
 const changes=[];
 for(const e of schedule){
  const i=e.recordA*4+3,j=e.recordB*4+3;
  const before=[out[i],out[j]];
  const s=scatterPairE8(before[0],before[1],e.control);
  out[i]=s.a;out[j]=s.b;
  changes.push({frame,stableA:e.stableA,stableB:e.stableB,
   site:e.coords,control:e.control,eligible:s.eligible,
   changed:s.changed,before,after:[s.a,s.b]});
 }
 return {words:out,changes};
}
/** Two authentic interacting particles. Reconstruct earlier states with the
 * actual inverse automaton, then execute the real forward C_n then T_n maps.
 * No illustrative trajectory is invented.
 */
export function buildTimeline({start=18,end=36,seed=17,threshold=3072,incomingAngles=null}={}){
 if(!Number.isInteger(start)||start<0||start>DEMO_COLLISION_FRAME
    ||!Number.isInteger(end)||end<=DEMO_COLLISION_FRAME||end>128)
   throw Error('Invalid demo window');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff
    ||!Number.isInteger(threshold)||threshold<0||threshold>4096)
   throw Error('Invalid schedule settings');
 const selected=chooseCollisionChannels(DEMO_COLLISION_FRAME,DEMO_SITE,incomingAngles);
 let words=wordsForPair(selected);
 for(let n=DEMO_COLLISION_FRAME-1;n>=start;n--)
   words=autonomousFrameE8(words,DEMO_IDS,n,
       {reverse:true,seed,threshold}).words;
 const initial=words.slice(),stages=[],frames=[];
 const push=(frame,phase,src,changes=[])=>{
   stages.push({frame,phase,words:src.slice(),
     records:unpackRecords(src),changes});
 };
 for(let n=start;n<end;n++){
   const before=words.slice();
   const collision=collideAtSite(before,DEMO_IDS,n);
   const result=autonomousFrameE8(before,DEMO_IDS,n,{seed,threshold});
   const manual=collision.words.slice();
   for(let i=0;i<DEMO_IDS.length;i++){
     const p=unpackE8(manual,i);
     const next=stepE8(p,n,{seed,threshold});
     manual.set(packE8(next.coords,next.ch),4*i);
   }
   if(!eq(manual,result.words))
     throw Error('Manual C+T differs from canonical autonomous frame '+n);
   const changes=collision.changes.filter(c=>c.changed);
   push(n,'before',before,changes);
   push(n,'collision',collision.words,changes);
   push(n,'stream',result.words,changes);
   frames.push({frame:n,before,afterCollision:collision.words,
     afterStream:result.words,changes});
   words=result.words;
 }
 return {mode:'pair',ids:DEMO_IDS,initial,final:words,frames,stages,
   start,end,seed,threshold,selected,
   collisionCount:frames.reduce((a,f)=>a+f.changes.length,0)};
}
export function verifyTimeline(timeline){
 const {frames,initial,final,seed,threshold}=timeline;
 let state=final.slice();
 let checked=0;
 for(let i=frames.length-1;i>=0;i--){
   const f=frames[i];
   const reverse=autonomousFrameE8(state,DEMO_IDS,f.frame,
     {reverse:true,seed,threshold});
   if(!eq(reverse.words,f.before))
     return {ok:false,frame:f.frame,reason:'inverse mismatch',checked};
   state=reverse.words;checked++;
 }
 return {ok:eq(state,initial),checked,
   words:initial.length,frames:frames.length,
   phaseCertificate:frames.every(f=>eq(
    f.afterStream,autonomousFrameE8(f.before,DEMO_IDS,f.frame,
       {seed,threshold}).words))};
}
const addMod=(a,b)=>a.map((v,i)=>(v+b[i])&4095);
export function localLattice(timeline,{depth=2,maxNodes=900,projection='golden'}={}){
 if(!Number.isInteger(depth)||depth<1||depth>3)throw Error('depth 1..3');
 const used=new Set(),channels=[];
 const addChannel=c=>{
   const v=projectRoot(c,projection),l=len(v);
   if(l<0.4)return;
   if(channels.some(k=>{
     const w=projectRoot(k,projection);
     return Math.abs(dot(v,w)/(l*len(w)))>0.985;
   }))return;
   channels.push(c);
   used.add(c);
 };
 for(const f of timeline.frames)for(let i=0;i<Math.min(f.before.length/4,8);i++){
   addChannel(unpackE8(f.before,i).ch);
   addChannel(unpackE8(f.afterCollision,i).ch);
 }
 for(let c=0;c<240&&channels.length<9;c+=3)addChannel(c);
 const nodes=new Map(),edges=new Map(),todo=[];
 function touch(k,level){
   const kk=key(k);
   if(nodes.has(kk))return nodes.get(kk);
   if(nodes.size>=maxNodes)return null;
   const node={key:kk,coords:k,point:project(k,DEMO_SITE,projection),level};
   nodes.set(kk,node);todo.push(node);return node;
 }
 touch([...DEMO_SITE],0);
 for(let h=0;h<todo.length;h++){
   const node=todo[h];
   if(node.level>=depth)continue;
   for(const ch of channels){
     for(const sign of [-1,1]){
       const step=E8_ROOT_STEPS[ch].map(v=>v*sign);
       const other=touch(addMod(node.coords,step),node.level+1);
       if(!other)continue;
       const pair=[node.key,other.key].sort();
       const k=pair.join('|');
       if(!edges.has(k))edges.set(k,{a:pair[0],b:pair[1],channel:ch});
     }
   }
 }
 // All trajectory states also get their real eight-coordinate site.
 for(const stage of timeline.stages)for(const p of stage.records)
   touch(p.coords,depth);
 const points=[...nodes.values()];
 return {points,edges:[...edges.values()],
   channels,nodeCount:points.length,edgeCount:edges.size};
}
/** The Gosset 4_21 E8 root polytope, centered on the collision site.
 * Its vertices are the 240 exact E8 roots; 6720 hull edges join root
 * pairs with E8 inner product 1 (each of the 240 vertices has degree 56).
 * The center is an interior lattice site, not a 241st polytope vertex.
 * Radial segments are exact permitted one-hop motions, NOT hull edges.
 */
export function e8RootPolytope({anchor=DEMO_SITE,projection='orthogonal'}={}){
 const center=Array.from(anchor),points=[{
   key:key(center),coords:center,point:project(center,center,projection),
   role:'center',level:0
 }];
 const rootKeys=[];
 for(let channel=0;channel<240;channel++){
   const coords=addMod(center,E8_ROOT_STEPS[channel]);
   const siteKey=key(coords);
   rootKeys.push(siteKey);
   points.push({key:siteKey,coords,
     point:project(coords,center,projection),
     channel,role:'root',level:1});
 }
 const edges=[];
 for(let a=0;a<240;a++){
   for(let b=a+1;b<240;b++){
     if(e8Dot(E8_ROOT_STEPS[a],E8_ROOT_STEPS[b])===1)
       edges.push({a:rootKeys[a],b:rootKeys[b],kind:'polytope'});
   }
 }
 const radial=Array.from({length:240},(_,i)=>({
   a:key(center),b:rootKeys[i],kind:'root-step',channel:i
 }));
 if(edges.length!==6720)throw Error('E8 root polytope adjacency count invalid');
 return {
   kind:'root-polytope',points,edges:[...edges,...radial],
   rootCount:240,hullEdgeCount:6720,radialCount:240,
   nodeCount:points.length,edgeCount:edges.length+radial.length
 };
}
/** Algebraic precondition checks: T^-1 is same gate+inverse root; C is
 * disjoint fixed-state pair reflection; validate all exercised microstages.
 */
export function validateAlgebra({seed=17,threshold=3072,full=true}={}){
 let transports=0,reflections=0;
 const k=[37,53,71,89,107,127,149,173];
 for(let ch=0;ch<240;ch++){
   const p={coords:k,ch};
   for(const n of [0,1,17,24,1023,4095]){
     const moved=stepE8(p,n,{seed,threshold});
     const undone=stepE8(moved,n,{reverse:true,seed,threshold});
     if(!eq(undone.coords,k)||undone.ch!==ch)
       throw Error('Transport inverse failed '+ch+','+n);
     if(gateFor(p,n,seed,threshold).phase!==
         gateFor(moved,n,seed,threshold).phase)
       throw Error('Gate changed under accepted root translation');
     transports++;
   }
 }
 const controls=full?Array.from({length:240},(_,i)=>i):
   [0,1,17,39,143,239];
 for(const control of controls){
   const reflected=new Uint16Array(240);
   for(let ch=0;ch<240;ch++){
     const mapped=e8RootReflection(ch,control);
     if(e8Norm(E8_ROOT_STEPS[mapped])!==e8Norm(E8_ROOT_STEPS[ch]))
       throw Error('E8 reflection norm failed');
     reflected[ch]=mapped;
   }
   for(let ch=0;ch<240;ch++){
     if(reflected[reflected[ch]]!==ch)
       throw Error('Root reflection involution failed '+control+','+ch);
     reflections++;
   }
 }
 return {transports,reflections};
}
