import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS,WEAPONS} from '../src/data.js';
import {sampleMotion} from '../src/motion.js';

const frames=['knight','strider','wild','brawler'];
const range=values=>Math.max(...values)-Math.min(...values);
const heading=o=>{const v=new THREE.Vector3(0,0,1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));return Math.atan2(v.x,v.z);};
const bend=arm=>arm.elbow.position.angleTo(arm.hand.position.clone().sub(arm.elbow.position));
function fixture(frame='knight',kind='sword'){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(part=>[part,`armor:${frame}:${part}`]));config.sets=[0,1].map(()=>({item:`weapon:${kind}`,shield:WEAPONS[kind].shield?'shield:basic':null}));config.passives=[];config.abilities=[];
 const b=new Battle({allies:[config],enemies:[config],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.stage={...b.stage,obstacles:[],ramps:[],width:100,depth:100};
 const u=b.human;Object.assign(u,{x:0,z:0,yaw:0,target:b.entities[1].id});Object.assign(b.entities[1],{x:0,z:12,lp:100000});
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const draw=(model=ref)=>{ArenaRenderer.prototype.animateRobot.call({groundAt:b.groundAt.bind(b)},model,u,b.time);model.root.updateMatrixWorld(true);};
 return {b,u,ref,draw};
}
function pose(ref){return JSON.stringify({chest:[ref.bodyPivot.position.toArray(),ref.bodyPivot.quaternion.toArray()],pelvis:[ref.legGroup.position.toArray(),ref.legGroup.quaternion.toArray()],head:ref.head.quaternion.toArray(),arms:ref.arms.map(arm=>[arm.position.toArray(),arm.upper.quaternion.toArray(),arm.lower.quaternion.toArray(),arm.elbow.position.toArray(),arm.hand.position.toArray(),arm.hand.quaternion.toArray()])});}

test('歩行は肩と肘から腕を振り、胸と骨盤を逆にひねり、頭の向きを安定させる',t=>{
 let maxShoulderSpeed=0,maxHeadRange=0,minChestRange=Infinity;
 for(const frame of frames)for(const fps of [30,60,120]){
  const {b,ref,draw}=fixture(frame);draw();const rows=[],firstUpper=[],previousUpper=ref.arms.map(arm=>arm.upper.quaternion.clone());
  for(let i=0;i<fps*2;i++){
   b.tick(1/fps,{x:0,z:1});draw();
   for(const [j,arm]of ref.arms.entries()){const speed=previousUpper[j].angleTo(arm.upper.quaternion)*fps;maxShoulderSpeed=Math.max(maxShoulderSpeed,speed);assert(speed<12,`${frame}/${fps}fps: shoulder snaps at ${speed} rad/s`);previousUpper[j].copy(arm.upper.quaternion);}
   const before=pose(ref);draw();assert.equal(pose(ref),before,'same-time drawing cannot advance the head, chest or arm motion');
   if(i<fps*.3)continue;
   if(!firstUpper.length)firstUpper.push(...ref.arms.map(arm=>arm.upper.quaternion.clone()));
   rows.push({chest:heading(ref.bodyPivot),hip:ref.legGroup.rotation.y,head:heading(ref.head),arms:ref.arms.map((arm,j)=>({upper:firstUpper[j].angleTo(arm.upper.quaternion),bend:bend(arm),z:arm.position.z}))});
  }
  const chest=rows.map(row=>row.chest),hip=rows.map(row=>row.hip),head=rows.map(row=>row.head),chestMean=chest.reduce((a,b)=>a+b)/rows.length,hipMean=hip.reduce((a,b)=>a+b)/rows.length,covariance=rows.reduce((sum,row)=>sum+(row.chest-chestMean)*(row.hip-hipMean),0)/rows.length;
  assert(range(chest)>.12,`${frame}/${fps}fps: chest must participate visibly in walking`);assert(range(hip)>.035,`${frame}/${fps}fps: pelvis must participate in walking`);assert(covariance<-.0002,`${frame}/${fps}fps: chest and pelvis must counterrotate`);
  assert(range(head)<range(chest)*.35,`${frame}/${fps}fps: head follows the chest sway instead of maintaining the view`);
  for(let j=0;j<2;j++){assert(Math.max(...rows.map(row=>row.arms[j].upper))>(j?.10:.18),`${frame}: upper arm ${j} is frozen in its ready pose`);assert(range(rows.map(row=>row.arms[j].bend))>(j?.04:.12),`${frame}: elbow ${j} does not participate in the arm swing`);assert(range(rows.map(row=>row.arms[j].z))>.008,`${frame}: shoulder socket ${j} is rigid`);}
  maxHeadRange=Math.max(maxHeadRange,range(head));minChestRange=Math.min(minChestRange,range(chest));
 }
 t.diagnostic(`Actual maximum shoulder speed ${maxShoulderSpeed.toFixed(3)} rad/s; minimum chest heading range ${(minChestRange*180/Math.PI).toFixed(2)} degrees; maximum head heading range ${(maxHeadRange*180/Math.PI).toFixed(2)} degrees.`);
});

test('全身を使って前後・横・斜めに歩いてもソードの刃は胴・頭・盾・床を貫通しない',()=>{
 for(const frame of frames)for(const [x,z]of [[0,1],[0,-1],[1,0],[-1,0],[Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2]]){
  const {b,ref,draw}=fixture(frame),meshes=[];
  ref.bodyPivot.children[0].traverse(mesh=>{if(!mesh.isMesh)return;for(let p=mesh;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(mesh);});
  ref.weaponAttachments.find(weapon=>weapon.name==='shield')?.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});draw();
  for(let i=0;i<120;i++){
   b.tick(1/60,{x,z});draw();const weapon=ref.weaponAttachments[0],a=weapon.localToWorld(new THREE.Vector3(0,.105,0)),tip=weapon.localToWorld(new THREE.Vector3(0,.57,0)),direction=tip.clone().sub(a),hits=new THREE.Raycaster(a,direction.clone().normalize(),0,direction.length()).intersectObjects(meshes,false);
   assert.equal(hits.length,0,`${frame} direction ${x}/${z} frame ${i}: walking sword enters the body, head or shield`);assert(tip.y>=.02,`${frame}: walking sword enters the floor`);
  }
 }
});

