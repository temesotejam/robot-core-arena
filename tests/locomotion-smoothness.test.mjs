import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

const world=o=>o.getWorldPosition(new THREE.Vector3());
function fixture(frame){
 const c=defaultConfig();c.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));c.passives=[];c.abilities=[];
 const b=new Battle({allies:[c],enemies:[c],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.stage={...b.stage,obstacles:[],ramps:[],width:100,depth:100};
 const u=b.human;Object.assign(u,{x:0,z:0,yaw:0,target:b.entities[1].id});Object.assign(b.entities[1],{x:0,z:12,lp:100000});
 const ref=createRobot(c,id=>CATALOG[id]);ref.active=0;
 const draw=()=>{ArenaRenderer.prototype.animateRobot.call({groundAt:b.groundAt.bind(b)},ref,u,b.time);ref.root.updateMatrixWorld(true);};
 const sample=()=>({y:world(ref.bodyPivot).y,bends:ref.feet.map(leg=>{const hip=world(leg),knee=world(leg.knee),ankle=world(leg.foot);return knee.clone().sub(hip).angleTo(ankle.clone().sub(knee))*180/Math.PI;}),contacts:ref.feet.map((leg,i)=>({planted:ref.locomotion.feet[i].planted,id:ref.locomotion.feet[i].contact,ankle:world(leg.foot)}))});
 return {b,ref,draw,sample};
}

test('速い通常歩行は腰の上下動と膝の急変を抑え、開始・停止を含めて実際の脚と接地を保つ',t=>{
 let observed={pelvis:0,steadyPelvis:0,knee:0,steadyKnee:0};
 for(const frame of ['knight','strider','wild','brawler'])for(const fps of [30,60,120])for(const [name,x,z]of [['forward',0,1],['backward',0,-1],['strafe',1,0]]){
  const {b,ref,draw,sample}=fixture(frame);draw();let previous=sample();const label=`${frame}/${fps}fps/${name}`;
  const maxima={pelvis:0,steadyPelvis:0,knee:0,steadyKnee:0};
  for(let i=0;i<fps*3.5;i++){
   const walking=i<fps*3;b.tick(1/fps,{x:walking?x:0,z:walking?z:0});draw();const next=sample(),pelvis=Math.abs(next.y-previous.y)*fps,knee=Math.max(...next.bends.map((v,j)=>Math.abs(v-previous.bends[j])))*fps;
   maxima.pelvis=Math.max(maxima.pelvis,pelvis);maxima.knee=Math.max(maxima.knee,knee);
   if(i>=fps*.3&&walking){maxima.steadyPelvis=Math.max(maxima.steadyPelvis,pelvis);maxima.steadyKnee=Math.max(maxima.steadyKnee,knee);}
   assert(next.contacts.some(f=>f.planted),`${label}: each frame keeps a supporting foot`);
   for(const [j,leg]of ref.feet.entries()){
    assert(leg.upper.localToWorld(new THREE.Vector3(0,-.155,0)).distanceTo(world(leg.knee))<1e-8,`${label}: thigh remains connected`);
    assert(leg.lower.localToWorld(new THREE.Vector3(0,-.17,0)).distanceTo(next.contacts[j].ankle)<1e-8,`${label}: shin remains connected`);
    const contact=next.contacts[j],old=previous.contacts[j];
    if(contact.planted){const target=new THREE.Vector3(...ref.locomotion.feet[j].world);assert(target.distanceTo(world(leg))<=.324+1e-8,`${label}: planted ankle is physically reachable`);assert(contact.ankle.distanceTo(target)<1e-7,`${label}: pelvis smoothing preserves the actual fixed contact`);}
    if(contact.planted&&old.planted&&contact.id===old.id)assert(contact.ankle.distanceTo(old.ankle)<1e-7,`${label}: planted foot does not slide`);
   }
   previous=next;
  }
  // These bounds measure the visible model rather than a gait formula. The
  // faulty wide-stride version reached 3.98 m/s vertically and 4287 deg/s at
  // the knee; a faster foot cycle can retain continuous motion below these.
  assert(maxima.pelvis<=.60,`${label}: pelvis jumps vertically at ${maxima.pelvis.toFixed(3)} m/s`);
  assert(maxima.steadyPelvis<=.30,`${label}: continuing walk pumps the pelvis at ${maxima.steadyPelvis.toFixed(3)} m/s`);
  assert(maxima.knee<=3000,`${label}: knee snaps at ${maxima.knee.toFixed(0)} deg/s`);
  assert(maxima.steadyKnee<=2500,`${label}: continuing walk snaps the knee at ${maxima.steadyKnee.toFixed(0)} deg/s`);
  for(const key of Object.keys(observed))observed[key]=Math.max(observed[key],maxima[key]);
 }
 t.diagnostic(`Maximum visible pelvis speed ${observed.pelvis.toFixed(3)} m/s (${observed.steadyPelvis.toFixed(3)} steady); knee bend speed ${observed.knee.toFixed(0)} deg/s (${observed.steadyKnee.toFixed(0)} steady).`);
});
