const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
 await page.evaluate(async()=>{const [{app},{defaultConfig}]=await Promise.all([import('/src/main.js'),import('/src/customize.js')]);window.testApp=app;app.state.units=[0,1,2].map(i=>defaultConfig(i));app.state.enemies=[0,1,2].map(i=>defaultConfig(i,true));Object.assign(app.state.setup,{allies:3,enemies:3,stage:'terrace',duration:0,player:0,training:true});app.startBattle();app.battle.countdown=0;app.battle.training.infinite=true;});
 // Keep all six fighters alive: exercise AI, skills, queued attacks, charges,
 // switching, HUD, hit events and real WebGL over three simulated minutes.
 const endurance=await page.evaluate(async()=>{const app=window.testApp,b=app.battle;let rendered=0;for(let batch=0;batch<360;batch++){for(let step=0;step<30;step++){const tick=batch*30+step;for(const u of b.entities)u.lp=1e8;const input={x:Math.sin(tick/17),z:Math.cos(tick/17),attack:tick%60<38,guard:tick%300<7,jumpPressed:tick%127===0,dashPressed:tick%103===0,switchPressed:tick%179===0};if(tick%53===0)b.acquireLock(b.human);if(tick%193===0)b.cycleTarget(b.human);if(tick%137===0){const id=b.human.config.abilities.find(id=>!b.skillAvailable(b.human,id));if(id)b.useSkill(b.human,id);}b.tick(1/60,input);for(const e of b.consumeEvents())app.onEvent(e);}app.renderer.render(b,.5,b.time);app.hudUpdate();app.hudFrame();rendered++;if(batch%12===0)await new Promise(requestAnimationFrame);}return {time:b.time,rendered,fault:app.frameError,damage:b.entities.reduce((n,u)=>n+u.dealt,0)};});
 assert(!endurance.fault,JSON.stringify(endurance));assert(endurance.time>=180&&endurance.damage>0,JSON.stringify(endurance));
 // Recreate the same stage and six robots repeatedly. GPU geometry count
 // must stay at the warmed-up baseline instead of increasing on every replay.
 const memory=await page.evaluate(async()=>{const app=window.testApp,r=app.renderer,counts=[];for(let i=0;i<32;i++){app.startBattle();app.battle.paused=true;r.render(app.battle,1/60,i);counts.push(r.renderer.info.memory.geometries);for(let n=0;n<8;n++)r.event({type:'hit',unit:app.battle.human.id});if(i%8===0)await new Promise(requestAnimationFrame);}app.startBattle();app.battle.countdown=0;app.battle.paused=true;r.render(app.battle,1/60,40);counts.push(r.renderer.info.memory.geometries);return counts;});
 assert(memory.every(n=>n===memory[0]),JSON.stringify(memory));
 // A render exception used to end requestAnimationFrame permanently. Now it
 // shows a recovery menu, preserves the fight, and resumes on user input.
 await page.evaluate(()=>{const app=window.testApp;app.battle.paused=false;window.beforeBattle=app.battle;window.beforeSave=JSON.stringify(app.store.state);const render=app.renderer.render.bind(app.renderer);let once=true;app.renderer.render=(...args)=>{if(once){once=false;throw Error('injected render failure');}return render(...args);};});
 await page.waitForFunction(()=>window.testApp.frameError?.phase==='render');await page.locator('#modal [data-action="closeModal"].primary').click();await page.waitForFunction(()=>!window.testApp.frameError&&window.testApp.battle.time>.1);assert(await page.evaluate(()=>window.testApp.battle===window.beforeBattle&&window.beforeSave===JSON.stringify(window.testApp.store.state)));
 // Persistent simulation errors must stop ticking instead of spamming errors
 // or advancing partially updated combat. The menu remains usable.
 await page.evaluate(()=>{const b=window.testApp.battle;window.normalTick=b.tick.bind(b);window.failedTicks=0;b.tick=()=>{window.failedTicks++;throw Error('injected battle failure');};});
 await page.waitForFunction(()=>window.testApp.frameError?.phase==='battle');await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.failedTicks),1);await page.evaluate(()=>{window.testApp.battle.tick=window.normalTick;window.beforeResume=window.testApp.battle.time;});await page.keyboard.press('Enter');await page.waitForFunction(()=>!window.testApp.frameError&&window.testApp.battle.time>window.beforeResume);
 // Simulate actual GPU context loss/restoration, not just a dispatched event.
 await page.evaluate(()=>{window.lossExtension=window.testApp.renderer.renderer.getContext().getExtension('WEBGL_lose_context');if(!window.lossExtension)throw Error('No context-loss test extension');window.lossExtension.loseContext();});
 await page.waitForFunction(()=>window.testApp.renderer.contextLost&&window.testApp.frameError?.phase==='graphics');const stopped=await page.evaluate(()=>window.testApp.battle.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.testApp.battle.time),stopped);assert(await page.locator('#modal [data-action="closeModal"].primary').isDisabled());
 await page.evaluate(()=>window.lossExtension.restoreContext());await page.waitForFunction(()=>!window.testApp.renderer.contextLost);await page.locator('#modal [data-action="closeModal"].primary').click();await page.waitForFunction(t=>!window.testApp.frameError&&window.testApp.battle.time>t,stopped);assert(await page.evaluate(()=>window.testApp.battle===window.beforeBattle));
 // Abandoning a damaged fight also clears recovery state and returns to setup.
 await page.evaluate(()=>window.testApp.pauseForError(Error('injected abandoned fight'),'battle'));await page.locator('#modal [data-action="abandon"]').click();await page.waitForFunction(()=>window.testApp.view==='setup'&&!window.testApp.frameError&&window.testApp.modalType===null);assert.deepEqual(errors,[]);
 console.log('Freeze recovery browser passed:',JSON.stringify({endurance,memory}));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.kill();}})();
