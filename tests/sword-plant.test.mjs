import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';
import {sampleMotion} from '../src/motion.js';

const frames=['knight','strider','wild','brawler'];
const position=object=>object.getWorldPosition(new THREE.Vector3());
function fixture(frame='knight',distance=.9){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(part=>[part,`armor:${frame}:${part}`]));config.passives=[];config.abilities=[];config.sets=[0,1].map(()=>({item:'weapon:sword',shield:'shield:basic'}));
 const enemy=defaultConfig(0,true);enemy.abilities=[];
 const b=new Battle({allies:[config],enemies:[enemy],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.stage={...b.stage,obstacles:[],ramps:[],width:100,depth:100};
 const [u,v]=b.entities;Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:distance,yaw:Math.PI,lp:10000});
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const draw=(model=ref)=>{ArenaRenderer.prototype.animateRobot.call({groundAt:b.groundAt.bind(b)},model,u,b.time);model.root.updateMatrixWorld(true);};
 return {b,u,v,ref,draw};
}
function snapshot(ref){return JSON.stringify({root:ref.root.position.toArray(),body:[ref.bodyPivot.position.toArray(),ref.bodyPivot.quaternion.toArray()],head:ref.head.quaternion.toArray(),feet:ref.feet.map(leg=>[position(leg.foot).toArray(),leg.foot.getWorldQuaternion(new THREE.Quaternion()).toArray()]),hands:ref.arms.map(arm=>[position(arm.hand).toArray(),arm.hand.getWorldQuaternion(new THREE.Quaternion()).toArray()])});}
function inspector(f){
 const anchors=[null,null];let maxDrift=0,checked=0,excluded=0;
 const capture=()=>{
  const {u,ref,draw}=f;draw();const attack=u.attack||(u.motion?.weapon==='sword'&&!u.charging?u.motion:null),motion=sampleMotion('sword',attack),approach=attack?.approach,inApproach=approach&&approach.elapsed<approach.duration;
  for(const [i,leg]of ref.feet.entries()){
   const point=position(leg.foot),bounds=new THREE.Box3().setFromObject(leg.foot);assert(bounds.min.y>=-.002,'a planted or swinging foot cannot enter the floor');assert(point.distanceTo(position(leg))<=.324+1e-8,'the actual ankle remains within the physical leg reach');
   assert(leg.upper.localToWorld(new THREE.Vector3(0,-.155,0)).distanceTo(position(leg.knee))<1e-8,'thigh remains connected to the knee');assert(leg.lower.localToWorld(new THREE.Vector3(0,-.17,0)).distanceTo(point)<1e-8,'shin remains connected to the ankle');
   const supported=attack&&motion.feet[i][1]<=.035+1e-9&&!inApproach;
   if(supported){if(anchors[i]?.attack===attack){const drift=point.distanceTo(anchors[i].point);maxDrift=Math.max(maxDrift,drift);checked++;assert(drift<1e-7,`combo ${attack.combo} phase ${(attack.elapsed/attack.duration).toFixed(4)} foot ${i}: grounded anchor slides ${drift}`);}else anchors[i]={attack,point:point.clone()};}else{anchors[i]=null;if(inApproach)excluded++;}
  }
  const before=snapshot(ref);draw();assert.equal(snapshot(ref),before,'drawing the same simulation time cannot advance or relocate a planted foot');
 };
 return {capture,result:()=>({maxDrift,checked,excluded})};
}

