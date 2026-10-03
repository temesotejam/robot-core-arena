import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,distance,lockRange} from '../src/sim.js';
import {defaultConfig} from '../src/customize.js';
import {CATALOG,WEAPONS} from '../src/data.js';
import {GameApp} from '../src/ui.js';
import {Controls} from '../src/input.js';
import {assignBinding,defaultBindings} from '../src/bindings.js';
import {ArenaRenderer} from '../src/render.js';
import * as THREE from '../vendor/three.module.min.js';

const get=id=>CATALOG[id];
function battle({allies=1,enemies=3,player=0,stage='flat',weapon='sword'}={}){
 const a=Array.from({length:allies},(_,i)=>{const c=defaultConfig(i);c.sets[0]={item:`weapon:${weapon}`,shield:null};c.abilities=[];return c;}),e=Array.from({length:enemies},(_,i)=>{const c=defaultConfig(i,true);c.abilities=[];return c;});
 const b=new Battle({allies:a,enemies:e,setup:{allies,enemies,player,stage,duration:0,training:true,coordination:'spread'},getItem:get,rng:()=>.5});b.training.freezeAI=true;return b;
}
function foes(b){return b.entities.filter(u=>u.team!==b.human.team&&!u.dead);}
function validTarget(b){const target=b.targetOf(b.human);assert(target&&!target.dead&&target.team!==b.human.team,'living player must target a living enemy');return target;}
function lethal(b,v){const u=b.human;return b.hit(u,v,{id:`lock-test:${b.serial++}`,owner:u.id,weapon:u.stats.weapon.id,attackStats:u.stats,normal:true,coefficient:1000,charge:0,finisher:false,exhausted:false,cPaid:new Set(),statusPaid:new Set(),freezeBoost:new Set()});}
function appStub(b,screen=[]){
 const calls=[],app=Object.assign(Object.create(GameApp.prototype),{view:'battle',modalType:null,controls:{capture:false},battle:b,skillIndex:0,skillChoices:['sword:normal','sword:buff']});
 app.renderer={orderedTargets:()=>foes(b),screenTargets:()=>screen,resetCamera:value=>{assert.equal(value,b);calls.push(['reset']);}};
 app.showPause=()=>calls.push(['pause']);app.showSkills=()=>calls.push(['skills']);app.closeModal=()=>{calls.push(['close']);app.modalType=null;};app.action=(name,data)=>calls.push([name,data]);return {app,calls};
}

test('全9人数構成・全操作機・全ステージでカウントダウン前から最も近い敵へロックする',()=>{
 for(const allies of [1,2,3])for(const enemies of [1,2,3])for(let player=0;player<allies;player++)for(const stage of ['flat','yard','terrace']){
  const b=battle({allies,enemies,player,stage}),nearest=foes(b).sort((a,e)=>distance(b.human,a)-distance(b.human,e))[0];
  assert.equal(b.countdown,3);assert.equal(validTarget(b).id,nearest.id,`${allies}/${enemies}/${player}/${stage}: initial target`);
  const target=b.human.target;b.tick(.04,{lockPressed:true});assert.equal(b.time,0);assert.equal(b.human.target,target,'countdown must not require a lock button');
 }
 const far=battle({stage:'terrace'});assert(distance(far.human,validTarget(far))>lockRange(far.human.stats),'the fixture must exercise initial locking beyond the old melee lock distance');
 const countdown=battle(),expired=validTarget(countdown);expired.dead=true;countdown.tick(.04,{attack:true});assert.notEqual(validTarget(countdown).id,expired.id);assert.equal(countdown.time,0);assert(!countdown.events.some(e=>e.type==='attack'),'target maintenance must not skip the countdown');
 const empty=battle({enemies:0});assert.equal(empty.human.target,null);
});

