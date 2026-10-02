// Adjustable prototype clips. Exact timing and paths can be aligned to reference footage.
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
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>t<=0?[...a]:t>=1?[...b]:a.map((x,i)=>mix(x,b[i],t));
const pose=(position,rotation)=>({position,rotation});
const blendPose=(a,b,t)=>pose(blend(a.position,b.position,t),blend(a.rotation,b.rotation,t));
export function comboClip(kind,stage=0){const clips=COMBO_CLIPS[kind];return clips?.[((stage%clips.length)+clips.length)%clips.length]||'shot';}
export function contactPhase(attack){return clamp((attack.elapsed/attack.duration-.18)/.56);}
export function readyPose(kind,side){
 const dual=['dualSword','dualGun','knuckle'].includes(kind),twoHand=['hammer','naginata','scythe'].includes(kind),ranged=!COMBO_CLIPS[kind];
 if(ranged&&(side===-1||dual))return pose([dual?side*.24:['pistol','machinegun','shotgun'].includes(kind)?-.24:-.065,dual||['pistol','machinegun','shotgun'].includes(kind)?.52:.49,.18],[0,0,0]);
 if(side===-1&&twoHand)return pose([.02,.43,.16],[.75,0,.15]);
 if(side===-1&&['rapier','lance'].includes(kind))return pose([-.27,.43,.18],[Math.PI/2,0,.06]);
 if(kind==='knuckle')return pose([side*.27,.43,.18],[0,0,0]);
 if(side===-1||dual)return pose([side*.27,.32,.08],[.55,0,-side*.35]);
 return pose([side*.26,.32,.08],[0,0,0]);
}
function clipPoses(name,kind){
 const right=readyPose(kind,-1),left=readyPose(kind,1),twoHand=['hammer','naginata','scythe'].includes(kind);
 let prepare=pose([-.27,.47,-.03],[-.5,0,.5]),strike=pose([-.12,.48,.25],[1.8,0,-.8]),body=[.06,.45,-.06];
 if(['slashBack','crossBack','retreatCut','sweepBack'].includes(name)){prepare=pose([-.12,.44,.22],[1.4,0,-1.2]);strike=pose([-.31,.45,.16],[1.55,0,1.15]);body=[.05,-.55,.06];}
 if(['rising','uppercut'].includes(name)){prepare=pose([-.27,.32,.10],[2.8,0,.5]);strike=pose([-.25,.65,.28],[-.65,0,.4]);body=[-.15,.16,-.09];}
 if(['overhead','hammerSlam'].includes(name)){prepare=pose(twoHand?[.01,.72,.12]:[-.24,.73,.15],[-.9,0,twoHand?.15:.3]);strike=pose(twoHand?[.02,.47,.25]:[-.23,.42,.28],[2.35,0,.12]);body=[.18,.05,0];}
 if(['thrust','highThrust','lowThrust','lunge'].includes(name)){const h=name==='highThrust'?.58:name==='lowThrust'?.37:.46;prepare=pose([-.28,h-.04,.04],[Math.PI/2,0,.06]);strike=pose([-.23,h,.34],[Math.PI/2,0,-.06]);body=[.08,name==='lunge'?.3:.15,0];}
 if(['sweep','sweepBack','hammerSweep','spin'].includes(name)){const sign=name==='sweepBack'?-1:1;prepare=pose([.015,.47,.16],[1.15,0,sign*-1.3]);strike=pose([.015,.52,.22],[1.4,0,sign*1.3]);body=[.07,sign*.6,-sign*.05];}
 let leftPrepare=left,leftStrike=left;
 if(kind==='dualSword'){leftPrepare=pose(prepare.position.map((x,i)=>i===0?-x:x),prepare.rotation.map((x,i)=>i===2?-x:x));leftStrike=pose(strike.position.map((x,i)=>i===0?-x:x),strike.rotation.map((x,i)=>i===2?-x:x));}
 if(kind==='knuckle'){
  const leftPunch=name==='jabLeft',upper=name==='uppercut';prepare=pose([-.27,.47,.09],[0,0,0]);strike=pose([-.24,upper?.67:.49,.34],[upper?-.65:0,0,0]);body=[upper?-.12:.07,leftPunch?-.25:.25,0];
  if(leftPunch){leftPrepare=pose([.27,.47,.09],[0,0,0]);leftStrike=pose([.24,.49,.34],[0,0,0]);prepare=right;strike=right;}
  if(name==='hook')strike=pose([-.13,.54,.29],[0,0,-.7]);
 }
 if(name==='crossFinish'){prepare=pose([-.28,.67,.07],[-.7,0,.8]);strike=pose([-.12,.47,.29],[2.1,0,-.8]);leftPrepare=pose([.28,.67,.07],[-.7,0,-.8]);leftStrike=pose([.12,.47,.29],[2.1,0,.8]);body=[.15,0,0];}
 return {right,left,prepare,strike,leftPrepare,leftStrike,body};
}
export function sampleMotion(kind,attack){
 if(!attack)return {name:'ready',right:readyPose(kind,-1),left:readyPose(kind,1),body:[0,0,0],drop:0,weight:0};
 const name=attack.skill==='tech'&&['naginata','scythe'].includes(kind)?'spin':attack.charge>.5&&!['rapier','lance','knuckle'].includes(kind)?['hammer','naginata','scythe'].includes(kind)?'hammerSlam':'overhead':comboClip(kind,attack.combo||0);
 const c=clipPoses(name,kind),p=clamp(attack.elapsed/attack.duration),windup=smooth(p/.18),swing=smooth((p-.18)/.56),recover=smooth((p-.74)/.26);
 let right=blendPose(c.right,c.prepare,windup),left=blendPose(c.left,c.leftPrepare,windup);
 if(p>=.18){right=blendPose(c.prepare,c.strike,swing);left=blendPose(c.leftPrepare,c.leftStrike,swing);}
 if(p>=.74){right=blendPose(c.strike,c.right,recover);left=blendPose(c.leftStrike,c.left,recover);}
 const weight=Math.sin(Math.PI*p),direction=(swing*2-1)*weight;
 return {name,right,left,body:c.body.map(x=>x*direction),drop:-.025*weight,weight};
}
