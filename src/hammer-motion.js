import * as THREE from '../vendor/three.module.min.js';
import {meleePose,fitShaftGrip,blendMelee} from './melee-pose.js';
import {HAMMER_GRIP} from './hammer-grip.js';
import {swordArm} from './sword-motion.js';

// Original heavy, two-handed cuts, following the user's greatsword direction.
// W 21/38 are related large-blade references, not a measured hammer combo.
// Author the grip and the whole rigid shaft in facing space, then solve both
// connected arms in the rotating chest. The head traces a diagonal, not a
// horizontal stick twirled at the wrists.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(p,a,b)=>smooth((p-a)/(b-a));
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
const baseFeet=[[-.16,.035,-.105],[.16,.035,.125]];
// Protract both connected shoulder sockets; keep a bend reserve and route the
// wrists and elbow planes in front of the breastplate, including wide frames.
const clavicles=[[-.014,0,.135],[.014,0,.135]];

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
function at(hand,pitch,azimuth,body,hipYaw,drop,shift,weight,footYaw=[-.13,.20],roll=0){
 return {hand,axis:[Math.sin(pitch)*Math.sin(azimuth),Math.cos(pitch),Math.sin(pitch)*Math.cos(azimuth)],body,hipYaw,drop,shift,weight,footYaw,roll};
}
// Approved low side guard: shoulders forward, both hands at the right hip,
// the head trailing outside the right thigh. Roll the entire rigid grip frame,
// never the head on its own; its central T-joint stays square to the shaft.
const carry=at([-.105,.540,.205],1.77,-2.80,[.150,-.56,.025],-.23,-.058,[.005,.014],0,[-.13,.20],Math.PI/2);
function pose(f,guideElbow=false){
 const inverse=quaternion(f.body).invert(),position=new THREE.Vector3(...f.hand).sub(new THREE.Vector3(0,.36,0)).applyQuaternion(inverse).add(new THREE.Vector3(0,.36,0)),
  // Follow the shaft direction with one swing rotation, then the authored
  // grip roll. This preserves the mounting angle and both hand sockets.
  shaft=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...f.axis).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),f.roll)),
  localShaft=inverse.multiply(shaft),support=new THREE.Vector3(...HAMMER_GRIP.support).applyQuaternion(localShaft),
  centres=clavicles.map((v,i)=>new THREE.Vector3(i?.24:-.24,.66,0).add(new THREE.Vector3(...v)).sub(i?support:new THREE.Vector3()));
 // Author the same haft path at the rear socket, then move the lead wrist
 // along that rigid haft. Swapping hands must not lengthen the blow's reach.
 position.add(new THREE.Vector3(0,HAMMER_GRIP.advance,0).applyQuaternion(localShaft));
 position.x-=.035;
 // Project the *whole grip frame* into the two arms' common, bent-arm reach
 // and front clearance half-space. Both fixed wrists remain on one rigid haft.
 // The shared one-hand IK alone would clamp a supporting wrist off the haft.
 const front=.285;
 for(let n=0;n<24;n++){
  for(const centre of centres){const offset=position.clone().sub(centre);if(offset.length()>.375)position.copy(centre).add(offset.setLength(.375));}
  position.z=Math.max(position.z,front-Math.min(0,support.z));
 }
 if(!guideElbow){
  const e=new THREE.Euler().setFromQuaternion(localShaft),fit=fitShaftGrip({position:position.toArray(),rotation:[e.x,e.y,e.z],gripLimit:f.gripLimit},HAMMER_GRIP.support,f.poles||carry.poles,clavicles,HAMMER_GRIP.limits,true);
  position.set(...fit.position);localShaft.copy(quaternion(fit.rotation));
 }
 if(f.upright){
  // Present the broad head on edge as it passes the rear shoulder fins. Turn
  // the entire rigid tool around its haft; the approved carry remains exact.
  const axis=new THREE.Vector3(0,1,0).applyQuaternion(localShaft),worldAxis=axis.clone().applyQuaternion(quaternion(f.body)),across=new THREE.Vector3(1,0,0).applyQuaternion(localShaft),edge=new THREE.Vector3(0,-worldAxis.z,worldAxis.y).normalize().applyQuaternion(quaternion(f.body).invert());
  if(across.dot(edge)<0)edge.negate();across.lerp(edge,f.upright).addScaledVector(axis,-across.dot(axis)).normalize();
  localShaft.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,axis,new THREE.Vector3().crossVectors(across,axis).normalize()));
 }
 const e=new THREE.Euler().setFromQuaternion(localShaft);
 return {...meleePose({right:{position:position.toArray(),rotation:[e.x,e.y,e.z],gripLimit:f.gripLimit},twoHand:true,supportGrip:HAMMER_GRIP.support,shaftGrip:true,shaftLimits:guideElbow?null:HAMMER_GRIP.limits,guideElbow:true,
  body:f.body,head:[-f.body[0]*.85,-f.body[1]*.94,-f.body[2]*.7],hipYaw:f.hipYaw,drop:f.drop,shift:f.shift,weight:f.weight,
  feet:baseFeet.map(v=>[...v]),footYaw:f.footYaw,poles:f.poles||[[-1.40,-.55,1.60],[1.40,-.55,1.60]],clavicles}),tailClearance:true};
}
function elbowGuide(frame){return ['right','left'].map(side=>{
 const a=swordArm(frame.joints[side]),direction=a.wrist.clone().normalize(),front=new THREE.Vector3(0,0,1).addScaledVector(direction,-direction.z).normalize(),tangent=new THREE.Vector3().crossVectors(direction,front).normalize(),plane=a.elbow.clone().addScaledVector(a.wrist,-.5).normalize();
 return {direction,front,tangent,plane,angle:Math.atan2(plane.dot(tangent),plane.dot(front))};
});}
carry.poles=elbowGuide(pose(carry,true)).map(g=>g.plane.toArray());
const ready=pose(carry);
// Low rear guard -> right-side load -> front target -> left hip. The hips
// open while the heavy head is still loaded, before the chest accelerates.
const sweepKeys=[
 [0,carry],
 [.09,at([-.075,.600,.255],1.10,-2.50,[.120,-.52,.030],-.30,-.065,[.010,.003],.16,[-.13,.20],Math.PI/2)],
 [.16,at([-.055,.655,.250],.70,-2.00,[.090,-.62,.035],-.46,-.072,[.016,-.026],.42,[-.13,.20],1.35)],
 [.23,at([-.010,.700,.210],-.62,1.08,[-.045,-.66,.045],-.58,-.089,[.022,-.030],.78)],
 [.28,at([-.025,.695,.210],-.40,1.15,[-.040,-.66,.043],-.16,-.093,[.022,-.010],.93)],
 [.335,at([-.025,.630,.245],1.24,-.15,[.060,-.42,.020],.29,-.086,[.006,.028],1)],
 [.395,at([-.005,.605,.265],1.60,.20,[.125,.09,-.030],.53,-.090,[-.009,.049],1)],
 [.48,at([.012,.707,.200],1.80,.85,[.170,.68,-.050],.60,-.080,[-.019,.062],1,[.17,.27])],
 [.54,at([.010,.717,.190],1.82,1.04,[.155,.79,-.046],.47,-.074,[-.014,.047],.74,[.20,.25])],
 [.59,at([.005,.650,.245],1.35,.30,[.110,.40,-.015],.22,-.064,[-.006,.022],.42,[-.13,.20],.35)],
 [.86,at([-.060,.620,.250],.80,-2.30,[.130,-.35,.022],-.13,-.061,[.002,.013],.22,[-.13,.20],Math.PI/2)],
 [.995,carry],[1,carry],
];
// The first cut's follow-through gathers up the left side for a diagonal
// return, rather than standing up and repeating a centred overhead chop.
const slamKeys=[
 [0,carry],
 [.09,at([-.075,.600,.255],1.10,-2.50,[.120,-.48,.025],-.05,-.068,[.003,.003],.16,[-.13,.20],Math.PI/2)],
 [.15,at([-.025,.670,.260],-.70,1.18,[.065,-.12,.010],.18,-.080,[-.008,-.014],.30,[-.13,.20],.40)],
 [.19,at([-.005,.745,.200],.02,.95,[-.040,.28,-.030],.38,-.085,[-.015,-.026],.52,[-.13,.20],.20)],
 [.225,at([.025,.770,.180],.50,1.28,[-.070,.61,-.045],.48,-.098,[-.020,-.030],.82)],
 [.29,at([.025,.765,.195],.57,1.18,[-.065,.58,-.040],-.08,-.102,[-.018,-.007],.95)],
 [.35,at([.012,.710,.250],1.15,.24,[.045,.34,-.015],-.32,-.105,[-.007,.031],1)],
 [.405,at([-.008,.665,.265],1.48,-.03,[.145,-.09,.023],-.47,-.110,[.010,.059],1)],
 [.48,at([-.018,.735,.185],1.90,-.86,[.245,-.65,.048],-.54,-.102,[.016,.067],1,[-.25,.06])],
 [.60,at([-.020,.735,.155],1.90,-1.04,[.205,-.69,.042],-.38,-.094,[.010,.046],.72,[-.23,.06])],
 [.75,at([-.075,.645,.230],.80,-2.30,[.150,-.56,.030],-.25,-.068,[.006,.012],.34,[-.13,.20],Math.PI/2)],
 [.86,at([-.085,.595,.205],1.35,-2.80,[.150,-.58,.027],-.24,-.060,[.005,.006],.10,[-.13,.20],Math.PI/2)],
 [.95,carry],[1,carry],
];
// A longer rear-side load and one deep descending cut. Do not twirl or reset
// the already-loaded weapon when the held attack is released.
const chargedKeys=[
 [0,carry],
 [.085,at([-.075,.620,.255],1.10,-2.50,[.120,-.54,.030],-.30,-.070,[.010,.003],.16,[-.13,.20],Math.PI/2)],
 [.155,at([-.055,.680,.250],.70,-2.00,[.070,-.63,.040],-.46,-.080,[.016,-.029],.43,[-.13,.20],1.35)],
 [.225,at([-.015,.765,.210],-.60,1.08,[-.080,-.65,.052],-.47,-.110,[.020,-.036],.86)],
 [.28,at([-.015,.760,.220],-.53,1.05,[-.075,-.62,.050],.07,-.114,[.017,-.013],1)],
 [.36,at([-.025,.720,.260],.98,-.28,[.065,-.31,.023],.35,-.117,[.004,.038],1)],
 [.395,at([-.010,.690,.270],1.39,-.10,[.155,-.05,-.011],.49,-.119,[-.008,.058],1)],
 [.48,at([.005,.755,.200],1.92,.50,[.275,.56,-.048],.52,-.109,[-.018,.073],1,[.12,.28])],
 [.60,at([.005,.755,.160],1.96,.75,[.235,.65,-.039],.36,-.102,[-.011,.048],.74,[.12,.28])],
 [.73,at([.005,.700,.250],1.36,.22,[.130,.28,-.015],.12,-.073,[-.005,.017],.42,[-.13,.20],.30)],
 [.82,at([-.060,.650,.250],.80,-2.30,[.150,-.40,.025],-.18,-.061,[.002,.013],.22,[-.13,.20],Math.PI/2)],
 [.90,at([-.080,.600,.205],1.35,-2.80,[.140,-.50,.024],-.20,-.059,[.003,.006],.08,[-.13,.20],Math.PI/2)],
 [.96,carry],[1,carry],
];
function makeClip(name,stage,keys,contact,footwork={land:.29,rearLand:.65,gatherEnd:.94,lift:.070}){
 const channels=['hand','axis','body','shift','footYaw'],values=Object.fromEntries(channels.map(c=>[c,keys.map(([t,f])=>[t,f[c]])])),
  scalar=['hipYaw','drop','weight','roll'];for(const c of scalar)values[c]=keys.map(([t,f])=>[t,[f[c]]]);
 const data=p=>{const f=Object.fromEntries(channels.map(c=>[c,curve(values[c],p)]));for(const c of scalar)f[c]=curve(values[c],p)[0];const release=ramp(p,0,.15)*(1-ramp(p,.70,.98)),lift=THREE.MathUtils.clamp((f.hand[1]-.60)*16,-.55,3);f.poles=carry.poles.map((v,i)=>new THREE.Vector3(...v).lerp(new THREE.Vector3(i?1.40:-1.40,lift,1.60).normalize(),release).normalize().toArray());f.gripLimit=90;f.upright=smooth((f.roll-1)/.3)*ramp(p,0,.05)*(1-ramp(p,.94,.995));return f;};
 const returnStart=.54,returnPath=[];let distance=0,previous;
 if(stage===0)for(let n=0;n<=240;n++){
  const p=returnStart+(1-returnStart)*n/240,f=data(p),frame=pose(f),head=new THREE.Vector3(0,.46,0).applyEuler(new THREE.Euler(...frame.shaft.rotation)).add(new THREE.Vector3(...frame.shaft.position)).sub(new THREE.Vector3(0,.36,0)).applyQuaternion(quaternion(frame.body)).add(new THREE.Vector3(frame.shift[0],.36+frame.drop,frame.shift[1]));
  if(previous)distance+=head.distanceTo(previous);returnPath.push([distance,p]);previous=head;
 }
 const retime=p=>{
  if(!returnPath.length||p<=returnStart)return p;
  // Recover the heavy head with a gradual start and finish, spreading the
  // curved path's travel over time rather than snapping the last lowering.
  const target=distance*smooth((p-returnStart)/(1-returnStart));
  for(let n=1;n<returnPath.length;n++)if(target<=returnPath[n][0]){const [a,from]=returnPath[n-1],[b,to]=returnPath[n];return from+(to-from)*(target-a)/Math.max(1e-9,b-a);}
  return 1;
 };
 const sample=p=>{
  if(p<=0||p>=1)return ready;
  return pose(data(retime(p)));
 };
 const load=.225;
 return {name,stage,contact,footwork,load,sample,prepare:sample(load),keys:[[0,ready],[load,sample(load)],[.48,sample(.48)],[.65,sample(.65)],[1,ready]]};
}
const clips=[makeClip('hammerSweep',0,sweepKeys,{start:.329,center:.413,end:.458}),makeClip('hammerSlam',1,slamKeys,{start:.377,center:.403,end:.464})],
 charged=makeClip('hammerSlam',undefined,chargedKeys,{start:.384,center:.427,end:.458},{land:.29,rearLand:.45,gatherEnd:.72,lift:.075});
function sampleClip(clip,p,start){
 if(p<=0)return start;
 if(p<clip.load&&(start.name==='chargeHold'&&clip===charged||start.preparedNext===clip.stage&&clip.stage!==undefined))return blendMelee(start,clip.prepare,ramp(p,0,clip.load));
 const out=clip.sample(p);
 // These curves already leave the exact ready pose. A second blend from that
 // same pose cuts across the clearance arc beside the chest during loading.
 return start.joints===ready.joints?out:p<.12?blendMelee(start,out,ramp(p,0,.12)):out;
}
function chargeHold(charging){
 // Follow the low-to-high rear-side load, including helmet clearance.
 const amount=smooth(clamp(charging.amount??(charging.elapsed||0))),loaded=charged.sample(charged.load*amount);
 return blendMelee(charging.from||ready,loaded,ramp(charging.elapsed||0,0,.10));
}
export const HAMMER_MOTIONS={ready,lead:1,chainStart:.64,chainAmount:1,clips,charged,sampleClip,chargeHold};
