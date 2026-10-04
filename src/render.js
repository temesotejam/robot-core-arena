import * as THREE from '../vendor/three.module.min.js';
import {FRAMES,WEAPONS} from './data.js';
import {KNOCKDOWN,nextCombo} from './combat.js';
import {sampleMotion,readyPose,motionRhythm,stepPhase} from './motion.js';
import {swordArm} from './sword-motion.js';
import {presentKnuckle} from './knuckle-motion.js';
import {sampleLocomotion} from './locomotion.js';
import {sampleLanding} from './landing-motion.js';
const mats=new Map(),boxes=new Map(),armorGeometries=new Map(),plateGeometries=new Map();
// Cached meshes share resources across robots. Release only scene-owned GPU
// resources, once each, when a weapon or a complete scene is replaced.
function releaseObject(root){
 const sharedGeometry=new Set([...boxes.values(),...armorGeometries.values(),...plateGeometries.values()]),sharedMaterial=new Set(mats.values()),geometry=new Set(),materials=new Set();
 root.traverse(o=>{if(o.geometry&&!sharedGeometry.has(o.geometry))geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(!sharedMaterial.has(m))materials.add(m);});
 for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
}
function material(color,emissive=false){const key=`${color}:${emissive}`;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,metalness:emissive?.15:.55,roughness:emissive?.25:.42,emissive:emissive?color:'#000000',emissiveIntensity:emissive?1.6:0}));return mats.get(key);}
function box(w,h,d,color,x=0,y=0,z=0){const key=`${w},${h},${d}`;if(!boxes.has(key))boxes.set(key,new THREE.BoxGeometry(w,h,d));const mesh=new THREE.Mesh(boxes.get(key),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
function profile(points,depth,bevel=0){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:depth-2*bevel,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,curveSegments:1});geometry.translate(0,0,-depth/2+bevel);return geometry;}
function plate(points,depth,color,x=0,y=0,z=0,bevel=0){
 const key=JSON.stringify([points,depth,bevel]);if(!plateGeometries.has(key))plateGeometries.set(key,profile(points,depth,bevel));
 const mesh=new THREE.Mesh(plateGeometries.get(key),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function armor(w,h,d,color,x=0,y=0,z=0){
 const key=`${w},${h},${d}`;if(!armorGeometries.has(key)){const bevel=Math.min(w,h,d)*.12,hw=w/2-bevel,hh=h/2-bevel,corner=Math.min(hw,hh)*.22,shape=new THREE.Shape();
  const points=[[-hw+corner,-hh],[hw-corner,-hh],[hw,-hh+corner],[hw,hh-corner],[hw-corner,hh],[-hw+corner,hh],[-hw,hh-corner],[-hw,-hh+corner]];points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,curveSegments:1});geometry.translate(0,0,-d/2+bevel);armorGeometries.set(key,geometry);
 }const mesh=new THREE.Mesh(armorGeometries.get(key),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function glow(w,h,d,color,x=0,y=0,z=0){const mesh=box(w,h,d,color,x,y,z);mesh.material=material(color,true);return mesh;}
function cylinder(radius,height,color,x=0,y=0,z=0,sides=12){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,sides),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;return mesh;}
function sphere(radius,color,x,y,z){const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,10,6),material(color));mesh.position.set(x,y,z);return mesh;}
function weaponModel(kind,team){const group=new THREE.Group(),w=WEAPONS[kind],metal='#b7c9d4',dark='#263746',accent=team?'#ffac72':'#77f6d6';group.name=`weapon:${kind}`;
 // Fixed edge orientation in the grip; normal cuts do not rotate the weapon
 // independently from its hand. The blade's local X axis is its cutting edge.
 if(kind==='sword')group.rotation.y=-Math.PI/2;
 // Model origin is the centre of the grip, shared with the hand socket.
 if(!w.ranged){if(kind!=='knuckle')group.add(box(.035,.16,.04,dark));if(kind==='knuckle'){group.add(armor(.138,.108,.15,dark,0,0,.055),glow(.11,.015,.12,accent,0,.054,.055));}
  else if(kind==='hammer'){group.add(box(.035,.5,.04,'#607482',0,.23,0),armor(.32,.15,.18,metal,0,.49,0),glow(.28,.02,.19,accent,0,.51,0));}
  else if(['lance','naginata','scythe'].includes(kind)){group.add(box(.028,.8,.028,'#607482',0,.3,0));if(kind==='lance'){const tip=new THREE.Mesh(new THREE.ConeGeometry(.055,.2,4),material(metal));tip.position.y=.8;group.add(tip);}else {const points=kind==='scythe'?[[-.025,.68],[.13,.77],[.30,.72],[.34,.55],[.20,.68],[.08,.69]]:[[-.025,.61],[-.02,.79],[.035,.9],[.11,.77],[.06,.65]];group.add(new THREE.Mesh(profile(points,.035),material(metal)),glow(.025,.16,.04,accent,0,.67,.022));}}
  else {const length=kind==='dagger'?.26:kind==='rapier'?.62:.47,width=kind==='rapier'?.026:.07,blade=new THREE.Mesh(profile([[-width/2,.10],[width/2,.10],[width/2,.10+length*.82],[0,.10+length],[-width/2,.10+length*.82]],.024),material(metal));blade.castShadow=true;group.add(blade,glow(.009,length*.75,.027,accent,-width/2+.012,.10+length*.43,0),armor(.14,.025,.07,dark,0,.09,0));}}
 else {const size=kind==='sniper'?.68:['bazooka','missile'].includes(kind)?.55:kind==='pistol'?.22:.39;group.add(armor(.09,.12,size,dark,0,.03,size/2-.06),box(.025,.15,.055,dark,0,-.08,0),glow(.018,.02,size*.65,accent,.05,.07,size*.33));
  if(!['bazooka','missile'].includes(kind)){const muzzle=cylinder(kind==='sniper'?.03:.034,.06,metal,0,.02,size-.02);muzzle.rotation.x=Math.PI/2;group.add(muzzle);if(['rifle','assault','sniper','heavyShotgun'].includes(kind))group.add(armor(.075,.10,.12,'#607482',0,.02,-.08));}
  if(kind==='sniper'){const barrel=cylinder(.025,.18,metal,0,.02,size);barrel.rotation.x=Math.PI/2;group.add(barrel);const scope=cylinder(.028,.15,dark,0,.12,.15);scope.rotation.x=Math.PI/2;group.add(scope,glow(.04,.025,.025,accent,0,.13,.24));}
  if(kind==='shotgun'||kind==='heavyShotgun')group.add(box(.085,.055,.17,metal,0,0,size));
  if(kind==='bazooka'){const tube=cylinder(.09,.58,dark,0,.03,.21);tube.rotation.x=Math.PI/2;group.add(tube,glow(.13,.02,.04,accent,0,.12,.38));}
  if(kind==='missile'){group.add(box(.22,.15,.28,metal,0,.08,.22));for(const x of [-.055,.055])for(const y of [.05,.12]){const tube=cylinder(.025,.12,dark,x,y,.4);tube.rotation.x=Math.PI/2;group.add(tube);}}
  if(kind==='machinegun'||kind==='assault')group.add(box(.07,.12,.1,metal,0,-.08,.08));
  for(const part of group.children)part.position.y+=.08;
  const muzzle=kind==='sniper'?size+.09:['shotgun','heavyShotgun'].includes(kind)?size+.09:kind==='bazooka'?.50:kind==='missile'?.46:size+.01,flash=new THREE.Mesh(new THREE.ConeGeometry(.055,.12,6),material(accent,true));flash.rotation.x=Math.PI/2;flash.position.set(0,.10,muzzle+.06);flash.visible=false;group.add(flash);group.userData.flash=flash;
 }
 if(w.ranged&&!w.shield&&!['dualGun'].includes(kind))group.userData.supportGrip=[.045,.065,.085];
 if(['hammer','naginata','scythe'].includes(kind))group.userData.supportGrip=[0,.09,0];
 if(!w.ranged){group.userData.trailTip=kind==='knuckle'?[0,0,.13]:kind==='dagger'?[0,.36,0]:kind==='hammer'?[0,.49,0]:['lance','naginata','scythe'].includes(kind)?[0,.80,0]:[0,kind==='rapier'?.72:.57,0];group.userData.trailBase=kind==='knuckle'?[0,0,.07]:[0,.10,0];}
 return group;
}
const ARM_LENGTH=.195,DOWN=new THREE.Vector3(0,-1,0);
function poseArm(arm,target,rotation){
 arm.position.set(arm.userData.side*.24,.66,0);arm.shoulder.rotation.set(0,0,0);
 const wrist=target.clone().sub(arm.position),distance=Math.min(wrist.length(),ARM_LENGTH*2-.001);wrist.setLength(distance);
 const direction=wrist.clone().normalize(),pole=new THREE.Vector3(arm.userData.side*.35,-.8,-.35);pole.addScaledVector(direction,-pole.dot(direction));if(pole.lengthSq()<1e-8)pole.set(arm.userData.side,0,0);pole.normalize();
 const elbow=wrist.clone().multiplyScalar(.5).addScaledVector(pole,Math.sqrt(ARM_LENGTH**2-(distance/2)**2));
 arm.upper.quaternion.setFromUnitVectors(DOWN,elbow.clone().normalize());arm.elbow.position.copy(elbow);
 arm.lower.position.copy(elbow);arm.lower.quaternion.setFromUnitVectors(DOWN,wrist.clone().sub(elbow).normalize());
 arm.hand.position.copy(wrist);arm.hand.rotation.copy(rotation);
}
function poseSwordArm(arm,joint){
 const f=swordArm(joint);arm.position.set(joint.side*.24+joint.clavicle[0],.66+joint.clavicle[1],joint.clavicle[2]);
 arm.upper.quaternion.copy(f.upper);arm.elbow.position.copy(f.elbow);arm.lower.position.copy(f.elbow);arm.lower.quaternion.copy(f.lower);arm.hand.position.copy(f.wrist);arm.hand.quaternion.copy(f.hand);
 // Floating shoulder armour follows the raised upper arm without rotating the
 // shoulder joint itself or pushing the elbow out to satisfy a wrist target.
 arm.shoulder.quaternion.identity().slerp(f.upper,.42);
}
function walkingJoint(joint,gait){
 if(!gait)return joint;
 // Keep the authored forearm/wrist grip and animate from the shoulder. Never
 // mutate the shared sword ready pose or a combat pose saved for blending.
 const upper=new THREE.Quaternion().setFromEuler(new THREE.Euler(...gait.rotation)).multiply(new THREE.Quaternion().fromArray(joint.upper));
 return {...joint,upper:upper.toArray(),bend:joint.bend+gait.bend,clavicle:joint.clavicle.map((v,i)=>v+gait.clavicle[i])};
}
function swordContacts(ref,u,motion,attack,feet,facing,transported){
 if(!u.grounded||!(motion.sword||motion.melee)||!motion.plantOrigin||u.guard||transported||ref.legFrame==='panzer'){
  delete ref.swordPlant;return;
 }
 const phase=Math.min(1,attack.elapsed/attack.duration),origin=motion.plantOrigin,
  signature=[attack.weapon,attack.combo||0,attack.charge||0,attack.duration,motion.plantYaw].join('/'),previous=ref.swordPlant;
 const reset=!previous||previous.signature!==signature||phase<previous.phase-1e-9||
  attack.id&&previous.id&&attack.id!==previous.id||
  origin.some((v,i)=>Math.abs(v-previous.origin[i])>1e-7)||
  Math.hypot(u.x-previous.root[0],u.y-previous.root[1],u.z-previous.root[2])>.65;
 const inherited=reset&&motion.melee&&attack.blendFrom&&previous&&previous.phase>.5&&phase<.3&&
  Math.hypot(u.x-previous.root[0],u.y-previous.root[1],u.z-previous.root[2])<.15;
 const state=reset?{signature,id:attack.id,origin:[...origin],feet:inherited?previous.feet.map(p=>p?.clone()||null):[null,null],swings:[null,null]}:previous,root=new THREE.Vector3(u.x,u.y,u.z),axis=new THREE.Vector3(0,1,0);
 // Collision-limited travel can stop and resume after the target is launched.
 // Estimate the goal only during the swing; keep the world landing thereafter.
 for(const [i,foot]of feet.entries()){
  if(motion.feet[i][1]>.035+1e-9){
   if(motion.melee){
    state.swings??=[null,null];const goal=foot.clone().applyAxisAngle(axis,facing).add(root),from=state.feet[i]||goal;
    state.swings[i]??=from.clone();const t=motion.footProgress?.[i]??1;
    goal.x=THREE.MathUtils.lerp(state.swings[i].x,goal.x,t);goal.z=THREE.MathUtils.lerp(state.swings[i].z,goal.z,t);
    foot.copy(goal).sub(root).applyAxisAngle(axis,-facing);
   }
   state.feet[i]=null;continue;
  }
  if(state.swings)state.swings[i]=null;
  state.feet[i]??=foot.clone().applyAxisAngle(axis,facing).add(root);
  foot.copy(state.feet[i]).sub(root).applyAxisAngle(axis,-facing);
 }
 state.phase=phase;state.root=root.toArray();ref.swordPlant=state;
}
// Compact torso over longer, shin-led legs. The arm rig and authored weapon
// trajectories retain their original dimensions; only the leg IK is rebased.
export const ROBOT_PROPORTIONS=Object.freeze({hipHeight:.42,thigh:.175,shin:.225});
const {thigh:THIGH,shin:SHIN}=ROBOT_PROPORTIONS;
function poseLeg(leg,target,kneePole=null){
 const ankle=target.clone().sub(leg.position),distance=Math.max(.005,Math.min(ankle.length(),THIGH+SHIN-.001));ankle.setLength(distance);
 const direction=ankle.clone().normalize(),pole=kneePole?new THREE.Vector3(...kneePole):new THREE.Vector3(0,0,1);pole.addScaledVector(direction,-pole.dot(direction));if(pole.lengthSq()<1e-8)pole.set(1,0,0);pole.normalize();
 const along=(THIGH*THIGH-SHIN*SHIN+distance*distance)/(2*distance),knee=direction.clone().multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,THIGH*THIGH-along*along)));
 leg.upper.quaternion.setFromUnitVectors(DOWN,knee.clone().normalize());leg.knee.position.copy(knee);leg.lower.position.copy(knee);leg.lower.quaternion.setFromUnitVectors(DOWN,ankle.clone().sub(knee).normalize());leg.foot.position.copy(ankle);leg.foot.rotation.set(0,0,0);
}
function supportWeapon(ref){
 const grip=ref.weaponAttachments[0].userData.supportGrip;if(!grip)return;
 const right=ref.arms[0],left=ref.arms[1],rotation=right.hand.rotation.clone();let support;
 for(let i=0;i<12;i++){support=new THREE.Vector3(...grip).applyEuler(rotation).add(right.hand.position).add(right.position);const reach=support.clone().sub(left.position),excess=reach.length()-.385;if(excess<=.0001)break;poseArm(right,right.hand.position.clone().add(right.position).addScaledVector(reach.normalize(),-excess),rotation);}
 support=new THREE.Vector3(...grip).applyEuler(rotation).add(right.hand.position).add(right.position);poseArm(left,support,rotation);
}
function recoveryPose(ref,u){
 const k=u.knockdown;if(!k||u.dead)return;
 const ease=(value,end)=>THREE.MathUtils.smoothstep(value,0,end),amount=k.phase==='air'?ease(k.elapsed,.22):k.phase==='down'?THREE.MathUtils.lerp(k.entryTilt??1,1,ease(k.elapsed,.12)):1-ease(k.elapsed,KNOCKDOWN.rise),tilt=amount*Math.PI/2;
 // Tip the whole machine around its pelvis, in the direction of the impact.
 // The grounded pose really lies down; the same pose rises before immunity ends.
 const axis=new THREE.Vector3(Math.cos(k.away),0,-Math.sin(k.away));ref.root.rotateOnWorldAxis(axis,tilt);
 const pivot=new THREE.Vector3(0,.42,0).applyQuaternion(ref.root.quaternion);ref.root.position.y+=.42-pivot.y;ref.root.position.x-=pivot.x;ref.root.position.z-=pivot.z;
 const rise=k.phase==='rise'?ease(k.elapsed,KNOCKDOWN.rise):0,brace=Math.sin(Math.PI*rise);
 ref.bodyPivot.rotation.set(brace*.08,0,0);ref.bodyPivot.position.y-=brace*.035;
 const supported=!!ref.weaponAttachments[0].userData.supportGrip;
 for(const [i,arm]of ref.arms.entries()){
  if(supported&&i===1)continue;const side=arm.userData.side,armed=i===0||['dualGun','dualSword','knuckle'].includes(ref.kind),target=new THREE.Vector3(side*(supported?.105:.27),.49-brace*.05,-.025-brace*.10),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(WEAPONS[ref.kind].ranged&&armed?-Math.PI/2:0,0,0));
  // Bring guns along the body as it falls, rather than planting the muzzle into the floor.
  const hand=arm.hand.position.clone().add(arm.position).lerp(target,amount),grip=arm.hand.quaternion.clone().slerp(rotation,amount);poseArm(arm,hand,new THREE.Euler().setFromQuaternion(grip));
 }
 supportWeapon(ref);
 for(const leg of ref.feet)if(leg.knee)poseLeg(leg,new THREE.Vector3(leg.userData.side*.105,.035+brace*.065,.045-brace*.035));
 ref.root.updateMatrixWorld(true);const bounds=new THREE.Box3(),part=new THREE.Box3(),trails=new Set((ref.weaponTrails||[]).map(t=>t.mesh));
 ref.root.traverse(o=>{if(!o.geometry||!o.visible||o===ref.ring||trails.has(o))return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);bounds.union(part);});
 const correction=u.y+.02-bounds.min.y;ref.root.position.y+=correction>0?correction:correction*Math.sin(tilt);ref.root.updateMatrixWorld(true);
 // Keep the team ring on the ground rather than rotating it with the body.
 const ground=u.grounded?u.y:Math.max(0,u.y-.1);ref.ring.position.copy(ref.root.worldToLocal(new THREE.Vector3(u.x,ground+.015,u.z)));ref.ring.quaternion.copy(ref.root.quaternion).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
 for(const trail of ref.weaponTrails||[])trail.samples=[];
}
// Both the hangar and battle use these poses; attachments never need to cancel a shoulder rotation.
function poseWeapons(ref,u=null,time=0,locomotion=null,landing=null){
 const w=WEAPONS[ref.kind],speed=u?Math.hypot(u.vx,u.vz):0,attack=u?.attack||(u?.motion?.weapon===w.id&&!w.ranged&&(!u.charging||u.motion.elapsed<u.motion.duration)?u.motion:null),dual=['dualSword','dualGun','knuckle'].includes(w.id);
 let motion=sampleMotion(w.id,attack,{nextCombo:u?.queuedAttack?nextCombo(u,u.queuedAttack.charge,w):null,charging:u?.charging?u.chargePose:null,hasShield:!!ref.hasShield,legFrame:ref.legFrame});
 if(w.id==='knuckle')motion=presentKnuckle(ref,motion,{time,mode:attack||(u?.charging?'hold':null),enabled:!!u&&!u.dead&&!(u.down>0||u.rise>0||u.knockdown||u.statusTime>0||u.stun>0||u.guardBreak>0)});
 else delete ref.knucklePresentation;
 const shot=u?.motion?.weapon===w.id&&w.ranged?u.motion:null,shotProgress=shot?THREE.MathUtils.clamp(shot.elapsed/shot.duration,0,1):0;
 const kick=kind=>({machinegun:.012,assault:.015,dualGun:.020,pistol:.028,shotgun:.035,rifle:.038,sniper:.050,heavyShotgun:.045,bazooka:.052,missile:.030})[kind]||.022;
 const pulse=p=>{if(p<=0||p>=1)return 0;const t=p<.24?p/.24:1-(p-.24)/.76;return t*t*(3-2*t);},recoil=shot?pulse(shotProgress)*kick(w.id):0;
 for(const weapon of ref.weaponAttachments)if(weapon.userData.flash)weapon.userData.flash.visible=!!shot&&shotProgress<.3&&!u.dead&&!u.guard;
 for(const [i,arm]of ref.arms.entries()){
  if(motion.joints&&(!u?.guard||w.id==='knuckle')&&(!u?.charging||attack||motion.name==='chargeHold')&&!u?.dead&&!(u?.down>0)){
   let joint=walkingJoint(motion.joints[i?'left':'right'],!attack&&!u?.charging&&!u?.guard?locomotion?.arms?.[i]:null);
   if(i===1&&ref.hasShield&&landing?.guard)joint=walkingJoint(joint,{rotation:[-.24*landing.guard,-.08*landing.guard,-.06*landing.guard],bend:.20*landing.guard,clavicle:[0,0,0]});
   poseSwordArm(arm,joint);continue;
  }
  const side=arm.userData.side,armed=i===0||dual,p=armed&&!w.ranged?(i?motion.left:motion.right):readyPose(w.id,side),target=new THREE.Vector3(...p.position),rotation=new THREE.Euler(...p.rotation);
  if(armed&&w.ranged){const handRecoil=w.id==='dualGun'&&i===1?pulse((shotProgress-.12)/.88)*kick(w.id):recoil;target.z-=handRecoil;target.y+=handRecoil*.22;rotation.x=-handRecoil*(['pistol','shotgun','dualGun'].includes(w.id)?3.2:1.4);}
  if(!attack&&!w.ranged&&locomotion&&!u?.charging&&!u?.guard){target.z+=(locomotion.armSwing||0)*(i?-1:1);target.y+=(locomotion.arms?.[i]?.clavicle[1]||0);}
  if(u?.charging&&!w.ranged&&!attack&&i===0){target.y+=.10;rotation.x-=.6*Math.min(1,u.charge/(w.charge||1));}
  if(i===1&&ref.hasShield)target.set(.28,.43,.14);
  if(u?.guard){if(i===1)target.set(.18,w.id==='knuckle'?.68:.54,.25);else if(!w.ranged){target.set(-.23,w.id==='knuckle'?.68:.51,.21);rotation.x=w.id==='knuckle'?0:.75;}}
  poseArm(arm,target,rotation);
 }
 // Keep both wrists within reach while following a two-handed weapon.
 if(!(motion.twoHand&&(attack||motion.name==='chargeHold')&&!u?.guard&&!u?.dead&&!(u?.down>0)))supportWeapon(ref);
 if(shot){motion.body[0]-=recoil*2;motion.drop=-recoil*.25;motion.shift[1]-=recoil*.6;}
 return motion;
}
function updateTrails(ref,u,time,motionName,strikingSide,strikingLimb){
 const attack=u.attack||u.motion,active=!u.dead&&u.down<=0&&!u.guard&&!!attack&&(!attack.weapon||attack.weapon===ref.kind);
 ref.root.updateMatrixWorld(true);
 for(const trail of ref.weaponTrails||[]){const p=attack?attack.elapsed/attack.duration:0,rhythm=motionRhythm(ref.kind,attack||{}),left=trail.weapon.parent===ref.arms[1].hand;
  if(strikingLimb==='leftFoot'){trail.samples=[];trail.mesh.geometry.setDrawRange(0,0);trail.mesh.visible=false;continue;}
  const striking=ref.kind==='knuckle'?left===(strikingSide?strikingSide==='left':['jabLeft','bodyLeft'].includes(motionName)):ref.kind==='dualSword'&&['rightCut','leftReturn','rightDiagonal','leftDiagonal'].includes(motionName)?left===['leftReturn','leftDiagonal'].includes(motionName):true;
  if(active&&striking&&p>=rhythm.windup&&p<=rhythm.contactEnd+.08&&trail.samples.at(-1)?.time!==time){const world=ref.kind==='sword'&&attack.charge>0&&!attack.skill,tip=trail.weapon.localToWorld(new THREE.Vector3(...trail.weapon.userData.trailTip)),base=trail.weapon.localToWorld(new THREE.Vector3(...trail.weapon.userData.trailBase));if(!world){ref.root.worldToLocal(tip);ref.root.worldToLocal(base);}trail.samples.push({tip,base,time,world});}
  trail.samples=trail.samples.filter(s=>time-s.time<.12).slice(-12);const vertices=trail.mesh.geometry.attributes.position.array;let offset=0;
  for(let i=1;i<trail.samples.length;i++){const a=trail.samples[i-1],b=trail.samples[i],point=(s,key)=>s.world?ref.root.worldToLocal(s[key].clone()):s[key],ab=point(a,'base'),at=point(a,'tip'),bb=point(b,'base'),bt=point(b,'tip');for(const v of [ab,at,bt,ab,bt,bb]){vertices[offset++]=v.x;vertices[offset++]=v.y;vertices[offset++]=v.z;}}
  trail.mesh.geometry.attributes.position.needsUpdate=true;trail.mesh.geometry.setDrawRange(0,offset/3);trail.mesh.visible=offset>0;
 }
}
export function createRobot(config,getItem,team=0){const root=new THREE.Group(),bodyPivot=new THREE.Group(),bodyRig=new THREE.Group();bodyPivot.position.y=.36;bodyRig.position.y=-.36;bodyPivot.add(bodyRig);root.add(bodyPivot);const refs={root,bodyPivot,arms:[],feet:[],phase:0};
 const item=p=>getItem(config.armor[p]),f=p=>FRAMES[item(p).frame],colors=p=>[f(p).color,f(p).accent],teamColor=team?'#ff9b75':'#62efd4';
 const [bodyColor,bodyAccent]=colors('body'),frame=item('body').frame,wide=frame==='panzer'?.202:frame==='strider'?.125:frame==='brawler'?.18:.15;
 // A short breastplate, an exposed waist and a higher pelvis separate the
 // armour masses instead of extending one broad block down to the thighs.
 bodyRig.add(plate([[-wide*.72,.087],[wide*.72,.087],[wide,.041],[wide*.84,-.043],[wide*.48,-.087],[-wide*.48,-.087],[-wide*.84,-.043],[-wide,.041]],.205,bodyColor,0,.633,0,.009),cylinder(.059,.072,'#273644',0,.489,0),armor(.105,.038,.12,bodyAccent,0,.531,.024));
 const chest=plate([[-wide*.90,.009],[-wide*.62,-.018],[0,-.043],[wide*.62,-.018],[wide*.90,.009],[wide*.77,-.037],[0,-.075],[-wide*.77,-.037]],.042,bodyAccent,0,.628,.113,.004);bodyRig.add(chest,cylinder(.034,.062,'#253b48',0,.756,0),armor(.13,.14,.075,'#344b5b',0,.636,-.132),glow(.023,.043,.012,teamColor,0,.650,.135));
 const pelvis=new THREE.Group();pelvis.name='pelvisArmour';pelvis.add(armor(.15,.066,.132,'#273644',0,.420,0),plate([[-.044,.031],[.044,.031],[.034,-.034],[0,-.057],[-.034,-.034]],.056,bodyAccent,0,.414,.077,.004));bodyRig.add(pelvis);
 for(const side of [-1,1]){
  const skirt=plate([[-.031,.035],[.035,.041],[.047,-.043],[.019,-.064],[-.035,-.048]],.067,bodyColor,side*.105,.397,.071,.005);skirt.rotation.z=side*.20;skirt.name='pelvisArmour';bodyRig.add(skirt);
  const breast=plate([[-.048,.037],[.040,.037],[.050,.005],[.033,-.023],[-.047,-.020]],.032,bodyColor,side*wide*.46,.666,.107,.006);bodyRig.add(breast);
  const nozzle=cylinder(.027,.065,'#253b48',side*.047,.592,-.136);nozzle.rotation.x=Math.PI/2;bodyRig.add(nozzle,glow(.023,.029,.012,bodyAccent,side*.047,.592,-.174));
  for(let j=0;j<2;j++)bodyRig.add(box(.032,.007,.012,'#142732',side*.084,.600-j*.017,.112));
  if(frame==='strider'){const fin=plate([[-.02,-.10],[.035,-.04],[.05,.16],[-.015,.065]],.055,bodyAccent,side*.15,.57,-.16);fin.rotation.z=-side*.30;bodyRig.add(fin);}
  if(frame==='wild'){const vane=plate([[-.035,-.07],[.035,-.07],[.02,.1],[-.01,.13]],.07,bodyAccent,side*.13,.55,-.17);vane.rotation.z=side*.35;bodyRig.add(vane);}
 }
 if(frame==='brawler')bodyRig.add(armor(.305,.048,.21,bodyAccent,0,.715,-.010));if(frame==='panzer')bodyRig.add(armor(.33,.057,.20,'#364451',0,.714,-.024));
 const headFrame=item('head').frame,[headColor,headAccent]=colors('head'),head=new THREE.Group();head.position.y=.825;const hw=headFrame==='panzer'?.112:headFrame==='brawler'?.107:.098;
 head.add(plate([[-hw*.65,.083],[hw*.65,.083],[hw,.042],[hw*.90,-.032],[hw*.43,-.075],[-hw*.43,-.075],[-hw*.90,-.032],[-hw,.042]],.147,headColor,0,.005,-.006,.009),plate([[-.077,.025],[.077,.025],[.052,-.040],[-.052,-.040]],.025,'#182731',0,-.007,.076));
 for(const side of [-1,1]){
  const eye=plate([[-.027,.007],[.026,.002],[.019,-.010],[-.019,-.008]].map(([x,y])=>[side*x,y]),.012,teamColor,side*.034,.003,.094);eye.material=material(teamColor,true);head.add(eye);
  head.add(plate([[-.015,.036],[.019,.026],[.026,-.036],[-.011,-.053]],.038,headColor,side*.067,-.008,.086,.003));
 }
 head.add(plate([[-.025,.022],[.025,.022],[.015,-.024],[0,-.037],[-.015,-.024]],.020,headAccent,0,-.037,.100,.003));
 if(headFrame==='knight'){const crest=plate([[-.044,-.042],[.023,-.037],[.014,.104],[-.016,.135],[-.040,.079]],.032,headAccent,0,.061,-.020,.003);crest.rotation.y=Math.PI/2;head.add(crest);}
 if(headFrame==='strider')for(const side of [-1,1]){const fin=plate([[-.015,-.04],[.012,-.04],[.025,.12],[-.01,.055]],.035,headAccent,side*.095,.065,-.035);fin.rotation.z=-side*.35;head.add(fin);}
 if(headFrame==='wild')for(const side of [-1,1]){const ear=plate([[-.03,-.04],[.03,-.04],[.026,.095],[0,.145]],.05,headAccent,side*.075,.075,-.035);ear.rotation.z=-side*.3;head.add(ear);}
 if(headFrame==='brawler')head.add(armor(.245,.035,.195,headAccent,0,.06,.002));if(headFrame==='panzer')head.add(armor(.20,.045,.17,'#364451',0,.10,0));bodyRig.add(head);refs.head=head;
 for(const [n,p]of ['rightArm','leftArm'].entries()){const side=n===0?-1:1,[color,accent]=colors(p),frame=item(p).frame,arm=new THREE.Group();arm.position.set(side*.24,.66,0);arm.userData.side=side;
  const sw=frame==='brawler'?.092:frame==='panzer'?.088:frame==='strider'?.062:.079;arm.shoulder=new THREE.Group();arm.shoulder.add(plate([[-sw*.80,.041],[-sw*.40,.078],[sw*.65,.059],[sw*1.08,.016],[sw*.80,-.052],[-sw*.69,-.030]].map(([x,y])=>[side*x,y]),.144,color,0,.005,0,.008),plate([[-sw*.48,.070],[sw*.61,.052],[sw*.85,.031],[sw*.52,.040],[-sw*.45,.057]].map(([x,y])=>[side*x,y]),.155,accent,0,.005,0,.002));arm.add(arm.shoulder);
  arm.upper=new THREE.Group();arm.upper.add(box(.052,ARM_LENGTH,.055,'#263541',0,-ARM_LENGTH/2,0),plate([[-.038,.046],[.038,.046],[.033,-.045],[-.033,-.045]],.084,color,0,-.099,0,.005));if(frame==='strider')arm.upper.add(glow(.012,.065,.012,accent,side*.043,-.105,.048));
  arm.elbow=sphere(.034,'#263541',0,0,0);arm.lower=new THREE.Group();const fw=frame==='brawler'?.069:frame==='panzer'?.066:frame==='strider'?.045:.057;arm.lower.add(plate([[-fw*.64,.063],[fw*.64,.063],[fw,.025],[fw*.92,-.065],[fw*.59,-.085],[-fw*.59,-.085],[-fw*.92,-.065],[-fw,.025]],.108,color,0,-.101,0,.007),plate([[-.017,.039],[.017,.039],[.012,-.026],[-.012,-.026]],.013,accent,0,-.105,.062,.002));if(frame==='wild')arm.lower.add(box(.035,.08,.045,accent,side*.068,-.1,0));
  arm.hand=new THREE.Group();arm.hand.name=n===0?'rightHand':'leftHand';arm.hand.add(box(.07,.065,.07,'#1f303d'));arm.add(arm.upper,arm.elbow,arm.lower,arm.hand);bodyRig.add(arm);refs.arms.push(arm);}
 const [legColor,legAccent]=colors('legs'),legFrame=item('legs').frame;const legs=new THREE.Group();root.add(legs);refs.legGroup=legs;refs.legFrame=legFrame;
 for(const mesh of [...bodyRig.children])if(mesh.name==='pelvisArmour')legs.add(mesh);
 for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.105,ROBOT_PROPORTIONS.hipHeight,0);leg.userData.side=side;
  if(legFrame==='panzer'){leg.position.set(side*.19,.13,0);leg.add(armor(.16,.18,.4,'#263442'),armor(.14,.05,.32,legColor,0,.1,0));for(let j=0;j<4;j++){const wheel=cylinder(.065,.17,'#596c74',0,-.015,-.13+j*.09);wheel.rotation.z=Math.PI/2;leg.add(wheel);}leg.add(glow(.035,.01,.28,legAccent,side*.085,.035,0));}
  else {
   const tw=legFrame==='brawler'?.056:legFrame==='wild'?.052:legFrame==='strider'?.036:.043;
   leg.upper=new THREE.Group();leg.upper.add(box(.047,THIGH,.055,'#263442',0,-THIGH/2,0),plate([[-tw,.043],[tw,.043],[tw*.80,-.052],[-tw*.80,-.052]],.095,legColor,0,-.083,0,.006));
   leg.knee=new THREE.Group();leg.knee.add(sphere(.037,'#263442',0,0,0),plate([[-tw*1.28,.032],[tw*1.28,.032],[tw*1.16,-.018],[0,-.040],[-tw*1.16,-.018]],.063,legAccent,0,.001,.047,.006));
   leg.lower=new THREE.Group();const shin=legFrame==='wild'?.081:legFrame==='brawler'?.076:legFrame==='strider'?.053:.067;leg.lower.add(box(.047,SHIN,.055,'#263442',0,-SHIN/2,0),plate([[-shin*.75,.086],[shin*.75,.086],[shin,.033],[shin*.81,-.070],[shin*.56,-.093],[-shin*.56,-.093],[-shin*.81,-.070],[-shin,.033]],.130,legColor,0,-.129,0,.008),plate([[-.019,.059],[.019,.059],[.011,-.054],[-.011,-.054]],.016,legAccent,0,-.124,.074,.003));
   const boot=legFrame==='wild'?.168:legFrame==='brawler'?.164:legFrame==='strider'?.134:.148;
   leg.foot=new THREE.Group();leg.foot.add(armor(boot,.064,legFrame==='strider'?.235:.220,'#263442',0,0,.045),plate([[-boot*.38,.034],[boot*.38,.034],[boot*.48,.001],[boot*.47,-.013],[-boot*.47,-.013],[-boot*.48,.001]],.145,legColor,0,.024,.055,.004),armor(boot*.78,.016,.045,legAccent,0,.027,.110));
   leg.add(leg.upper,leg.knee,leg.lower,leg.foot);
   if(legFrame==='strider'){const fin=plate([[-.012,-.09],[.015,-.09],[.025,.14],[-.01,.04]],.035,legAccent,side*.065,-.075,-.045);leg.lower.add(fin);}
  }legs.add(leg);refs.feet.push(leg);
 }
 if(legFrame==='wild'){const tail=box(.045,.045,.3,legAccent,0,.2,-.24);tail.rotation.x=-.25;legs.add(tail);}const ring=new THREE.Mesh(new THREE.RingGeometry(.35,.38,32),new THREE.MeshBasicMaterial({color:teamColor,transparent:true,opacity:.65,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.015;root.add(ring);refs.ring=ring;
 refs.addWeapons=(set)=>{const kind=getItem(set.item).kind,wm=weaponModel(kind,team);refs.arms[0].hand.add(wm);refs.weaponAttachments=[wm];refs.hasShield=false;
  if(['dualSword','dualGun','knuckle'].includes(kind)){const left=weaponModel(kind,team);refs.arms[1].hand.add(left);refs.weaponAttachments.push(left);}
  else if(set.shield&&WEAPONS[kind].shield){const shield=new THREE.Group();shield.name='shield';shield.add(armor(.19,.3,.035,bodyColor,0,.055,.06),glow(.025,.22,.04,teamColor,0,.055,.085));refs.arms[1].hand.add(shield);refs.weaponAttachments.push(shield);refs.hasShield=true;}
  refs.weaponTrails=refs.weaponAttachments.filter(a=>a.userData.trailTip).map(weapon=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*6*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:teamColor,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.frustumCulled=false;mesh.visible=false;root.add(mesh);return {weapon,mesh,samples:[]};});refs.kind=kind;poseWeapons(refs);};
 refs.changeWeapons=set=>{for(const a of refs.weaponAttachments||[]){releaseObject(a);a.removeFromParent();}for(const trail of refs.weaponTrails||[]){releaseObject(trail.mesh);root.remove(trail.mesh);}refs.addWeapons(set);};refs.changeWeapons(config.sets[0]);for(const leg of refs.feet)if(leg.knee)poseLeg(leg,new THREE.Vector3(leg.userData.side*.105,.035,.045));return refs;
}
export class ArenaRenderer{
 constructor(canvas){this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0a111b');this.scene.fog=new THREE.Fog('#0a111b',25,65);this.camera=new THREE.PerspectiveCamera(45,1,.04,120);this.world=new THREE.Group();this.scene.add(this.world);this.effects=new THREE.Group();this.scene.add(this.effects);this.robots=new Map();this.bullets=new Map();this.fx=[];this.cameraYaw=Math.PI/2;this.cameraPitch=.28;this.manualYaw=0;this.hangarAngle=.3;this.previewSignature='';this.mode='hangar';this.raycaster=new THREE.Raycaster();this.colliders=[];this.scene.add(new THREE.HemisphereLight('#b4dee9','#142039',2.0));const keyLight=new THREE.DirectionalLight('#ecf9ff',3.1);keyLight.position.set(9,14,8);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.camera.left=-24;keyLight.shadow.camera.right=24;keyLight.shadow.camera.top=24;keyLight.shadow.camera.bottom=-24;keyLight.shadow.bias=-.001;this.scene.add(keyLight);this.light=keyLight;const rim=new THREE.DirectionalLight('#62dacc',2);rim.position.set(-7,6,-10);this.scene.add(rim);this.resize();window.addEventListener('resize',()=>this.resize());}
 resize(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 quality(level){this.renderer.shadowMap.enabled=level!=='low';this.renderer.setPixelRatio(level==='low'?1:Math.min(devicePixelRatio,1.75));}
 clear(){releaseObject(this.world);releaseObject(this.effects);this.world.clear();this.effects.clear();this.robots.clear();this.bullets.clear();this.fx=[];this.colliders=[];this.preview=null;}
 floor(width,depth){const floor=box(width,.08,depth,'#15212c',0,-.07,0);floor.receiveShadow=true;this.world.add(floor);const vertices=[];for(let x=-width/2;x<=width/2;x+=1)vertices.push(x,.002,-depth/2,x,.002,depth/2);for(let z=-depth/2;z<=depth/2;z+=1)vertices.push(-width/2,.002,z,width/2,.002,z);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));this.world.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#263947',transparent:true,opacity:.55})));for(const side of [-1,1]){this.world.add(glow(width,.012,.04,side===1?'#5ae8c8':'#ffad79',0,.025,side*depth/2));this.world.add(glow(.04,.012,depth,'#4a8492',side*width/2,.025,0));}}
 hangar(config,getItem){const signature=JSON.stringify(config);if(this.mode==='hangar'&&this.previewSignature===signature)return;this.mode='hangar';this.previewSignature=signature;this.clear();this.floor(12,12);const pedestal=cylinder(.85,.1,'#243c48',0,-.01,0,64);pedestal.receiveShadow=true;this.world.add(pedestal);const ring=new THREE.Mesh(new THREE.TorusGeometry(.81,.012,8,64),material('#62e7ce',true));ring.rotation.x=Math.PI/2;ring.position.y=.045;this.world.add(ring);for(const side of [-1,1])for(let i=0;i<5;i++){this.world.add(box(.35,3,.35,'#182632',side*4,1.5,-3+i*1.5),glow(.025,1.5,.03,'#468a9c',side*3.82,1.5,-3+i*1.5));}this.preview=createRobot(config,getItem);this.preview.root.position.y=.06;this.world.add(this.preview.root);this.camera.position.set(-.5,1.3,3.4);this.camera.lookAt(-.5,.5,0);}
 startBattle(b){this.mode='battle';this.clear();this.floor(b.stage.width,b.stage.depth);for(const o of b.stage.obstacles){const mesh=box(o.w,o.h,o.d,'#35464f',o.x,o.h/2,o.z);this.world.add(mesh);this.colliders.push(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:'#607f88'}));edges.position.copy(mesh.position);this.world.add(edges);this.world.add(glow(o.w*.7,.025,.025,'#79b3b7',o.x,o.h-.12,o.z+o.d/2+.015));this.world.add(box(o.w,.09,o.d,'#1c2b36',o.x,.06,o.z));}
  for(const r of b.stage.ramps){const x0=r.x-r.w/2,x1=r.x+r.w/2,z0=r.z-r.d/2,z1=r.z+r.d/2,h0=r.direction===1?0:r.h,h1=r.direction===1?r.h:0;const vertices=[x0,h0,z0,x1,h0,z0,x1,h1,z1,x0,h0,z0,x1,h1,z1,x0,h1,z1,x0,0,z0,x0,h1,z1,x0,0,z1,x1,0,z0,x1,0,z1,x1,h1,z1];const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mat=new THREE.MeshStandardMaterial({color:'#405660',metalness:.35,roughness:.65,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;this.world.add(mesh);this.colliders.push(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:'#7399a3'}));this.world.add(edges);}
  for(const u of b.entities){const model=createRobot(u.config,b.getItem,u.team);model.active=0;this.world.add(model.root);this.robots.set(u.id,model);}this.cameraYaw=b.human.yaw;this.manualYaw=0;this.cameraPitch=.28;this.camera.position.set(b.human.x-Math.sin(this.cameraYaw)*5,3,b.human.z-Math.cos(this.cameraYaw)*5);this.lastObserved=null;}
 look(dx,dy){if(this.mode==='hangar')this.hangarAngle+=dx*.005;else {this.manualYaw-=dx*.003;this.cameraYaw-=dx*.003;this.cameraPitch=THREE.MathUtils.clamp(this.cameraPitch+dy*.002,-.05,.85);}}
 resetCamera(b){this.manualYaw=0;this.cameraYaw=b.observed.yaw;this.cameraPitch=.28;}
 movement(x,z){const yaw=this.cameraYaw;return {x:Math.sin(yaw)*z-Math.cos(yaw)*x,z:Math.cos(yaw)*z+Math.sin(yaw)*x};}
 project(x,y,z){const v=new THREE.Vector3(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*window.innerWidth,y:(-.5*v.y+.5)*window.innerHeight,visible:v.z<1&&v.z>-1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1};}
 orderedTargets(b){return b.enemiesOf(b.human).sort((a,c)=>{const p=this.project(a.x,a.y+.5,a.z),q=this.project(c.x,c.y+.5,c.z);return Math.abs(p.x-window.innerWidth/2)-Math.abs(q.x-window.innerWidth/2)||Math.hypot(a.x-b.human.x,a.z-b.human.z)-Math.hypot(c.x-b.human.x,c.z-b.human.z);});}
 screenTargets(b){return b.enemiesOf(b.human).sort((a,c)=>this.project(a.x,a.y+.5,a.z).x-this.project(c.x,c.y+.5,c.z).x);}
 animateRobot(ref,u,time,groundAt=this.groundAt){
  ref.root.position.set(u.x,u.y,u.z);ref.root.rotation.set(0,u.yaw,0);ref.root.visible=true;ref.ring.visible=!u.dead;ref.ring.position.set(0,.015,0);ref.ring.rotation.set(-Math.PI/2,0,0);ref.root.scale.setScalar(u.dead?.65:1);
  if(ref.active!==u.active){ref.active=u.active;ref.changeWeapons(u.config.sets[u.active]);}
  const landing=sampleLanding(ref,u,time),locomotion=sampleLocomotion(ref,u,time,{groundAt}),motion=poseWeapons(ref,u,time,locomotion,landing),canPose=!u.dead&&!(u.down>0||u.rise>0||u.knockdown),attack=u.attack||u.motion;
  // The visible cutting plane follows the same committed yaw as the hit arc.
  // Turn back toward a moving lock target smoothly during recovery.
  let facing=u.yaw;if(canPose&&(motion.sword||motion.melee)&&motion.plantYaw!==undefined){const p=attack.elapsed/attack.duration,t=THREE.MathUtils.smoothstep(p,motion.melee?motionRhythm(ref.kind,attack).contactEnd:motion.spinYaw!==undefined?.78:.53,1);facing=motion.plantYaw+Math.atan2(Math.sin(u.yaw-motion.plantYaw),Math.cos(u.yaw-motion.plantYaw))*t;}facing+=motion.spinYaw||0;ref.root.rotation.y=facing;
  const reaction=u.knockdown?null:u.hitReaction,reactionWeight=reaction?Math.sin(Math.PI*Math.min(1,reaction.elapsed/reaction.duration)):0,relative=reaction?(reaction.yaw-facing):0,approach=attack?.approach,approachWeight=canPose&&approach?THREE.MathUtils.smoothstep(approach.elapsed,0,.025)*(1-THREE.MathUtils.smoothstep(approach.elapsed,approach.duration-.03,approach.duration))*Math.min(1,approach.travel/.1):0;
  ref.bodyPivot.rotation.set(u.dead?Math.PI/3:u.knockdown?0:u.down>0?.9:motion.body[0]+(locomotion?.body[0]??(u.dashTime>0&&!motion.melee?.13:0))+(landing?.body[0]||0)+approachWeight*.08+Math.cos(relative)*(reaction?.strength||0)*reactionWeight,canPose?motion.body[1]+(locomotion?.body[1]||0):0,u.dead?.8:u.status==='stun'?Math.sin(time*30)*.03:canPose?motion.body[2]+(locomotion?.body[2]||0)+(landing?.body[2]||0)-Math.sin(relative)*(reaction?.strength||0)*reactionWeight:0);
  const drop=canPose?motion.drop+(locomotion?.drop||0)+(landing?.drop||0):0,shift=canPose?motion.shift.map((v,i)=>v+(locomotion?.shift[i]||0)):[0,0],tracks=(motion.sword||motion.melee)&&ref.legFrame==='panzer';ref.bodyPivot.position.set(shift[0],.36+drop,shift[1]);ref.legGroup.position.set(tracks?0:shift[0]*.5,tracks?0:drop,tracks?0:shift[1]*.6);const hipYaw=canPose&&ref.legFrame!=='panzer'?(locomotion?.hipYaw??motion.hipYaw):0;ref.legGroup.rotation.y=hipYaw;
  const footTargets=ref.feet.map((leg,i)=>{
   const foot=new THREE.Vector3(...motion.feet[i]);
   if(canPose&&u.grounded&&motion.plantOrigin&&!u.guard){
    const travel=new THREE.Vector3(u.x-motion.plantOrigin[0],0,u.z-motion.plantOrigin[2]).applyAxisAngle(new THREE.Vector3(0,1,0),-(motion.plantYaw??facing));
    const a=u.attack||u.motion,r=motionRhythm(a.weapon||ref.kind,a),p=Math.min(1,a.elapsed/a.duration),t=Math.max(0,Math.min(1,(p-r.windup*.5)/(r.contactEnd-r.windup*.5))),phase=motion.melee||a.weapon==='sword'&&a.charge>0&&!a.skill?stepPhase(a):t*t*(3-2*t),distance=Math.min(r.advance,Math.max(0,travel.z)/Math.max(.001,phase));
    foot.z+=distance*motion.footStride[i];
    // Carry sideways/backward collision corrections without amplifying them
    // through the phase used to predict the authored forward step.
    if(motion.melee){foot.x+=travel.x*motion.footStride[i];foot.z+=Math.min(0,travel.z)*motion.footStride[i];}
    foot.sub(travel).applyAxisAngle(new THREE.Vector3(0,1,0),(motion.plantYaw??facing)-facing);
   }
   if(approachWeight>0&&u.grounded){const phase=Math.sin(approach.elapsed/approach.duration*Math.PI*2+(i?Math.PI:0));foot.lerp(new THREE.Vector3(leg.userData.side*.105,.035+Math.max(0,phase)*.065,phase*.13),approachWeight);}
   if(!canPose)foot.set(leg.userData.side*.105,.035,.045);
   else if(!u.grounded){foot.y+=.075;foot.z-=.055;}
   else if(locomotion?.feet)foot.set(...locomotion.feet[i]);
   else if(groundAt&&ref.locomotion.mode==='idle'&&!ref.locomotion.started){const ground=foot.clone().applyAxisAngle(new THREE.Vector3(0,1,0),facing);foot.y=groundAt(u.x+ground.x,u.z+ground.z)+.035-u.y;}
   return foot;
  });
  if(canPose)swordContacts(ref,u,motion,attack,footTargets,facing,approach?.active||approachWeight>0||motion.melee&&u.dashTime>0&&(attack?.elapsed??1)>1e-9);
  else delete ref.swordPlant;
  if(canPose&&u.grounded&&(motion.sword||motion.melee||locomotion||groundAt&&ref.locomotion.mode==='idle')&&ref.legFrame!=='panzer'){
   // Preserve authored ground contacts: lower the pelvis a little when a raised
   // chest would otherwise exceed the leg's reach and pull a planted foot up.
   let settle=0;for(const [i,leg]of ref.feet.entries()){
    const ankle=footTargets[i].clone().sub(ref.legGroup.position).applyAxisAngle(new THREE.Vector3(0,1,0),-hipYaw).sub(leg.position),horizontal=ankle.x*ankle.x+ankle.z*ankle.z,vertical=Math.sqrt(Math.max(0,(THIGH+SHIN-.002)**2-horizontal));
    settle=Math.max(settle,-ankle.y-vertical);
   }settle=Math.min(locomotion?.15:.10,settle);ref.legGroup.position.y-=settle;ref.bodyPivot.position.y-=settle;
  }
  for(const [i,leg]of ref.feet.entries())if(leg.knee){const foot=footTargets[i].clone().sub(ref.legGroup.position).applyAxisAngle(new THREE.Vector3(0,1,0),-hipYaw),pole=motion.kneePoles?.[i]?new THREE.Vector3(...motion.kneePoles[i]).applyAxisAngle(new THREE.Vector3(0,1,0),-hipYaw).toArray():null;poseLeg(leg,foot,pole);leg.foot.rotation.set(locomotion?.pitch[i]??motion.footPitch?.[i]??0,(locomotion?.footYaw[i]??motion.footYaw[i]??0)-hipYaw+(canPose&&u.grounded&&motion.plantOrigin&&!u.guard?(motion.plantYaw??facing)-facing:0),locomotion?.roll[i]??motion.footRoll?.[i]??0);}
  const head=motion.head||[-motion.body[0]*(motion.sword?.65:.20),-motion.body[1]*(motion.sword?.75:.28),0];
  ref.head.rotation.set(canPose?head[0]-(locomotion?.body[0]||0)*.65+(landing?.head[0]||0):0,canPose?head[1]-(locomotion?.body[1]||0)*.9:0,canPose?head[2]-(locomotion?.body[2]||0)*.7+(landing?.head[2]||0):0);recoveryPose(ref,u);ref.ring.material.opacity=u.buffTime>0?.85:.45;updateTrails(ref,u,time,motion.name,motion.strikingSide,motion.strikingLimb);
  // Start the first step from the weapon's actual idle stance, rather than
  // snapping its support foot into the locomotion module's neutral stance.
  if(ref.locomotion.mode==='idle'&&!ref.locomotion.started)for(const [i,leg]of ref.feet.entries())if(leg.foot){const f=ref.locomotion.feet[i],direction=new THREE.Vector3(0,0,1).applyQuaternion(leg.foot.getWorldQuaternion(new THREE.Quaternion()));f.world=leg.foot.getWorldPosition(new THREE.Vector3()).toArray();f.from=[...f.world];f.yaw=Math.atan2(direction.x,direction.z);f.fromYaw=f.yaw;}
 }

 event(e){if(!['hit','explosion','dash','buff','kill','spark','special','jump'].includes(e.type))return;const unit=this.robots.get(e.unit);const pos=e.x!==undefined?new THREE.Vector3(e.x,e.y||.05,e.z):unit?unit.root.position.clone():new THREE.Vector3();const color=e.type==='hit'?(e.crit?'#ffd48b':'#96ffe4'):e.type==='explosion'?'#ffae6f':'#67efdb';const radius=e.radius|| (e.type==='special'?.9:e.type==='kill'?.6:.2);const mesh=new THREE.Mesh(new THREE.RingGeometry(radius*.6,radius,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide}));mesh.position.copy(pos);if(e.type!=='hit')mesh.rotation.x=-Math.PI/2;else mesh.quaternion.copy(this.camera.quaternion);this.effects.add(mesh);this.fx.push({mesh,age:0,duration:e.type==='explosion'?.55:.3,radius});}
 render(b,dt,time){if(this.mode==='hangar'){this.hangarAngle+=dt*.13;if(this.preview){this.preview.root.rotation.y=this.hangarAngle;this.preview.bodyPivot.position.y=.36+Math.sin(time*1.4)*.005;}this.camera.position.lerp(new THREE.Vector3(-.48,1.18,3.1),.05);this.camera.lookAt(-.48,.52,0);}
  else if(b){for(const u of b.entities)this.animateRobot(this.robots.get(u.id),u,b.time,(x,z)=>b.groundAt(x,z));const observed=b.observed;if(observed){const target=b.targetOf(observed),focus=new THREE.Vector3(observed.x,observed.y+.65,observed.z);let dist=5;if(target){const wanted=Math.atan2(target.x-observed.x,target.z-observed.z)+this.manualYaw;this.cameraYaw+=Math.atan2(Math.sin(wanted-this.cameraYaw),Math.cos(wanted-this.cameraYaw))*Math.min(1,dt*6);const separation=Math.hypot(target.x-observed.x,target.z-observed.z),lead=Math.min(.3,6/Math.max(separation,.001));focus.x=observed.x+(target.x-observed.x)*lead;focus.z=observed.z+(target.z-observed.z)*lead;focus.y=Math.max(observed.y,target.y)*.6+.65;dist=THREE.MathUtils.clamp(Math.hypot(target.x-observed.x,target.z-observed.z)*.6+4,5,17);}const desired=new THREE.Vector3(focus.x-Math.sin(this.cameraYaw)*dist,focus.y+dist*(.28+this.cameraPitch),focus.z-Math.cos(this.cameraYaw)*dist);const anchor=new THREE.Vector3(observed.x,observed.y+.65,observed.z),dir=desired.clone().sub(anchor).normalize();this.raycaster.set(anchor,dir);this.raycaster.far=desired.distanceTo(anchor);const hit=this.raycaster.intersectObjects(this.colliders,false)[0];if(hit){desired.copy(anchor).addScaledVector(dir,Math.min(hit.distance*.9,Math.max(.01,hit.distance-.22)));const lead=THREE.MathUtils.clamp(desired.distanceTo(anchor)/Math.max(dist,1),0,1);focus.lerp(anchor,1-lead);}this.camera.position.lerp(desired,1-Math.exp(-dt*7));this.camera.lookAt(focus);}
   const live=new Set();for(const p of b.projectiles){live.add(p.id);let mesh=this.bullets.get(p.id);if(!mesh){const color=p.kind==='missile'||p.kind==='bazooka'?'#ffb979':p.packet.normal?'#92ffdd':'#e7caff';mesh=glow(p.kind==='missile'?.07:.025,p.kind==='missile'?.07:.025,p.kind==='missile'?.18:.16,color);this.world.add(mesh);this.bullets.set(p.id,mesh);}mesh.position.set(p.x,p.y,p.z);mesh.lookAt(p.x+p.vx,p.y+p.vy,p.z+p.vz);}for(const [id,mesh]of this.bullets)if(!live.has(id)){this.world.remove(mesh);this.bullets.delete(id);}}
  for(const f of this.fx){f.age+=dt;const t=f.age/f.duration;f.mesh.material.opacity=Math.max(0,.85*(1-t));f.mesh.scale.setScalar(1+t*1.4);}this.fx=this.fx.filter(f=>{if(f.age<f.duration)return true;this.effects.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();return false;});this.renderer.render(this.scene,this.camera);
 }
}
