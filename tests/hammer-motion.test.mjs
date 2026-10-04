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

test('大型ハンマーを腰の横から後ろへ低く構え、肩を前へ出して両手で支える',()=>{
 for(const frame of frames){
  const {ref,u}=fixture(frame);draw(ref,u);
  const w=ref.weaponAttachments[0],grip=point(w),head=w.localToWorld(new THREE.Vector3(...w.userData.strikeCenter)),axis=head.clone().sub(grip).normalize(),ready=sampleMotion('hammer',null);
  assert(head.x<-.24,'ヘッドを体の横の外へ置かない');
  assert(axis.z<-.80&&axis.y<-.10,'柄を低い後方へ向けない');
  assert(head.y<grip.y-.075&&head.y>.28&&head.z<grip.z-.45,'肩に担ぐか、正面へ構える');
  assert(grip.y>.42&&grip.y<.52,'両手の握りを腰の高さへ下げない');
  const crossbar=w.localToWorld(new THREE.Vector3(.245,.60,0)).sub(w.localToWorld(new THREE.Vector3(-.245,.60,0))).normalize();
  assert(Math.abs(axis.dot(crossbar))<1e-10&&Math.abs(crossbar.y)>.80,'ヘッドの中央の直角接続や構えの向きを崩す');
  const local=new THREE.Box3();for(const mesh of w.children.filter(m=>m.isMesh)){mesh.geometry.computeBoundingBox();local.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));}
  const size=local.getSize(new THREE.Vector3());assert(size.x>.55&&size.y>.78&&size.z>.32,'大型の厚い打撃面を持たない');
  assert(ready.body[0]>.12&&Math.abs(ready.body[1])>.25&&ready.drop<-.045,'肩が前へ出ず、胸と腰が直立したまま');
  assert(ready.feet[1][0]-ready.feet[0][0]>.28&&ready.feet[1][2]-ready.feet[0][2]>.18,'足を前後に開かない');
  if(frame!=='panzer'){const feet=ref.feet.map(leg=>point(leg.foot));assert(feet[1].x-feet[0].x>.30&&feet[1].z-feet[0].z>.21,'表示した脚が細い直立構えのまま');}
  assert(w.localToWorld(new THREE.Vector3(...w.userData.supportGrip)).distanceTo(point(ref.arms[1].hand))<.005,'左手が柄を支えない');
  const hand=point(ref.arms[0].hand);draw(ref,u,2);assert(hand.distanceTo(point(ref.arms[0].hand))<1e-8,'待機中に握りが漂う');
  assert(new THREE.Box3().setFromObject(ref.legGroup,true).min.y>=-1e-7,'待機の脚装甲が床を貫通');
 }
});

test('大剣風の通常2段は腰が先行し、反対の肩から斜めに振り下ろす',()=>{
 const swing=Array.from({length:241},(_,n)=>sample(0,n/240)),slam=Array.from({length:241},(_,n)=>sample(1,n/240));
 const range=(samples,f)=>Math.max(...samples.map(f))-Math.min(...samples.map(f));
 assert(range(swing,f=>f.hipYaw)>1.10&&range(swing,f=>f.body[1])>1.40,'腕だけで横へ振る');
 assert(sample(0,.335).hipYaw>.25&&sample(0,.335).body[1]<-.40,'腰より先に胸を回す');
 assert(range(slam,f=>f.body[0])>.29&&sample(1,.48).shift[1]>.06,'叩きつけで上体と荷重を運ばない');
 for(let combo=0;combo<2;combo++){
  const {ref,u}=fixture(),head=p=>{u.attack={id:'diagonal',weapon:'hammer',combo,elapsed:p,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,p);return ref.weaponAttachments[0].localToWorld(new THREE.Vector3(...ref.weaponAttachments[0].userData.strikeCenter));},load=head(.225),follow=head(.56),side=combo===0?-1:1;
  assert(load.x*side>.20&&follow.x*side<-.25,'2段とも同じ側で小さく振る');
  assert(load.y-follow.y>.50,'ヘッドを横一線で回すだけ');
 }
});

test('実際のヘッドは命中の経路点を止まらず通過し、回収より速く動く',()=>{
 for(let combo=0;combo<2;combo++){
  const {ref,u}=fixture(),head=p=>{u.attack={id:'speed',weapon:'hammer',combo,elapsed:p,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,p);return ref.weaponAttachments[0].localToWorld(new THREE.Vector3(...ref.weaponAttachments[0].userData.strikeCenter));},p=combo?.405:.395,h=.0001,
   a=head(p-h),b=head(p),c=head(p+h),incoming=b.clone().sub(a).divideScalar(h),outgoing=c.clone().sub(b).divideScalar(h);
  assert(incoming.length()>1&&outgoing.length()>1,'経路点でヘッドが止まる');
  assert(incoming.distanceTo(outgoing)<.04,'経路点でヘッドの速度が飛ぶ');
  const speed=p=>head(p+h).distanceTo(head(p-h))/(h*2);
  const passage=Array.from({length:32},(_,n)=>.329+n*(.458-.329)/31),recovery=Array.from({length:81},(_,n)=>.60+n*.40/80);
  assert(Math.max(...passage.map(speed))>Math.max(...recovery.map(speed))*1.1,'回収の方が速い');
 }
});

test('大型ヘッドの端板・装飾まで通常2段と溜めの全経路で床上を保つ',()=>{
 for(const frame of frames)for(const [combo,charge]of [[0,0],[1,0],[0,1]]){
  const {ref,u}=fixture(frame);
  for(let n=0;n<=240;n++){
   const p=n/240;u.attack={id:'envelope',weapon:'hammer',combo,charge,elapsed:p,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,p);
   const w=ref.weaponAttachments[0];assert(new THREE.Box3().setFromObject(w,true).min.y>=0,`${frame}/${combo}/${charge}/${p}: 大型ヘッドの外形が床を貫通`);
  }
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
   assert(new THREE.Box3().setFromObject(ref.weaponAttachments[0],true).min.y>=0,`${frame}/${fps}/${mode}: 大型ハンマーの外形が床を貫通`);
   if(starts===stages&&!u.attack&&!u.motion){ended??=b.time;if(b.time-ended>=.25)break;}
  }
  assert.equal(starts,stages);assert(ended!==null);
 }
});
