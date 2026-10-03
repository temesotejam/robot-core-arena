const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const rise=(elapsed,start,end)=>ease((elapsed-start)/(end-start));
const envelope=(elapsed,up,hold,end)=>rise(elapsed,0,up)*(1-rise(elapsed,hold,end));

// This is a visual response to an observed air -> ground transition, not an
// action or a movement state. Simulation time owns every phase, so rendering a
// paused frame twice cannot integrate another bounce or restart the recovery.
export function sampleLanding(ref,u,time){
 const previous=ref.landing;
 const reset=!previous||time<previous.time||time-previous.time>.25||
  Math.hypot(u.x-previous.x,u.z-previous.z)>.65||Math.abs(u.y-previous.y)>.65||previous.kind!==ref.kind;
 const state=reset?{kind:ref.kind,time,x:u.x,y:u.y,z:u.z,grounded:!!u.grounded,vy:u.vy||0,start:null,strength:0}:previous;
 const blocked=ref.kind!=='sword'||u.dead||u.knockdown||u.down>0||u.rise>0||u.stun>0||u.statusTime>0||u.guardBreak>0||u.dashTime>0||u.charging||!!u.attack||u.motion?.weapon==='sword';
 if(blocked||!u.grounded)state.start=null;
 else if(!reset&&!state.grounded&&u.grounded&&state.vy<=.1){
  state.start=time;state.strength=clamp(.62+Math.max(0,-state.vy)*.06,.65,1);
 }
 state.time=time;state.x=u.x;state.y=u.y;state.z=u.z;state.grounded=!!u.grounded;state.vy=u.vy||0;ref.landing=state;
 if(state.start===null)return null;
 const elapsed=time-state.start;if(elapsed>=.50){state.start=null;return null;}
 // The pelvis receives the landing, stays low briefly, and recovers before
 // the chest and gaze. Guard returns on its own curve, not as a rigid copy of
 // the chest. These timings are authored game values, not anime measurements.
 const strength=state.strength,compression=envelope(elapsed,.085,.145,.34)*strength,
  chest=envelope(elapsed,.105,.18,.42)*strength,head=envelope(elapsed,.105,.22,.50)*strength,
  guard=rise(elapsed,.025,.16)*(1-rise(elapsed,.28,.50))*strength;
 return {elapsed,drop:-.048*compression,body:[.16*chest,0,.012*chest],head:[-.13*head,0,-.012*head],guard};
}
