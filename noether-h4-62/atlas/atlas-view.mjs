import {chapters} from './chapters.mjs';
import {buildScenes} from './atlas-model.mjs';

const $=id=>document.getElementById(id);
const key=document.body.dataset.chapter??'origin';
const chapter=chapters.find(c=>c.key===key);
if(!chapter)throw Error('Unknown atlas chapter '+key);
const steps=buildScenes(key);
if(!steps?.length)throw Error('Empty chapter '+key);
for(const a of document.querySelectorAll('.chapter-link')){
 if(a.getAttribute('href')===chapter.href)a.setAttribute('aria-current','page');
}
let step=0,yaw=-.48,pitch=.3,zoom=1,panX=0,panY=0,labels=true,orthographic=false;
let playDirection=0,lastStepTime=0,lastFrame=0;
const canvas=$('scene'),context=canvas.getContext('2d');
if(!context)throw Error('2D canvas unavailable');
const colors={ink:'#344651',muted:'#9aa8ae',blue:'#2972ad',red:'#bd6854',gold:'#aa8746'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scenePoints=scene=>{
 const pts=[];
 for(const n of scene.nodes??[])pts.push(n.p);
 for(const e of scene.edges??[]){pts.push(e.a,e.b);}
 for(const a of scene.arrows??[]){pts.push(a.a,a.b);}
 return pts.length?pts:[[0,0,0]];
};
let measure={w:1,h:1,dpr:1};
function resize(){
 const rect=canvas.getBoundingClientRect();
 const w=Math.max(2,Math.round(rect.width));
 const h=Math.max(2,Math.round(rect.height));
 const dpr=Math.min(2,window.devicePixelRatio||1);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
 }
 context.setTransform(dpr,0,0,dpr,0,0);
 measure={w,h,dpr};
}
function updateScene(){
 const data=steps[step];
 $('stepCounter').textContent=
  String(step+1).padStart(2,'0')+' / '+String(steps.length).padStart(2,'0');
 $('stepTitle').textContent=data.title;
 $('stepExplain').textContent=data.explain;
 $('stepEquation').textContent=data.equation;
 $('stateReadout').textContent=data.readout||'No state changes in this stage.';
 $('stageKind').textContent=data.scene.kind||'ROTATABLE 3D VIEW';
 $('visualLegend').textContent='CHAPTER '+chapter.num+' · '+chapter.title.toUpperCase();
 const cert=$('certificate');
 cert.textContent=data.certificate?
  data.certificate:'STEP '+(step+1)+' · Observe the transformation, then continue.';
 cert.className='certificate'+(data.certificate?' passed':'');
 $('previous').disabled=step===0;
 $('next').disabled=step===steps.length-1;
 for(const [i,button] of [...$('stepTrack').children].entries()){
  button.setAttribute('aria-current',String(i===step?'step':'false'));
  button.title='Stage '+(i+1)+': '+steps[i].title;
 }
}
for(let i=0;i<steps.length;i++){
 const b=document.createElement('button');
 b.type='button';b.setAttribute('aria-label','Jump to stage '+(i+1)+': '+steps[i].title);
 b.addEventListener('click',()=>selectStep(i));
 $('stepTrack').append(b);
}
function selectStep(n){
 step=clamp(n,0,steps.length-1);
 updateScene();
}
function stop(){
 playDirection=0;lastStepTime=0;
 $('play').textContent='Play';$('reverse').textContent='Reverse';
}
function play(direction){
 if(playDirection===direction){stop();return;}
 playDirection=direction;lastStepTime=performance.now();
 $('play').textContent=direction===1?'Pause':'Play';
 $('reverse').textContent=direction===-1?'Pause reverse':'Reverse';
 if(direction===1&&step===steps.length-1)selectStep(0);
 if(direction===-1&&step===0)selectStep(steps.length-1);
}
$('previous').addEventListener('click',()=>{stop();selectStep(step-1)});
$('next').addEventListener('click',()=>{stop();selectStep(step+1)});
$('play').addEventListener('click',()=>play(1));
$('reverse').addEventListener('click',()=>play(-1));
$('resetSteps').addEventListener('click',()=>{stop();selectStep(0)});
$('resetCamera').addEventListener('click',()=>{yaw=-.48;pitch=.3;zoom=1;panX=panY=0});
$('labels').addEventListener('change',e=>{labels=e.target.checked});
$('projection').addEventListener('change',e=>{orthographic=e.target.checked});
$('menuToggle').addEventListener('click',()=>{
 const rail=document.querySelector('.chapters');
 const opened=rail.classList.toggle('open');
 $('menuToggle').setAttribute('aria-expanded',String(opened));
});
let pointer=null;
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture(e.pointerId);
 pointer={id:e.pointerId,x:e.clientX,y:e.clientY,shift:e.shiftKey||e.button===2};
 canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',e=>{
 if(!pointer||e.pointerId!==pointer.id)return;
 const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
 if(pointer.shift){panX+=dx;panY+=dy;}
 else{yaw+=dx*.006;pitch=clamp(pitch+dy*.006,-1.49,1.49);}
 pointer.x=e.clientX;pointer.y=e.clientY;
});
const endPointer=e=>{
 if(pointer?.id===e.pointerId)pointer=null;
 canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
 e.preventDefault();
 zoom=clamp(zoom*Math.exp(-e.deltaY*.0012),.18,12);
},{passive:false});
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 if(e.key==='ArrowRight'){e.preventDefault();stop();selectStep(step+1);}
 if(e.key==='ArrowLeft'){e.preventDefault();stop();selectStep(step-1);}
 if(e.key===' '){e.preventDefault();play(1);}
 if(e.key==='Escape')stop();
});
function prepare(scene){
 const points=scenePoints(scene);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of points)for(let axis=0;axis<3;axis++){
  min[axis]=Math.min(min[axis],p[axis]);
  max[axis]=Math.max(max[axis],p[axis]);
 }
 const center=min.map((v,i)=>(v+max[i])/2);
 const radius=Math.max(1.5,...points.map(p=>Math.hypot(
  p[0]-center[0],p[1]-center[1],p[2]-center[2])));
 return {center,radius};
}
function renderer(scene){
 const {w,h}=measure;
 context.clearRect(0,0,w,h);
 const gradient=context.createRadialGradient(w*.5,h*.49,20,w*.5,h*.51,Math.max(w,h)*.7);
 gradient.addColorStop(0,'#fffefb');gradient.addColorStop(1,'#f5f6f2');
 context.fillStyle=gradient;context.fillRect(0,0,w,h);
 const {center,radius}=prepare(scene);
 const distance=Math.max(4.5,4.8*radius);
 const base=Math.min(w,h)*.34/radius*zoom;
 const cosY=Math.cos(yaw),sinY=Math.sin(yaw),cosP=Math.cos(pitch),sinP=Math.sin(pitch);
 const project=p=>{
  const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];
  const rx=cosY*x+sinY*z,rz=cosY*z-sinY*x;
  const ry=cosP*y-sinP*rz,depth=sinP*y+cosP*rz;
  const denominator=distance-depth;
  if(denominator<.04*distance)return null;
  const magnify=orthographic?1:distance/denominator;
  return {x:w/2+panX+rx*base*magnify,
   y:h/2+panY-ry*base*magnify,depth,mag:magnify};
 };
 const segment=(a,b,color,width=1,alpha=1,dash=[])=>{
  const x=project(a),y=project(b);if(!x||!y)return;
  context.save();context.globalAlpha=alpha;context.strokeStyle=color;
  context.lineWidth=width;context.setLineDash(dash);
  context.beginPath();context.moveTo(x.x,x.y);context.lineTo(y.x,y.y);context.stroke();context.restore();
 };
 // A faint, real 3D coordinate tripod is an orientation reference only.
 const axisLen=Math.max(1.8,radius*.6);
 segment([-axisLen,0,0],[axisLen,0,0],'#c1d4e0',1,.45,[5,5]);
 segment([0,-axisLen,0],[0,axisLen,0],'#edc9ba',1,.42,[5,5]);
 segment([0,0,-axisLen],[0,0,axisLen],'#d2d5ce',1,.44,[5,5]);
 const edges=[...(scene.edges??[])].sort((a,b)=>{
  const za=(project(a.a)?.depth??0)+(project(a.b)?.depth??0);
  const zb=(project(b.a)?.depth??0)+(project(b.b)?.depth??0);
  return za-zb;
 });
 for(const e of edges)segment(e.a,e.b,e.color??colors.muted,e.width??1,e.alpha??.6,e.dash??[]);
 for(const a of scene.arrows??[]){
  const from=project(a.a),to=project(a.b);
  if(!from||!to)continue;
  const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
  const angle=Math.atan2(dy,dx),size=Math.min(12,Math.max(5,len*.2));
  context.save();context.lineWidth=a.width??2;context.strokeStyle=a.color??colors.blue;
  context.fillStyle=a.color??colors.blue;context.globalAlpha=.93;
  context.beginPath();context.moveTo(from.x,from.y);context.lineTo(to.x,to.y);context.stroke();
  if(len>8){
   context.beginPath();context.moveTo(to.x,to.y);
   context.lineTo(to.x-Math.cos(angle-.5)*size,to.y-Math.sin(angle-.5)*size);
   context.lineTo(to.x-Math.cos(angle+.5)*size,to.y-Math.sin(angle+.5)*size);
   context.closePath();context.fill();
  }
  if(labels&&a.label&&len>20){
   context.font='10px ui-monospace,Menlo,monospace';
   context.fillText(a.label,to.x+8,to.y-7);
  }
  context.restore();
 }
 const nodes=[...(scene.nodes??[])].sort((a,b)=>(project(a.p)?.depth??0)-(project(b.p)?.depth??0));
 for(const n of nodes){
  const p=project(n.p);if(!p)continue;
  const r=clamp((n.size??6)*p.mag*.85,2,17);
  const halo=context.createRadialGradient(p.x-r*.35,p.y-r*.35,1,p.x,p.y,r*1.7);
  halo.addColorStop(0,'#ffffff');halo.addColorStop(.24,n.color??colors.blue);
  halo.addColorStop(1,'#ffffff00');
  context.fillStyle=halo;context.beginPath();context.arc(p.x,p.y,r*1.7,0,Math.PI*2);context.fill();
  context.fillStyle=n.color??colors.blue;
  context.beginPath();context.arc(p.x,p.y,r*.85,0,Math.PI*2);context.fill();
  if(labels&&n.label){
   context.fillStyle='#3b4b55';context.font='10px ui-monospace,Menlo,monospace';
   context.fillText(n.label,p.x+r+3,p.y-r*.5);
  }
 }
}
function frame(time){
 resize();
 if(playDirection!==0&&time-lastStepTime>1100){
  lastStepTime=time;
  const next=step+playDirection;
  if(next<0||next>=steps.length)stop();else selectStep(next);
 }
 renderer(steps[step].scene);
 lastFrame=requestAnimationFrame(frame);
}
updateScene();
lastFrame=requestAnimationFrame(frame);
window.__atlas={chapter,steps,selectStep,get state(){return{step,yaw,pitch,zoom,playDirection}}};
