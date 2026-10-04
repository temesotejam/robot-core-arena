import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {sampleMotion} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';
import {Battle} from '../src/sim.js';

const frames=['knight','strider','wild','brawler','panzer'];
function fixture(frame='knight'){
 const config=defaultConfig();config.sets[0]={item:'weapon:hammer',shield:null,separate:false};config.passives=[];config.abilities=[];
 config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 return {config,ref,u:{config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,grounded:true}};
}
const point=o=>o.getWorldPosition(new THREE.Vector3());
function draw(ref,u,time=0){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}
const sample=(combo,p,charge=0)=>sampleMotion('hammer',{combo,charge,elapsed:p,duration:1});

test('ハンマーの通常構えは肩外の斜めの柄、低い腰、前後に開いた足で両手の支持を保つ',()=>{
 for(const frame of frames){
  const {ref,u}=fixture(frame);draw(ref,u);
  const w=ref.weaponAttachments[0],grip=point(w),head=w.localToWorld(new THREE.Vector3(0,.49,0)),axis=head.clone().sub(grip).normalize(),ready=sampleMotion('hammer',null);
  assert(Math.abs(head.x)>.28,'ヘッドを正面の中央へ立てる');
  assert(Math.hypot(axis.x,axis.z)>.80,'柄を竹刀のように縦へ構える');
  assert(Math.abs(ready.body[1])>.25&&ready.drop<-.045,'胸と腰が直立したまま');
  assert(ready.feet[1][0]-ready.feet[0][0]>.28&&ready.feet[1][2]-ready.feet[0][2]>.18,'足を前後に開かない');
  assert(w.localToWorld(new THREE.Vector3(...w.userData.supportGrip)).distanceTo(point(ref.arms[1].hand))<.005,'左手が柄を支えない');
  const hand=point(ref.arms[0].hand);draw(ref,u,2);assert(hand.distanceTo(point(ref.arms[0].hand))<1e-8,'待機中に握りが漂う');
  assert(new THREE.Box3().setFromObject(ref.legGroup,true).min.y>=-1e-7,'待機の脚装甲が床を貫通');
 }
});

test('横振りは腰から胸へ大きく旋回し、叩きつけは頭上の引きから前へ折り込む',()=>{
 const swing=Array.from({length:241},(_,n)=>sample(0,n/240)),slam=Array.from({length:241},(_,n)=>sample(1,n/240));
 const range=(samples,f)=>Math.max(...samples.map(f))-Math.min(...samples.map(f));
 assert(range(swing,f=>f.hipYaw)>1.10&&range(swing,f=>f.body[1])>1.40,'腕だけで横へ振る');
 assert(sample(0,.335).hipYaw>.25&&sample(0,.335).body[1]<-.40,'腰より先に胸を回す');
 assert(sample(1,.225).right.position[1]-sample(0,.225).right.position[1]>.20,'2段目を上へ引き上げない');
 assert(range(slam,f=>f.body[0])>.29&&sample(1,.48).shift[1]>.06,'叩きつけで上体と荷重を運ばない');
});

test('実際のヘッドは命中の経路点を止まらず通過し、回収より速く動く',()=>{
 for(let combo=0;combo<2;combo++){
  const {ref,u}=fixture(),head=p=>{u.attack={id:'speed',weapon:'hammer',combo,elapsed:p,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,p);return ref.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.49,0));},p=combo?.405:.395,h=.0001,
   a=head(p-h),b=head(p),c=head(p+h),incoming=b.clone().sub(a).divideScalar(h),outgoing=c.clone().sub(b).divideScalar(h);
  assert(incoming.length()>1&&outgoing.length()>1,'経路点でヘッドが止まる');
  assert(incoming.distanceTo(outgoing)<.04,'経路点でヘッドの速度が飛ぶ');
  const speed=p=>head(p+h).distanceTo(head(p-h))/(h*2);
  assert(Math.max(...[.35,.38,.40,.43,.45].map(speed))>Math.max(...[.68,.75,.82,.87].map(speed))*1.1,'回収の方が速い');
 }
});

test('通常の先行入力と満溜め解除は準備済みの全身を引き継ぐ',()=>{
 const outgoing=sampleMotion('hammer',{combo:0,elapsed:1,duration:1},{nextCombo:1}),incoming=sampleMotion('hammer',{combo:1,elapsed:0,duration:1,blendFrom:outgoing}),ready=sampleMotion('hammer',null),
  held=sampleMotion('hammer',null,{charging:{from:ready,elapsed:1,amount:1}}),released=sampleMotion('hammer',{combo:0,charge:1,elapsed:.08,duration:1,blendFrom:held});
 assert.equal(outgoing.preparedNext,1);assert.deepEqual(incoming.joints,outgoing.joints);assert(outgoing.drop<ready.drop-.03,'段間で腰を立てる');
 assert(new THREE.Vector3(...released.right.position).distanceTo(new THREE.Vector3(...held.right.position))<1e-10,'解除後に待機へ戻って振りかぶり直す');
 assert(new THREE.Quaternion().setFromEuler(new THREE.Euler(...released.right.rotation)).angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...held.right.rotation)))<1e-7);
 assert.deepEqual(released.body,held.body);
});

test('実入力の2段・近距離と空振りの満溜めで全5フレームの脚装甲が床を貫通しない',()=>{
 for(const frame of frames)for(const fps of [30,60,120])for(const mode of ['combo','chargeNear','chargeFar']){
  const {config,ref}=fixture(frame),enemy=defaultConfig(0,true);enemy.passives=[];enemy.abilities=[];
  const b=new Battle({allies:[config],enemies:[enemy],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;
  const u=b.human,v=b.entities[1],charged=mode!=='combo',stages=charged?1:2,holdFrames=charged?Math.ceil(b.maxCharge(u)*fps)+1:1;
  Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:mode==='chargeFar'?5:.9,yaw:Math.PI});
  let starts=0,held=0,pressing=false,ended=null;
  const attack=b.attack.bind(b);b.attack=(unit,...args)=>{const ok=attack(unit,...args);if(ok&&unit===u)starts++;return ok;};
  for(let n=0;n<fps*8;n++){
   const rt=b.runtime(u),a=u.attack,input={},first=n>=fps*.5&&!starts&&!a&&!u.motion&&held<holdFrames,follow=a&&a.combo<stages-1&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.14&&rt.cooldown>0;
   if(charged){if(first){input.attack=true;held++;}}else if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;held++;}
   b.tick(1/fps,input);b.consumeEvents();draw(ref,u,b.time);
   const bottom=new THREE.Box3().setFromObject(ref.legGroup,true).min.y;
   assert(bottom>=-1e-7,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 脚の装甲が床へ${-bottom}入る`);
   if(starts===stages&&!u.attack&&!u.motion){ended??=b.time;if(b.time-ended>=.25)break;}
  }
  assert.equal(starts,stages);assert(ended!==null);
 }
});
