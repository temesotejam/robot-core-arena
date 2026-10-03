import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {CATALOG,WEAPONS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {STAGGER} from '../src/combat.js';
import * as THREE from '../vendor/three.module.min.js';
function duel(kind='sword',victim='sword'){
 const configs=[kind,victim].map(k=>{const c=defaultConfig();c.sets[0]={item:`weapon:${k}`,shield:null};c.passives=[];c.abilities=[];return c;});
 const b=new Battle({allies:[configs[0]],enemies:[configs[1]],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.infinite=true;b.training.freezeAI=true;
 b.entities.forEach((u,i)=>Object.assign(u,{x:0,z:i*.8,yaw:i?Math.PI:0,target:b.entities[1-i].id,lp:100000}));return b;
}
function packet(b,u,extra={}){return {id:`test:${b.serial++}`,weapon:u.stats.weapon.id,attackStats:u.stats,normal:true,coefficient:1,charge:0,finisher:false,exhausted:false,cPaid:new Set(),statusPaid:new Set(),freezeBoost:new Set(),...extra};}
test('全9近接の実際の各段で、途中は攻撃を維持し、終段だけのけぞりと中断が同時に起きる',()=>{
 for(const [kind,w]of Object.entries(WEAPONS).filter(([,w])=>!w.ranged))for(let stage=0;stage<w.combo;stage++){
  const b=duel(kind,'hammer'),[u,v]=b.entities;assert(b.attack(v));const interrupted=v.attack;v.queuedAttack={charge:0,remaining:.2};v.charging=true;v.charge=.5;
  u.combo=stage-1;u.comboWindow=stage?1:0;assert(b.attack(u));assert.equal(u.attack.combo,stage);b.meleeStep(u,u.attack.duration*.9);assert(u.dealt>0,`${kind}/${stage}: 命中`);
  const final=stage===w.combo-1;assert.equal(v.stun>0,final,`${kind}/${stage}: 怯み`);assert.equal(v.attack===null,final,`${kind}/${stage}: 中断`);assert.equal(v.hitReaction.kind,final?'stagger':'impact');
  if(final){assert.equal(v.hitReaction.duration,v.stun);assert.equal(v.queuedAttack,null);assert.equal(v.comboWindow,0);assert.equal(v.charging,false);assert.equal(v.down,0);}else{assert.equal(v.attack,interrupted);assert(v.queuedAttack);assert(v.charging);assert.equal(v.hitReaction.strength,0);}
 }
});
test('通常攻撃の途中を何度受けても、怯み・予約コンボの中断が発生しない',()=>{
 for(const kind of ['knuckle','dagger','rapier','dualSword','hammer']){const b=duel(kind),[u,v]=b.entities;b.attack(v);const a=v.attack;v.queuedAttack={charge:0,remaining:.2};for(let i=0;i<16;i++)b.hit(u,v,packet(b,u));assert.equal(v.attack,a);assert(v.queuedAttack);assert.equal(v.stun,0);assert.equal(v.hitReaction.strength,0);}
});
test('終段の怯み中の追撃はダメージのみ加え、のけぞりの時計を引き延ばさない',()=>{
 const b=duel(),[u,v]=b.entities;b.attack(v);b.hit(u,v,packet(b,u,{finisher:true}));b.tick(.04);const r=v.hitReaction,stun=v.stun,lp=v.lp;assert(r.elapsed>0);for(let i=0;i<5;i++)b.hit(u,v,packet(b,u));assert(v.lp<lp);assert.equal(v.hitReaction,r);assert.equal(v.stun,stun);
});
test('表示されたのけぞりと中断が一致し、ポーズ中は止まって、終了後に初段から再開できる',()=>{
 const b=duel(),[u,v]=b.entities,ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;b.attack(v);b.hit(u,v,packet(b,u));ArenaRenderer.prototype.animateRobot.call({},ref,v,0);assert(v.attack);assert.equal(v.hitReaction.strength,0);
 const comboChain={hits:new Set()};b.hit(u,v,packet(b,u,{comboChain}));b.hit(u,v,packet(b,u,{finisher:true,comboChain}));b.tick(STAGGER.duration/8);b.tick(STAGGER.duration/8);ArenaRenderer.prototype.animateRobot.call({},ref,v,b.time);assert.equal(v.attack,null);assert(new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion).y<.9);
 const before=JSON.stringify([v.stun,v.hitReaction,v.knockdown,v.y]);b.paused=true;b.tick(.04);assert.equal(JSON.stringify([v.stun,v.hitReaction,v.knockdown,v.y]),before);b.paused=false;for(let i=0;i<55&&v.knockdown;i++)b.tick(.04);assert.equal(v.knockdown,null);assert.equal(v.hitReaction,null);assert.equal(v.stun,0);assert(b.attack(v));assert.equal(v.combo,0);
});
test('終段をガードするとコンボを維持し、疲労攻撃は怯ませず、チャージは独立して怯ませる',()=>{
 const guard=duel(),[u,v]=guard.entities;v.guard=true;guard.hit(u,v,packet(guard,u,{finisher:true}));assert.equal(v.stun,0);assert.equal(v.hitReaction.kind,'guard');
 const tired=duel(),[a,c]=tired.entities;tired.hit(a,c,packet(tired,a,{finisher:true,exhausted:true}));assert.equal(c.stun,0);assert.equal(c.hitReaction.strength,0);
 const charge=duel(),[s,t]=charge.entities;charge.attack(t);charge.hit(s,t,packet(charge,s,{charge:1}));assert(t.stun>0);assert.equal(t.attack,null);assert.equal(t.hitReaction.kind,'stagger');
});
