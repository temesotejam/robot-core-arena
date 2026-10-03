import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {swordMotion,swordChargeHold} from '../src/sword-motion.js';
import {createRobot,ArenaRenderer} from '../src/render.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,PARTS} from '../src/data.js';

test('ソードは骨盤から胸へひねりを伝え、左腕で釣り合いを取りながら顔を標的へ残す',()=>{
 for(const frame of ['knight','strider','wild','brawler','panzer']){
  const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));
  const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
  const yaw=.8,u={config,active:0,x:0,y:0,z:0,yaw,vx:0,vz:0,dashTime:0,grounded:true};
  for(let combo=0;combo<4;combo++){
   let minHip=Infinity,maxHip=-Infinity;const hands=[];
   for(let i=0;i<=120;i++){
    const p=i/120;u.attack={weapon:'sword',combo,elapsed:p,duration:1,origin:[0,0,0],yaw};
    ArenaRenderer.prototype.animateRobot.call({},ref,u,p);ref.root.updateMatrixWorld(true);
    const f=swordMotion(u.attack);minHip=Math.min(minHip,f.hipYaw);maxHip=Math.max(maxHip,f.hipYaw);hands.push(new THREE.Vector3(...f.left.position));
    const look=new THREE.Vector3(0,0,1).applyQuaternion(ref.head.getWorldQuaternion(new THREE.Quaternion())).applyAxisAngle(new THREE.Vector3(0,1,0),-yaw);
    assert(Math.abs(Math.atan2(look.x,look.z))<.075,`${frame}/${combo}/${p}: 顔まで胸と一緒に振り回す`);
   }
   assert(maxHip-minHip>.30,`${frame}/${combo}: 骨盤を固定して腕だけで振る`);
   assert(hands.some(a=>hands.some(b=>a.distanceTo(b)>.07)),`${frame}/${combo}: 左腕が固定されたまま`);
  }
 }
 for(const [combo,direction]of [[0,1],[1,-1],[2,1]]){
  const f=swordMotion({combo,elapsed:.27,duration:1});
  assert(f.hipYaw*direction>0&&f.body[1]*direction<0,`${combo}: 胸が解放される前に骨盤が先行する`);
 }
});

test('全身の強調でも標的を横切る剣の軌道・握りとコンボ接続を保つ',()=>{
 const rotation=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
 for(const charge of [0,.2,.5,1])for(let combo=0;combo<(charge?1:4);combo++)for(let i=0;i<=240;i++){
  const f=swordMotion({charge,combo,elapsed:i/240,duration:1});if(!f.bladeJoint)continue;
  const clavicle=new THREE.Vector3(...f.joints.right.clavicle),authored=new THREE.Vector3(...f.bladeJoint.clavicle);
  assert(clavicle.distanceTo(authored)<.035,'胴のひねりを肩の過度な平行移動で相殺する');
  const body=rotation(f.body),bladeBody=rotation(f.bladeBody),upper=new THREE.Quaternion().fromArray(f.joints.right.upper),authoredUpper=new THREE.Quaternion().fromArray(f.bladeJoint.upper);
  assert(body.clone().multiply(upper).angleTo(bladeBody.clone().multiply(authoredUpper))<1e-7,'胸の強調で承認済みの斬撃面をねじる');
  assert.deepEqual(f.joints.right.wrist,f.bladeJoint.wrist,'全身の強調のために握りを返す');
 }
 for(let combo=0;combo<4;combo++){
  const next=(combo+1)%4,from=swordMotion({combo,elapsed:1,duration:1},{nextCombo:next}),to=swordMotion({combo:next,elapsed:0,duration:1,blendFrom:from});
  for(const key of ['head','body','hipYaw','joints','bladeJoint','bladeBody'])assert.deepEqual(to[key],from[key],`${combo}: ${key} が接続で飛ぶ`);
 }
 const held=swordChargeHold({amount:1,elapsed:1}),release=swordMotion({charge:1,elapsed:0,duration:1,blendFrom:held});
 for(const key of ['head','body','hipYaw','joints','bladeJoint','bladeBody'])assert.deepEqual(release[key],held[key],`チャージ解放で ${key} が飛ぶ`);
});
