import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,damageValue} from '../src/sim.js';
import {aggregate,cost,defaultConfig,weaponAttack} from '../src/customize.js';
import {CATALOG,STAGES,WEAPONS} from '../src/data.js';
import {GROUND_WALK_FACTOR} from '../src/locomotion.js';

const ranged=Object.entries(WEAPONS).filter(([,w])=>w.ranged);
const rates=[30,60,120];
const get=id=>CATALOG[id];
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);
function config(kind,{passives=[],difficulty='hard'}={}){
 const c=defaultConfig();c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:null}));c.passives=passives;c.abilities=[];c.style='ranged';c.difficulty=difficulty;return c;
}
function duel(kind,{passives=[],rng=()=>.5,cpu=false}={}){
 const shooter=config(kind,{passives}),target=config('sword'),b=new Battle({allies:[cpu?target:shooter],enemies:[cpu?shooter:target],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true,coordination:'spread'},getItem:get,rng});
 b.countdown=0;b.training.freezeAI=!cpu;b.stage={...b.stage,obstacles:[],ramps:[],width:120,depth:120};
 const u=b.entities[cpu?1:0],v=b.entities[cpu?0:1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:kind==='sniper'?20:kind==='rifle'?16:2,yaw:Math.PI,lp:100000});
 if(cpu){const ai=b.ai.bind(b);b.ai=(entity,dt)=>{const input=ai(entity,dt);return {...input,x:0,z:0};};}
 return {b,u,v};
}
function tickUntil(b,predicate,fps,seconds=4){for(let i=0;i<fps*seconds&&!predicate();i++)b.tick(1/fps);assert(predicate(),'required state was not reached');}

test('射撃10種の表示AT・旧ドロップ武器に共通の60%補正を適用し、近接と狙撃クリティカルを維持する',()=>{
 for(const [kind,w]of Object.entries(WEAPONS)){
  const item=CATALOG[`weapon:${kind}`],c=config(kind),expected=w.at*(w.ranged?.60:1);
  close(weaponAttack(item),expected,`${kind} basic item display`);
  close(aggregate(c,get).at,expected*1.06,`${kind} equipped AT with general CPU`);
  const loot={...item,id:`loot:legacy:${kind}`,at:w.at*1.3,basic:false},lookup=id=>id===loot.id?loot:get(id);c.sets[0].item=loot.id;
  close(weaponAttack(loot),expected*1.3,`${kind} legacy item display`);
  close(aggregate(c,lookup).at,expected*1.3*1.06,`${kind} legacy equipped AT`);
  assert.equal(item.at,w.at,'the raw saved/catalog item must not be migrated or compounded');
 }
 assert.equal(aggregate(config('sniper'),get).crit,.5);
 assert.equal(aggregate(config('sniper',{passives:['critical']}),get).crit,1);
 for(const kind of ['sword','hammer','lance'])assert.equal(aggregate(config(kind),get).crit,WEAPONS[kind].crit);
});

test('射撃10種の実弾と必殺の総LPダメージは装備ATに対応し、散弾・連射へ予算を重複配分しない',()=>{
 for(const [kind,w]of ranged)for(const special of [false,true]){
  const {b,u,v}=duel(kind,{passives:['critical']}),before=v.lp;
  if(special){u.config.abilities=[`${kind}:normal`];u.c=100;assert(b.useSkill(u,`${kind}:normal`));}
  else {assert(b.attack(u));close(100-u.tension,w.tension,`${kind}: ordinary shot cost`);}
  for(let i=0;i<360;i++)b.tick(1/120);
  const hits=b.events.filter(e=>e.type==='hit'&&e.attacker===u.id);assert(hits.length>0,`${kind} ${special}: no real hit`);
  const fullAT=special?100*3*(u.stats.at/w.at):u.stats.at,expected=damageValue(fullAT,1,v.stats.df,.5<u.stats.crit),actual=before-v.lp;
  assert(Math.abs(actual-expected)<=hits.length*.5+1e-7,`${kind} ${special}: ${actual} instead of total budget ${expected}`);
  close(u.dealt,actual,`${kind} damage accounting`);
  assert.equal(hits.reduce((sum,e)=>sum+e.damage,0),actual);
  if(special)assert.equal(u.c,0,`${kind}: skills must not refund their C cost through normal-hit bonuses`);
 }
});

