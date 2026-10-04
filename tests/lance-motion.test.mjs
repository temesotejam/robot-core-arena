import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {sampleMotion} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG} from '../src/data.js';
import {PARTS} from '../src/data.js';
import {Battle} from '../src/sim.js';

function fixture(shield=true,frame='knight'){
 const config=defaultConfig();config.sets[0]={item:'weapon:lance',shield:shield?'shield:basic':null,separate:false};
 config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const u={config,active:0,x:0,y:0,z:0,yaw:0,grounded:true};
 return {config,ref,u};
}
function draw(ref,u,combo,p,charge=0){
 u.attack={id:`${combo}`,weapon:'lance',combo,charge,elapsed:p,duration:1,origin:[0,0,0],yaw:0};
 ArenaRenderer.prototype.animateRobot.call({},ref,u,p);ref.root.updateMatrixWorld(true);
 return ref.weaponAttachments[0];
}
const point=(weapon,y)=>weapon.localToWorld(new THREE.Vector3(0,y,0));
const sample=(combo,p,shield=true)=>sampleMotion('lance',{combo,elapsed:p,duration:1},{hasShield:shield});

test('ランスは腰を先行させて胸を回し、低・高・最終突きで異なる全身の圧縮を使う',()=>{
 for(let combo=0;combo<3;combo++){
  const samples=Array.from({length:241},(_,i)=>sample(combo,i/240));
  assert(Math.max(...samples.map(f=>f.hipYaw))-Math.min(...samples.map(f=>f.hipYaw))>.70,'骨盤の引きと打ち込みが小さい');
  assert(Math.max(...samples.map(f=>f.body[1]))-Math.min(...samples.map(f=>f.body[1]))>.80,'胸を固定した腕だけの突き');
  const crossing=channel=>{const values=samples.map(channel),low=Math.min(...values),high=Math.max(...values);return values.findIndex(v=>v>low+(high-low)*.5)/240;};
  assert(crossing(f=>f.hipYaw)<crossing(f=>f.body[1])-.035,'腰より先に胸だけを伸ばす');
 }
 const low=sample(0,.22),high=sample(1,.22),finish=sample(2,.48);
 assert(high.right.position[1]-low.right.position[1]>.20,'高い突きも腰横の引きになる');
 assert(finish.body[0]>.13&&finish.shift[1]>.06&&finish.drop<-.105,'最終突きに前傾と深い荷重がない');
});

