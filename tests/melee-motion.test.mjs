import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {sampleMotion,motionRhythm,stepPhase} from '../src/motion.js';
import {swordArm,swordMotion,swordChargeHold} from '../src/sword-motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig,cost} from '../src/customize.js';
import {CATALOG,PARTS,WEAPONS} from '../src/data.js';

const kinds=['rapier','dualSword','lance','naginata','knuckle','dagger','hammer','scythe'];
const frames=['knight','strider','wild','brawler','panzer'];
const channels=['joints','right','left','body','head','hipYaw','drop','shift','feet','footYaw'];
const nearDistance=kind=>['knuckle','dagger'].includes(kind)?.65:.9;
function fixture(kind,frame='knight',shield=WEAPONS[kind].shield){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 config.sets[0]={item:`weapon:${kind}`,shield:shield?'shield:basic':null,separate:false};
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const u={config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true};
 return {config,ref,u};
}
function draw(ref,u,time=0){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}
function feet(ref){return ref.feet.map(leg=>(leg.foot||leg).getWorldPosition(new THREE.Vector3()));}
function placeAttack(u,kind,combo,p,yaw=0,extra={}){
 u.attack={id:`${kind}/${combo}`,weapon:kind,combo,elapsed:p,duration:1,normal:true,origin:[0,0,0],yaw,...extra};
 const travel=motionRhythm(kind,u.attack).advance*stepPhase(u.attack);
 u.x=Math.sin(yaw)*travel;u.z=Math.cos(yaw)*travel;u.yaw=yaw+.13*Math.sin(p*4);
}
function damageMeshes(ref){
 // Inspect the meshes displayed by the game: blade, spear tip, hammer head,
 // or the striking knuckle armour. Handles and decorative glow cannot count.
 return ref.weaponAttachments.filter(w=>w.name!=='shield').flatMap(w=>w.children.filter(m=>m.isMesh&&
  (ref.kind==='knuckle'?m===w.children[0]:m.material.color.getHexString()==='b7c9d4')));
}
function targetBox(distance){
 // Use the same torso/head height as the established sword contact regression,
 // expressed in the committed facing frame, with a small armour-width margin.
 return new THREE.Box3(new THREE.Vector3(-.21,.30,distance-.19),new THREE.Vector3(.21,.94,distance+.19));
}
function touchesFacingTarget(ref,yaw,distance){
 const inverse=new THREE.Matrix4().makeRotationY(-yaw),box=targetBox(distance);
 for(const mesh of damageMeshes(ref)){
  const g=mesh.geometry,p=g.attributes.position,ix=g.index,matrix=inverse.clone().multiply(mesh.matrixWorld);
  for(let i=0;i<(ix?.count??p.count);i+=3){
   const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(matrix));
   if(box.intersectsTriangle(new THREE.Triangle(...vertices)))return true;
  }
 }
 return false;
}
function selfMeshes(ref){
 const meshes=[];ref.bodyPivot.children[0].traverse(m=>{
  if(!m.isMesh)return;for(let p=m;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(m);
 });
 ref.legGroup.traverse(m=>{if(m.isMesh)meshes.push(m);});
 ref.weaponAttachments.find(w=>w.name==='shield')?.traverse(m=>{if(m.isMesh)meshes.push(m);});
 return meshes;
}
function weaponPaths(kind){
 if(kind==='knuckle')return [[[0,0,.07],[0,0,.13]]];
 if(kind==='hammer')return [[[0,.105,0],[0,.415,0]],[[-.14,.49,0],[.14,.49,0]]];
 if(kind==='lance')return [[[0,.105,0],[0,.90,0]]];
 if(kind==='naginata')return [[[0,.105,0],[0,.61,0]],[[0,.61,0],[.035,.90,0]]];
 if(kind==='scythe')return [[[0,.105,0],[0,.68,0]],[[0,.68,0],[.13,.77,0]],[[.13,.77,0],[.30,.72,0]],[[.30,.72,0],[.34,.55,0]]];
 return [[[0,.105,0],[0,kind==='rapier'?.72:kind==='dagger'?.36:.57,0]]];
}
function assertRig(ref,f,label){
 for(const [i,arm]of ref.arms.entries()){
  const joint=f.joints[i===0?'right':'left'],fk=swordArm(joint);
  assert(arm.hand.position.distanceTo(fk.wrist)<1e-8,`${label}: 表示する手がFKから外れる`);
  assert(arm.hand.quaternion.angleTo(fk.hand)<1e-7,`${label}: 表示する手首がFKから外れる`);
  const upperEnd=arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)),elbow=arm.elbow.getWorldPosition(new THREE.Vector3());
  const lowerEnd=arm.lower.localToWorld(new THREE.Vector3(0,-.195,0)),hand=arm.hand.getWorldPosition(new THREE.Vector3());
  assert(upperEnd.distanceTo(elbow)<1e-8,`${label}: 肩から肘が切れる`);
  assert(lowerEnd.distanceTo(hand)<1e-8,`${label}: 肘から手が切れる`);
  assert(Math.abs(arm.elbow.position.length()-.195)<1e-8,`${label}: 上腕が伸びる`);
  assert(Math.abs(arm.hand.position.distanceTo(arm.elbow.position)-.195)<1e-8,`${label}: 前腕が伸びる`);
 }
 for(const weapon of ref.weaponAttachments)if(weapon.name!=='shield'){
  assert(weapon.parent.name.endsWith('Hand'),`${label}: 武器が手から外れる`);
  assert(weapon.getWorldPosition(new THREE.Vector3()).distanceTo(weapon.parent.getWorldPosition(new THREE.Vector3()))<1e-8);
 }
 const weapon=ref.weaponAttachments[0],support=weapon.userData.supportGrip;
 if(support){const grip=weapon.localToWorld(new THREE.Vector3(...support)),left=ref.arms[1].hand.getWorldPosition(new THREE.Vector3());
  assert(grip.distanceTo(left)<.005,`${label}: 支持する左手が柄から離れる (${grip.distanceTo(left)})`);
 }
}

