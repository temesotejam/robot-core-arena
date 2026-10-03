import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.min.js';
import {Battle} from '../src/sim.js';
import {sampleMotion,motionRhythm} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig,cost} from '../src/customize.js';
import {CATALOG,WEAPONS,PARTS,SPECIALS} from '../src/data.js';

const frames=['knight','strider','wild','brawler','panzer'];
const point=o=>o.getWorldPosition(new THREE.Vector3());
const orientation=o=>o.getWorldQuaternion(new THREE.Quaternion());
function fixture(frame='knight',passives=[]){
 const config=defaultConfig();config.passives=passives;config.abilities=['knuckle:tech'];
 config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));config.sets[0]={item:'weapon:knuckle',shield:null,separate:false};
 const b=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});
 b.countdown=0;b.training.freezeAI=true;const u=b.human,v=b.entities[1];Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:5});
 const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;return {config,b,u,v,ref};
}
function draw(ref,u,time=0){ArenaRenderer.prototype.animateRobot.call({},ref,u,time);ref.root.updateMatrixWorld(true);}
function skeleton(ref){return [ref.bodyPivot,ref.legGroup,ref.head,...ref.arms.flatMap(a=>[a.shoulder,a.upper,a.elbow,a.lower,a.hand]),...ref.weaponAttachments].map(o=>({position:point(o),quaternion:orientation(o)}));}
function continuous(before,after,label,position=.002,angle=.02){for(let i=0;i<before.length;i++){
 assert(before[i].position.distanceTo(after[i].position)<position,`${label}/${i}: メッシュ位置が飛ぶ`);
 assert(before[i].quaternion.angleTo(after[i].quaternion)<angle,`${label}/${i}: メッシュ角度が飛ぶ`);
}}
function attack(u,combo,p,extra={}){u.charging=false;u.attack={id:`${combo}/${extra.charge||extra.skill||0}`,weapon:'knuckle',normal:true,combo,legFrame:CATALOG[u.config.armor.legs].frame,elapsed:p,duration:1,origin:[0,0,0],yaw:0,...extra};}
function fist(ref,side){return ref.weaponAttachments[side].localToWorld(new THREE.Vector3(0,0,.13));}
function torsoFist(ref,side){return ref.bodyPivot.children[0].worldToLocal(fist(ref,side));}

test('ナックルの実入力ガードは5フレームの肩・肘・拳を跳ねさせず待機へ戻る',()=>{
 for(const frame of frames)for(const fps of [30,60,120]){
  const {b,u,ref}=fixture(frame);draw(ref,u,b.time);const before=skeleton(ref);b.tick(1/fps,{guard:true});draw(ref,u,b.time);
  assert(u.guard);continuous(before,skeleton(ref),`${frame}/${fps}/guard`);
  const guarded=skeleton(ref);b.tick(1/fps,{});draw(ref,u,b.time);assert(!u.guard);continuous(guarded,skeleton(ref),`${frame}/${fps}/release`);
 }
});

test('スピードチャージでも満溜めの構えを完成させ、実解除の同じ時刻で全身を継承する',()=>{
 for(const frame of frames)for(const fps of [30,60,120]){
  let ordinary=null;
  for(const fast of [false,true]){
   const {b,u,ref}=fixture(frame,fast?['charge']:[]),dt=1/fps;
   while(u.charge<b.maxCharge(u)-1e-9){b.tick(dt,{attack:true});draw(ref,u,b.time);assert(!u.attack);}
   assert.equal(u.chargePose.amount,1);assert.equal(b.maxCharge(u),WEAPONS.knuckle.charge*(fast?.5:1));
   const held=sampleMotion('knuckle',null,{charging:u.chargePose,legFrame:frame}),pose=skeleton(ref);if(ordinary)for(const key of ['joints','body','hipYaw','drop','shift'])assert.deepEqual(held[key],ordinary[key],`${frame}/${fps}: 短縮した満溜めが未完成`);else ordinary=held;
   const original=b.attack.bind(b),tension=u.tension;let released=false;
   b.attack=(unit,charge,...args)=>{draw(ref,unit,b.time);const before=skeleton(ref);assert(original(unit,charge,...args));assert.equal(charge,1);assert.equal(unit.attack.elapsed,0);
    draw(ref,unit,b.time);continuous(before,skeleton(ref),`${frame}/${fps}/${fast}/p0`,1e-7,1e-7);assert.deepEqual(unit.attack.blendFrom.joints,held.joints);released=true;return true;};
   b.tick(dt,{attack:false});draw(ref,u,b.time);assert(released);assert(!u.charging);assert.equal(u.chargePose,null);
   assert(Math.abs(tension-u.tension-cost(u.stats,'attack',WEAPONS.knuckle.tension*1.6))<1e-8);assert(pose.every(o=>o.position.toArray().every(Number.isFinite)));
  }
 }
});

