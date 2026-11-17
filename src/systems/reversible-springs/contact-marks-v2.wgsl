// Read-only VFX diagnostic; no physics state is written or observed on CPU.
// Contact rules match the V2 involutive mutual-nearest collision operator.
struct Particle {x:vec4<i32>,p:vec4<i32>};
struct MarkParams {
 count:u32,unitScale:i32,radius:i32,bound:i32,
 timeMs:u32,pad0:u32,pad1:u32,pad2:u32,
};
@group(0) @binding(0) var<storage,read> particles:array<Particle>;
@group(0) @binding(1) var<storage,read_write> marks:array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params:MarkParams;

@compute @workgroup_size(128)
fn markContacts(@builtin(global_invocation_id) gid:vec3<u32>){
 let i=gid.x;
 if(i>=params.count){return;}
 let particle=particles[i];
 var status=0u;
 var driftMomentum=particle.p.xyz;
 if(params.radius>0i){
  let radius2=params.radius*params.radius;
  var partner=params.count;
  var best=radius2+1i;
  for(var j=0u;j<params.count;j++){
   if(j==i){continue;}
   let d=(particles[j].x.xyz-particle.x.xyz)/params.unitScale;
   let ds=dot(d,d);
   if(ds<=radius2&&ds<best){best=ds;partner=j;}
  }
  if(partner<params.count){
   var matching=params.count;
   best=radius2+1i;
   for(var k=0u;k<params.count;k++){
    if(k==partner){continue;}
    let d=(particles[k].x.xyz-particles[partner].x.xyz)/params.unitScale;
    let ds=dot(d,d);
    if(ds<=radius2&&ds<best){best=ds;matching=k;}
   }
   if(matching==i && any(particle.p.xyz!=particles[partner].p.xyz)){
    status=status|1u;
    // The simulation exchanges momentum AFTER drift. Undo that purely
    // for the wall diagnostic so simultaneous wall+pair hits remain visible.
    driftMomentum=particles[partner].p.xyz;
   }
  }
 }
 if(params.bound>0i){
  let old=particle.x.xyz-driftMomentum/256i;
  if(any(abs(old)>vec3<i32>(params.bound))){status=status|2u;}
 }
 let previous=marks[i];
 let stamp=select(previous.y,params.timeMs,status!=0u&&previous.x==0u);
 marks[i]=vec4<u32>(status,stamp,0u,0u);
}
