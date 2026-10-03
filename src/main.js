import {SaveStore} from './storage.js';
import {ArenaRenderer} from './render.js';
import {Controls} from './input.js';
import {GameApp} from './ui.js';
export let app;
try{
 const store=new SaveStore(),renderer=new ArenaRenderer(document.querySelector('#scene'));
 renderer.quality(store.state.settings.quality);
 const controls=new Controls(document.querySelector('#scene'),(x,y)=>renderer.look(x*store.state.settings.sensitivity,y*store.state.settings.sensitivity),()=>store.state.settings.bindings);
 app=new GameApp(store,renderer,controls);
 const canvas=renderer.canvas;
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.contextLost=true;app.pauseForError(new Error('WebGL context lost'),'graphics');});
 canvas.addEventListener('webglcontextrestored',()=>{renderer.contextLost=false;app.showRecovery();});
 document.querySelector('#boot').remove();if(store.warning)app.toast(store.warning,true);
 let previous=performance.now(),accumulator=0,hudClock=0;
 function frame(now){const dt=Math.max(0,Math.min(.1,(now-previous)/1000));previous=now;let phase='input';
  try{
  if(app.frameError||renderer.contextLost){accumulator=0;hudClock=0;if(app.frameError?.phase!=='input'){const input=controls.poll(dt,'menu');if(!renderer.contextLost&&(input.confirmPressed||input.cancelPressed))app.closeModal();}return;}
  const input=controls.poll(dt,app.modalType?'menu':'battle'),menu=app.handleMenuInput(input),b=app.view==='battle'?app.battle:null;
  phase='battle';
  if(b&&!b.finished){accumulator=Math.min(.1,accumulator+dt);const movement=renderer.movement(input.x,input.z);let first=true;while(accumulator>=1/60){const command=first?{...input,...movement}:{...input,...movement,jumpPressed:false,dashPressed:false,switchPressed:false};b.tick(1/60,menu||app.modalType?{}:command);accumulator-=1/60;first=false;}
   phase='hud';hudClock+=dt;if(hudClock>=.1){app.hudUpdate();hudClock=0;}
  }else accumulator=0;
  phase='events';if(b)for(const event of b.consumeEvents())app.onEvent(event);
  phase='render';renderer.render(app.view==='battle'?app.battle:null,dt,now/1000);phase='hud';app.hudFrame();
  }catch(error){console.error('Frame failed',phase,error);accumulator=0;hudClock=0;app.pauseForError(error,phase);}
  finally{requestAnimationFrame(frame);}
 }
 requestAnimationFrame(frame);
}catch(e){console.error(e);document.querySelector('#boot')?.remove();document.querySelector('#app').textContent=`起動できませんでした。WebGL対応のブラウザで開いてください。詳細：${e.message}`;}
