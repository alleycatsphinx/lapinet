import {springPairs,dynamicPairs,cubicGridDimensions} from './springs-cpu.mjs?v=cube1';
import {createFixtureV2} from './fixture-v2.mjs';
import {ReversibleFlockV2GPU} from './flock-gpu-v2.js?v=density2';
import {seedMovingFlock,flockPairs} from './flock-cpu.mjs?v=boids1';
import {SPRING_PRESETS,DEMO_NAMES} from './springs-presets-v2.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view');
const status=$('status');
const ticks=$('ticks');
const gpuLabel=$('gpu');
const formatLabel=$('format');
let device=null,context=null,renderPipeline=null,edgePipeline=null,velocityPipeline=null,velocityGroups=null,boxPipeline=null,boxGroup=null,viewBuffer=null,solver=null,renderGroups=null,edgeGroups=null,edgeBuffer=null,edgeCount=0;
let trailFadePipeline=null,trailComposePipeline=null,trailSampler=null,trailUniform=null;
let trailTextures=[],trailBindings=[],trailSize=[0,0],trailCurrent=0,trailValid=false,trailBindLayout=null;
let playing=false,playbackDirection=1,loading=false,angleX=-0.55,angleY=0.4,zoom=1;
let panX=0,panY=0; // Screen-space camera translation, never a simulation force.
let graphSize=[6,6,6],lastFrame=performance.now(),flockOrigin=[0,0,0],flockDrift=[0,0,0];
let contactMarkPipeline=null,contactMarkUniform=null,contactMarkBuffer=null,contactMarkGroups=null;
let marksTick=-1,marksCurrent=-1;
let activeDemo='springs';
const U=()=>globalThis.GPUBufferUsage;
function note(message){status.textContent=message;}
function fixtureSettings(){
 let side=Number($('grid').value);
 const mode=$('connectivity').value,shape=$('shape').value;
 // The demo uses an exact all-pairs GPU kernel; its current limit is 512.
 // A 10^3 source grid gives 360 spherical particles; 8^3 lattice gives 512.
 const allPairs=mode==='dynamic'||mode==='flock'||$('particleCollisions').checked;
 const limit=allPairs&&shape==='sphere'?11:8;
 if(allPairs&&side>limit){
  side=limit;
  $('grid').value=String(side);
 }
 const spacing=Math.max(12,Math.round(480/(side-1)));
 return {
  ...cubicGridDimensions(side),
  side,spacing,precision:Number($('precision').value),
  stiffness:Number($('stiffness').value),
  perturbation:Math.min(96,Math.round(Number($('perturb').value)*spacing/96)),
  cutoff:Math.round(spacing*Number($('contactRange').value)/100),
  restLength:spacing,restScale256:Math.round(Number($('restScale').value)*256/100),
  mode,shape,dynamicForceModel:$('dynamicForceModel').value,
  bondedForceModel:$('bondedForceModel').value,
  collisions:$('particleCollisions').checked,
  collisionRadius:Math.round(spacing*Number($('collisionRadius').value)/100),
  reflectBoundary:$('reflectBoundary').checked,
  gravity:mode==='straight'&&$('enableGravity').checked?Number($('gravity').value):0
 };
}
async function initGPU(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw Error('WebGPU adapter unavailable');
 device=await adapter.requestDevice();
 device.lost.then(info=>{playing=false;note('GPU device lost: '+(info?.message||'unknown'));});
 context=canvas.getContext('webgpu');
 const format=navigator.gpu.getPreferredCanvasFormat();
 context.configure({device,format,alphaMode:'opaque'});
 gpuLabel.textContent=adapter.info?.description||adapter.info?.device||'WebGPU adapter';
 formatLabel.textContent=format;
 const response=await fetch(new URL('./springs-render-v2.wgsl',import.meta.url),{cache:'no-store'});
 if(!response.ok)throw Error('Spring renderer HTTP '+response.status);
 const module=device.createShaderModule({label:'Lapinet springs GPU renderer',code:await response.text()});
 const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
 if(errors.length)throw Error('Render WGSL: '+errors.map(x=>x.lineNum+':'+x.message).join('; '));
 renderPipeline=await device.createRenderPipelineAsync({
  label:'Lapinet reversible springs particle viewer',
  layout:'auto',
  vertex:{module,entryPoint:'vertexMain'},
  fragment:{module,entryPoint:'fragmentMain',targets:[{format}]},
  primitive:{topology:'triangle-strip'},
 });
 edgePipeline=await device.createRenderPipelineAsync({
  label:'Lapinet GPU spring connections',
  layout:'auto',
  vertex:{module,entryPoint:'edgeVertex'},
  fragment:{module,entryPoint:'edgeFragment',targets:[{
   format,
   blend:{
    color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
    alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
   }
  }]},
  primitive:{topology:'line-list'},
 });
 velocityPipeline=await device.createRenderPipelineAsync({
  label:'Sparse flock heading arrows',
  layout:'auto',
  vertex:{module,entryPoint:'velocityVertex'},
  fragment:{module,entryPoint:'edgeFragment',targets:[{
   format,
   blend:{
    color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
    alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
   }
  }]},
  primitive:{topology:'line-list'}
 });
 boxPipeline=await device.createRenderPipelineAsync({
  label:'Reflective enclosure wireframe',
  layout:'auto',
  vertex:{module,entryPoint:'boxVertex'},
  fragment:{module,entryPoint:'edgeFragment',targets:[{
   format,
   blend:{
    color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
    alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
   }
  }]},
  primitive:{topology:'line-list'}
 });
 viewBuffer=device.createBuffer({label:'Spring viewer camera',size:80,usage:U().UNIFORM|U().COPY_DST});
 boxGroup=device.createBindGroup({
  layout:boxPipeline.getBindGroupLayout(0),
  entries:[{binding:1,resource:{buffer:viewBuffer}}]
 });
 const trailsResponse=await fetch(new URL('./springs-trails.wgsl',import.meta.url),{cache:'no-store'});
 if(!trailsResponse.ok)throw Error('Trails shader HTTP '+trailsResponse.status);
 const trailsModule=device.createShaderModule({label:'Screen-space particle trails',code:await trailsResponse.text()});
 const trailErrors=(await trailsModule.getCompilationInfo()).messages.filter(m=>m.type==='error');
 if(trailErrors.length)throw Error('Trails WGSL: '+trailErrors.map(e=>e.lineNum+':'+e.message).join('; '));
 const trailLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}
 ]});
 const trailPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[trailLayout]});
 trailFadePipeline=await device.createRenderPipelineAsync({
  label:'Trails history decay',layout:trailPipelineLayout,
  vertex:{module:trailsModule,entryPoint:'trailVertex'},
  fragment:{module:trailsModule,entryPoint:'trailFade',targets:[{format}]},
  primitive:{topology:'triangle-list'}
 });
 trailComposePipeline=await device.createRenderPipelineAsync({
  label:'Trails additive composite',layout:trailPipelineLayout,
  vertex:{module:trailsModule,entryPoint:'trailVertex'},
  fragment:{module:trailsModule,entryPoint:'trailCompose',targets:[{
   format,blend:{
    color:{srcFactor:'one',dstFactor:'one',operation:'add'},
    alpha:{srcFactor:'zero',dstFactor:'one',operation:'add'}
   }
  }]},
  primitive:{topology:'triangle-list'}
 });
 trailUniform=device.createBuffer({label:'Trail persistence',size:16,usage:U().UNIFORM|U().COPY_DST});
 trailSampler=device.createSampler({minFilter:'linear',magFilter:'linear'});
 trailBindLayout=trailLayout;
 const markerResponse=await fetch(new URL('./contact-marks-v2.wgsl',import.meta.url),{cache:'no-store'});
 if(!markerResponse.ok)throw Error('Contact markers HTTP '+markerResponse.status);
 const markerModule=device.createShaderModule({label:'V2 read-only collision highlights',code:await markerResponse.text()});
 const markerErrors=(await markerModule.getCompilationInfo()).messages.filter(m=>m.type==='error');
 if(markerErrors.length)throw Error('Contact marker WGSL: '+markerErrors.map(m=>m.message).join('; '));
 contactMarkPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:markerModule,entryPoint:'markContacts'}});
 contactMarkUniform=device.createBuffer({label:'Contact marker uniforms',size:32,usage:U().UNIFORM|U().COPY_DST});
}
function ensureTrailBuffers(){
 if(!device||!trailFadePipeline)return;
 if(trailSize[0]===canvas.width&&trailSize[1]===canvas.height)return;
 for(const texture of trailTextures)texture.destroy();
 trailSize=[canvas.width,canvas.height];
 trailTextures=[0,1].map(i=>device.createTexture({
  label:'Particle trail history '+i,
  size:[canvas.width,canvas.height,1],
  format:navigator.gpu.getPreferredCanvasFormat(),
  usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING
 }));
 trailBindings=trailTextures.map(texture=>device.createBindGroup({
  layout:trailBindLayout,
  entries:[
   {binding:0,resource:texture.createView()},
   {binding:1,resource:trailSampler},
   {binding:2,resource:{buffer:trailUniform}}
  ]
 }));
 trailCurrent=0;trailValid=false;
}
function updateTrailHistory(){
 if(!$('showTrails').checked||!trailFadePipeline)return null;
 ensureTrailBuffers();
 const dst=1-trailCurrent;
 device.queue.writeBuffer(trailUniform,0,
  new Float32Array([Number($('trailPersistence').value)/100,0,0,0]));
 const encoder=device.createCommandEncoder({label:'Screen-space trail history'});
 const pass=encoder.beginRenderPass({
  colorAttachments:[{view:trailTextures[dst].createView(),
   clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]
 });
 if(trailValid){
  pass.setPipeline(trailFadePipeline);
  pass.setBindGroup(0,trailBindings[trailCurrent]);
  pass.draw(3);
 }
 pass.setPipeline(renderPipeline);
 pass.setBindGroup(0,renderGroups[solver.current]);
 pass.draw(4,solver.graph.count);
 pass.end();
 device.queue.submit([encoder.finish()]);
 trailCurrent=dst;trailValid=true;
 return trailBindings[dst];
}
async function reset({autoplay=false}={}){
 if(loading)return;
 loading=true;playing=false;updateControls();note('Building reversible system…');
 try{
  const cfg=fixtureSettings();
  let fixture=createFixtureV2(cfg);
  if(cfg.mode==='flock'){
   fixture=seedMovingFlock(fixture,{
    velocity:2,scatter:0.28,pattern:'counterflow',
    alignment:Number($('alignment').value),
    coupling:Number($('coupling').value)
   });
   Object.assign(fixture.graph,{
    cohesion:Number($('cohesion').value),
    separation:Number($('separation').value),
    steering:0
   });
  }
  if(cfg.mode==='straight'){
   fixture=seedMovingFlock(fixture,{velocity:1.3,scatter:0.6,
    pattern:cfg.collisions?'counterflow':'drift'});
   Object.assign(fixture.graph,{mode:'straight',stiffness:0,alignment:0,coupling:0});
  }
  if(cfg.reflectBoundary){
   fixture.graph.boundaryExtent=Math.round(
    cfg.spacing*((cfg.side-1)*0.63+0.4))*cfg.precision;
   $('followFlock').checked=false;
  }
  flockOrigin=[0,0,0];flockDrift=[0,0,0];
  if(cfg.mode==='flock'){
   for(let i=0;i<fixture.graph.count;i++)
    for(let axis=0;axis<3;axis++){
     flockOrigin[axis]+=fixture.state[i*8+axis]/fixture.graph.count;
     flockDrift[axis]+=Math.trunc(fixture.state[i*8+4+axis]/256)/fixture.graph.count;
    }
  }
  fixture.graph.gravity=cfg.mode==='straight'?cfg.gravity:0;
  fixture.graph.dynamicForceModel=cfg.mode==='dynamic'?cfg.dynamicForceModel:'legacy';
  fixture.graph.bondedForceModel=cfg.mode==='bonded'?cfg.bondedForceModel:'legacy';
  fixture.graph.collisionRadius=cfg.collisions?cfg.collisionRadius:0;
  if(!fixture.hidden && (cfg.mode==='bonded'||cfg.mode==='dynamic'||cfg.collisions||cfg.reflectBoundary))
   fixture.hidden=new Int32Array(fixture.graph.count*4);
  // Ensure no frame or diagnostic pass still uses the old GPU resources.
  await device.queue.onSubmittedWorkDone();
  solver?.destroy();
  trailValid=false;
  edgeBuffer?.destroy();
  contactMarkBuffer?.destroy();
  contactMarkBuffer=device.createBuffer({label:'Reversible V2 impact VFX only',
    size:Math.max(16,fixture.graph.count*16),
    usage:U().STORAGE|U().COPY_DST});
  device.queue.writeBuffer(contactMarkBuffer,0,new Uint32Array(fixture.graph.count*4));
  marksTick=-1;marksCurrent=-1;
  solver=await ReversibleFlockV2GPU.create({device,fixture});
  const pairs=cfg.mode==='straight'?new Uint32Array(0):
   (cfg.mode==='dynamic'||cfg.mode==='flock')?dynamicPairs(fixture.graph.count):springPairs(fixture.graph);
  edgeCount=pairs.length/2;
  edgeBuffer=device.createBuffer({
   label:'Spring connection IDs',size:Math.max(16,pairs.byteLength),
   usage:U().STORAGE|U().COPY_DST
  });
  device.queue.writeBuffer(edgeBuffer,0,pairs);
  edgeGroups=solver.states.map(state=>device.createBindGroup({
   layout:edgePipeline.getBindGroupLayout(0),
   entries:[
    {binding:0,resource:{buffer:state}},
    {binding:1,resource:{buffer:viewBuffer}},
    {binding:2,resource:{buffer:edgeBuffer}}
   ]
  }));
  renderGroups=solver.states.map(state=>device.createBindGroup({
   layout:renderPipeline.getBindGroupLayout(0),
   entries:[{binding:0,resource:{buffer:state}},{binding:1,resource:{buffer:viewBuffer}},
    {binding:4,resource:{buffer:contactMarkBuffer}}],
  }));
  contactMarkGroups=solver.states.map(state=>device.createBindGroup({
   layout:contactMarkPipeline.getBindGroupLayout(0),
   entries:[
    {binding:0,resource:{buffer:state}},
    {binding:1,resource:{buffer:contactMarkBuffer}},
    {binding:2,resource:{buffer:contactMarkUniform}}
   ]
  }));
  velocityGroups=solver.states.map(state=>device.createBindGroup({
   layout:velocityPipeline.getBindGroupLayout(0),
   entries:[{binding:0,resource:{buffer:state}},{binding:1,resource:{buffer:viewBuffer}}],
  }));
  graphSize=[cfg.nx,cfg.ny,cfg.nz];
  $('gridDimensions').textContent=
   graphSize.join(' × ')+' ('+graphSize.reduce((n,v)=>n*v,1).toLocaleString()+' source sites)';
  $('count').textContent=String(fixture.graph.count);
  $('populationReadout').textContent=
   'Active '+cfg.mode+': '+fixture.graph.count.toLocaleString()+' particles ('+
   cfg.shape+', '+cfg.side+'³ source grid)'+
   (cfg.mode==='bonded'?' · largest bonded sphere':
    (cfg.collisions||['dynamic','flock'].includes(cfg.mode)?
    ' · maximum 512 all-pairs':''));
  $('edges').textContent=cfg.mode==='straight'?'none (independent trajectories)':
   (cfg.mode==='dynamic'||cfg.mode==='flock')?
   edgeCount.toLocaleString()+' candidates (GPU filtered)':
   edgeCount.toLocaleString()+' bonds';
  $('resolutionInfo').textContent=
   spacingLabel(cfg.spacing)+' world units / node · 1/'+cfg.precision+' coordinate units';
  $('forceMode').textContent=cfg.mode==='straight'?'Integer drift'+
   (fixture.graph.gravity?' + reversible -Y gravity':''):
   cfg.mode==='flock'?'Reversible alignment + cohesion + separation':
   cfg.mode==='dynamic'?(cfg.dynamicForceModel==='legacy'?'Quantized dynamic contacts':'Soft Q14 reversible contacts'):
   (cfg.bondedForceModel==='legacy'?'Original quantized central bonds':'Smooth Q14 central bonds');
  $('flockNeighbors').textContent=cfg.mode==='flock'?
   (flockPairs(fixture.state,fixture.graph).length/2).toLocaleString()+
   ' initial active pairs; arrows sample every 3rd particle':'—';
  $('gravityInfo').textContent=cfg.mode==='straight'?
   (fixture.graph.gravity?'−Y · strength '+fixture.graph.gravity:'off'):'—';
  $('collisionStatus').textContent=fixture.graph.collisionRadius?
   'Particle contacts on · '+fixture.graph.collisionRadius+' world-unit radius · exact momentum exchange':
   'Particle contacts off · wall reflections remain independent';
  $('boundaryInfo').textContent=fixture.graph.boundaryExtent?
   '+/-'+(fixture.graph.boundaryExtent/fixture.graph.precision).toFixed(0)+' world units (six faces)':'off';
  note(cfg.mode==='flock'?
   'Reversible boids: alignment, cohesion and separation · exact rewind':
   cfg.mode==='dynamic'?
    (cfg.dynamicForceModel==='legacy'?'Original quantized':'Smooth Q14 finite-range')+
    ' contacts · live strength · exact GPU rewind':
   (cfg.bondedForceModel==='legacy'?'Original quantized':'Smooth Q14')+
   ' central bonds · live strength · integer exact inverse');
  playing=autoplay;
  playbackDirection=1;
 }catch(e){note('Initialization error: '+e.message);console.error(e)}
 finally{loading=false;updateControls()}
}
function spacingLabel(n){return n.toString()}
function updateControls(syncHistory=false){
 const selectedMode=$('connectivity').value;
 $('springControls').hidden=selectedMode==='straight'||selectedMode==='flock';
 $('dynamicForceControls').hidden=selectedMode!=='dynamic';
 $('bondedForceControls').hidden=selectedMode!=='bonded';
 $('flockControls').hidden=selectedMode!=='flock';
 $('linearControls').hidden=selectedMode!=='straight';
 $('gravityControls').hidden=selectedMode!=='straight'||!$('enableGravity').checked;
 $('neighborControls').hidden=!['dynamic','flock'].includes(selectedMode);
 $('followFlockLabel').hidden=selectedMode!=='flock';
 $('collisionRadiusControls').hidden=!$('particleCollisions').checked;
 $('collisionRadiusValue').textContent=$('collisionRadius').value+'%';

 if(syncHistory&&solver&&!loading){
  const c=solver.coefficientsAt();
  $('stiffness').value=c.stiffness;
  $('restScale').value=Math.round(c.restScale256*100/256);
  $('contactRange').value=Math.round(c.cutoff*100/solver.graph.spacing);
  $('alignment').value=c.alignment??16;
  $('coupling').value=c.coupling??8;
  $('cohesion').value=c.cohesion??0;
  $('separation').value=c.separation??0;
  if(selectedMode==='straight'){
   $('enableGravity').checked=(c.gravity??0)>0;
   if((c.gravity??0)>0)$('gravity').value=c.gravity;
  }
 }
 $('play').textContent=playing&&playbackDirection===1?'Pause':'Play';
 $('reverse').textContent=playing&&playbackDirection===-1?'Pause':'Reverse';
 $('play').setAttribute('aria-pressed',String(playing&&playbackDirection===1));
 $('reverse').setAttribute('aria-pressed',String(playing&&playbackDirection===-1));
 $('play').disabled=!solver||loading;
 $('reverse').disabled=!solver||solver.tick===0||loading;
 $('followFlock').disabled=Boolean(solver?.graph.boundaryExtent)||solver?.graph.mode==='straight';
 const straight=solver?.graph.mode==='straight';
 $('showVelocity').disabled=!(solver&&['flock','straight'].includes(solver.graph.mode));
 for(const id of ['stiffness','alignment','coupling','restScale','contactRange'])
  $(id).disabled=Boolean(straight);
 for(const id of ['alignment','coupling'])
  $(id).disabled=selectedMode!=='flock';
 const flock=selectedMode==='flock';
 for(const id of ['cohesion','separation'])
  $(id).disabled=!flock;
 $('gravity').disabled=selectedMode!=='straight'||!$('enableGravity').checked;
 $('back').disabled=!solver||solver.tick===0||loading;
 $('back64').disabled=!solver||solver.tick===0||loading;
 $('forward').disabled=!solver||loading;
 $('forward64').disabled=!solver||loading;
 $('verify').disabled=!solver||loading;
 ticks.textContent=String(solver?.tick||0);
 $('stiffnessValue').textContent=$('stiffness').value;
 $('restScaleValue').textContent=$('restScale').value+'%';
 $('contactRangeValue').textContent=$('contactRange').value+'%';
 $('perturbValue').textContent=$('perturb').value;
 $('opacityValue').textContent=Math.round(Number($('edgeOpacity').value)*100)+'%';
 $('alignmentValue').textContent=$('alignment').value;
 $('couplingValue').textContent=$('coupling').value;
 $('cohesionValue').textContent=$('cohesion').value;
 $('separationValue').textContent=$('separation').value;
 $('gravityValue').textContent=$('gravity').value;
 $('trailPersistenceValue').textContent=$('trailPersistence').value+'%';
}
function advance(n,reverse=false){
 if(!solver||loading)return;
 if(reverse&&solver.tick===0)return;
 const count=reverse?Math.min(solver.tick,n):n;
 if(count>0)solver.step(count,{reverse});
 updateControls(true);
}
function resize(){
 const width=Math.max(canvas.clientWidth,1);
 const height=Math.max(canvas.clientHeight,1);
 const ratio=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.max(1,Math.floor(width*ratio));
 canvas.height=Math.max(1,Math.floor(height*ratio));
}
// The camera's geometric origin is (0,0,0). A reflecting enclosure
// changes only the box uniform, never this focal point.
function viewScale(){
 if(!solver)return 1;
 return zoom*1.75/(Math.max(...graphSize)*solver.graph.spacing*solver.graph.precision);
}
function cameraDistanceForScale(scale=viewScale()){
 // Orbit distance is in the same integer position units as the particles.
 // Maintain a finite camera outside the source sphere at high zoom while
 // letting scale control the field of view; never alter the physics state.
 const radius=solver?Math.max(...graphSize)*solver.graph.spacing*solver.graph.precision*0.5:1;
 return Math.max(radius*2.5,2/Math.max(scale,1e-10));
}
function cameraCenterForScale(scale=viewScale()){
 const useFollow=solver?.graph.mode==='flock'&&!solver.graph.boundaryExtent&&$('followFlock').checked;
 const baseCenter=useFollow?
   flockOrigin.map((v,i)=>v+solver.tick*flockDrift[i]):[0,0,0];
 const unitsPerPixel=2/(Math.max(canvas.height,1)*scale);
 const dx=panX*unitsPerPixel,dy=panY*unitsPerPixel;
 const cy=Math.cos(angleX),sy=Math.sin(angleX);
 const cp=Math.cos(angleY),sp=Math.sin(angleY);
 return [
  baseCenter[0]-dx*cy+dy*sp*sy,
  baseCenter[1]+dy*cp,
  baseCenter[2]-dx*sy-dy*sp*cy,
  cameraDistanceForScale(scale)
 ];
}
function updateContactMarks(now=performance.now()){
 if(!solver||!contactMarkGroups||!contactMarkPipeline)return;
 if(marksTick===solver.tick&&marksCurrent===solver.current)return;
 device.queue.writeBuffer(contactMarkUniform,0,new Int32Array([
  solver.graph.count,solver.graph.precision,solver.graph.collisionRadius??0,
  solver.graph.boundaryExtent??0,Math.trunc(now),0,0,0
 ]));
 const enc=device.createCommandEncoder({label:'Pure VFX collision markers'});
 const pass=enc.beginComputePass();
 pass.setPipeline(contactMarkPipeline);
 pass.setBindGroup(0,contactMarkGroups[solver.current]);
 pass.dispatchWorkgroups(Math.ceil(solver.graph.count/128));
 pass.end();device.queue.submit([enc.finish()]);
 marksTick=solver.tick;marksCurrent=solver.current;
}
function render(){
 if(loading||!solver||!device||!context||!renderPipeline)return;
 updateContactMarks();
 if(canvas.width<1||canvas.height<1)resize();
 const scale=viewScale();
 device.queue.writeBuffer(viewBuffer,0,new Float32Array([
  canvas.width,canvas.height,scale,
  Math.max(1.2,4.3*6/Math.max(...graphSize))*(window.devicePixelRatio||1),
  angleX,angleY,Number($('edgeOpacity').value),
  (solver.graph.mode==='dynamic'||solver.graph.mode==='flock')?
   (solver.graph.cutoff*solver.graph.precision)**2:-1,
 ]));
 device.queue.writeBuffer(viewBuffer,32,new Int32Array([
  solver.graph.precision,solver.graph.cutoff**2,
  (solver.graph.mode==='dynamic'||solver.graph.mode==='flock')?1:0,0
 ]));
 // Camera center and enclosure size are distinct GPU uniforms.
 const cameraCenter=cameraCenterForScale(scale);
 device.queue.writeBuffer(viewBuffer,48,new Float32Array(cameraCenter));
 device.queue.writeBuffer(viewBuffer,64,new Float32Array([
  solver.graph.boundaryExtent??0,performance.now(),
  $('collisionPulse').checked?1:0,$('orthographicCamera').checked?0:1
 ]));
 const trailGroup=updateTrailHistory();
 const enc=device.createCommandEncoder();
 const pass=enc.beginRenderPass({
  colorAttachments:[{view:context.getCurrentTexture().createView(),
   clearValue:{r:0.018,g:0.025,b:0.04,a:1},loadOp:'clear',storeOp:'store'}],
 });
 if(trailGroup){
  pass.setPipeline(trailComposePipeline);
  pass.setBindGroup(0,trailGroup);
  pass.draw(3);
 }
 if(solver.graph.boundaryExtent){
  pass.setPipeline(boxPipeline);
  pass.setBindGroup(0,boxGroup);
  pass.draw(24);
 }
 if($('showEdges').checked&&edgeCount>0){
  pass.setPipeline(edgePipeline);
  pass.setBindGroup(0,edgeGroups[solver.current]);
  pass.draw(2,edgeCount);
 }
 if($('showVelocity').checked&&velocityGroups&&
    (solver.graph.mode==='flock'||solver.graph.mode==='straight')){
  pass.setPipeline(velocityPipeline);
  pass.setBindGroup(0,velocityGroups[solver.current]);
  pass.draw(6,Math.ceil(solver.graph.count/3));
 }
 pass.setPipeline(renderPipeline);
 pass.setBindGroup(0,renderGroups[solver.current]);
 pass.draw(4,solver.graph.count);
 pass.end();device.queue.submit([enc.finish()]);
}
function frame(now){
 try{
  if(playing&&solver){
   // Both directions use the same exact GPU solver and live coefficient history.
   if(playbackDirection<0&&solver.tick===0){
    playing=false;
    updateControls();
   }else{
    advance(solver.graph.mode==='flock'?1:2,playbackDirection<0);
    if(playbackDirection<0&&solver.tick===0){
     playing=false;
     updateControls();
    }
   }
  }
  render();
 }catch(e){playing=false;note('Runtime error: '+e.message);console.error(e)}
 requestAnimationFrame(frame);
}
function activatePreset(name,{autoplay=true,build=true}={}){
 if(loading)return;
 const preset=SPRING_PRESETS[name];
 if(!preset)throw Error('Unknown Springs V2 preset '+name);
 const values={
  connectivity:preset.mode,shape:preset.shape,grid:preset.side,precision:preset.precision,
  stiffness:preset.stiffness,restScale:preset.restScale,perturb:preset.perturb,
  contactRange:preset.contactRange,collisionRadius:preset.collisionRadius,
  alignment:preset.alignment,coupling:preset.coupling,
  cohesion:preset.cohesion,separation:preset.separation,gravity:preset.gravity
 };
 for(const [id,value] of Object.entries(values))$(id).value=String(value);
 $('bondedForceModel').value='smooth';
 $('dynamicForceModel').value='smooth';
 $('reflectBoundary').checked=preset.reflect;
 $('particleCollisions').checked=preset.collisions;
 $('enableGravity').checked=preset.enableGravity;
 $('collisionPulse').checked=true;
 $('showEdges').checked=preset.showEdges;
 $('showVelocity').checked=preset.showVelocity;
 $('showTrails').checked=true;
 $('followFlock').checked=false;
 $('edgeOpacity').value='.55';
 $('trailPersistence').value='95';
 activeDemo=name;
 for(const label of DEMO_NAMES){
  const button=$('demo'+label[0].toUpperCase()+label.slice(1));
  button.setAttribute('aria-pressed',String(label===name));
 }
 const allPairs=name==='flock'||name==='dynamic'||name==='linear';
 $('presetStatus').textContent=name[0].toUpperCase()+name.slice(1)+
  ' · 1/96 precision · '+(allPairs?'512':'6,272')+
  ' spherical particles · screenshot coefficients';
 angleX=-.55;angleY=.4;zoom=1;panX=panY=0;
 trailValid=false;
 updateControls();
 if(build)void reset({autoplay});
}
for(const name of DEMO_NAMES){
 $('demo'+name[0].toUpperCase()+name.slice(1)).addEventListener('click',
  ()=>activatePreset(name,{autoplay:true}));
}
function markCustomSettings(){
 activeDemo=null;
 for(const name of DEMO_NAMES)
  $('demo'+name[0].toUpperCase()+name.slice(1))
   .setAttribute('aria-pressed','false');
 $('presetStatus').textContent='Custom settings · exact inverse retained';
}
$('play').addEventListener('click',()=>{
 if(!solver||loading)return;
 playing=!(playing&&playbackDirection===1);
 playbackDirection=1;
 updateControls();
});
$('reverse').addEventListener('click',()=>{
 if(!solver||loading||solver.tick===0)return;
 playing=!(playing&&playbackDirection===-1);
 playbackDirection=-1;
 updateControls();
});
$('forward').addEventListener('click',()=>{playing=false;advance(1)});
$('back').addEventListener('click',()=>{playing=false;advance(1,true)});
$('forward64').addEventListener('click',()=>{playing=false;advance(64)});
$('back64').addEventListener('click',()=>{playing=false;advance(64,true)});
$('reset').addEventListener('click',()=>{void reset({autoplay:false})});
$('verify').addEventListener('click',async()=>{
 if(!solver)return;
 playing=false;updateControls();note('Checking GPU↔CPU parity and 64-tick exact rewind…');
 $('verify').disabled=true;
 try{
  const r=await solver.certify({roundtrip:64});
  note((r.passed?'PASS':'FAIL')+' · GPU↔CPU mismatches '+r.cpuMismatches+
   ' · inverse mismatches '+r.inverseMismatches+' · momentum ['+r.momentum.join(', ')+
   '] · checksum 0x'+r.checksum.toString(16));
 }catch(e){note('Verification failed: '+e.message);console.error(e)}
 finally{updateControls()}
});
for(const id of ['grid','perturb','precision','shape','connectivity']){
 $(id).addEventListener('input',()=>{playing=false;updateControls()});
 $(id).addEventListener('change',()=>{
  if(id==='connectivity'){
   const map={bonded:'springs',flock:'flock',dynamic:'dynamic',straight:'linear'};
   activatePreset(map[$('connectivity').value],{autoplay:false});
   return;
  }
  markCustomSettings();
  playing=false;
  void reset({autoplay:false});
 });
}
$('reflectBoundary').addEventListener('change',()=>{void reset({autoplay:false})});
$('dynamicForceModel').addEventListener('change',()=>{playing=false;void reset({autoplay:false})});
$('bondedForceModel').addEventListener('change',()=>{playing=false;void reset({autoplay:false})});
$('particleCollisions').addEventListener('change',()=>{playing=false;updateControls();void reset({autoplay:false})});
$('collisionRadius').addEventListener('input',updateControls);
$('collisionRadius').addEventListener('change',()=>{playing=false;void reset({autoplay:false})});
$('collisionPulse').addEventListener('change',updateControls);
$('orthographicCamera').addEventListener('change',()=>{trailValid=false;});
$('enableGravity').addEventListener('change',()=>{updateControls();applyLiveCoefficients()});
$('showTrails').addEventListener('change',()=>{trailValid=false;updateControls()});
$('trailPersistence').addEventListener('input',updateControls);
$('showEdges').addEventListener('change',updateControls);
$('showVelocity').addEventListener('change',updateControls);
$('toggleHud').addEventListener('click',()=>{
 const hud=$('canvasHud');
 hud.hidden=!hud.hidden;
 $('toggleHud').textContent=hud.hidden?'Show HUD':'Hide HUD';
 $('toggleHud').setAttribute('aria-pressed',String(!hud.hidden));
});
$('edgeOpacity').addEventListener('input',updateControls);
function applyLiveCoefficients(){
 if(!solver||loading)return;
 try{
  const c=solver.setCoefficients({
   stiffness:Number($('stiffness').value),
   restScale256:Math.round(Number($('restScale').value)*256/100),
   cutoff:Math.round(solver.graph.spacing*Number($('contactRange').value)/100),
   alignment:Number($('alignment').value),
   coupling:Number($('coupling').value),
   cohesion:Number($('cohesion').value),
   separation:Number($('separation').value),
   gravity:$('connectivity').value==='straight'&&$('enableGravity').checked?
    Number($('gravity').value):0,
  });
  note('Live at tick '+solver.tick+
   ' · spring '+c.stiffness+
   ' · rest '+(c.restScale256/256).toFixed(3)+
   ' · contact radius '+c.cutoff+
   ' · cohesion '+c.cohesion+' · separation '+c.separation+
   ' · downward gravity '+(c.gravity??0)+' · recorded for exact rewind');
 }catch(error){note('Live coefficient error: '+error.message)}
 updateControls();
}
for(const id of ['stiffness','restScale','contactRange','alignment','coupling',
 'cohesion','separation','gravity']){
 $(id).addEventListener('input',applyLiveCoefficients);
}
// A pointer rotates the instrument; two fingers pan by their centroid and
// pinch to zoom. No movement control writes to the particle state.
const pointers=new Map();
let gesturePrevious=null;
function gesture(){
 const pts=[...pointers.values()];
 if(pts.length<2)return null;
 const [a,b]=pts;
 return {x:(a.x+b.x)*.5,y:(a.y+b.y)*.5,
   distance:Math.hypot(a.x-b.x,a.y-b.y)};
}
function releasePointer(e){
 pointers.delete(e.pointerId);
 gesturePrevious=gesture();
}
canvas.addEventListener('pointerdown',e=>{
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 canvas.setPointerCapture(e.pointerId);
 gesturePrevious=gesture();
});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 const previous=pointers.get(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 const current=gesture();
 if(current){
  if(gesturePrevious){
   panX+=current.x-gesturePrevious.x;
   panY+=current.y-gesturePrevious.y;
   if(gesturePrevious.distance>0)
    zoom=Math.max(.02,Math.min(5,
     zoom*current.distance/gesturePrevious.distance));
  }
  gesturePrevious=current;
 }else if(e.shiftKey||e.buttons===2){
  panX+=e.clientX-previous.x;
  panY+=e.clientY-previous.y;
 }else{
  angleX+=(e.clientX-previous.x)*.008;
  angleY=Math.max(-1.4,Math.min(1.4,
   angleY+(e.clientY-previous.y)*.008));
 }
 trailValid=false;
});
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('lostpointercapture',releasePointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
 e.preventDefault();trailValid=false;
 zoom=Math.max(.02,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));
},{passive:false});
$('resetCamera').addEventListener('click',()=>{
 angleX=-.55;angleY=.4;zoom=1;panX=panY=0;trailValid=false;
});
$('viewXY').addEventListener('click',()=>{angleX=0;angleY=0;trailValid=false;});
$('viewXZ').addEventListener('click',()=>{angleX=0;angleY=Math.PI/2;trailValid=false;});
$('viewYZ').addEventListener('click',()=>{angleX=Math.PI/2;angleY=0;trailValid=false;});
// Read-only camera/tick diagnostics for the isolated V2 inspector.
window.__springsV2=Object.freeze({
 camera:()=>Object.freeze({
  yaw:angleX,pitch:angleY,zoom,panX,panY,
  projection:$('orthographicCamera').checked?'orthographic':'perspective',
  distance:cameraDistanceForScale(),
  center:cameraCenterForScale().slice(0,3),
  boundaryExtent:solver?.graph.boundaryExtent??0
 }),
 tick:()=>solver?.tick??null,
 // Read-only diagnostic: one explicit GPU readback, never called per frame.
 speed:async()=>{
  if(!solver)return null;
  const source=solver,tick=source.tick,raw=await source.read();
  const denom=source.graph.precision*256;
  let max=0,total=0;
  for(let i=0;i<source.graph.count;i++){
   const p=i*8;
   const v=Math.hypot(raw[p+4],raw[p+5],raw[p+6])/denom;
   max=Math.max(max,v);total+=v;
  }
  return Object.freeze({
   tick,particles:source.graph.count,
   maxWorldUnitsPerTick:max,
   meanWorldUnitsPerTick:total/source.graph.count
  });
 }
});
window.addEventListener('resize',resize);
async function start(){
 if(!navigator.gpu){note('This browser does not provide WebGPU');return;}
 try{
  await initGPU();
  resize();
  $('orthographicCamera').checked=false; // Projective view is the startup default.
  activatePreset('flock',{autoplay:false,build:false});
  await reset({autoplay:true});
  requestAnimationFrame(frame);
 }catch(e){note('WebGPU initialization failed: '+e.message);console.error(e)}
}
void start();
