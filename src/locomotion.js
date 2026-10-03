// Ground walking is deliberately slower than boosting: the short legs must
// actually reach a planted foot for the whole support part of a step.
export const GROUND_WALK_FACTOR=.30;
const TAU=Math.PI*2,ANKLE=.035,SWING=.82;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const mix=(a,b,t)=>a+(b-a)*t;
function worldFoot(x,z,yaw,side,forward=.045){
 return [x+Math.cos(yaw)*side*.105+Math.sin(yaw)*forward,0,z-Math.sin(yaw)*side*.105+Math.cos(yaw)*forward];
}
function localFoot(world,u){
 const x=world[0]-u.x,z=world[2]-u.z,c=Math.cos(u.yaw),s=Math.sin(u.yaw);
 return [c*x-s*z,world[1]-u.y,s*x+c*z];
}
function newFoot(world,yaw,id=0){return {world,from:[...world],yaw,fromYaw:yaw,planted:true,contact:id,pitch:0,roll:0};}

// Each robot owns its contacts. Only actual travel advances the alternating
// steps, so pausing, wall collisions and changing render rates cannot skate
// the planted foot or make the robot march against an obstruction.
export function sampleLocomotion(ref,u,time,{groundAt}={}){
 const floor=(x,z)=>groundAt?groundAt(x,z):u.y;
 let state=ref.locomotion;
 let dt=state?Math.max(0,time-state.time):0,dx=state?u.x-state.x:0,dz=state?u.z-state.z:0,distance=Math.hypot(dx,dz);
 const melee=!!u.attack||!!u.motion&&u.motion.weapon===ref.kind&&!u.stats?.weapon?.ranged&&u.motion.elapsed<=u.motion.duration+.2;
 const disabled=u.dead||u.down>0||u.rise>0||u.knockdown||u.stun>0||u.statusTime>0||u.guardBreak>0;
 if(state&&time===state.time&&distance===0&&u.y===state.y&&u.yaw===state.yaw&&!disabled&&!melee&&u.grounded&&!(u.dashTime>0)&&['walk','idle'].includes(state.mode))return state.result||null;
 let mode=disabled||melee?'pose':!u.grounded?'air':u.dashTime>0?'dash':ref.legFrame==='panzer'?'tracks':distance>1e-6&&dt>0?'walk':'idle';
 if(!state||time<state.time||distance>.65||Math.abs(u.y-state.y)>.65||dt>.25){
  state=ref.locomotion={mode:'idle',time,x:u.x,z:u.z,y:u.y,yaw:u.yaw,phase:0,step:0,swing:0,weight:0,feet:[-1,1].map(side=>{
   const p=worldFoot(u.x,u.z,u.yaw,side);p[1]=floor(p[0],p[2])+ANKLE;return newFoot(p,u.yaw);
  })};
  dt=0;dx=0;dz=0;distance=0;if(mode==='walk')mode='idle';
 }
 const was=state.mode;state.mode=mode;
 if(['pose','air','tracks'].includes(mode)){
  state.time=time;state.x=u.x;state.z=u.z;state.y=u.y;state.yaw=u.yaw;state.weight=0;state.started=false;
  state.result=null;return null;
 }
 if(mode==='dash'){
  state.started=false;state.weight=0;
  // Both feet stay low in a stable split stance. Boosting does not play the
  // walking cycle, even when its much larger displacement crosses a step.
  const localX=Math.cos(u.yaw)*u.vx-Math.sin(u.yaw)*u.vz,localZ=Math.sin(u.yaw)*u.vx+Math.cos(u.yaw)*u.vz,n=Math.hypot(localX,localZ)||1;
  const feet=[-1,1].map((side,i)=>{
   const forward=i?.11:-.065,p=worldFoot(u.x,u.z,u.yaw,side,forward);p[1]=floor(p[0],p[2])+ANKLE;
   state.feet[i]=newFoot(p,u.yaw,state.feet[i].contact+1);return localFoot(p,u);
  });
  state.time=time;state.x=u.x;state.z=u.z;state.y=u.y;state.yaw=u.yaw;
  return state.result={mode,feet,footYaw:[0,0],pitch:[0,0],roll:[0,0],body:[localZ/n*.13,0,-localX/n*.10],drop:-.028,shift:[0,-.012],armSwing:0};
 }
 if(mode==='walk'){
  const speed=distance/Math.max(dt,.0001),dir=[dx/distance,dz/distance];
  if(!state.started||!['walk','idle'].includes(was)){
   // Rebase contacts after a boost, a jump or a committed attack. Initial
   // stride is shorter because both feet started underneath the pelvis.
   if(was!=='idle')state.feet=[-1,1].map((side,i)=>{const p=worldFoot(u.x-dx,u.z-dz,u.yaw,side);p[1]=floor(p[0],p[2])+ANKLE;return newFoot(p,u.yaw,state.feet[i].contact+1);});
   state.started=true;state.phase=0;state.swing=0;state.stepLength=.14;state.step=0;state.stopping=null;
  }
  const begin=()=>{
   const f=state.feet[state.swing];f.from=[...f.world];f.fromYaw=f.yaw;f.planted=false;
  };
  if(was==='idle'&&state.stopping){state.phase=0;state.stepLength=.14;state.swing=1-state.swing;state.stopping=null;}
  if(state.phase===0)begin();
  let travel=distance;
  while(travel>1e-9){
   const remaining=(1-state.phase)*state.stepLength,part=Math.min(travel,remaining);state.phase+=part/state.stepLength;travel-=part;
   // At a touchdown the target is the remaining root travel plus the small
   // lead of the next support foot. It is constant during straight walking.
   const consumed=distance-travel,rx=u.x-dx+dir[0]*consumed,rz=u.z-dz+dir[1]*consumed;
   const f=state.feet[state.swing],s=clamp(state.phase/SWING,0,1),p=worldFoot(rx,rz,u.yaw,state.swing?1:-1,0),ahead=(1-state.phase)*state.stepLength+.11;
   p[0]+=dir[0]*ahead;p[2]+=dir[1]*ahead;p[1]=floor(p[0],p[2])+ANKLE;
   if(!f.planted){
    const t=smooth(s),lift=Math.sin(Math.PI*s)**2*.072;
    f.world=[mix(f.from[0],p[0],t),mix(f.from[1],p[1],t)+lift,mix(f.from[2],p[2],t)];
    // Sample the ground under the moving foot too, to clear rising ramps.
    f.world[1]=Math.max(f.world[1],floor(f.world[0],f.world[2])+ANKLE+lift);
    f.yaw=f.fromYaw+wrap(u.yaw-f.fromYaw)*t;
    const localX=Math.cos(u.yaw)*dir[0]-Math.sin(u.yaw)*dir[1],localZ=Math.sin(u.yaw)*dir[0]+Math.cos(u.yaw)*dir[1],roll=Math.sin(TAU*s)*Math.sin(Math.PI*s)*.20;
    f.pitch=localZ*roll;f.roll=-localX*roll*.5;
    if(s>=1){f.planted=true;f.contact++;f.pitch=0;f.roll=0;}
   }
   if(state.phase>=1-1e-9){state.phase=0;state.step++;state.swing=1-state.swing;state.stepLength=clamp(.15+speed*.105,.17,.28);begin();}
  }
  state.direction=dir;state.weight=Math.min(1,state.weight+dt/.10);state.stopping=null;
 }else if(state.started){
  // A released input ends movement immediately. Lower the raised foot in
  // place instead of sliding both feet back into a generic idle position.
  if(!state.stopping)state.stopping={time,feet:state.feet.map(f=>[...f.world])};
  const t=smooth((time-state.stopping.time)/.12);
  for(const [i,f]of state.feet.entries())if(!f.planted){f.world[1]=mix(state.stopping.feet[i][1],floor(f.world[0],f.world[2])+ANKLE,t);f.pitch*=1-t;f.roll*=1-t;if(t===1){f.planted=true;f.contact++;}}
  state.weight=Math.max(0,state.weight-dt/.12);
 }
 const feet=state.started?state.feet.map(f=>localFoot(f.world,u)):null;
 const dir=state.direction||[Math.sin(u.yaw),Math.cos(u.yaw)],localX=Math.cos(u.yaw)*dir[0]-Math.sin(u.yaw)*dir[1],localZ=Math.sin(u.yaw)*dir[0]+Math.cos(u.yaw)*dir[1],support=(state.swing?-1:1)*Math.sin(Math.PI*state.phase),weight=state.weight;
 state.time=time;state.x=u.x;state.z=u.z;state.y=u.y;state.yaw=u.yaw;
 return state.result=feet?{mode,feet,footYaw:state.feet.map(f=>wrap(f.yaw-u.yaw)),pitch:state.feet.map(f=>f.pitch),roll:state.feet.map(f=>f.roll),body:[localZ*.045*weight,-support*.032*weight,-support*.025*weight-localX*.025*weight],drop:(-.028-.009*Math.sin(Math.PI*state.phase))*weight,shift:[support*.008*weight,0],armSwing:-support*.026*weight}:null;
}
