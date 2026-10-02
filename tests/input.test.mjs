import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,defaultBindings,validateBindings,assignBinding} from '../src/bindings.js';
import {Controls} from '../src/input.js';
import {freshSave,validateSave} from '../src/storage.js';
class Surface extends EventTarget {closest(){return null;}querySelector(){return null;}}
function fixture(){
 const window=new Surface(),document=new Surface(),canvas=new Surface();let pads=[];
 Object.assign(globalThis,{window,document});Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>pads},configurable:true});
 const bindings=defaultBindings(),controls=new Controls(canvas,()=>{},()=>bindings);controls.setMode('battle');
 const send=(type,data={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,data);window.dispatchEvent(e);return e;};
 const pad=(indices=[])=>{pads=[{connected:true,id:'test',axes:[0,0,0,0],buttons:Array.from({length:18},(_,i)=>({pressed:indices.includes(i)}))}];};
 return {controls,bindings,send,pad};
}
test('旧保存・バックアップに標準割り当てを追加し、機体・所持品を保持する',()=>{
 const s=freshSave();delete s.settings.bindings;s.records.wins=7;const name=s.units[0].name;validateSave(s);
 assert.deepEqual(s.settings.bindings,defaultBindings());assert.equal(s.records.wins,7);assert.equal(s.units[0].name,name);
 assignBinding(s.settings.bindings,'keyboard','jump',0,'KeyJ');assert.equal(validateSave(JSON.parse(JSON.stringify(s))).settings.bindings.keyboard.jump[0],'KeyJ');
 const broken=freshSave();broken.settings.bindings.gamepad.jump[0]=100;assert.throws(()=>validateSave(broken));
});
test('重複は同じ場面内で入れ替え、戦闘とメニューの共有は維持する',()=>{
 const b=defaultBindings();assert.deepEqual(assignBinding(b,'keyboard','jump',0,'KeyW'),['moveForward']);assert.equal(b.keyboard.moveForward[0],'Space');
 assignBinding(b,'gamepad','jump',0,3);assert.equal(b.gamepad.attack[0],1);assert.equal(b.gamepad.confirm[0],3);
 assignBinding(b,'keyboard','jump',1,'KeyW');assert.deepEqual(b.keyboard.jump,[null,'KeyW']);assert.doesNotThrow(()=>validateBindings(b));
});
test('変更した移動・攻撃・ガード・ジャンプを実入力で使用し、旧キーは発火しない',()=>{
 const {controls:c,bindings:b,send}=fixture();assignBinding(b,'keyboard','moveForward',0,'ArrowUp');assignBinding(b,'keyboard','attack',0,'KeyJ');assignBinding(b,'keyboard','guard',0,'Mouse1');assignBinding(b,'keyboard','jump',0,'KeyK');
 send('keydown',{code:'KeyW'});assert.equal(c.poll(.016).z,0);send('keyup',{code:'KeyW'});
 assert(send('keydown',{code:'ArrowUp'}).defaultPrevented);send('keydown',{code:'KeyJ'});send('keydown',{code:'KeyK'});send('pointerdown',{button:1,pointerType:'mouse'});
 let input=c.poll(.016);assert.equal(input.z,1);assert(input.attack&&input.guard&&input.jumpPressed);
 input=c.poll(.016);assert(input.attack&&input.guard);assert(!input.jumpPressed);
 send('keyup',{code:'KeyJ'});send('pointerup',{button:1});assert(!c.poll(.016).attack&&!c.poll(.016).guard);
});
test('ゲームパッドの割り当てを変更し、メニュー操作と戦闘操作を分離する',()=>{
 const {controls:c,bindings:b,pad}=fixture();assignBinding(b,'gamepad','jump',0,6);assignBinding(b,'gamepad','confirm',0,9);
 pad([6]);assert(c.poll(.016).jumpPressed);assert(!c.poll(.016).jumpPressed);pad([]);c.poll(.016);
 pad([9]);const input=c.poll(.016,'menu');assert(input.confirmPressed);assert(!input.pausePressed);assert(!input.attack);
});
test('キャプチャ中と登録直後は発火せず、離して押し直すと新しい入力が使える',()=>{
 const {controls:c,bindings:b,send,pad}=fixture();let captured=null;
 c.beginCapture('keyboard',code=>{captured=code;assignBinding(b,'keyboard','jump',0,code);});send('keydown',{code:'KeyJ'});assert.equal(captured,'KeyJ');assert(!c.poll(.016).jumpPressed);
 send('keyup',{code:'KeyJ'});send('keydown',{code:'KeyJ'});assert(c.poll(.016).jumpPressed);
 pad([6]);c.poll(.016);c.beginCapture('gamepad',code=>{captured=code;assignBinding(b,'gamepad','jump',0,code);});c.poll(.016);assert(c.capture);pad([]);c.poll(.016);pad([6]);assert(!c.poll(.016).jumpPressed);assert.equal(captured,6);assert(!c.poll(.016).jumpPressed);pad([]);c.poll(.016);pad([6]);assert(c.poll(.016).jumpPressed);
});
test('解除・キャンセル・初期化と、別操作のボタンが残ることを確認する',()=>{
 const {controls:c,bindings:b,send}=fixture();assignBinding(b,'keyboard','jump',0,null);send('keydown',{code:'Space'});assert(!c.poll(.016).jumpPressed);
 c.beginCapture('keyboard',()=>assert.fail('キャンセル後に登録された'));c.cancelCapture();send('keydown',{code:'KeyK'});assert(!c.capture);
 b.keyboard=defaultBindings().keyboard;send('keyup',{code:'Space'});send('keydown',{code:'Space'});assert(c.poll(.016).jumpPressed);assert.equal(Object.keys(b.keyboard).length,Object.keys(ACTIONS).length);
});
