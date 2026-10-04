import * as THREE from '../vendor/three.module.min.js';
import {meleePose} from './melee-pose.js';

// Original rapier poses. Lance choreography lives in lance-motion.js.
// A rapier was not positively identified in those excerpts. Its point-first
// extension and rear-leg drive use fencing as a movement reference instead.
const RAP_FEET=[[-.12,.035,.095],[.13,.035,-.085]];
const LANCE_FEET=[[-.145,.035,.085],[.15,.035,-.095]];
const FREE_READY=[.25,.58,.07];
const COVER=[.23,.55,.24];
const quat=r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));

function facingHand(position,pitch,yaw,body,roll=0){
 // The point travels in the committed facing frame; a chest turn must not
 // sweep it away from the opponent. Aim with the arm's complete rotation,
 // including the shoulder, rather than flipping an isolated wrist.
 const inverse=quat(body).invert(),p=new THREE.Vector3(...position);
 p.y-=.36;p.applyQuaternion(inverse);p.y+=.36;
 const aim=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch))
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll));
 const e=new THREE.Euler().setFromQuaternion(inverse.multiply(aim));
 return {position:p.toArray(),rotation:[e.x,e.y,e.z]};
}

function frame(kind,s={},hasShield=false){
 const heavy=kind==='lance',body=s.body||[.008,heavy?-.13:-.20,0],base=heavy?LANCE_FEET:RAP_FEET;
 const feet=base.map(v=>[...v]);
 feet[0][2]+=s.step||0;feet[0][1]+=s.lift||0;
 feet[1][2]+=s.rear||0;feet[1][1]+=s.rearLift||0;
 const right=facingHand(s.hand||(heavy?[-.255,.49,.16]:[-.245,.55,.19]),s.pitch??(heavy?1.46:1.39),s.aim??.24,body);
 const left=hasShield
  ?facingHand(s.shield||COVER,s.shieldPitch??0,s.shieldAim??-.055,body,s.shieldRoll??-.04)
  :facingHand(s.free||FREE_READY,s.freePitch??.12,s.freeAim??-.1,body,s.freeRoll??-.12);
 return meleePose({right,left,body,hipYaw:s.hip??(heavy?-.08:-.12),drop:s.drop??-.03,
  shift:s.shift||[0,-.006],feet,footYaw:s.footYaw||(heavy?[-.04,.18]:[-.04,.30]),
  weight:s.weight??.12,poles:[[-.55,-.10,.10],[.48,-.06,.14]],hasShield});
}

function clip(kind,name,poses,ready,shieldReady){
 const contact=kind==='lance'?{start:.34,center:.455,end:.51}:{start:.22,center:.335,end:.43};
 return {name,contact,keys:[[0,ready],...poses.map(([time,s])=>[time,frame(kind,s)]),[1,ready]],
  shieldKeys:[[0,shieldReady],...poses.map(([time,s])=>[time,frame(kind,s,true)]),[1,shieldReady]]};
}

