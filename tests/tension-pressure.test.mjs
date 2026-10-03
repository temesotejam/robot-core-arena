import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,distance} from '../src/sim.js';
import {defaultConfig,cost} from '../src/customize.js';
import {CATALOG,WEAPONS,DIFFICULTIES} from '../src/data.js';

const melee={sword:15,rapier:12,dualSword:9,lance:21,naginata:18,knuckle:9,dagger:10.5,hammer:27,scythe:21};
const ranged={pistol:8,machinegun:1.5,shotgun:12,dualGun:4,rifle:12,assault:2,sniper:20,heavyShotgun:16,bazooka:20,missile:14};
const rates=[30,60,120];
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,`${message}: ${actual} != ${expected}`);
function config(kind='sword',difficulty='normal',passives=[]){
 const c=defaultConfig();c.passives=passives;c.abilities=[`${kind}:normal`,`${kind}:buff`];c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:null}));c.style='aggressive';c.difficulty=difficulty;return c;
}
function duel(kind='sword',options={}){
 const c=config(kind,options.difficulty,options.passives),b=new Battle({allies:[c],enemies:[c],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
 b.countdown=0;b.training.freezeAI=true;const [u,v]=b.entities;Object.assign(u,{x:3,z:0,yaw:0,target:v.id,lp:100000});Object.assign(v,{x:3,z:options.hit?.8:8,yaw:Math.PI,lp:100000});return b;
}
function ready(b,u=b.human,fps=120){
 for(let i=0;i<fps*4&&(u.attack||b.runtime(u).cooldown>0||u.actionTime>0);i++)b.tick(1/fps);
 assert(!u.attack&&b.runtime(u).cooldown===0&&u.actionTime===0,'the actual attack must finish');
}

test('全9近接・30/60/120fps：空振り連打は3〜11回で次の一撃が払えず、休めば再開できる',t=>{
 const measured=[];
 for(const [kind,amount]of Object.entries(melee))for(const fps of rates){
  const b=duel(kind),u=b.human,v=b.entities[1];let count=0;
  for(let i=0;i<20;i++){
   ready(b,u,fps);Object.assign(v,{x:u.x,z:u.z+8});const before=u.tension;if(!b.attack(u))break;
   close(before-u.tension,amount,`${kind} ${fps}fps whiff cost`);assert.equal(u.attack.combo,0);count++;
  }
  assert.equal(count,Math.floor(100/amount),`${kind} ${fps}fps must drain its finite reserve`);assert(u.tension<amount);assert.equal(u.attack,null);assert.equal(u.exhausted,false);assert.equal(b.attack(u),false);
  const depletedAt=b.time,depleted=u.tension;
  for(let i=0;i<fps*2&&u.tension<amount;i++)b.tick(1/fps);
  assert(u.tension>depleted);assert(b.attack(u),`${kind}: resting must permit another swing`);
  measured.push({kind,fps,count,depletedAt});
 }
 for(const kind of Object.keys(melee)){const rows=measured.filter(r=>r.kind===kind);t.diagnostic(`${kind}: ${rows[0].count} whiffs, ${Math.min(...rows.map(r=>r.depletedAt)).toFixed(2)}–${Math.max(...rows.map(r=>r.depletedAt)).toFixed(2)} s to unaffordable next swing`);}
});

test('全9近接・30/60/120fps：実際に命中した一連のコンボとダッシュ1回は100以内に収まる',()=>{
 for(const [kind,amount]of Object.entries(melee))for(const fps of rates){
  const b=duel(kind,{hit:true}),u=b.human,v=b.entities[1];let total=0;
  for(let stage=0;stage<WEAPONS[kind].combo;stage++){
   ready(b,u,fps);Object.assign(v,{x:u.x,z:u.z+.8});const lp=v.lp,before=u.tension;assert(b.attack(u),`${kind} ${fps}fps stage ${stage+1}`);assert.equal(u.combo,stage);
   const paid=amount*(stage===WEAPONS[kind].combo-1?1.4:1);close(before-u.tension,paid,`${kind} stage ${stage+1}`);total+=paid;ready(b,u,fps);assert(v.lp<lp,`${kind} stage ${stage+1}: real hit`);
  }
  assert(total+18<=100);const before=u.tension;assert(b.dash(u,1,0));close(before-u.tension,18,`${kind}: dash cost unchanged`);assert(!u.exhausted);
 }
});

test('攻撃軽減は増額後の近接・チャージにも作用し、全10射撃の基本消費は変わらない',()=>{
 for(const [kind,amount]of Object.entries(melee))for(const charge of [0,1]){
  const b=duel(kind),u=b.human;for(let i=0;i<5;i++)u.config.placements.push({item:'aux:generic:2'});b.refreshStats(u);const before=u.tension;assert(b.attack(u,charge));close(before-u.tension,amount*(charge?1.6:1)*.7,`${kind} charge ${charge}`);close(cost(u.stats,'groundDash',18),7.2,`${kind}: generic movement reduction`);
 }
 for(const [kind,amount]of Object.entries(ranged)){const b=duel(kind),u=b.human,before=u.tension;assert(b.attack(u));close(before-u.tension,amount,`${kind}: ranged cost`);assert.equal(u.attack,null);assert.equal(b.runtime(u).ammo,WEAPONS[kind].clip-1);}
});

test('遅い通常攻撃とチャージ攻撃の動作中は回復せず、最後の消費からの待機時間だけ進む',()=>{
 for(const [kind,charge]of [['hammer',0],['hammer',1],['sword',1]])for(const fps of rates){
  const b=duel(kind,{passives:['tension']}),u=b.human;assert(b.attack(u,charge));const reserve=u.tension;let delayExpired=false;
  while(u.attack){b.tick(1/fps);close(u.tension,reserve,`${kind} charge ${charge}: no recovery during an ordinary motion`);if(u.regenWait===0)delayExpired=true;}
  assert(delayExpired);assert.equal(u.regenWait,0,'finishing must not restart the wait');b.tick(1/fps);close(u.tension,reserve+u.stats.regen/fps,`${kind}: recovery starts next idle frame`);
 }
 const b=duel('knuckle'),u=b.human;assert(b.attack(u));const spentAt=b.time,reserve=u.tension;ready(b,u);assert(u.regenWait>.5);
 while(b.time-spentAt<.8-1/120-1e-8){b.tick(1/120);close(u.tension,reserve,'short motion still respects the original spend delay');}
 for(let i=0;i<3&&u.tension===reserve;i++)b.tick(1/120);assert(u.tension>reserve);assert(b.time-spentAt<=.8+2/120+1e-8);
});

test('待機・必殺技・射撃はテンション回復を妨げず、疲労したプレイヤーの弱攻撃は残す',()=>{
 for(const mode of ['idle','skill','ranged']){
  const b=duel(mode==='ranged'?'sniper':'hammer'),u=b.human;u.tension=40;u.regenWait=0;
  if(mode==='skill'){u.c=500;assert(b.useSkill(u,'hammer:normal'));assert.equal(u.attack.normal,false);}
  if(mode==='ranged'){assert(b.attack(u));u.regenWait=0;assert.equal(u.attack,null);assert(b.runtime(u).cooldown>.8);}
  const before=u.tension;b.tick(1/120);close(u.tension,before+u.stats.regen/120,mode);
 }
 const b=duel('sword',{hit:true}),[u,v]=b.entities;Object.assign(u,{tension:0,exhausted:true,regenWait:1});assert(b.attack(u));assert.equal(u.tension,0);assert.equal(u.attack.exhausted,true);close(u.attack.coefficient,.7,'fatigued weak damage');assert.equal(u.attack.poise,null);const lp=v.lp;ready(b);assert(v.lp<lp);assert.equal(v.knockdown,null);assert.equal(v.stun,0);assert.equal(b.dash(u,1,0),false);
});

function cpuFixture(kind,difficulty,team){
 const c=config(kind,difficulty),b=new Battle({allies:[c,c],enemies:[c],setup:{allies:2,enemies:1,stage:'flat',duration:0,player:0,training:true,coordination:'spread'},getItem:id=>CATALOG[id],rng:()=>.5});
 b.countdown=0;b.stage={...b.stage,obstacles:[],width:80,depth:80};const u=b.entities.find(v=>!v.human&&v.team===team),target=b.entities.find(v=>v.team!==team);b.entities.forEach(v=>Object.assign(v,{x:30,z:30,lp:100000}));Object.assign(u,{x:0,z:0,yaw:0,target:target.id,c:500});Object.assign(target,{x:0,z:.8,yaw:Math.PI});
 const ai=b.ai.bind(b);b.ai=(v,dt)=>v===u?ai(v,dt):{};return {b,u,target};
}
test('両陣営・全難易度の近接CPUは低残量と疲労で距離を取り、80まで攻撃・技・ダッシュを控える',()=>{
 for(const kind of ['sword','hammer'])for(const difficulty of Object.keys(DIFFICULTIES))for(const team of [0,1])for(const tired of [false,true]){
  const {b,u,target}=cpuFixture(kind,difficulty,team);Object.assign(u,{tension:tired?0:kind==='hammer'?26:24,exhausted:tired,regenWait:.2});const initialDistance=distance(u,target),initialC=u.c;let entered=false,recovered=false;
  for(let i=0;i<120*6;i++){
   const before=u.tension,wasRecovering=u.aiRecovering;b.tick(1/120);const events=b.consumeEvents().filter(e=>e.unit===u.id);
   if(u.aiRecovering){entered=true;assert.equal(!!u.attack,false,`${kind} ${difficulty} team ${team} exhausted ${tired}: initially low reserve must not start an attack`);assert.equal(u.dashTime,0);assert.equal(u.c,initialC);assert(!events.some(e=>['attack','special','buff','dash'].includes(e.type)));}
   if(entered&&wasRecovering&&!u.aiRecovering){assert(before>=80&&!u.exhausted,`${kind} ${difficulty} team ${team}: waited for 80`);recovered=true;break;}
  }
  assert(entered&&recovered,`${kind} ${difficulty} team ${team} exhausted ${tired}`);assert(distance(u,target)>initialDistance+2,'recovery retreats from the opponent');
  // Let the real CPU approach again. Its next ordinary attack must still be paid.
  const before=u.tension;let attacked=false;for(let i=0;i<120*10&&!attacked;i++){b.tick(1/120);attacked=b.consumeEvents().some(e=>e.type==='attack'&&e.unit===u.id);}
  assert(attacked,`${kind} ${difficulty} team ${team}: returns to combat`);assert(u.tension<before||u.tension<=100-melee[kind]);
 }
});

test('通常のCPU空振り連打は実際に消費して回復へ移り、訓練の無限ゲージは明示時だけ補充する',t=>{
 for(const [kind]of Object.entries(melee))for(const fps of rates){
  const {b,u,target}=cpuFixture(kind,'easy',1);target.human=true;b.training.invulnerable=true;let swings=0,enteredAt=null;
  for(let i=0;i<fps*6;i++){b.tick(1/fps);swings+=b.consumeEvents().filter(e=>e.type==='attack'&&e.unit===u.id).length;if(u.aiRecovering){enteredAt=b.time;break;}}
  assert(enteredAt!==null&&swings>=2&&swings<=11,`${kind} ${fps}fps must spend itself into recovery`);assert.equal(u.comboHit,false);assert(u.tension<Math.max(25,melee[kind]));
  if(fps===120)t.diagnostic(`${kind} CPU: ${swings} whiffs, recovery at ${enteredAt.toFixed(2)} s`);
 }
 const b=duel('hammer'),u=b.human;b.training.infinite=true;u.tension=0;u.exhausted=true;b.tick(1/120);assert.equal(u.tension,100);assert.equal(u.exhausted,false);assert(b.attack(u));assert.equal(u.tension,73);b.tick(1/120);assert.equal(u.tension,100);b.training.infinite=false;b.tick(1/120);assert.equal(u.tension,100);ready(b);assert(b.attack(u));assert.equal(u.tension,73);b.tick(1/120);assert.equal(u.tension,73);
});

test('回復へ移るCPUは開始済みの一振りを終え、新たな攻撃を予約せず、射撃CPUには80待ちを追加しない',()=>{
 const {b,u}=cpuFixture('hammer','easy',1);for(let i=0;i<120&&!u.attack;i++)b.tick(1/120);assert(u.attack);const committed=u.attack;u.tension=10;b.consumeEvents();
 while(u.attack){b.tick(1/120);assert(u.aiRecovering);assert(!u.attack||u.attack===committed);assert.equal(u.queuedAttack,null);assert(!b.consumeEvents().some(e=>e.unit===u.id&&['attack','special','buff','dash'].includes(e.type)));}
 assert(committed.elapsed>=committed.duration,'the paid swing completes instead of being cancelled');assert.equal(u.regenWait,0);const reserve=u.tension;b.tick(1/120);close(u.tension,reserve+u.stats.regen/120,'the same original spend delay still governs recovery');
 for(const difficulty of Object.keys(DIFFICULTIES)){
  const {b:gun,u:shooter,target}=cpuFixture('pistol',difficulty,1);target.z=8;shooter.config.abilities=[];
  for(let i=0;i<120&&!shooter.aiObservation;i++)gun.tick(1/120);assert(shooter.aiObservation);Object.assign(shooter,{tension:20,regenWait:0,c:0});gun.consumeEvents();let shot=false;
  for(let i=0;i<120*2&&!shot;i++){const before=shooter.tension;gun.tick(1/120);assert.equal(shooter.aiRecovering,false);shot=gun.consumeEvents().some(e=>e.unit===shooter.id&&e.type==='attack');if(shot)assert(before<80,'ranged AI retains its previous low-reserve policy');}
  assert(shot,`${difficulty}: ranged CPU can resume below 80`);
 }
});
