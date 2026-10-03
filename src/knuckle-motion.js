import * as THREE from '../vendor/three.module.min.js';
import {meleePose,blendMelee} from './melee-pose.js';
import {swordArm} from './sword-motion.js';

// Original hand-to-hand choreography. W's arm/torso exchanges inform the
// compression, quick passage and counter-load; armed scenes are not labelled
// as footage of this ground combination. The airborne kicks inform the
// chamber, sole-first extension and folded recovery; ground support is ours.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(p,a,b)=>smooth((p-a)/(b-a));
const pulse=(p,a,b,c,d)=>ramp(p,a,b)-ramp(p,c,d);
const feet=[[-.115,.035,.085],[.115,.035,-.025]];
const poles=[[-.12,-.95,-.12],[.12,-.95,-.12]];
const guards={right:[-.195,.755,.180],left:[.195,.745,.155]};
const hand=position=>({position,rotation:[0,0,0]});

// Shape-preserving cubic curves keep velocity through an intermediate key.
// Only reversals and the endpoints settle; unlike smoothstep per key, the
// shoulder, fist and recovery do not stop at every intermediate position.
function curve(keys,p){
 if(p<=keys[0][0])return [...keys[0][1]];
 if(p>=keys.at(-1)[0])return [...keys.at(-1)[1]];
 const slope=(i,c)=>{
  if(i===0||i===keys.length-1)return 0;
  const a=(keys[i][1][c]-keys[i-1][1][c])/(keys[i][0]-keys[i-1][0]),b=(keys[i+1][1][c]-keys[i][1][c])/(keys[i+1][0]-keys[i][0]);
  return a*b<=0?0:2*a*b/(a+b);
 };
 for(let i=0;i<keys.length-1;i++)if(p<=keys[i+1][0]){
  const [a,from]=keys[i],[b,to]=keys[i+1],h=b-a,t=(p-a)/h;
  return from.map((v,c)=>(2*t**3-3*t*t+1)*v+(t**3-2*t*t+t)*h*slope(i,c)+(-2*t**3+3*t*t)*to[c]+(t**3-t*t)*h*slope(i+1,c));
 }
}
function connectedPose({right=guards.right,left=guards.left,body=[.065,-.14,.012],hipYaw=-.06,drop=-.046,shift=[0,0],weight=0,shoulder=[0,0],footYaw=[-.05,.07],elbowPoles=poles,footTargets=feet,footPitch=[0,0],footRoll=[0,0],kneePoles=null}={}){
 const out=meleePose({right:hand(right),left:hand(left),body,hipYaw,drop,shift,weight,feet:footTargets,footYaw,poles:elbowPoles,head:[-body[0]*.8,-body[1]*.95,-body[2]*.75]});
 Object.assign(out,{footPitch,footRoll});if(kneePoles)out.kneePoles=kneePoles;
 for(const [i,side]of ['right','left'].entries())out.joints[side].clavicle=[0,shoulder[i]*.15,shoulder[i]];
 return alignFists(out);
}
function alignFists(out){
 out={...out,joints:{right:{...out.joints.right},left:{...out.joints.left}}};
 for(const side of ['right','left']){
  const j=out.joints[side];
  const fk=swordArm(j),direction=fk.wrist.clone().sub(fk.elbow).normalize();
  // Keep the striking armour face on the forearm axis at every phase, not
  // just at a few contact keys. The elbow creates a hook, never a bent wrist.
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
  j.wrist=new THREE.Quaternion().fromArray(fk.lower.toArray()).invert().multiply(q).normalize().toArray();
  out[side]=swordArm(j).pose;
 }
 return out;
}
const ready=connectedPose();
const recipes=[
 {name:'jabRight',side:'right',type:'straight',coil:[-.235,.770,.080],pass:[-.155,.748,.310],exit:[-.135,.748,.363],load:.17,hit:.32,end:.42,turn:.44,sink:.026},
 {name:'jabLeft',side:'left',type:'straight',coil:[.235,.760,.060],pass:[.155,.742,.308],exit:[.135,.742,.361],load:.15,hit:.30,end:.41,turn:.51,sink:.028},
 {name:'bodyRight',side:'right',type:'body',coil:[-.255,.555,.095],pass:[-.165,.553,.315],exit:[-.145,.550,.361],load:.20,hit:.34,end:.45,turn:.50,sink:.067},
 {name:'bodyLeft',side:'left',type:'body',coil:[.225,.575,.135],pass:[.165,.545,.305],exit:[.145,.542,.356],load:.18,hit:.33,end:.44,turn:.47,sink:.063},
 {name:'hook',side:'right',type:'hook',coil:[-.345,.710,.085],pass:[-.180,.735,.300],exit:[.045,.727,.225],load:.22,hit:.35,end:.46,turn:.72,sink:.040},
 {name:'uppercut',side:'left',type:'upper',coil:[.265,.420,.115],pass:[.180,.585,.328],exit:[.145,.925,.280],load:.23,hit:.35,end:.46,turn:.55,sink:.079},
];