test('歩行の腕振りはソードの握りと共有の構えを変えず、攻撃とチャージ姿勢に混ざらない',()=>{
 const ready=sampleMotion('sword',null,{hasShield:true}),saved=JSON.stringify(ready),wrists=['right','left'].map(side=>new THREE.Quaternion().fromArray(ready.joints[side].wrist));
 for(const frame of frames){
  const {b,u,ref,draw}=fixture(frame);draw();
  for(let i=0;i<90;i++){b.tick(1/60,{x:0,z:1});draw();for(const [j,arm]of ref.arms.entries()){const wrist=arm.lower.quaternion.clone().invert().multiply(arm.hand.quaternion);assert(wrist.angleTo(wrists[j])<1e-7,'arm swing must preserve the authored wrist grip');}}
  assert.equal(JSON.stringify(sampleMotion('sword',null,{hasShield:true})),saved,'walking must not mutate a shared ready pose');
  for(const state of ['attack','charge']){
   Object.assign(u,{attack:state==='attack'?{weapon:'sword',combo:1,elapsed:.4,duration:1}:null,motion:null,charging:state==='charge',chargePose:state==='charge'?{amount:.65,elapsed:.52}:null});draw();
   const fresh=createRobot(u.config,id=>CATALOG[id]);fresh.active=0;draw(fresh);assert.equal(pose(ref),pose(fresh),`${state}: authored body and arms cannot depend on previous walking`);
  }
 }
 assert.equal(JSON.stringify(sampleMotion('sword',null,{hasShield:true})),saved);
});
