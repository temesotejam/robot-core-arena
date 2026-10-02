import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {CATALOG,WEAPONS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {COMBO_CLIPS,sampleMotion} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import * as THREE from '../vendor/three.module.min.js';
function battle(kind='sword'){
 const c=defaultConfig();c.sets[0]={item:`weapon:${kind}`,shield:null};
 const b=new Battle({allies:[c],enemies:[defaultConfig(0,true)],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;return b;
}
function advance(b,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=1/60)b.tick(1/60,input);}
function tap(b){b.tick(1/60,{attack:true});b.tick(1/60,{attack:false});}
test('終わり際の先行入力でソード4段がつながり、終段後は1段目へ戻る',()=>{
 const b=battle(),u=b.human;tap(b);assert.equal(u.combo,0);
 for(const stage of [1,2,3,0]){while(b.runtime(u).cooldown>.16)b.tick(1/60);tap(b);assert(u.queuedAttack);const starts=b.consumeEvents().filter(e=>e.type==='attack').length;advance(b,.25);assert.equal(u.combo,stage);assert.equal(b.consumeEvents().filter(e=>e.type==='attack').length,1);assert.equal(starts,stage===1?1:0);}
 assert.equal(u.queuedAttack,null);
});
test('早すぎる入力は遅れて暴発せず、ガード・切替・被弾で先行入力を取り消す',()=>{
 for(const mode of ['early','guard','switch','stun']){
  const b=battle(),u=b.human;tap(b);b.consumeEvents();if(mode==='early'){tap(b);assert.equal(u.queuedAttack,null);}else {while(b.runtime(u).cooldown>.16)b.tick(1/60);tap(b);assert(u.queuedAttack);if(mode==='guard')b.tick(1/60,{guard:true});if(mode==='switch')b.tick(1/60,{switchPressed:true});if(mode==='stun'){u.stun=.2;b.tick(1/60);}}
  assert.equal(u.queuedAttack,null);advance(b,.6);assert.equal(b.consumeEvents().filter(e=>e.type==='attack').length,0);
 }
});
test('チャージ・長押し連射を保持し、ポーズ中は先行入力とモーションを止める',()=>{
 const b=battle(),u=b.human;advance(b,.65,{attack:true});assert.equal(u.attack,null);b.tick(1/60,{});assert(u.attack.charge>.7);
 const automatic=battle('machinegun');advance(automatic,.5,{attack:true});assert(automatic.consumeEvents().filter(e=>e.type==='attack').length>=4);
 const queued=battle();tap(queued);while(queued.runtime(queued.human).cooldown>.16)queued.tick(1/60);tap(queued);const snapshot=JSON.stringify([queued.human.motion,queued.human.queuedAttack]);queued.paused=true;advance(queued,.5);assert.equal(JSON.stringify([queued.human.motion,queued.human.queuedAttack]),snapshot);
});
test('コンボ段数は確定値と一致し、各段の軌跡が異なり、動作端で構えへ戻る',()=>{
 for(const [kind,clips]of Object.entries(COMBO_CLIPS)){
  assert.equal(clips.length,WEAPONS[kind].combo);const samples=new Set();
  for(let combo=0;combo<clips.length;combo++){const zero=sampleMotion(kind,{combo,elapsed:0,duration:1}),end=sampleMotion(kind,{combo,elapsed:1,duration:1});assert.deepEqual(zero.right,end.right);assert.deepEqual(zero.left,end.left);samples.add(JSON.stringify(sampleMotion(kind,{combo,elapsed:.5,duration:1})));}
  assert(samples.size>=2,`${kind}が毎段同じモーションになる`);
 }
});
test('全近接の各段・全位相で関節と両手の支持が保たれる',()=>{
 for(const [kind,clips]of Object.entries(COMBO_CLIPS)){
  const b=battle(kind),u=b.human,ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;
  for(let combo=0;combo<clips.length;combo++)for(let i=0;i<=30;i++){
   u.attack={combo,elapsed:i/30,duration:1};ArenaRenderer.prototype.animateRobot.call({},ref,u,0);ref.root.updateMatrixWorld(true);
   for(const arm of ref.arms){const endpoint=arm.lower.localToWorld(new THREE.Vector3(0,-.195,0));assert(endpoint.distanceTo(arm.hand.getWorldPosition(new THREE.Vector3()))<1e-8);}
   const weapon=ref.weaponAttachments[0],support=weapon.userData.supportGrip;if(support)assert(weapon.localToWorld(new THREE.Vector3(...support)).distanceTo(ref.arms[1].hand.getWorldPosition(new THREE.Vector3()))<.005,`${kind} ${combo} ${i}: 支持手が離れる`);
  }
 }
});
test('振りかぶりと戻しでは命中せず、振る区間で一度だけ命中する',()=>{
 const b=battle('rapier'),u=b.human,v=b.entities[1];v.x=u.x+.8;v.z=u.z;u.target=v.id;assert(b.attack(u));const initial=v.lp;
 b.meleeStep(u,u.attack.duration*.1);assert.equal(v.lp,initial);b.meleeStep(u,u.attack.duration*.15);assert(v.lp<initial);const after=v.lp;b.meleeStep(u,u.attack.duration*.5);assert.equal(v.lp,after);
});
test('先行入力の受付端でも次のフレームに繰り越して確実に実行する',()=>{
 const b=battle(),u=b.human;tap(b);u.attack.elapsed=u.attack.duration-.20;b.runtime(u).cooldown=.22;u.actionTime=0;u.lastAttackHeld=true;u.charging=true;u.charge=0;b.consumeEvents();b.handleInput(u,{},1/60);assert(u.queuedAttack);advance(b,.24);assert.equal(u.combo,1);assert.equal(b.consumeEvents().filter(e=>e.type==='attack').length,1);
});
