import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {sampleMotion,stepPhase,motionRhythm} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

const frames=['knight','strider','wild','brawler','panzer'];
function fixture(frame){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 const u={config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true};
 return {config,ref,u};
}
function draw(ref,u,time){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}
function selfMeshes(ref){
 const meshes=[];ref.bodyPivot.children[0].traverse(m=>{
  if(!m.isMesh)return;for(let p=m;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(m);
 });
 ref.legGroup.traverse(m=>{if(m.isMesh)meshes.push(m);});
 ref.weaponAttachments.find(w=>w.name==='shield')?.traverse(m=>{if(m.isMesh)meshes.push(m);});
 return meshes;
}
function bladeHits(ref,meshes){
 const w=ref.weaponAttachments[0],a=w.localToWorld(new THREE.Vector3(0,.105,0)),b=w.localToWorld(new THREE.Vector3(0,.57,0)),d=b.clone().sub(a);
 return new THREE.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObjects(meshes,false);
}
function feet(ref){return ref.feet.map(leg=>(leg.foot||leg).getWorldPosition(new THREE.Vector3()));}

test('ソードの低い荷重・受け止め・回収は腰装甲と脚・履帯まで含めて自機を貫通しない',()=>{
 for(const frame of frames)for(const queued of [false,true]){
  const {ref,u}=fixture(frame),meshes=selfMeshes(ref);let from=null;
  for(let combo=0;combo<4;combo++){
   const next=(combo+1)%4;u.queuedAttack=queued?{remaining:.1}:null;Object.assign(u,{combo,comboWindow:1,comboHit:queued,comboChain:{weapon:'sword',set:0,hits:new Map()}});
   for(let i=0;i<=480;i++){
    const p=i/480;u.attack={id:`${frame}-${combo}`,weapon:'sword',combo,elapsed:p,duration:1,origin:[0,0,0],yaw:0,blendFrom:from};u.z=.24*stepPhase(u.attack);draw(ref,u,p);
    assert.equal(bladeHits(ref,meshes).length,0,`${frame}/${queued}/${combo}/${p}: 刃が腰・脚・胴・盾を貫通`);
    for(const leg of ref.feet)assert(new THREE.Box3().setFromObject(leg.foot||leg).min.y>=0,`${frame}/${combo}/${p}: 足が床を貫通`);
   }
   if(queued)from=sampleMotion('sword',{combo,elapsed:1,duration:1,blendFrom:from},{nextCombo:next});
  }
  u.queuedAttack=null;
  for(const amount of [.2,.5,1])for(let i=0;i<=240;i++){
   const p=i/240;u.attack={id:`charge-${amount}`,weapon:'sword',combo:0,charge:amount,elapsed:p,duration:1,origin:[0,0,0],yaw:0};u.z=motionRhythm('sword',u.attack).advance*stepPhase(u.attack);draw(ref,u,p);
   assert.equal(bladeHits(ref,meshes).length,0,`${frame}/${amount}/${p}: 回転斬撃が脚・履帯を貫通`);
  }
 }
});

test('各段の着地姿勢を変えても支持足を固定し、回収の踏み直しでは後ろ足が支える',()=>{
 for(const frame of frames.filter(f=>f!=='panzer'))for(const yaw of [0,.7])for(let combo=0;combo<4;combo++){
  const {ref,u}=fixture(frame),anchors=[null,null];let recoveryLift=false,low=Infinity,high=-Infinity;
  for(let i=0;i<=480;i++){
   const p=i/480;u.attack={id:`${frame}-${combo}`,weapon:'sword',combo,elapsed:p,duration:1,origin:[0,0,0],yaw};const travel=.24*stepPhase(u.attack);u.x=Math.sin(yaw)*travel;u.z=Math.cos(yaw)*travel;u.yaw=yaw+.13*Math.sin(p*4);draw(ref,u,p);
   const f=sampleMotion('sword',u.attack),points=feet(ref);let contacts=0;
   for(let j=0;j<2;j++){
    if(f.feet[j][1]>.035+1e-9){anchors[j]=null;if(p>.74&&p<.94&&j===1)recoveryLift=true;}
    else {contacts++;anchors[j]??=points[j].clone();assert(points[j].distanceTo(anchors[j])<1e-7,`${frame}/${combo}/${p}/${j}: 支持足が滑る`);}
    const leg=ref.feet[j],knee=leg.upper.localToWorld(new THREE.Vector3(0,-.155,0)),ankle=leg.lower.localToWorld(new THREE.Vector3(0,-.17,0));
    assert(knee.distanceTo(leg.knee.getWorldPosition(new THREE.Vector3()))<1e-8);assert(ankle.distanceTo(points[j])<1e-8);
   }
   assert(contacts>=1,'通常攻撃で両足を同時に浮かせる');low=Math.min(low,ref.bodyPivot.position.y);high=Math.max(high,ref.bodyPivot.position.y);
  }
  assert(recoveryLift,'足を接地したまま回収位置へ滑らせる');assert(high-low>.022,`${frame}/${combo}: 身体の高さが固定されたまま`);
 }
});

test('実際の先行入力で次段が始まる瞬間も接地位置と全身姿勢を引き継ぐ',()=>{
 for(const frame of frames){
  const {config,ref}=fixture(frame),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;
  const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:.9,lp:100000});let boundaries=0;
  const attack=b.attack.bind(b);b.attack=(unit,...args)=>{
   draw(ref,unit,b.time);const old=unit.motion&&sampleMotion('sword',unit.motion,{nextCombo:unit.queuedAttack?(unit.combo+1)%4:null}),before=feet(ref),root=ref.root.position.clone();
   const ok=attack(unit,...args);if(ok&&old){draw(ref,unit,b.time);const after=feet(ref);assert(ref.root.position.distanceTo(root)<1e-9);for(let j=0;j<2;j++)assert(after[j].distanceTo(before[j])<1e-7,`${frame}/${unit.combo}/${j}: 次段の開始で足が飛ぶ`);const f=sampleMotion('sword',unit.attack);for(const key of ['head','body','hipYaw','drop','shift','joints','bladePivot'])assert.deepEqual(f[key],old[key],`${frame}/${unit.combo}: ${key} が飛ぶ`);boundaries++;}return ok;
  };
  const tick=input=>{b.tick(1/120,input);draw(ref,u,b.time);},tap=()=>{tick({attack:true});tick({attack:false});};tap();
  for(const stage of [1,2,3]){
   while(b.runtime(u).cooldown>.16)tick({});tap();assert(u.queuedAttack);
   for(let n=0;n<80&&u.combo!==stage;n++)tick({});assert.equal(u.combo,stage);
  }
  assert.equal(boundaries,3);
 }
});
