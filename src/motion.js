// Original procedural poses, informed by the two supplied gameplay videos.
// Weapon counts/intervals remain our game specification, not measurements of the videos.
export const COMBO_CLIPS={
 sword:['slashOut','slashBack','rising','overhead'],
 rapier:['thrust','highThrust','thrust','lowThrust','lunge'],
 dualSword:['crossOut','crossBack','rising','crossOut','crossBack','crossFinish'],
 lance:['lowThrust','highThrust','lunge'],
 naginata:['sweep','sweepBack','spin'],
 knuckle:['jabRight','jabLeft','jabRight','jabLeft','hook','uppercut'],
 dagger:['slashBack','slashOut','thrust','rising','retreatCut'],
 hammer:['hammerSweep','hammerSlam'],
 scythe:['sweepBack','sweep','spin'],
};
// Fractions of the existing attack interval; heavy weapons spend more time preparing.
const RHYTHMS={
 sword:{windup:.16,contactEnd:.53,follow:.70,advance:.24},
 rapier:{windup:.12,contactEnd:.43,follow:.62,advance:.20},
 dualSword:{windup:.11,contactEnd:.54,follow:.69,advance:.18},
 lance:{windup:.24,contactEnd:.51,follow:.72,advance:.36},
 naginata:{windup:.23,contactEnd:.59,follow:.75,advance:.24},
 knuckle:{windup:.08,contactEnd:.41,follow:.58,advance:.16},
 dagger:{windup:.10,contactEnd:.44,follow:.62,advance:.15},
 hammer:{windup:.34,contactEnd:.62,follow:.81,advance:.28},
 scythe:{windup:.26,contactEnd:.60,follow:.77,advance:.24},
};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>t<=0?[...a]:t>=1?[...b]:a.map((x,i)=>mix(x,b[i],t));
const pose=(position,rotation)=>({position,rotation});
const blendPose=(a,b,t)=>pose(blend(a.position,b.position,t),blend(a.rotation,b.rotation,t));
export function comboClip(kind,stage=0){const clips=COMBO_CLIPS[kind];return clips?.[((stage%clips.length)+clips.length)%clips.length]||'shot';}
export function motionRhythm(kind,attack={}){
 const r=RHYTHMS[kind]||RHYTHMS.sword;
 return attack.charge>.5?{...r,windup:Math.max(.26,r.windup),advance:r.advance*1.35}:r;
}
export function contactPhase(attack){const r=motionRhythm(attack.weapon,attack);return clamp((attack.elapsed/attack.duration-r.windup)/(r.contactEnd-r.windup));}
export function stepPhase(attack){const r=motionRhythm(attack.weapon,attack);return smooth((attack.elapsed/attack.duration-r.windup*.5)/(r.contactEnd-r.windup*.5));}
export function swingDirection(kind,stage){return ['slashBack','crossBack','retreatCut','sweepBack'].includes(comboClip(kind,stage))?-1:1;}
export function readyPose(kind,side){
 const dual=['dualSword','dualGun','knuckle'].includes(kind),twoHand=['hammer','naginata','scythe'].includes(kind),ranged=!COMBO_CLIPS[kind];
 if(ranged&&(side===-1||dual))return pose([dual?side*.24:['pistol','machinegun','shotgun'].includes(kind)?-.24:-.065,dual||['pistol','machinegun','shotgun'].includes(kind)?.52:.49,.18],[0,0,0]);
 if(side===-1&&twoHand)return pose([.02,.43,.16],[.75,0,.15]);
 if(side===-1&&['rapier','lance'].includes(kind))return pose([-.27,.43,.18],[Math.PI/2,0,.06]);
 if(kind==='knuckle')return pose([side*.25,.49,.16],[0,0,0]);
 if(side===-1||dual)return pose([side*.27,.32,.08],[.55,0,-side*.35]);
 return pose([side*.26,.32,.08],[0,0,0]);
}
function clipPoses(name,kind){
 const right=readyPose(kind,-1),left=readyPose(kind,1),twoHand=['hammer','naginata','scythe'].includes(kind);
 let prepare=pose([-.31,.49,-.08],[-.65,0,.65]),strike=pose([-.10,.48,.30],[1.8,0,-.95]),body=[.10,.65,-.08];
 if(['slashBack','crossBack','retreatCut','sweepBack'].includes(name)){prepare=pose([-.10,.46,.27],[1.4,0,-1.2]);strike=pose([-.32,.47,.12],[1.55,0,1.3]);body=[.07,-.7,.07];}
 if(['rising','uppercut'].includes(name)){prepare=pose([-.30,.32,.10],[2.8,0,.5]);strike=pose([-.22,.67,.28],[-.65,0,.4]);body=[-.20,.28,-.10];}
 if(['overhead','hammerSlam'].includes(name)){prepare=pose(twoHand?[.01,.76,.08]:[-.24,.76,.11],[-1.0,0,twoHand?.15:.3]);strike=pose(twoHand?[.02,.40,.31]:[-.23,.38,.32],[2.5,0,.12]);body=[.28,.06,0];}
 if(['thrust','highThrust','lowThrust','lunge'].includes(name)){const h=name==='highThrust'?.58:name==='lowThrust'?.37:.46;prepare=pose([-.30,h-.04,-.025],[Math.PI/2,0,.06]);strike=pose([-.20,h,.36],[Math.PI/2,0,-.06]);body=[.15,name==='lunge'?.38:.22,0];}
 if(['sweep','sweepBack','hammerSweep','spin'].includes(name)){const sign=name==='sweepBack'?-1:1;prepare=pose([.015,.51,.10],[1.1,0,sign*-1.5]);strike=pose([.015,.50,.29],[1.5,0,sign*1.45]);body=[.12,sign*.85,-sign*.08];}
 let leftPrepare=left,leftStrike=left;
 if(kind==='dualSword'){leftPrepare=pose(prepare.position.map((x,i)=>i===0?-x:x),prepare.rotation.map((x,i)=>i===2?-x:x));leftStrike=pose(strike.position.map((x,i)=>i===0?-x:x),strike.rotation.map((x,i)=>i===2?-x:x));}
 if(kind==='knuckle'){
  const leftPunch=name==='jabLeft',upper=name==='uppercut';prepare=pose([-.29,.49,.045],[0,0,0]);strike=pose([-.19,upper?.67:.50,.37],[upper?-.65:0,0,0]);body=[upper?-.19:.12,leftPunch?-.42:.42,leftPunch?.035:-.035];
  leftPrepare=pose([.25,.51,.14],[0,0,0]);leftStrike=pose([.25,.52,.09],[0,0,0]);
  if(leftPunch){leftPrepare=pose([.29,.49,.045],[0,0,0]);leftStrike=pose([.19,.50,.37],[0,0,0]);prepare=pose([-.25,.51,.14],[0,0,0]);strike=pose([-.25,.52,.09],[0,0,0]);}
  if(name==='hook'){prepare=pose([-.34,.50,.02],[0,0,.4]);strike=pose([-.10,.54,.33],[0,0,-.8]);body[1]=.7;}
 }
 if(name==='crossFinish'){prepare=pose([-.28,.70,.07],[-.8,0,.8]);strike=pose([-.12,.44,.32],[2.25,0,-.9]);leftPrepare=pose([.28,.70,.07],[-.8,0,-.8]);leftStrike=pose([.12,.44,.32],[2.25,0,.9]);body=[.24,0,0];}
 return {prepare,strike,leftPrepare,leftStrike,body};
}
function readyFrame(kind){return {right:readyPose(kind,-1),left:readyPose(kind,1),body:[0,0,0],drop:0,shift:[0,0],feet:[[-.105,.035,.045],[.105,.035,.045]],weight:0};}
function blendFrame(a,b,t){return {right:blendPose(a.right,b.right,t),left:blendPose(a.left,b.left,t),body:blend(a.body,b.body,t),drop:mix(a.drop,b.drop,t),shift:blend(a.shift,b.shift,t),feet:a.feet.map((v,i)=>blend(v,b.feet[i],t)),weight:mix(a.weight,b.weight,t)};}
function frames(kind,name){
 const c=clipPoses(name,kind),base=readyFrame(kind),lead=name==='jabLeft'?1:0,heavy=kind==='hammer',rise=['rising','uppercut'].includes(name),slam=['overhead','hammerSlam','crossFinish'].includes(name);
 const prepare={...base,right:c.prepare,left:c.leftPrepare,body:c.body.map((x,i)=>x*(i===1?-.68:-.65)),drop:heavy?-.045:-.024,shift:[lead?.014:-.014,-.018],feet:base.feet.map(v=>[v[0]*1.25,v[1],v[2]]) ,weight:.65};
 const strike={...base,right:c.strike,left:c.leftStrike,body:c.body,drop:rise?.035:slam?-.04:-.018,shift:[lead?.018:-.018,.035],feet:base.feet.map((v,i)=>[v[0]*1.25,v[1]+(i===lead?.018:0),v[2]+(i===lead?.12:-.035)]),weight:1};
 const follow={...strike,body:c.body.map(x=>x*.8),drop:rise?.015:slam?-.025:-.015,weight:.7,feet:strike.feet.map(v=>[v[0],.035,v[2]])};
 return {prepare,strike,follow};
}
function clipName(kind,attack){return attack.skill==='tech'&&['naginata','scythe'].includes(kind)?'spin':attack.charge>.5&&!['rapier','lance','knuckle'].includes(kind)?['hammer','naginata','scythe'].includes(kind)?'hammerSlam':'overhead':comboClip(kind,attack.combo||0);}
export function sampleMotion(kind,attack,{nextCombo=null}={}){
 const base=readyFrame(kind);if(!attack||!COMBO_CLIPS[kind])return {name:'ready',...base};
 const name=clipName(kind,attack),c=frames(kind,name),r=motionRhythm(kind,attack),p=clamp(attack.elapsed/attack.duration),start=attack.blendFrom||base;
 let out;
 if(p<r.windup)out=blendFrame(start,c.prepare,smooth(p/r.windup));
 else if(p<r.contactEnd){const t=(p-r.windup)/(r.contactEnd-r.windup);out=blendFrame(c.prepare,c.strike,smooth(t));
  // The two blades follow each other, instead of moving in perfect mirror synchrony.
  if(kind==='dualSword'){const delayed=smooth((t-.12)/.88),hand=(attack.combo||0)%2?'right':'left';out[hand]=blendPose(c.prepare[hand],c.strike[hand],delayed);}
  out.feet[ name==='jabLeft'?1:0 ][1]+=.025*Math.sin(Math.PI*t);
 }else if(p<r.follow)out=blendFrame(c.strike,c.follow,smooth((p-r.contactEnd)/(r.follow-r.contactEnd)));
 else {const destination=nextCombo===null?base:blendFrame(base,frames(kind,comboClip(kind,nextCombo)).prepare,.82);out=blendFrame(c.follow,destination,smooth((p-r.follow)/(1-r.follow)));}
 return {name,...out};
}
