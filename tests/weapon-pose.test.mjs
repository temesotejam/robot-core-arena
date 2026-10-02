import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {CATALOG,WEAPONS,FRAMES,PARTS} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';

const world=o=>o.getWorldPosition(new THREE.Vector3());
function unit(config,kind,extra={}){return {config,active:0,stats:{weapon:WEAPONS[kind],frame:'knight'},x:2,y:.7,z:-3,yaw:1.2,vx:0,vz:0,dashTime:0,down:0,grounded:true,...extra};}
function assertRig(ref){
 ref.root.updateMatrixWorld(true);
 for(const arm of ref.arms){
  const elbow=arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)),wrist=arm.lower.localToWorld(new THREE.Vector3(0,-.195,0));
  assert(elbow.distanceTo(world(arm.elbow))<1e-8,'肩から肘までの接続');
  assert(wrist.distanceTo(world(arm.hand))<1e-8,'肘から手までの接続');
 }
 for(const weapon of ref.weaponAttachments.filter(o=>o.name!=='shield')){
  assert(weapon.parent.name.endsWith('Hand'));
  assert(world(weapon).distanceTo(world(weapon.parent))<1e-8,'武器の握り位置が手から離れない');
 }
 const weapon=ref.weaponAttachments[0],support=weapon.userData.supportGrip;
 if(support)assert(weapon.localToWorld(new THREE.Vector3(...support)).distanceTo(world(ref.arms[1].hand))<.005,'左手が両手武器の支持位置から離れない');
}
test('全19武器・5フレームで手と武器が接続し、移動・攻撃・防御中も両手の支持位置を保つ',()=>{
 for(const frame of Object.keys(FRAMES))for(const kind of Object.keys(WEAPONS)){
  const config=defaultConfig();config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));config.sets[0]={item:`weapon:${kind}`,shield:WEAPONS[kind].shield?'shield:basic':null};
  const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;assertRig(ref);
  for(const extra of [{},{vx:4,guard:true},{vx:4,dashTime:.2},{grounded:false,y:2},...Array.from({length:21},(_,i)=>({attack:{elapsed:i/20,duration:1,thrust:['lance','rapier'].includes(kind)}})),{actionTime:.1},{down:.5},{dead:true}]){
   ArenaRenderer.prototype.animateRobot.call({},ref,unit(config,kind,extra),.123);assertRig(ref);
  }
 }
});
test('剣の刃が腕に埋まらず、銃口が待機画面・戦闘とも正面を向く',()=>{
 for(const kind of ['sword','dagger','dualSword']){
  const config=defaultConfig();config.sets[0].item=`weapon:${kind}`;const ref=createRobot(config,id=>CATALOG[id]);ref.root.updateMatrixWorld(true);
  for(const weapon of ref.weaponAttachments.filter(o=>o.name!=='shield')){
   const arm=weapon.parent.parent;
   for(let y=.15;y<=.45;y+=.05){const point=weapon.localToWorld(new THREE.Vector3(0,y,0));
    for(const group of [arm.upper,arm.lower])for(const mesh of group.children){const local=mesh.worldToLocal(point.clone());mesh.geometry.computeBoundingBox();assert(!mesh.geometry.boundingBox.containsPoint(local),`${kind}の刃が腕に埋まる`);}
   }
  }
 }
 for(const [kind,w]of Object.entries(WEAPONS).filter(([,w])=>w.ranged)){
  const config=defaultConfig();config.sets[0]={item:`weapon:${kind}`,shield:null};const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
  for(const inBattle of [false,true]){if(inBattle)ArenaRenderer.prototype.animateRobot.call({},ref,unit(config,kind,{x:0,y:0,z:0,yaw:0}),0);ref.root.updateMatrixWorld(true);
   for(const weapon of ref.weaponAttachments){const forward=new THREE.Vector3(0,0,1).transformDirection(weapon.matrixWorld);assert(forward.z>.99,`${kind}: 銃口が正面を向く`);}
  }
 }
});
test('武器切替で古いモデルを取り除き、二刀流・盾・両手武器の持ち方を切り替える',()=>{
 const ref=createRobot(defaultConfig(),id=>CATALOG[id]);
 for(const kind of ['dualSword','rifle','pistol','knuckle','hammer','sword']){
  const old=[...ref.weaponAttachments];ref.changeWeapons({item:`weapon:${kind}`,shield:'shield:basic'});
  assert(old.every(o=>o.parent===null));assert.equal(ref.weaponAttachments.length,['dualSword','dualGun','knuckle'].includes(kind)||WEAPONS[kind].shield?2:1);assertRig(ref);
 }
});
