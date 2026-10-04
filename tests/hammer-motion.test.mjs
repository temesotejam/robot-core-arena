import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {sampleMotion} from '../src/motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';
import {Battle} from '../src/sim.js';
import {HAMMER_GRIP} from '../src/hammer-grip.js';
import {swordArm} from '../src/sword-motion.js';

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
const geometryChecks=new Map();
function shell(geometry){
 if(geometryChecks.has(geometry))return geometryChecks.get(geometry);
 geometry.computeBoundingBox();const positions=geometry.attributes.position,index=geometry.index,vertices=new Map(),planes=[];
 for(let i=0;i<positions.count;i++){const v=new THREE.Vector3().fromBufferAttribute(positions,i);vertices.set(v.toArray().map(n=>n.toFixed(6)).join('/'),v);}
 for(let i=0;i<(index?.count??positions.count);i+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+j):i+j)),plane=new THREE.Plane().setFromCoplanarPoints(...v);if(plane.normal.lengthSq()>.5&&!planes.some(p=>p.normal.dot(plane.normal)>.999999&&Math.abs(p.constant-plane.constant)<1e-7))planes.push(plane);}
 const result={vertices:[...vertices.values()],planes};geometryChecks.set(geometry,result);return result;
}
function torsoMeshes(ref){
 const meshes=[];ref.bodyPivot.children[0].traverse(o=>{if(!o.isMesh)return;for(let p=o;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;meshes.push(o);});return meshes;
}
function clearArms(ref,meshes,label){
 const targets=meshes.map(mesh=>({mesh,inverse:new THREE.Matrix4().copy(mesh.matrixWorld).invert(),planes:shell(mesh.geometry).planes}));
 for(const [side,arm]of ref.arms.entries()){
  for(const [name,part]of [['upper',arm.upper],['lower',arm.lower],['hand',arm.hand],['shoulder',arm.shoulder],['elbow',arm.elbow]])part.traverse(mesh=>{
   if(!mesh.isMesh)return;
   for(const vertex of shell(mesh.geometry).vertices){const world=vertex.clone().applyMatrix4(mesh.matrixWorld);
    for(const {mesh:target,inverse,planes}of targets){const local=world.clone().applyMatrix4(inverse);if(!target.geometry.boundingBox.containsPoint(local))continue;
     // Closed convex armour faces, rather than a torso's coarse world box.
     assert(!planes.every(plane=>plane.distanceToPoint(local)<-1e-5),`${label}/${side}/${name}: 腕の装甲が胴・頭の実形状へ埋まる`);
    }
   }
  });
  for(const [a,b]of [[point(arm),point(arm.elbow)],[point(arm.elbow),point(arm.hand)]]){const d=b.clone().sub(a);assert.equal(new THREE.Raycaster(a,d.clone().normalize(),.008,d.length()-.008).intersectObjects(meshes,false).length,0,`${label}/${side}: 腕の骨が胴・頭を横切る`);}
 }
}

test('大型ハンマーを腰の横から後ろへ低く構え、肩を前へ出して両手で支える',()=>{
 for(const frame of frames){
  const {ref,u}=fixture(frame);draw(ref,u);
  const w=ref.weaponAttachments[0],grip=point(w),head=w.localToWorld(new THREE.Vector3(...w.userData.strikeCenter)),axis=head.clone().sub(grip).normalize(),ready=sampleMotion('hammer',null);
  assert(head.x<-.24,'ヘッドを体の横の外へ置かない');
  assert(axis.z<-.80&&axis.y<-.10,'柄を低い後方へ向けない');
  const approved=new THREE.Vector3(Math.sin(1.77)*Math.sin(-2.80),Math.cos(1.77),Math.sin(1.77)*Math.cos(-2.80));
  assert(axis.distanceTo(approved)<1e-9,'了承された下段構えから柄の方向を変える');
  const approvedHead=new THREE.Vector3().crossVectors(approved,new THREE.Vector3(0,1,0)).normalize();
  assert(new THREE.Vector3(1,0,0).transformDirection(w.matrixWorld).distanceTo(approvedHead)<1e-9,'了承された構えからヘッドを回す');
  for(const arm of ref.arms){const neutral=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),wrist=arm.lower.quaternion.clone().invert().multiply(arm.hand.quaternion);assert(wrist.angleTo(neutral)<=18*Math.PI/180+1e-7,'通常構えで手首を折り過ぎる');}
  assert(head.y<grip.y-.075&&head.y>.28&&head.z<point(ref.arms[1].hand).z-.45,'肩に担ぐか、正面へ構える');
  assert(grip.y>.42&&grip.y<.52,'両手の握りを腰の高さへ下げない');
  const crossbar=w.localToWorld(new THREE.Vector3(.245,.60,0)).sub(w.localToWorld(new THREE.Vector3(-.245,.60,0))).normalize();
  assert(Math.abs(axis.dot(crossbar))<1e-10&&Math.abs(crossbar.y)<1e-10,'了承された横向きのT字ヘッドを縦に立てる');
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

test('右手をヘッド側、左手を柄の端側に置き、両手が重ならず一本の柄を握り続ける',()=>{
 for(const frame of frames){
  const {ref,u}=fixture(frame);
  for(const [combo,charge]of [[0,0],[1,0],[0,1]])for(let n=0;n<=120;n++){
   const p=n/120;u.attack={id:'grasp',weapon:'hammer',combo,charge,elapsed:p,duration:1,origin:[0,0,0],yaw:0};draw(ref,u,p);
   const w=ref.weaponAttachments[0],right=point(ref.arms[0].hand),left=point(ref.arms[1].hand),head=w.localToWorld(new THREE.Vector3(...w.userData.strikeCenter)),distance=right.distanceTo(left);
   assert(distance>.13&&distance<.15,'両手が同じ位置へ重なるか、握りが柄から滑る');
   assert(right.distanceTo(head)<left.distanceTo(head),'左手が右手の後ろへ回り込み、腕を交差させる');
   assert(w.localToWorld(new THREE.Vector3(...w.userData.supportGrip)).distanceTo(left)<1e-7,'支持側の手が柄から離れる');
   const axis=new THREE.Vector3(0,1,0).transformDirection(w.matrixWorld),handAxis=new THREE.Vector3(0,1,0).transformDirection(ref.arms[1].hand.matrixWorld);
   assert(axis.dot(handAxis)>.999999,'支持側の握りが柄に対して折れる');
   for(const arm of ref.arms){
    const wrist=arm.lower.quaternion.clone().invert().multiply(arm.hand.quaternion),neutral=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),bend=wrist.clone().multiply(neutral.invert());
    assert(wrist.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2))<=35*Math.PI/180+1e-7,'手首が前腕から逆向きに折れる');
    assert(Math.hypot(bend.y,bend.z)<1e-7,'前腕の回転を手首のねじれへ押し込む');
   }
   // Both ends of the supporting fist must surround the physical solid haft.
   const haft=w.children[1];haft.geometry.computeBoundingBox();for(const y of [-.0325,.0325]){
    const end=haft.worldToLocal(ref.arms[1].hand.localToWorld(new THREE.Vector3(0,y,0)));
    assert(haft.geometry.boundingBox.containsPoint(end),'柄の端を越えた空間を左手で握る');
   }
  }
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

test('前腕と握りは構えから攻撃・回収まで一瞬で反転しない',()=>{
 for(const [combo,charge]of [[0,0],[1,0],[0,1]]){
  let before;
  for(let n=0;n<=1000;n++){
   const frame=sample(combo,n/1000,charge),arms=['right','left'].map(side=>swordArm(frame.joints[side]));
   if(before)for(let i=0;i<2;i++)for(const key of ['upper','lower','hand'])assert(arms[i][key].angleTo(before[i][key])<8*Math.PI/180,`${combo}/${charge}/${n}/ ${key}: 肘・前腕・握りの解が反転する`);
   before=arms;
  }
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

test('実入力の2段・満溜めで全5フレームの腕装甲・脚・大型ハンマーが自機や床を貫通しない',()=>{
 for(const frame of frames)for(const fps of [30,60,120])for(const mode of ['combo','chargeNear','chargeFar']){
  const {config,ref}=fixture(frame),enemy=defaultConfig(0,true);enemy.passives=[];enemy.abilities=[];
  const ownMeshes=[],paths=[[[0,.105,0],[0,.485,0]],[[0,.465,0],[0,.735,0]],...[-.16,0,.16].map(z=>[[-.30,.60,z],[.30,.60,z]])].map(path=>path.map(([x,y,z])=>[x,y-HAMMER_GRIP.advance,z]));
  ref.bodyPivot.children[0].traverse(o=>{if(!o.isMesh)return;for(let p=o;p&&p!==ref.bodyPivot;p=p.parent)if(ref.arms.includes(p))return;ownMeshes.push(o);});
  ref.legGroup.traverse(o=>{if(o.isMesh)ownMeshes.push(o);});
  const torso=torsoMeshes(ref);
  const b=new Battle({allies:[config],enemies:[enemy],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id],rng:()=>.99});b.countdown=0;b.training.freezeAI=true;
  const u=b.human,v=b.entities[1],charged=mode!=='combo',stages=charged?1:2,holdFrames=charged?Math.ceil(b.maxCharge(u)*fps)+1:1;
  Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:mode==='chargeFar'?5:.9,yaw:Math.PI});
  let starts=0,held=0,pressing=false,ended=null;
  const attack=b.attack.bind(b);b.attack=(unit,...args)=>{const ok=attack(unit,...args);if(ok&&unit===u)starts++;return ok;};
  for(let n=0;n<fps*8;n++){
   const rt=b.runtime(u),a=u.attack,input={},first=n>=fps*.5&&!starts&&!a&&!u.motion&&held<holdFrames,follow=a&&a.combo<stages-1&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.14&&rt.cooldown>0;
   if(charged){if(first){input.attack=true;held++;}}else if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;held++;}
   b.tick(1/fps,input);b.consumeEvents();draw(ref,u,b.time);
   for(const arm of ref.arms){const neutral=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),wrist=arm.lower.quaternion.clone().invert().multiply(arm.hand.quaternion);assert(wrist.angleTo(neutral)<=35*Math.PI/180+1e-7,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 手首を無理な角度に折る`);}
   clearArms(ref,torso,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}`);
   const bottom=new THREE.Box3().setFromObject(ref.legGroup,true).min.y;
   assert(bottom>=-1e-7,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 脚の装甲が床へ${-bottom}入る`);
   const weaponBottom=new THREE.Box3().setFromObject(ref.weaponAttachments[0],true).min.y;
   assert(weaponBottom>=0,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 大型ハンマーの外形が床へ${-weaponBottom}入る`);
   const weapon=ref.weaponAttachments[0];for(const path of paths){
    const a=weapon.localToWorld(new THREE.Vector3(...path[0])),c=weapon.localToWorld(new THREE.Vector3(...path[1])),d=c.clone().sub(a);
    assert.equal(new THREE.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObjects(ownMeshes,false).length,0,`${frame}/${fps}/${mode}/${u.attack?.combo}/${u.attack&&u.attack.elapsed/u.attack.duration}: 柄やヘッドが自機を貫通`);
   }
   if(starts===stages&&!u.attack&&!u.motion){ended??=b.time;if(b.time-ended>=.25)break;}
  }
  assert.equal(starts,stages);assert(ended!==null);
 }
});

test('両手の下段構えは歩行・停止でも接続を保ち、支える腕を胴へ戻さない',()=>{
 for(const frame of frames){
  const {ref,u}=fixture(frame),torso=torsoMeshes(ref);
  for(let n=0;n<150;n++){
   u.vx=n<120?.45*Math.sin(n/30):0;u.vz=n<120?.8:0;u.x+=u.vx/60;u.z+=u.vz/60;draw(ref,u,n/60);
   clearArms(ref,torso,`${frame}/walk-stop/${n}`);
   const w=ref.weaponAttachments[0];assert(point(w).distanceTo(point(ref.arms[0].hand))<1e-9);assert(w.localToWorld(new THREE.Vector3(...w.userData.supportGrip)).distanceTo(point(ref.arms[1].hand))<1e-8,'歩行中に支える手が柄から離れる');
  }
 }
});