test('実入力の連撃・近距離と空振りの溜めで、全5フレームのすね装甲と足が床を貫通しない',()=>{
 for(const frame of ['knight','strider','wild','brawler','panzer'])for(const fps of [30,60,120])for(const mode of ['combo','chargeNear','chargeFar']){
  const {config,ref}=fixture(true,frame);config.passives=[];config.abilities=[];
  const enemy=defaultConfig(0,true);enemy.passives=[];enemy.abilities=[];
  const b=new Battle({allies:[config],enemies:[enemy],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  b.countdown=0;b.training.freezeAI=true;
  const u=b.human,v=b.entities[1],charged=mode!=='combo',stages=charged?1:3,holdFrames=charged?Math.ceil(b.maxCharge(u)*fps)+1:1;
  Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:mode==='chargeFar'?5:.9,yaw:Math.PI});
  let starts=0,held=0,pressing=false,ended=null,inspected=0;
  const attack=b.attack.bind(b);b.attack=(unit,...args)=>{const ok=attack(unit,...args);if(ok&&unit===u)starts++;return ok;};
  for(let n=0;n<fps*8;n++){
   const rt=b.runtime(u),a=u.attack,input={},first=n>=fps*.5&&!starts&&!a&&!u.motion&&held<holdFrames,
    follow=a&&a.combo<stages-1&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.14&&rt.cooldown>0;
   if(charged){if(first){input.attack=true;held++;}}
   else if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;held++;}
   b.tick(1/fps,input);b.consumeEvents();ArenaRenderer.prototype.animateRobot.call({},ref,u,b.time,(x,z)=>b.groundAt(x,z));ref.root.updateMatrixWorld(true);
   // Precise vertices, including bevels and accent plates, are the visible
   // casing. An ankle-position check alone missed the former shin penetration.
   const bottom=new THREE.Box3().setFromObject(ref.legGroup,true).min.y;
   assert(bottom>=-1e-7,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 脚の装甲が床へ${-bottom}入る`);inspected++;
   if(starts===stages&&!u.attack&&!u.motion){ended??=b.time;if(b.time-ended>=.25)break;}
  }
  assert.equal(starts,stages);assert(inspected>fps);assert(ended!==null);
 }
});

test('回る胸に対して槍先を相手へ向け、盾は正面を覆ったまま別に回収する',()=>{
 for(const hasShield of [false,true])for(let combo=0;combo<3;combo++){
  const {ref,u}=fixture(hasShield);
  for(let n=34;n<=51;n++){
   const weapon=draw(ref,u,combo,n/100),direction=point(weapon,.90).sub(point(weapon,.105)).normalize();
   assert(direction.z>.94,'胸の回転に槍先が巻き込まれる');
   assert(Math.abs(point(weapon,.90).x)<.10,'槍先が正面の相手を外れる');
   if(hasShield){
    const shield=ref.weaponAttachments[1],normal=new THREE.Vector3(0,0,1).applyQuaternion(shield.getWorldQuaternion(new THREE.Quaternion()));
    assert(normal.z>.96,'突きで盾面が相手から外れる');
   }
  }
 }
 const covered=sample(2,.65,true),free=sample(2,.65,false);
 const inRoot=f=>new THREE.Vector3(...f.left.position).sub(new THREE.Vector3(0,.36,0)).applyEuler(new THREE.Euler(...f.body)).add(new THREE.Vector3(0,.36,0));
 assert(inRoot(covered).z>.25&&inRoot(free).z<.06,'空き腕を盾と同じ位置へ固定する');
});

test('実際の握りは突きの中間キーで止まらず、回収は肘を畳んでから構えへ戻る',()=>{
 for(let combo=0;combo<3;combo++){
  const {ref,u}=fixture(),position=p=>point(draw(ref,u,combo,p),0);
  const p=.355,h=.0001,a=position(p-h),b=position(p),c=position(p+h),incoming=b.clone().sub(a).divideScalar(h),outgoing=c.clone().sub(b).divideScalar(h);
  assert(incoming.z>.25&&outgoing.z>.25,'接触への途中で握りの前進が止まる');
  assert(incoming.distanceTo(outgoing)<.025,'中間キーで握りの速度が飛ぶ');
  assert(position(.65).z<position(.51).z-.15,'突いた後に肘を畳まない');
 }
});

test('先行入力と満溜めの解除は肩外の引きを保持して次の突きへつなぐ',()=>{
 for(const hasShield of [false,true]){
  const ready=sampleMotion('lance',null,{hasShield}),held=sampleMotion('lance',null,{hasShield,charging:{from:ready,elapsed:1,amount:1}}),
   released=sampleMotion('lance',{combo:0,charge:1,elapsed:.08,duration:1,blendFrom:held},{hasShield});
  assert(new THREE.Vector3(...released.right.position).distanceTo(new THREE.Vector3(...held.right.position))<1e-10,'解除後に低い待機へ戻って溜め直す');
  for(let combo=0;combo<2;combo++){
   const outgoing=sampleMotion('lance',{combo,elapsed:1,duration:1},{hasShield,nextCombo:combo+1}),
    incoming=sampleMotion('lance',{combo:combo+1,elapsed:0,duration:1,blendFrom:outgoing},{hasShield});
   assert.equal(outgoing.preparedNext,combo+1);assert.deepEqual(incoming.joints,outgoing.joints);
   assert(outgoing.drop<ready.drop-.015,'段間で直立待機へ戻る');
  }
 }
});