test('近接8種の全段は30/60/120fpsの実命中時に刃・槍先・ヘッド・拳が正面の相手へ届く',()=>{
 for(const kind of kinds)for(const frame of frames)for(const yaw of [0,.8,-1.4])for(const fps of [30,60,120])for(let combo=0;combo<WEAPONS[kind].combo;combo++){
  const {config,ref}=fixture(kind,frame),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  const u=b.human,v=b.entities[1],distance=nearDistance(kind);Object.assign(u,{x:0,y:0,z:0,yaw,combo:(combo+WEAPONS[kind].combo-1)%WEAPONS[kind].combo,comboWindow:1,comboHit:true,comboChain:{weapon:kind,set:0,hits:new Map()}});
  Object.assign(v,{x:Math.sin(yaw)*distance,y:0,z:Math.cos(yaw)*distance});u.target=v.id;
  assert(b.attack(u));b.consumeEvents();let hit=false;
  for(let n=0;n<fps*3&&u.attack;n++){
   const attack=u.attack,previousRoot=[u.x,u.z];b.meleeStep(u,1/fps);const events=b.consumeEvents();
   if(!events.some(e=>e.type==='hit'&&e.attacker===u.id))continue;
   // A tracking target may change gameplay yaw, but cannot rotate the committed
   // striking frame away from the hit arc while the blow lands.
   u.yaw=yaw+.25;const elapsed=attack.elapsed,root=[u.x,u.z],label=`${kind}/${frame}/${yaw}/${fps}/${combo}/${elapsed/attack.duration}`;let touched=false;
   // At low physics rates a fast cut can cross and leave the opponent between
   // two frames. Inspect only this tick's past path, never a future pose.
   for(let i=0;i<=8;i++){
    const t=i/8;attack.elapsed=attack.previous+(elapsed-attack.previous)*t;u.x=previousRoot[0]+(root[0]-previousRoot[0])*t;u.z=previousRoot[1]+(root[1]-previousRoot[1])*t;draw(ref,u,attack.elapsed);
    if(touchesFacingTarget(ref,yaw,distance)){
     assert(Math.abs(Math.atan2(Math.sin(ref.root.rotation.y-yaw),Math.cos(ref.root.rotation.y-yaw)))<1e-8,`${label}: 命中方向から表示がずれる`);touched=true;break;
    }
   }
   attack.elapsed=elapsed;[u.x,u.z]=root;
   assert(touched,`${label}: 表示された打撃部が届く前に命中`);hit=true;break;
  }
  assert(hit,`${kind}/${frame}/${fps}/${combo}: 正面の相手に命中しない`);
 }
});