test('満溜めのガード取消は即時防御と資源を守り、表示だけ100msで戻って再入力を継承する',()=>{
 const whole=ref=>skeleton(ref).concat(ref.feet.flatMap(leg=>[leg,...(leg.knee?[leg.upper,leg.knee,leg.lower,leg.foot]:[])]).map(o=>({position:point(o),quaternion:orientation(o)})));
 const repeat=(ref,u,time,label)=>{const before=whole(ref);for(let n=0;n<3;n++){draw(ref,u,time);continuous(before,whole(ref),label,1e-8,1e-7);}};
 for(const frame of frames)for(const fps of [30,60,120])for(const mode of ['guard','release','recharge','status']){
  const {config,b,u,ref}=fixture(frame),dt=1/fps,context=`${frame}/${fps}/${mode}`;
  while(u.charge<b.maxCharge(u)-1e-9){b.tick(dt,{attack:true});draw(ref,u,b.time);}const held=whole(ref),tension=u.tension,c=u.c;
  b.consumeEvents();b.tick(dt,{guard:true});draw(ref,u,b.time);const start=b.time;
  continuous(held,whole(ref),`${context}/cancel`,1e-7,1e-7);repeat(ref,u,b.time,`${context}/same-time`);
  const cancelled=()=>{assert(u.guard);assert(!u.charging);assert.equal(u.charge,0);assert.equal(u.chargePose,null);assert.equal(u.attack,null);assert.equal(b.runtime(u).cooldown,0);assert.equal(u.tension,tension);assert.equal(u.c,c);assert(!b.consumeEvents().some(e=>e.type==='attack'&&e.unit===u.id));};
  cancelled();
  if(mode==='status'){
   u.status='stun';u.statusTime=.2;b.tick(dt,{guard:true});draw(ref,u,b.time);assert(u.statusTime>0);assert(!u.guard&&!u.charging);assert.equal(u.chargePose,null);assert.equal(u.attack,null);assert.equal(u.tension,tension);
   const ready=createRobot(config,id=>CATALOG[id]);ready.active=0;draw(ready,u,b.time);continuous(whole(ready),whole(ref),`${context}/incapacitated`,1e-7,1e-7);repeat(ref,u,b.time,`${context}/status-repeat`);
  }else if(mode==='recharge'){
   const before=whole(ref);b.tick(dt,{attack:true});draw(ref,u,b.time);assert(u.charging&&!u.guard);assert(u.chargePose);assert.equal(u.attack,null);assert.equal(u.tension,tension);
   continuous(before,whole(ref),`${context}/restart`,1e-7,1e-7);repeat(ref,u,b.time,`${context}/restart-repeat`);
   const original=b.attack.bind(b);let released=false;b.attack=(unit,charge,...args)=>{
    draw(ref,unit,b.time);const from=whole(ref);assert(original(unit,charge,...args));assert.equal(unit.attack.elapsed,0);assert.equal(charge,0);
    draw(ref,unit,b.time);continuous(from,whole(ref),`${context}/attack-p0`,1e-7,1e-7);repeat(ref,unit,b.time,`${context}/attack-repeat`);released=true;return true;
   };
   b.tick(dt,{attack:false});draw(ref,u,b.time);assert(released&&u.attack);assert(Math.abs(tension-u.tension-cost(u.stats,'attack',WEAPONS.knuckle.tension))<1e-8);
  }else{
   for(let n=0;n<Math.ceil(.10/dt);n++){
    b.tick(dt,mode==='guard'?{guard:true}:{});draw(ref,u,b.time);repeat(ref,u,b.time,`${context}/return-repeat`);
    assert.equal(u.guard,mode==='guard');assert(!u.charging);assert.equal(u.chargePose,null);assert.equal(u.attack,null);assert.equal(u.tension,tension);assert.equal(u.c,c);
   }
   assert(b.time-start>=.10-1e-9);const ready=createRobot(config,id=>CATALOG[id]);ready.active=0;draw(ready,u,b.time);
   continuous(whole(ready),whole(ref),`${context}/settled`,1e-7,1e-7);
  }
 }
});

