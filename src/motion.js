import * as THREE from '../vendor/three.module.min.js';
import {swordMotion,swordChargeHold,swordSpinTurn} from './sword-motion.js';
// Original procedural poses, informed by the two supplied gameplay videos.
// Weapon counts/intervals remain our game specification, not measurements of the videos.
export const COMBO_CLIPS={
 sword:['slashOut','slashBack','rising','overhead'],
 rapier:['thrust','highThrust','insideThrust','lowThrust','lunge'],
 dualSword:['rightCut','leftReturn','dualRise','rightDiagonal','leftDiagonal','crossFinish'],
 lance:['lowThrust','highThrust','lunge'],
 naginata:['sweep','sweepBack','poleDiagonal'],
 knuckle:['jabRight','jabLeft','bodyRight','bodyLeft','hook','uppercut'],
 dagger:['slashBack','slashOut','thrust','rising','retreatCut'],
 hammer:['hammerSweep','hammerSlam'],
 scythe:['sweepBack','sweep','hookDraw'],
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
 hammer:{windup:.27,contactEnd:.48,follow:.70,advance:.28},
 scythe:{windup:.26,contactEnd:.60,follow:.77,advance:.24},
};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>t<=0?[...a]:t>=1?[...b]:a.map((x,i)=>mix(x,b[i],t));
const pose=(position,rotation)=>({position,rotation});
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
const rotationBlend=(a,b,t)=>{if(t<=0)return [...a];if(t>=1)return [...b];const e=new THREE.Euler().setFromQuaternion(quaternion(a).slerp(quaternion(b),t));return [e.x,e.y,e.z];};
const blendPose=(a,b,t)=>pose(blend(a.position,b.position,t),rotationBlend(a.rotation,b.rotation,t));
function curvePose(a,control,b,t){const out=blendPose(a,b,t);out.position=a.position.map((x,i)=>(1-t)**2*x+2*(1-t)*t*control[i]+t*t*b.position[i]);return out;}
export function comboClip(kind,stage=0){const clips=COMBO_CLIPS[kind];return clips?.[((stage%clips.length)+clips.length)%clips.length]||'shot';}
export function motionRhythm(kind,attack={}){
 const r=RHYTHMS[kind]||RHYTHMS.sword;
 if(kind==='sword'&&attack.charge>0&&!attack.skill)return {...r,windup:.20,contactEnd:.78,follow:.90,advance:.10*(1+.35*clamp(attack.charge))};
 return attack.charge>.5?{...r,windup:Math.max(.26,r.windup),advance:r.advance*1.35}:r;
}
export function contactPhase(attack){
 // Sword poses reach the front target after acceleration. Calibrate
 // the existing hit arc to that passage, rather than damaging it while the
 // visible blade is still raised beside the shoulder. Range/arc stay intact.
 if(attack.weapon==='sword'&&attack.charge>0&&!attack.skill)return swordSpinTurn(attack.elapsed/attack.duration);
 if(attack.weapon==='sword'&&!attack.skill){const overhead=((attack.combo||0)%4+4)%4===3,start=overhead?.30:.27,end=overhead?.47:.45;return clamp((attack.elapsed/attack.duration-start)/(end-start));}
 const r=motionRhythm(attack.weapon,attack);return clamp((attack.elapsed/attack.duration-r.windup)/(r.contactEnd-r.windup));
}
export function stepPhase(attack){if(attack.weapon==='sword'&&attack.charge>0&&!attack.skill)return smooth((attack.elapsed/attack.duration-.03)/.17);const r=motionRhythm(attack.weapon,attack);const start=['rapier','lance'].includes(attack.weapon)?r.windup*1.15:r.windup*.5;return smooth((attack.elapsed/attack.duration-start)/(r.contactEnd-start));}
export function swingDirection(kind,stage){return ['slashBack','crossBack','retreatCut','sweepBack','leftReturn','leftDiagonal'].includes(comboClip(kind,stage))?-1:1;}
export function readyPose(kind,side){
 const dual=['dualSword','dualGun','knuckle'].includes(kind),twoHand=['hammer','naginata','scythe'].includes(kind),ranged=!COMBO_CLIPS[kind];
 if(ranged&&(side===-1||dual))return pose([dual?side*.24:['pistol','machinegun','shotgun'].includes(kind)?-.24:-.065,dual||['pistol','machinegun','shotgun'].includes(kind)?.52:.49,.18],[0,0,0]);
 if(side===-1&&twoHand)return pose([-.05,.48,.16],[.75,0,.15]);
 if(side===-1&&['rapier','lance'].includes(kind))return pose([-.27,.43,.18],[Math.PI/2,0,.06]);
 if(kind==='knuckle')return pose([side*.20,.68,side===1?.19:.15],[0,0,0]);
 if(side===-1||dual)return pose([side*.27,.32,.08],[.55,0,-side*.35]);
 return pose([side*.25,.44,.17],[.4,0,.25]);
}
function clipPoses(name,kind){
 const left=readyPose(kind,1),twoHand=['hammer','naginata','scythe'].includes(kind);
 let prepare=pose([-.30,.61,.02],[.15,0,.65]),strike=pose([-.04,.48,.32],[1.35,0,-.70]),follow=pose([.02,.43,.25],[1.60,0,-.75]),control=[-.30,.61,.32],body=[.06,.42,-.02];
 if(['slashBack','crossBack','retreatCut','sweepBack'].includes(name)){prepare=pose([.02,.48,.25],[1.40,0,-.7]);strike=pose([-.31,.50,.25],[1.25,0,.75]);follow=pose([-.31,.46,.14],[.85,0,.7]);control=[-.12,.59,.35];body=[.04,-.42,.015];}
 if(['rising','uppercut'].includes(name)){prepare=pose([-.27,.36,.19],[2.05,0,.35]);strike=pose([-.22,.66,.27],[.35,0,.3]);follow=pose([-.25,.59,.18],[.2,0,.3]);control=[-.26,.43,.38];body=[-.045,.20,-.015];}
 if(['overhead','hammerSlam'].includes(name)){prepare=pose(twoHand?[-.05,.78,.07]:[-.23,.77,.10],[-.18,0,twoHand?.1:.2]);strike=pose(twoHand?[-.03,.43,.34]:[-.23,.43,.33],[2.10,0,.1]);follow=pose(twoHand?[-.04,.39,.23]:[-.25,.39,.22],[2.18,0,.1]);control=twoHand?[-.04,.71,.40]:[-.22,.68,.41];body=[.16,.025,0];}
 if(['thrust','highThrust','insideThrust','lowThrust','lunge'].includes(name)){const h=name==='highThrust'?.63:name==='lowThrust'?.43:name==='insideThrust'?.55:.52,inside=name==='insideThrust';prepare=pose([-.27,h,.13],[Math.PI/2,inside?-.18:0,.02]);strike=pose([inside?-.12:-.19,h,name==='lunge'?.38:.36],[Math.PI/2,inside?.16:0,-.02]);follow=pose([inside?-.18:-.23,h,.24],[Math.PI/2,inside?.08:0,0]);control=[inside?-.18:-.24,h,.30];body=[.025,inside?.12:name==='lunge'?.07:.04,0];}
 if(['sweep','sweepBack','hammerSweep','spin'].includes(name)){const sign=name==='sweepBack'?-1:1;prepare=pose([-.06,.57,.11],[.75,0,sign*-.95]);strike=pose([.03,.49,.30],[1.25,0,sign*.95]);follow=pose([.04,.45,.22],[1.45,0,sign*1.1]);control=[-.04,.57,.38];body=[.075,sign*.48,-sign*.02];}
 if(kind==='sword'&&name==='slashOut'){prepare=pose([-.30,.69,.06],[.05,0,.62]);strike=pose([.04,.50,.34],[1.30,0,-.66]);follow=pose([.07,.45,.21],[1.62,0,-.82]);control=[-.23,.66,.41];body=[.065,.46,-.02];}
 if(kind==='sword'&&name==='slashBack'){prepare=pose([.03,.47,.25],[1.62,0,-.70]);strike=pose([-.31,.62,.27],[.95,0,.72]);follow=pose([-.32,.57,.13],[.65,0,.76]);control=[-.10,.61,.39];body=[.035,-.42,.015];}
 // Each two-handed tool has its own path; keep the shaft in front of the torso.
 if(kind==='hammer'&&name==='hammerSweep'){prepare=pose([-.13,.62,.10],[.60,-.18,-.95]);strike=pose([.06,.50,.28],[1.18,.16,1.02]);follow=pose([.08,.44,.19],[1.45,.22,1.18]);control=[-.04,.60,.39];body=[.09,.57,-.025];}
 if(kind==='hammer'&&name==='hammerSlam'){prepare=pose([-.05,.82,.10],[-.45,0,.08]);strike=pose([-.03,.47,.34],[1.94,0,.06]);follow=pose([-.05,.45,.24],[1.98,0,.06]);control=[-.04,.75,.41];body=[.14,.02,0];}
 if(kind==='naginata'&&['sweep','sweepBack','poleDiagonal'].includes(name)){
  const back=name==='sweepBack';prepare=pose([-.05,back?.48:.64,.17],[back?1.40:.68,back?.12:-.12,back?.94:-.90]);strike=pose([.02,back?.62:.48,.29],[back?.80:1.30,back?-.12:.12,back?-.88:.96]);follow=pose([.02,back?.60:.44,.21],[back?.68:1.45,back?-.16:.16,back?-.98:1.10]);control=[-.07,.66,.37];body=[.055,back?-.46:.46,back?.02:-.02];
  if(name==='poleDiagonal'){prepare=pose([-.07,.78,.12],[.12,-.08,-.55]);strike=pose([.05,.46,.32],[1.70,.12,.64]);follow=pose([.06,.43,.22],[1.86,.16,.74]);control=[-.03,.70,.40];body=[.10,.32,-.02];}
 }
 if(kind==='scythe'&&['sweepBack','sweep','hookDraw'].includes(name)){
  const back=name==='sweepBack';prepare=pose([-.05,back?.48:.60,.17],[back?1.30:.85,back?.22:-.22,back?.85:-.80]);strike=pose([.04,back?.58:.48,.28],[back?.92:1.34,back?-.18:.18,back?-.90:.90]);follow=pose([-.04,back?.54:.43,.15],[back?.80:1.50,back?-.28:.28,back?-.95:1.05]);control=[-.03,.57,.40];body=[.075,back?-.42:.42,0];
  if(name==='hookDraw'){prepare=pose([-.06,.67,.16],[.62,-.30,-.62]);strike=pose([.03,.53,.34],[1.20,.25,.75]);follow=pose([-.09,.48,.13],[1.42,.35,.92]);control=[-.01,.62,.41];body=[.08,.50,-.025];}
 }
 if(kind==='dagger'&&name==='retreatCut'){prepare=pose([.01,.49,.23],[1.35,0,-.62]);strike=pose([-.29,.54,.27],[1.12,.12,.80]);follow=pose([-.30,.51,.10],[.65,.15,.72]);control=[-.08,.60,.36];body=[-.025,-.32,.015];}
 let leftPrepare=left,leftStrike=left,leftFollow=left,leftControl=left.position;
 if(kind==='dualSword'&&name==='overhead'){const mirror=p=>pose(p.position.map((x,i)=>i===0?-x:x),p.rotation.map((x,i)=>i===2?-x:x));leftPrepare=mirror(prepare);leftStrike=mirror(strike);leftFollow=mirror(follow);leftControl=control.map((x,i)=>i===0?-x:x);}
 if(kind==='dualSword'&&COMBO_CLIPS.dualSword.includes(name)){
  const guardR=pose([-.26,.52,.14],[.28,0,.35]),guardL=pose([.26,.52,.14],[.28,0,-.35]),mirror=p=>pose(p.position.map((x,i)=>i===0?-x:x),p.rotation.map((x,i)=>i===2?-x:x));
  prepare=pose([-.30,name==='rightDiagonal'?.73:.62,.10],[name==='rightDiagonal'?-.12:.22,0,.65]);strike=pose([-.04,name==='rightDiagonal'?.43:.52,.34],[name==='rightDiagonal'?1.80:1.30,0,-.68]);follow=pose([.02,.44,.22],[1.65,0,-.80]);control=[-.24,.65,.40];body=[.065,.38,-.015];leftPrepare=guardL;leftStrike=guardL;leftFollow=guardL;leftControl=guardL.position;
  if(name==='leftReturn'||name==='leftDiagonal'){leftPrepare=pose([.30,name==='leftDiagonal'?.74:.62,.10],[name==='leftDiagonal'?-.10:.22,0,-.65]);leftStrike=pose([.04,name==='leftDiagonal'?.44:.55,.34],[name==='leftDiagonal'?1.76:1.25,0,.68]);leftFollow=pose([-.02,.46,.22],[1.62,0,.80]);leftControl=[.24,.66,.40];prepare=guardR;strike=guardR;follow=guardR;control=guardR.position;body=[.065,-.38,.015];}
  if(name==='dualRise'){prepare=pose([-.29,.36,.20],[2.05,0,.42]);strike=pose([-.18,.70,.30],[.28,0,.28]);follow=pose([-.24,.62,.18],[.20,0,.32]);control=[-.27,.49,.40];leftPrepare=mirror(prepare);leftStrike=mirror(strike);leftFollow=mirror(follow);leftControl=[.27,.49,.40];body=[-.04,.12,0];}
 }
 if(kind==='knuckle'){
  const leftPunch=name==='jabLeft'||name==='bodyLeft',upper=name==='uppercut',low=name==='bodyRight'||name==='bodyLeft',h=low?.53:.68;prepare=readyPose(kind,-1);strike=pose([-.18,upper?.78:h,.38],[upper?.28:0,0,upper?0:.25]);follow=pose([-.20,.68,.20],[0,0,0]);control=upper?[-.24,.48,.31]:[-.20,h,.30];body=[upper?-.025:low?.105:.025,leftPunch?-.16:low?.36:.29,0];
  if(upper)prepare=pose([-.25,.44,.18],[.3,0,0]);
  if(leftPunch){leftPrepare=left;leftStrike=pose([.18,h,.38],[0,0,-.25]);leftFollow=pose([.20,.68,.20],[0,0,0]);leftControl=[.20,h,.30];prepare=readyPose(kind,-1);strike=prepare;follow=prepare;control=prepare.position;}
  if(name==='hook'){prepare=pose([-.24,.68,.17],[0,0,.1]);strike=pose([-.04,.68,.31],[0,0,-.65]);follow=pose([-.18,.68,.24],[0,0,-.25]);control=[-.34,.69,.31];body[1]=.38;}
 }
 if(name==='crossFinish'){prepare=pose([-.28,.72,.10],[.1,0,.55]);strike=pose([-.11,.45,.32],[1.9,0,-.6]);follow=pose([-.16,.41,.22],[2.1,0,-.4]);control=[-.27,.67,.39];leftPrepare=pose([.28,.72,.10],[.1,0,-.55]);leftStrike=pose([.11,.45,.32],[1.9,0,.6]);leftFollow=pose([.16,.41,.22],[2.1,0,.4]);leftControl=[.27,.67,.39];body=[.12,0,0];}
 return {prepare,strike,follow,control,leftPrepare,leftStrike,leftFollow,leftControl,body};
}
function readyFrame(kind){
 const lead=kind==='knuckle'?1:0,ranged=!COMBO_CLIPS[kind];
 return {right:readyPose(kind,-1),left:readyPose(kind,1),body:[0,0,0],drop:0,shift:[0,0],feet:[[-.105,.035,ranged?.045:lead===0?.085:-.015],[.105,.035,ranged?.045:lead===1?.085:-.015]],footYaw:[0,0],hipYaw:0,weight:0};
}
function blendFrame(a,b,t){return {right:blendPose(a.right,b.right,t),left:blendPose(a.left,b.left,t),body:blend(a.body,b.body,t),drop:mix(a.drop,b.drop,t),shift:blend(a.shift,b.shift,t),feet:a.feet.map((v,i)=>blend(v,b.feet[i],t)),footYaw:blend(a.footYaw,b.footYaw,t),hipYaw:mix(a.hipYaw,b.hipYaw,t),weight:mix(a.weight,b.weight,t)};}
function frames(kind,name){
 const c=clipPoses(name,kind),base=readyFrame(kind),punch=kind==='knuckle',lead=punch?1:0,heavy=kind==='hammer',thrust=['rapier','lance'].includes(kind),upper=name==='uppercut';
 const lunge=name==='lunge',lowPunch=name==='bodyRight'||name==='bodyLeft',prepare={...base,right:c.prepare,left:c.leftPrepare,body:c.body.map((x,i)=>x*(i===1?-.5:-.35)),drop:heavy||upper||lowPunch?-.035:-.012,shift:[0,-.008],weight:.45,hipYaw:-c.body[1]*.15};
 const strike={...base,right:c.strike,left:c.leftStrike,body:c.body,drop:upper?-.005:lowPunch||lunge?-.045:heavy||thrust?-.03:-.012,shift:[0,punch?.018:lunge?.045:.025],weight:1,hipYaw:c.body[1]*.38,
  feet:base.feet.map((v,i)=>[v[0],v[1]+(punch&&i===0?.008:0),v[2]+(punch?0:i===lead?.075:-.015)]),footYaw:punch?[Math.max(0,c.body[1])*.7,Math.min(0,c.body[1])*.4]:[c.body[1]*.18,c.body[1]*.4]};
 const follow={...strike,right:c.follow,left:c.leftFollow,body:c.body.map(x=>x*.65),hipYaw:c.body[1]*.25,weight:.55,feet:strike.feet.map(v=>[v[0],.035,v[2]])};
 return {prepare,strike,follow,control:c.control,leftControl:c.leftControl};
}
function clipName(kind,attack){return attack.skill==='tech'&&['naginata','scythe'].includes(kind)?'spin':attack.charge>.5&&!['rapier','lance','knuckle'].includes(kind)?['hammer','naginata','scythe'].includes(kind)?'hammerSlam':'overhead':comboClip(kind,attack.combo||0);}
export function sampleMotion(kind,attack,{nextCombo=null,charging=null,hasShield=attack?.blendFrom?.hasShield??charging?.from?.hasShield??false}={}){
 if(kind==='sword'&&(!attack||!attack.skill)){if(!attack&&charging)return swordChargeHold({...charging,hasShield});return swordMotion(attack,{nextCombo,hasShield});}
 const base=readyFrame(kind);if(!attack||!COMBO_CLIPS[kind])return {name:'ready',...base};
 const name=clipName(kind,attack),c=frames(kind,name),r=motionRhythm(kind,attack),p=clamp(attack.elapsed/attack.duration),start=attack.blendFrom||base;
 let out;
 if(p<r.windup)out=blendFrame(start,c.prepare,smooth(p/r.windup));
 else if(p<r.contactEnd){const t=(p-r.windup)/(r.contactEnd-r.windup),drive=smooth(t);out=blendFrame(c.prepare,c.strike,drive);
  out.right=curvePose(c.prepare.right,c.control,c.strike.right,drive);out.left=curvePose(c.prepare.left,c.leftControl,c.strike.left,drive);
  if(kind==='dualSword'&&['dualRise','crossFinish'].includes(name)){const delayed=smooth((t-.10)/.90);out.left=curvePose(c.prepare.left,c.leftControl,c.strike.left,delayed);}
  if(kind!=='knuckle')out.feet[0][1]+=.018*Math.sin(Math.PI*t);
 }else if(p<r.follow)out=blendFrame(c.strike,c.follow,smooth((p-r.contactEnd)/(r.follow-r.contactEnd)));
 else {const destination=nextCombo===null?base:blendFrame(base,frames(kind,comboClip(kind,nextCombo)).prepare,.82);out=blendFrame(c.follow,destination,smooth((p-r.follow)/(1-r.follow)));}
 // Hips initiate the turn, followed by shoulders and the arm; thrusts keep an upright trunk.
 if(p<r.contactEnd){const hipStart=r.windup*.35,shoulderStart=r.windup*.65;
  out.hipYaw=p<hipStart?mix(start.hipYaw,c.prepare.hipYaw,smooth(p/hipStart)):mix(c.prepare.hipYaw,c.strike.hipYaw,smooth((p-hipStart)/(r.contactEnd-hipStart)));
  out.body=p<shoulderStart?blend(start.body,c.prepare.body,smooth(p/shoulderStart)):blend(c.prepare.body,c.strike.body,smooth((p-shoulderStart)/(r.contactEnd-shoulderStart)));
 }
 return {name,...out};
}
