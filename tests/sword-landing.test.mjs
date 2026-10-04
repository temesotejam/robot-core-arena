import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {ArenaRenderer,createRobot,ROBOT_PROPORTIONS} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

const frames=['knight','strider','wild','brawler','panzer'];
const position=object=>object.getWorldPosition(new THREE.Vector3());
function fixture(frame='knight',shield=true){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(part=>[part,`armor:${frame}:${part}`]));config.passives=[];config.abilities=[];config.sets=[0,1].map(()=>({item:'weapon:sword',shield:shield?'shield:basic':null}));
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const u={config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vy:0,vz:0,dashTime:0,grounded:true};
 return {config,ref,u};
}
function draw(ref,u,time,groundAt){ArenaRenderer.prototype.animateRobot.call({groundAt},ref,u,time);ref.root.updateMatrixWorld(true);}
function snapshot(ref){return JSON.stringify({root:[ref.root.position.toArray(),ref.root.quaternion.toArray()],body:[ref.bodyPivot.position.toArray(),ref.bodyPivot.quaternion.toArray()],head:ref.head.quaternion.toArray(),legs:[ref.legGroup.position.toArray(),ref.legGroup.quaternion.toArray()],feet:ref.feet.map(leg=>[position(leg.foot||leg).toArray(),(leg.foot||leg).getWorldQuaternion(new THREE.Quaternion()).toArray()]),arms:ref.arms.map(arm=>[arm.position.toArray(),arm.upper.quaternion.toArray(),arm.hand.position.toArray(),arm.hand.quaternion.toArray()])});}
function selfMeshes(ref){
 const result=[];ref.bodyPivot.children[0].traverse(mesh=>{if(!mesh.isMesh)return;for(let parent=mesh;parent&&parent!==ref.bodyPivot;parent=parent.parent)if(ref.arms.includes(parent))return;result.push(mesh);});
 ref.legGroup.traverse(mesh=>{if(mesh.isMesh)result.push(mesh);});ref.weaponAttachments.find(weapon=>weapon.name==='shield')?.traverse(mesh=>{if(mesh.isMesh)result.push(mesh);});return result;
}
function bladeHits(ref,meshes){const weapon=ref.weaponAttachments[0],base=weapon.localToWorld(new THREE.Vector3(0,.105,0)),tip=weapon.localToWorld(new THREE.Vector3(0,.57,0)),direction=tip.clone().sub(base);return new THREE.Raycaster(base,direction.clone().normalize(),0,direction.length()).intersectObjects(meshes,false);}
function land(ref,u,time=1){u.grounded=false;u.y=.08;u.vy=-5;draw(ref,u,time-.02);u.grounded=true;u.y=0;u.vy=0;draw(ref,u,time);}

test('実ジャンプの着地は低い脚と胴を保持してから別々に回復し、描画でシミュレーションを変更しない',()=>{
 for(const frame of frames)for(const fps of [30,60,120]){
  const {config,ref}=fixture(frame),battle=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});battle.countdown=0;battle.training.freezeAI=true;battle.stage={...battle.stage,obstacles:[],ramps:[],width:100,depth:100};
  const u=battle.human;Object.assign(u,{x:0,z:0,yaw:0,target:null});draw(ref,u,0);const idle=ref.bodyPivot.position.y;assert(battle.jump(u));draw(ref,u,0);
  let landing=null,lowest=idle,lateChest=false,lateHead=false,settleFrames=0;
  for(let index=0;index<fps*5;index++){
   battle.tick(1/fps,{x:0,z:0});const before=JSON.stringify(u);draw(ref,u,battle.time);assert.equal(JSON.stringify(u),before,'landing rendering must preserve position, velocity, resources, action and ground state');
   const first=snapshot(ref);draw(ref,u,battle.time);assert.equal(snapshot(ref),first,'rendering the same simulation time cannot add another landing step');
   if(landing===null&&u.grounded){landing=battle.time;assert.equal(ref.landing.start,landing,'the first actual ground transition starts the visual response');}
   if(landing!==null){const elapsed=battle.time-landing;lowest=Math.min(lowest,ref.bodyPivot.position.y);if(elapsed>.09&&elapsed<.14){settleFrames++;assert(ref.bodyPivot.position.y<idle-.02,'the receiving pose has a visible low interval');}
    if(elapsed>.35&&elapsed<.39){assert(Math.abs(ref.bodyPivot.position.y-idle)<1e-8,'pelvis has recovered before the chest');lateChest||=ref.bodyPivot.rotation.x>.015+.001;}
    if(elapsed>.43&&elapsed<.48){assert(Math.abs(ref.bodyPivot.rotation.x-.015)<1e-8,'chest has recovered before the gaze');lateHead||=ref.head.rotation.x<-.015*.65-.001;}
    if(elapsed>.55)break;
   }
  }
  assert(landing!==null&&settleFrames>0&&lowest<idle-.025&&lateChest&&lateHead,`${frame}/${fps}: actual jump must show receiving, hold, chest and head recovery`);assert.equal(ref.landing.start,null,'the landing finishes without looping');
 }
});