test('全射撃・30/60/120fps：疲労中は無料射撃も弾消費も発生せず25まで回復してから有料で再開する',()=>{
 for(const [kind,w]of ranged)for(const fps of rates){
  const {b,u}=duel(kind),rt=b.runtime(u);Object.assign(u,{tension:0,exhausted:true,regenWait:.4});
  for(let i=0;i<fps*3&&u.exhausted;i++){
   const ammo=rt.ammo,reserve=u.tension,wait=u.regenWait,shots=b.projectiles.length;
   assert.equal(b.attack(u),false,`${kind}/${fps}: exhausted shot`);
   assert.equal(rt.ammo,ammo);assert.equal(b.projectiles.length,shots);assert.equal(u.tension,reserve);assert.equal(u.regenWait,wait);
   b.tick(1/fps);
  }
  assert.equal(u.exhausted,false);assert(u.tension>=25);
  assert(!b.events.some(e=>e.type==='attack'));
  const reserve=u.tension,ammo=rt.ammo;assert(b.attack(u));close(reserve-u.tension,w.tension,`${kind}/${fps}: paid restart`);assert.equal(rt.ammo,ammo-1);
  const {b:low,u:poor}=duel(kind);poor.tension=w.tension/2;assert.equal(low.attack(poor),false);assert.equal(low.runtime(poor).ammo,w.clip);
 }
 const {b,u}=duel('sword');Object.assign(u,{tension:0,exhausted:true,regenWait:1});assert(b.attack(u));close(u.attack.coefficient,.7,'fatigued melee weak attack');assert.equal(u.attack.poise,null);assert.equal(u.tension,0);
});

function travel(kind,state,input,yaw,fps){
 const {b,u,v}=duel(kind);Object.assign(u,{yaw,target:v.id});Object.assign(v,{x:Math.sin(yaw)*40,z:Math.cos(yaw)*40});
 if(state==='cooldown')b.runtime(u).cooldown=1;
 if(state==='action')u.actionTime=.3;
 if(state==='charging'){u.charging=true;u.charge=.1;input={...input,attack:true};}
 if(state==='dash'){u.dashTime=.2;u.dashX=input.x;u.dashZ=input.z;}
 b.tick(1/fps,input);return Math.hypot(u.x,u.z)*fps;
}
test('射撃中の後退60%・横移動85%を全方向で実移動へ適用し、通常歩行とダッシュは変えない',()=>{
 for(const [kind]of ranged)for(const fps of rates)for(const yaw of [0,.7,-1.2,Math.PI]){
  const stats=aggregate(config(kind),get),walk=stats.move*GROUND_WALK_FACTOR;
  for(const direction of [-1,0,1]){
   const a=yaw+(direction===0?Math.PI/2:direction<0?Math.PI:0),input={x:Math.sin(a),z:Math.cos(a)};
   close(travel(kind,'idle',input,yaw,fps),walk,`${kind}/${fps}: idle walking`);
   close(travel(kind,'cooldown',input,yaw,fps),walk*(direction<0?.6:direction===0?.85:1),`${kind}/${fps}: firing recovery movement`);
   const stopped=['sniper','bazooka','missile'].includes(kind),actionFactor=kind==='assault'?.85:1;
   close(travel(kind,'action',input,yaw,fps),stopped?0:walk*actionFactor*(direction<0?.6:direction===0?.85:1),`${kind}/${fps}: firing action movement`);
   if(!WEAPONS[kind].automatic)close(travel(kind,'charging',input,yaw,fps),walk*(direction<0?.6:direction===0?.85:1),`${kind}/${fps}: charge movement`);
   close(travel(kind,'dash',input,yaw,fps),stats.dash,`${kind}/${fps}: boost movement`);
  }
 }
 const idle=travel('sword','idle',{x:1,z:0},0,120),recover=travel('sword','cooldown',{x:1,z:0},0,120);close(recover,idle,'melee cooldown walking unchanged');
 const forward=travel('pistol','cooldown',{x:Math.SQRT1_2,z:Math.SQRT1_2},0,120),back=travel('pistol','cooldown',{x:Math.SQRT1_2,z:-Math.SQRT1_2},0,120),walk=aggregate(config('pistol'),get).move*GROUND_WALK_FACTOR;
 assert(forward>walk*.85&&forward<walk);assert(back>walk*.6&&back<walk*.85);
 const delta=.00001,side=travel('pistol','cooldown',{x:1,z:0},0,120),sideForward=travel('pistol','cooldown',{x:Math.cos(delta),z:Math.sin(delta)},0,120),sideBack=travel('pistol','cooldown',{x:Math.cos(delta),z:-Math.sin(delta)},0,120);
 assert(Math.abs(sideForward-side)<walk*.00001);assert(Math.abs(sideBack-side)<walk*.00001,'diagonal penalty must be continuous at sideways movement');
});