test('通常・チャージの全身FKは5フレームでも骨長を変えず、両手武器の支持鎖を閉じる',()=>{
 for(const kind of kinds)for(const frame of frames){
  const {ref,u}=fixture(kind,frame);
  for(const charge of [0,.3,1])for(let combo=0;combo<(charge?1:WEAPONS[kind].combo);combo++)for(let n=0;n<=120;n++){
   const p=n/120;placeAttack(u,kind,combo,p,0,{charge});draw(ref,u,p);
   const f=sampleMotion(kind,u.attack,{hasShield:ref.hasShield}),label=`${kind}/${frame}/${charge}/${combo}/${p}`;
   assert(f.melee&&f.joints,`${label}: 全身関節モーションではない`);assertRig(ref,f,label);
   for(const channel of channels){const walk=value=>Array.isArray(value)?value.forEach(walk):value&&typeof value==='object'?Object.values(value).forEach(walk):typeof value==='number'?assert(Number.isFinite(value),`${label}: ${channel} が非有限値`):null;walk(f[channel]);}
   for(const joint of Object.values(f.joints))for(const key of ['upper','wrist'])assert(Math.abs(new THREE.Quaternion().fromArray(joint[key]).length()-1)<1e-8,`${label}: 関節の回転が正規化されていない`);
  }
 }
});

test('刃・長柄の中心線は攻撃中も胴・頭・腰・脚・盾を貫通せず打撃部を床上へ保つ',()=>{
 for(const kind of kinds)for(const frame of frames){
  const {ref,u}=fixture(kind,frame),meshes=selfMeshes(ref);
  for(let combo=0;combo<WEAPONS[kind].combo;combo++)for(let n=0;n<=180;n++){
   const p=n/180;placeAttack(u,kind,combo,p);draw(ref,u,p);const label=`${kind}/${frame}/${combo}/${p}`;
   for(const weapon of ref.weaponAttachments.filter(w=>w.name!=='shield'))for(const path of weaponPaths(kind)){
    const a=weapon.localToWorld(new THREE.Vector3(...path[0])),b=weapon.localToWorld(new THREE.Vector3(...path[1])),d=b.clone().sub(a);
    assert.equal(new THREE.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObjects(meshes,false).length,0,`${label}: 武器が自機を貫通`);
   }
   for(const mesh of damageMeshes(ref))assert(new THREE.Box3().setFromObject(mesh).min.y>=0,`${label}: 打撃部が床を貫通`);
  }
 }
});

