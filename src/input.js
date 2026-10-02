import {defaultBindings,bindingLabel,isKeyboardCode} from './bindings.js';
export class Controls{
 constructor(canvas,onLook,getBindings=()=>defaultBindings()){
  this.keys=new Set();this.pressed=new Set();this.blockedKeys=new Set();this.blockedPad=new Set();
  this.mode='menu';this.prevButtons=[];this.padName=null;this.capture=null;this.getBindings=getBindings;
  this.touch={x:0,z:0,attack:false,guard:false};this.touchPressed=new Set();this.onLook=onLook;
  window.addEventListener('keydown',e=>{
   if(this.capture){e.preventDefault();e.stopImmediatePropagation();if(this.capture.device==='keyboard'&&!e.repeat&&isKeyboardCode(e.code)){this.blockedKeys.add(e.code);this.finishCapture(e.code);}return;}
   if(this.blockedKeys.has(e.code)||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
   if(!this.keys.has(e.code))this.pressed.add(e.code);this.keys.add(e.code);
   if(this.mode==='battle'&&this.context!=='menu'&&Object.values(this.getBindings().keyboard).some(c=>c.includes(e.code)))e.preventDefault();
  },true);
  window.addEventListener('keyup',e=>{this.keys.delete(e.code);this.blockedKeys.delete(e.code);});
  window.addEventListener('blur',()=>{this.clear();this.blockedKeys.clear();this.blockedPad.clear();});
  window.addEventListener('pointerdown',e=>{
   if(!this.capture||e.pointerType==='touch'||e.target.closest('[data-action]'))return;
   e.preventDefault();e.stopImmediatePropagation();const code=`Mouse${e.button}`;
   if(this.capture.device==='keyboard'&&isKeyboardCode(code)){this.blockedKeys.add(code);this.finishCapture(code);}
  },true);
  window.addEventListener('pointerdown',e=>{
   if(this.capture||e.pointerType==='touch'||e.target.closest('button,input,select,textarea,a'))return;
   if(this.mode!=='battle'&&document.querySelector('#modal')?.hidden!==false)return;
   const code=`Mouse${e.button}`;if(this.blockedKeys.has(code))return;
   this.keys.add(code);this.pressed.add(code);e.preventDefault();
   if(e.target===canvas&&e.button===0&&!document.pointerLockElement)canvas.requestPointerLock?.().catch?.(()=>{});
  });
  window.addEventListener('pointerup',e=>{this.keys.delete(`Mouse${e.button}`);this.blockedKeys.delete(`Mouse${e.button}`);});
  for(const root of [canvas,document])root.addEventListener('contextmenu',e=>{if(this.capture||this.mode==='battle'||Date.now()<(this.ignoreMouseDefaultsUntil||0))e.preventDefault();});
  document.addEventListener('auxclick',e=>{if(this.mode==='battle'||Date.now()<(this.ignoreMouseDefaultsUntil||0))e.preventDefault();});
  window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&!this.capture)onLook(e.movementX,e.movementY);});
 }
 clear(){this.keys.clear();this.pressed.clear();this.touch={x:0,z:0,attack:false,guard:false};this.touchPressed.clear();}
 setMode(mode){this.mode=mode;this.clear();if(mode!=='battle'&&document.pointerLockElement)document.exitPointerLock();}
 beginCapture(device,onInput){this.clear();this.capture={device,onInput};const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);this.prevButtons=pad?pad.buttons.map(b=>b.pressed):[];}
 cancelCapture(){this.capture=null;this.clear();}
 finishCapture(code){if(typeof code==='string'&&code.startsWith('Mouse'))this.ignoreMouseDefaultsUntil=Date.now()+500;const callback=this.capture?.onInput;this.capture=null;this.clear();callback?.(code);}
 label(action,device='keyboard'){return this.getBindings()[device][action].filter(c=>c!==null).map(c=>bindingLabel(device,c)).join(' / ')||'未割り当て';}
 hint(action){return `${this.label(action)} / ${this.label(action,'gamepad')}`;}
 poll(dt,context='battle'){
  this.context=context;
  const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected),buttons=pad?pad.buttons.map(b=>b.pressed):[],axis=n=>Math.abs(pad?.axes[n]||0)>.15?pad.axes[n]:0;
  this.padName=pad?.id||null;for(const i of this.blockedPad)if(!buttons[i])this.blockedPad.delete(i);
  const wasCapturing=!!this.capture;
  if(this.capture?.device==='gamepad'){const i=buttons.findIndex((down,n)=>down&&!this.prevButtons[n]&&!this.blockedPad.has(n));if(i>=0&&i<=63){this.blockedPad.add(i);this.finishCapture(i);}}
  const maps=this.getBindings(),held=(action)=>maps.keyboard[action].some(c=>c!==null&&!this.blockedKeys.has(c)&&this.keys.has(c))||maps.gamepad[action].some(c=>c!==null&&!this.blockedPad.has(c)&&!!buttons[c]);
  const edge=action=>maps.keyboard[action].some(c=>c!==null&&!this.blockedKeys.has(c)&&this.pressed.has(c))||maps.gamepad[action].some(c=>c!==null&&!this.blockedPad.has(c)&&!!buttons[c]&&!this.prevButtons[c]);
  const battle=context==='battle'&&!wasCapturing,menu=context==='menu'&&!wasCapturing,tap=c=>this.touchPressed.has(c);
  const x=battle?(held('moveRight')?1:0)-(held('moveLeft')?1:0)+axis(0)+this.touch.x:0;
  const z=battle?(held('moveForward')?1:0)-(held('moveBack')?1:0)-axis(1)+this.touch.z:0,d=Math.max(1,Math.hypot(x,z));
  if(pad&&this.mode==='battle'&&battle)this.onLook(axis(2)*dt*900,axis(3)*dt*650);
  const result={x:x/d,z:z/d,attack:battle&&(held('attack')||this.touch.attack),guard:battle&&(held('guard')||this.touch.guard)};
  for(const action of ['jump','dash','switch','lock','targetPrev','targetNext','reset','menu','pause'])result[`${action}Pressed`]=battle&&(edge(action)||tap(action));
  for(const action of ['confirm','cancel','up','down'])result[`${action}Pressed`]=menu&&edge(action);
  this.pressed.clear();this.touchPressed.clear();this.prevButtons=buttons;return result;
 }
 bindTouch(root){const stick=root.querySelector('[data-stick]');if(stick){const update=e=>{const r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.35),z=-(e.clientY-r.top-r.height/2)/(r.height*.35),d=Math.max(1,Math.hypot(x,z));this.touch.x=x/d;this.touch.z=z/d;stick.style.setProperty('--jx',`${this.touch.x*25}px`);stick.style.setProperty('--jy',`${-this.touch.z*25}px`);};stick.addEventListener('pointerdown',e=>{stick.setPointerCapture(e.pointerId);update(e);});stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))update(e);});for(const event of ['pointerup','pointercancel'])stick.addEventListener(event,()=>{this.touch.x=0;this.touch.z=0;stick.style.setProperty('--jx','0px');stick.style.setProperty('--jy','0px');});}
  root.querySelectorAll('[data-control]').forEach(el=>{const control=el.dataset.control;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);if(['attack','guard'].includes(control))this.touch[control]=true;else this.touchPressed.add(control);});for(const event of ['pointerup','pointercancel'])el.addEventListener(event,()=>{if(['attack','guard'].includes(control))this.touch[control]=false;});});}
}