test('選択した敵は射程外・遮蔽・武器切替でも保持し、ロック再取得操作で近い別の敵へ変わらない',()=>{
 for(const fps of [30,60,120]){
  const b=battle(),u=b.human,[near,selected]=foes(b);b.countdown=0;b.stage={...b.stage,width:180,depth:100,obstacles:[{x:0,z:0,w:2,d:40,h:3}],ramps:[]};
  Object.assign(u,{x:-7,z:0,target:selected.id});Object.assign(near,{x:-6,z:3});Object.assign(selected,{x:70,z:0});const target=u.target;
  for(let i=0;i<fps*2;i++){b.tick(1/fps);assert.equal(u.target,target,'occlusion and range must not release a chosen enemy');}
  assert.equal(b.acquireLock(u,[near]),selected);assert.equal(u.target,target,'legacy reacquire must preserve a valid choice');
  assert(b.switchWeapon(u));for(let i=0;i<Math.ceil(fps*.3);i++)b.tick(1/fps);assert.equal(u.active,1);assert.equal(u.target,target,'weapon-dependent lock distance must not change the selected enemy');
 }
});

test('画面内の並びを優先して手動切替でき、画面外・遠方・遮蔽中の生きた敵も循環に含める',()=>{
 const b=battle({allies:2}),u=b.human,[first,offscreen,screen]=foes(b),ally=b.entities.find(v=>v.team===u.team&&v!==u);
 b.stage={...b.stage,width:200,depth:200,obstacles:[{x:0,z:0,w:2,d:100,h:3}],ramps:[]};Object.assign(offscreen,{x:80,z:0});u.target=screen.id;
 const ordered=[screen,first];b.cycleTarget(u,1,ordered);assert.equal(u.target,first.id);b.cycleTarget(u,1,ordered);assert.equal(u.target,offscreen.id);b.cycleTarget(u,1,ordered);assert.equal(u.target,screen.id);b.cycleTarget(u,-1,ordered);assert.equal(u.target,offscreen.id);
 first.dead=true;u.target=screen.id;b.cycleTarget(u,1,[ally,first,screen,screen]);assert.equal(u.target,offscreen.id,'duplicates, allies and dead enemies must not occupy cycle slots');
 b.cycleTarget(u,1,[]);assert.equal(u.target,screen.id,'an empty screen list must still allow target switching');assert.equal(validTarget(b),screen);
});

test('撃破を実ダメージで起こすと同じ処理内で残った敵へ移り、最後の敵だけがいなくなると解除する',()=>{
 const b=battle(),u=b.human;const enemies=foes(b);u.target=enemies[0].id;
 for(const victim of enemies){
  if(victim!==enemies[0])u.target=victim.id;assert.equal(validTarget(b),victim);const before=foes(b).length;
  assert(lethal(b,victim)>0);assert(victim.dead);assert.equal(victim.lp,0);assert.equal(foes(b).length,before-1);
  if(before>1){const replacement=validTarget(b);assert.notEqual(replacement.id,victim.id);}else assert.equal(u.target,null);
 }
 b.acquireLock(u);assert.equal(u.target,null);b.cycleTarget(u,1,[]);assert.equal(u.target,null);
});

test('外部から消えた・撃破済み・味方の対象も攻撃入力より先に補正し、射撃の射程や壁貫通を変更しない',()=>{
 for(const invalid of ['missing','dead','ally','null']){
  const b=battle({allies:2,enemies:2,weapon:'machinegun'}),u=b.human,[target,other]=foes(b);b.countdown=0;b.stage={...b.stage,obstacles:[],ramps:[],width:120,depth:100};Object.assign(u,{x:0,z:0,yaw:Math.PI});Object.assign(target,{x:0,z:4});Object.assign(other,{x:0,z:20});
  if(invalid==='dead'){other.dead=true;u.target=other.id;}else u.target=invalid==='ally'?b.entities.find(v=>v.team===u.team&&v!==u).id:invalid==='null'?null:'missing-target';
  b.tick(1/120,{attack:true});assert.equal(u.target,target.id);const shot=b.projectiles.find(p=>p.owner===u.id);assert(shot&&shot.vz>0,'the first automatic shot must use the restored target rather than the old backward yaw');assert.equal(shot.range,WEAPONS.machinegun.range);
 }
 const b=battle({enemies:1,weapon:'machinegun'}),u=b.human,v=foes(b)[0];b.countdown=0;b.stage={...b.stage,obstacles:[{x:0,z:3,w:4,d:1,h:3}],ramps:[],width:120};Object.assign(u,{x:0,z:0,yaw:0});Object.assign(v,{x:0,z:40});const lp=v.lp;
 b.tick(1/120,{attack:true});for(let i=0;i<120;i++)b.tick(1/120);assert.equal(u.target,v.id);assert.equal(v.lp,lp,'always lock-on must not make ordinary bullets pierce a wall or gain range');assert.equal(b.projectiles.length,0);
});