test('各段の支持足は前進・骨盤回転・追尾中も接地位置を保ち、腰と頭で荷重を運ぶ',()=>{
 for(const kind of kinds)for(const frame of frames.filter(f=>f!=='panzer'))for(let combo=0;combo<WEAPONS[kind].combo;combo++){
  const {ref,u}=fixture(kind,frame),anchors=[null,null],hips=[],heights=[],head=[];
  for(let n=0;n<=240;n++){
   const p=n/240;placeAttack(u,kind,combo,p,.7);draw(ref,u,p);const f=sampleMotion(kind,u.attack,{hasShield:ref.hasShield}),points=feet(ref);let contacts=0;
   for(let j=0;j<2;j++){
    if(f.feet[j][1]>.035+1e-9)anchors[j]=null;
    else {contacts++;anchors[j]??=points[j].clone();assert(points[j].distanceTo(anchors[j])<1e-7,`${kind}/${frame}/${combo}/${p}/${j}: 支持足が滑る`);}
    const leg=ref.feet[j],knee=leg.knee.getWorldPosition(new THREE.Vector3());
    assert(leg.upper.localToWorld(new THREE.Vector3(0,-.155,0)).distanceTo(knee)<1e-8);
    assert(leg.lower.localToWorld(new THREE.Vector3(0,-.17,0)).distanceTo(points[j])<1e-8);
    assert(new THREE.Box3().setFromObject(leg.foot).min.y>=0,`${kind}/${frame}/${combo}/${p}: 足が床を貫通`);
   }
   assert(contacts>=1,`${kind}/${frame}/${combo}/${p}: 両足とも支持しない`);
   hips.push(f.hipYaw);heights.push(ref.bodyPivot.position.y);head.push(Math.hypot(...f.head));
  }
  assert(Math.max(...hips)-Math.min(...hips)>.02,`${kind}/${combo}: 骨盤が固定されたまま`);
  assert(Math.max(...heights)-Math.min(...heights)>.01,`${kind}/${combo}: 腰で荷重を受けない`);
  assert(Math.max(...head)>.02,`${kind}/${combo}: 頭が胴と一緒に固定されたまま`);
 }
});

test('関節と全身の中間キーは飛ばず、盾の有無と単発の終わりは専用構えへ戻る',()=>{
 for(const kind of kinds)for(const shield of WEAPONS[kind].shield?[false,true]:[false]){
  const ready=sampleMotion(kind,null,{hasShield:shield});
  for(let combo=0;combo<WEAPONS[kind].combo;combo++){
   let before=null,travel=0;
   for(let n=0;n<=480;n++){
    const f=sampleMotion(kind,{weapon:kind,combo,elapsed:n/480,duration:1},{hasShield:shield});
    if(before){
     for(const side of ['right','left'])for(const key of ['upper','wrist'])assert(new THREE.Quaternion().fromArray(before.joints[side][key]).angleTo(new THREE.Quaternion().fromArray(f.joints[side][key]))<.12,`${kind}/${combo}/${n}: ${side}/${key} が飛ぶ`);
     assert(new THREE.Vector3(...before.right.position).distanceTo(new THREE.Vector3(...f.right.position))<.025,`${kind}/${combo}/${n}: 手が飛ぶ`);
     assert(new THREE.Vector3(...before.body).distanceTo(new THREE.Vector3(...f.body))<.035,`${kind}/${combo}/${n}: 胴が飛ぶ`);
     travel+=new THREE.Vector3(...before.right.position).distanceTo(new THREE.Vector3(...f.right.position))+new THREE.Vector3(...before.left.position).distanceTo(new THREE.Vector3(...f.left.position));
    }
    before=f;
   }
   assert(travel>.12,`${kind}/${combo}: 関節攻撃がほとんど動かない`);
   for(const key of channels)assert.deepEqual(before[key],ready[key],`${kind}/${combo}/${shield}: 単発終了時の ${key} が構えへ戻らない`);
  }
 }
});

