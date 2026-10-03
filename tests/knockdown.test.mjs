import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/sim.js';
import {CATALOG,WEAPONS,FRAMES,PARTS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {KNOCKDOWN,STAGGER} from '../src/combat.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import * as THREE from '../vendor/three.module.min.js';

function duel(kind='sword',victim='sword',frame='knight'){
 const configs=[kind,victim].map(k=>{const c=defaultConfig();c.sets[0]={item:`weapon:${k}`,shield:null};c.passives=[];c.abilities=[`${k}:normal`];return c;});
 configs[1].armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const b=new Battle({allies:[configs[0]],enemies:[configs[1]],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;
 b.entities.forEach((u,i)=>Object.assign(u,{x:0,z:i*.8,yaw:i?Math.PI:0,target:b.entities[1-i].id,lp:100000,c:0}));return b;
}
function packet(b,u,extra={}){return {id:`test:${b.serial++}`,weapon:u.stats.weapon.id,attackStats:u.stats,normal:true,coefficient:1,charge:0,finisher:false,exhausted:false,cPaid:new Set(),statusPaid:new Set(),freezeBoost:new Set(),...extra};}
function launch(b,u=b.entities[0],v=b.entities[1]){const comboChain={hits:new Set()};b.hit(u,v,packet(b,u,{comboChain}));assert(b.hit(u,v,packet(b,u,{finisher:true,comboChain}))>0);assert.equal(v.knockdown.phase,'air');return v;}
function until(b,condition,fps=120){for(let i=0;i<fps*5&&!condition();i++)b.tick(1/fps);assert(condition(),'5秒以内に指定の状態へ進む');}
function shot(b,u,v,weapon='pistol'){
 const p=packet(b,u,{weapon}),s={owner:u.id,team:u.team,x:v.x,y:b.hitY(v),z:v.z-.65,vx:0,vy:0,vz:60,speed:60,range:20,travel:0,life:2,kind:weapon,target:v.id,packet:p,share:1,radius:.04,blast:0,homing:weapon==='missile'?2.5:0,visited:new Set(),group:p.id};
 return {s,p};
}
function bounds(ref){ref.root.updateMatrixWorld(true);const all=new THREE.Box3(),part=new THREE.Box3(),trails=new Set(ref.weaponTrails.map(t=>t.mesh));ref.root.traverse(o=>{if(!o.geometry||!o.visible||o===ref.ring||trails.has(o))return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();all.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));});return all;}
function draw(ref,u,time=0){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}

test('全9近接終段：30/60/120fpsで軽く浮き、着地後1秒転倒＋0.5秒起き上がってから無敵が終わる',()=>{
 assert(STAGGER.duration>=.5);
 for(const [kind,w]of Object.entries(WEAPONS).filter(([,w])=>!w.ranged))for(const fps of [30,60,120]){
  const b=duel(kind),[u,v]=b.entities;launch(b);const initialZ=v.z;let highest=0;
  while(v.knockdown.phase==='air'){assert(!b.invulnerable(v));assert(b.incapacitated(v));b.tick(1/fps);highest=Math.max(highest,v.y);}
  assert(highest>.18&&highest<.30,`${kind}/${fps}: 軽い打ち上げ`);assert.equal(v.down,1);assert(v.grounded);assert.equal(v.y,0);const landed=b.time,travel=v.z-initialZ;
  assert(travel>.45&&travel<(kind==='hammer'?1:.75),`${kind}/${fps}: 軽い吹き飛ばし ${travel}`);
  until(b,()=>v.knockdown.phase==='rise',fps);assert(Math.abs(b.time-landed-1)<=1/fps+1e-8);assert.equal(v.down,0);assert(b.invulnerable(v));
  until(b,()=>!v.knockdown,fps);assert(Math.abs(b.time-landed-1.5)<=1/fps+1e-8);assert(!b.invulnerable(v));assert(!b.incapacitated(v));assert(b.hit(u,v,packet(b,u))>0);
 }
});

test('空中追撃はダメージとCゲージを加え、再打ち上げや転倒時計の延長をしない',()=>{
 const b=duel(),[u,v]=b.entities;launch(b);for(let i=0;i<12&&v.knockdown.phase==='air';i++){
  b.tick(1/120);const snapshot=JSON.stringify([v.knockdown,v.vy,v.y]),lp=v.lp,c=u.c;
  const damage=b.hit(u,v,packet(b,u,{finisher:true,charge:1}));assert(damage>0);assert(v.lp<lp);assert.equal(u.c,Math.min(500,c+(10+damage*.6)*u.stats.output));assert.equal(JSON.stringify([v.knockdown,v.vy,v.y]),snapshot);
 }
 until(b,()=>v.grounded);assert.equal(v.down,1);until(b,()=>!v.knockdown);assert(b.time<2);
});

test('通常近接の実際の判定は空中に命中し、転倒・起き上がりではヒット済み扱いにもならない',()=>{
 for(const phase of ['air','down','rise']){
  const b=duel(),[u,v]=b.entities;launch(b);if(phase!=='air')until(b,()=>v.knockdown.phase===phase);
  Object.assign(u,{x:v.x,z:v.z-.8,yaw:0});assert(b.attack(u));const a=u.attack,lp=v.lp;b.meleeStep(u,a.duration*.9);
  assert.equal(v.lp<lp,phase==='air');assert.equal(a.hits.has(v.id),phase==='air');
 }
});

test('弾・誘導ミサイル・爆風・必殺技も空中には当たり、転倒と起き上がりには当たらない',()=>{
 for(const phase of ['air','down','rise'])for(const mode of ['pistol','missile','blast','skill']){
  const b=duel(),[u,v]=b.entities;launch(b);b.tick(1/120);if(phase!=='air')until(b,()=>v.knockdown.phase===phase);
  const lp=v.lp,c=u.c,received=v.received;let p;
  if(mode==='pistol'||mode==='missile'){const pair=shot(b,u,v,mode);p=pair.p;b.projectileStep(pair.s,1/60);assert.equal(pair.s.visited.has(v.id),phase==='air');}
  else if(mode==='blast'){p=packet(b,u,{weapon:'bazooka'});b.explode({owner:u.id,blast:2,packet:p,share:1,group:p.id},{x:v.x,y:b.hitY(v),z:v.z});}
  else {p=packet(b,u,{normal:false,budget:300,skill:'tech',status:'stun',finisher:true});b.hit(u,v,p);}
  assert.equal(v.lp<lp,phase==='air',`${phase}/${mode}`);assert.equal(p.cPaid.has(v.id),phase==='air');
  if(phase!=='air'){assert.equal(u.c,c);assert.equal(v.received,received);assert.equal(p.statusPaid.size,0);assert.equal(v.statusTime,0);}
 }
});

test('着地した瞬間から完全に立つまで攻撃・ジャンプ・ダッシュ・切替・必殺で無敵を解除できない',()=>{
 const b=duel(),[u,v]=b.entities;launch(b);v.c=500;
 for(const phase of ['air','down','rise']){
  until(b,()=>v.knockdown.phase===phase);const snapshot=JSON.stringify([v.x,v.z,v.y,v.vy,v.knockdown,v.c,v.active]);
  assert.equal(b.attack(v),false);assert.equal(b.jump(v),false);assert.equal(b.dash(v,1,0),false);assert.equal(b.switchWeapon(v),false);assert.equal(b.useSkill(v,'sword:normal'),false);
  b.handleInput(v,{x:1,z:1,attack:true,guard:true,jumpPressed:true,dashPressed:true,switchPressed:true},1/120);
  assert.equal(JSON.stringify([v.x,v.z,v.y,v.vy,v.knockdown,v.c,v.active]),snapshot);assert.equal(v.guard,false);assert.equal(v.charging,false);
 }
 until(b,()=>!v.knockdown);assert(b.attack(v));assert.equal(v.combo,0);
});

test('空中・転倒・起き上がりのポーズ中は位置・姿勢・回復時計が止まる',()=>{
 const b=duel(),v=launch(b),ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;
 for(const phase of ['air','down','rise']){
  until(b,()=>v.knockdown.phase===phase);draw(ref,v,b.time);const before=JSON.stringify([v.x,v.y,v.z,v.vy,v.knockdown,v.down,v.rise,ref.root.matrixWorld.elements]);b.paused=true;
  for(let i=0;i<60;i++)b.tick(1/60);draw(ref,v,b.time);assert.equal(JSON.stringify([v.x,v.y,v.z,v.vy,v.knockdown,v.down,v.rise,ref.root.matrixWorld.elements]),before);b.paused=false;
 }
});

test('高所から吹き飛ばしても着地まで追撃可能で、上段・斜面・壁・外周の接触を維持する',()=>{
 for(const ground of ['platform','ramp','wall','edge']){
  const b=duel(),[u,v]=b.entities;
  if(ground==='platform'){b.stage={...b.stage,obstacles:[{x:0,z:0,w:6,d:6,h:2}],ramps:[]};Object.assign(u,{y:2});Object.assign(v,{y:2});}
  if(ground==='ramp'){b.stage={...b.stage,obstacles:[],ramps:[{x:0,z:0,w:6,d:6,h:2,direction:1}]};u.y=b.groundAt(u.x,u.z);v.y=b.groundAt(v.x,v.z);}
  if(ground==='wall')b.stage={...b.stage,obstacles:[{x:0,z:1.35,w:3,d:.15,h:2}],ramps:[]};
  if(ground==='edge'){b.stage={...b.stage,depth:2};u.z=-.2;v.z=.6;}
  launch(b);until(b,()=>v.grounded);assert.equal(v.knockdown.phase,'down');assert.equal(v.down,1);assert(Math.abs(v.y-b.groundAt(v.x,v.z))<1e-8);assert(v.z<=b.stage.depth/2-.28+1e-8);
  if(ground==='wall')assert(v.z<=1.35-.075-.28+1e-8);
 }
 const b=duel(),[u,v]=b.entities;Object.assign(v,{y:3,vy:0,grounded:false});launch(b);const k=v.knockdown;assert.equal(v.vy,0);for(let i=0;i<45;i++){b.tick(1/120);assert.equal(v.knockdown,k);assert(!b.invulnerable(v));}assert(v.y>0);until(b,()=>v.grounded);assert.equal(v.down,1);
});

test('空中追撃で撃破した機体は着地しても復活せず、転倒中は他機の接触で押されない',()=>{
 const b=duel(),[u,v]=b.entities;launch(b);b.tick(.04);v.lp=1;assert.equal(b.hit(u,v,packet(b,u)),1);assert(v.dead);assert.equal(v.knockdown,null);for(let i=0;i<120;i++)b.tick(1/120);assert(v.grounded);assert.equal(v.y,0);assert(v.dead);assert.equal(v.lp,0);assert.equal(b.attack(v),false);
 const c=duel(),[a,t]=c.entities;launch(c);until(c,()=>t.grounded);Object.assign(a,{x:t.x+.01,z:t.z});const pos=[t.x,t.y,t.z];for(let i=0;i<60;i++)c.tick(1/120);assert.deepEqual([t.x,t.y,t.z],pos);
});

test('全5フレーム・19武器は機体全体を横に倒し、地面を貫かず、起き上がり完了で直立する',()=>{
 for(const frame of Object.keys(FRAMES))for(const kind of Object.keys(WEAPONS)){
  const b=duel('sword',kind,frame),v=launch(b),ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;until(b,()=>v.grounded);
  for(const away of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const elapsed of [0,.5,.99]){v.knockdown.away=away;v.knockdown.elapsed=elapsed;draw(ref,v);const up=new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion),bb=bounds(ref);assert(Math.abs(up.y)<1e-7,`${frame}/${kind}: 横たわる`);assert(bb.min.y>=v.y+.019,`${frame}/${kind}: 接地`);assert(ref.head.getWorldPosition(new THREE.Vector3()).y<v.y+.5,`${frame}/${kind}: 武器で持ち上がらない`);
   const normal=new THREE.Vector3(0,0,1).transformDirection(ref.ring.matrixWorld);assert(Math.abs(normal.y)>.999999,'チームリングは水平');
   for(const arm of ref.arms){assert(arm.hand.position.distanceTo(arm.lower.position.clone().add(new THREE.Vector3(0,-.195,0).applyQuaternion(arm.lower.quaternion)))<1e-7,'手と前腕がつながる');}
   if(ref.weaponAttachments[0].userData.supportGrip)assert(ref.arms[0].hand.quaternion.angleTo(ref.arms[1].hand.quaternion)<1e-7,'両手武器の握りを維持');
  }
  v.knockdown.phase='rise';let previous=-1;for(const elapsed of [0,.1,.25,.4,KNOCKDOWN.rise]){v.knockdown.elapsed=elapsed;draw(ref,v);const up=new THREE.Vector3(0,1,0).applyQuaternion(ref.root.quaternion);assert(up.y>=previous-1e-8);previous=up.y;assert(bounds(ref).min.y>=v.y+.019);}
  assert(Math.abs(previous-1)<1e-8);v.knockdown=null;v.down=0;v.rise=0;draw(ref,v);assert(ref.root.position.distanceTo(new THREE.Vector3(v.x,v.y,v.z))<1e-8);
 }
});

test('空中で体が倒れた時も射撃の狙いと被弾の中心は表示した体の高さに合う',()=>{
 const b=duel('rifle'),[u,v]=b.entities;b.launchDown(u,v);const ref=createRobot(v.config,id=>CATALOG[id]);ref.active=0;
 for(let i=0;i<32&&v.knockdown.phase==='air';i++){b.tick(1/120);draw(ref,v,b.time);const bb=bounds(ref),center=b.hitY(v);assert(center>=bb.min.y-.05&&center<=bb.max.y+.05,`被弾中心 ${center}: ${bb.min.y}〜${bb.max.y}`);}
});
