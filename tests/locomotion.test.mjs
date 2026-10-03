import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle,lockRange} from '../src/sim.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,FRAMES,PARTS,WEAPONS} from '../src/data.js';
import {sampleLocomotion} from '../src/locomotion.js';

const fpsValues=[30,60,120];
const directions=[[0,1],[0,-1],[1,0],[-1,0],[Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2]];
const world=o=>o.getWorldPosition(new THREE.Vector3());
const near=(a,b,message,tolerance=1e-8)=>assert(Math.abs(a-b)<tolerance,`${message}: ${a} != ${b}`);
function fixture(frame='knight',kind='sword',model=true){
 const c=defaultConfig();c.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));c.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:WEAPONS[kind].shield?'shield:basic':null}));c.passives=[];c.abilities=[];
 const b=new Battle({allies:[c],enemies:[c],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.stage={...b.stage,obstacles:[],ramps:[],width:100,depth:100};
 // General gait tests have no living opponent. Movement can therefore face
 // its travel direction without adding a product option to disable locking.
 const u=b.human;Object.assign(u,{x:0,z:0,yaw:0,target:null});Object.assign(b.entities[1],{x:25,z:25,lp:100000,dead:true});const ref=model?createRobot(c,id=>CATALOG[id]):null;if(ref)ref.active=0;return {b,u,ref};
}
function draw({b,u,ref},groundAt=b.groundAt.bind(b)){
 ArenaRenderer.prototype.animateRobot.call({groundAt},ref,u,b.time);ref.root.updateMatrixWorld(true);
}
function jointsConnected(ref){
 for(const leg of ref.feet)if(leg.knee){assert(leg.upper.localToWorld(new THREE.Vector3(0,-.155,0)).distanceTo(world(leg.knee))<1e-8,'thigh connects to knee');assert(leg.lower.localToWorld(new THREE.Vector3(0,-.17,0)).distanceTo(world(leg.foot))<1e-8,'shin connects to ankle');}
 for(const arm of ref.arms){assert(arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(world(arm.elbow))<1e-8,'upper arm connects to elbow');assert(arm.lower.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(world(arm.hand))<1e-8,'lower arm connects to hand');}
 for(const weapon of ref.weaponAttachments.filter(o=>o.name!=='shield'))assert(world(weapon).distanceTo(world(weapon.parent))<1e-8,'weapon remains in its hand');
 const supported=ref.weaponAttachments[0].userData.supportGrip;if(supported)assert(ref.weaponAttachments[0].localToWorld(new THREE.Vector3(...supported)).distanceTo(world(ref.arms[1].hand))<.005,'supporting hand remains on two-handed grip');
}
function contactSnapshot(ref){return ref.locomotion.feet.map((f,i)=>{const forward=new THREE.Vector3(0,0,1).applyQuaternion(ref.feet[i].foot.getWorldQuaternion(new THREE.Quaternion()));return {planted:f.planted,contact:f.contact,position:world(ref.feet[i].foot),yaw:Math.atan2(forward.x,forward.z)};});}
function fixedContacts(before,after,label){
 for(let i=0;i<2;i++)if(before[i].planted&&after[i].planted&&before[i].contact===after[i].contact){const drift=before[i].position.distanceTo(after[i].position);assert(drift<1e-7,`${label}: planted foot ${i} slides ${drift.toFixed(8)}: ${before[i].position.toArray()} -> ${after[i].position.toArray()}`);assert(Math.abs(Math.atan2(Math.sin(before[i].yaw-after[i].yaw),Math.cos(before[i].yaw-after[i].yaw)))<1e-7,`${label}: planted foot ${i} spins`);}
}
function poseSnapshot(ref){return JSON.stringify({feet:ref.feet.map(leg=>[world(leg.foot||leg).toArray(),(leg.foot||leg).getWorldQuaternion(new THREE.Quaternion()).toArray()]),body:[ref.bodyPivot.position.toArray(),ref.bodyPivot.quaternion.toArray()],hands:ref.arms.map(a=>[world(a.hand).toArray(),a.hand.getWorldQuaternion(new THREE.Quaternion()).toArray()]),state:ref.locomotion});}

test('全5フレーム・30/60/120fps：通常地上移動は45%で、近接攻撃・空中移動・各ダッシュは従来の速度',()=>{
 for(const frame of Object.keys(FRAMES))for(const fps of fpsValues)for(const [x,z]of directions)for(const mode of ['walk','attack','air','dash','airDash']){
  const {b,u}=fixture(frame,'sword',false);if(mode==='air'||mode==='airDash')Object.assign(u,{grounded:false,y:3,vy:0});if(mode==='dash'||mode==='airDash')assert(b.dash(u,x,z));if(mode==='attack')assert(b.attack(u));
  const expected=mode==='walk'?u.stats.move*.45:mode==='air'||mode==='attack'?u.stats.move:mode==='dash'?u.stats.dash:u.stats.airDash;b.tick(1/fps,{x,z});
  near(u.x,x*expected/fps,`${frame} ${mode} ${fps}fps x`);near(u.z,z*expected/fps,`${frame} ${mode} ${fps}fps z`);near(Math.hypot(u.vx,u.vz),expected,`${frame} ${mode} ${fps}fps speed`);
 }
});

test('前後・横・斜めを元の歩幅で速く歩き、接地足を世界に固定し、左右交互に足を持ち上げる',t=>{
 const measured=[];
 for(const frame of Object.keys(FRAMES).filter(f=>f!=='panzer'))for(const fps of fpsValues)for(const [x,z]of directions){
  const f=fixture(frame),{b,u,ref}=f;Object.assign(b.entities[1],{x:0,z:12,dead:false});u.target=b.entities[1].id;draw(f);let previous=contactSnapshot(ref),seen=[false,false],lifted=[false,false],supportFrames=0;
  const touchdowns=[null,null],supports=[null,null],strides=[];let supportTravel=0;
  for(let i=0;i<fps*2;i++){
   b.tick(1/fps,{x,z});draw(f);assert.equal(ref.locomotion.mode,'walk');const contacts=contactSnapshot(ref);assert(contacts.some(c=>c.planted),'walking must always have a supporting foot');
   fixedContacts(previous,contacts,`${frame} ${fps}fps direction ${x}/${z}`);for(let j=0;j<2;j++){
    const contact=contacts[j];if(contact.planted){seen[j]=true;if(!supports[j]||supports[j].contact!==contact.contact)supports[j]={contact:contact.contact,x:u.x,z:u.z};supportTravel=Math.max(supportTravel,(u.x-supports[j].x)*x+(u.z-supports[j].z)*z);}else{supports[j]=null;if(contact.position.y>.060)lifted[j]=true;}
    if(contact.planted&&contact.contact>previous[j].contact){if(touchdowns[j])strides.push((contact.position.x-touchdowns[j].x)*x+(contact.position.z-touchdowns[j].z)*z);touchdowns[j]=contact.position.clone();}
    assert(contact.position.y>=.032-1e-8,'feet clear the flat floor');if(previous[j].planted&&contact.planted&&previous[j].contact===contact.contact)supportFrames++;
   }previous=contacts;
  }
  assert(seen.every(Boolean)&&lifted.every(Boolean),`${frame}: both legs alternate supporting and swinging`);assert(supportFrames>fps/2,'test covers long planted intervals');assert(ref.locomotion.step>=5,'walk is a continuing alternating cycle');jointsConnected(ref);
  assert(strides.length>=4,'measure several real touchdowns after the starting step');assert(Math.min(...strides)>.32&&Math.max(...strides)<.59,`${frame} ${fps}fps: restored stride stays within the original full-step range`);assert(supportTravel>.18&&supportTravel<.36,`${frame} ${fps}fps: restored step keeps a stable support interval`);measured.push({frame,fps,stride:Math.min(...strides),support:supportTravel});
 }
 for(const frame of Object.keys(FRAMES).filter(f=>f!=='panzer')){const rows=measured.filter(r=>r.frame===frame);t.diagnostic(`${frame}: minimum same-foot stride ${Math.min(...rows.map(r=>r.stride)).toFixed(3)} m; planted-support root travel ${Math.min(...rows.map(r=>r.support)).toFixed(3)}–${Math.max(...rows.map(r=>r.support)).toFixed(3)} m`);}
});

test('移動中の連続旋回でも接地足は位置と向きを保持し、停止後は足を着いて同時刻の描画が安定する',()=>{
 for(const fps of fpsValues){const f=fixture(),{b,u,ref}=f;u.yaw=2.8;draw(f);let previous=contactSnapshot(ref);
  for(let i=0;i<fps*2;i++){const heading=2.8+i/fps*.45;b.tick(1/fps,{x:Math.sin(heading),z:Math.cos(heading)});draw(f);const contacts=contactSnapshot(ref);fixedContacts(previous,contacts,`${fps}fps continuous turn`);previous=contacts;const before=poseSnapshot(ref);draw(f);assert.equal(poseSnapshot(ref),before,'drawing the same simulation time must not change walking');}
  for(let i=0;i<fps;i++){b.tick(1/fps);draw(f);}assert.equal(ref.locomotion.mode,'idle');assert(ref.locomotion.feet.every(foot=>foot.planted));const stopped=ref.feet.map(leg=>world(leg.foot));const phase=ref.locomotion.phase;
  for(let i=0;i<fps/2;i++){b.tick(1/fps);draw(f);for(let j=0;j<2;j++)assert(world(ref.feet[j].foot).distanceTo(stopped[j])<1e-8,'idle feet stay where they landed');near(ref.locomotion.phase,phase,'idle does not advance a walking cycle');}
  b.tick(1/fps,{x:0,z:1});draw(f);assert.equal(ref.locomotion.mode,'walk');
 }
});

test('全5フレーム・19武器の歩行中も脚と腕が接続し、足が床を突き抜けず、履帯は足踏みしない',()=>{
 for(const frame of Object.keys(FRAMES))for(const kind of Object.keys(WEAPONS)){const f=fixture(frame,kind),{b,ref}=f;draw(f);let trackHeight=null;
  for(let i=0;i<36;i++){b.tick(1/60,{x:.6,z:.8});draw(f);jointsConnected(ref);for(const leg of ref.feet){const foot=leg.foot||leg,bounds=new THREE.Box3().setFromObject(foot);assert(bounds.min.y>=-.002,`${frame}/${kind}: foot or track enters the floor`);}
   if(frame==='panzer'){assert.equal(ref.locomotion.mode,'tracks');const height=world(ref.feet[0]).y;if(trackHeight!==null)near(height,trackHeight,'tracks do not play a walking lift');trackHeight=height;}
  }
 }
});

test('ダッシュは低い構えで歩行周期を使わず、空中と攻撃モーションは歩行より優先する',()=>{
 for(const frame of ['knight','strider','wild','brawler']){const f=fixture(frame),{b,u,ref}=f;draw(f);for(let i=0;i<30;i++){b.tick(1/60,{x:0,z:1});draw(f);}assert.equal(ref.locomotion.mode,'walk');assert(b.dash(u,0,1));const phase=ref.locomotion.phase;
  for(let i=0;i<8;i++){b.tick(1/60,{x:0,z:1});draw(f);assert.equal(ref.locomotion.mode,'dash');near(ref.locomotion.phase,phase,'dash does not advance a walk cycle');for(const leg of ref.feet)assert(world(leg.foot).y<.06,'boosting keeps feet low');}
  Object.assign(u,{grounded:false,y:2,vy:0,dashTime:0});b.tick(1/60,{x:0,z:1});draw(f);assert.equal(ref.locomotion.mode,'air');assert(ref.feet.every(leg=>world(leg.foot).y>u.y+.06),'airborne legs are raised');
 }
 for(const kind of ['sword','hammer','dagger']){const f=fixture('knight',kind),{b,u,ref}=f;draw(f);for(let i=0;i<30;i++){b.tick(1/60,{x:0,z:1});draw(f);}assert(b.attack(u));u.attack.elapsed=u.attack.duration*.4;u.motion.elapsed=u.attack.elapsed;draw(f);assert.equal(ref.locomotion.mode,'pose');const fresh=createRobot(u.config,id=>CATALOG[id]);fresh.active=0;draw({...f,ref:fresh});
  for(let j=0;j<2;j++){assert(world(ref.feet[j].foot).distanceTo(world(fresh.feet[j].foot))<1e-8,`${kind}: authored attack feet override prior walking contacts`);assert(world(ref.arms[j].hand).distanceTo(world(fresh.arms[j].hand))<1e-8,`${kind}: authored attack arms override walking`);}
 }
});

test('高台・緩い斜面ではgroundAtを足位置で参照し、接地した足の高さと固定を保つ',()=>{
 for(const terrain of ['platform','ramp']){const f=fixture(),{b,u,ref}=f;
  if(terrain==='platform'){b.stage.obstacles=[{x:0,z:0,w:20,d:20,h:1.3}];u.y=1.3;}else{b.stage.ramps=[{x:0,z:0,w:20,d:20,h:1,direction:1}];u.y=b.groundAt(u.x,u.z);}
  draw(f);let previous=contactSnapshot(ref),checked=0;
  for(let i=0;i<120*2;i++){b.tick(1/120,{x:.6,z:.8});draw(f);const contacts=contactSnapshot(ref);fixedContacts(previous,contacts,terrain);for(const contact of contacts){if(contact.planted){near(contact.position.y,b.groundAt(contact.position.x,contact.position.z)+.035,`${terrain}: planted ankle height`,.001);checked++;}assert(contact.position.y>=b.groundAt(contact.position.x,contact.position.z)+.031,`${terrain}: swinging foot clears terrain`);}previous=contacts;}
  assert(checked>200,'ground test covers real supporting intervals');
 }
});

test('歩行サンプルは同時刻で位相を進めず、ポーズ・空中・履帯には歩行姿勢を返さない',()=>{
 const f=fixture(),{b,u,ref}=f;sampleLocomotion(ref,u,0);b.tick(1/60,{x:0,z:1});const walking=sampleLocomotion(ref,u,b.time);assert.equal(walking.mode,'walk');const before=JSON.stringify(ref.locomotion);const repeated=sampleLocomotion(ref,u,b.time);assert.deepEqual(repeated,walking);assert.equal(JSON.stringify(ref.locomotion),before);
 for(const extra of [{grounded:false},{attack:{weapon:'sword'}},{stun:.2},{knockdown:{phase:'down'}}]){const f=fixture();Object.assign(f.u,extra);assert.equal(sampleLocomotion(f.ref,f.u,1),null);}
 const tracks=fixture('panzer');assert.equal(sampleLocomotion(tracks.ref,tracks.u,1),null);assert.equal(tracks.ref.locomotion.mode,'tracks');
 // Discontinuous changes are new contacts, never extra steps using old travel.
 for(const change of ['horizontal','vertical','rewind','gap']){const f=fixture();draw(f);for(let i=0;i<20;i++){f.b.tick(1/60,{x:0,z:1});draw(f);}const before=f.b.time;
  if(change==='horizontal')f.u.x+=3;if(change==='vertical'){f.u.y+=1.3;f.b.stage.obstacles=[{x:0,z:0,w:20,d:20,h:1.3}];}if(change==='rewind')f.b.time=before-.1;if(change==='gap')f.b.time+=.5;draw(f);
  assert.equal(f.ref.locomotion.mode,'idle');assert.equal(f.ref.locomotion.step,0);assert(!f.ref.locomotion.started);for(const foot of f.ref.locomotion.feet)near(foot.world[1],f.u.y+.035,'reset contacts use the current surface',.005);
 }
});

test('壁で実移動が止まった後は入力を押し続けても足踏みせず、接地位置と歩行位相が止まる',()=>{
 for(const fps of fpsValues){const f=fixture(),{b,u,ref}=f;b.stage.obstacles=[{x:0,z:.5,w:4,d:.1,h:2}];draw(f);
  for(let i=0;i<fps;i++){b.tick(1/fps,{x:0,z:1});draw(f);}assert.equal(u.vz,0);assert.equal(ref.locomotion.mode,'idle');assert(ref.locomotion.feet.every(foot=>foot.planted));const feet=ref.feet.map(leg=>world(leg.foot)),phase=ref.locomotion.phase,step=ref.locomotion.step,z=u.z;
  for(let i=0;i<fps;i++){b.tick(1/fps,{x:0,z:1});draw(f);near(u.z,z,'wall still blocks real travel');near(ref.locomotion.phase,phase,'blocked input does not advance phase');assert.equal(ref.locomotion.step,step);for(let j=0;j<2;j++)assert(world(ref.feet[j].foot).distanceTo(feet[j])<1e-8,'blocked walking keeps both feet planted');}
 }
});

test('射程を超えたロック維持・ターゲット切替の約180度旋回・入力急反転でも支持脚が届き、足を滑らせない',()=>{
 const scenarios=[{scenario:'rangeExit'},{scenario:'targetSwitch'},...[.25,.6,.7,1].map(reverseAt=>({scenario:'reverse',reverseAt}))];
 for(const frame of Object.keys(FRAMES).filter(f=>f!=='panzer'))for(const fps of fpsValues)for(const {scenario,reverseAt}of scenarios){
  const f=fixture(frame);if(scenario==='targetSwitch'){
   const c=f.u.config;f.b=new Battle({allies:[c],enemies:[c,c],setup:{allies:1,enemies:2,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});f.b.countdown=0;f.b.training.freezeAI=true;f.b.stage={...f.b.stage,obstacles:[],ramps:[],width:100,depth:100};f.u=f.b.human;Object.assign(f.u,{x:0,z:0,yaw:Math.PI/2});Object.assign(f.b.entities[1],{x:6,z:0});Object.assign(f.b.entities[2],{x:-6,z:0});
  }else Object.assign(f.b.entities[1],{x:0,z:scenario==='rangeExit'?20:12,dead:false});
  const {b,u,ref}=f;u.target=b.entities[1].id;draw(f);const startingYaw=u.yaw;let previous=contactSnapshot(ref),previousYaw=u.yaw,turn=0,unlocked=false,switches=0,maxZ=u.z;
  for(let i=0;i<fps*2;i++){
   if(scenario==='targetSwitch'&&[Math.round(fps*.7),Math.round(fps*1.4)].includes(i)){const before=u.target;b.cycleTarget(u,1,b.entities.slice(1));assert.notEqual(u.target,before,'the real target-cycle action chooses the other enemy');switches++;}
   b.tick(1/fps,{x:0,z:scenario==='rangeExit'||scenario==='reverse'&&i>=Math.round(fps*reverseAt)?-1:1});draw(f);if(!u.target)unlocked=true;turn+=Math.abs(Math.atan2(Math.sin(u.yaw-previousYaw),Math.cos(u.yaw-previousYaw)));previousYaw=u.yaw;maxZ=Math.max(maxZ,u.z);
   const contacts=contactSnapshot(ref),label=`${frame} ${fps}fps ${scenario}${reverseAt===undefined?'':` at ${reverseAt}s`} frame ${i}`;assert(contacts.some(c=>c.planted),`${label}: support stays on the ground`);fixedContacts(previous,contacts,label);previous=contacts;jointsConnected(ref);
   for(let j=0;j<2;j++){
    const leg=ref.feet[j],bounds=new THREE.Box3().setFromObject(leg.foot);assert(bounds.min.y>=-.002,`${label}: foot enters the floor`);
    if(contacts[j].planted){const target=new THREE.Vector3(...ref.locomotion.feet[j].world);assert(target.distanceTo(world(leg))<=.324+1e-8,`${label}: fixed ankle target exceeds the physical leg reach`);assert(target.distanceTo(contacts[j].position)<1e-7,`${label}: planted ankle was clamped away from its world target`);}
   }
   const before=poseSnapshot(ref);draw(f);assert.equal(poseSnapshot(ref),before,`${label}: same-time rerender is stable`);
  }
  if(scenario==='rangeExit'){assert(!unlocked,'backing outside the old lock range retains a living target');assert.equal(u.target,b.entities[1].id);assert(Math.hypot(u.x-b.entities[1].x,u.z-b.entities[1].z)>lockRange(u.stats)*1.15,'the real backward movement crosses the old lock-loss distance');assert(Math.abs(Math.atan2(Math.sin(u.yaw-startingYaw),Math.cos(u.yaw-startingYaw)))<.075,'the body keeps facing the opponent while walking backward');assert(u.vz<0,'range-exit coverage uses real backward travel');}
  if(scenario==='targetSwitch'){assert.equal(switches,2);assert(turn>Math.PI,'the body actually turns while selecting opposite enemies');}
  if(scenario==='reverse'){assert(u.target,'input reversal keeps the original lock');assert(maxZ>.2&&u.z<maxZ-.8&&u.vz<0,'the real movement input reverses after forward walking');}
 }
});
