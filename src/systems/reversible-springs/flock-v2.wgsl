// Lapinet integer, pair-central, reversible GPU spring prototype.
struct Particle { x:vec4<i32>, p:vec4<i32>, };
struct Params {
 count:u32, operation:u32, mode:u32, unitScale:i32,
 cutoff2:i32, rest2:i32, stiffness:i32, restScale256:i32,
 alignment:i32, coupling:i32, pad0:i32, pad1:i32,
 cohesion:i32, separation:i32, gravity:i32, pad2:i32,
 collisionRadius:i32, collisionPad0:i32, collisionPad1:i32, collisionPad2:i32,
};
@group(0) @binding(0) var<storage,read> current:array<Particle>;
@group(0) @binding(1) var<storage,read_write> next:array<Particle>;
@group(0) @binding(2) var<storage,read> rowStart:array<u32>;
@group(0) @binding(3) var<storage,read> neighborIDs:array<u32>;
@group(0) @binding(4) var<storage,read> edgeRest:array<vec4<i32>>;
@group(0) @binding(5) var<uniform> options:Params;
@group(0) @binding(6) var<storage,read> hiddenCurrent:array<vec4<i32>>;
@group(0) @binding(7) var<storage,read_write> hiddenNext:array<vec4<i32>>;
fn scaledRest2(base:i32)->i32{
 let scaled=(base*options.restScale256)/256i;
 return (scaled*options.restScale256)/256i;
}
fn scalarFor(delta:vec3<i32>,rest2:i32,stiffness:i32)->i32{
 let v=delta/options.unitScale;
 return clamp((dot(v,v)-rest2)*stiffness/max(1i,4i*rest2),-3i,3i);
}
// V2 dynamic contacts only: high-precision signed Q14 scalar, tapered to
// zero at outer cutoff. This avoids the legacy whole-integer coefficient
// dead zone. Pair force remains antisymmetric under delta -> -delta.
// Operands remain bounded for the public <=512 particle / cutoff controls.
// V2 bonded springs: signed fractional central coefficient with rational
// strength compression. Exactly mirrors bonded-force-v2.mjs.
fn smoothBondedImpulse(d:vec3<i32>,rest2:i32)->vec3<i32>{
 if(options.stiffness==0i||rest2<=0i){return vec3<i32>(0);}
 let u=d/options.unitScale;
 let radial=clamp(dot(u,u)-rest2,-rest2,rest2);
 let ratio=(radial*256i)/rest2;
 let raw=(ratio*options.stiffness)/4i;
 let softened=(raw*16i)/(16i+options.stiffness);
 let coeff=clamp(softened,-2048i,2048i);
 return (d*coeff)/16384i;
}
fn smoothDynamicImpulse(d:vec3<i32>,rest2:i32)->vec3<i32>{
 let u=d/options.unitScale;
 let ds=dot(u,u);
 if(options.stiffness==0i||ds>options.cutoff2||rest2<=0i){
  return vec3<i32>(0);
 }
 let radial=clamp(ds-rest2,-rest2,rest2);
 var fade=256i;
 if(options.cutoff2>rest2){
  fade=min(256i,((options.cutoff2-ds)*256i)/(options.cutoff2-rest2));
 }
 let raw=(radial*options.stiffness*fade)/(4i*rest2);
 let softened=(raw*16i)/(16i+options.stiffness);
 let coeff=clamp(softened,-2048i,2048i);
 return (d*coeff)/16384i;
}
// Six reflecting planes sit between valid integer coordinates.
// The same integer fold works for forward and backward drifts.
fn reflectAxis(position:i32,momentum:i32,direction:i32)->vec2<i32>{
 let bound=options.pad0;
 var x=position+direction*(momentum/256i);
 var p=momentum;
 loop{
  if(x<=bound&&x>=-bound){break;}
  if(x>bound){x=2i*bound+1i-x;}
  else{x=-2i*bound-1i-x;}
  p=-p;
 }
 return vec2<i32>(x,p);
}
@compute @workgroup_size(128)
fn springStage(@builtin(global_invocation_id) gid:vec3<u32>){
 let id=gid.x;
 if(id>=options.count){return;}
 var particle=current[id];
 var hidden=hiddenCurrent[id];
 // V2: involutive pair-contact exchange after drift; first when reversing.
 // Nearest-neighbor ties resolve to the lower stable particle ID.
 // Linear gravity is a uniform integer momentum shear, applied BEFORE
 // drift, and undone AFTER inverse drift. Only world -Y is affected.
 if(options.operation==11u||options.operation==12u){
  if(options.mode==2u && options.gravity>0i){
   let impulse=options.gravity*options.unitScale*8i;
   let sign=select(-1i,1i,options.operation==12u);
   particle.p.y+=sign*impulse;
  }
  next[id]=particle;hiddenNext[id]=hidden;return;
 }
 if(options.operation==10u){
  let radius=options.collisionRadius;
  if(radius>0i){
   let r2=radius*radius;
   var best=r2+1i;
   var partner=options.count;
   for(var j=0u;j<options.count;j++){
    if(j==id){continue;}
    let d=(current[j].x.xyz-particle.x.xyz)/options.unitScale;
    let ds=dot(d,d);
    if(ds<=r2&&ds<best){best=ds;partner=j;}
   }
   if(partner<options.count){
    best=r2+1i;
    var counterpart=options.count;
    for(var k=0u;k<options.count;k++){
     if(k==partner){continue;}
     let d=(current[k].x.xyz-current[partner].x.xyz)/options.unitScale;
     let ds=dot(d,d);
     if(ds<=r2&&ds<best){best=ds;counterpart=k;}
    }
    if(counterpart==id){particle.p=vec4<i32>(current[partner].p.xyz,0);}
   }
  }
  next[id]=particle;hiddenNext[id]=hidden;return;
 }
 // Ballistic mode skips every kick and auxiliary shear.
 if(options.mode==2u && options.operation!=1u && options.operation!=2u){
  next[id]=particle;hiddenNext[id]=hidden;return;
 }
 if(options.operation==8u||options.operation==9u){
  // Exact, position-dependent boid force: cohesion toward the local
  // neighborhood and short-range pair repulsion. The kick does not move
  // positions, so operation 9 undoes 8
  // exactly at the same coordinates.
  var force=vec3<i32>(0);
  // Pairwise mean-field normalization preserves equal/opposite momentum
  // while preventing 512 nearby agents from multiplying a coefficient by
  // their full neighborhood size. Constant per fixture, inverse-safe.
  let flockDenominator=256i*max(1i,(i32(options.count)+15i)/16i);
  let radius=max(1i,options.pad2);
  let radius2=radius*radius;
  for(var j=0u;j<options.count;j++){
   if(j==id){continue;}
   let d=current[j].x.xyz-particle.x.xyz;
   let u=d/options.unitScale;
   let ds=dot(u,u);
   if(ds>options.cutoff2){continue;}
   force+=(d*options.cohesion)/flockDenominator;
   if(ds<=radius2){force-=(d*options.separation)/flockDenominator;}
  }
  let sign=select(1i,-1i,options.operation==9u);
  particle.p=vec4<i32>(particle.p.xyz+sign*force,0);
 }else if(options.operation>=4u){
  var force=vec3<i32>(0);
  let flockDenominator=256i*max(1i,(i32(options.count)+15i)/16i);
  let hiddenStage=options.operation==4u||options.operation==7u;
  for(var neighbor=0u;neighbor<options.count;neighbor++){
   if(neighbor==id){continue;}
   let dx=current[neighbor].x.xyz-particle.x.xyz;
   let u=dx/options.unitScale;
   if(dot(u,u)>options.cutoff2){continue;}
   if(hiddenStage){
    let dp=current[neighbor].p.xyz-particle.p.xyz;
    force+=(dp*options.alignment)/flockDenominator;
   }else{
    let dh=hiddenCurrent[neighbor].xyz-hidden.xyz;
    force-=(dh*options.coupling)/flockDenominator;
   }
  }
  let sign=select(1i,-1i,options.operation==6u||options.operation==7u);
  if(hiddenStage){
   hidden=vec4<i32>(hidden.xyz+sign*force,0);
  }else{
   particle.p=vec4<i32>(particle.p.xyz+sign*force,0);
  }
 }else if(options.operation==0u||options.operation==3u){
  var f=vec3<i32>(0);
  if(options.mode==1u){
   for(var j=0u;j<options.count;j++){
    if(j==id){continue;}
    let d=current[j].x.xyz-particle.x.xyz;
    let v=d/options.unitScale;
    if(dot(v,v)>options.cutoff2){continue;}
    let rest2=scaledRest2(options.rest2);
    if(options.collisionPad0==1i){
     f+=smoothDynamicImpulse(d,rest2);
    }else{
     f+=scalarFor(d,rest2,options.stiffness)*d;
    }
   }
  }else{
   for(var edge=rowStart[id];edge<rowStart[id+1u];edge++){
    let rest=edgeRest[edge];
    let d=current[neighborIDs[edge]].x.xyz-particle.x.xyz;
    let r=rest.xyz/options.unitScale;
    let rest2=scaledRest2(dot(r,r));
    if(options.collisionPad1==1i){
     f+=smoothBondedImpulse(d,rest2);
    }else{
     f+=scalarFor(d,rest2,options.stiffness)*d;
    }
   }
  }
  let sign=select(1i,-1i,options.operation==3u);
  particle.p=vec4<i32>(particle.p.xyz+sign*f,0);
 }else{
  let sign=select(1i,-1i,options.operation==2u);
  if(options.pad0>0i){
   let bx=reflectAxis(particle.x.x,particle.p.x,sign);
   let by=reflectAxis(particle.x.y,particle.p.y,sign);
   let bz=reflectAxis(particle.x.z,particle.p.z,sign);
   particle.x=vec4<i32>(bx.x,by.x,bz.x,0);
   particle.p=vec4<i32>(bx.y,by.y,bz.y,0);
  }else{
   particle.x=vec4<i32>(particle.x.xyz+sign*(particle.p.xyz/256i),0);
  }
 }
 next[id]=particle;
 hiddenNext[id]=hidden;
}