import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {CATALOG,PARTS,WEAPONS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {COMBO_CLIPS,sampleMotion,motionRhythm} from '../src/motion.js';
import {createRobot,ArenaRenderer,ROBOT_PROPORTIONS} from '../src/render.js';
import * as THREE from '../vendor/three.module.min.js';
function battle(kind='sword',frame='knight'){
 const c=defaultConfig();c.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));c.sets[0]={item:`weapon:${kind}`,shield:null};
 const b=new Battle({allies:[c],enemies:[defaultConfig(0,true)],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;return b;
}
function contact(b){const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:.9,lp:100000});}
function advance(b,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=1/60)b.tick(1/60,input);}
function tap(b){b.tick(1/60,{attack:true});b.tick(1/60,{attack:false});}
test('終わり際の先行入力でソード4段がつながり、終段後は1段目へ戻る',()=>{
 const b=battle(),u=b.human;contact(b);tap(b);assert.equal(u.combo,0);
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
  for(let combo=0;combo<clips.length;combo++){const zero=sampleMotion(kind,{combo,elapsed:0,duration:1}),end=sampleMotion(kind,{combo,elapsed:1,duration:1});assert.deepEqual(zero.right,end.right);assert.deepEqual(zero.left,end.left);const p=sampleMotion(kind,{combo,elapsed:.5,duration:1});samples.add(JSON.stringify([p.right,p.left,p.body,p.drop,p.shift,p.feet,p.footPitch,p.footRoll]));}
  assert.equal(samples.size,clips.length,`${kind}の通常コンボに同じ動作が残る`);
 }
});

test('二刀流の片腕斬撃は反対の剣を構えに残し、上段・下段パンチの狙いを分ける',()=>{
 const attack={duration:1,elapsed:motionRhythm('dualSword').contactEnd};
 for(const [combo,guard]of [[0,'left'],[1,'right'],[3,'left'],[4,'right']]){
  const p=sampleMotion('dualSword',{...attack,combo}),armed=guard==='left'?'right':'left';assert(p[guard].position[2]<.20);assert(p[armed].position[2]>.30);
 }
 for(const frame of ['knight','panzer'])for(const [high,low,hand]of frame==='panzer'?[[0,2,'right'],[1,3,'left']]:[[0,2,'right']]){
  const at={duration:1,elapsed:motionRhythm('knuckle').contactEnd},context={legFrame:frame};assert(sampleMotion('knuckle',{...at,combo:high},context)[hand].position[1]-sampleMotion('knuckle',{...at,combo:low},context)[hand].position[1]>.10);
 }
});

test('左右連打の軌跡は振る側だけに付き、既存のチャージ動作を通常斬撃で置き換えない',()=>{
 for(const [kind,combo,left,frame='knight']of [['dualSword',0,false],['dualSword',1,true],['knuckle',0,false],['knuckle',3,null],['knuckle',3,true,'panzer']]){
  const b=battle(kind,frame),u=b.human,ref=createRobot(u.config,id=>CATALOG[id]),rhythm=motionRhythm(kind,{combo,legFrame:frame});ref.active=0;u.attack={weapon:kind,combo,legFrame:frame,duration:1,elapsed:rhythm.windup+.01};ArenaRenderer.prototype.animateRobot.call({},ref,u,1);u.attack.elapsed=Math.min(rhythm.contactEnd-.005,rhythm.windup+.06);ArenaRenderer.prototype.animateRobot.call({},ref,u,1.05);
  for(const trail of ref.weaponTrails)assert.equal(trail.samples.length>0,left===null?false:trail.weapon.parent===ref.arms[1].hand?left:!left);
 }
 for(const kind of ['dualSword','naginata','scythe']){
  const attack={combo:0,duration:1,elapsed:.5},normal=sampleMotion(kind,attack),charged=sampleMotion(kind,{...attack,charge:1});assert.notDeepEqual(normal.right,charged.right);assert.equal(charged.name,kind==='dualSword'?'overhead':'hammerSlam');
 }
});