function sampled(r,p){
 if(p<=0||p>=1)return ready;
 const side=r.side,other=side==='right'?'left':'right',sign=side==='right'?1:-1,load=r.load,hit=r.hit,
  drive=pulse(p,load-.085,hit-.045,.46,.90),chest=pulse(p,load-.050,hit+.015,.49,.94),
  preload=pulse(p,0,load*.75,load,hit),sink=pulse(p,0,load,hit+.10,.89),lift=r.type==='upper'?pulse(p,load+.04,hit+.015,.57,.94):0;
 // A short counter-turn loads the strike before the pelvis leads the chest.
 // The head keeps looking at the target while the planted leg supports the
 // larger sideways transfer. This changes the silhouette, not hit timing.
 const yaw=-.14+sign*(-.32*preload+r.turn*chest),body=[.065+(r.type==='body'?.15:r.type==='hook'?.075:.070)*sink-(r.type==='upper'?.18*lift:0),yaw,-sign*.085*chest+.018*(1-chest)],
  hipYaw=-.06+sign*(-.16*preload+(r.turn+.13)*drive),drop=-.046-r.sink*sink*1.12+(r.type==='upper'?.115*lift:0),shift=[-sign*.038*drive,.057*chest];
 const recovery=r.type==='upper'?[-sign*.205,.760,.215]:[-sign*.205,r.type==='body'?.640:.750,.210];
 const strike=curve([[0,guards[side]],[load,r.coil],[hit-.035,r.pass],[hit+.04,r.exit],[.58,recovery],[.82,guards[side]],[1,guards[side]]],p);
 // The spare arm folds towards the cheek as the chest drives. It has its own
 // small counter-motion, rather than mirroring a second punch.
 const guard=[...guards[other]];guard[0]+=sign*.012*chest;guard[1]+=.015*chest;guard[2]-=.013*chest;
 const shoulder=side==='right'?[.050*chest,-.012*preload]:[-.012*preload,.050*chest],footYaw=side==='right'?[-.05+.29*drive,.07]:[-.05,.07-.32*drive];
 const elbowPoles=poles.map(v=>[...v]);
 if(r.type==='hook'){
  const index=side==='right'?0:1,opening=pulse(p,.08,load,.45,.90),target=[-sign*.80,-.15,.07];
  elbowPoles[index]=poles[index].map((v,i)=>v+(target[i]-v)*opening);
 }
 return connectedPose({[side]:strike,[other]:guard,body,hipYaw,drop,shift,weight:Math.max(drive,chest),shoulder,footYaw,elbowPoles});
}
function makeClip(r){
 const sample=p=>sampled(r,p),contact={start:r.hit-(r.type==='straight'?.105:r.type==='body'?.055:.04),center:r.hit,end:r.end};
 return {name:r.name,strikingSide:r.side,contact,prepare:sample(r.load),sample,
  keys:[[0,ready],[r.load,sample(r.load)],[r.hit,sample(r.hit)],[.58,sample(.58)],[1,ready]]};
}
function sampledKick(p){
 if(p<=0||p>=1)return ready;
 const chamber=pulse(p,.015,.16,.48,.75),drive=pulse(p,.14,.285,.48,.75),chest=pulse(p,.17,.335,.52,.79),
  hipYaw=-.06-1.06*drive+.19*pulse(p,0,.13,.17,.30),body=[.065-.20*chest,-.14-.76*chest,.012-.23*chest],
  drop=-.046-.038*chamber,shift=[-.080*chamber,.072*drive];
 // Fold the leg first. Extend the sole towards the opponent, fold it again,
 // and only then put the boot down. Arms counterbalance at different heights.
 const leftFoot=curve([[0,feet[1]],[.16,[.165,.270,.045]],[.285,[-.025,.365,.425]],[.48,[-.055,.365,.435]],[.63,[.165,.245,.075]],[.75,feet[1]],[1,feet[1]]],p),
  right=curve([[0,guards.right],[.16,[-.245,.855,.090]],[.35,[-.275,.875,.120]],[.48,[-.275,.875,.120]],[.74,guards.right],[1,guards.right]],p),
  left=curve([[0,guards.left],[.16,[.265,.570,.055]],[.35,[.300,.565,.055]],[.48,[.300,.565,.055]],[.74,guards.left],[1,guards.left]],p);
 return connectedPose({right,left,body,hipYaw,drop,shift,weight:Math.max(chamber,drive),footTargets:[feet[0],leftFoot],
  footYaw:[-.05-.37*drive,.07-.12*drive],footPitch:[0,-.85*drive],footRoll:[0,.20*drive],
  kneePoles:[[Math.sin(hipYaw),0,Math.cos(hipYaw)],[Math.sin(hipYaw)*(1-chamber),chamber,Math.cos(hipYaw)*(1-chamber)+.25*chamber]]});
}
const kick={name:'leftSideKick',stage:3,strikingSide:'left',strikingLimb:'leftFoot',authoredFeet:true,chainStart:.75,contact:makeClip(recipes[3]).contact,
 prepare:sampledKick(.18),sample:sampledKick,keys:[[0,ready],[.18,sampledKick(.18)],[.33,sampledKick(.33)],[.58,sampledKick(.58)],[1,ready]]};
