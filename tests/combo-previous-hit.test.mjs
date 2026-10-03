import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,WEAPONS} from '../src/data.js';

const melee=Object.entries(WEAPONS).filter(([,w])=>!w.ranged);
const rates=[30,60,120];
function battle(kind='sword'){
 const c=defaultConfig();c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:null}));c.passives=[];c.abilities=[];
 const b=new Battle({allies:[c],enemies:[c,c],setup:{allies:1,enemies:2,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
 b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
 b.ai=u=>({guard:!!u.testGuard});
 for(const [i,u]of b.entities.entries())Object.assign(u,{x:i*4,z:0,y:0,yaw:0,lp:100000});
 return b;
}
function ready(b,fps){
 const u=b.human;for(let i=0;i<fps*4&&(u.attack||b.runtime(u).cooldown>0||u.actionTime>0);i++)b.tick(1/fps);
 assert(!u.attack&&b.runtime(u).cooldown===0&&u.actionTime===0);
}
function cut(b,v,fps,charge=0,{guard=false,also=null,immune=null}={}){
 ready(b,fps);const u=b.human;
 for(const e of b.enemiesOf(u))Object.assign(e,{x:10,z:10,guard:false,testGuard:false});
 Object.assign(v,{x:u.x,z:u.z+.8,yaw:Math.PI,guard,testGuard:guard});
 if(guard)v.guardDur=100000;
 if(also)Object.assign(also,{x:u.x+.1,z:u.z+.8,yaw:Math.PI});
 if(immune){immune.human=true;b.training.invulnerable=true;}
 u.target=v.id;assert(b.attack(u,charge));const a=u.attack,lp=v.lp;
 for(let i=0;i<fps*4&&u.attack===a&&(also||v.lp===lp);i++)b.tick(1/fps);
 assert(v.lp<lp,`${a.weapon}/${a.combo}/${charge}: actual damage`);
 return a;
}
function upright(v,context){
 assert.equal(v.knockdown,null,context);assert(v.grounded,context);assert.equal(v.y,0,context);assert.equal(v.down,0,context);assert.equal(v.rise,0,context);assert(v.stun>0,context);
}

test('全9近接・30/60/120fps：古い段だけ命中した相手へ終段を当てても直前の段が別の相手なら吹き飛ばさない',()=>{
 for(const [kind,w]of melee)for(const fps of rates){
  const b=battle(kind),[u,v,other]=b.entities;
  for(let i=0;i<w.combo-1;i++)assert.equal(cut(b,i===0&&w.combo>2?v:other,fps).combo,i);
  const a=cut(b,v,fps),context=`${kind}/${fps}fps`;
  assert(a.finisher,context);assert.equal(a.combo,w.combo-1,context);upright(v,context);
  assert.equal(a.comboChain.hits.get(v.id),w.combo>2?0:undefined,context);
 }
});

test('全9近接・30/60/120fps：以前の段が別の相手でも直前の段と終段が同じ相手なら吹き飛ばす',()=>{
 for(const [kind,w]of melee)for(const fps of rates){
  const b=battle(kind),[u,v,other]=b.entities;
  for(let i=0;i<w.combo-1;i++)assert.equal(cut(b,i===w.combo-2?v:other,fps).combo,i);
  const a=cut(b,v,fps),context=`${kind}/${fps}fps`;
  assert(a.finisher,context);assert.equal(a.comboChain.hits.get(v.id),w.combo-2,context);assert.equal(v.knockdown?.phase,'air',context);assert(!v.grounded,context);assert(v.vy>0,context);
 }
});

test('直前の段のガード越しの実ダメージは吹き飛ばしを解放し、無敵への接触は古い命中を更新しない',()=>{
 for(const fps of rates){
  const guarded=battle(),[u,v,other]=guarded.entities;cut(guarded,other,fps);cut(guarded,other,fps);const preceding=cut(guarded,v,fps,0,{guard:true});
  assert.equal(preceding.combo,2);assert(guarded.events.some(e=>e.type==='hit'&&e.unit===v.id&&e.guard),'guard was active at the real preceding hit');assert.equal(preceding.comboChain.hits.get(v.id),2);cut(guarded,v,fps);assert.equal(v.knockdown?.phase,'air');

  const immuneBattle=battle(),[attacker,target,alternate]=immuneBattle.entities;
  cut(immuneBattle,target,fps);cut(immuneBattle,alternate,fps);const lp=target.lp;
  const beforeFinal=cut(immuneBattle,alternate,fps,0,{also:target,immune:target});
  assert.equal(beforeFinal.combo,2);assert(beforeFinal.hits.has(target.id),'the immune opponent was actually in the preceding swing');assert.equal(target.lp,lp);assert.equal(beforeFinal.comboChain.hits.get(target.id),0);
  target.human=false;immuneBattle.training.invulnerable=false;const final=cut(immuneBattle,target,fps);assert(final.finisher);upright(target,`zero damage/${fps}fps`);assert.equal(final.comboChain.hits.get(target.id),0);
 }
});

test('直前の一振りで複数の相手に実ダメージを与えた場合はどちらへの終段でも吹き飛ばせる',()=>{
 for(const fps of rates)for(const finishOther of [false,true]){
  const b=battle(),[u,v,other]=b.entities;cut(b,v,fps);cut(b,other,fps);const preceding=cut(b,v,fps,0,{also:other});
  assert.equal(preceding.combo,2);assert.equal(preceding.comboChain.hits.get(v.id),2);assert.equal(preceding.comboChain.hits.get(other.id),2);
  const victim=finishOther?other:v;cut(b,victim,fps);assert.equal(victim.knockdown?.phase,'air');
 }
});

test('全8非ソード近接・30/60/120fps：通常コンボ終段位置の弱・中・全チャージも単独の相手を吹き飛ばさない',()=>{
 for(const [kind,w]of melee.filter(([kind])=>kind!=='sword'))for(const fps of rates)for(const charge of [.16,.5,1]){
  const b=battle(kind),[u,v,other]=b.entities;
  for(let i=0;i<w.combo-1;i++)assert.equal(cut(b,other,fps).combo,i);
  ready(b,fps);for(const e of b.enemiesOf(u))Object.assign(e,{x:10,z:10});Object.assign(v,{x:u.x,z:u.z+.8});u.target=v.id;
  const before={x:v.x,z:v.z};assert(b.attack(u,charge));const a=u.attack,lp=v.lp;assert.equal(a.combo,w.combo-1);assert.equal(a.comboChain,null);
  for(let i=0;i<fps*4&&u.attack===a&&v.lp===lp;i++)b.meleeStep(u,1/fps);
  const context=`${kind}/${fps}fps/${charge}`;assert(v.lp<lp,context);upright(v,context);assert.deepEqual({x:v.x,z:v.z},before,context);
 }
});