const rapierReady=frame('rapier'),rapierShieldReady=frame('rapier',{},true);
// The sword arm starts reaching while the rear leg remains loaded. The pelvis
// then releases the compressed stance; the front foot arrives after the hand.
// Recovery bends the elbow before gathering the stance, leaving a readable
// point in front between successive hits instead of drawing a sword cut.
const rapierClips=[
 ['thrust',[
  [.055,{hand:[-.27,.55,.13],body:[.005,-.28,.012],hip:-.19,drop:-.042,shift:[.006,-.012],free:[.24,.60,.035],shield:[.22,.57,.23],weight:.32}],
  [.12,{hand:[-.255,.56,.19],body:[.006,-.29,.009],hip:-.07,drop:-.048,shift:[.006,-.009],free:[.25,.60,.015],shield:[.20,.56,.25],weight:.56}],
  [.235,{hand:[-.215,.56,.31],pitch:1.55,aim:.23,body:[.016,-.11,.005],hip:.14,drop:-.047,shift:[.003,.010],step:.045,lift:.015,free:[.25,.60,-.075],shield:[.22,.55,.25],weight:.82}],
  [.34,{hand:[-.20,.57,.355],pitch:1.58,aim:.26,body:[.025,.015,-.007],hip:.23,drop:-.052,shift:[-.004,.034],step:.095,free:[.26,.58,-.115],shield:[.235,.54,.25],weight:1}],
  [.43,{hand:[-.20,.57,.35],pitch:1.58,aim:.26,body:[.024,.035,-.007],hip:.24,drop:-.049,shift:[-.004,.032],step:.10,free:[.26,.58,-.11],shield:[.235,.54,.25],weight:.92}],
  [.62,{hand:[-.235,.56,.225],body:[.012,-.045,0],hip:.11,drop:-.039,shift:[0,.013],step:.065,free:[.25,.59,-.02],shield:[.23,.55,.23],weight:.52}],
  [.82,{hand:[-.25,.55,.17],body:[.009,-.18,0],hip:-.04,drop:-.035,step:.02,lift:.012,free:[.24,.59,.045],weight:.24}],
 ]],
 ['highThrust',[
  [.055,{hand:[-.26,.605,.14],pitch:1.19,body:[-.008,-.24,.012],hip:-.16,drop:-.036,free:[.23,.62,.05],shield:[.20,.59,.225],weight:.3}],
  [.12,{hand:[-.25,.62,.19],pitch:1.34,body:[-.009,-.23,.012],hip:-.055,drop:-.044,free:[.24,.63,.015],shield:[.21,.585,.24],weight:.55}],
  [.23,{hand:[-.215,.64,.31],pitch:1.42,aim:.235,body:[-.012,-.085,.005],hip:.13,drop:-.035,shift:[.003,.014],step:.035,lift:.014,free:[.26,.60,-.055],shield:[.235,.57,.245],weight:.82}],
  [.34,{hand:[-.205,.65,.355],pitch:1.44,aim:.255,body:[-.014,.01,-.005],hip:.19,drop:-.029,shift:[-.004,.026],step:.075,free:[.27,.56,-.105],shield:[.25,.56,.225],weight:1}],
  [.43,{hand:[-.205,.65,.35],pitch:1.44,aim:.255,body:[-.012,.025,-.005],hip:.19,drop:-.03,shift:[-.004,.025],step:.08,free:[.27,.57,-.10],shield:[.25,.56,.225],weight:.87}],
  [.62,{hand:[-.245,.61,.215],pitch:1.30,body:[-.006,-.065,.002],hip:.055,drop:-.036,shift:[0,.012],step:.048,free:[.25,.60,-.015],shield:[.22,.575,.235],weight:.5}],
  [.82,{hand:[-.25,.57,.16],pitch:1.35,body:[.005,-.17,0],hip:-.07,drop:-.034,step:.017,lift:.011,free:[.24,.60,.04],weight:.22}],
 ]],
 ['insideThrust',[
  [.055,{hand:[-.285,.535,.13],pitch:1.53,aim:.39,body:[.008,-.31,.015],hip:-.21,drop:-.042,shift:[.008,-.012],free:[.22,.60,.05],shield:[.22,.565,.235],weight:.34}],
  [.12,{hand:[-.275,.515,.18],pitch:1.59,aim:.35,body:[.01,-.30,.015],hip:-.11,drop:-.049,shift:[.010,-.007],free:[.235,.61,.01],shield:[.24,.56,.24],weight:.57}],
  [.23,{hand:[-.15,.53,.29],pitch:1.56,aim:.18,body:[.015,-.055,.006],hip:.18,drop:-.052,shift:[.008,.016],step:.025,lift:.012,free:[.29,.60,-.035],shield:[.275,.56,.205],shieldAim:.07,weight:.82}],
  [.34,{hand:[-.125,.555,.345],pitch:1.57,aim:.17,body:[.022,.055,-.008],hip:.27,drop:-.053,shift:[.005,.028],step:.065,free:[.30,.565,-.085],shield:[.285,.555,.19],shieldAim:.07,weight:1}],
  [.43,{hand:[-.13,.555,.34],pitch:1.57,aim:.18,body:[.022,.07,-.007],hip:.26,drop:-.050,shift:[.004,.026],step:.07,free:[.30,.57,-.08],shield:[.285,.555,.19],shieldAim:.07,weight:.9}],
  [.62,{hand:[-.21,.555,.225],pitch:1.46,aim:.30,body:[.012,-.01,.004],hip:.10,drop:-.042,shift:[.005,.009],step:.045,free:[.27,.585,-.01],shield:[.25,.555,.225],weight:.5}],
  [.82,{hand:[-.255,.55,.16],body:[.009,-.18,.003],hip:-.06,drop:-.036,step:.015,lift:.01,free:[.25,.59,.04],weight:.22}],
 ]],
 ['lowThrust',[
  [.055,{hand:[-.265,.49,.14],pitch:1.65,body:[.012,-.22,.008],hip:-.15,drop:-.048,shift:[.005,-.014],free:[.23,.63,.055],shield:[.23,.58,.24],weight:.36}],
  [.12,{hand:[-.255,.475,.18],pitch:1.71,body:[.02,-.20,.01],hip:-.045,drop:-.063,shift:[.004,-.010],free:[.24,.65,.015],shield:[.21,.585,.24],weight:.60}],
  [.235,{hand:[-.22,.455,.28],pitch:1.71,aim:.24,body:[.029,-.065,.004],hip:.14,drop:-.065,shift:[.002,.014],step:.045,lift:.012,free:[.27,.63,-.065],shield:[.24,.565,.235],weight:.84}],
  [.34,{hand:[-.205,.45,.31],pitch:1.71,aim:.27,body:[.033,.005,-.006],hip:.21,drop:-.072,shift:[-.002,.033],step:.095,free:[.28,.62,-.095],shield:[.25,.56,.23],weight:1}],
  [.43,{hand:[-.205,.45,.30],pitch:1.71,aim:.27,body:[.032,.02,-.006],hip:.20,drop:-.070,shift:[-.002,.031],step:.10,free:[.28,.62,-.09],shield:[.25,.56,.23],weight:.91}],
  [.62,{hand:[-.235,.48,.215],pitch:1.58,body:[.021,-.05,0],hip:.09,drop:-.055,shift:[0,.012],step:.06,free:[.26,.61,-.015],shield:[.23,.555,.24],weight:.51}],
  [.82,{hand:[-.25,.525,.17],body:[.012,-.17,0],hip:-.065,drop:-.039,step:.02,lift:.012,free:[.25,.59,.04],weight:.23}],
 ]],
 ['lunge',[
  [.055,{hand:[-.28,.535,.10],pitch:1.45,body:[.008,-.34,.012],hip:-.24,drop:-.05,shift:[.008,-.020],free:[.245,.62,.035],shield:[.215,.58,.23],weight:.38}],
  [.12,{hand:[-.26,.54,.175],pitch:1.50,body:[.01,-.33,.014],hip:-.08,drop:-.062,shift:[.010,-.017],free:[.25,.62,-.005],shield:[.205,.575,.255],weight:.66}],
  [.235,{hand:[-.21,.55,.31],pitch:1.55,aim:.25,body:[.02,-.085,.005],hip:.19,drop:-.065,shift:[.005,.025],step:.075,lift:.018,free:[.265,.59,-.105],shield:[.22,.55,.26],weight:.88}],
  [.34,{hand:[-.195,.55,.345],pitch:1.57,aim:.265,body:[.032,.025,-.007],hip:.27,drop:-.081,shift:[0,.061],step:.145,free:[.265,.56,-.17],shield:[.235,.545,.25],weight:1}],
  [.43,{hand:[-.195,.55,.34],pitch:1.57,aim:.265,body:[.032,.035,-.007],hip:.27,drop:-.078,shift:[0,.057],step:.15,free:[.265,.56,-.155],shield:[.235,.545,.25],weight:.97}],
  [.62,{hand:[-.235,.54,.22],pitch:1.48,body:[.018,-.025,-.002],hip:.13,drop:-.061,shift:[.002,.030],step:.11,free:[.26,.59,-.06],shield:[.235,.555,.235],weight:.6}],
  [.82,{hand:[-.25,.55,.16],body:[.011,-.16,.003],hip:-.035,drop:-.043,shift:[.002,.005],step:.04,lift:.015,free:[.25,.595,.025],weight:.28}],
 ]],
].map(([name,poses])=>clip('rapier',name,poses,rapierReady,rapierShieldReady));

function charged(kind,normal){
 const source=normal.at(-1),remap=kind==='rapier'
  ?new Map([[.055,.10],[.12,.26],[.235,.34],[.34,.395],[.43,.43],[.62,.62],[.82,.83]])
  :new Map([[.10,.10],[.20,.20],[.24,.26],[.37,.39],[.51,.51],[.72,.72],[.88,.88]]);
 // Keep the characteristic point-first thrust even on a charged release.
 // Windup is delayed inside the existing charged interval, never a spin/cut.
 const contact=kind==='rapier'?{start:.33,center:.392,end:.43}:{start:.36,center:.46,end:.51};
 return {name:'lunge',contact,keys:source.keys.map(([time,f])=>[remap.get(time)??time,f]),
  shieldKeys:source.shieldKeys.map(([time,f])=>[remap.get(time)??time,f])};
}

export const THRUST_MOTIONS={
 rapier:{ready:rapierReady,shieldReady:rapierShieldReady,clips:rapierClips,charged:charged('rapier',rapierClips)},
};