const clips=recipes.map((r,stage)=>stage===3?kick:{...makeClip(r),stage});
const trackPunch={...makeClip(recipes[3]),stage:3};
const chargedRecipe={name:'chargedUppercut',side:'right',type:'upper',coil:[-.245,.440,.155],pass:[-.190,.575,.325],exit:[-.160,.970,.230],load:.22,hit:.39,end:.51,turn:.59,sink:.082};
const charged=makeClip(chargedRecipe);
const hold=sampled(chargedRecipe,chargedRecipe.load);

function sampleClip(clip,p,start){
 let out=clip.sample(p);
 if(start&&p<=clip.keys[1][0]&&(start.name==='chargeHold'&&clip===charged||start.preparedNext===clip.stage&&clip.stage!==undefined))return blendMelee(start,clip.prepare,ramp(p,0,clip.keys[1][0]));
 if(start&&p<clip.keys[1][0])out=blendMelee(start,out,ramp(p,0,clip.keys[1][0]));
 return out;
}
function chargeHold(charging){
 const amount=clamp(charging.amount??(charging.elapsed||0)/.6),loaded=blendMelee(ready,hold,smooth(amount));
 return blendMelee(charging.from||ready,loaded,ramp(charging.elapsed||0,0,.10));
}

// Existing special damage/cost/launch rules remain simulation-owned. The
// uppercut technique uses the connected rising pose instead of the legacy IK.
const tech={...makeClip({...chargedRecipe,name:'techUppercut',side:'left',coil:[.245,.440,.155],pass:[.190,.575,.325],exit:[.160,.970,.230]}),strikingSide:'left'};
const normal={...makeClip({...recipes[1],name:'rushFinish',load:.20,hit:.36,end:.46,turn:.50,sink:.040})};
const superClip={...makeClip({...recipes[0],name:'superCross',load:.23,hit:.38,end:.51,turn:.62,sink:.055})};
export const KNUCKLE_MOTIONS={ready,hold,lead:0,chainStart:.48,chainAmount:1,clips,charged,tech,specials:{normal,tech,super:superClip},sampleClip,chargeHold,
 clipFor:(clip,legFrame)=>clip===kick&&legFrame==='panzer'?trackPunch:clip};

// Guard takes effect immediately in the simulation. Only the visible return
// from a cancelled charge takes 100 ms; repeated renders use simulation time.
// If the player resumes charging or attacks during that return, inherit the
// last displayed pose instead of snapping back to the simulation's ready pose.
const poseFields=['right','left','joints','body','head','hipYaw','drop','shift','feet','footYaw','footPitch','footRoll','kneePoles','weight','poles'];
export function presentKnuckle(ref,motion,{time,mode=null,enabled=true}){
 if(!enabled){delete ref.knucklePresentation;return motion;}
 let state=ref.knucklePresentation;
 if(!state||time<state.time-1e-9)state={mode,motion,time};
 else if((state.mode==='hold'&&mode===null)||(state.returning&&mode!==state.mode))state.returning={from:state.motion,start:time,duration:mode&&typeof mode==='object'?Math.min(.10,mode.duration*.15):.10};
 if(state.returning){
  // A newly started punch must rejoin its authored path before contact.
  const amount=smooth((time-state.returning.start)/state.returning.duration);
  if(amount<1){
   const blended=alignFists(blendMelee(state.returning.from,motion,amount));
   motion={...motion,...Object.fromEntries(poseFields.map(key=>[key,blended[key]]))};
  }else delete state.returning;
 }
 state.mode=mode;state.motion=motion;state.time=time;ref.knucklePresentation=state;
 return motion;
}