test('hard CPUの狙撃・両手単発は短縮スキルと自強化を含む実際の溜め時間を支払い、能力で横取りしない',()=>{
 for(const kind of ['sniper','rifle'])for(const fps of rates)for(const fast of [false,true])for(const buff of [false,true]){
  const {b,u}=duel(kind,{cpu:true,passives:fast?['charge']:[]});if(buff){u.buff={weapon:kind};u.buffTime=10;}
  u.c=500;u.config.abilities=[`${kind}:normal`,`${kind}:buff`];const needed=b.maxCharge(u)*.65,initial=u.tension,ammo=b.runtime(u).ammo;
  let started=null,attack=null;
  for(let i=0;i<fps*3&&!attack;i++){
   b.tick(1/fps);
   if(u.charging&&started===null)started=b.time-1/fps;
   const events=b.consumeEvents();assert(!events.some(e=>e.unit===u.id&&['special','buff'].includes(e.type)),`${kind}/${fps}: ability interrupted charge`);
   attack=events.find(e=>e.unit===u.id&&e.type==='attack');
   if(!attack){assert.equal(b.runtime(u).ammo,ammo);assert.equal(u.tension,initial,'holding itself must not pay the shot');}
  }
  assert(attack&&started!==null,`${kind}/${fps}: failed to release a real charge`);
  assert(attack.time-started>=needed-1e-7,`${kind}/${fps}: skipped ${needed}s charge`);
  assert(attack.time-started<=needed+2/fps+1e-7,`${kind}/${fps}: held beyond intended window`);
  assert(attack.charge>=.65-1e-7&&attack.charge<=.65+1/(fps*b.maxCharge(u))+1e-7);
  close(initial-u.tension,WEAPONS[kind].tension*(1+.6*attack.charge),`${kind}/${fps}: charge cost`);assert.equal(b.runtime(u).ammo,ammo-1);
 }
});

test('狙撃CPUは27.8の正確な残量で65%チャージを支払え、40msでも溜めを飛ばしたり過消費しない',()=>{
 for(const fps of [25,...rates])for(const fast of [false,true])for(const buff of [false,true]){
  const {b,u}=duel('sniper',{cpu:true,passives:fast?['charge']:[]});if(buff){u.buff={weapon:'sniper'};u.buffTime=10;}
  Object.assign(u,{tension:27.8,regenWait:10});const needed=b.maxCharge(u)*.65,ammo=b.runtime(u).ammo;let started=null,attack=null;
  for(let i=0;i<fps*2&&!attack;i++){
   b.tick(1/fps);if(u.charging&&started===null)started=b.time-1/fps;attack=b.consumeEvents().find(e=>e.type==='attack'&&e.unit===u.id);
   if(!attack){assert.equal(b.runtime(u).ammo,ammo);close(u.tension,27.8,'holding cannot borrow regeneration to make its shot affordable');}
  }
  assert(attack&&started!==null,`${fps}/${fast}/${buff}: exact affordable charge did not fire`);close(attack.charge,.65,'the real-time charge must not exceed the advertised cost');assert(attack.time-started>=needed-1e-7);
  close(u.tension,0,'65% sniper charge uses exactly 27.8');assert.equal(u.exhausted,true);assert.equal(b.runtime(u).ammo,ammo-1);
 }
});

