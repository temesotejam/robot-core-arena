import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,damageValue} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG} from '../src/data.js';
import {POISE,INTERRUPT_RECOVERY,poiseActive} from '../src/combat.js';
import {motionRhythm} from '../src/motion.js';
function duel(a='hammer',b='knuckle'){
 const configs=[a,b].map(kind=>{const c=defaultConfig();c.passives=[];c.abilities=[];c.sets[0]={item:`weapon:${kind}`,shield:null};return c;});
 const battle=new Battle({allies:[configs[0]],enemies:[configs[1]],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});battle.countdown=0;battle.training.infinite=true;battle.ai=()=>({});
 battle.entities.forEach((u,i)=>Object.assign(u,{x:0,z:i*.8,yaw:i?Math.PI:0,target:battle.entities[1-i].id,lp:10000}));return battle;
}
function packet(b,u,extra={}){return {id:`test:${b.serial++}`,weapon:u.stats.weapon.id,attackStats:u.stats,normal:true,coefficient:1,charge:0,finisher:false,exhausted:false,cPaid:new Set(),statusPaid:new Set(),freezeBoost:new Set(),...extra};}
function committed(b,u){assert(b.attack(u));u.attack.elapsed=.1;u.motion.elapsed=.1;return u.attack;}
test('遅い近接4種は軽い4種の連打に攻撃を返せる：処理順・60/120fps・先手を変えて検証',()=>{
 for(const heavy of Object.keys(POISE))for(const light of ['knuckle','dagger','rapier','dualSword'])for(const reverse of [false,true])for(const fps of [60,120])for(const delay of [-.1,0,.1]){
  const b=reverse?duel(light,heavy):duel(heavy,light),h=b.entities.find(u=>u.stats.weapon.id===heavy),l=b.entities.find(u=>u.stats.weapon.id===light);let braces=0;
  // Finishers now create distance. Both fighters pursue before their next exchange.
  const pursue=u=>{const v=b.entities.find(v=>v!==u),d=Math.hypot(v.x-u.x,v.z-u.z);return d>.8?{x:(v.x-u.x)/d,z:(v.z-u.z)/d}:{};};b.ai=pursue;
  // Include several full recoveries, and do not waste combos on a protected target.
  for(let i=0;i<fps*10;i++){if(i/fps>=Math.max(0,-delay)&&!b.invulnerable(h))b.attack(l);if(i/fps>=Math.max(0,delay)&&!b.invulnerable(l))b.attack(h);b.tick(1/fps,pursue(b.human));braces+=b.consumeEvents().filter(e=>e.type==='brace').length;}
  const label=`${heavy}/${light} reverse=${reverse} fps=${fps} delay=${delay}`;
  assert(h.dealt>300,`${label}: 遅い武器の攻撃が封じられる`);assert(l.dealt>200,`${label}: 軽い武器も攻撃できる`);assert(braces>0,label);
 }
});
test('踏ん張り中も全ダメージを受けるが、残量が尽きてもコンボ途中では中断しない',()=>{
 const b=duel(),[h,l]=b.entities,a=committed(b,h),before=h.lp;const expected=Math.round(damageValue(l.stats.at,1,h.stats.df));
 b.hit(l,h,packet(b,l));assert.equal(before-h.lp,expected);assert.equal(h.attack,a);assert.equal(h.stun,0);assert(a.poise.remaining<a.poise.max);
 for(let i=0;i<10;i++)b.hit(l,h,packet(b,l));assert.equal(a.poise.remaining,0);assert.equal(h.attack,a);assert.equal(h.stun,0);b.hit(l,h,packet(b,l,{finisher:true}));assert.equal(h.attack,null);assert(h.stun>0);assert.equal(h.hitReaction.kind,'stagger');assert.equal(b.runtime(h).cooldown,INTERRUPT_RECOVERY);
});
test('出始め・戻し・疲労・チャージ待機でも途中の一撃では止めず、終段・技・爆発で崩せる',()=>{
 for(const mode of ['startup','recovery','exhausted','charging','finisher','skill','bazooka']){
  const b=duel('hammer',mode==='bazooka'?'bazooka':'knuckle'),[h,l]=b.entities;committed(b,h);let extra={};
  if(mode==='startup')h.attack.elapsed=.01;
  if(mode==='recovery')h.attack.elapsed=h.attack.duration*(motionRhythm('hammer').contactEnd+.1);
  if(mode==='exhausted')h.attack.exhausted=true;
  if(mode==='charging'){h.attack=null;h.motion=null;h.charging=true;}
  if(mode==='finisher')extra.finisher=true;
  if(mode==='skill')extra={normal:false,budget:100,finisher:true,skill:'normal'};
  b.hit(l,h,packet(b,l,extra));if(['startup','recovery','exhausted','charging'].includes(mode)){assert.equal(h.stun,0,mode);if(mode==='charging')assert(h.charging);else assert(h.attack);b.hit(l,h,packet(b,l,{finisher:true}));}assert.equal(h.attack,null,mode);assert(h.stun>0||h.down>0||!h.grounded,mode);
 }
 const b=duel(),h=b.human;h.exhausted=true;b.attack(h);assert.equal(h.attack.poise,null);
});
test('中断した近接は怯み後に再試行でき、予約・チャージを消し、消費したテンションは返さない',()=>{
 const b=duel(),[h,l]=b.entities;b.training.infinite=false;committed(b,h);h.attack.elapsed=.01;h.queuedAttack={charge:0,remaining:.2};h.charging=true;h.charge=.5;const spent=h.tension;
 b.hit(l,h,packet(b,l,{finisher:true}));assert.equal(h.motion,null);assert.equal(h.queuedAttack,null);assert.equal(h.charge,0);assert.equal(h.charging,false);assert.equal(h.tension,spent);assert.equal(b.attack(h),false);
 for(let i=0;i<240&&h.knockdown;i++){assert.equal(b.attack(h),false);b.tick(1/120);}assert.equal(h.knockdown,null);assert(b.attack(h));assert.equal(h.combo,0);
});
test('射撃への被弾で発射待ちや弾数をリセットしない',()=>{
 const b=duel('sniper','knuckle'),[r,l]=b.entities;b.attack(r);const rt=b.runtime(r),cooldown=rt.cooldown,ammo=rt.ammo;b.hit(l,r,packet(b,l));assert.equal(rt.cooldown,cooldown);assert.equal(rt.ammo,ammo);assert.equal(b.attack(r),false);
});
test('連射弾も踏ん張りを削り、特殊な状態異常とハンマー強化は既存どおり作用する',()=>{
 const stream=duel('hammer','machinegun'),[h,g]=stream.entities;const a=committed(stream,h);stream.hit(g,h,packet(stream,g));assert(h.attack);for(let i=0;i<10;i++)stream.hit(g,h,packet(stream,g));assert.equal(a.poise.remaining,0);assert.equal(h.attack,a);assert.equal(h.stun,0);
 const status=duel(),[s,l]=status.entities;committed(status,s);status.rng=()=>0;status.hit(l,s,packet(status,l,{status:'stun'}));assert(s.statusTime>0);status.tick(1/120);assert.equal(s.attack,null);assert.equal(s.motion,null);
 const buff=duel(),[v,k]=buff.entities;committed(buff,v);v.buff={weapon:'hammer'};v.buffTime=5;buff.hit(k,v,packet(buff,k,{finisher:true}));assert(v.attack);assert.equal(v.down,0);
});
test('ポーズ中は踏ん張りの時間と残量を止める',()=>{
 const b=duel(),h=b.human;committed(b,h);assert(poiseActive(h.attack));const before=JSON.stringify(h.attack);b.paused=true;b.tick(.04);assert.equal(JSON.stringify(h.attack),before);
});
