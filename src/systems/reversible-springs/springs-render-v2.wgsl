// GPU-resident visualization of the same integer spring state consumed by
// the reversible compute solver. No CPU readback during animation.
struct Particle {x:vec4<i32>, p:vec4<i32>};
struct ViewParams {
 resolution:vec2<f32>,
 scale:f32,
 sizePx:f32,
 yaw:f32,
 pitch:f32,
 edgeOpacity:f32,
 dynamicCutoffSquared:f32,
 dynamicGate:vec4<i32>,
 center:vec4<f32>,
 boxExtent:vec4<f32>,
};
@group(0) @binding(0) var<storage,read> particles:array<Particle>;
@group(0) @binding(1) var<uniform> view:ViewParams;
@group(0) @binding(2) var<storage,read> springEdges:array<vec2<u32>>;
// Read-only VFX marks, generated from the GPU simulation state.
@group(0) @binding(4) var<storage,read> impacts:array<vec4<u32>>;

// Projective orbit by default, orthographic when boxExtent.w is 0.
// view.center.w is the camera's world-space orbit distance.
// All geometry paths share this projection, independent of physics state.
fn cameraProject(point:vec3<f32>)->vec3<f32>{
 let cy=cos(view.yaw);
 let sy=sin(view.yaw);
 let cp=cos(view.pitch);
 let sp=sin(view.pitch);
 let x=cy*point.x+sy*point.z;
 let z=cy*point.z-sy*point.x;
 let y=cp*point.y-sp*z;
 let aspect=view.resolution.x/max(view.resolution.y,1.0);
 var magnification=1.0;
 if(view.boxExtent.w>0.5){
  let cameraDistance=max(1.0,view.center.w);
  let depth=cameraDistance-z;
  if(depth<=cameraDistance*0.01){return vec3<f32>(3.0,3.0,-1.0);}
  magnification=cameraDistance/depth;
 }
 return vec3<f32>(vec2<f32>(x/max(aspect,1e-4),y)*
  view.scale*magnification,magnification);
}
struct Out {
 @builtin(position) position:vec4<f32>,
 @location(0) local:vec2<f32>,
 @location(1) tint:vec3<f32>,
};
@vertex
fn vertexMain(@builtin(vertex_index) vertex:u32,@builtin(instance_index) particleId:u32)->Out{
 let p=vec3<f32>(particles[particleId].x.xyz)-view.center.xyz;
 let projected=cameraProject(p);
 let base=projected.xy;
 var corners=array<vec2<f32>,4>(
  vec2<f32>(-1.0,-1.0),
  vec2<f32>( 1.0,-1.0),
  vec2<f32>(-1.0, 1.0),
  vec2<f32>( 1.0, 1.0)
 );
 let corner=corners[vertex];
 let mark=impacts[particleId];
 let age=view.boxExtent.y-f32(mark.y);
 let pulseEnabled=view.boxExtent.z>0.5 && mark.y>0u &&
    age>=0.0 && age<260.0;
 let swelling=select(1.0,1.0+0.82*sin(3.14159265*clamp(age/260.0,0.0,1.0)),pulseEnabled);
 let px=vec2<f32>(
  corner.x*view.sizePx*swelling*max(0.0,projected.z)*2.0/max(view.resolution.x,1.0),
  corner.y*view.sizePx*swelling*max(0.0,projected.z)*2.0/max(view.resolution.y,1.0)
 );
 var output:Out;
 output.position=select(vec4<f32>(3.0,3.0,0.5,1.0),vec4<f32>(base+px,0.5,1.0),projected.z>0.0);
 output.local=corner;
 // Stable alternating particle IDs: CSS inversion yields blue and red on ivory.
 // Color does not depend on camera orientation or moving positions.
 output.tint=select(vec3<f32>(0.25,0.65,0.72),
                    vec3<f32>(0.85,0.60,0.28),
                    (particleId & 1u)==0u);
 return output;
}
@fragment
fn fragmentMain(f:Out)->@location(0) vec4<f32>{
 let r=dot(f.local,f.local);
 if(r>1.0){discard;}
 let light=0.42+0.58*sqrt(max(0.0,1.0-r));
 return vec4<f32>(f.tint*light,1.0);
}