test('実際の先行入力で全近接コンボが命中派生し、次段開始の手・足・全身を引き継ぐ',()=>{
 for(const kind of kinds)for(const frame of frames){
  const {config,ref}=fixture(kind,frame),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
  const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:nearDistance(kind),lp:100000});let boundaries=0;
  const attack=b.attack.bind(b);b.attack=(unit,...args)=>{
   draw(ref,unit,b.time);const old=unit.motion&&sampleMotion(kind,unit.motion,{nextCombo:unit.queuedAttack?(unit.combo+1)%WEAPONS[kind].combo:null,hasShield:ref.hasShield}),points=feet(ref),hands=ref.arms.map(a=>a.hand.getWorldPosition(new THREE.Vector3())),root=ref.root.position.clone();
   const ok=attack(unit,...args);if(ok&&old){
    draw(ref,unit,b.time);const after=feet(ref);assert(ref.root.position.distanceTo(root)<1e-9);
    for(let j=0;j<2;j++){assert(after[j].distanceTo(points[j])<1e-7,`${kind}/${frame}/${unit.combo}/${j}: 次段で足が飛ぶ`);assert(ref.arms[j].hand.getWorldPosition(new THREE.Vector3()).distanceTo(hands[j])<1e-7,`${kind}/${frame}/${unit.combo}/${j}: 次段で手が飛ぶ`);}
    const f=sampleMotion(kind,unit.attack,{hasShield:ref.hasShield});for(const key of channels)assert.deepEqual(f[key],old[key],`${kind}/${frame}/${unit.combo}: ${key} が飛ぶ`);boundaries++;
   }return ok;
  };
  const tick=input=>{b.tick(1/120,input);draw(ref,u,b.time);},tap=()=>{tick({attack:true});tick({attack:false});};tap();
  for(let stage=1;stage<WEAPONS[kind].combo;stage++){
   while(b.runtime(u).cooldown>.16)tick({});tap();assert(u.queuedAttack,`${kind}/${frame}/${stage}: 次段を予約しない`);
   for(let n=0;n<180&&u.combo!==stage;n++)tick({});assert.equal(u.combo,stage,`${kind}/${frame}: 命中が次段へ派生しない`);
  }
  assert.equal(boundaries,WEAPONS[kind].combo-1);
 }
});

test('チャージ待機から通常・溜め攻撃へ全身を滑らかにつなぎ、表示された握りを保持する',()=>{
 for(const kind of kinds)for(const shield of WEAPONS[kind].shield?[false,true]:[false]){
  const {ref,u}=fixture(kind,'knight',shield),ready=sampleMotion(kind,null,{hasShield:shield});let before=null;
  for(let n=0;n<=120;n++){
   const charging={elapsed:n/120,amount:n/120,from:ready};u.attack=null;u.charging=true;u.chargePose=charging;draw(ref,u,n/120);const f=sampleMotion(kind,null,{charging,hasShield:shield});assert(f.joints,`${kind}: チャージ構えが関節駆動ではない`);assertRig(ref,f,`${kind}/hold/${n}`);
   if(before)for(const side of ['right','left'])assert(new THREE.Quaternion().fromArray(before.joints[side].upper).angleTo(new THREE.Quaternion().fromArray(f.joints[side].upper))<.10,`${kind}: 溜め中に肩が飛ぶ`);
   before=f;
  }
  for(const charge of [.2,1]){
   const attack={weapon:kind,combo:0,elapsed:0,duration:1,charge,blendFrom:before};
   const start=sampleMotion(kind,attack,{hasShield:shield});for(const key of channels)assert.deepEqual(start[key],before[key],`${kind}: 溜め解除時の ${key} が飛ぶ`);
  }
 }
});

