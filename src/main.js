import {SaveStore} from './storage.js';
import {ArenaRenderer} from './render.js';
import {Controls} from './input.js';
import {GameApp} from './ui.js';
export let app;
try{
 const store=new SaveStore(),renderer=new ArenaRenderer(document.querySelector('#scene'));
 renderer.quality(store.state.settings.quality);
 const controls=new Controls(document.querySelector('#scene'),(x,y)=>renderer.look(x*store.state.settings.sensitivity,y*store.state.settings.sensitivity));
 app=new GameApp(store,renderer,controls);
 document.querySelector('#boot').remove();if(store.warning)app.toast(store.warning,true);
 let previous=performance.now(),accumulator=0,hudClock=0;
 function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;const input=controls.poll(dt),menu=app.handleMenuInput(input),b=app.view==='battle'?app.battle:null;
  if(b&&!b.finished){accumulator=Math.min(.1,accumulator+dt);const movement=renderer.movement(input.x,input.z);let first=true;while(accumulator>=1/60){const command=first?{...input,...movement}:{...input,...movement,jumpPressed:false,dashPressed:false,switchPressed:false};b.tick(1/60,menu||app.modalType?{}:command);accumulator-=1/60;first=false;}
   for(const event of b.consumeEvents())app.onEvent(event);hudClock+=dt;if(hudClock>=.1){app.hudUpdate();hudClock=0;}
  }else accumulator=0;
  renderer.render(app.view==='battle'?app.battle:null,dt,now/1000);app.hudFrame();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}catch(e){console.error(e);document.querySelector('#boot')?.remove();document.querySelector('#app').textContent=`起動できませんでした。WebGL対応のブラウザで開いてください。詳細：${e.message}`;}
