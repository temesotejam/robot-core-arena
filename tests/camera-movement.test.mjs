import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ArenaRenderer} from '../src/render.js';
test('カメラの全方向で右入力は画面の右へ、左入力は左へ進む',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/3]){
  const camera=new THREE.PerspectiveCamera(45,1.6,.04,100);camera.position.set(-Math.sin(yaw)*5,3,-Math.cos(yaw)*5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const input of [-1,1]){const delta=ArenaRenderer.prototype.movement.call({cameraYaw:yaw},input,0);const projected=new THREE.Vector3(delta.x,0,delta.z).project(camera);assert(projected.x*input>0,`yaw ${yaw}: 左右が反転している`);assert(Math.abs(Math.hypot(delta.x,delta.z)-1)<1e-12);}
  const forward=ArenaRenderer.prototype.movement.call({cameraYaw:yaw},0,1);assert(Math.abs(forward.x-Math.sin(yaw))<1e-12);assert(Math.abs(forward.z-Math.cos(yaw))<1e-12);
 }
});