test('有限資源の実4段コンボで相手に前進を止められ、終段で吹き飛ばして再び動いても支持足を滑らせない',t=>{
 let maximum=0;
 for(const frame of frames)for(const fps of [30,60,120]){
  const f=fixture(frame),{b,u,v}=f,inspect=inspector(f),starts=[],hits=[];let pressing=false,launched=false,blocked=false,unblocked=false;
  const attack=b.attack.bind(b);b.attack=(unit,charge=0,input={})=>{const ok=attack(unit,charge,input);if(ok&&unit===u)starts.push({id:u.attack.id,combo:u.attack.combo});return ok;};inspect.capture();
  for(let i=0;i<fps*5;i++){
   const rt=b.runtime(u);let input={x:0,z:0};const first=starts.length===0&&!u.attack&&!u.motion,follow=starts.length<4&&u.attack&&u.attack.combo<3&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.15&&rt.cooldown>0;
   if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;}
   const previous=u.z,previousAttack=u.attack,previousPhase=previousAttack?previousAttack.elapsed/previousAttack.duration:null;b.tick(1/fps,input);inspect.capture();
   for(const event of b.consumeEvents())if(event.type==='hit'&&event.attacker===u.id)hits.push(event);
   if(v.knockdown?.phase==='air')launched=true;
   if(previousAttack&&previousPhase>.1&&previousPhase<.5&&u.z-previous<1e-8)blocked=true;
   if(launched&&u.attack?.combo===3&&u.z-previous>1e-5)unblocked=true;
   if(starts.length===4&&!u.attack&&!u.motion)break;
  }
  assert.deepEqual(starts.map(start=>start.combo),[0,1,2,3],`${frame}/${fps}fps: real hit-gated four-cut sequence must complete`);assert.equal(hits.length,4,'each actual cut hits once');assert(launched&&blocked&&unblocked,'the fixture must cover collision-blocked travel followed by finisher launch and resumed travel');assert(u.tension<100&&!b.training.infinite,'the sequence uses finite tension');
  const result=inspect.result();assert(result.checked>fps,'the sequence covers sustained support intervals');maximum=Math.max(maximum,result.maxDrift);
 }
 t.diagnostic(`Maximum actual grounded ankle drift during the blocked/unblocked four-cut sequence: ${maximum.toExponential(3)}.`);
});

test('前入力の高速接近は攻撃原点を運び、接近後の切り足だけを地面へ固定する',()=>{
 for(const fps of [30,60,120]){
  const f=fixture('knight',3),{b,u,ref}=f,inspect=inspector(f);inspect.capture();b.tick(1/fps,{x:0,z:1,attack:true});inspect.capture();b.tick(1/fps,{x:0,z:1});inspect.capture();assert(u.attack?.approach,'forward attack input must produce the real approach');
  const attack=u.attack,initialOrigin=[...attack.origin];let transported=0;
  for(let i=0;i<fps;i++){b.tick(1/fps,{x:0,z:0});inspect.capture();transported=Math.max(transported,Math.hypot(attack.origin[0]-initialOrigin[0],attack.origin[2]-initialOrigin[2]));if(!u.attack&&!u.motion)break;}
  const result=inspect.result();assert(transported>.5,'approach actually transports the attack origin');assert(result.excluded>0,'boost approach feet are excluded from grounded-anchor checks');assert(result.checked>fps/5,'the post-approach cut still checks planted feet');assert(ref.root.position.z>.5,'the rendered root reaches the approach destination');
 }
});

test('同じ攻撃の位相巻き戻しと次の実攻撃で、古い接地位置を持ち越さない',()=>{
 const f=fixture(),{b,u,ref,draw}=f;draw();assert(b.attack(u));for(let i=0;i<24;i++){b.tick(1/60);draw();}assert(u.attack&&u.attack.elapsed/u.attack.duration>.7);
 // The preview/replay can rewind the same attack object without allocating an
 // id. Compare the visible feet with a newly constructed rig at the same state.
 u.attack.elapsed=.015;u.attack.previous=0;u.motion.elapsed=.015;Object.assign(u,{x:0,z:0,yaw:0});draw();const fresh=createRobot(u.config,id=>CATALOG[id]);fresh.active=0;draw(fresh);
 for(let j=0;j<2;j++)assert(position(ref.feet[j].foot).distanceTo(position(fresh.feet[j].foot))<1e-7,'rewound phase resets the previous touchdown cache');
 for(let i=0;i<60&&(u.attack||u.motion||b.runtime(u).cooldown>0);i++){b.tick(1/60);draw();}const oldOrigin=ref.root.position.clone();Object.assign(u,{x:2,z:2,target:null});assert(b.attack(u));draw();const next=createRobot(u.config,id=>CATALOG[id]);next.active=0;draw(next);
 assert(ref.root.position.distanceTo(oldOrigin)>1,'the second real attack starts in a different place');for(let j=0;j<2;j++)assert(position(ref.feet[j].foot).distanceTo(position(next.feet[j].foot))<1e-7,'new attack identity discards the previous attack anchors');
 const before=snapshot(ref);draw();assert.equal(snapshot(ref),before);
});
