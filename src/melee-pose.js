import * as THREE from '../vendor/three.module.min.js';
import {swordArm} from './sword-motion.js';

const LENGTH=.195;
const quaternion=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
const vector=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const rotation=(a,b,t)=>new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b),t).normalize().toArray();
const defaultHand=side=>({position:[side*.24,.52,.16],rotation:[.6,0,side<0?.2:-.2]});

// Author elbow planes at the pose keys. The sampled arm is a connected
// shoulder, elbow hinge and wrist, rather than an independently moving hand.
export function meleeJoint(hand,side,pole=[side*.5,-.8,-.25],clavicle=[0,0,0],shaftGrip=false,guideElbow=false){
 const shoulder=new THREE.Vector3(side*.24,.66,0).add(new THREE.Vector3(...clavicle)),wrist=new THREE.Vector3(...hand.position).sub(shoulder),distance=Math.min(LENGTH*2-.002,Math.max(.005,wrist.length()));wrist.setLength(distance);
 const direction=wrist.clone().normalize(),plane=new THREE.Vector3(...pole).addScaledVector(direction,-new THREE.Vector3(...pole).dot(direction));
 if(plane.lengthSq()<1e-8)plane.set(side,0,0).addScaledVector(direction,-side*direction.x);plane.normalize();
 const shaft=new THREE.Vector3(0,1,0).applyQuaternion(quaternion(hand.rotation)),height=Math.sqrt(LENGTH*LENGTH-distance*distance/4);
 if(guideElbow){
  // Pick an elbow on the same fixed-length hinge circle that lets the forearm
  // meet the haft across it. The old pole could put forearm and haft in line,
  // requiring the wrist to fold back even when both hands hit their sockets.
  const along=wrist.dot(shaft)/2,limit=LENGTH*Math.sin((hand.gripLimit??18)*Math.PI/180),tangent=new THREE.Vector3().crossVectors(direction,plane).normalize(),front=(.235-shoulder.z-wrist.z/2)/height,candidates=[0];
  const roots=(axis,value)=>{const a=plane.dot(axis),b=tangent.dot(axis),radius=Math.hypot(a,b);if(radius<1e-8||Math.abs(value)>radius)return;const centre=Math.atan2(b,a),angle=Math.acos(value/radius);candidates.push(centre-angle,centre+angle);};
  roots(new THREE.Vector3(0,0,1),front);roots(shaft,(along-limit)/height);roots(shaft,(along+limit)/height);roots(shaft,along/height);
  const extremum=Math.atan2(tangent.dot(shaft),plane.dot(shaft));candidates.push(extremum,extremum+Math.PI);
  const options=candidates.map(angle=>{angle=Math.atan2(Math.sin(angle),Math.cos(angle));const p=plane.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle));return {p,angle:Math.abs(angle),residual:Math.abs(along-height*p.dot(shaft))};}).filter(o=>o.p.z>=Math.min(front,Math.hypot(plane.z,tangent.z))-1e-8);
  const comfortable=options.filter(o=>o.residual<=limit+1e-8),choices=comfortable.length?comfortable:options;
  choices.sort((a,b)=>comfortable.length?a.angle-b.angle:a.residual-b.residual||a.angle-b.angle);
  if(choices.length)plane.copy(choices[0].p);
 }
 const elbow=wrist.clone().multiplyScalar(.5).addScaledVector(plane,Math.sqrt(LENGTH*LENGTH-distance*distance/4)),upperDirection=elbow.clone().normalize(),lowerDirection=wrist.clone().sub(elbow).normalize();
 const y=upperDirection.clone().negate(),x=new THREE.Vector3().crossVectors(upperDirection,lowerDirection).negate().normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();
 const upper=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).normalize(),bend=Math.acos(THREE.MathUtils.clamp(upperDirection.dot(lowerDirection),-1,1));
 const lower=upper.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-bend));let orientation=quaternion(hand.rotation),roll=0;
 if(shaftGrip){
  // Hand local Y follows the haft; local Z is its long axis, continuing the
  // forearm. Each fist can turn around the haft without rotating the head.
  const z=lowerDirection.clone().addScaledVector(shaft,-lowerDirection.dot(shaft)).normalize(),x=new THREE.Vector3().crossVectors(shaft,z).normalize();
  orientation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,shaft,z)).normalize();
  const neutral=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),relative=lower.clone().invert().multiply(orientation).multiply(neutral.invert());
  // Pronation belongs to the forearm, not to an unrestricted wrist quaternion.
  roll=2*Math.atan2(relative.y,relative.w);roll=Math.atan2(Math.sin(roll),Math.cos(roll));
  lower.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),roll));
 }
 const grip=lower.clone().invert().multiply(orientation).normalize();
 return {upper:upper.toArray(),bend,roll,wrist:grip.toArray(),clavicle:[...clavicle],side};
}
function finish(frame){return {...frame,right:swordArm(frame.joints.right).pose,left:swordArm(frame.joints.left).pose};}
export function fitShaftGrip(right,supportGrip,poles,clavicles,limits,guideElbow=false){
 const position=new THREE.Vector3(...right.position),orientation=quaternion(right.rotation),axis=new THREE.Vector3(0,1,0).applyQuaternion(orientation),support=new THREE.Vector3(),limit=Math.sin(limits.wrist*Math.PI/180);
 for(let n=0;n<32;n++){
  let changed=false;support.set(...supportGrip).applyQuaternion(orientation);
  for(let i=0;i<2;i++){
   const hand=position.clone().add(i?support:new THREE.Vector3()),e=new THREE.Euler().setFromQuaternion(orientation),arm=swordArm(meleeJoint({position:hand.toArray(),rotation:[e.x,e.y,e.z],gripLimit:right.gripLimit},i?1:-1,poles[i],clavicles?.[i],false,guideElbow)),forearm=new THREE.Vector3(0,-1,0).applyQuaternion(arm.lower),dot=axis.dot(forearm);
   if(Math.abs(dot)>limit+1e-12){const next=axis.clone().addScaledVector(forearm,-dot).normalize().multiplyScalar(Math.sqrt(1-limit*limit)).addScaledVector(forearm,Math.sign(dot)*limit);orientation.premultiply(new THREE.Quaternion().setFromUnitVectors(axis,next));axis.copy(next);changed=true;}
  }
  support.set(...supportGrip).applyQuaternion(orientation);
  for(let i=0;i<2;i++){const centre=new THREE.Vector3(i?.24:-.24,.66,0).add(new THREE.Vector3(...(clavicles?.[i]||[0,0,0]))).sub(i?support:new THREE.Vector3()),offset=position.clone().sub(centre);if(offset.length()>limits.reach+1e-12){position.copy(centre).add(offset.setLength(limits.reach));changed=true;}}
  const front=limits.front-Math.min(0,support.z);if(position.z<front-1e-12){position.z=front;changed=true;}
  if(!changed)break;
 }
 const e=new THREE.Euler().setFromQuaternion(orientation);return {...right,position:position.toArray(),rotation:[e.x,e.y,e.z]};
}
export function meleePose({right=defaultHand(-1),left=defaultHand(1),body=[0,0,0],head=null,hipYaw=0,drop=0,shift=[0,0],feet=[[-.105,.035,.085],[.105,.035,-.015]],footYaw=[0,0],weight=0,poles=[[-.5,-.8,-.25],[.5,-.8,-.25]],clavicles=null,twoHand=false,supportGrip=null,supportRoll=0,shaftGrip=false,shaftLimits=null,guideElbow=false,hasShield=false}={}){
 if(shaftGrip&&shaftLimits)right=fitShaftGrip(right,supportGrip||[0,.09,0],poles,clavicles,shaftLimits,guideElbow);
 const joints={right:meleeJoint(right,-1,poles[0],clavicles?.[0],shaftGrip,guideElbow)};
 const primary={...swordArm(joints.right).pose,...(shaftGrip?{rotation:[...right.rotation]}:{})};
 if(twoHand){const orientation=quaternion(primary.rotation),support=new THREE.Vector3(...(supportGrip||[0,.09,0])).applyQuaternion(orientation).add(new THREE.Vector3(...primary.position)),e=new THREE.Euler().setFromQuaternion(orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),supportRoll)));left={position:support.toArray(),rotation:[e.x,e.y,e.z],gripLimit:right.gripLimit};}
 joints.left=meleeJoint(left,1,poles[1],clavicles?.[1],shaftGrip,guideElbow);
 return finish({melee:true,twoHand,hasShield,joints,body:[...body],head:head?[...head]:[-body[0]*.7,-body[1]*.85,-body[2]*.55],hipYaw,drop,shift:[...shift],feet:feet.map(v=>[...v]),footYaw:[...footYaw],weight,poles:poles.map(v=>[...v]),...(clavicles?{clavicles:clavicles.map(v=>[...v])}:{}),...(supportGrip?{supportGrip:[...supportGrip],supportRoll}:{}),...(shaftGrip?{shaftGrip:true}:{}),...(shaftLimits?{shaftLimits:{...shaftLimits}}:{}),shaft:twoHand?primary:null});
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
  if(a.supportGrip||b.supportGrip){frame.supportGrip=vector(a.supportGrip||[0,.09,0],b.supportGrip||[0,.09,0],t);frame.supportRoll=(a.supportRoll||0)+((b.supportRoll||0)-(a.supportRoll||0))*t;}
  const qa=quaternion(a.shaft.rotation),qb=quaternion(b.shaft.rotation),e=new THREE.Euler().setFromQuaternion(qa.slerp(qb,t));
  return meleePose({...frame,right:{position:vector(a.shaft.position,b.shaft.position,t),rotation:[e.x,e.y,e.z]},twoHand:true});
 }
 if(a.joints&&b.joints)frame.joints={right:blendJoint(a.joints.right,b.joints.right,t),left:blendJoint(a.joints.left,b.joints.left,t)};
 else frame.joints={right:meleeJoint({position:vector(a.right.position,b.right.position,t),rotation:new THREE.Euler().setFromQuaternion(quaternion(a.right.rotation).slerp(quaternion(b.right.rotation),t)).toArray().slice(0,3)},-1,frame.poles[0]),left:meleeJoint({position:vector(a.left.position,b.left.position,t),rotation:new THREE.Euler().setFromQuaternion(quaternion(a.left.rotation).slerp(quaternion(b.left.rotation),t)).toArray().slice(0,3)},1,frame.poles[1])};
 return finish(frame);
}
