import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,distance,segmentBox} from '../src/sim.js';
import {CATALOG,WEAPONS,FRAMES,PARTS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import * as THREE from '../vendor/three.module.min.js';
const kinds=Object.values(WEAPONS).filter(w=>!w.ranged).map(w=>w.id);
function battle(kind='sword',yaw=0,frame='knight'){
 const c=defaultConfig();c.sets[0]={item:`weapon:${kind}`,shield:null};c.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const b=new Battle({allies:[c],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
 Object.assign(b.human,{x:0,z:0,yaw,target:b.entities[1].id});Object.assign(b.entities[1],{x:Math.sin(yaw)*4,z:Math.cos(yaw)*4,y:0,lp:10000});return b;
}
function tap(b,input={}){b.tick(1/120,{attack:true});b.tick(1/120,input);}
function finish(b,input={},check=()=>{}){for(let i=0;i<300&&b.human.attack;i++){b.tick(1/120,input);check();}}
test('全9近接武器で前入力の短押し攻撃が高速踏み込みになり、前後左右と微小入力を区別する',()=>{
 for(const kind of kinds)for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const b=battle(kind,yaw),u=b.human;tap(b,{x:Math.sin(yaw),z:Math.cos(yaw)});assert(u.attack?.approach,kind);assert(u.attack.approach.speed>u.stats.move*2);finish(b);assert(Math.hypot(u.x,u.z)>.75,kind);assert(Math.abs(u.x*Math.cos(yaw)-u.z*Math.sin(yaw))<1e-7);
 }
 for(const input of [{},{z:-1},{x:1},{z:.2}]){const b=battle();tap(b,input);assert.equal(b.human.attack.approach,undefined);}
 const diagonal=battle();tap(diagonal,{x:1,z:1});assert(diagonal.human.attack.approach);
 const gun=battle('rifle');tap(gun,{z:1});assert.equal(gun.human.attack,null);assert.equal(gun.human.motion.approach,undefined);
});
test('高速踏み込みは相手の手前で止まり、前を押し続けても攻撃中に相手を通り抜けず一度だけ命中する',()=>{
 for(const fps of [30,60,120])for(const gap of [.7,1.4,2.6]){
  const b=battle(),u=b.human,v=b.entities[1];v.z=gap;tap(b,{z:1});let hits=0;
  while(u.attack){assert(u.z<=v.z-.61+1e-6);b.tick(1/fps,{z:1});hits+=b.consumeEvents().filter(e=>e.type==='hit'&&e.attacker===u.id).length;}
  assert.equal(hits,1,`${fps} fps gap ${gap}`);assert(distance(u,v)>=.61-1e-6);
 }
});
test('細い壁・斜めの接近・アリーナ外周は大きな時間刻みでも通り抜けない',()=>{
 for(const yaw of [0,.6,Math.PI/2]){const b=battle('sword',yaw),u=b.human;b.stage={...b.stage,obstacles:[{x:Math.sin(yaw)*.9,z:Math.cos(yaw)*.9,w:.05,d:.05,h:2}],ramps:[]};b.attack(u,0,{x:Math.sin(yaw),z:Math.cos(yaw)});b.meleeStep(u,.3);assert(Math.hypot(u.x,u.z)<.85);assert(!b.blocked(u,u.x,u.z));}
 const b=battle(),u=b.human;b.stage={...b.stage,depth:2};b.attack(u,0,{z:1});b.meleeStep(u,.3);assert(u.z<=.72);
});
test('コンボの先行入力は解放時の移動方向も保持して次の攻撃につなぐ',()=>{
 for(const z of [1,-1]){const b=battle(),u=b.human;tap(b);while(b.runtime(u).cooldown>.16)b.tick(1/120);tap(b,{z});assert.equal(u.queuedAttack.input.z,z);const first=u.attack.id;for(let i=0;i<100&&(!u.attack||u.attack.id===first);i++)b.tick(1/120);assert.equal(u.combo,1);assert.equal(!!u.attack.approach,z===1);}
});
test('最大チャージの前入力は回転の前に接近し、通常のチャージ構えと一周する軌跡を維持する',()=>{
 const b=battle(),u=b.human;b.entities[1].z=2.6;for(let i=0;i<96;i++)b.tick(1/120,{attack:true});assert.equal(u.z,0);b.tick(1/120,{z:1});const a=u.attack;assert.equal(a.charge,1);assert.equal(a.combo,0);assert(a.approach);while(a.approach.active||a.elapsed/a.duration<.20)b.tick(1/120);const z=u.z;while(u.attack&&u.attack.elapsed/u.attack.duration<.78)b.tick(1/120);assert(Math.abs(u.z-z)<1e-6);assert.equal(u.dashTime,0);assert(a.approach.travel>1.5);assert(Math.abs(a.origin[2]-a.approach.travel)<1e-6);
});
test('追加テンションを消費せず、疲労・ガード・切替・被弾・ポーズを尊重し、空中でも重力を維持する',()=>{
 const still=battle(),forward=battle();still.training.infinite=forward.training.infinite=false;tap(still);tap(forward,{z:1});assert.equal(still.human.tension,forward.human.tension);
 const tired=battle();tired.training.infinite=false;Object.assign(tired.human,{exhausted:true,tension:1,regenWait:1});tap(tired,{z:1});assert.equal(tired.human.attack.approach,undefined);
 for(const input of [{guard:true},{switchPressed:true}]){const b=battle();tap(b,{z:1});b.tick(1/120,input);assert(!b.human.attack.approach.active);}
 const interrupted=battle();tap(interrupted,{z:1});interrupted.human.stun=.3;const z=interrupted.human.z;interrupted.tick(1/120);assert.equal(interrupted.human.attack,null);assert.equal(interrupted.human.z,z);
 const paused=battle();tap(paused,{z:1});const snapshot=JSON.stringify(paused.human);paused.paused=true;for(let i=0;i<20;i++)paused.tick(1/120,{z:1});assert.equal(JSON.stringify(paused.human),snapshot);
 const air=battle();Object.assign(air.human,{grounded:false,y:1,vy:0});air.entities[1].y=1;tap(air,{z:1});const y=air.human.y;air.tick(1/120);assert(air.human.y<y);assert(air.human.z>.1);assert.equal(air.human.airDashesUsed,0);
});
test('全フレームで高速踏み込みから通常斬撃・回転薙ぎへつながり、脚が伸び切ったり床へ沈まない',()=>{
 for(const frame of Object.keys(FRAMES))for(const charge of [0,1]){const b=battle('sword',0,frame),u=b.human;b.entities[1].z=2.6;const ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;b.attack(u,charge,{z:1});finish(b,{},()=>{ArenaRenderer.prototype.animateRobot.call({},ref,u,b.time);ref.root.updateMatrixWorld(true);for(const leg of ref.feet){const foot=leg.foot||leg,p=foot.getWorldPosition(new THREE.Vector3());assert(p.y>=-.008,`${frame} ${charge}: floor ${p.y}`);assert(Math.hypot(p.x-u.x,p.z-u.z)<.65,`${frame} ${charge}: stretched leg`);}});}
});

test('高速接近後のソード命中時点で実際の剣が相手を横切る',()=>{
 for(const charge of [0,1])for(const yaw of [0,.8,-1.4])for(const fps of [60,120]){
  const b=battle('sword',yaw),u=b.human,v=b.entities[1];Object.assign(v,{x:Math.sin(yaw)*2.6,z:Math.cos(yaw)*2.6});const ref=createRobot(u.config,id=>CATALOG[id]);ref.active=0;b.attack(u,charge,{x:Math.sin(yaw),z:Math.cos(yaw)});let hit=false;
  while(u.attack){const a=u.attack;b.tick(1/fps);if(b.consumeEvents().some(e=>e.type==='hit'&&e.attacker===u.id)){ArenaRenderer.prototype.animateRobot.call({},ref,u,b.time);ref.root.updateMatrixWorld(true);const local=y=>ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,y,0)).sub(new THREE.Vector3(v.x,0,v.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-yaw);assert.notEqual(segmentBox(local(.105),local(.57),{x:0,z:0,w:.60,d:.4,h:.80}),null,`${charge} ${yaw} ${fps}: visible blade misses`);hit=true;break;}}
  assert(hit,`${charge} ${yaw} ${fps}: no hit`);
 }
});