test('Tab・パッドロック入力は解除せず次の敵へ切り替わり、同時入力は一度だけ切り替えて視点も戻せる',()=>{
 const b=battle(),[first,second,third]=foes(b);b.human.target=first.id;const {app,calls}=appStub(b,[first,second,third]),input={lockPressed:true,attack:true,x:.4,z:.8},snapshot=structuredClone(input);
 const sequence=[first,second,third],visited=new Set();for(let i=0;i<20;i++){assert.equal(app.handleMenuInput(input),false);assert.equal(validTarget(b),sequence[(i+1)%sequence.length]);visited.add(b.human.target);}assert.equal(visited.size,3);assert.deepEqual(input,snapshot,'battle inputs must be passed through intact');
 assert.equal(app.handleMenuInput({lockPressed:true,targetNextPressed:true}),false);assert.equal(b.human.target,first.id,'two bindings for next target must advance only once');
 app.handleMenuInput({targetPrevPressed:true});assert.equal(b.human.target,third.id);app.handleMenuInput({resetPressed:true,lockPressed:true});assert.deepEqual(calls,[['reset']]);assert.equal(b.human.target,first.id);
 const one=battle({enemies:1}),single=validTarget(one),singleApp=appStub(one,[single]).app;for(let i=0;i<20;i++){singleApp.handleMenuInput({lockPressed:true});assert.equal(validTarget(one),single,'one living enemy must remain selected');}
});

test('必殺技は同じメニューボタンで閉じ、他のモーダル・割当キャプチャ・コア回転の入力を保つ',()=>{
 const b=battle(),target=b.human.target,{app,calls}=appStub(b,foes(b));
 assert.equal(app.handleMenuInput({pausePressed:true,targetNextPressed:true,lockPressed:true}),true);assert.deepEqual(calls.pop(),['pause']);assert.equal(b.human.target,target);
 assert.equal(app.handleMenuInput({menuPressed:true,targetNextPressed:true}),true);assert.deepEqual(calls.pop(),['skills']);assert.equal(b.human.target,target);
 app.modalType='skills';assert.equal(app.handleMenuInput({menuPressed:true,confirmPressed:true,targetNextPressed:true,lockPressed:true}),undefined);assert.deepEqual(calls.pop(),['close']);assert.equal(app.modalType,null);assert.equal(b.human.target,target);
 app.modalType='skills';assert.equal(app.handleMenuInput({downPressed:true,confirmPressed:true,targetNextPressed:true,lockPressed:true}),true);assert.equal(app.skillIndex,1);assert.deepEqual(calls.splice(0),[['skills'],['useSkill',{id:'sword:buff'}]]);assert.equal(b.human.target,target);
 assert.equal(app.handleMenuInput({cancelPressed:true}),undefined);assert.deepEqual(calls.pop(),['close']);
 for(const modal of ['pause','inventory']){app.modalType=modal;assert.equal(app.handleMenuInput({menuPressed:true,targetNextPressed:true,lockPressed:true}),true);assert.equal(app.modalType,modal);assert.equal(calls.length,0);assert.equal(b.human.target,target);}
 for(const capture of ['modal','control']){app.modalType=capture==='modal'?'bindingCapture':null;app.controls.capture=capture==='control';assert.equal(app.handleMenuInput({menuPressed:true,pausePressed:true,targetNextPressed:true,lockPressed:true}),true);assert.equal(calls.length,0);assert.equal(b.human.target,target);}
 app.modalType=null;app.controls.capture=false;app.view='custom';app.customTab='core';assert.equal(app.handleMenuInput({resetPressed:true,lockPressed:true}),false);assert.deepEqual(calls.pop(),['rotate',{}]);assert.equal(b.human.target,target);
});

