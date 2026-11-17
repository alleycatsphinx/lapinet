// A small, inspectable atlas. E8 scenes call the actual Cycles icosian/E8
// transport and scattering functions. Springs/flock scenes are deliberately
// tiny integer-state teaching fixtures with explicitly derived inverse steps.
import {
 E8_ROOT_STEPS,e8Dot,e8Norm,physical4E8,PHI,stepE8,
 scatterPairE8,equivariantGatePhaseE8,packE8
} from '../icosian-e8.mjs';
import {
 DEMO_SITE,DEMO_COLLISION_FRAME,chooseCollisionChannels,projectTo3D
} from '../reversible-lattice-core.mjs';
import {scheduleExactSiteInteractionsE8,autonomousFrameE8} from '../../helios-determinism/helios-e8-autonomous.mjs';

export const C=Object.freeze({blue:'#2972ad',red:'#bd6854',gold:'#aa8746',
 green:'#3e776d',ink:'#445966',muted:'#c3ced1',faint:'#e0e5e1'});
const T=(title,explain,equation,scene={},readout='',certificate='')=>({
 title,explain,equation,scene:{nodes:[],edges:[],arrows:[],kind:'3D PROJECTION',...scene},
 readout:String(readout),certificate});
const node=(p,label,color=C.blue,size=7)=>({p:[...p],label,color,size});
const edge=(a,b,color=C.muted,width=1,alpha=.6)=>({a:[...a],b:[...b],color,width,alpha});
const arrow=(a,b,label='',color=C.blue,width=2)=>({a:[...a],b:[...b],label,color,width});
const close=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const sum=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(a,n)=>a.map(x=>x*n);
const trunc=Math.trunc;
const zero8=()=>Array(8).fill(0);
const r3=(k,mode='golden')=>projectTo3D(k,zero8(),mode);
const direction=(ch)=>r3(E8_ROOT_STEPS[ch]);
const format=k=>Array.from(k).join(', ');
const compact=k=>'['+format(k)+']';
function hypercube(d){
 const basis=[[1,0,0],[0,1,0],[0,0,1],[.53,.57,.43],
 [.64,-.32,.4],[-.42,.51,.36],[.4,.31,-.57],[-.3,-.46,-.48]];
 const count=2**d,points=[];
 for(let i=0;i<count;i++){
  const p=[0,0,0];for(let j=0;j<d;j++){
   const sign=(i&(1<<j))?1:-1;
   for(let k=0;k<3;k++)p[k]+=basis[j][k]*sign;
  }
  points.push(p.map(x=>x/Math.sqrt(Math.max(1,d/2))));
 }
 const edges=[];for(let i=0;i<count;i++)for(let j=0;j<d;j++){
  const k=i^(1<<j);if(i<k)edges.push(edge(points[i],points[k],j<3?C.muted:C.gold,d<5?1.4:.7,d<5?.8:.3));
 }
 return {nodes:points.map((p,i)=>node(p,(count<=16||i%Math.ceil(count/12)===0)?String(i):'',i%2?C.red:C.blue,d>=7?3.5:6)),
 edges,kind:d+'D CUBE → 3D SHADOW'};
}
function rootScene(count=240,mode='golden'){
 const len=Math.min(count,240),points=E8_ROOT_STEPS.slice(0,len).map(r=>r3(r,mode));
 const nodes=points.map((p,i)=>node(scale(p,2.2),(i%30===0?'r'+i:''),i<120?C.blue:C.red,len>200?3.5:4.7));
 const edges=[];
 for(let i=0;i<len;i++)for(let j=i+1;j<len;j++){
  if(e8Dot(E8_ROOT_STEPS[i],E8_ROOT_STEPS[j])===1&&
   (i*31+j*17)%9<2&&edges.length<340){
    edges.push(edge(scale(points[i],2.2),scale(points[j],2.2),
      i<120&&j<120?C.blue:C.muted,1,.22));
  }
 }
 return {nodes,edges,kind:mode==='golden'?'EXACT E8 ROOTS · GOLDEN R3':'EXACT E8 ROOTS · ORTHOGONAL R3'};
}
function principalLines(points,labels,colors){
 return {nodes:points.map((p,i)=>node(p,labels?.[i]??String(i),colors?.[i]??C.blue,8)),
 edges:points.slice(1).map((p,i)=>edge(points[i],p,C.gold,1.4,.58))};
}
function labelsAtSite(channels,positions=null){
 const pts=positions??channels.map(()=>[0,0,0]);
 const colors=[C.blue,C.red,C.green,C.gold];
 return {nodes:channels.map((ch,i)=>node(pts[i],'id '+([17,43,71,101][i]),colors[i],8)),
 arrows:channels.map((ch,i)=>arrow(pts[i],sum(pts[i],scale(direction(ch),1.9)),
  'c'+ch,colors[i],3)),kind:'EXACT ROOT CHANNELS · DISPLAY R3'};
}
function twoBodyCollision(){
 const choice=chooseCollisionChannels(DEMO_COLLISION_FRAME,DEMO_SITE);
 const bounced=scatterPairE8(choice.a,choice.b,choice.control);
 if(!bounced.changed||!bounced.eligible)
  throw Error('The demonstrated E8 collision must be an authentic nontrivial scattering');
 const recovered=scatterPairE8(bounced.a,bounced.b,choice.control);
 if(recovered.a!==choice.a||recovered.b!==choice.b)
  throw Error('E8 collision reflection is not involutive');
 const vBefore=sum(E8_ROOT_STEPS[choice.a],E8_ROOT_STEPS[choice.b]);
 const vAfter=sum(E8_ROOT_STEPS[bounced.a],E8_ROOT_STEPS[bounced.b]);
 if(!close(vBefore,vAfter))throw Error('E8 pair momentum failed');
 return {choice,bounced,channels:[choice.a,choice.b],after:[bounced.a,bounced.b],
 recovered:true,pairMomentum:vBefore};
}
export function buildScenes(key){
 switch(key){
 case 'origin':{
  const zero=node([0,0,0],'site 0',C.blue,11);
  return [
   T('A single point','We start with one distinguishable location. There is no motion yet—only an address.','S = {x: 0}',{nodes:[zero],kind:'ZERO DIMENSIONS'},'coordinate: 0\nidentity: one site'),
   T('Assign an integer','Give the site an integer coordinate. A label stays exact even when the picture is enlarged or rotated.','x ∈ ℤ',{...principalLines([[-1.4,0,0],[0,0,0],[1.4,0,0]],['-1','0','+1'])},'three integer addresses\n0 ≠ 1 ≠ -1'),
   T('Add a direction','A particle needs more than a position: a direction or momentum tells us how it travels.','S = (x,p)',{nodes:[zero],arrows:[arrow([0,0,0],[1.8,0,0],'p > 0')]},'position x = 0\nmomentum p = +1'),
   T('Ask the reversible question','Can we reconstruct the original integer state from the result? The rest of the atlas builds operations whose answers are yes.','U⁻¹(U(S)) = S',{nodes:[zero],arrows:[arrow([-1.8,0,0],[0,0,0],'inverse',C.red),arrow([0,0,0],[1.8,0,0],'forward',C.blue)]},'inverse certificate:\nfrom x = 1, subtract 1 → x = 0','PASS · Add one, then subtract one.')
  ];
 }
 case 'line':{
  const stages=[];
  for(const [x,v,phase] of [[0,1,'Start'],[1,1,'Advance'],[2,1,'Advance again'],[1,1,'Undo one'],[0,1,'Undo again']]){
   stages.push(T(phase,
    phase.startsWith('Undo')?'Subtract the signed displacement to recover the previous site.':
    'Keep the integer velocity; the next position is just the current integer plus one.',
    phase.startsWith('Undo')?'x ← x′ − v':'x′ ← x + v',
    {nodes:[node([x-.6,0,0],'x='+x,C.blue,9),...[-2,-1,0,1,2,3].map(k=>node([k-.6,-.7,0],String(k),C.muted,3))],
     edges:[edge([-2.6,-.7,0],[2.4,-.7,0],C.muted,1.3,.7)],
     arrows:[arrow([x-.6,0,0],[x-.6+v,0,0],'v = +1',C.gold)]},
     'x = '+x+'\nv = '+v+'\nexact integer state',
     x===0&&phase.startsWith('Undo')?'PASS · Returned exactly to x = 0.':''));
  }
  return stages;
 }
 case 'dimensions':{
  const dims=[1,2,3,4,6,8];
  return dims.map((d,i)=>T(
   ['Line','Plane','Three-dimensional room','Four-dimensional tesseract','Six coordinate axes','Eight coordinate axes'][i],
   ['One independent signed coordinate.','A new axis permits independent sideways movement.',
    'Three independent axes define physical space.','Sixteen hypercube corners now need four coordinates.',
    'A six-dimensional hypercube has 64 corners.','Eight dimensions have 256 hypercube corners; E8 is a different, highly symmetric lattice, not this cube.'][i],
   d+' coordinate'+(d===1?'':'s')+' ; hypercube corners = 2^'+d+' = '+(2**d),
   hypercube(d),'dimension = '+d+'\nvertices = '+(2**d)+'\nedges = '+(d*2**Math.max(0,d-1))+
   '\n3D is a display projection',
   i===5?'CHECK · Eight coordinates retained; only three are drawn.':''
  ));
 }
 case 'e8':{
  const r=E8_ROOT_STEPS[0],opposite=E8_ROOT_STEPS[1];
  const roots=E8_ROOT_STEPS.map(v=>e8Norm(v));
  if(roots.length!==240||roots.some(n=>n!==2)||!close(r,opposite.map(x=>-x)))
   throw Error('E8 root fixture failed');
  return [
   T('Not a hypercube','E8 is a rank-eight lattice with a remarkable shell of 240 shortest root vectors. It is not an 8D cube.','240 roots · squared norm 2',
    rootScene(60),'first 60 of 240 roots\nall have squared length 2'),
   T('Every root has an opposite','A direction and its negative are both exact E8 roots. Channels occur in antipodal pairs.','r, −r ∈ E8',
    {nodes:[node([0,0,0],'origin',C.gold,8)],arrows:[arrow([0,0,0],scale(r3(r),3),'r₀',C.blue,3),
      arrow([0,0,0],scale(r3(opposite),3),'−r₀',C.red,3)],kind:'ANTIPODAL E8 ROOTS'},
    'channel 0 = '+compact(r)+'\nchannel 1 = '+compact(opposite)),
   T('The complete shortest shell','These are all 240 exact root channels. Lines mark a sampled subset of authentic E8 root adjacencies; the lattice itself is eight-dimensional.',
    '⟨r,r⟩ = 2 · 240 channels',rootScene(240),
    '240 distinct roots\n120 opposite pairs\n3D projection is not unique',
    'PASS · 240 distinct channels, norm² = 2.'),
   T('A lattice step','Adding a root moves to another valid eight-integer address. The projected arrow depicts that exact root; it is not the underlying state.',
     'k′ = k + r',{nodes:[node([0,0,0],'k',C.blue,9),node(scale(r3(r),3),'k + r',C.red,9)],
      arrows:[arrow([0,0,0],scale(r3(r),3),'allowed hop',C.gold,3)],kind:'EXACT E8 ROOT STEP'},
     'r = '+compact(r)+'\n⟨r,r⟩ = '+e8Norm(r))
  ];
 }
 case 'shadow':{
  const all=E8_ROOT_STEPS.slice(0,120);
  const sphere=all.map((r,i)=>node(scale(r3(r),2.4),i%12===0?'h'+i:'',C.blue,4));
  const q=physical4E8(E8_ROOT_STEPS[0]);
  const scene={nodes:sphere,kind:'120 H4 DIRECTIONS · GOLDEN PROJECTION'};
  return [
   T('Golden arithmetic','An icosian coordinate comes from an integer pair (a,b) through a + bφ. The eight integers remain exact; φ appears in the displayed four-dimensional geometry.',
    'φ = (1 + √5)/2 ≈ '+PHI.toFixed(6),{nodes:[node([0,0,0],'0',C.gold,9),
     node(scale(r3(E8_ROOT_STEPS[0]),3),'q',C.blue,9)],arrows:[arrow([0,0,0],scale(r3(E8_ROOT_STEPS[0]),3),'golden vector')]},
    'first root 4D values:\n'+q.map(v=>v.toFixed(3)).join(', ')),
   T('Four real coordinates','Four quaternion components are computed from the eight integer numerators. We show only three here—one component is omitted to draw on a flat display.',
     'qⱼ = (aⱼ + φbⱼ)/2',scene,
     'one 4D H4 root set:\n120 distinct channels\nshown in 3D'),
   T('Two complementary shells','The full 240-channel E8 shell can be related to golden geometry. The H4 projection is useful, but it does not replace the original eight-coordinate simulation.',
     'E8 integer site → 4D golden → 3D display',
     rootScene(240),'120 original H4 roots\n240 total E8 directions\nprojection loses information',
     'CHECK · All dynamics still uses eight integers.')
  ];
 }

 case 'state':{
  const {choice}=twoBodyCollision(),root=E8_ROOT_STEPS[choice.a];
  const words=packE8(DEMO_SITE,choice.a);
  const only={nodes:[node([0,0,0],'id 17',C.blue,10)],
   kind:'ONE EXACT E8 PARTICLE'};
  return [
   T('Keep a stable identity','Particle 17 remains particle 17 even when its position or root channel changes. Sorting records must not change identity.',
    'id = 17',only,'stable ID = 17'),
   T('Keep the eight-integer site','The point on screen is not stored as three floating coordinates. Its actual address has eight integer coefficients modulo 4096.',
    'k ∈ (ℤ/4096ℤ)⁸',only,'k = '+compact(DEMO_SITE)),
   T('Keep one of 240 directions','A root channel selects an allowed E8 direction. A projected blue arrow visualizes that exact channel.',
    'channel c ∈ {0,…,239}',{...only,
     arrows:[arrow([0,0,0],scale(r3(root),3),'channel '+choice.a,C.blue,3)]},
    'c = '+choice.a+'\nr(c) = '+compact(root)),
   T('Pack the full record','The teaching model packs the eight 12-bit site coefficients and channel into four 32-bit words. The stable ID is tracked separately.',
    'record = 4 × u32',only,'packed u32:\n'+[...words].map(x=>'0x'+x.toString(16).padStart(8,'0')).join('\n'),
    'CHECK · Four packed words reconstruct site and channel.')
  ];
 }
 case 'transport':{
  const selected=twoBodyCollision().choice,root=E8_ROOT_STEPS[selected.a];
  let p={coords:[...DEMO_SITE],ch:selected.a},out=[];
  const seed=17,threshold=3072;
  for(let n=20;n<29;n++){
   const gate=equivariantGatePhaseE8(p.coords,p.ch,n,seed);
   const next=stepE8(p,n,{seed,threshold});
   const inverse=stepE8(next,n,{seed,threshold,reverse:true});
   if(!close(inverse.coords,p.coords)||inverse.ch!==p.ch)
    throw Error('Actual E8 transport inverse failed at event '+n);
   const from=scale(projectTo3D(p.coords,DEMO_SITE),2.1);
   const to=scale(projectTo3D(next.coords,DEMO_SITE),2.1);
   const moved=!close(p.coords,next.coords);
   out.push(T('Event '+n+': '+(moved?'hop':'hold'),
    moved?'The integer gate opens, so the exact eight-integer site advances by its selected E8 root.':
     'The integer gate is closed; this event holds the complete particle record unchanged.',
    moved?'k′ = (k + r(c)) mod 4096':'k′ = k',
    {nodes:[node(from,'before '+n,C.blue,8),node(to,'after '+n,C.red,9)],
     arrows:[arrow(from,sum(from,scale(r3(root),2.1)),moved?'allowed root':'candidate root',C.gold,2.5)],
     kind:'AUTHENTIC E8 SCHEDULED TRANSPORT'},
    'event n = '+n+'\ngate phase = '+gate+'\nthreshold = '+threshold+
    '\nmove = '+moved+'\nnext k = '+compact(next.coords),
    'PASS · Same gate undoes the hop at event '+n+'.'));
   p=next;
  }
  return out;
 }
 case 'time':{
  const picked=twoBodyCollision().choice;
  const seed=17,threshold=3072;
  let p={coords:[...DEMO_SITE],ch:picked.a},history=[],states=[p];
  for(let n=24;n<35;n++){
   const phase=equivariantGatePhaseE8(p.coords,p.ch,n,seed);
   const next=stepE8(p,n,{seed,threshold});
   history.push({n,phase,moved:!close(p.coords,next.coords)});
   states.push(next);p=next;
  }
  const final=p;
  for(let i=history.length-1;i>=0;i--){
   p=stepE8(p,history[i].n,{seed,threshold,reverse:true});
  }
  if(!close(p.coords,DEMO_SITE))throw Error('Reversed event schedule failed');
  return history.map((h,i)=>T(
   'The '+(i+1)+(i%10===0&&i!==10?'st':i%10===1&&i!==11?'nd':i%10===2&&i!==12?'rd':'th')+' ordered map',
   'At event '+h.n+', a known integer schedule chooses '+(h.moved?'a hop':'a hold')+
   '. The next event has a different gate, even when the particle uses the same root channel.',
   'θₙ = (J(k,r) + n·2531 + seed) mod 4096',
   {nodes:states.slice(Math.max(0,i-4),i+2).map((v,j)=>
     node(scale(projectTo3D(v.coords,DEMO_SITE),2.3),
       'n'+(24+Math.max(0,i-4)+j),j===i-(Math.max(0,i-4))?C.blue:C.red,7)),
    edges:states.slice(Math.max(0,i-4),i+1).map((v,j)=>edge(
      scale(projectTo3D(v.coords,DEMO_SITE),2.3),
      scale(projectTo3D(states[Math.max(0,i-4)+j+1].coords,DEMO_SITE),2.3),
      h.moved?C.gold:C.muted,2,.78)),kind:'ORDERED DISCRETE EVENT TIME'},
   'n = '+h.n+'\nθₙ = '+h.phase+'\nmove = '+h.moved+
   '\nseed = '+seed+'\nthreshold = '+threshold,
   i===history.length-1?'PASS · Reversed all eleven events in descending order.':''));
 }
 case 'collisions':{
  const c=twoBodyCollision(),n=c.choice.control;
  const before=labelsAtSite(c.channels),after=labelsAtSite(c.after);
  const normal=scale(r3(E8_ROOT_STEPS[n]),2.3);
  const ids=Uint32Array.of(17,43,71,101);
  const words=new Uint32Array(16);
  [c.channels[0],c.channels[1],c.channels[0]^1,c.channels[1]^1]
    .forEach((ch,i)=>words.set(packE8(DEMO_SITE,ch),i*4));
  const pairs=scheduleExactSiteInteractionsE8(words,ids,DEMO_COLLISION_FRAME);
  if(pairs.length!==2)throw Error('Expected two disjoint stable-ID pairs at same E8 site');
  const anchors=[[-1.9,.8,0],[-.6,.8,0],[.6,.8,0],[1.9,.8,0]];
  return [
   T('Two particles meet','Particles 17 and 43 share the same eight-integer site. Their visual arrows are projections of two different root channels.',
    'k₁ = k₂',before,
    'both sites = '+compact(DEMO_SITE)+'\nchannels '+c.channels.join(' and ')),
   T('Select the reflection root','The local schedule selects an exact control root. A binary reflection is eligible only if total pair momentum is perpendicular to that root.',
    '⟨r₁ + r₂, n⟩ = 0',
    {...before,arrows:[...before.arrows,arrow([0,0,0],normal,'control n',C.gold,2)],
     kind:'E8 MOMENTUM-ELIGIBLE REFLECTION'},
    'control channel '+n+'\ncontrol root '+compact(E8_ROOT_STEPS[n])+
    '\ndot(total momentum,n) = '+e8Dot(c.pairMomentum,E8_ROOT_STEPS[n])),
   T('Scatter, without changing the site','Both root channels reflect. The exact position and each particle ID remain unchanged. Momentum of the pair is conserved.',
    'r′ = r − ⟨r,n⟩n',after,
    'incoming '+compact(c.channels)+'\noutgoing '+compact(c.after)+
    '\npair root sum '+compact(c.pairMomentum),
    'PASS · Pair momentum and individual root norm conserved.'),
   T('Apply the same collision again','Reflection is an involution. The same site, IDs, and control produce the original root channels.',
    'C(C(S)) = S',before,
    'recovered channels '+compact(c.channels), 'PASS · Second scattering restores both channels exactly.'),
   T('Scale up with stable local pairing','When four records occupy the same exact site, the scheduler orders stable IDs and creates disjoint pairs. These four displayed positions are offset only to make identities legible.',
    'sort IDs → disjoint partners',
    {nodes:anchors.map((p,i)=>node(p,'id '+ids[i],[C.blue,C.red,C.green,C.gold][i],9)),
     edges:pairs.map((q,i)=>edge(anchors[q.recordA],anchors[q.recordB],i%2?C.red:C.blue,3,1)),
     kind:'DISPLAY OFFSETS ONLY · EXACT SITE SHARED'},
    'same eight-coordinate site\n'+pairs.map(p=>'pair '+p.stableA+' + '+p.stableB+
      ' · control '+p.control).join('\n')+'\nposition offsets: display only',
    'CHECK · Pairing uses stable IDs and site, not input record order.')
  ];
 }


 case 'springs':{
  const precision=96,strength=24,rest=145;
  const init={x:[[-90*precision,0,0],[90*precision,0,0]],
   p:[[precision*256,0,0],[-precision*256,0,0]]};
  const copy=a=>({x:a.x.map(x=>[...x]),p:a.p.map(p=>[...p])});
  const calc=a=>{
   const dx=a.x[1].map((v,i)=>v-a.x[0][i]);
   const u=dx.map(v=>trunc(v/precision));
   const distance2=u.reduce((s,v)=>s+v*v,0);
   const rest2=rest*rest;
   const radial=Math.max(-rest2,Math.min(rest2,distance2-rest2));
   const ratio=trunc(radial*256/rest2);
   const raw=trunc(ratio*strength/4);
   const coefficient=Math.max(-2048,Math.min(2048,trunc(raw*16/(16+strength))));
   return dx.map(v=>trunc(coefficient*v/16384));
  };
  const kick=(a,sign=1)=>{
   const b=copy(a),delta=calc(a);
   for(let axis=0;axis<3;axis++){b.p[0][axis]+=sign*delta[axis];b.p[1][axis]-=sign*delta[axis];}
   return b;
  };
  const drift=(a,sign=1)=>{
   const b=copy(a);for(let i=0;i<2;i++)for(let axis=0;axis<3;axis++)
    b.x[i][axis]+=sign*trunc(a.p[i][axis]/256);
   return b;
  };
  const kicked=kick(init),moved=drift(kicked),undoDrift=drift(moved,-1),recovered=kick(undoDrift,-1);
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(!equal(init,recovered))throw Error('Teaching Springs inverse mismatch');
  const view=(a,showForce=false)=>{
   const positions=a.x.map(x=>scale(x,1/(precision*40)));
   const arrows=a.p.map((p,i)=>arrow(positions[i],
    sum(positions[i],scale(p,.75/(precision*256))),i===0?'p₁':'p₂',i===0?C.blue:C.red,3));
   if(showForce){
    arrows.push(arrow(positions[0],sum(positions[0],[.68,.18,0]),'force direction',C.gold,2));
    arrows.push(arrow(positions[1],sum(positions[1],[-.68,-.18,0]),'−force',C.gold,2));
   }
   return {nodes:[node(positions[0],'particle 1',C.blue,10),
    node(positions[1],'particle 2',C.red,10)],
    edges:[edge(positions[0],positions[1],C.gold,2.3,.95)],
    arrows,kind:'TWO INTEGER SPRING PARTICLES · Q14 RESPONSE'};
  };
  const read=a=>'x₁.x = '+a.x[0][0]+'\nx₂.x = '+a.x[1][0]+
   '\np₁.x = '+a.p[0][0]+'\np₂.x = '+a.p[1][0]+
   '\nΣpₓ = '+(a.p[0][0]+a.p[1][0]);
  return [
   T('A bond with a resting length','Two particles have exact integer positions and opposite momenta. The bond remembers a preferred separation; no solver needs a floating timestep.',
    'rest length = '+rest+' world units',view(init),read(init)),
   T('Kick both momenta','The separation sets an integer Q14 force. The two momentum changes are equal and opposite. The gold arrows indicate force direction, not its magnitude.',
    'K: p₁′ = p₁ + F(x); p₂′ = p₂ − F(x)',view(kicked,true),
    read(kicked)+'\nΔp₁ = '+calc(init)[0]),
   T('Drift using the new momentum','The drift changes integer coordinates, not momentum. The state stays invertible because momentum is still available.',
    'D: xᵢ′ = xᵢ + trunc(pᵢ′/256)',view(moved),
    read(moved)),
   T('Undo the drift','Subtract the same integer displacement with the unchanged post-kick momenta. This recovers the positions at which the kick was calculated.',
    'D⁻¹: xᵢ ← xᵢ′ − trunc(pᵢ′/256)',view(undoDrift),
    read(undoDrift)),
   T('Undo the kick','Now the positions are exactly as before the kick, so the same Q14 force can be calculated and subtracted. Nothing is guessed or averaged.',
    'K⁻¹: pᵢ ← pᵢ′ − Fᵢ(x)',view(recovered),
    read(recovered),
    'PASS · All 12 integer coordinates and momenta restored exactly.')
  ];
 }
 case 'flock':{
  const q=96,coeff={alignment:48,coupling:12,cohesion:14,separation:3,cutoff:210};
  const init={x:[[-70*q,0,0],[60*q,25*q,0],[0,-45*q,50*q]],
   p:[[2*q*256,0,0],[-q*256,q*256,0],[0,-2*q*256,0]],
   h:[[0,0,0],[0,0,0],[0,0,0]]};
  const copy=a=>({x:a.x.map(p=>[...p]),p:a.p.map(p=>[...p]),h:a.h.map(p=>[...p])});
  const pairs=a=>{
   const found=[];for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
    const d=a.x[j].map((v,k)=>trunc((v-a.x[i][k])/q));
    if(d.reduce((s,v)=>s+v*v,0)<=coeff.cutoff**2)found.push([i,j]);
   }return found;
  };
  const shear=(a,kind,sign=1)=>{
   const b=copy(a),den=256*Math.max(1,Math.ceil(a.x.length/16));
   const source=kind==='hidden'?a.p:a.h;
   const dest=kind==='hidden'?b.h:b.p;
   const deltas=Array.from({length:3},()=>[0,0,0]);
   const strength=kind==='hidden'?coeff.alignment:coeff.coupling;
   for(const [i,j] of pairs(a))for(let d=0;d<3;d++){
    const v=trunc((source[j][d]-source[i][d])*strength/den);
    const directed=kind==='hidden'?v:-v;
    deltas[i][d]+=directed;deltas[j][d]-=directed;
   }
   for(let i=0;i<3;i++)for(let d=0;d<3;d++)dest[i][d]+=sign*deltas[i][d];
   return b;
  };
  const kick=(a,sign=1)=>{
   const b=copy(a),den=256*Math.max(1,Math.ceil(a.x.length/16));
   const inner=trunc(coeff.cutoff*2/3),delta=Array.from({length:3},()=>[0,0,0]);
   for(const [i,j] of pairs(a)){
    const d=a.x[j].map((v,k)=>trunc((v-a.x[i][k])/q));
    const near=d.reduce((s,v)=>s+v*v,0)<=inner*inner;
    for(let axis=0;axis<3;axis++){
     const gap=a.x[j][axis]-a.x[i][axis];
     const impulse=trunc(gap*coeff.cohesion/den)-
       (near?trunc(gap*coeff.separation/den):0);
     delta[i][axis]+=impulse;delta[j][axis]-=impulse;
    }
   }
   for(let i=0;i<3;i++)for(let d=0;d<3;d++)b.p[i][d]+=sign*delta[i][d];
   return b;
  };
  const drift=(a,sign=1)=>{
   const b=copy(a);for(let i=0;i<3;i++)for(let d=0;d<3;d++)
    b.x[i][d]+=sign*trunc(a.p[i][d]/256);return b;
  };
  const hidden=shear(init,'hidden');
  const visible=shear(hidden,'visible');
  const flocked=kick(visible);
  const drifted=drift(flocked);
  const undrifted=drift(drifted,-1);
  const unflocked=kick(undrifted,-1);
  const unvisible=shear(unflocked,'visible',-1);
  const recovered=shear(unvisible,'hidden',-1);
  if(JSON.stringify(recovered)!==JSON.stringify(init))
   throw Error('Teaching flock shears did not invert');
  const see=(a,showHidden=true)=>{
   const positions=a.x.map(p=>scale(p,1/(q*35)));
   const colors=[C.blue,C.red,C.green];
   const nodes=positions.map((p,i)=>node(p,'particle '+(i+1),colors[i],9));
   const arrows=[];
   for(let i=0;i<3;i++){
    arrows.push(arrow(positions[i],sum(positions[i],scale(a.p[i],.6/(q*256))),'p'+(i+1),colors[i],3));
    if(showHidden)arrows.push(arrow(positions[i],
     sum(positions[i],scale(a.h[i],.8/(q*256))),'h'+(i+1),C.gold,2));
   }
   return {nodes,arrows,edges:pairs(a).map(([i,j])=>edge(positions[i],positions[j],C.muted,1.5,.7)),
    kind:'VISIBLE p + AUXILIARY h · 3-PARTICLE INTEGER FLOCK'};
  };
  const read=a=>'p₁ = '+compact(a.p[0])+'\nh₁ = '+compact(a.h[0])+
    '\nΣp = '+compact([0,1,2].map(d=>a.p.reduce((s,v)=>s+v[d],0)))+
    '\nΣh = '+compact([0,1,2].map(d=>a.h.reduce((s,v)=>s+v[d],0)));
  return [
   T('Three different velocities','Each particle begins with a position and visible momentum. Ordinary alignment averaging would discard details about the original differences.',
     'Sᵢ = (xᵢ, pᵢ, hᵢ)',see(init),read(init)),
   T('Update the hidden state','A triangular shear copies signed differences of visible momentum into auxiliary momentum. Opposite pair increments cancel in total.',
     'H: hᵢ′ = hᵢ + Δ(p)',see(hidden),read(hidden)),
   T('Feed hidden momentum back','A second shear updates visible momentum from differences in the now-updated hidden values. No component is overwritten or averaged away.',
     'V: pᵢ′ = pᵢ − Δ(h′)',see(visible),read(visible)),
   T('Add local cohesion and separation','Nearby positions determine an equal-and-opposite momentum kick. Every pair uses the same integer denominator; the operations remain exactly invertible.',
     'B: pᵢ′ = pᵢ + Fᵢ(x)',see(flocked),read(flocked)),
   T('Move the flock','Each particle drifts using its current momentum, while retaining the auxiliary state. The picture changes but the inverse still exists.',
     'D: xᵢ′ = xᵢ + trunc(pᵢ′/256)',see(drifted),read(drifted)),
   T('Reverse the drift','The inverse begins in the opposite order: undo position drift while retaining the same momentum.',
     'D⁻¹',see(undrifted),read(undrifted)),
   T('Subtract the position kick','The restored positions reproduce exactly the same pair forces. Subtract them, even if the flock had become visually tangled.',
     'B⁻¹',see(unflocked),read(unflocked)),
   T('Undo visible shear','The hidden state is still available. Use it to undo the visible momentum transformation.',
     'V⁻¹',see(unvisible),read(unvisible)),
   T('Undo hidden shear','Finally subtract the original hidden-state shear. Every integer position, visible momentum, and auxiliary momentum returns to its starting value.',
     'H⁻¹ · V⁻¹ · B⁻¹ · D⁻¹',see(recovered),read(recovered),
     'PASS · All 27 teaching-state integers restored, including hidden state.')
  ];
 }
 case 'inverse':{
  const c=twoBodyCollision(),site=DEMO_SITE,n=DEMO_COLLISION_FRAME,seed=17,threshold=3072;
  const first=[{coords:[...site],ch:c.channels[0]},
   {coords:[...site],ch:c.channels[1]}];
  const scattered=first.map((p,i)=>({...p,ch:c.after[i]}));
  const streamed=scattered.map(p=>stepE8(p,n,{seed,threshold}));
  const unstreamed=streamed.map(p=>stepE8(p,n,{seed,threshold,reverse:true}));
  const inverseChannels=scatterPairE8(unstreamed[0].ch,unstreamed[1].ch,c.choice.control);
  const recovered=unstreamed.map((p,i)=>({...p,ch:i===0?inverseChannels.a:inverseChannels.b}));
  if(!recovered.every((p,i)=>close(p.coords,first[i].coords)&&p.ch===first[i].ch))
   throw Error('Complete E8 collision/stream inverse failed');
  const ids=Uint32Array.of(17,43);
  const packed=a=>Uint32Array.from(a.flatMap(p=>[...packE8(p.coords,p.ch)]));
  const beforeWords=packed(first);
  const canonical=autonomousFrameE8(beforeWords,ids,n,{seed,threshold});
  if(!close([...canonical.words],[...packed(streamed)]))
   throw Error('Teaching E8 collision/stream disagrees with authoritative automaton');
  const canonicalRecovered=autonomousFrameE8(canonical.words,ids,n,
   {reverse:true,seed,threshold});
  if(!close([...canonicalRecovered.words],[...beforeWords]))
   throw Error('Authoritative complete inverse failed');
  const display=a=>{
   const origins=a.map(p=>scale(projectTo3D(p.coords,site),2.7));
   return {nodes:origins.map((p,i)=>node(p,'id '+(i===0?17:43),i?C.red:C.blue,9)),
    arrows:origins.map((p,i)=>arrow(p,sum(p,scale(direction(a[i].ch),2)),
     'channel '+a[i].ch,i?C.red:C.blue,3)),kind:'TRUE E8 COLLISION + SCHEDULED STREAM'};
  };
  const read=a=>'event n = '+n+'\n'+a.map((p,i)=>
   'id '+(i===0?17:43)+' | c='+p.ch+'\nk='+compact(p.coords)).join('\n');
  return [
   T('Capture the exact initial state','Two stable particles share an E8 site and have valid incoming channels. The complete state consists of all eight integers and both root channels.',
    'S₀ = (k₁,c₁,k₂,c₂)',display(first),read(first)),
   T('First: collide locally','An eligible root reflection changes only the channels. The eight-integer co-occupancy remains intact.',
    'Cₙ(S₀)',display(scattered),read(scattered)),
   T('Second: transport','At this particular scheduled index, the gate checks each scattered channel and moves or holds its site.',
    'S₁ = Tₙ(Cₙ(S₀))',display(streamed),read(streamed)),
   T('Inverse transport first','Do not collide again immediately: first restore the exact pre-streaming sites using the same event gate and subtract each permitted root.',
    'Tₙ⁻¹(S₁)',display(unstreamed),read(unstreamed)),
   T('Inverse collision last','Once original co-occupancy is restored, apply the same involutive reflection. Every integer and channel returns.',
    'Cₙ(Tₙ⁻¹(S₁)) = S₀',display(recovered),read(recovered),
    'PASS · The full actual E8 event restored both packed state records.')
  ];
 }

 default:return null;
 }
}
