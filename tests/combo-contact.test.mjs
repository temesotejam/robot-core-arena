import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,WEAPONS} from '../src/data.js';
import {nextCombo} from '../src/combat.js';
import {sampleMotion} from '../src/motion.js';
const kinds=Object.values(WEAPONS).filter(w=>!w.ranged).map(w=>w.id);
function battle(kind='sword'){
 const c=defaultConfig();c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:null}));c.passives=[];c.abilities=[`${kind}:buff`];
 const b=new Battle({allies:[c],enemies:[c],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
 const [u,v]=b.entities;Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:.8,yaw:Math.PI,lp:100000});return b;
}
function ready(b,fps=120){const u=b.human;for(let i=0;i<fps*4&&(u.attack||b.runtime(u).cooldown>0||u.actionTime>0);i++)b.tick(1/fps);assert(!u.attack&&b.runtime(u).cooldown===0&&u.actionTime===0);}
function cut(b,hit=true,fps=120){ready(b,fps);const [u,v]=b.entities;Object.assign(v,{x:u.x,z:u.z+(hit?.8:8)});assert(b.attack(u));const a=u.attack,lp=v.lp;b.meleeStep(u,a.duration*.9);assert.equal(v.lp<lp,hit);return a;}
function tap(b,input={}){b.tick(1/120,{attack:true});b.tick(1/120,input);}

test('全9近接・30/60/120fps：直前の段を外すと次は初段、以前の命中で2段・3段へ進まない',()=>{
 for(const kind of kinds)for(const fps of [30,60,120])for(let miss=0;miss<WEAPONS[kind].combo;miss++){
  const b=battle(kind),u=b.human;for(let i=0;i<miss;i++){const a=cut(b,true,fps);assert.equal(a.combo,i);assert(u.comboHit);}
  const a=cut(b,false,fps),old=a.comboChain;assert.equal(a.combo,miss);assert(!u.comboHit);assert.equal(nextCombo(u),0);ready(b,fps);assert.equal(u.comboWindow,0);assert.equal(u.comboChain,null);
  const restart=cut(b,true,fps);assert.equal(restart.combo,0);assert(!restart.finisher);assert.notEqual(restart.comboChain,old);
 }
});

test('全9近接：命中した一段だけが派生を解放し、次段を出した瞬間に命中判定をやり直す',()=>{
 for(const kind of kinds){const b=battle(kind),u=b.human;cut(b);assert.equal(nextCombo(u),1);ready(b);assert(b.attack(u));assert.equal(u.combo,1);assert.equal(u.comboHit,false);assert.equal(nextCombo(u),0);}
});

test('空振りの先行入力は捨てずに初段として実行し、実行時の前入力も維持する',()=>{
 for(const z of [0,1]){const b=battle(),u=b.human,v=b.entities[1];v.z=8;tap(b);const first=u.attack.id;while(b.runtime(u).cooldown>.16)b.tick(1/120);tap(b,{z});assert(u.queuedAttack);assert.equal(nextCombo(u,u.queuedAttack.charge),0);
  for(let i=0;i<100&&(!u.attack||u.attack.id===first);i++)b.tick(1/120);assert(u.attack&&u.attack.id!==first);assert.equal(u.attack.combo,0);assert.equal(!!u.attack.approach,z===1);assert.equal(u.queuedAttack,null);
 }
});

test('先行入力の後でも斬撃中に命中すれば次段へ進み、入力時に空振りを確定しない',()=>{
 const b=battle('rapier'),u=b.human,v=b.entities[1];v.z=8;tap(b);while(b.runtime(u).cooldown>.22)b.tick(1/120);tap(b);assert(u.queuedAttack);assert.equal(nextCombo(u),0);
 Object.assign(v,{x:u.x,z:u.z+.8});b.meleeStep(u,1/120);assert(u.comboHit);assert.equal(nextCombo(u),1);const first=u.attack.id;
 for(let i=0;i<100&&(!u.attack||u.attack.id===first);i++)b.tick(1/120);assert(u.attack&&u.attack.id!==first);assert.equal(u.attack.combo,1);
});

test('全9近接：空振りの予約姿勢と次の初段の全身姿勢が一致する',()=>{
 for(const kind of kinds){const b=battle(kind),u=b.human;const a=cut(b,false);ready(b);const before={...a,elapsed:a.duration};u.motion=before;u.queuedAttack={charge:0,remaining:.1,input:{}};const expected=sampleMotion(kind,before,{nextCombo:0});assert(b.attack(u));assert.equal(u.combo,0);const actual=sampleMotion(kind,u.attack);
  for(const key of ['joints','right','left','body','drop','shift','feet'])assert.deepEqual(actual[key],expected[key],`${kind}: ${key}`);
 }
});

test('ガード越しのダメージは派生でき、転倒・起き上がり・訓練無敵への接触は派生できない',()=>{
 const guarded=battle();guarded.entities[1].guard=true;const a=cut(guarded);assert(guarded.human.comboHit);assert.equal(nextCombo(guarded.human),1);assert(a.comboChain.hits.has(guarded.entities[1].id));
 for(const mode of ['down','rise','training']){const b=battle(),[u,v]=b.entities;if(mode==='training'){v.human=true;b.training.invulnerable=true;}else{b.knockDown(v);if(mode==='rise'){v.knockdown.phase='rise';v.knockdown.elapsed=0;v.down=0;v.rise=.5;}}
  assert(b.attack(u));const attack=u.attack,lp=v.lp;b.meleeStep(u,attack.duration*.9);assert.equal(v.lp,lp);assert(!u.comboHit);assert.equal(nextCombo(u),0);assert.equal(attack.comboChain.hits.size,0);
 }
});

test('チャージと必殺技の命中は通常コンボの次段を解放せず、次の短押しは初段',()=>{
 for(const mode of ['charge','skill']){const b=battle(),u=b.human;cut(b);ready(b);if(mode==='charge')assert(b.attack(u,1));else{u.config.abilities=['sword:normal'];u.c=500;assert(b.useSkill(u,'sword:normal'));}
  const attack=u.attack,lp=b.entities[1].lp;b.meleeStep(u,attack.duration*1.1-attack.elapsed);assert(b.entities[1].lp<lp);assert(!u.comboHit);assert.equal(nextCombo(u),0);ready(b);assert(b.attack(u));assert.equal(u.combo,0);
 }
});

test('相手を倒した命中も派生でき、失敗した攻撃開始は直前の命中を消さない',()=>{
 const b=battle(),[u,v]=b.entities;v.lp=1;assert(b.attack(u));b.meleeStep(u,u.attack.duration*.9);assert(v.dead&&u.comboHit);assert.equal(nextCombo(u),1);assert.equal(b.attack(u),false);assert(u.comboHit);ready(b);assert(b.attack(u));assert.equal(u.combo,1);
});