struct SpringEdgeOut {
 @builtin(position) position:vec4<f32>,
 @location(0) color:vec4<f32>,
};
@vertex
fn edgeVertex(@builtin(vertex_index) vertex:u32,
              @builtin(instance_index) edge:u32)->SpringEdgeOut{
 let pair=springEdges[edge];
 let p0=particles[pair.x].x.xyz;
 let p1=particles[pair.y].x.xyz;
 let delta=p1-p0;
 let d2=dot(vec3<f32>(delta),vec3<f32>(delta));
 let dWorld=delta/max(1i,view.dynamicGate.x);
 let visible=(view.dynamicGate.z==0i||
              dot(dWorld,dWorld)<=view.dynamicGate.y);
 let source=select(p0,p1,vertex==1u);
 let p=vec3<f32>(source)-view.center.xyz;
 let projected=cameraProject(p);
 var result:SpringEdgeOut;
 if(visible&&projected.z>0.0){
  result.position=vec4<f32>(projected.xy,0.6,1.0);
 }else{
  result.position=vec4<f32>(3.0,3.0,0.6,1.0);
 }
 let intensity=clamp(sqrt(max(d2,0.0))*view.scale*4.0,0.0,1.0);
 result.color=vec4<f32>(mix(
  vec3<f32>(0.35,0.78,0.97),
  vec3<f32>(0.92,0.62,0.40),intensity),
  view.edgeOpacity);
 return result;
}
// Direction arrows, sampled every third particle. These expose velocity
// alignment without changing the simulation, particle positions, or trails.
@vertex
fn velocityVertex(@builtin(vertex_index) vertex:u32,
                  @builtin(instance_index) glyph:u32)->SpringEdgeOut{
 let id=glyph*3u;
 let position=vec3<f32>(particles[id].x.xyz)-view.center.xyz;
 let momentum=vec3<f32>(particles[id].p.xyz);
 let projected=cameraProject(position);
 let base=projected.xy;
 let cy=cos(view.yaw);
 let sy=sin(view.yaw);
 let cp=cos(view.pitch);
 let sp=sin(view.pitch);
 let vx=cy*momentum.x+sy*momentum.z;
 let vz=cy*momentum.z-sy*momentum.x;
 let vy=cp*momentum.y-sp*vz;
 let direction=vec2<f32>(vx,vy);
 let speed=length(direction);
 let unit=select(vec2<f32>(0.0),direction/max(speed,0.0001),speed>0.0001);
 let pixels=vec2<f32>(2.0*21.0/max(view.resolution.x,1.0),
                        2.0*21.0/max(view.resolution.y,1.0));
 let arrow=unit*pixels*max(0.0,projected.z);
 let wing=vec2<f32>(-unit.y,unit.x)*pixels*0.20;
 let tip=base+arrow;
 var endpoint=base;
 switch(vertex){
  case 0u:{endpoint=base;}
  case 1u:{endpoint=tip;}
  case 2u,4u:{endpoint=tip;}
  case 3u:{endpoint=tip-arrow*0.32+wing;}
  default:{endpoint=tip-arrow*0.32-wing;}
 }
 var out:SpringEdgeOut;
 out.position=select(vec4<f32>(3.0,3.0,0.56,1.0),vec4<f32>(endpoint,0.56,1.0),projected.z>0.0);
 out.color=select(vec4<f32>(1.0,0.65,0.32,0.82),
                  vec4<f32>(0.28,0.94,0.94,0.82),momentum.x>=0.0);
 return out;
}
// Twelve wireframe edges of a centered axis-aligned reflecting enclosure.
@vertex
fn boxVertex(@builtin(vertex_index) vertex:u32)->SpringEdgeOut{
 let pairs=array<vec2<u32>,12>(
  vec2<u32>(0u,1u),vec2<u32>(2u,3u),
  vec2<u32>(4u,5u),vec2<u32>(6u,7u),
  vec2<u32>(0u,2u),vec2<u32>(1u,3u),
  vec2<u32>(4u,6u),vec2<u32>(5u,7u),
  vec2<u32>(0u,4u),vec2<u32>(1u,5u),
  vec2<u32>(2u,6u),vec2<u32>(3u,7u)
 );
 let pair=pairs[vertex/2u];
 let corner=select(pair.x,pair.y,(vertex%2u)==1u);
 let extent=view.boxExtent.x;
 let point=vec3<f32>(
  select(-extent,extent,(corner&1u)!=0u),
  select(-extent,extent,(corner&2u)!=0u),
  select(-extent,extent,(corner&4u)!=0u)
 )-view.center.xyz;
 let projected=cameraProject(point);
 var result:SpringEdgeOut;
 result.position=select(vec4<f32>(3.0,3.0,0.65,1.0),
  vec4<f32>(projected.xy,0.65,1.0),projected.z>0.0);
 result.color=vec4<f32>(0.48,0.77,0.95,0.38);
 return result;
}
@fragment
fn edgeFragment(v:SpringEdgeOut)->@location(0) vec4<f32>{
 return v.color;
}
