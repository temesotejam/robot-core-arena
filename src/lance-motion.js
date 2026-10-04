import * as THREE from '../vendor/three.module.min.js';
import {meleePose,blendMelee} from './melee-pose.js';

// Original three-stage ground combination. W episode 14 (15:37.4–15:40.9)
// informs the separate shield and shaft recovery; episode 19 (16:37.0–16:38.8)
// informs the shoulder-out chamber. Its airborne footwork is not copied into
// the ground thrust. Attack intervals, contact windows and travel are unchanged.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(p,a,b)=>smooth((p-a)/(b-a));
const pulse=(p,a,b,c,d)=>ramp(p,a,b)-ramp(p,c,d);
const baseFeet=[[-.145,.035,.115],[.15,.035,-.095]];
const readyHand=[-.29,.55,.11];
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));

// Preserve velocity through intermediate grip positions. Only an actual
// reversal or the ready endpoint settles, rather than stopping at every key.
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
function facingHand(position,pitch,yaw,body,roll=0){
 const inverse=quaternion(body).invert(),p=new THREE.Vector3(...position);
 p.y-=.36;p.applyQuaternion(inverse);p.y+=.36;
 const aim=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch))
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll));
 const e=new THREE.Euler().setFromQuaternion(inverse.multiply(aim));
 return {position:p.toArray(),rotation:[e.x,e.y,e.z]};
}
function pose({hand=readyHand,pitch=1.34,aim=.27,body=[.025,-.26,.015],hipYaw=-.10,drop=-.045,shift=[0,-.008],weight=0,
 shield=[.215,.59,.245],free=[.255,.59,.045],footStep=0,rearStep=0,footYaw=[-.05,.18]}={},hasShield=false){
 return meleePose({right:facingHand(hand,pitch,aim,body),
  left:hasShield?facingHand(shield,.02,-.10,body,-.08):facingHand(free,.14,-.13,body,-.12),
  body,head:[-body[0]*.85,-body[1]*.94,-body[2]*.7],hipYaw,drop,shift,weight,
  feet:baseFeet.map((v,i)=>[v[0],v[1],v[2]+(i?rearStep:footStep)]),footYaw,
  poles:[[-.62,-.18,.06],[.55,-.20,.12]],hasShield});
}
const ready=pose(),shieldReady=pose({},true);
const recipes=[
 {name:'lowThrust',stage:0,coil:[-.315,.465,.025],pass:[-.215,.495,.285],exit:[-.180,.495,.355],
  loadPitch:1.67,hitPitch:1.60,turn:.59,hipTurn:.56,sink:.052,lean:.075,step:.105,shift:.048},
 {name:'highThrust',stage:1,coil:[-.315,.710,-.015],pass:[-.205,.650,.300],exit:[-.175,.650,.360],
  loadPitch:.83,hitPitch:1.44,turn:.65,hipTurn:.60,sink:.027,lean:.045,step:.085,shift:.046},
 {name:'lunge',stage:2,coil:[-.325,.570,-.045],pass:[-.210,.570,.300],exit:[-.180,.570,.365],
  loadPitch:1.02,hitPitch:1.55,turn:.76,hipTurn:.71,sink:.064,lean:.115,step:.150,shift:.071},
];
function sampled(r,p,hasShield){
 if(p<=0||p>=1)return hasShield?shieldReady:ready;
 const load=r.load??.22,hit=r.hit??.455,
  preload=pulse(p,0,load*.8,load,hit-.04),hip=pulse(p,load-.09,hit-.045,.53,.92),
  chest=pulse(p,load-.03,hit+.025,.57,.95),sink=pulse(p,0,load,hit+.10,.89),
  body=[.025+r.lean*chest,-.26-.23*preload+r.turn*chest,.015-.055*chest],
  hand=curve([[0,readyHand],[load,r.coil],[hit-.10,r.pass],[.51,r.exit],[.65,[-.295,r.stage===1?.655:.535,.125]],[.90,readyHand],[1,readyHand]],p),
  angles=curve([[0,[1.34,.27]],[load,[r.loadPitch,.26]],[hit-.10,[r.hitPitch,.23]],[.51,[r.hitPitch,.22]],[.68,[r.stage===1?1.06:1.26,.27]],[.93,[1.34,.27]],[1,[1.34,.27]]],p),
  guard=curve([[0,[.215,.59,.245]],[load,[.205,.625,.260]],[hit,[.235,.580,.245]],[.67,[.205,.610,.260]],[.93,[.215,.59,.245]],[1,[.215,.59,.245]]],p),
  free=curve([[0,[.255,.59,.045]],[load,[.235,.640,.055]],[hit,[.290,.565,-.125]],[.67,[.255,.615,.045]],[.93,[.255,.59,.045]],[1,[.255,.59,.045]]],p);
 // The rear leg and pelvis begin the drive before the chest arrives. The
 // shield covers the front during the separate elbow/shaft fold on recovery.
 return pose({hand,pitch:angles[0],aim:angles[1],body,hipYaw:-.10-.19*preload+r.hipTurn*hip,
  drop:-.045-r.sink*sink,shift:[-.018*hip,-.008-.022*preload+r.shift*chest],weight:Math.max(hip,chest),
  shield:guard,free,footStep:r.step*chest,rearStep:-.018*preload,
  footYaw:[-.05+.10*hip,.18+.20*hip]},hasShield);
}
function makeClip(r){
 const sample=(p,hasShield=false)=>sampled(r,p,hasShield),load=r.load??.22;
 return {name:r.name,stage:r.stage,contact:r.contact||{start:.34,center:.455,end:.51},
  sample,prepare:sample(load),shieldPrepare:sample(load,true),load,
  keys:[[0,ready],[load,sample(load)],[.455,sample(.455)],[.65,sample(.65)],[1,ready]],
  shieldKeys:[[0,shieldReady],[load,sample(load,true)],[.455,sample(.455,true)],[.65,sample(.65,true)],[1,shieldReady]]};
}
const clips=recipes.map(makeClip);
const charged=makeClip({...recipes[2],stage:undefined,load:.26,hit:.46,contact:{start:.36,center:.46,end:.51}});
function sampleClip(clip,p,start,{hasShield=false}={}){
 const prepare=hasShield?clip.shieldPrepare:clip.prepare;
 if(p<=0)return start;
 if(p<clip.load&&(start.name==='chargeHold'&&clip===charged||start.preparedNext===clip.stage&&clip.stage!==undefined))return blendMelee(start,prepare,ramp(p,0,clip.load));
 const out=clip.sample(p,hasShield);
 return p<.14?blendMelee(start,out,ramp(p,0,.14)):out;
}
function chargeHold(charging,{hasShield=false}={}){
 const base=hasShield?shieldReady:ready,hold=hasShield?charged.shieldPrepare:charged.prepare,
  amount=smooth(clamp(charging.amount??(charging.elapsed||0)/.6)),loaded=blendMelee(base,hold,amount);
 return blendMelee(charging.from||base,loaded,ramp(charging.elapsed||0,0,.10));
}
export const LANCE_MOTIONS={ready,shieldReady,lead:0,chainStart:.62,chainAmount:1,clips,charged,sampleClip,chargeHold};