test('変更したキーボード・パッド・タッチの必殺ボタンはメニュー中にも届き、押し続けでは閉じず再押下で閉じる',()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let padButtons=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[{connected:true,id:'menu-test',axes:[0,0,0,0],buttons:Array.from({length:20},(_,i)=>({pressed:padButtons.includes(i)}))}]}});
 try{
  for(const device of ['keyboard','gamepad','touch']){
   padButtons=[];const bindings=defaultBindings();assignBinding(bindings,'keyboard','menu',0,'KeyM');assignBinding(bindings,'gamepad','menu',0,10);const saved=structuredClone(bindings);
   const controls=Object.assign(Object.create(Controls.prototype),{keys:new Set(),pressed:new Set(),blockedKeys:new Set(),blockedPad:new Set(),prevButtons:[],capture:null,touch:{x:0,z:0,attack:false,guard:false},touchPressed:new Set(),getBindings:()=>bindings,mode:'battle',onLook:()=>{}});
   const b=battle(),target=b.human.target,{app,calls}=appStub(b);app.controls=controls;app.showSkills=()=>{calls.push(['skills']);app.modalType='skills';};
   const press=()=>{if(device==='keyboard'){controls.keys.add('KeyM');controls.pressed.add('KeyM');}else if(device==='gamepad')padButtons=[10];else controls.touchPressed.add('menu');};
   const release=()=>{controls.keys.clear();padButtons=[];controls.poll(.016,'menu');};
   press();const opening=controls.poll(.016,'battle');assert.equal(opening.menuPressed,true,`${device}: assigned menu action must open`);assert.equal(app.handleMenuInput(opening),true);assert.equal(app.modalType,'skills');
   const held=controls.poll(.016,'menu');assert.equal(held.menuPressed,false);assert.equal(app.handleMenuInput(held),true);assert.equal(app.modalType,'skills','holding the same button must not close the menu immediately');
   release();press();const closing=controls.poll(.016,'menu');assert.equal(closing.menuPressed,true,`${device}: same action must also be polled inside the menu`);assert.equal(closing.attack,false);assert.equal(closing.guard,false);assert.equal(closing.lockPressed,false);assert.equal(closing.targetNextPressed,false);assert.equal(app.handleMenuInput(closing),undefined);assert.equal(app.modalType,null);assert.deepEqual(calls,[['skills'],['close']]);assert.equal(b.human.target,target);assert.deepEqual(bindings,saved,'opening and closing must preserve reassigned bindings');
   release();controls.keys.add('KeyE');controls.pressed.add('KeyE');padButtons=[5];assert.equal(controls.poll(.016,'battle').menuPressed,false,'the former keyboard and pad menu bindings must remain inactive');
  }
 }finally{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});

test('CPUのロック取得には従来の射程と遮蔽を適用し、操作機の常時ロックを他機へ広げない',()=>{
 const b=battle({enemies:1}),u=b.entities.find(v=>v.team!==b.human.team);b.stage={...b.stage,obstacles:[],ramps:[],width:200};Object.assign(u,{x:0,z:0});Object.assign(b.human,{x:80,z:0});
 b.acquireLock(u);assert.equal(u.target,null,'CPU acquire still requires its lock distance');Object.assign(b.human,{x:10,z:0});b.stage.obstacles=[{x:5,z:0,w:2,d:4,h:3}];b.acquireLock(u);assert.equal(u.target,null,'CPU acquire still requires line of sight');
 b.stage.obstacles=[];assert.equal(b.acquireLock(u),b.human);assert.equal(u.target,b.human.id);assert.equal(validTarget(b),u);
 b.kill(b.human,u);assert.equal(b.acquireLock(b.human,[u]),null,'a defeated player must not reacquire an enemy');assert.equal(b.human.target,null);
});