test('実際の押下・保持・解除で8近接の全身構えを引き継ぎ、攻撃資源と空振り派生を守る',()=>{
 for(const kind of kinds)for(const fps of [30,60,120])for(const full of [false,true]){
  const {config,ref}=fixture(kind),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  b.countdown=0;b.training.freezeAI=true;const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:5});
  const dt=1/fps,held=full?Math.ceil(b.maxCharge(u)/dt)+1:Math.max(1,Math.round(.05/dt));
  for(let n=0;n<held;n++){b.tick(dt,{attack:true});draw(ref,u,b.time);assert(!u.attack,`${kind}/${fps}: 保持途中に攻撃を始める`);}
  assert(u.charging&&u.chargePose,`${kind}/${fps}: 実入力でチャージ構えを作らない`);
  const heldPose=sampleMotion(kind,null,{charging:u.chargePose,hasShield:ref.hasShield}),heldAmount=u.charge,spentBefore=u.tension,original=b.attack.bind(b);let released=false;
  b.attack=(unit,charge,...args)=>{
   draw(ref,unit,b.time);const beforeFeet=feet(ref),beforeHands=ref.arms.map(a=>a.hand.getWorldPosition(new THREE.Vector3())),beforeBody=ref.bodyPivot.quaternion.clone(),beforeRoot=ref.root.position.clone();
   const ok=original(unit,charge,...args);assert(ok,`${kind}/${fps}: 支払える解除攻撃を始めない`);assert(unit.attack.blendFrom,`${kind}: 保持姿勢を解除攻撃へ渡さない`);
   for(const key of channels)assert.deepEqual(unit.attack.blendFrom[key],heldPose[key],`${kind}/${fps}/${full}: 保存された保持姿勢の ${key} が違う`);
   const start=sampleMotion(kind,unit.attack,{hasShield:ref.hasShield});for(const key of channels)assert.deepEqual(start[key],heldPose[key],`${kind}/${fps}/${full}: 解除時 ${key} が飛ぶ`);
   draw(ref,unit,b.time);assert(ref.root.position.distanceTo(beforeRoot)<1e-9);assert(ref.bodyPivot.quaternion.angleTo(beforeBody)<1e-7,`${kind}/${fps}/${full}: 解除時に胴が飛ぶ`);
   const afterFeet=feet(ref);for(let j=0;j<2;j++){assert(afterFeet[j].distanceTo(beforeFeet[j])<1e-7,`${kind}/${fps}/${full}: 解除時に足が飛ぶ`);assert(ref.arms[j].hand.getWorldPosition(new THREE.Vector3()).distanceTo(beforeHands[j])<1e-7,`${kind}/${fps}/${full}: 解除時に手が飛ぶ`);}
   assert.equal(charge,full?1:0);assert.equal(unit.attack.combo,0);assert.equal(unit.attack.finisher,false);assert.equal(unit.comboHit,false);
   assert(Math.abs((spentBefore-unit.tension)-cost(unit.stats,'attack',WEAPONS[kind].tension*(1+.6*charge)))<1e-8,`${kind}/${fps}: 解除攻撃の支払いが違う`);
   assert(Math.abs(unit.attack.coefficient-(1+(WEAPONS[kind].chargePower-1)*charge))<1e-8,`${kind}/${fps}: 溜め倍率が変わる`);released=true;return ok;
  };
  b.tick(dt,{attack:false});draw(ref,u,b.time);assert(released);assert(!u.charging);assert.equal(u.charge,0);assert.equal(u.chargePose,null);assert(full?heldAmount===b.maxCharge(u):heldAmount<=.15);
  b.attack=original;
  for(let n=0;n<fps*4&&(u.attack||b.runtime(u).cooldown>0||u.actionTime>0);n++){b.tick(dt,{});draw(ref,u,b.time);}
  assert(!u.comboHit);assert.equal(u.comboWindow,0);assert.equal(u.comboChain,null,`${kind}/${fps}: 空振りした溜め・単発が連撃履歴を残す`);
  assert(b.attack(u));assert.equal(u.attack.combo,0,`${kind}/${fps}: 空振りから次段へ派生する`);
 }
});