test('両手武器の支持手の向きが柄に追従し、射撃反動が武器ごとに変わって構えへ戻る',()=>{
 for(const kind of ['hammer','naginata','scythe','rifle','sniper']){
  const b=battle(kind),u=b.human,ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;
  u.attack=WEAPONS[kind].ranged?null:{weapon:kind,combo:0,elapsed:.4,duration:1};u.motion=WEAPONS[kind].ranged?{weapon:kind,elapsed:.04,duration:.16}:null;ArenaRenderer.prototype.animateRobot.call({},ref,u,0);
  assert(ref.arms[0].hand.quaternion.angleTo(ref.arms[1].hand.quaternion)<1e-7,`${kind}: 支持手が柄の向きに追従する`);
 }
 const kicks={};
 for(const kind of ['pistol','machinegun','sniper','bazooka','dualGun']){
  const b=battle(kind),u=b.human,ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;ArenaRenderer.prototype.animateRobot.call({},ref,u,0);const base=ref.arms[0].hand.position.clone();
  u.motion={weapon:kind,elapsed:.24,duration:1};ArenaRenderer.prototype.animateRobot.call({},ref,u,0);kicks[kind]=ref.arms[0].hand.position.distanceTo(base);assert(kicks[kind]>.005);
  u.motion.elapsed=1;ArenaRenderer.prototype.animateRobot.call({},ref,u,0);assert(ref.arms[0].hand.position.distanceTo(base)<1e-8);
 }
 assert(kicks.sniper>kicks.machinegun*2);assert(kicks.bazooka>kicks.pistol);
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
 const b=battle(),u=b.human;contact(b);tap(b);b.meleeStep(u,u.attack.duration*.5);assert(u.comboHit);u.attack.elapsed=u.attack.duration-.20;b.runtime(u).cooldown=.22;u.actionTime=0;u.lastAttackHeld=true;u.charging=true;u.charge=0;b.consumeEvents();b.handleInput(u,{},1/60);assert(u.queuedAttack);advance(b,.24);assert.equal(u.combo,1);assert.equal(b.consumeEvents().filter(e=>e.type==='attack').length,1);
});

test('先行入力時は次段の構えへつなぎ、開始時に直前の全身姿勢を引き継ぐ',()=>{
 for(const kind of Object.keys(COMBO_CLIPS)){
  const b=battle(kind),u=b.human;contact(b);b.attack(u);b.meleeStep(u,u.attack.duration*.9);assert(u.comboHit);const before={...u.motion,elapsed:u.motion.duration};u.motion=before;u.attack=null;b.runtime(u).cooldown=0;u.actionTime=0;u.queuedAttack={charge:0,remaining:.1};
  const expected=sampleMotion(kind,before,{nextCombo:1});assert.notDeepEqual([expected.right,expected.left,expected.body],[sampleMotion(kind,null).right,sampleMotion(kind,null).left,sampleMotion(kind,null).body]);assert(b.attack(u));
  const actual=sampleMotion(kind,u.attack);for(const key of ['right','left','body','drop','shift','feet'])assert.deepEqual(actual[key],expected[key],`${kind}: ${key}の接続`);
  const settled=sampleMotion(kind,{...u.attack,elapsed:u.attack.duration});assert.deepEqual(settled.right,sampleMotion(kind,null).right);
 }
});
test('近接の踏み込みは少量で、壁と相手の手前で止まる',()=>{
 const run=b=>{const u=b.human;b.attack(u);for(let i=0;i<150&&u.attack;i++)b.meleeStep(u,1/120);};
 for(const kind of ['sword','knuckle','hammer','lance']){
  const free=battle(kind),u=free.human;u.x=0;u.z=0;u.yaw=0;free.entities[1].dead=true;u.target=null;run(free);assert(Math.abs(u.z-motionRhythm(kind).advance)<1e-6);assert.equal(u.x,0);
  const wall=battle(kind);Object.assign(wall.human,{x:0,z:-7.04,yaw:0,target:null});wall.entities[1].dead=true;run(wall);assert(wall.human.z<=-7.03);
  const near=battle(kind),a=near.human,v=near.entities[1];Object.assign(a,{x:0,z:0,yaw:0});Object.assign(v,{x:0,z:.65});a.target=v.id;run(near);assert(a.z<=v.z-.61+1e-8);
 }
});
test('全身の脚関節がつながり、待機・歩行・コンボで足が地面を突き抜けない',()=>{
 for(const kind of Object.keys(COMBO_CLIPS)){
  const b=battle(kind),u=b.human,ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;
  for(const combo of [-1,...COMBO_CLIPS[kind].map((_,i)=>i)])for(let i=0;i<=24;i++){
   u.attack=combo<0?null:{weapon:kind,combo,elapsed:i/24,duration:1};u.vx=combo<0?4:0;ArenaRenderer.prototype.animateRobot.call({},ref,u,i/24);ref.root.updateMatrixWorld(true);
   for(const leg of ref.feet){
    const knee=leg.upper.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.thigh,0)),ankle=leg.lower.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.shin,0));
    assert(knee.distanceTo(leg.knee.getWorldPosition(new THREE.Vector3()))<1e-8);assert(ankle.distanceTo(leg.foot.getWorldPosition(new THREE.Vector3()))<1e-8);
    assert(leg.foot.getWorldPosition(new THREE.Vector3()).y>=u.y+.032-1e-8,`${kind} ${combo} ${i}: 足が地面を突き抜ける`);
   }
  }
 }
});
test('コンボ終段の命中方向へ機体全体が倒れ、回復までポーズで時計が止まる',()=>{
 const b=battle('rapier'),u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0});Object.assign(v,{x:0,z:.8});u.target=v.id;for(let i=0;i<u.stats.weapon.combo-1;i++){assert(b.attack(u));advance(b,u.attack.duration+1/60);assert(u.comboHit);}assert(b.attack(u));advance(b,u.attack.duration*motionRhythm('rapier',u.attack).windup+1/60);assert(v.hitReaction);assert.equal(v.hitReaction.kind,'stagger');assert.equal(v.hitReaction.yaw,0);
 const ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;ArenaRenderer.prototype.animateRobot.call({},ref,v,b.time);assert(new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion).z>.01);
 const snapshot=JSON.stringify([v.hitReaction,v.knockdown,v.y]);b.paused=true;advance(b,.1);assert.equal(JSON.stringify([v.hitReaction,v.knockdown,v.y]),snapshot);b.paused=false;advance(b,2);assert.equal(v.hitReaction,null);assert.equal(v.knockdown,null);ArenaRenderer.prototype.animateRobot.call({},ref,v,b.time);assert(Math.abs(new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion).y-1)<1e-8);
});