test('満溜めは右の上昇打撃で単発ジャブと区別でき、実必殺アッパーは左拳と打ち上げを使う',()=>{
 for(const frame of frames){
  const {b,u,v,ref}=fixture(frame),held=sampleMotion('knuckle',null,{charging:{elapsed:.6,amount:1},legFrame:frame});let chargedMin=Infinity,chargedMax=-Infinity,jabMin=Infinity,jabMax=-Infinity;
  for(let n=0;n<=240;n++){
   const p=n/240;attack(u,0,p,{charge:1,blendFrom:held});draw(ref,u,p);chargedMin=Math.min(chargedMin,fist(ref,0).y);chargedMax=Math.max(chargedMax,fist(ref,0).y);
   attack(u,0,p);draw(ref,u,p);jabMin=Math.min(jabMin,fist(ref,0).y);jabMax=Math.max(jabMax,fist(ref,0).y);
  }
  assert(chargedMax-chargedMin>.22,`${frame}: 溜め打撃が上昇しない`);assert(chargedMax-chargedMin>jabMax-jabMin+.12,`${frame}: 溜め打撃が通常ジャブと同じ`);
  u.attack=null;u.motion=null;u.c=SPECIALS['knuckle:tech'].cost;Object.assign(v,{x:0,z:.65,lp:5000});const beforeLP=v.lp;
  assert(b.useSkill(u,'knuckle:tech'));assert.equal(u.c,0);assert.equal(u.attack.skill,'tech');assert.equal(u.attack.normal,false);let hit=false,sawLeftTrail=false,leftMin=Infinity,leftMax=-Infinity;
  for(let n=0;n<180&&u.attack;n++){
   b.tick(1/120,{});draw(ref,u,b.time);leftMin=Math.min(leftMin,fist(ref,1).y);leftMax=Math.max(leftMax,fist(ref,1).y);
   if(ref.weaponTrails[1].mesh.visible)sawLeftTrail=true;assert(!ref.weaponTrails[0].mesh.visible,`${frame}: 必殺アッパーで右拳の軌跡が出る`);
   if(b.consumeEvents().some(e=>e.type==='hit'&&e.attacker===u.id)){assert(!v.grounded&&v.vy>0,`${frame}: 必殺の打ち上げを失う`);hit=true;}
  }
  assert(hit&&v.lp<beforeLP);assert(sawLeftTrail);assert(leftMax-leftMin>.20,`${frame}: 左必殺アッパーが上昇しない`);
 }
});

test('表示する腰装甲は実際の骨盤回転を追い、胸より先に荷重を回す',()=>{
 for(const frame of frames)for(let combo=0;combo<6;combo++){
  const {u,ref}=fixture(frame),plates=[];ref.root.traverse(o=>{if(o.name==='pelvisArmour')plates.push(o);});assert.equal(plates.length,2);const rest=plates.map(o=>o.quaternion.clone()),sign=combo%2?-1:1,hip=[],chest=[];
  for(let n=0;n<=360;n++){
   const p=n/360;attack(u,combo,p);draw(ref,u,p);
   for(let i=0;i<plates.length;i++){
    const expected=orientation(ref.legGroup).multiply(rest[i]);assert(orientation(plates[i]).angleTo(expected)<1e-7,`${frame}/${combo}/${p}: 腰装甲が胸を追う`);
   }
   hip.push(sign*(ref.legGroup.rotation.y+.06));chest.push(sign*(ref.bodyPivot.rotation.y+.14));
  }
  if(frame!=='panzer'){
   const hipPeak=hip.indexOf(Math.max(...hip))/360,chestPeak=chest.indexOf(Math.max(...chest))/360;
   assert(Math.max(...hip)>.25);assert(hipPeak<chestPeak,`${frame}/${combo}: 骨盤と胸が同時に回る`);
  }
 }
});