test('近距離・空振りの満溜めブーストが5フレームの足・打撃部を浮かせず自機を貫通しない',()=>{
 for(const kind of kinds)for(const frame of frames)for(const near of [false,true]){
  const {config,ref}=fixture(kind,frame),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  b.countdown=0;b.training.freezeAI=true;const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:near?nearDistance(kind):5});const meshes=selfMeshes(ref),dt=1/120;let sawBoost=false,sawGround=false;
  const context=`${kind}/${frame}/${near?'near':'far'}`;
  const inspect=()=>{
   draw(ref,u,b.time);for(const value of [...ref.bodyPivot.position.toArray(),...ref.bodyPivot.quaternion.toArray(),u.x,u.y,u.z])assert(Number.isFinite(value),`${context}: 姿勢が非有限値`);
   const f=sampleMotion(kind,u.attack,{charging:u.charging?u.chargePose:null,hasShield:ref.hasShield});assertRig(ref,f,`${context}/fullcharge`);
   for(const weapon of ref.weaponAttachments.filter(w=>w.name!=='shield'))for(const path of weaponPaths(kind)){
    const a=weapon.localToWorld(new THREE.Vector3(...path[0])),c=weapon.localToWorld(new THREE.Vector3(...path[1])),d=c.clone().sub(a);
    assert.equal(new THREE.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObjects(meshes,false).length,0,`${context}: 実チャージ中に武器が自機を貫通`);
   }
   for(const mesh of damageMeshes(ref))assert(new THREE.Box3().setFromObject(mesh).min.y>=0,`${context}: 実チャージ中に打撃部が床を貫通`);
   if(u.attack&&frame!=='panzer')for(let j=0;j<2;j++)if(f.feet[j][1]<=.035+1e-9){
    sawGround=true;const foot=ref.feet[j].foot.getWorldPosition(new THREE.Vector3());assert(Math.abs(foot.y-.035)<1e-7,`${context}/${u.attack.elapsed/u.attack.duration}/${j}: 接地する足が ${foot.y-.035} 浮く`);
   }
   if(u.attack&&u.dashTime>0)sawBoost=true;
  };
  for(let n=0;n<Math.ceil(b.maxCharge(u)/dt)+1;n++){b.tick(dt,{attack:true});inspect();}
  b.tick(dt,{attack:false});inspect();assert(u.attack&&u.attack.charge===1);
  for(let n=0;n<400&&u.attack;n++){b.tick(dt,{});inspect();}
  assert(!u.attack,`${context}: 満溜め動作が終わらない`);assert(sawBoost);if(frame!=='panzer')assert(sawGround);
 }
});