test('CPUのチャージは遮蔽・撃破・対象変更・射程外・切替・疲労・不足テンションで取消し、解除時に誤発射しない',()=>{
 for(const kind of ['sniper','rifle'])for(const fps of rates)for(const condition of ['blocked','dead','changed','range','switch','fatigue','reserve','freeze']){
  const {b,u,v}=duel(kind,{cpu:true});tickUntil(b,()=>u.charging,fps);const ammo=b.runtime(u).ammo;b.consumeEvents();
  if(condition==='blocked')b.stage.obstacles=[{x:0,z:8,w:4,d:1,h:3}];
  if(condition==='dead')v.dead=true;
  if(condition==='changed'){u.target=null;u.aiDelay=1;}
  if(condition==='range'){v.z=50;u.aiDelay=1;}
  if(condition==='switch')b.switchWeapon(u);
  if(condition==='fatigue'){u.exhausted=true;u.tension=0;u.regenWait=1;}
  if(condition==='reserve'){u.tension=kind==='sniper'?25.5:10;u.regenWait=1;}
  if(condition==='freeze')b.training.freezeAI=true;
  b.tick(1/fps);
  assert.equal(u.charging,false,`${kind}/${fps}/${condition}: still charging`);
  assert.equal(u.aiCharge,null,`${kind}/${fps}/${condition}: retained AI charge intent`);
  assert.equal(u.charge,0);assert.equal(b.runtime(u).ammo,ammo,`${kind}/${fps}/${condition}: cancellation fired a shot`);
  assert(!b.consumeEvents().some(e=>e.unit===u.id&&e.type==='attack'),`${kind}/${fps}/${condition}: unintended attack on cancellation`);
 }
});

function approachFixture(kind,difficulty,team,cut=false){
 const c=config(kind,{difficulty});c.style='aggressive';if(cut)for(let i=0;i<5;i++)c.placements.push({item:'aux:generic:2'});
 const b=new Battle({allies:[c,c],enemies:[c],setup:{allies:2,enemies:1,stage:'flat',duration:0,player:0,training:true,coordination:'spread'},getItem:get,rng:()=>.5});b.countdown=0;b.stage={...b.stage,obstacles:[],ramps:[],width:120,depth:120};
 const u=b.entities.find(entity=>!entity.human&&entity.team===team),v=b.entities.find(entity=>entity.team!==team);
 b.entities.forEach(entity=>Object.assign(entity,{x:45,z:45,lp:100000}));Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:8,yaw:Math.PI});
 const ai=b.ai.bind(b);b.ai=(entity,dt)=>entity===u?ai(entity,dt):{};return {b,u,v};
}
test('両陣営・全難易度の近接CPUは有料で射線を詰め、回復で無料化せず基本コンボを残す',()=>{
 for(const kind of ['sword','hammer','dualSword'])for(const difficulty of ['easy','normal','hard'])for(const team of [0,1])for(const fps of rates)for(const cut of [false,true]){
  const {b,u,v}=approachFixture(kind,difficulty,team,cut),before=u.tension,ammo=b.runtime(u).ammo;
  tickUntil(b,()=>b.events.some(e=>e.type==='dash'&&e.unit===u.id),fps,2);
  const paid=cost(u.stats,'groundDash',18);close(before-u.tension,paid,`${kind}/${difficulty}/${team}/${fps}: approach boost payment`);assert.equal(b.runtime(u).ammo,ammo);
  const reserve=u.tension,z=u.z;for(let i=0;i<Math.floor(fps*.18);i++)b.tick(1/fps);
  assert(u.z-z>u.stats.move*GROUND_WALK_FACTOR*.18*2,'the paid boost must close distance faster than walking');close(u.tension,reserve,'approach boost must not regenerate its own cost');
  b.ai=()=>({});tickUntil(b,()=>u.dashTime===0,fps);let comboPaid=0;
  for(let stage=0;stage<WEAPONS[kind].combo;stage++){
   Object.assign(v,{x:u.x,z:u.z+.8});const tension=u.tension,lp=v.lp;assert(b.attack(u),`${kind}/${difficulty}/${team}/${fps}: attack after approach`);assert.equal(u.attack.combo,stage);comboPaid+=tension-u.tension;
   tickUntil(b,()=>!u.attack&&b.runtime(u).cooldown===0&&u.actionTime===0,fps);assert(v.lp<lp,`${kind}: real combo stage after boost`);
  }
  assert(comboPaid<=reserve+1e-7,'approach must leave enough tension to pay an entire combo');
  const denied=approachFixture(kind,difficulty,team,cut),w=WEAPONS[kind];denied.u.tension=cost(denied.u.stats,'groundDash',18)+cost(denied.u.stats,'attack',w.tension*(w.combo+.4))-.01;denied.u.regenWait=1;
  for(let i=0;i<Math.floor(fps*.9);i++)denied.b.tick(1/fps);
  assert(!denied.b.events.some(e=>e.unit===denied.u.id&&e.type==='dash'),`${kind}/${difficulty}/${team}/${fps}: boost used the combo reserve`);
 }
 for(const mode of ['wall','protected','air']){
  const {b,u,v}=approachFixture('sword','hard',1);if(mode==='wall')b.stage.obstacles=[{x:0,z:4,w:8,d:1,h:3}];if(mode==='protected'){v.down=2;v.knockdown={phase:'down',elapsed:0};}if(mode==='air')Object.assign(u,{grounded:false,y:2,vy:0});
  for(let i=0;i<30;i++)b.tick(1/120);assert(!b.events.some(e=>e.unit===u.id&&e.type==='dash'),`${mode}: no approach boost`);
 }
});

