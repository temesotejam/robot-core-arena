import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS,WEAPONS} from '../src/data.js';
import {sampleMotion,stepPhase,motionRhythm} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
function battle(){const config=defaultConfig(),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;Object.assign(b.human,{x:0,z:0,yaw:0});Object.assign(b.entities[1],{x:0,z:4,y:10});return b;}
function ticks(b,n,input={}){for(let i=0;i<n;i++)b.tick(1/120,input);}
function rig(frame='knight'){const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;const u={config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true,attack:null,motion:null};return {ref,u};}
function draw(ref,u){ArenaRenderer.prototype.animateRobot.call({},ref,u,0);ref.root.updateMatrixWorld(true);}
function targetCrossed(ref){const w=ref.weaponAttachments[0],a=w.localToWorld(new THREE.Vector3(0,.10,0)),b=w.localToWorld(new THREE.Vector3(0,.57,0)),d=b.clone().sub(a),box=new THREE.Box3(new THREE.Vector3(-.2,.30,.73),new THREE.Vector3(.2,.94,1.07)),p=new THREE.Ray(a,d.clone().normalize()).intersectBox(box,new THREE.Vector3());return p&&p.distanceTo(a)<=d.length();}
test('ソードを溜めると構えが変わり、最大で安定し、離した瞬間の全身姿勢を引き継ぐ',()=>{
 const b=battle(),u=b.human,base=sampleMotion('sword',null);ticks(b,8,{attack:true});assert.deepEqual(sampleMotion('sword',null,{charging:u.chargePose}).right,base.right);ticks(b,88,{attack:true});assert.equal(u.attack,null);assert.equal(u.charge,b.maxCharge(u));const held=sampleMotion('sword',null,{charging:u.chargePose});assert.equal(held.name,'chargeHold');assert.notDeepEqual(held.right,base.right);const {ref}=rig();draw(ref,u);assert(ref.arms[0].hand.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...held.right.rotation)))<1e-7);
 ticks(b,60,{attack:true});const steady=sampleMotion('sword',null,{charging:u.chargePose});for(const key of ['joints','body','hipYaw','drop','shift','feet'])assert.deepEqual(steady[key],held[key]);b.handleInput(u,{},1/120);assert.equal(u.attack.charge,1);assert.equal(u.attack.duration,WEAPONS.sword.interval);assert.equal(u.attack.coefficient,1.8);assert.equal(u.dashTime,0);assert.equal(u.comboWindow,0);const start=sampleMotion('sword',u.attack);for(const key of ['joints','right','left','body','hipYaw','drop','shift','feet'])assert.deepEqual(start[key],held[key]);assert.equal(start.name,'chargeCut');assert.equal(u.chargePose,null);
});
test('短押しは通常攻撃、途中解放はチャージ攻撃、スピードチャージは実際の溜め時間と構えを短縮する',()=>{
 const tap=battle();ticks(tap,8,{attack:true});tap.handleInput(tap.human,{},1/120);assert.equal(tap.human.attack.charge,0);assert.equal(sampleMotion('sword',tap.human.attack).name,'slashOut');
 const partial=battle();ticks(partial,48,{attack:true});partial.handleInput(partial.human,{},1/120);assert(Math.abs(partial.human.attack.charge-.5)<1e-8);assert.equal(sampleMotion('sword',partial.human.attack).name,'chargeCut');assert(partial.human.tension<tap.human.tension,'溜めた攻撃はよりテンションを使う');
 const fast=battle();fast.human.stats.passives.add('charge');ticks(fast,48,{attack:true});assert.equal(fast.human.charge,fast.maxCharge(fast.human));assert.equal(fast.human.chargePose.amount,1);assert.deepEqual(sampleMotion('sword',null,{charging:fast.human.chargePose}).joints,sampleMotion('sword',null,{charging:{amount:1,elapsed:.8}}).joints);
});
test('溜め中のポーズは停止し、ガード・武器切替・被弾で溜めと解放予約を取り消す',()=>{
 for(const cancel of ['guard','switch','hit']){const b=battle(),u=b.human;ticks(b,50,{attack:true});const snapshot=JSON.stringify([u.charge,u.chargePose]);b.paused=true;ticks(b,50,{attack:true});assert.equal(JSON.stringify([u.charge,u.chargePose]),snapshot);b.paused=false;b.consumeEvents();if(cancel==='hit'){u.stun=.2;b.tick(1/120);}else b.tick(1/120,cancel==='guard'?{guard:true}:{switchPressed:true});assert.equal(u.charging,false);assert.equal(u.chargePose,null);ticks(b,60);assert.equal(b.consumeEvents().filter(e=>e.type==='attack').length,0);}
});
test('チャージ斬撃は相手の手前と壁で止まり、見える刃が相手を通る時点で1回だけ命中する',()=>{
 for(const amount of [.2,.5,1]){const b=battle(),u=b.human,v=b.entities[1],{ref}=rig();Object.assign(v,{x:0,z:.9,y:0});u.target=v.id;ticks(b,Math.ceil(.8*amount*120),{attack:true});b.handleInput(u,{},1/120);b.consumeEvents();let hits=0;const startZ=u.z;
  for(let i=0;i<100&&u.attack;i++){const a=u.attack,received=v.received;b.tick(1/120);if(v.received>received){draw(ref,u);assert(targetCrossed(ref),`${amount}: 剣が届く前に命中`);}hits+=b.consumeEvents().filter(e=>e.type==='hit'&&e.attacker===u.id).length;assert(u.z<=v.z-.61+1e-7,'相手を通り越す');}
  assert.equal(hits,1);assert(u.z-startZ<=.324+1e-7);
  const wall=battle();Object.assign(wall.human,{z:-7.04});wall.attack(wall.human,amount);ticks(wall,80);assert(wall.human.z<=-7.03);
 }
});
test('全5フレームの溜めとチャージ斬撃は関節・接地・刃の向きを保ち、胴・頭・盾・床を貫通しない',()=>{
 for(const frame of ['knight','strider','brawler','wild','panzer']){const {ref,u}=rig(frame),meshes=[];ref.bodyPivot.children[0].traverse(m=>{if(!m.isMesh)return;for(let p=m;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(m);});ref.weaponAttachments.find(w=>w.name==='shield')?.traverse(m=>{if(m.isMesh)meshes.push(m);});
  const inspect=()=>{draw(ref,u);const w=ref.weaponAttachments[0],a=w.localToWorld(new THREE.Vector3(0,.105,0)),tip=w.localToWorld(new THREE.Vector3(0,.57,0)),d=tip.clone().sub(a);assert.equal(new THREE.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObjects(meshes,false).length,0,`${frame}: 自機を貫通`);assert(tip.y>=.02,'剣先が床を貫通');for(const arm of ref.arms){assert(Math.abs(arm.elbow.position.length()-.195)<1e-8);assert(Math.abs(arm.hand.position.distanceTo(arm.elbow.position)-.195)<1e-8);}for(const leg of ref.feet){const y=new THREE.Box3().setFromObject(leg.foot||leg).min.y;assert(y>=0,`${frame}: 足が床を貫通 ${y}, hold=${JSON.stringify(u.chargePose)}, p=${u.attack?.elapsed}`);}return tip;};
  for(const amount of [.2,.5,1]){let previous;const held=sampleMotion('sword',null,{charging:{amount,elapsed:amount*.8}}),queued=sampleMotion('sword',{combo:3,elapsed:1,duration:1},{nextCombo:0});
   for(let i=0;i<=120;i++){u.attack=null;u.charging=true;u.chargePose={amount:Math.min(amount,i/120),elapsed:i/120};inspect();}
   u.charging=false;u.chargePose=null;
   for(const from of [held,queued])for(let i=0;i<=240;i++){const p=i/240,a={weapon:'sword',charge:amount,combo:0,elapsed:p,duration:1,origin:[0,0,0],yaw:0,blendFrom:from};u.attack=a;u.z=motionRhythm('sword',a).advance*stepPhase(a);inspect();const q=ref.arms[0].hand.quaternion.clone();if(i&&previous)assert(q.angleTo(previous)<.15,'チャージ中に手の向きが飛ぶ');previous=q;
    if(p>=.30&&p<=motionRhythm('sword',a).contactEnd){const before=ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.57,0));u.attack={...a,elapsed:p+.0001};u.z=motionRhythm('sword',a).advance*stepPhase(u.attack);draw(ref,u);const velocity=ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.57,0)).sub(before).normalize(),rotation=ref.weaponAttachments[0].getWorldQuaternion(new THREE.Quaternion()),edge=new THREE.Vector3(1,0,0).applyQuaternion(rotation),flat=new THREE.Vector3(0,0,1).applyQuaternion(rotation);assert(Math.abs(edge.dot(velocity))>.7,`${frame} ${amount} p=${p}, edge=${edge.dot(velocity)}: 刃を進行方向へ向ける`);assert(Math.abs(flat.dot(velocity))<.16,'刃の面で叩かない');}
   }
  }
 }
});
test('チャージ斬撃は通常コンボを進めず、次の通常攻撃は初段から同じ姿勢でつながる',()=>{
 const b=battle(),u=b.human;b.training.infinite=true;b.attack(u);ticks(b,20,{attack:true});ticks(b,50,{attack:true});b.handleInput(u,{},1/120);assert(u.attack.charge>0);assert.equal(u.combo,0);while(b.runtime(u).cooldown>.15)b.tick(1/120);b.tick(1/120,{attack:true});b.tick(1/120);assert(u.queuedAttack);ticks(b,25);assert.equal(u.attack.charge,0);assert.equal(u.combo,0);assert.equal(sampleMotion('sword',u.attack).name,'slashOut');assert(u.attack.blendFrom?.joints);
});
test('チャージの前進中は後ろ足から前足へ支持を移し、接地した足を滑らせない',()=>{
 for(const amount of [.2,.5,1])for(const yaw of [0,.8])for(const [index,start,end]of [[0,.09,.25],[1,.28,.41]]){const {ref,u}=rig();let anchor;
  for(let p=start;p<=end;p+=.005){u.attack={weapon:'sword',charge:amount,combo:0,elapsed:p,duration:1,origin:[0,0,0],yaw};const travel=motionRhythm('sword',u.attack).advance*stepPhase(u.attack);u.x=Math.sin(yaw)*travel;u.z=Math.cos(yaw)*travel;u.yaw=yaw+.13*Math.sin(p*4);draw(ref,u);const point=ref.feet[index].foot.getWorldPosition(new THREE.Vector3());anchor??=point.clone();assert(point.distanceTo(anchor)<1e-7,'接地した足が滑る');}
 }
});
