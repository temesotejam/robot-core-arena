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
 // A single grip is used by every cut. The blade never changes grip at the
 // overhead transition; only small wrist flexion/deviation are authored.
 const wrist=quat([(side<0?2.20:Math.PI/2)+a[5],0,a[6]]);
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
// Raise and lower the arm in one inward-facing plane through the target.
// Pre-rotating that plane avoids steering the overhead cut with wrist twist.
function overheadArm(pitch,bend){
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.35).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch)),e=new THREE.Euler().setFromQuaternion(q);
 return [e.x,e.y,e.z,bend,0,.025,0];
}
const cuts=[
 [
  [.10,pose([-1.017,-0.343,-0.228,1.424,-0.244,0.025,-0.025],[0,-.42,.025],-.25,-.032,[.008,-.012])],
  [.16,pose([-1.137,-0.145,0.235,0.760,-0.491,0.025,-0.025],[-.03,-.56,.035],-.20,-.036,[.010,-.008],[-.30,.16,.25,1.40,.10,.04,.02],[-.18,.02],[0,.015,-.008])],
  [.27,pose([-1.173,-0.115,0.538,0.453,-0.591,0.025,-0.025],[.025,-.26,.015],.12,-.042,[.012,.014],[-.30,-.08,.23,1.40,-.12,.04,.02])],
  [.40,pose([-0.611,0.045,0.815,0.421,-0.500,0.025,-0.025],[.10,.38,-.035],.28,-.042,[-.006,.026],[.65,-.20,.30,.45,.05,.04,.02],[.12,.05],[.008,0,.015])],
  [.53,pose([-0.220,0.178,1.226,0.250,-0.429,0.025,-0.025],[.12,.67,-.035],.33,-.033,[-.014,.020],[.65,-.20,.30,.45,.05,.04,.02],[.20,.06])],
  [.67,pose([0.313,0.495,1.350,0.250,-0.111,0.025,-0.025],[.065,.53,-.015],.24,-.025,[-.006,.008],[.65,-.20,.30,.45,.05,.04,.02],[.12,.04])],
 ],
 [],
 [
  [.10,pose([0.650,-0.200,-0.600,1.250,0.150,0.025,-0.025],[.08,-.39,.035],-.16,-.043,[.010,-.012])],
  [.16,pose([0.561,-0.278,-0.688,1.090,0.152,0.025,-0.025],[.13,-.48,.045],-.12,-.052,[.008,-.009],[-.16,.16,.19,1.35,.08,.04,.02],[-.10,.04])],
  [.27,pose([-0.444,0.214,-0.432,0.376,0.299,0.025,-0.025],[.035,-.16,.020],.16,-.035,[.006,.020])],
  [.40,pose([-1.219,0.424,-0.137,0.316,0.164,0.025,-0.025],[-.055,.25,-.015],.22,-.011,[0,.026],[-.24,-.10,.17,1.50,-.14,.04,.02],[.10,.04],[0,.012,.008])],
  [.53,pose([-1.749,0.660,0.012,0.699,-0.064,0.025,-0.025],[-.09,.39,-.025],.20,-.008,[-.004,.012],[-.24,-.10,.17,1.50,-.14,.04,.02],[.12,.04],[0,.018,0])],
  [.67,pose([-1.600,0.450,-0.120,1.209,0.012,0.025,-0.025],[-.045,.19,-.015],.10,-.019,[0,0])],
 ],
 [
  [.10,pose(overheadArm(-1.227,1.736),[-0.04,0,0],-.12,-.031,[0,-.010])],
  [.16,pose(overheadArm(-1.906,0.928),[-0.095,0,0],-.09,-.038,[.005,-.010],[-.22,.10,.22,1.36,.02,.04,.02],[-.10,.06],[0,.02,-.012])],
  [.27,pose(overheadArm(-1.419,0.849),[-0.015,0,0],.10,-.048,[0,.015])],
  [.40,pose(overheadArm(-0.175,0.982),[0.16,0,0],.17,-.058,[0,.034],[-.10,-.06,.30,1.32,-.05,.04,.02],[.08,.06])],
  [.53,pose(overheadArm(0.725,1.224),[0.23,0,0],.20,-.050,[0,.032],[-.03,-.16,.29,1.36,-.12,.04,.02],[.14,.07])],
  [.67,pose(overheadArm(1.1,1.719),[0.12,0,0],.14,-.032,[0,.017])],
 ],
];
// The return cut retraces the established cutting plane in the opposite
// direction, with its own preparation and recovery timing.
cuts[1]=[.10,.16,.27,.40,.53,.67].map((time,i)=>[time,cuts[0][[5,4,3,2,1,0][i]][1]]);
cuts[1][0][1]=blendSword(cuts[0][5][1],cuts[0][4][1],.30);
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
 const keys=[[0,start],...cuts[stage].filter(([time])=>!attack.blendFrom?.joints||time!==.10),[1,destination]],out=track(keys,p);
 // Foot placement is in the attack's starting frame. Rendering subtracts actual
 // travelled distance, so a planted foot stays on the ground while the root moves.
 const lead=ease((p-.08)/.25),rear=ease((p-.28)/.35),feet=out.feet.map(v=>[...v]);
 if(p>.08&&p<.33)feet[1][1]+=.037*Math.sin(Math.PI*(p-.08)/.25);
 if(p>.28&&p<.63)feet[0][1]+=.030*Math.sin(Math.PI*(p-.28)/.35);
 return {...out,name:names[stage],feet,footStride:[rear,lead],plantOrigin:attack.origin,plantYaw:attack.yaw};
}