test('両拳の打撃面は待機・全6段・溜め保持・解除の全相で前腕方向を保つ',()=>{
 for(const frame of frames){
  const {u,ref}=fixture(frame);
  for(const mode of ['normal','charge','hold'])for(let combo=0;combo<(mode==='normal'?6:1);combo++)for(let n=0;n<=240;n++){
   const p=n/240;if(mode==='hold'){u.attack=null;u.charging=true;u.chargePose={elapsed:p*.6,amount:p};}else attack(u,combo,p,{charge:mode==='charge'?1:0});draw(ref,u,p);
   for(let side=0;side<2;side++){
    const arm=ref.arms[side],elbow=point(arm.elbow),hand=point(arm.hand),axis=hand.clone().sub(elbow).normalize(),face=new THREE.Vector3(0,0,1).transformDirection(ref.weaponAttachments[side].matrixWorld);
    assert(axis.angleTo(face)<.01,`${frame}/${mode}/${combo}/${p}: 手首が曲がって打撃面が逸れる`);
    assert(Math.abs(point(arm).distanceTo(elbow)-.195)<1e-8);assert(Math.abs(hand.distanceTo(elbow)-.195)<1e-8);
   }
  }
 }
});

test('パンチは打撃側だけへ軌跡を付け、二足4段目は足で打って両拳に軌跡を付けない',()=>{
 for(const frame of frames)for(let combo=0;combo<6;combo++)for(const charge of combo===0?[0,1]:[0]){
  const {u,ref}=fixture(frame),kick=frame!=='panzer'&&combo===3&&!charge,side=charge?0:combo%2,spare=1-side,rhythm=motionRhythm('knuckle',{combo,charge,legFrame:frame}),start=rhythm.windup,end=rhythm.contactEnd;let sawStrikeTrail=false;
  for(let n=0;n<=80;n++){
   const p=start+(end-start)*n/80;attack(u,combo,p,{charge});draw(ref,u,p);
   const f=sampleMotion('knuckle',u.attack,{legFrame:frame});assert.equal(f.strikingSide,side?'left':'right');
   if(kick){assert.equal(f.name,'leftSideKick');assert.equal(f.strikingLimb,'leftFoot');for(const trail of ref.weaponTrails){assert.equal(trail.samples.length,0);assert(!trail.mesh.visible);}for(const hand of ['right','left'])assert(f[hand].position[2]<.20,`${frame}/${p}: キックと同時に拳を伸ばす`);}
   else {assert.notEqual(f.strikingLimb,'leftFoot');const guard=torsoFist(ref,spare);assert(guard.z<.30,`${combo}/${charge}/${p}: 非打撃の拳まで伸ばす`);assert(guard.y>.68,`${combo}/${charge}/${p}: 非打撃の拳が顔を守らない`);assert.equal(ref.weaponTrails[spare].samples.length,0,`${combo}/${charge}: 非打撃の拳に軌跡を作る`);assert(!ref.weaponTrails[spare].mesh.visible);}
   if(ref.weaponTrails[side].mesh.visible)sawStrikeTrail=true;
  }
  assert.equal(sawStrikeTrail,!kick,`${frame}/${combo}/${charge}: 打撃部と拳の軌跡が一致しない`);
 }
});

