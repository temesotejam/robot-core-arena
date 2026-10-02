import * as THREE from '../vendor/three.module.min.js';

// Authored joint poses for the normal sword combo. Angles are radians, distances
// are model units. The arm is driven shoulder -> elbow hinge -> forearm roll ->
// wrist, rather than by a hand target and an automatically chosen elbow.
const clamp=t=>Math.max(0,Math.min(1,t));
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const vec=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
const quat=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)).toArray();
const slerp=(a,b,t)=>new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b),t).toArray();
const names=['slashOut','slashBack','rising','overhead'];
const BASE_FEET=[[-.125,.035,-.035],[.125,.035,.065]];
const NEUTRAL_R=[-.30,-.12,-.23,1.36,-.22,.06,-.06];
const NEUTRAL_L=[-.18,.10,.17,1.36,.05,.04,.02];
function joint(a,side,clavicle=[0,0,0]){
 const wrist=new THREE.Quaternion().fromArray(quat([Math.PI/2+a[5],0,a[6]])).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a[7]||0)).toArray();
 return {upper:quat(a.slice(0,3)),bend:a[3],roll:a[4],wrist,clavicle:[...clavicle],side};
}
export function swordArm(j){
 const upper=new THREE.Quaternion().fromArray(j.upper),lower=upper.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-j.bend,j.roll,0))),hand=lower.clone().multiply(new THREE.Quaternion().fromArray(j.wrist));
 const elbow=new THREE.Vector3(0,-.195,0).applyQuaternion(upper),wrist=new THREE.Vector3(0,-.195,0).applyQuaternion(lower).add(elbow);
 const position=wrist.clone().add(new THREE.Vector3(j.side*.24,.66,0)).add(new THREE.Vector3(...j.clavicle)),e=new THREE.Euler().setFromQuaternion(hand);
 return {elbow,wrist,upper,lower,hand,pose:{position:position.toArray(),rotation:[e.x,e.y,e.z]}};
}
function finish(f){return {...f,right:swordArm(f.joints.right).pose,left:swordArm(f.joints.left).pose};}
function pose(r=NEUTRAL_R,body=[.015,-.18,0],hipYaw=-.06,drop=-.018,shift=[0,0],l=NEUTRAL_L,footYaw=[-.08,.04],clavicle=[0,0,0]){
 return finish({joints:{right:joint(r,-1,clavicle),left:joint(l,1)},body,hipYaw,drop,shift,footYaw,feet:BASE_FEET.map(v=>[...v]),weight:0,sword:true});
}
function blendJoint(a,b,t){return {upper:slerp(a.upper,b.upper,t),bend:lerp(a.bend,b.bend,t),roll:lerp(a.roll,b.roll,t),wrist:slerp(a.wrist,b.wrist,t),clavicle:vec(a.clavicle,b.clavicle,t),side:a.side};}
export function blendSword(a,b,t){
 if(t<=0)return a;if(t>=1)return b;
 return finish({sword:true,joints:{right:blendJoint(a.joints.right,b.joints.right,t),left:blendJoint(a.joints.left,b.joints.left,t)},body:vec(a.body,b.body,t),hipYaw:lerp(a.hipYaw,b.hipYaw,t),drop:lerp(a.drop,b.drop,t),shift:vec(a.shift,b.shift,t),footYaw:vec(a.footYaw,b.footYaw,t),feet:a.feet.map((v,i)=>vec(v,b.feet[i],t)),weight:lerp(a.weight,b.weight,t)});
}
const ready=pose();
// Each row is a complete pose, not a shared wrist path with a different sign.
// The pelvis starts opening before the chest. The cutting arm extends during
// acceleration; the elbow bends again only after the blade passes the target.
const cuts=[
 [
  [.10,pose([-.88,-.30,-.48,1.52,-.55,-.05,-.06],[0,-.42,.025],-.25,-.032,[.008,-.012])],
  [.16,pose([-1.80,-.38,-.57,1.00,-.55,-.08,-.05],[-.03,-.56,.035],-.20,-.036,[.010,-.008],[-.30,.16,.25,1.40,.10,.04,.02],[-.18,.02],[0,.015,-.008])],
  [.27,pose([-1.55,-.05,-.43,.65,-.12,-.02,-.04],[.025,-.26,.015],.12,-.042,[.012,.014],[-.30,-.08,.23,1.40,-.12,.04,.02])],
  [.40,pose([-.96,.68,-.18,.50,.90,.03,-.04],[.10,.38,-.035],.28,-.042,[-.006,.026],[.24,-.20,.56,1.08,.35,.04,.04],[.12,.05],[.008,0,.015])],
  [.53,pose([-.38,1.02,.10,.72,1.23,.06,-.02],[.12,.67,-.035],.33,-.033,[-.014,.020],[.24,-.25,.56,1.06,.35,.04,.04],[.20,.06])],
  [.67,pose([-.30,.88,.06,1.12,1.60,.04,-.02],[.065,.53,-.015],.24,-.025,[-.006,.008],[-.15,-.18,.17,1.43,-.10,.04,.02],[.12,.04])],
 ],
 [
  [.10,pose([-.40,.83,.08,1.26,2.0,.04,-.02],[.06,.44,-.02],.17,-.032,[0,-.008])],
  [.16,pose([-.63,1.02,.10,1.06,1.75,.04,-.02],[.025,.59,-.03],.10,-.038,[0,-.005],[-.18,-.18,.20,1.42,-.12,.04,.02],[.16,.02])],
  [.27,pose([-.88,.67,-.07,.70,.60,.04,-.02],[.03,.30,-.015],-.14,-.043,[.006,.014])],
  [.40,pose([-1.02,-.37,-.50,.53,-.62,-.01,-.04],[.065,-.31,.02],-.28,-.038,[.012,.023],[-.22,.22,.20,1.48,.12,.04,.02],[-.08,-.10])],
  [.53,pose([-.88,-.84,-.70,.88,-1.00,-.04,-.03],[.075,-.59,.03],-.32,-.028,[.010,.014],[-.24,.30,.21,1.42,.18,.04,.02],[-.14,-.12])],
  [.67,pose([-.43,-.65,-.48,1.04,-.90,.03,-.03],[.04,-.45,.01],-.21,-.027,[.004,.005])],
 ],
 [
  [.10,pose([-.25,-.55,-.48,.90,-2.08,.10,-.02],[.08,-.39,.035],-.16,-.043,[.010,-.012])],
  [.16,pose([-.12,-.60,-.45,.70,-2.18,.12,-.02],[.13,-.48,.045],-.12,-.052,[.008,-.009],[-.16,.16,.19,1.35,.08,.04,.02],[-.10,.04])],
  [.27,pose([-.60,-.15,-.42,.62,-1.10,.07,-.04],[.035,-.16,.020],.16,-.035,[.006,.020])],
  [.40,pose([-1.48,.30,-.42,.68,.12,-.06,-.04],[-.055,.25,-.015],.22,-.011,[0,.026],[-.24,-.10,.17,1.50,-.14,.04,.02],[.10,.04],[0,.012,.008])],
  [.53,pose([-2.00,.12,-.62,.86,-.35,-.08,-.04],[-.09,.39,-.025],.20,-.008,[-.004,.012],[-.24,-.10,.17,1.50,-.14,.04,.02],[.12,.04],[0,.018,0])],
  [.67,pose([-1.75,-.10,-.40,1.10,-.15,-.06,-.04],[-.045,.19,-.015],.10,-.019,[0,0])],
 ],
 [
  [.10,pose([-1.55,-.24,-.30,1.18,-.30,-.08,-.03,-1.15],[-.04,-.12,.02],-.12,-.031,[0,-.010])],
  [.16,pose([-2.18,-.22,-.24,.70,-.28,-.08,-.03,-1.15],[-.095,-.27,.025],-.09,-.038,[.005,-.010],[-.22,.10,.22,1.36,.02,.04,.02],[-.10,.06],[0,.02,-.012])],
  [.27,pose([-1.89,-.05,-.18,.43,-.12,-.07,-.02,-1.15],[-.015,-.06,.005],.10,-.048,[0,.015])],
  [.40,pose([-.42,.12,-.14,.10,.06,.04,-.02,-1.15],[.16,.19,-.015],.17,-.058,[0,.034],[-.10,-.06,.30,1.32,-.05,.04,.02],[.08,.06])],
  [.53,pose([.25,.14,-.20,.20,.06,.04,-.02,-1.0],[.23,.30,-.02],.20,-.050,[0,.032],[-.03,-.16,.29,1.36,-.12,.04,.02],[.14,.07])],
  [.67,pose([.12,.12,-.22,.45,.04,.03,-.02,-.8],[.12,.22,-.01],.14,-.032,[0,.017])],
 ],
];
function cubic(values,times,t){
 const [a,b,c,d]=values,[ta,tb,tc,td]=times,span=tc-tb,t2=t*t,t3=t2*t;
 return b.map((v,i)=>{
  const before=ta===tb?0:(c[i]-a[i])/(tc-ta),after=tc===td?0:(d[i]-b[i])/(td-tb);
  return (2*t3-3*t2+1)*v+(t3-2*t2+t)*span*before+(-2*t3+3*t2)*c[i]+(t3-t2)*span*after;
 });
}
function rotationCurve(values,times,t){
 const aligned=values.map(v=>[...v]);
 for(let i=1;i<4;i++)if(aligned[i-1].reduce((sum,v,j)=>sum+v*aligned[i][j],0)<0)aligned[i]=aligned[i].map(v=>-v);
 return new THREE.Quaternion().fromArray(cubic(aligned,times,t)).normalize().toArray();
}
function track(keys,p){
 if(p<=0)return keys[0][1];if(p>=1)return keys.at(-1)[1];
 let i=1;while(p>keys[i][0])i++;
 const nodes=[keys[Math.max(0,i-2)],keys[i-1],keys[i],keys[Math.min(keys.length-1,i+1)]],times=nodes.map(n=>n[0]),t=(p-times[1])/(times[2]-times[1]),frames=nodes.map(n=>n[1]);
 const vector=read=>cubic(frames.map(read),times,t),scalar=read=>vector(f=>[read(f)])[0];
 const joints={};for(const side of ['right','left']){
  const js=frames.map(f=>f.joints[side]);joints[side]={side:js[1].side,upper:rotationCurve(js.map(j=>j.upper),times,t),bend:Math.max(.08,cubic(js.map(j=>[j.bend]),times,t)[0]),roll:cubic(js.map(j=>[j.roll]),times,t)[0],wrist:rotationCurve(js.map(j=>j.wrist),times,t),clavicle:cubic(js.map(j=>j.clavicle),times,t)};
 }
 // Continuous tangents across authored keys avoid a stop at every intermediate
 // pose. Endpoint tangents settle; grip and blade remain attached throughout.
 return finish({sword:true,joints,body:vector(f=>f.body),hipYaw:scalar(f=>f.hipYaw),drop:scalar(f=>f.drop),shift:vector(f=>f.shift),footYaw:vector(f=>f.footYaw),feet:BASE_FEET.map(v=>[...v]),weight:scalar(f=>f.weight)});
}
export function swordMotion(attack,{nextCombo=null}={}){
 if(!attack)return {name:'ready',...ready};
 const stage=((attack.combo||0)%4+4)%4,p=clamp(attack.elapsed/attack.duration),start=attack.blendFrom?.joints?attack.blendFrom:ready;
 // Queued cuts keep the winding posture; no excursion through the idle guard.
 const destination=nextCombo===null?ready:cuts[(nextCombo+4)%4][0][1];
 const recovery=nextCombo===null&&stage===0?[[.76,pose([-.75,.25,-.15,.32,1.50,.04,-.04],[.025,.30,0],.12,-.025,[0,.014])],[.88,pose([-.55,-.10,-.48,.75,.20,.04,-.04],[.025,-.03,0],.04,-.025,[0,0])]]:[];
 const entrance=stage===1&&!attack.blendFrom?.joints?[[.05,pose([-.65,.45,-.13,1.0,.75,.04,-.04],[.025,.15,0],.08,-.025,[0,.014])]]:[];
 const keys=[[0,start],...entrance,...cuts[stage].filter(([time])=>!attack.blendFrom?.joints||time!==.10),...recovery,[1,destination]],out=track(keys,p);
 // Foot placement is in the attack's starting frame. Rendering subtracts actual
 // travelled distance, so a planted foot stays on the ground while the root moves.
 const lead=ease((p-.08)/.25),rear=ease((p-.28)/.35),feet=out.feet.map(v=>[...v]);
 if(p>.08&&p<.33)feet[1][1]+=.037*Math.sin(Math.PI*(p-.08)/.25);
 if(p>.28&&p<.63)feet[0][1]+=.030*Math.sin(Math.PI*(p-.28)/.35);
 return {...out,name:names[stage],feet,footStride:[rear,lead],plantOrigin:attack.origin,plantYaw:attack.yaw};
}
