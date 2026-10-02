import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {sampleMotion,stepPhase} from '../src/motion.js';
import {swordArm} from '../src/sword-motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

function rig(frame='knight'){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 return {ref,u:{config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true}};
}
function at(ref,u,combo,p,extra={}){u.attack={weapon:'sword',combo,elapsed:p,duration:1,...extra};ArenaRenderer.prototype.animateRobot.call({},ref,u,p);ref.root.updateMatrixWorld(true);}
test('ソードは肩・肘・前腕から手の位置を作り、関節の長さと中間キーの速度を保つ',()=>{
 const {ref,u}=rig();
 for(let combo=0;combo<4;combo++)for(let i=0;i<=240;i++){
  at(ref,u,combo,i/240);const f=sampleMotion('sword',u.attack);
  for(const [side,arm]of [['right',ref.arms[0]],['left',ref.arms[1]]]){
   const fk=swordArm(f.joints[side]);assert(arm.hand.position.distanceTo(fk.wrist)<1e-9);
   assert(Math.abs(arm.elbow.position.length()-.195)<1e-9);assert(Math.abs(arm.hand.position.distanceTo(arm.elbow.position)-.195)<1e-9);
   assert(arm.hand.quaternion.angleTo(fk.hand)<1e-7);
  }
 }
 const h=1e-5;
 for(let combo=0;combo<4;combo++)for(const key of [.16,.27,.40,.53]){
  const frames=[key-h,key,key+h].map(elapsed=>sampleMotion('sword',{combo,elapsed,duration:1})),v=frames.map(f=>new THREE.Vector3(...f.right.position)),before=v[1].clone().sub(v[0]).divideScalar(h),after=v[2].clone().sub(v[1]).divideScalar(h);
  assert(before.length()>.02,`${combo} ${key}: 中間ポーズで停止する`);assert(before.distanceTo(after)<.002,`${combo} ${key}: 速度が飛ぶ`);
 }
});
test('ソードの接地した足は実際の前進・骨盤回転中も同じ地面の位置に残る',()=>{
 for(const yaw of [0,.7,Math.PI/2])for(const tracking of [false,true])for(let combo=0;combo<4;combo++)for(const [legIndex,begin,end]of [[0,.09,.26],[1,.34,.53]]){
  const {ref,u}=rig();let anchor;
  for(let p=begin;p<=end+1e-9;p+=.005){const a={weapon:'sword',combo,elapsed:p,duration:1},travel=.24*stepPhase(a);u.yaw=yaw+(tracking?.13*Math.sin(p*4):0);u.x=Math.sin(yaw)*travel;u.z=Math.cos(yaw)*travel;at(ref,u,combo,p,{origin:[0,0,0],yaw});
   const foot=ref.feet[legIndex].foot.getWorldPosition(new THREE.Vector3());anchor??=foot.clone();assert(foot.distanceTo(anchor)<1e-7,`${combo} ${yaw} ${legIndex} ${p}: 接地した足が滑る`);
  }
 }
});
test('ソードは先行入力を押している間も関節動作を保ち、振り下ろしでは刃の面で叩かない',()=>{
 const {ref,u}=rig();at(ref,u,0,.40);const hand=ref.arms[0].hand.position.clone(),q=ref.arms[0].hand.quaternion.clone();u.charging=true;ArenaRenderer.prototype.animateRobot.call({},ref,u,.40);assert(ref.arms[0].hand.position.distanceTo(hand)<1e-9);assert(ref.arms[0].hand.quaternion.angleTo(q)<1e-7);u.charging=false;
 for(const p of [.30,.35,.40,.45]){
  at(ref,u,3,p-.001);const before=ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.57,0));at(ref,u,3,p+.001);const after=ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.57,0)),velocity=after.sub(before).normalize();at(ref,u,3,p);
  const rotation=ref.weaponAttachments[0].getWorldQuaternion(new THREE.Quaternion()),edge=new THREE.Vector3(1,0,0).applyQuaternion(rotation),flat=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  assert(Math.abs(velocity.dot(edge))>.80,'振る方向へ刃先を向ける');assert(Math.abs(velocity.dot(flat))<.15,'刃の平面が進行方向を向かない');
 }
});
test('通常ソードの刃の中心線は全5フレームで胴・頭・盾を突き抜けず、剣先が床を抜けない',()=>{
 for(const frame of ['knight','strider','brawler','wild','panzer']){
  const {ref,u}=rig(frame),meshes=[];
  ref.bodyPivot.children[0].traverse(m=>{if(!m.isMesh)return;for(let p=m;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(m);});
  const shield=ref.weaponAttachments.find(w=>w.name==='shield');if(shield)shield.traverse(m=>{if(m.isMesh)meshes.push(m);});
  for(let combo=0;combo<4;combo++)for(let i=0;i<=240;i++){
   at(ref,u,combo,i/240);const w=ref.weaponAttachments[0],a=w.localToWorld(new THREE.Vector3(0,.105,0)),b=w.localToWorld(new THREE.Vector3(0,.57,0)),dir=b.clone().sub(a),ray=new THREE.Raycaster(a,dir.clone().normalize(),0,dir.length());
   assert.equal(ray.intersectObjects(meshes,false).length,0,`${frame} ${combo} ${i}: 刃が自機を貫通`);assert(b.y>=.02,`${frame} ${combo} ${i}: 剣先が床を貫通`);
  }
 }
});
test('ソードのコンボ接続は肩・肘・手首・骨盤の全チャンネルを引き継ぐ',()=>{
 for(let combo=0;combo<4;combo++){
  const next=(combo+1)%4,from=sampleMotion('sword',{combo,elapsed:1,duration:1},{nextCombo:next}),to=sampleMotion('sword',{combo:next,elapsed:0,duration:1,blendFrom:from});
  for(const key of ['joints','right','left','body','hipYaw','drop','shift','footYaw','feet'])assert.deepEqual(to[key],from[key]);
 }
 // The final cut rotates the blade down; moving a vertical sword downwards
 // with the hand alone does not satisfy the authored overhead motion.
 const {ref,u}=rig();at(ref,u,3,.53);const w=ref.weaponAttachments[0],tip=w.localToWorld(new THREE.Vector3(0,.57,0)),hand=w.getWorldPosition(new THREE.Vector3());assert(tip.y<hand.y);assert(tip.z>hand.z+.4);
});