test('単発・通常コンボ・近距離と空振りの満溜めから待機へ戻っても支持足が飛ばない',t=>{
 let lifecycles=0,maxFootDelta=0,maxPhysicalDrift=0,maxExtraJump=0;
 for(const kind of kinds)for(const frame of frames)for(const mode of ['free','near','final','chargeNear','chargeFar'])for(const fps of [30,60,120]){
  const {config,ref}=fixture(kind,frame),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  b.countdown=0;b.training.freezeAI=true;const u=b.human,v=b.entities[1],charged=mode.startsWith('charge');Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:mode==='free'||mode==='chargeFar'?5:nearDistance(kind)});draw(ref,u,b.time);
  const context=`${kind}/${frame}/${mode}/${fps}`,dt=1/fps,landingRoots=[null,null];let expiries=0,previousLP=v.lp;
  const tick=(input={})=>{
   const had=!!u.motion,before=feet(ref),root=ref.root.position.clone();b.tick(dt,input);draw(ref,u,b.time);
   assert(v.lp<=previousLP,`${context}: LPをリセットする`);previousLP=v.lp;
   for(const value of [u.x,u.y,u.z,u.tension,u.lp,v.lp,...feet(ref).flatMap(p=>p.toArray())])assert(Number.isFinite(value),`${context}: 保持・待機中に非有限値になる`);
   if(had&&!u.motion){
    assert(ref.root.position.distanceTo(root)<1e-9,`${context}: 停止している自機が動く`);
    const after=feet(ref);for(let j=0;j<2;j++){
     const delta=after[j].clone().sub(before[j]);maxFootDelta=Math.max(maxFootDelta,delta.length());
     // At 30 fps the final landing may precede the last few pair-collision
     // corrections. A planted foot stays fixed while that real root travel
     // accumulates; compare only the additional motion introduced by expiry.
     if(mode==='chargeNear'&&frame!=='panzer'){
      assert(landingRoots[j],`${context}/${j}: 最終接地を確認しない`);
      const physical=ref.root.position.clone().sub(landingRoots[j]);maxPhysicalDrift=Math.max(maxPhysicalDrift,physical.length());
      assert(physical.length()<.00025,`${context}/${j}: 接地後に大きく移動する`);delta.sub(physical);
     }
     maxExtraJump=Math.max(maxExtraJump,delta.length());assert(delta.length()<1e-7,`${context}/${j}: 保持姿勢の削除で支持足が余分に ${delta.length()} 飛ぶ`);
    }expiries++;
   }
   if(u.motion){const motion=sampleMotion(kind,u.motion,{hasShield:ref.hasShield});for(let j=0;j<2;j++){
    if(motion.feet[j][1]>.035+1e-9||u.dashTime>0)landingRoots[j]=null;
    else landingRoots[j]??=ref.root.position.clone();
   }}
  };
  const tap=()=>{tick({attack:true});tick({attack:false});};
  if(charged){
   for(let n=0;n<fps*3&&u.charge<b.maxCharge(u)-1e-9;n++)tick({attack:true});
   assert.equal(u.charge,b.maxCharge(u),`${context}: 実入力で満溜めに到達しない`);tick({attack:false});assert(u.attack&&u.attack.charge===1,`${context}: 満溜め解除を攻撃へ渡さない`);
  }else tap();
  if(mode==='final')for(let stage=1;stage<WEAPONS[kind].combo;stage++){
   for(let n=0;n<fps*3&&b.runtime(u).cooldown>.16;n++)tick();tap();
   for(let n=0;n<fps*3&&u.combo!==stage;n++)tick();assert.equal(u.combo,stage,`${context}: 実命中した次段へ派生しない`);
  }
  for(let n=0;n<fps*4&&u.motion;n++)tick();assert.equal(u.motion,null,`${context}: 保持姿勢が消えない`);assert.equal(expiries,1);assert(u.tension<100,`${context}: 攻撃の支払いを省く`);
  if(charged){assert.equal(u.comboWindow,0);assert.equal(u.comboChain,null,`${context}: 溜め攻撃が通常コンボの履歴を残す`);}
  const idle=feet(ref);for(let n=0;n<10;n++){tick();for(let j=0;j<2;j++)assert(feet(ref)[j].distanceTo(idle[j])<1e-7,`${context}: 待機してから支持足を動かす`);}
  lifecycles++;
 }
 assert.equal(lifecycles,600);t.diagnostic(JSON.stringify({lifecycles,maxFootDelta,maxPhysicalDrift,maxExtraJump}));
});

test('近接共通engineを追加しても承認済みソード通常・回転・チャージ待機の全chを変えない',()=>{
 for(const hasShield of [false,true])for(let combo=0;combo<4;combo++)for(const charge of [0,.3,1])for(const elapsed of [0,.08,.16,.27,.40,.53,.78,.90,1]){
  const attack={weapon:'sword',combo,charge,elapsed,duration:1,origin:[0,0,0],yaw:.7};
  assert.deepEqual(sampleMotion('sword',attack,{hasShield}),swordMotion(attack,{hasShield}));
 }
 for(const hasShield of [false,true])for(const amount of [0,.2,1])for(const elapsed of [0,.1,.4,1]){
  const charging={amount,elapsed};assert.deepEqual(sampleMotion('sword',null,{charging,hasShield}),swordChargeHold({...charging,hasShield}));
 }
});
