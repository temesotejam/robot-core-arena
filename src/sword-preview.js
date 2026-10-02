import {ArenaRenderer,createRobot} from './render.js';
import {Battle} from './sim.js';
import {defaultConfig} from './customize.js';
import {CATALOG} from './data.js';
const renderer=new ArenaRenderer(document.querySelector('#arena'));
renderer.mode='inspection';renderer.scene.fog=null;renderer.floor(14,14);
renderer.light.shadow.camera.left=-3;renderer.light.shadow.camera.right=3;renderer.light.shadow.camera.top=3;renderer.light.shadow.camera.bottom=-3;renderer.light.shadow.camera.updateProjectionMatrix();
const names=['斜め斬り','斬り返し','斬り上げ','振り下ろし'];
let battle,model,selected=-1,playing=true,speed=1,yaw=.38,pitch=.12,distance=2.6,accumulator=0,pressing=false,finishedAt=null,withShield=true;
const status=document.querySelector('#pose');
function reset(){
 if(model){renderer.world.remove(model.root);for(const t of model.weaponTrails){t.mesh.geometry.dispose();t.mesh.material.dispose();}}
 const config=defaultConfig();config.sets[0]={item:'weapon:sword',shield:withShield?'shield:basic':null};
 battle=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id]});
 battle.countdown=0;battle.training.freezeAI=true;battle.training.infinite=true;Object.assign(battle.human,{x:0,z:0,yaw:0});Object.assign(battle.entities[1],{x:0,z:4,y:10});
 model=createRobot(config,id=>CATALOG[id]);model.active=0;renderer.world.add(model.root);accumulator=0;pressing=false;finishedAt=null;
 if(selected>=0){battle.human.combo=(selected+3)%4;battle.human.comboWindow=1;}
}
function step(){
 const u=battle.human,rt=battle.runtime(u);let input={};
 const first=!u.attack&&!u.motion&&battle.time<.2,follow=selected<0&&u.combo<3&&u.attack&&!u.queuedAttack&&rt.cooldown<=.15&&rt.cooldown>0;
 if(pressing)pressing=false;else if(first||follow){input={attack:true};pressing=true;}
 battle.tick(1/120,input);battle.consumeEvents();
 if(!u.attack&&!u.motion&&battle.time>.3){finishedAt??=battle.time;if(battle.time-finishedAt>.65)reset();}
}
function draw(){
 const u=battle.human;renderer.animateRobot(model,u,battle.time);model.ring.visible=false;
 // The camera follows actual travel. The stationary floor and shadows make
 // grounded feet and any sliding visible, rather than hiding root movement.
 const height=innerWidth<600?.74:.64;renderer.camera.position.set(u.x+Math.sin(yaw)*Math.cos(pitch)*distance,u.y+height+Math.sin(pitch)*distance,u.z+Math.cos(yaw)*Math.cos(pitch)*distance);renderer.camera.lookAt(u.x,u.y+height,u.z);renderer.renderer.render(renderer.scene,renderer.camera);
 const attack=u.attack||u.motion,p=attack?attack.elapsed/attack.duration:1,phase=p<.16?'構え・踏み込み':p<.53?'斬撃':p<.67?'振り抜き':'戻し';
 status.textContent=attack?`${u.combo+1}段目：${names[u.combo]}　·　${phase}`:'構え';
}
reset();let previous=performance.now();
function frame(now){const dt=Math.min(.25,(now-previous)/1000);previous=now;if(playing){accumulator+=dt*speed;while(accumulator>=1/120){step();accumulator-=1/120;}}draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
for(const button of document.querySelectorAll('[data-stage]'))button.addEventListener('click',()=>{selected=Number(button.dataset.stage);document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));reset();draw();});
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'一時停止':'再生';};
document.querySelector('#replay').onclick=()=>{reset();draw();};
document.querySelector('#speed').onchange=e=>{speed=Number(e.target.value);};
document.querySelector('#camera').onchange=e=>{yaw={threequarter:.38,front:0,side:Math.PI/2,rear:Math.PI}[e.target.value];pitch=.12;};
document.querySelector('#shield').onchange=e=>{withShield=e.target.value==='1';reset();draw();};
let drag=null;const canvas=renderer.canvas;
canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.009;pitch=Math.max(-.10,Math.min(.65,pitch+(e.clientY-drag.y)*.005));drag.x=e.clientX;drag.y=e.clientY;});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.6,Math.min(4,distance+e.deltaY*.002));},{passive:false});
// Same simulation and renderer as the game; exposed for deterministic browser
// review of authored poses. This page does not read or write the player's save.
export const swordPreview={get battle(){return battle;},get model(){return model;},renderer,reset,draw};