test('実際の拳は接触キーを止まらず通過し、打撃の速度を回収の速度より高くする',()=>{
 for(const frame of ['knight','panzer'])for(let combo=0;combo<6;combo++){
  if(frame!=='panzer'&&combo===3)continue;
  const {u,ref}=fixture(frame),side=combo%2,rhythm=motionRhythm('knuckle',{combo,legFrame:frame}),points=[];const resolution=960;
  for(let n=0;n<=resolution;n++){attack(u,combo,n/resolution);draw(ref,u,n/resolution);points.push(fist(ref,side));}
  const speed=points.slice(1).map((p,n)=>p.distanceTo(points[n])*resolution),center=(rhythm.windup+rhythm.contactEnd)/2,
   impact=speed.filter((_,n)=>n/resolution>=rhythm.windup&&n/resolution<=rhythm.contactEnd),recover=speed.filter((_,n)=>n/resolution>=.58&&n/resolution<=.90),speedAtCenter=speed[Math.round(center*resolution)];
  assert(speedAtCenter>.15,`${combo}: 接触キーで拳が止まる`);assert(speedAtCenter>Math.max(...impact)*.12,`${combo}: 接触キーの前後で毎回停止する`);
  assert(Math.max(...impact)>Math.max(...recover)*1.1,`${combo}: 回収の方が打撃より速い`);
 }
});

test('溜め・必殺・再入力・4段目キックは初回命中の過去区間で実打撃部が相手へ届く',()=>{
 for(const frame of frames)for(const yaw of [0,.8,-1.4])for(const fps of [30,60,120])for(const mode of ['charge','tech','recharge','kick']){
  const {b,u,v,ref}=fixture(frame),dt=1/fps,kick=mode==='kick'&&frame!=='panzer',side=mode==='tech'||mode==='kick'?1:0;Object.assign(u,{yaw});Object.assign(v,{x:Math.sin(yaw)*.65,z:Math.cos(yaw)*.65,lp:5000});draw(ref,u,b.time);
  if(mode==='kick'){
   // Reach the fourth stage through three paid, real hit-gated punches.
   for(let stage=0;stage<3;stage++){
    b.tick(dt,{attack:true});draw(ref,u,b.time);b.tick(dt,{attack:false});draw(ref,u,b.time);assert.equal(u.combo,stage);
    for(let n=0;n<fps*3&&(u.attack||b.runtime(u).cooldown>0);n++){b.tick(dt,{});draw(ref,u,b.time);}assert(u.comboHit);
   }
   b.tick(dt,{attack:true});draw(ref,u,b.time);
  }else if(mode!=='tech'){
   while(u.charge<b.maxCharge(u)-1e-9){b.tick(dt,{attack:true});draw(ref,u,b.time);assert(!u.attack);}
   if(mode==='recharge'){b.tick(dt,{guard:true});draw(ref,u,b.time);assert(u.guard&&!u.charging);b.tick(dt,{attack:true});draw(ref,u,b.time);assert(u.charging&&!u.attack);}
  }
  else {u.c=SPECIALS['knuckle:tech'].cost;assert(b.useSkill(u,'knuckle:tech'));assert.equal(u.c,0);}
  b.consumeEvents();let hit=false;
  for(let n=0;n<fps*3;n++){
   const mesh=kick?ref.feet[1].foot.children[0]:ref.weaponAttachments[side].children[0],previousMatrix=mesh.matrixWorld.clone();b.tick(dt,mode!=='tech'&&n===0?{attack:false}:{});draw(ref,u,b.time);
   if(kick&&u.attack?.combo===3)for(const trail of ref.weaponTrails){assert.equal(trail.samples.length,0);assert(!trail.mesh.visible);}
   const events=b.consumeEvents(),event=events.find(e=>e.type==='hit'&&e.attacker===u.id&&e.unit===v.id),a=u.attack;
   if(!event){if(!a&&n>0)break;continue;}
   assert(a,`${frame}/${yaw}/${fps}/${mode}: 初回命中時の打撃を失う`);if(mode==='charge')assert.equal(a.charge,1);else if(mode==='tech')assert.equal(a.skill,'tech');else {assert.equal(a.charge,0);assert.equal(a.skill,undefined);if(mode==='kick'){assert.equal(a.combo,3);assert.equal(sampleMotion('knuckle',a,{legFrame:frame}).name,kick?'leftSideKick':'bodyLeft');}}
   const elapsed=a.elapsed,inverse=new THREE.Matrix4().makeRotationY(-a.yaw),contact=new THREE.Vector3(event.x,event.y-.60,event.z).applyMatrix4(inverse),
    box=new THREE.Box3(new THREE.Vector3(contact.x-.21,contact.y+.30,contact.z-.19),new THREE.Vector3(contact.x+.21,contact.y+.94,contact.z+.19));
   // The event is recorded before the technique launches its victim. Its
   // contact height is the ground-side target, not the later airborne pose.
   assert(Math.abs(contact.y)<1e-9);let touched=false;
   // Preserve the real previous/current renders. Replaying earlier times
   // would reset presentation state and hide a late fist after cancellation.
   const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,from=inverse.clone().multiply(previousMatrix),to=inverse.clone().multiply(mesh.matrixWorld);
   for(let i=0;i<(index?.count??position.count)&&!touched;i+=3){
    const before=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(from)),after=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(to));
    // Only the striking armour's indexed triangles count. Sweep the actual
    // past tick; a hand pivot, glow, spare fist or future pose cannot pass.
    for(let sample=0;sample<=8;sample++)if(box.intersectsTriangle(new THREE.Triangle(...before.map((p,k)=>p.clone().lerp(after[k],sample/8))))){touched=true;break;}
   }
   assert(touched,`${frame}/${yaw}/${fps}/${mode}/${elapsed/a.duration}: ${kick?'ブーツ':'拳'}が相手へ届く前に初回命中する`);hit=true;break;
  }
  assert(hit,`${frame}/${yaw}/${fps}/${mode}: 近距離で初回命中しない`);
 }
});

