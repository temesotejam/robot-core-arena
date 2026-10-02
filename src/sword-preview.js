import {ArenaRenderer,createRobot} from './render.js';
import {Battle} from './sim.js';
import {defaultConfig} from './customize.js';
import {CATALOG} from './data.js';
const renderer=new ArenaRenderer(document.querySelector('#arena'));
renderer.mode='inspection';renderer.scene.fog=null;renderer.floor(14,14);
renderer.light.shadow.camera.left=-3;renderer.light.shadow.camera.right=3;renderer.light.shadow.camera.top=3;renderer.light.shadow.camera.bottom=-3;renderer.light.shadow.camera.updateProjectionMatrix();
const names=['斜め斬り','斬り返し','斬り上げ','振り下ろし'];
let battle,model,targetModel,selected=-1,playing=true,speed=1,yaw=2.2,pitch=.12,distance=2.9,accumulator=0,pressing=false,finishedAt=null,withShield=true,withTarget=true;
const status=document.querySelector('#pose');
// Only this inspection page anchors and replenishes its training target.
// Combat hit timing and the attacker's collision-limited step use the real Battle.
function holdTarget(){
 const v=battle.entities[1];Object.assign(v,{x:0,z:withTarget?.90:4,y:withTarget?0:10,yaw:Math.PI,vx:0,vz:0,down:0,rise:0,stun:0,statusTime:0,dead:false,lp:v.stats.lp});
}
function reset(){
 for(const ref of [model,targetModel])if(ref){renderer.world.remove(ref.root);for(const t of ref.weaponTrails){t.mesh.geometry.dispose();t.mesh.material.dispose();}}
 if(targetModel)targetModel.root.traverse(m=>{if(m.isMesh&&m.userData.previewGhost)m.material.dispose();});
 const config=defaultConfig();config.sets[0]={item:'weapon:sword',shield:withShield?'shield:basic':null};
 battle=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id]});
 battle.countdown=0;battle.training.freezeAI=true;battle.training.infinite=true;Object.assign(battle.human,{x:0,z:0,yaw:0});holdTarget();battle.human.target=withTarget?battle.entities[1].id:null;
 model=createRobot(config,id=>CATALOG[id]);model.active=0;renderer.world.add(model.root);
 targetModel=createRobot(defaultConfig(),id=>CATALOG[id],1);targetModel.active=0;for(const w of targetModel.weaponAttachments)w.visible=false;targetModel.root.traverse(m=>{if(m.isMesh&&m!==targetModel.ring&&!targetModel.weaponTrails.some(t=>t.mesh===m)){m.castShadow=false;m.material=m.material.clone();m.material.transparent=true;m.material.opacity=.32;m.material.depthWrite=false;m.userData.previewGhost=true;}});renderer.world.add(targetModel.root);accumulator=0;pressing=false;finishedAt=null;
 if(selected>=0){battle.human.combo=(selected+3)%4;battle.human.comboWindow=1;}
}
function step(){
 const u=battle.human,rt=battle.runtime(u);let input={};
 const first=!u.attack&&!u.motion&&battle.time<.2,follow=selected<0&&u.combo<3&&u.attack&&!u.queuedAttack&&rt.cooldown<=.15&&rt.cooldown>0;
 if(pressing)pressing=false;else if(first||follow){input={attack:true};pressing=true;}
 holdTarget();battle.tick(1/120,input);holdTarget();battle.consumeEvents();
 if(!u.attack&&!u.motion&&battle.time>.3){finishedAt??=battle.time;if(battle.time-finishedAt>.65)reset();}
}
function draw(){
 const u=battle.human;holdTarget();renderer.animateRobot(model,u,battle.time);model.ring.visible=false;renderer.animateRobot(targetModel,battle.entities[1],battle.time);targetModel.ring.visible=false;targetModel.root.visible=withTarget;
 // The fixed, translucent training target makes blade entry visible. The
 // camera frames both robots; the stationary floor and shadows make
 // grounded feet and any sliding visible, rather than hiding root movement.
 const mobile=innerWidth<600,height=mobile?.42:.64,zoom=mobile?distance*1.30:distance,focusZ=withTarget?(u.z+.9)/2:u.z;renderer.camera.position.set(u.x+Math.sin(yaw)*Math.cos(pitch)*zoom,u.y+height+Math.sin(pitch)*zoom,focusZ+Math.cos(yaw)*Math.cos(pitch)*zoom);renderer.camera.lookAt(u.x,u.y+height,focusZ);renderer.renderer.render(renderer.scene,renderer.camera);
 const attack=u.attack||u.motion,p=attack?attack.elapsed/attack.duration:1,phase=p<.16?'構え・踏み込み':p<.53?'斬撃':p<.67?'振り抜き':'戻し';
 status.textContent=attack?`${u.combo+1}段目：${names[u.combo]}　·　${phase}`:'構え';
}
reset();let previous=performance.now();
function frame(now){const dt=Math.min(.25,(now-previous)/1000);previous=now;if(playing){accumulator+=dt*speed;while(accumulator>=1/120){step();accumulator-=1/120;}}draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
for(const button of document.querySelectorAll('[data-stage]'))button.addEventListener('click',()=>{selected=Number(button.dataset.stage);document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));reset();draw();});
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'一時停止':'再生';};
document.querySelector('#replay').onclick=()=>{reset();draw();};
document.querySelector('#speed').onchange=e=>{speed=Number(e.target.value);};
document.querySelector('#camera').onchange=e=>{yaw={threequarter:2.2,front:0,side:Math.PI/2,rear:Math.PI}[e.target.value];pitch=.12;};
document.querySelector('#shield').onchange=e=>{withShield=e.target.value==='1';reset();draw();};
document.querySelector('#target').onchange=e=>{withTarget=e.target.value==='1';reset();draw();};
let drag=null;const canvas=renderer.canvas;
canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.009;pitch=Math.max(-.10,Math.min(.65,pitch+(e.clientY-drag.y)*.005));drag.x=e.clientX;drag.y=e.clientY;});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.6,Math.min(4,distance+e.deltaY*.002));},{passive:false});
// Same simulation and renderer as the game; exposed for deterministic browser
// review of authored poses. This page does not read or write the player's save.
export const swordPreview={get battle(){return battle;},get model(){return model;},get targetModel(){return targetModel;},renderer,reset,draw};