test('パンチは足を入れ替えず反対の手を構えに残し、二足4段目だけ支持足でキックする',()=>{
 for(const frame of ['knight','strider','wild','brawler','panzer']){
  const context={legFrame:frame},base=sampleMotion('knuckle',null,context);
  for(const hand of ['right','left'])assert(base[hand].position[1]>=.66,'拳を肩・顎に近い高さへ構える');
  let bootHeight=0;
  for(let combo=0;combo<6;combo++)for(let i=0;i<=60;i++){
   const p=sampleMotion('knuckle',{combo,elapsed:i/60,duration:1},context),guard=p.strikingSide==='left'?'right':'left',kick=frame!=='panzer'&&combo===3;
   if(kick){
    assert.equal(p.name,'leftSideKick');assert.equal(p.strikingLimb,'leftFoot');bootHeight=Math.max(bootHeight,p.feet[1][1]);
    if(i/60<=.70){assert.deepEqual(p.feet[0],base.feet[0]);assert.equal(p.footStride[0],0,'接触と蹴り足の着地まで右足で支持する');}
    for(const hand of ['right','left'])assert(p[hand].position[2]<.20,'キック中に拳まで前方へ打ち出さない');
   }else {
    for(let foot=0;foot<2;foot++){assert.equal(p.feet[foot][0],base.feet[foot][0]);assert.equal(p.feet[foot][2],base.feet[foot][2]);assert(p.feet[foot][1]<=.043+1e-8);}
    // The spare hand may tuck slightly as the chest turns, while staying at
    // the cheek. It must never extend into a second simultaneous punch.
    assert(new THREE.Vector3(...p[guard].position).distanceTo(new THREE.Vector3(...base[guard].position))<.025);assert(p[guard].position[1]>=.73);assert(p[guard].position[2]<.20);
   }
  }
  if(frame!=='panzer')assert(bootHeight>.30,'二足4段目で実際に蹴り足を持ち上げる');else assert.equal(bootHeight,0);
 }
});
test('全近接の手首が回転の折り返しで飛ばず、突きは胴を直立させる',()=>{
 for(const [kind,clips]of Object.entries(COMBO_CLIPS))for(let combo=0;combo<clips.length;combo++)for(const hand of ['right','left']){
  let previous=null;
  for(let i=0;i<=240;i++){
   const p=sampleMotion(kind,{combo,elapsed:i/240,duration:1}),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p[hand].rotation));
   if(previous)assert(previous.angleTo(q)<.15,`${kind} ${combo} ${hand}: 手首の向きが飛ぶ`);previous=q;
   if(['rapier','lance'].includes(kind))assert(Math.abs(p.body[0])<.04,`${kind}: 突きで胴を倒しすぎる`);
  }
 }
});
