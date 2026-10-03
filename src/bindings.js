export const ACTIONS = {
 moveForward:{label:'前へ移動',group:'battle'}, moveBack:{label:'後ろへ移動',group:'battle'},
 moveLeft:{label:'左へ移動',group:'battle'}, moveRight:{label:'右へ移動',group:'battle'},
 attack:{label:'攻撃・チャージ',group:'battle'}, guard:{label:'ガード',group:'battle'},
 jump:{label:'ジャンプ',group:'battle'}, dash:{label:'ダッシュ',group:'battle'},
 switch:{label:'武器切り替え',group:'battle'}, lock:{label:'ターゲット切り替え',group:'battle'},
 targetPrev:{label:'前のターゲット',group:'battle'}, targetNext:{label:'次のターゲット',group:'battle'},
 reset:{label:'視点リセット / コア回転',group:'battle'}, menu:{label:'必殺技メニュー',group:'battle'},
 pause:{label:'一時停止',group:'battle'}, confirm:{label:'メニュー決定',group:'menu'},
 cancel:{label:'メニューを閉じる',group:'menu'}, up:{label:'メニュー選択 ↑',group:'menu'}, down:{label:'メニュー選択 ↓',group:'menu'}
};
const keyboard={moveForward:['KeyW'],moveBack:['KeyS'],moveLeft:['KeyA'],moveRight:['KeyD'],attack:['Mouse0'],guard:['Mouse2'],jump:['Space'],dash:['ShiftLeft','ShiftRight'],switch:['KeyQ'],lock:['Tab'],targetPrev:['KeyZ'],targetNext:['KeyC'],reset:['KeyR'],menu:['KeyE'],pause:['Escape'],confirm:['Enter'],cancel:['Escape'],up:['ArrowUp'],down:['ArrowDown']};
const gamepad={attack:[3],guard:[4],jump:[1],dash:[0],switch:[12],lock:[13],targetPrev:[14],targetNext:[15],reset:[2],menu:[5],pause:[9],confirm:[3],cancel:[1],up:[12],down:[13]};
export function defaultBindings(){return Object.fromEntries([['keyboard',keyboard],['gamepad',gamepad]].map(([device,map])=>[device,Object.fromEntries(Object.keys(ACTIONS).map(action=>[action,[map[action]?.[0]??null,map[action]?.[1]??null]]))]));}
export function validateBindings(value){
 if(value===undefined)return defaultBindings();
 if(!value||typeof value!=='object')throw Error('ボタン割り当てが不正です');
 const result={};
 for(const device of ['keyboard','gamepad']){
  if(!value[device]||typeof value[device]!=='object')throw Error('ボタン割り当てが不正です');
  const seen={battle:new Set(),menu:new Set()};result[device]={};
  for(const [action,info]of Object.entries(ACTIONS)){
   const codes=value[device][action];if(!Array.isArray(codes)||codes.length!==2)throw Error('ボタン割り当ての形式が不正です');
   for(const code of codes){if(code===null)continue;
    if(device==='keyboard'?typeof code!=='string'||!isKeyboardCode(code):!Number.isInteger(code)||code<0||code>63)throw Error('割り当てできない入力です');
    if(seen[info.group].has(code))throw Error('同じ操作グループでボタンが重複しています');seen[info.group].add(code);
   }result[device][action]=[...codes];
  }
 }return result;
}
export function isKeyboardCode(code){return /^(Key[A-Z]|Digit[0-9]|Numpad[A-Za-z0-9]+|F([1-9]|1[0-9]|2[0-4])|Arrow(Up|Down|Left|Right)|Mouse[0-4]|Space|Tab|Enter|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|ContextMenu|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Intl[A-Za-z]+|Convert|NonConvert|KanaMode|Lang[1-5])$/.test(code);}
// Duplicate assignments within the same context swap, while battle/menu may share a button.
export function assignBinding(bindings,device,action,slot,code){
 if(!ACTIONS[action]||!['keyboard','gamepad'].includes(device)||![0,1].includes(slot))throw Error('割り当て先が不正です');
 if(code!==null&&(device==='keyboard'?!isKeyboardCode(code):!Number.isInteger(code)||code<0||code>63))throw Error('この入力は割り当てできません');
 const map=bindings[device],old=map[action][slot],changed=[];
 if(code!==null)for(const [other,info]of Object.entries(ACTIONS))if(info.group===ACTIONS[action].group)for(let i=0;i<2;i++)if(!(other===action&&i===slot)&&map[other][i]===code){map[other][i]=old;changed.push(other);}
 map[action][slot]=code;return [...new Set(changed)];
}
const padLabels=['A / ×','B / ○','X / □','Y / △','LB / L1','RB / R1','LT / L2','RT / R2','Back / Select','Start / Options','LS / L3','RS / R3','十字 ↑','十字 ↓','十字 ←','十字 →','Home'];
export function bindingLabel(device,code){
 if(code===null||code===undefined)return '未割り当て';
 if(device==='gamepad')return padLabels[code]||`ボタン ${code+1}`;
 const labels={Mouse0:'左クリック',Mouse1:'中クリック',Mouse2:'右クリック',Mouse3:'マウス 戻る',Mouse4:'マウス 進む',Space:'Space',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',ControlRight:'右Ctrl',AltLeft:'左Alt',AltRight:'右Alt',MetaLeft:'左Meta',MetaRight:'右Meta',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
 return labels[code]||code.replace(/^Key|^Digit/,'').replace(/^Numpad/,'テンキー ');
}