test('通常バズーカは0.65H押し戻し、チャージと必殺は3.4Hを保ち、転倒・起き上がりは追撃もCも防ぐ',()=>{
 for(const fps of rates)for(const mode of ['normal','charge','skill']){
  const {b,u,v}=duel('bazooka'),z=v.z;
  if(mode==='skill'){u.config.abilities=['bazooka:normal'];u.c=100;assert(b.useSkill(u,'bazooka:normal'));}else assert(b.attack(u,mode==='charge'?1:0));
  tickUntil(b,()=>b.events.some(e=>e.type==='hit'&&e.attacker===u.id),fps);
  close(v.z-z,mode==='normal'?.65:3.4,`${fps}/${mode}: blast push`);assert.equal(v.knockdown?.phase,'down');assert(b.invulnerable(v));assert.equal(v.down,1);
  if(mode!=='normal')continue;
  tickUntil(b,()=>b.runtime(u).cooldown===0&&u.actionTime===0,fps);assert(b.invulnerable(v),'second shot must cross a still protected target');const lp=v.lp,chance=u.c;b.consumeEvents();assert(b.attack(u));
  for(let i=0;i<Math.floor(fps*.18);i++)b.tick(1/fps);
  assert.equal(v.lp,lp);assert.equal(u.c,chance);assert(!b.events.some(e=>e.type==='hit'&&e.attacker===u.id));assert(b.invulnerable(v),'the entire passage remains within down/rise protection');
  tickUntil(b,()=>!b.invulnerable(v),fps);assert.equal(v.knockdown,null);assert.equal(v.rise,0);
 }
});

function hiddenFixture(x,z,team=0){
 const {b,u,v}=approachFixture('sword','hard',team);b.stage=STAGES.flat;Object.assign(u,{x,z,target:null,aiObservation:null});Object.assign(v,{x:team?-2.5:2.5,z:team?-7.5:7.5});for(const entity of b.entities)if(entity!==u&&entity!==v)Object.assign(entity,{dead:true,lp:0});
 const ai=Battle.prototype.ai.bind(b);b.ai=(entity,dt)=>entity===u?ai(entity,dt):{};return {b,u,v};
}
test('視線が低い箱で遮られたCPUも斜めの敵へ両軸で近づき、壁角で進路が開いても回り込みを反転しない',()=>{
 const diagonal=hiddenFixture(-3.5,3.5),start={x:diagonal.u.x,z:diagonal.u.z},lp=diagonal.u.lp;
 for(let i=0;i<12;i++)diagonal.b.tick(1/120);
 assert(diagonal.u.x>start.x+.10,'hidden-target pursuit must advance along X');assert(diagonal.u.z>start.z+.05,'hidden-target pursuit must advance along Z');assert.equal(diagonal.u.lp,lp);
 assert(!diagonal.b.events.some(e=>['hit','attack','dash'].includes(e.type)),'this case must exercise walking around hidden geometry');
 for(const team of [0,1]){
  const corner=hiddenFixture(team?1.8:-1.8,team?-4.9:4.9,team);let blocked=false,open=false,firstVelocity=null;
  for(let i=0;i<54;i++){
   const {b,u,v}=corner,dx=v.x-u.x,dz=v.z-u.z,d=Math.hypot(dx,dz),clear=!b.blocked(u,u.x+dx/d*.8,u.z+dz/d*.8);blocked ||= !clear;open ||= clear;
   const previous={x:u.x,z:u.z};b.tick(1/60);assert(u.x>previous.x,'both teams must retain the same world edge while detouring');assert(u.z<previous.z,'the detour must not immediately turn back into the corner');
   const speed=Math.hypot(u.vx,u.vz),direction={x:u.vx/speed,z:u.vz/speed};firstVelocity ||= direction;assert(direction.x*firstVelocity.x+direction.z*firstVelocity.z>.999,'the committed detour must retain its direction across multiple frames');
  }
  assert(blocked&&open,`team ${team}: the fixture must include both blocked and newly open direct approaches (${blocked}/${open})`);assert(!corner.b.events.some(e=>e.type==='hit'));assert(corner.u.tension<=100);
 }
});

