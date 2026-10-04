import * as THREE from '../vendor/three.module.min.js';
import {meleePose,blendMelee} from './melee-pose.js';

// Original two-handed hammer choreography. W 21 (18:41–18:47.5) and 38
// (13:11–13:19) show large blades/shafts, not this hammer's full ground combo.
// Their shoulder-out carry, torso turn and separate recovery inform the pose.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(p,a,b)=>smooth((p-a)/(b-a));
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
const baseFeet=[[-.16,.035,-.105],[.16,.035,.125]];

// A shape-preserving cubic keeps the rigid shaft moving through an impact
// landmark. Only an actual reversal or the final carry settles to zero speed.
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
function landmark(hand,pitch,azimuth,sourceBody,body,hipYaw,drop,shift,weight,footYaw=[-.13,.20]){
 const position=new THREE.Vector3(...hand).sub(new THREE.Vector3(0,.36,0)).applyEuler(new THREE.Euler(...sourceBody)).add(new THREE.Vector3(0,.36,0));
 return {hand:position.toArray(),angles:[pitch+sourceBody[0],azimuth+sourceBody[1],sourceBody[2]],body,hipYaw,drop,shift,weight,footYaw};
}
const carry=landmark([.018,.48,.095],1.26,-1.12,[.065,-.40,.035],[.065,-.40,.035],-.24,-.065,[-.018,-.020],0);
function pose(f){
 const inverse=quaternion(f.body).invert(),position=new THREE.Vector3(...f.hand).sub(new THREE.Vector3(0,.36,0)).applyQuaternion(inverse).add(new THREE.Vector3(0,.36,0)),
  shaft=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),f.angles[1])
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),f.angles[0]))
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),f.angles[2])),
  e=new THREE.Euler().setFromQuaternion(inverse.multiply(shaft));
 return {...meleePose({right:{position:position.toArray(),rotation:[e.x,e.y,e.z]},twoHand:true,
  body:f.body,head:[-f.body[0]*.85,-f.body[1]*.94,-f.body[2]*.7],hipYaw:f.hipYaw,drop:f.drop,shift:f.shift,weight:f.weight,
  feet:baseFeet.map(v=>[...v]),footYaw:f.footYaw,poles:[[-.74,-.40,-.28],[.66,-.32,-.22]]}),tailClearance:true};
}
const ready=pose(carry);
const at=(hand,pitch,azimuth,oldBody,body,hip,drop,shift,weight,yaw)=>landmark(hand,pitch,azimuth,oldBody,body,hip,drop,shift,weight,yaw);
const sweepKeys=[
 [0,carry],
 [.12,at([.025,.58,.135],1.24,-.54,[-.04,-.22,.02],[-.035,-.42,.04],-.46,-.078,[.020,-.028],.45)],
 [.23,at([.030,.585,.150],1.42,-.57,[-.065,-.40,.025],[-.055,-.66,.045],-.58,-.097,[.025,-.029],.78)],
 [.28,at([.025,.590,.155],1.48,-.57,[-.060,-.43,.025],[-.045,-.66,.042],-.17,-.100,[.025,-.011],.93)],
 [.335,at([.005,.590,.178],1.50,-.40,[.020,-.25,.012],[.028,-.42,.020],.28,-.093,[.010,.018],1)],
 [.395,at([-.020,.585,.180],1.53,.03,[.085,.08,-.016],[.10,.08,-.035],.52,-.089,[-.010,.045],1)],
 [.48,at([-.042,.565,.170],1.62,.43,[.13,.49,-.035],[.155,.66,-.055],.58,-.079,[-.025,.059],1,[.18,.27])],
 [.61,at([-.044,.565,.138],1.57,.23,[.11,.61,-.03],[.13,.77,-.050],.46,-.071,[-.018,.043],.68,[.21,.25])],
 [.74,at([-.023,.610,.145],.80,-.40,[.06,.39,-.018],[.085,.45,-.030],.23,-.061,[-.007,.019],.35)],
 [.94,carry],[1,carry],
];
const slamKeys=[
 [0,carry],
 [.10,at([.015,.710,.210],.10,-.08,[-.025,-.08,.010],[-.028,-.32,.025],-.31,-.073,[.009,-.028],.35)],
 [.225,at([.018,.858,.185],-.67,-.08,[-.040,-.06,.010],[-.065,-.40,.026],-.30,-.096,[.010,-.033],.78)],
 [.28,at([.018,.858,.185],-.73,-.08,[-.040,-.04,.008],[-.063,-.37,.024],.04,-.098,[.010,-.010],.94)],
 [.34,at([-.023,.760,.130],.38,-.06,[.015,-.02,.004],[.02,-.21,.010],.28,-.103,[.005,.028],1)],
 [.405,at([-.022,.670,.155],1.32,-.04,[.14,.01,-.004],[.16,.06,-.024],.34,-.108,[-.008,.058],1)],
 [.48,at([-.023,.718,.155],2.10,-.04,[.21,.015,-.004],[.235,.13,-.030],.29,-.101,[-.014,.067],1,[.07,.25])],
 [.59,at([-.023,.722,.135],2.13,-.04,[.19,.012,-.003],[.205,.10,-.024],.19,-.096,[-.009,.048],.72,[.07,.25])],
 [.72,at([-.025,.650,.128],1.62,-.06,[.11,.01,0],[.13,-.01,-.009],.05,-.071,[-.003,.018],.38)],
 [.92,carry],[1,carry],
];
const chargedKeys=[
 [0,carry],
 [.10,at([.015,.720,.210],.10,-.10,[-.027,-.12,.01],[-.04,-.38,.032],-.39,-.083,[.012,-.032],.43)],
 [.225,at([.018,.858,.185],-.76,.72,[-.045,-.12,.012],[-.079,-.47,.033],-.36,-.109,[.014,-.037],.86)],
 [.28,at([.018,.858,.185],-.79,.72,[-.045,-.10,.012],[-.075,-.44,.032],.06,-.112,[.012,-.014],1)],
 [.36,at([-.020,.746,.137],.84,-.07,[.065,-.05,.003],[.083,-.19,.008],.35,-.115,[.005,.037],1)],
 [.48,at([-.020,.758,.138],2.22,-.05,[.215,.02,-.006],[.245,.16,-.036],.35,-.108,[-.016,.071],1,[.09,.28])],
 [.59,at([-.021,.762,.117],2.23,-.05,[.19,.017,-.005],[.225,.13,-.027],.24,-.101,[-.009,.048],.75,[.09,.28])],
 [.78,at([-.023,.693,.110],1.38,-.07,[.09,.007,0],[.125,-.04,-.010],.06,-.072,[-.005,.014],.36)],
 [.94,carry],[1,carry],
];
function makeClip(name,stage,keys,contact,footwork={land:.29,rearLand:.65,gatherEnd:.94,lift:.070}){
 const channels=['hand','angles','body','shift','footYaw'],values=Object.fromEntries(channels.map(c=>[c,keys.map(([t,f])=>[t,f[c]])])),
  scalar=['hipYaw','drop','weight'];for(const c of scalar)values[c]=keys.map(([t,f])=>[t,[f[c]]]);
 const sample=p=>{
  if(p<=0||p>=1)return ready;
  const f=Object.fromEntries(channels.map(c=>[c,curve(values[c],p)]));for(const c of scalar)f[c]=curve(values[c],p)[0];return pose(f);
 };
 const load=.225;
 return {name,stage,contact,footwork,load,sample,prepare:sample(load),keys:[[0,ready],[load,sample(load)],[.48,sample(.48)],[.65,sample(.65)],[1,ready]]};
}
const clips=[makeClip('hammerSweep',0,sweepKeys,{start:.329,center:.413,end:.458}),makeClip('hammerSlam',1,slamKeys,{start:.377,center:.403,end:.464})],
 charged=makeClip('hammerSlam',undefined,chargedKeys,{start:.384,center:.427,end:.458},{land:.29,rearLand:.45,gatherEnd:.72,lift:.075});
function sampleClip(clip,p,start){
 if(p<=0)return start;
 if(p<clip.load&&(start.name==='chargeHold'&&clip===charged||start.preparedNext===clip.stage&&clip.stage!==undefined))return blendMelee(start,clip.prepare,ramp(p,0,clip.load));
 const out=clip.sample(p);return p<.12?blendMelee(start,out,ramp(p,0,.12)):out;
}
function chargeHold(charging){
 // Lift forward of the helmet before taking the head back. Directly blending
 // carry and overhead load sweeps the shaft through Panzer's wider helmet.
 const amount=smooth(clamp(charging.amount??(charging.elapsed||0))),loaded=charged.sample(charged.load*amount);
 return blendMelee(charging.from||ready,loaded,ramp(charging.elapsed||0,0,.10));
}
export const HAMMER_MOTIONS={ready,lead:1,chainStart:.64,chainAmount:1,clips,charged,sampleClip,chargeHold};
