import * as THREE from '../vendor/three.module.min.js';
import {swordArm} from './sword-motion.js';

const LENGTH=.195;
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
const vector=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const rotation=(a,b,t)=>new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b),t).normalize().toArray();
const defaultHand=side=>({position:[side*.24,.52,.16],rotation:[.6,0,side<0?.2:-.2]});

// Author elbow planes at the pose keys. The sampled arm is a connected
// shoulder, elbow hinge and wrist, rather than an independently moving hand.
export function meleeJoint(hand,side,pole=[side*.5,-.8,-.25],clavicle=[0,0,0]){
 const shoulder=new THREE.Vector3(side*.24,.66,0).add(new THREE.Vector3(...clavicle)),wrist=new THREE.Vector3(...hand.position).sub(shoulder),distance=Math.min(LENGTH*2-.002,Math.max(.005,wrist.length()));wrist.setLength(distance);
 const direction=wrist.clone().normalize(),plane=new THREE.Vector3(...pole).addScaledVector(direction,-new THREE.Vector3(...pole).dot(direction));
 if(plane.lengthSq()<1e-8)plane.set(side,0,0).addScaledVector(direction,-side*direction.x);plane.normalize();
 const elbow=wrist.clone().multiplyScalar(.5).addScaledVector(plane,Math.sqrt(LENGTH*LENGTH-distance*distance/4)),upperDirection=elbow.clone().normalize(),lowerDirection=wrist.clone().sub(elbow).normalize();
 const y=upperDirection.clone().negate(),x=new THREE.Vector3().crossVectors(upperDirection,lowerDirection).negate().normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();
 const upper=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).normalize(),bend=Math.acos(THREE.MathUtils.clamp(upperDirection.dot(lowerDirection),-1,1));
 const lower=upper.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-bend)),grip=lower.clone().invert().multiply(quaternion(hand.rotation)).normalize();
 return {upper:upper.toArray(),bend,roll:0,wrist:grip.toArray(),clavicle:[...clavicle],side};
}
function finish(frame){return {...frame,right:swordArm(frame.joints.right).pose,left:swordArm(frame.joints.left).pose};}
export function meleePose({right=defaultHand(-1),left=defaultHand(1),body=[0,0,0],head=null,hipYaw=0,drop=0,shift=[0,0],feet=[[-.105,.035,.085],[.105,.035,-.015]],footYaw=[0,0],weight=0,poles=[[-.5,-.8,-.25],[.5,-.8,-.25]],clavicles=null,twoHand=false,hasShield=false}={}){
 const joints={right:meleeJoint(right,-1,poles[0],clavicles?.[0])};
 const primary=swordArm(joints.right).pose;
 if(twoHand){const support=new THREE.Vector3(0,.09,0).applyEuler(new THREE.Euler(...primary.rotation)).add(new THREE.Vector3(...primary.position));left={position:support.toArray(),rotation:[...primary.rotation]};}
 joints.left=meleeJoint(left,1,poles[1],clavicles?.[1]);
 return finish({melee:true,twoHand,hasShield,joints,body:[...body],head:head?[...head]:[-body[0]*.7,-body[1]*.85,-body[2]*.55],hipYaw,drop,shift:[...shift],feet:feet.map(v=>[...v]),footYaw:[...footYaw],weight,poles:poles.map(v=>[...v]),...(clavicles?{clavicles:clavicles.map(v=>[...v])}:{}),shaft:twoHand?primary:null});
}
function blendJoint(a,b,t){return {upper:rotation(a.upper,b.upper,t),bend:a.bend+(b.bend-a.bend)*t,roll:a.roll+(b.roll-a.roll)*t,wrist:rotation(a.wrist,b.wrist,t),clavicle:vector(a.clavicle,b.clavicle,t),side:a.side};}
export function blendMelee(a,b,t){
 if(t<=0)return a;if(t>=1)return b;
 const frame={...b,body:vector(a.body,b.body,t),head:vector(a.head||[0,0,0],b.head||[0,0,0],t),hipYaw:a.hipYaw+(b.hipYaw-a.hipYaw)*t,drop:a.drop+(b.drop-a.drop)*t,shift:vector(a.shift,b.shift,t),feet:a.feet.map((v,i)=>vector(v,b.feet[i],t)),footYaw:vector(a.footYaw,b.footYaw,t),weight:a.weight+(b.weight-a.weight)*t,poles:(a.poles||b.poles).map((v,i)=>vector(v,b.poles[i],t))};
 for(const key of ['footPitch','footRoll'])if(a[key]||b[key])frame[key]=vector(a[key]||[0,0],b[key]||[0,0],t);
 if(a.clavicles||b.clavicles)frame.clavicles=(a.clavicles||[[0,0,0],[0,0,0]]).map((v,i)=>vector(v,(b.clavicles||[[0,0,0],[0,0,0]])[i],t));
 if(a.kneePoles||b.kneePoles){
  // Authored poles use root space; poseLeg's default is forward in hip space.
  const defaults=f=>Array.from({length:2},()=>[Math.sin(f.hipYaw),0,Math.cos(f.hipYaw)]);
  frame.kneePoles=(a.kneePoles||defaults(a)).map((v,i)=>vector(v,(b.kneePoles||defaults(b))[i],t));
 }
 if(a.twoHand&&b.twoHand){
  const qa=quaternion(a.shaft.rotation),qb=quaternion(b.shaft.rotation),e=new THREE.Euler().setFromQuaternion(qa.slerp(qb,t));
  return meleePose({...frame,right:{position:vector(a.shaft.position,b.shaft.position,t),rotation:[e.x,e.y,e.z]},twoHand:true});
 }
 if(a.joints&&b.joints)frame.joints={right:blendJoint(a.joints.right,b.joints.right,t),left:blendJoint(a.joints.left,b.joints.left,t)};
 else frame.joints={right:meleeJoint({position:vector(a.right.position,b.right.position,t),rotation:new THREE.Euler().setFromQuaternion(quaternion(a.right.rotation).slerp(quaternion(b.right.rotation),t)).toArray().slice(0,3)},-1,frame.poles[0]),left:meleeJoint({position:vector(a.left.position,b.left.position,t),rotation:new THREE.Euler().setFromQuaternion(quaternion(a.left.rotation).slerp(quaternion(b.left.rotation),t)).toArray().slice(0,3)},1,frame.poles[1])};
 return finish(frame);
}