test('初期1対1の両機が拳銃へ切り替えて遮蔽物を回り続けたseed2029でも再び命中し90秒以内に決着する',()=>{
 for(const skills of [false,true]){
  const a=defaultConfig(),e=defaultConfig(0,true);if(!skills){a.abilities=[];e.abilities=[];}
  const b=new Battle({allies:[a],enemies:[e],setup:{allies:1,enemies:1,stage:'flat',duration:90,player:0,training:false,coordination:'spread'},getItem:get,rng:seeded(2029)});b.countdown=0;for(const u of b.entities)u.human=false;
  const previousLP=b.entities.map(u=>u.lp);let bothPistols=false,laterHits=0;
  for(let i=0;i<60*90+2&&!b.finished;i++){
   b.tick(1/60);bothPistols ||= b.entities.every(u=>u.stats.weapon.id==='pistol');for(const event of b.consumeEvents())if(event.type==='hit'&&event.time>12)laterHits++;
   b.entities.forEach((u,n)=>{for(const value of [u.x,u.y,u.z,u.vx,u.vz,u.yaw,u.tension,u.lp])assert(Number.isFinite(value),'the initial duel must retain finite simulation values');assert(u.lp>=0&&u.lp<=previousLP[n],'the duel must not recover by resetting LP');previousLP[n]=u.lp;});
  }
  assert(bothPistols,'the fixture must exercise both CPUs changing from sword to pistol');assert(laterHits>0,'the CPUs must resume actual hits after their former stall at 12 seconds');assert(b.finished&&b.result.reason==='撃破'&&b.time<=90,'the initial duel must finish through combat');
 }
});

function seeded(seed){let value=seed>>>0;return()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
test('接近ダッシュ後に低い箱で止まっていた3条件は90秒以内に戦闘を終え、座標とLPをリセットしない',()=>{
 for(const [melee,gun,mode,seed]of [['dualSword','heavyShotgun','bare',83],['scythe','heavyShotgun','bare',1607],['lance','assault','default',2029]]){
  const configs=[melee,gun].map(kind=>{const c=config(kind,{difficulty:'normal',passives:mode==='bare'?[]:defaultConfig().passives});c.style=WEAPONS[kind].ranged?'ranged':'aggressive';c.sets.forEach(set=>{set.shield=WEAPONS[kind].shield?'shield:basic':null;set.separate=false;});return c;});
  const b=new Battle({allies:[configs[0]],enemies:[configs[1]],setup:{allies:1,enemies:1,stage:'flat',duration:90,player:0,training:false,coordination:'spread'},getItem:get,rng:seeded(seed)});b.countdown=0;for(const u of b.entities)u.human=false;
  const previousLP=b.entities.map(u=>u.lp);let hits=0,dashes=0;
  for(let i=0;i<60*90+2&&!b.finished;i++){
   b.tick(1/60);for(const e of b.consumeEvents()){if(e.type==='hit')hits++;if(e.type==='dash')dashes++;}
   b.entities.forEach((u,n)=>{for(const value of [u.x,u.y,u.z,u.vx,u.vz,u.yaw,u.tension,u.lp])assert(Number.isFinite(value),`${melee}/${gun}/${seed}: non-finite simulation`);assert(u.lp>=0&&u.lp<=previousLP[n],`${melee}/${gun}/${seed}: LP reset or healed`);previousLP[n]=u.lp;});
  }
  assert(b.finished&&b.result.reason==='撃破',`${melee}/${gun}/${seed}: ended only through timeout`);assert(b.time<=90);assert(dashes>0&&hits>0,'the fixture must cover actual boosts and damage');assert(b.entities.every(u=>u.dealt>0),'both combatants must enter real interaction');
 }
});