function cameraFixture(b){
 const u=b.observed,r=Object.assign(Object.create(ArenaRenderer.prototype),{mode:'battle',robots:new Map(),bullets:new Map(),fx:[],world:new THREE.Group(),scene:new THREE.Scene(),renderer:{render(){}},camera:new THREE.PerspectiveCamera(45,1.6,.04,120),raycaster:new THREE.Raycaster(),colliders:[],cameraYaw:u.yaw,manualYaw:0,cameraPitch:.28,animateRobot(){}});
 for(const o of b.stage.obstacles){const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w,o.h,o.d),new THREE.MeshBasicMaterial());mesh.position.set(o.x,o.h/2,o.z);mesh.updateMatrixWorld(true);r.colliders.push(mesh);}
 r.camera.position.set(u.x-Math.sin(u.yaw)*5,u.y+3,u.z-Math.cos(u.yaw)*5);return r;
}
function advanceCamera(r,b,check=()=>{}){for(let i=0;i<240;i++){r.render(b,1/60,i/60);for(const value of [...r.camera.position.toArray(),...r.camera.quaternion.toArray()])assert(Number.isFinite(value),'the locked camera must remain finite');check(r.camera.position);}r.camera.updateMatrixWorld(true);}
function assertPlayerInView(r,b){const u=b.observed,p=new THREE.Vector3(u.x,u.y+.55,u.z).project(r.camera);assert(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1,'a distant locked enemy must not push the player out of the camera view');}
test('壁越しの開始ロックと遠方ロックでもカメラは自機後方に残り、近い壁へ入り込まず自機を映す',()=>{
 const yard=battle({stage:'yard',enemies:1}),yardRenderer=cameraFixture(yard),u=yard.observed;advanceCamera(yardRenderer,yard,p=>{assert(p.x<u.x,'locking across the starting wall must not push the camera ahead of the player');assert(!yardRenderer.colliders.some(mesh=>new THREE.Box3().setFromObject(mesh).containsPoint(p)),'camera cannot occupy an arena wall');});assertPlayerInView(yardRenderer,yard);
 const far=battle({enemies:1});far.stage={...far.stage,width:240,depth:240,obstacles:[],ramps:[]};Object.assign(far.observed,{x:0,z:0,yaw:0});Object.assign(foes(far)[0],{x:0,z:100});const farRenderer=cameraFixture(far);advanceCamera(farRenderer,far);assert(farRenderer.camera.position.z<far.observed.z-1,'distant target framing must retain space behind the player');assert(farRenderer.camera.position.distanceTo(new THREE.Vector3(far.observed.x,far.observed.y,far.observed.z))<30,'camera framing must stay local instead of following the distant midpoint');assertPlayerInView(farRenderer,far);
 const close=battle({enemies:1});Object.assign(close.observed,{x:0,z:.28,yaw:0});Object.assign(foes(close)[0],{x:0,z:20});close.stage={...close.stage,obstacles:[{x:0,z:-1,w:10,d:2,h:3}],ramps:[]};const closeRenderer=cameraFixture(close);closeRenderer.camera.position.set(0,.9,.6);const wall=new THREE.Box3().setFromObject(closeRenderer.colliders[0]);
 advanceCamera(closeRenderer,close,p=>{assert(!wall.containsPoint(p),'collision correction must not impose a minimum distance beyond a nearby wall');assert(p.z>0,'camera must remain on the player side of the wall on every intermediate frame');});assert(closeRenderer.camera.position.distanceTo(new THREE.Vector3(0,.65,.28))<.5,'the fixture must require a camera distance shorter than the former 0.5H minimum');
 for(const r of [yardRenderer,farRenderer,closeRenderer])for(const mesh of r.colliders){mesh.geometry.dispose();mesh.material.dispose();}
});