// Recorded from the source snapshot preceding the dedicated knuckle module.
// These cover every other weapon, all five frames, idle/guard/charge hold,
// and six phases of both ordinary and charged attacks; trails are not poses.
const otherWeaponPoses={
 sword:'49eb543fe5fd7e646819d99af734732e4dd6027eada5f4e3567cecaeee85b72d',rapier:'0856fe165f8c25c08ecf2901bcc15f472ba180744e53a6abde731f02f1650815',dualSword:'96e53b2422233b064b121635ff327ba674d356eeb31a1def8cde9b9febc5e5b5',lance:'a7b2507c1b7463f9351795ed8a1b492b07bc7cbc28b26a85b3f8fc960e5bf49c',naginata:'e15e28074860f9aa0d4cf7cd9d4f551f9013862431b23c0e3d836fe94a1bda22',dagger:'7943bcf19875898c8f7dd2d9a805bee89e876d8dc17c3f664de3bad398bf9259',hammer:'d7b3aa6d9f3232023efb8252e26ad86a33bb17e7afbd2d65b9289d89a03c0994',scythe:'22e75034328859609d029c3b7330bd935ee8c86ad83ce335e46493711da4a3ed',pistol:'16d6c178b96286c1f8f4431ee5b819c37ffa01f457f3251c77fa437d77e13932',machinegun:'83e3434111c3ec1cd5f762566e01ea763a83195eb1f1f5346a7fb6b0fc5b730c',shotgun:'9a2151ca74129208cdd140d9a0fa6308f29ab56b8afbf7c398bfe8c3cd8ca8d3',dualGun:'434456cc007b0031431282657845d8fe6f749a048ef850a9234b68480fd27b2e',rifle:'78a635e9decd3ece1e2080d5a0877b74a79e7af706fd2f960518219074319dfd',assault:'eaaa3ea6c54adc5f5133a68ef5fa1791437e0fd9e4050e39c28210d8711d243c',sniper:'50d0312e3e4166e147db5b19c16b9912fae6a881bb90e0c73a46f702d58ff619',heavyShotgun:'13784fe751d4dbc5b8e3a2f2e0130529e5c6bfad23b76e97e379221c3a63ae56',bazooka:'c64978d2331c420b58ef62255b23994d8678056617ec76647771df3393a0c594',missile:'53a21ccbdf770a341781ecff669a3efadf82d0787b54ef2d1563f1e5238e9cec',
};
// Captured before the kick was introduced. Panzer keeps all six punches;
// the five biped punches, charge, technique and hold keep the same authored
// arm/body/foot poses too. This excludes metadata introduced for kick IK.
const unchangedKnucklePoses={
 0:'370b8eeab27ac366c1487ce371c843a6f5e8a09cac6e88e048363a902d1ab667',
 1:'40b6f351b9232da4d669dbd95a976b2366913a517aeb93046562505ec953f78b',
 2:'3867b1fcc5f2f31ce752ad4a4b8ef23cdbf7e4fcfe53df686fac214608b287cf',
 3:'cf6083834c1f5791c525a65a7c58ccc7dcae74581ac429451f703ead1e2b86c3',
 4:'7f0f04068c2f89f1cbc4e84352181c7851bbf7f03281aa3a3da26c35f648aa07',
 5:'be93976399d0c4a2bbfba255397921ad740029193fabc5f9632b2d3049a6a2c3',
 charge:'86869d090a5c684b0de155e7fd554d12d7e165eeae14f9e9eb4355c307edc05c',
 tech:'e5f2c8e285dcd2bd91aa4aef32f8c1b97089e1577ce0c25a08f600174b19a884',
 hold:'63b481faf3f32bc16acbded7217bfda992ed371f266bf1fb0fca5147df67635f',
};
test('キック追加でもPanzerの6パンチ・他の拳動作と他18武器の表示姿勢を変えない',()=>{
 for(const frame of frames)for(const [mode,expected]of Object.entries(unchangedKnucklePoses)){
  if(frame!=='panzer'&&mode==='3')continue;
  const hash=createHash('sha256');for(let n=0;n<=240;n++){
   const p=n/240,context={legFrame:frame},f=mode==='hold'?sampleMotion('knuckle',null,{...context,charging:{elapsed:p*.6,amount:p}}):sampleMotion('knuckle',{combo:Number.isNaN(Number(mode))?0:Number(mode),elapsed:p,duration:1,charge:mode==='charge'?1:0,skill:mode==='tech'?'tech':undefined},context);
   hash.update(JSON.stringify([f.right,f.left,f.joints,f.body,f.head,f.hipYaw,f.drop,f.shift,f.feet,f.footYaw]));
  }assert.equal(hash.digest('hex'),expected,`${frame}/${mode}: キック対象外の拳動作を変える`);
 }

 for(const [kind,expected]of Object.entries(otherWeaponPoses)){
  const hash=createHash('sha256');for(const frame of frames){
   const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));config.sets[0]={item:`weapon:${kind}`,shield:WEAPONS[kind].shield?'shield:basic':null,separate:false};
   const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;const u={config,active:0,x:0,y:0,z:0,yaw:.7,vx:0,vz:0,dashTime:0,down:0,grounded:true};
   const states=[{},{guard:true},{charging:true,charge:.3,chargePose:{elapsed:.3,amount:.5}},...Array.from({length:6},(_,i)=>({attack:{weapon:kind,combo:0,charge:0,elapsed:i/5,duration:1,origin:[0,0,0],yaw:.7}})),...Array.from({length:6},(_,i)=>({attack:{weapon:kind,combo:0,charge:1,elapsed:i/5,duration:1,origin:[0,0,0],yaw:.7}}))];
   for(const state of states){Object.assign(u,{guard:false,charging:false,charge:0,chargePose:null,attack:null,motion:null},state);draw(ref,u,.33);const matrices=[];ref.root.traverse(o=>{if(o.isMesh)matrices.push(o.matrixWorld.elements.map(v=>Number(v.toFixed(12))));});hash.update(JSON.stringify(matrices));}
  }assert.equal(hash.digest('hex'),expected,`${kind}: 非対象のモーションを変える`);
 }
});
