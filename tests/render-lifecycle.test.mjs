import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ArenaRenderer,createRobot} from '../src/render.js';
import {CATALOG} from '../src/data.js';
import {defaultConfig} from '../src/customize.js';
import {Battle} from '../src/sim.js';

const lookup=id=>CATALOG[id];
function disposals(root){const counts=new Map();root.traverse(o=>{for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])].filter(Boolean))if(!counts.has(resource)){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}});return counts;}
function renderer(){return Object.assign(Object.create(ArenaRenderer.prototype),{world:new THREE.Group(),effects:new THREE.Group(),camera:new THREE.PerspectiveCamera(),robots:new Map(),bullets:new Map(),fx:[],colliders:[]});}
test('武器切替で専用の刃・銃身・残像を解放し、共有資源は解放しない',()=>{
 const ref=createRobot(defaultConfig(),lookup);
 for(const kind of ['sniper','sword','hammer','naginata','dualSword','missile']){
  const counts=disposals(ref.root),old=[...ref.weaponAttachments,...ref.weaponTrails.map(t=>t.mesh)];
  ref.changeWeapons({item:`weapon:${kind}`,shield:'shield:basic'});
  assert(old.every(o=>o.parent===null));
  for(const o of old) o.traverse(mesh=>{if(mesh.geometry&&['ExtrudeGeometry','CylinderGeometry','ConeGeometry','BufferGeometry'].includes(mesh.geometry.type)&&!mesh.name){if(mesh.geometry.type!=='ExtrudeGeometry'||o.name.startsWith('weapon:')&&mesh.geometry.parameters?.options?.bevelEnabled===false)assert.equal(counts.get(mesh.geometry),1);}});
  for(const [resource,n]of counts)if(resource.type==='BoxGeometry'||resource.type==='MeshStandardMaterial')assert.equal(n,0,'共有資源を破棄しない');
 }
});
test('シーン交換で固有の関節・リング・床線・エフェクトを一度だけ解放する',()=>{
 const r=renderer();r.hangar(defaultConfig(),lookup);const counts=disposals(r.world);
 const effect=new THREE.Mesh(new THREE.RingGeometry(.1,.2),new THREE.MeshBasicMaterial());r.effects.add(effect);const fx=disposals(r.effects);
 r.clear();r.clear();assert.equal(r.preview,null);assert.equal(r.world.children.length,0);assert.equal(r.effects.children.length,0);
 for(const [resource,n]of counts)if(['SphereGeometry','CylinderGeometry','RingGeometry','TorusGeometry','BufferGeometry','MeshBasicMaterial','LineBasicMaterial'].includes(resource.type))assert.equal(n,1,resource.type);
 for(const n of fx.values())assert.equal(n,1);
 for(const [resource,n]of counts)if(resource.type==='BoxGeometry'||resource.type==='MeshStandardMaterial')assert.equal(n,0);
});
test('同じ構成の格納庫を描き直さず、再戦では古い6機の描画資源を解放する',()=>{
 const r=renderer(),c=defaultConfig();r.hangar(c,lookup);const preview=r.preview;r.hangar(c,lookup);assert.equal(r.preview,preview);
 const b=new Battle({allies:[0,1,2].map(i=>defaultConfig(i)),enemies:[0,1,2].map(i=>defaultConfig(i,true)),setup:{allies:3,enemies:3,player:0,stage:'terrace',duration:0},getItem:lookup});r.startBattle(b);const old=[...r.robots.values()],counts=disposals(r.world);r.startBattle(b);
 assert.equal(r.robots.size,6);assert(old.every(ref=>ref.root.parent===null));
 for(const [resource,n]of counts)if(resource.type==='SphereGeometry'||resource.type==='RingGeometry'||resource.type==='LineBasicMaterial')assert.equal(n,1);
});
