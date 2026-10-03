import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,WEAPONS} from '../src/data.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {STAGGER} from '../src/combat.js';
import * as THREE from '../vendor/three.module.min.js';

function battle(kind='sword',allies=1,enemies=2){
 const c=defaultConfig();c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:null}));c.passives=[];c.abilities=[`${kind}:buff`];
 const b=new Battle({allies:Array.from({length:allies},()=>c),enemies:Array.from({length:enemies},()=>c),setup:{allies,enemies,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
 for(const [i,u]of b.entities.entries())Object.assign(u,{x:i*3,z:0,y:0,yaw:0,lp:100000});b.human.x=0;return b;
}
function waitReady(b,u,fps=120){for(let i=0;i<fps*4&&(u.attack||b.runtime(u).cooldown>0||u.actionTime>0);i++)b.tick(1/fps);assert(!u.attack&&b.runtime(u).cooldown===0&&u.actionTime===0);}
function stage(b,u,v,hit=true,fps=120){
 waitReady(b,u,fps);for(const e of b.enemiesOf(u).filter(e=>e!==v))Object.assign(e,{x:10,z:10});Object.assign(v,{x:u.x,z:u.z+(hit?.8:8)});u.target=v.id;assert(b.attack(u));const a=u.attack,lp=v.lp;b.meleeStep(u,a.duration*.9);assert.equal(v.lp<lp,hit,`${a.weapon}/${a.combo}: ${hit?'命中':'空振り'}`);return a;
}
function toLast(b,u,v,fps=120){for(let i=0;i<u.stats.weapon.combo-1;i++){const a=stage(b,u,v,true,fps);assert.equal(a.combo,i);}}
function final(b,u,v,fps=120){const a=stage(b,u,v,true,fps);assert(a.finisher);return a;}

test('全9近接・30/60/120fps：別の相手への命中で派生し、終段だけ当たった相手は怯みのみで吹き飛ばない',()=>{
 for(const [kind]of Object.entries(WEAPONS).filter(([,w])=>!w.ranged))for(const fps of [30,60,120]){
  const b=battle(kind),u=b.human,[other,v]=b.entities.filter(v=>v.team);toLast(b,u,other,fps);waitReady(b,u,fps);Object.assign(v,{x:u.x,z:u.z+.8});const pos=[v.x,v.y,v.z,v.vy];assert(b.attack(v));v.queuedAttack={charge:0,remaining:.2};const lp=v.lp;
  const a=final(b,u,v,fps);assert(v.lp<lp);assert(!a.comboChain.hits.has(v.id));assert.equal(v.knockdown,null);assert.deepEqual([v.x,v.y,v.z,v.vy],pos);assert(v.grounded);assert.equal(v.down,0);assert.equal(v.rise,0);assert.equal(v.stun,STAGGER.duration);assert.equal(v.attack,null);assert.equal(v.queuedAttack,null);assert(!b.invulnerable(v));
  const ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;v.hitReaction.elapsed=STAGGER.duration/2;ArenaRenderer.prototype.animateRobot.call({},ref,v,b.time);assert(new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion).y>.999999);assert(Math.abs(ref.bodyPivot.rotation.x)+Math.abs(ref.bodyPivot.rotation.z)>.1);
 }
});

test('各途中段を誰かに当て、終段の相手に途中段が1回でも当たっていれば吹き飛ばす',()=>{
 for(const [kind,w]of Object.entries(WEAPONS).filter(([,w])=>!w.ranged))for(const first of [0,w.combo-2]){
  const b=battle(kind),u=b.human,[v,other]=b.entities.filter(v=>v.team);for(let i=0;i<w.combo-1;i++)stage(b,u,i===first?v:other);const a=final(b,u,v);assert(a.comboChain.hits.has(v.id));assert.equal(v.knockdown?.phase,'air',`${kind}/${first}`);assert(!v.grounded);assert(v.vy>0);
 }
});

test('途中段の空振りで段数と命中履歴が戻り、新しいコンボの終段だけでは古い相手を吹き飛ばさない',()=>{
 const b=battle(),u=b.human,[v,other]=b.entities.filter(v=>v.team);const first=stage(b,u,v);assert.equal(stage(b,u,v,false).combo,1);waitReady(b,u);assert.equal(u.comboChain,null);toLast(b,u,other);const a=final(b,u,v);assert.notEqual(a.comboChain,first.comboChain);assert(!a.comboChain.hits.has(v.id));assert.equal(v.knockdown,null);assert(v.stun>0);
});

test('3対3で他の味方が途中段を当てても、自分の終段だけでは吹き飛ばない',()=>{
 const b=battle('sword',3,3),u=b.human,ally=b.entities[1],[v,other]=b.entities.filter(v=>v.team);for(const e of b.entities.filter(e=>!e.team&&e!==u&&e!==ally))Object.assign(e,{x:-10,z:-10});
 toLast(b,u,other);stage(b,ally,v);Object.assign(ally,{x:-10,z:-10});const a=final(b,u,v);assert(!a.comboChain.hits.has(v.id));assert.equal(v.knockdown,null);assert(v.stun>0);
});

test('コンボの時間切れと終段後の初段で、前のコンボの命中を持ち越さない',()=>{
 for(const mode of ['timeout','wrap']){
  const b=battle(),u=b.human,[v,other]=b.entities.filter(v=>v.team);const chain=stage(b,u,v).comboChain;
  if(mode==='timeout'){for(let i=0;i<180;i++)b.tick(1/120);assert.equal(u.comboChain,null);}else{for(let i=1;i<u.stats.weapon.combo-1;i++)stage(b,u,v);final(b,u,other);}
  toLast(b,u,other);const a=final(b,u,v);assert.notEqual(a.comboChain,chain);assert(!a.comboChain.hits.has(v.id));assert.equal(v.knockdown,null);assert(v.stun>0);
 }
});

test('被弾中断・行動不能・同じ武器への切替・チャージ・必殺技の後は初段から命中を取り直す',()=>{
 for(const mode of ['interrupt','disabled','switch','charge','skill']){
  const b=battle(),u=b.human,[v,other]=b.entities.filter(v=>v.team);stage(b,u,v);waitReady(b,u);const chain=u.comboChain;
  if(mode==='interrupt')b.flinch(v,u);
  if(mode==='disabled'){u.guardBreak=.08;b.tick(1/120);}
  if(mode==='switch'){assert(b.switchWeapon(u));for(let i=0;i<32;i++)b.tick(1/120);assert.equal(u.active,1);}
  if(mode==='charge'){Object.assign(v,{x:10,z:10});u.target=v.id;assert(b.attack(u,1));waitReady(b,u);}
  if(mode==='skill'){assert(b.useSkill(u,'sword:buff'));for(let i=0;i<24;i++)b.tick(1/120);}
  for(let i=0;i<240&&b.incapacitated(u);i++)b.tick(1/120);assert(!u.comboHit);toLast(b,u,other);const a=final(b,u,v);assert.notEqual(a.comboChain,chain);assert(!a.comboChain.hits.has(v.id));assert.equal(v.knockdown,null,mode);assert(v.stun>0);
 }
});

test('無敵への空振りは派生せず、復帰後の単独終段の追撃でも怯みを延長しない',()=>{
 const b=battle(),u=b.human,[v,other]=b.entities.filter(v=>v.team);b.knockDown(v);Object.assign(v,{x:u.x,z:u.z+.8});assert(b.attack(u));const a=u.attack,lp=v.lp;b.meleeStep(u,a.duration*.9);assert.equal(v.lp,lp);assert.equal(a.comboChain.hits.size,0);assert(!u.comboHit);
 for(let i=0;i<240;i++)b.tick(1/120);toLast(b,u,other);const end=final(b,u,v);assert.equal(v.knockdown,null);b.tick(.04);const stun=v.stun,reaction=v.hitReaction,packet={...end,id:'second-last',hits:new Set(),cPaid:new Set(),statusPaid:new Set()};assert(b.hit(u,v,packet)>0);assert.equal(v.stun,stun);assert.equal(v.hitReaction,reaction);
});
