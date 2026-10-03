import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {sampleMotion,stepPhase,motionRhythm} from '../src/motion.js';
import {swordVisualPhase} from '../src/sword-motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

const frames=['knight','strider','wild','brawler','panzer'];
const cuts=[0,1,2,3].map(combo=>({combo,charge:0}));
const swings=[...cuts,...[.2,.5,1].map(charge=>({combo:0,charge}))];
const world=o=>o.getWorldPosition(new THREE.Vector3());
function configuration(frame,hasShield){
 const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(part=>[part,`armor:${frame}:${part}`]));
 config.sets[0]={item:'weapon:sword',shield:hasShield?'shield:basic':null};return config;
}
function fixture(frame,hasShield){
 const config=configuration(frame,hasShield),ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
 return {config,ref,u:{config,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true}};
}
function draw(ref,u,time){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}
function at(fixture,swing,p){
 const {ref,u}=fixture;u.attack={id:`${swing.combo}/${swing.charge}`,weapon:'sword',...swing,elapsed:p,duration:1,origin:[0,0,0],yaw:0};
 u.z=motionRhythm('sword',u.attack).advance*stepPhase(u.attack);draw(ref,u,p);
}
function blade(ref){const weapon=ref.weaponAttachments[0];return [.105,.57].map(y=>weapon.localToWorld(new THREE.Vector3(0,y,0)));}
function armorMeshes(ref){
 const meshes=[];ref.bodyPivot.children[0].traverse(mesh=>{
  if(!mesh.isMesh)return;for(let parent=mesh;parent&&parent!==ref.bodyPivot;parent=parent.parent)if(ref.arms.includes(parent))return;meshes.push(mesh);
 });
 ref.legGroup.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
 ref.weaponAttachments.find(weapon=>weapon.name==='shield')?.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});return meshes;
}
function matrices(ref){
 const objects=[ref.root,ref.bodyPivot,ref.head,ref.legGroup,...ref.arms.flatMap(arm=>[arm,arm.upper,arm.elbow,arm.lower,arm.hand]),...ref.feet.flatMap(leg=>leg.foot?[leg,leg.upper,leg.knee,leg.lower,leg.foot]:[leg]),...ref.weaponAttachments];
 return objects.map(object=>object.matrixWorld.elements.slice());
}

test('盾と空き手の役割を分けても全5フレームの通常4段とチャージで刃の世界軌道を変えない',()=>{
 for(const frame of frames){
  const free=fixture(frame,false),shield=fixture(frame,true);
  for(const swing of swings){let distinct=0;
   for(let i=0;i<=80;i++){
    const p=i/80;at(free,swing,p);at(shield,swing,p);const a=blade(free.ref),b=blade(shield.ref);
    for(let point=0;point<2;point++)assert(a[point].distanceTo(b[point])<1e-8,`${frame}/${JSON.stringify(swing)}/${p}: 盾装備で刃の位置が変わる`);
    assert(free.ref.arms[0].hand.getWorldQuaternion(new THREE.Quaternion()).angleTo(shield.ref.arms[0].hand.getWorldQuaternion(new THREE.Quaternion()))<1e-7,'盾のために右手の握りを返す');
    distinct+=world(free.ref.arms[1].hand).distanceTo(world(shield.ref.arms[1].hand))>.03?1:0;
    for(const hasShield of [false,true])assert.equal(sampleMotion('sword',free.u.attack,{hasShield}).hasShield,hasShield,'装備を記録した姿勢を次段へ渡せない');
   }
   assert(distinct>=10,`${frame}/${JSON.stringify(swing)}: 盾と空き手を同じ反対振りにする`);
  }
 }
});

test('段別の時間配分は逆行せず、標的通過中と360度チャージの時間を維持する',()=>{
 const profiles=new Set(),h=1e-6;
 for(let combo=0;combo<4;combo++){
  let previous=0;const start=combo===3?.30:.27,end=combo===3?.47:.45;
  for(let i=0;i<=1200;i++){
   const p=i/1200,value=swordVisualPhase({combo,elapsed:p,duration:1});
   assert(Number.isFinite(value)&&value>=previous-1e-10&&value>=0&&value<=1,'終端の一拍でポーズが逆行する');previous=value;
   if(p>=start&&p<=end)assert.equal(value,p,'標的を通る時刻を見た目だけずらす');
   assert.equal(swordVisualPhase({combo,charge:1,elapsed:p,duration:1}),p,'承認済み360度斬撃の時刻を変更する');
  }
  assert.equal(previous,1);profiles.add(JSON.stringify([.60,.72,.84].map(elapsed=>swordVisualPhase({combo,elapsed,duration:1}))));
  for(const key of [.08,.10,.16,.27,.30,.45,.47,.53,.61,.65,.67,.74,.78,.80,.82]){
   const sample=elapsed=>swordVisualPhase({combo,elapsed,duration:1}),before=(sample(key)-sample(key-h))/h,after=(sample(key+h)-sample(key))/h;
   assert(Math.abs(after-before)<.001,`${combo}/${key}: ため・通過・回収の境界で速度が飛ぶ`);
  }
 }
 assert.equal(profiles.size,4,'4段の回収を同じ時間配分にする');
});