test('全フレームの着地回復で足・履帯の支持位置、骨の長さと刃の非貫通を保つ',()=>{
 for(const frame of frames)for(const shield of [false,true])for(const yaw of [0,.75]){
  const {ref,u}=fixture(frame,shield),meshes=selfMeshes(ref);u.yaw=yaw;land(ref,u);const feet=ref.feet.map(leg=>position(leg.foot||leg)),tracks=ref.legGroup.position.clone(),leftHeight=ref.arms[1].position.y+ref.arms[1].hand.position.y;let raised=leftHeight;
  for(let index=0;index<=300;index++){
   draw(ref,u,1+index/600);assert.equal(bladeHits(ref,meshes).length,0,`${frame}/${shield}/${yaw}/${index}: resting sword intersects torso, pelvis, legs or shield`);
   assert(ref.root.position.distanceTo(new THREE.Vector3(u.x,u.y,u.z))<1e-10,'landing never moves the simulation root');
   for(const [side,leg]of ref.feet.entries()){
    const ankle=position(leg.foot||leg);assert(ankle.distanceTo(feet[side])<1e-8,'compressing the pelvis cannot lift or slide a ground contact');assert(new THREE.Box3().setFromObject(leg.foot||leg).min.y>=0,'landing foot or track cannot enter the floor');
    if(leg.knee){assert(leg.upper.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.thigh,0)).distanceTo(position(leg.knee))<1e-8,'thigh remains connected');assert(leg.lower.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.shin,0)).distanceTo(ankle)<1e-8,'shin remains connected');}
   }
   for(const arm of ref.arms){assert(arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(position(arm.elbow))<1e-8,'upper arm remains connected');assert(arm.lower.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(position(arm.hand))<1e-8,'forearm remains connected');}
   if(frame==='panzer')assert(ref.legGroup.position.distanceTo(tracks)<1e-10,'upper-body receiving pose cannot bounce the tracks');
   raised=Math.max(raised,ref.arms[1].position.y+ref.arms[1].hand.position.y);
  }
  if(shield)assert(raised-leftHeight>.04,'the equipped shield rises in front independently of body compression');
  else assert(Math.abs(raised-leftHeight)<1e-10,'a free hand is not made to carry an absent shield');
 }
});

test('着地直後の通常・チャージ攻撃は承認済みの全身斬撃を優先し、回復後に着地を再開しない',()=>{
 for(const frame of frames)for(const charge of [0,1]){
  const {ref,u}=fixture(frame);land(ref,u);draw(ref,u,1.1);assert(ref.landing.start!==null);
  const fresh=createRobot(u.config,id=>CATALOG[id]);fresh.active=0;
  for(let index=0;index<=160;index++){
   const elapsed=index/160;u.attack={id:'landing-cut',weapon:'sword',combo:0,charge,elapsed,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,1.1+elapsed);draw(fresh,u,1.1+elapsed);
   assert.equal(snapshot(ref),snapshot(fresh),`${frame}/${charge}/${elapsed}: a recent landing cannot shift any active sword pose or contact`);
  }
  u.attack=null;draw(ref,u,2.2);assert.equal(ref.landing.start,null,'landing is not deferred until an attack ends');
  land(ref,u,3);u.charging=true;u.charge=.8;u.chargePose={amount:.8,elapsed:.3};draw(ref,u,3.1);assert.equal(ref.landing.start,null,'charge pose also takes priority');u.charging=false;draw(ref,u,3.15);assert.equal(ref.landing.start,null);
 }
});

test('着地後にすぐ歩いても斜面で通常の歩幅・足の運び・支持位置を変更しない',()=>{
 const floor=(x,z)=>.12*x+.08*z;
 for(const frame of frames)for(const fps of [30,60,120]){
  const {ref,u}=fixture(frame),baseline=createRobot(u.config,id=>CATALOG[id]);baseline.active=0;
  u.grounded=false;u.y=.08;u.vy=-5;draw(ref,u,.98,floor);draw(baseline,u,.98,floor);u.grounded=true;u.y=0;u.vy=0;draw(ref,u,1,floor);draw(baseline,u,1,floor);baseline.landing.start=null;
  for(let index=1;index<=fps*.65;index++){
   const time=1+index/fps;u.x=(time-1)*.7;u.z=(time-1)*.4;u.y=floor(u.x,u.z);u.vx=.7;u.vz=.4;u.yaw=.4;draw(ref,u,time,floor);draw(baseline,u,time,floor);
   for(const [side,leg]of ref.feet.entries())assert(position(leg.foot||leg).distanceTo(position(baseline.feet[side].foot||baseline.feet[side]))<1e-8,`${frame}/${fps}/${index}/${side}: landing changed an actual walking foot target`);
   assert.equal(ref.locomotion.phase,baseline.locomotion.phase,'the landing does not change the travel-driven cadence');assert.equal(ref.locomotion.step,baseline.locomotion.step);assert.equal(ref.locomotion.stepLength,baseline.locomotion.stepLength);
  }
 }
});

test('初回描画・巻き戻し・テレポート・装備変更・ノックダウンでは偽の着地を作らない',()=>{
 const {ref,u}=fixture();draw(ref,u,0);draw(ref,u,.1);assert.equal(ref.landing.start,null,'initial grounded pose is not a landing');
 land(ref,u,1);draw(ref,u,1.1);assert(ref.landing.start!==null);draw(ref,u,.2);assert.equal(ref.landing.start,null,'rewinding simulation time clears a previous landing');
 land(ref,u,2);u.x=2;draw(ref,u,2.1);assert.equal(ref.landing.start,null,'teleport discards previous contact history');
 land(ref,u,3);ref.changeWeapons({item:'weapon:dagger'});draw(ref,u,3.1);assert.equal(ref.landing.start,null,'sword landing does not leak into another weapon');
 ref.changeWeapons(u.config.sets[0]);u.grounded=false;u.y=.05;u.vy=-3;u.knockdown={phase:'air',elapsed:0,away:0};draw(ref,u,4);u.grounded=true;u.y=0;u.vy=0;u.knockdown={phase:'down',elapsed:0,away:0};u.down=1;draw(ref,u,4.05);assert.equal(ref.landing.start,null,'a knockdown landing uses its own recovery');
});