test('盾あり・なしの時間差を含む新しい全身姿勢は関節接続と装甲・床の余裕を保つ',()=>{
 for(const frame of frames)for(const hasShield of [false,true]){
  const f=fixture(frame,hasShield),meshes=armorMeshes(f.ref);
  for(const swing of swings)for(let i=0;i<=160;i++){
   const p=i/160;at(f,swing,p);const [base,tip]=blade(f.ref),direction=tip.clone().sub(base);
   assert.equal(new THREE.Raycaster(base,direction.clone().normalize(),0,direction.length()).intersectObjects(meshes,false).length,0,`${frame}/${hasShield}/${JSON.stringify(swing)}/${p}: 刃が胴・腰・脚・盾を貫通`);
   assert(tip.y>=.02,`${frame}/${hasShield}/${p}: 剣先が床を貫通`);
   for(const arm of f.ref.arms){
    const elbow=arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)),wrist=arm.lower.localToWorld(new THREE.Vector3(0,-.195,0));
    assert(elbow.distanceTo(world(arm.elbow))<1e-8,'肩と肘が離れる');assert(wrist.distanceTo(world(arm.hand))<1e-8,'肘と手が離れる');
   }
   assert(world(f.ref.weaponAttachments[0]).distanceTo(world(f.ref.arms[0].hand))<1e-8,'剣の柄が握りから離れる');
   for(const matrix of matrices(f.ref))assert(matrix.every(Number.isFinite),'時間曲線の境界で関節が非有限になる');
   for(const leg of f.ref.feet)assert(new THREE.Box3().setFromObject(leg.foot||leg).min.y>=0,'足・履帯が床を貫通');
  }
 }
});

test('準備と回収の盾は標的側の防御面へ戻り、振り抜きの空き手と区別する',()=>{
 for(const frame of frames){const f=fixture(frame,true),shield=f.ref.weaponAttachments.find(weapon=>weapon.name==='shield');
  for(const swing of swings)for(const p of [0,.16,.84,1]){
   at(f,swing,p);const normal=new THREE.Vector3(0,0,1).applyQuaternion(shield.getWorldQuaternion(new THREE.Quaternion()));
   // During a charge the complete machine turns; evaluate the shield in the
   // machine's own facing frame rather than forcing it toward world +Z.
   normal.applyQuaternion(f.ref.root.getWorldQuaternion(new THREE.Quaternion()).invert());
   const position=f.ref.root.worldToLocal(world(shield));
   assert(normal.z>.25,`${frame}/${JSON.stringify(swing)}/${p}: 盾面が相手側へ戻らない`);
   assert(position.z>-.02,`${frame}/${JSON.stringify(swing)}/${p}: 盾を背中へ振り抜く`);
  }
 }
});

test('実際の先行入力とチャージ解放でも盾・空き手を含む直前の全身姿勢を継承する',()=>{
 for(const frame of frames)for(const hasShield of [false,true]){
  const config=configuration(frame,hasShield),b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
  b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;const u=b.human,v=b.entities[1],ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
  Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:.9,lp:100000});let boundaries=0,releases=0;
  const original=b.attack.bind(b);b.attack=(unit,...args)=>{
   const continuing=unit.motion?.weapon==='sword',releasing=!!(args[0]>0&&unit.charging&&unit.chargePose);
   draw(ref,unit,b.time);const before=matrices(ref);const result=original(unit,...args);
   if(result&&(continuing||releasing)){
    draw(ref,unit,b.time);const after=matrices(ref);
    for(let index=0;index<before.length;index++)for(let component=0;component<16;component++)assert(Math.abs(after[index][component]-before[index][component])<1e-7,`${frame}/${hasShield}/${unit.combo}: 次段・解放で全身の配置が飛ぶ`);
    assert.equal(unit.attack.blendFrom.hasShield,hasShield);if(releasing)releases++;else boundaries++;
   }
   return result;
  };
  const tick=input=>{b.tick(1/120,input);draw(ref,u,b.time);},tap=()=>{tick({attack:true});tick({attack:false});};tap();
  for(const combo of [1,2,3]){while(b.runtime(u).cooldown>.16)tick({});tap();assert(u.queuedAttack);for(let count=0;count<100&&u.combo!==combo;count++)tick({});assert.equal(u.combo,combo);}
  assert.equal(boundaries,3);
  while(u.attack||b.runtime(u).cooldown>0||u.actionTime>0)tick({});
  for(let count=0;count<100;count++)tick({attack:true});tick({});assert.equal(releases,1);assert.equal(u.attack.charge,1);
 }
});

test('同じ時刻の再描画では終端の一拍と回収の支持位置を進めず、ポーズを再現する',()=>{
 for(const frame of frames)for(const hasShield of [false,true]){
  const f=fixture(frame,hasShield);
  for(const swing of swings)for(const p of [.15,.31,.53,.60,.72,.84]){
   at(f,swing,p);const before=matrices(f.ref);
   for(let repeat=0;repeat<3;repeat++){draw(f.ref,f.u,p);assert.deepEqual(matrices(f.ref),before,`${frame}/${hasShield}/${JSON.stringify(swing)}/${p}: 再描画だけで関節・接地が変わる`);}
  }
 }
});
