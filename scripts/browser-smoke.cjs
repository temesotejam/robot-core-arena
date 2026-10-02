const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/home.png'});
// Inspect the real WebGL models from the front, side and mid-attack, including every weapon.
const gallery=await browser.newPage({viewport:{width:1440,height:1080}});gallery.on('pageerror',e=>errors.push(e.message));
await gallery.goto('http://127.0.0.1:4173');await gallery.locator('.home-copy').waitFor();
await gallery.addStyleTag({content:'body>div{display:none!important}.weapon-label{display:block!important;position:fixed;transform:translateX(-50%);color:#dcf9f1;font:16px sans-serif;pointer-events:none}'});
for(const pose of ['front','side','attack','frames']){
 await gallery.evaluate(async pose=>{
  const [{app},THREE,{createRobot},{defaultConfig},{CATALOG,WEAPONS,FRAMES,PARTS}]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js'),import('/src/render.js'),import('/src/customize.js'),import('/src/data.js')]);
  const r=app.renderer;app.view='inspection';r.mode='inspection';r.clear();r.scene.fog=null;r.renderer.shadowMap.enabled=false;
  r.camera=new THREE.OrthographicCamera(-16/3,16/3,4,-4,.04,100);r.camera.position.set(0,.5,20);r.camera.lookAt(0,.5,0);r.camera.updateMatrixWorld();
  document.querySelectorAll('.weapon-label').forEach(el=>el.remove());
  const entries=pose==='frames'?Object.keys(FRAMES).map(()=>['sword',WEAPONS.sword]):Object.entries(WEAPONS);
  entries.forEach(([kind,w],i)=>{
   const config=defaultConfig(),frame=Object.keys(FRAMES)[i%5];if(pose==='frames')config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));config.sets[0]={item:`weapon:${kind}`,shield:w.shield?'shield:basic':null};const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;
   const x=(i%5-2)*2.1,y=pose==='frames'?0:(1.5-Math.floor(i/5))*1.6,yaw=pose==='side'?-Math.PI/2:-.45;
   if(pose==='attack')r.animateRobot(ref,{config,active:0,stats:{weapon:w,frame:'knight'},x,y,z:0,yaw,vx:0,vz:0,dashTime:0,grounded:true,attack:w.ranged?null:{elapsed:.5,duration:1,thrust:['rapier','lance'].includes(kind)},actionTime:w.ranged?.1:0},.12);
   else {ref.root.position.set(x,y,0);ref.root.rotation.y=yaw;}
   ref.ring.visible=false;ref.root.updateMatrixWorld(true);r.world.add(ref.root);
   for(const weapon of ref.weaponAttachments.filter(o=>o.name!=='shield'))if(weapon.getWorldPosition(new THREE.Vector3()).distanceTo(weapon.parent.getWorldPosition(new THREE.Vector3()))>1e-6)throw Error(`${kind}: weapon detached`);
   const label=document.createElement('div'),point=new THREE.Vector3(x,y-.22,0).project(r.camera);label.className='weapon-label';label.textContent=pose==='frames'?FRAMES[frame].name:w.name;label.style.left=`${(point.x*.5+.5)*innerWidth}px`;label.style.top=`${(-point.y*.5+.5)*innerHeight}px`;document.body.append(label);
  });r.renderer.render(r.scene,r.camera);
 },pose);
 await gallery.waitForTimeout(150);await gallery.screenshot({path:`artifacts/weapons-${pose}.png`});
}
await gallery.close();
// Record real simulation-driven buffered combos, including different weapon rhythms.
const motionPage=await browser.newPage({viewport:{width:1100,height:680},recordVideo:{dir:'artifacts',size:{width:1100,height:680}}});motionPage.on('pageerror',e=>errors.push(e.message));
await motionPage.goto('http://127.0.0.1:4173');await motionPage.locator('.home-copy').waitFor();
await motionPage.addStyleTag({content:'body>div{display:none!important}.motion-caption{display:block!important;position:fixed;left:0;right:0;bottom:24px;text-align:center;color:#dcf9f1;font:18px sans-serif}'});
await motionPage.evaluate(async()=>{
 const [{app},THREE,{createRobot},{defaultConfig},{CATALOG,WEAPONS,PARTS},{Battle}]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js'),import('/src/render.js'),import('/src/customize.js'),import('/src/data.js'),import('/src/sim.js')]);
 const r=app.renderer;app.view='inspection';r.mode='inspection';r.clear();r.scene.fog=null;r.renderer.shadowMap.enabled=false;r.camera.position.set(.25,1.35,5.8);r.camera.lookAt(0,.52,0);r.floor(6,4);
 const models=['sword','knuckle','hammer'].map((kind,i)=>{const config=defaultConfig();config.sets[0]={item:`weapon:${kind}`,shield:null};config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${['knight','brawler','wild'][i]}:${p}`]));
  const battle=new Battle({allies:[config],enemies:[defaultConfig()],setup:{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true},getItem:id=>CATALOG[id]});battle.countdown=0;battle.training.freezeAI=true;battle.training.infinite=true;Object.assign(battle.human,{x:0,z:0,yaw:0});battle.entities[1].y=10;
  const ref=createRobot(config,id=>CATALOG[id]);ref.active=0;r.world.add(ref.root);return {ref,kind,battle,x:(i-1)*1.45,pressing:false};});
 const label=document.createElement('div');label.className='motion-caption';document.body.append(label);const start=performance.now();let simulated=0;
 function animate(now){const time=(now-start)/1000;
  while(simulated<time){for(const m of models){const u=m.battle.human,rt=m.battle.runtime(u),want=!u.charging&&!u.queuedAttack&&(!u.attack&&rt.cooldown===0||u.attack&&rt.cooldown<=.15&&rt.cooldown>0);let input={};if(m.pressing)m.pressing=false;else if(want){input={attack:true};m.pressing=true;}m.battle.tick(1/120,input);m.battle.consumeEvents();}simulated+=1/120;}
  label.textContent=models.map(({kind,battle})=>`${WEAPONS[kind].name} ${battle.human.combo+1}段`).join('　 /　 ');
  for(const {ref,battle,x}of models){r.animateRobot(ref,{...battle.human,x,z:0},battle.time);ref.ring.visible=false;}requestAnimationFrame(animate);
 }requestAnimationFrame(animate);
});await motionPage.waitForTimeout(8200);await motionPage.screenshot({path:'artifacts/combo-motion.png'});const video=motionPage.video();await motionPage.close();await video.saveAs('artifacts/combo-motion.webm');
await page.locator('.nav [data-view="settings"]').click();
const binding=(device,id,slot=0)=>page.locator(`[data-action="bindInput"][data-device="${device}"][data-id="${id}"][data-slot="${slot}"]`);
await binding('keyboard','jump').click();await page.keyboard.press('KeyJ');await page.locator('#modal').waitFor({state:'hidden'});assert.equal(await binding('keyboard','jump').innerText(),'J');
await binding('keyboard','attack').click();await page.keyboard.press('KeyK');await page.locator('#modal').waitFor({state:'hidden'});
await binding('keyboard','guard').click();const promptBox=await page.locator('.binding-prompt').boundingBox();await page.mouse.click(promptBox.x+promptBox.width/2,promptBox.y+promptBox.height/2,{button:'middle'});await page.locator('#modal').waitFor({state:'hidden'});assert.equal(await binding('keyboard','guard').innerText(),'中クリック');
await binding('keyboard','pause').click();await page.keyboard.press('KeyP');await page.locator('#modal').waitFor({state:'hidden'});
await binding('keyboard','jump',1).click();await page.locator('[data-action="cancelBinding"]').click();assert.equal(await binding('keyboard','jump',1).innerText(),'未割り当て');
await page.evaluate(()=>{window.testPads=[];navigator.getGamepads=()=>window.testPads;});await binding('gamepad','jump').click();
await page.evaluate(()=>window.testPads=[{connected:true,id:'test',axes:[0,0,0,0],buttons:Array.from({length:18},(_,i)=>({pressed:i===6}))}]);await page.locator('#modal').waitFor({state:'hidden'});assert.equal(await binding('gamepad','jump').innerText(),'LT / L2');await page.evaluate(()=>window.testPads=[]);
await page.locator('[data-action="resetBindings"][data-device="gamepad"]').click();assert.equal(await binding('gamepad','jump').innerText(),'B / ○');
await page.locator('.content-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'artifacts/bindings.png'});await page.reload();await page.locator('.home-copy').waitFor();
assert.equal(await page.evaluate(async()=> (await import('/src/main.js')).app.state.settings.bindings.keyboard.jump[0]),'KeyJ');
await page.locator('.nav [data-view="custom"]').click();await page.locator('[data-action="customTab"][data-id="core"]').click();assert.equal(await page.locator('[data-cell]').count(),94);await page.locator('[data-action="autoPack"]').click();await page.screenshot({path:'artifacts/core.png'});
for(const tab of ['passives','abilities','armor'])await page.locator(`[data-action="customTab"][data-id="${tab}"]`).click();
await page.locator('.nav [data-view="setup"]').click();await page.locator('[data-field="allies"]').selectOption('3');await page.locator('[data-field="enemies"]').selectOption('3');await page.locator('[data-action="startBattle"]').click();await page.locator('.hud-resources').waitFor();await page.waitForTimeout(500);
await page.evaluate(async()=>{const {app}=await import('/src/main.js');if(app.battle.entities.length!==6)throw Error('3v3 failed');app.battle.countdown=0;});
await page.evaluate(async()=>{const {app}=await import('/src/main.js');const u=app.battle.human,r=app.renderer;r.camera.updateMatrixWorld();const start=r.project(u.x,u.y+.5,u.z),delta=r.movement(1,0),right=r.project(u.x+delta.x,u.y+.5,u.z+delta.z);if(right.x<=start.x)throw Error('Right movement is reversed');});
await page.evaluate(async()=>{const {app}=await import('/src/main.js');window.testOriginalAi=app.battle.ai;app.battle.ai=()=>({});});
const tapAttack=async()=>{await page.keyboard.down('KeyK');await page.waitForTimeout(30);await page.keyboard.up('KeyK');};await tapAttack();
for(const stage of [1,2,3]){await page.waitForFunction(async()=>{const {app}=await import('/src/main.js');const cooldown=app.battle.runtime(app.battle.human).cooldown;return cooldown<=.16&&cooldown>.02;});await tapAttack();await page.waitForFunction(async stage=>(await import('/src/main.js')).app.battle.human.combo===stage,stage);}
await page.waitForTimeout(80);await page.screenshot({path:'artifacts/combo-battle.png'});assert((await page.locator('.hud-weapon .ammo').innerText()).includes('4段'));await page.evaluate(async()=>{const {app}=await import('/src/main.js');app.battle.ai=window.testOriginalAi;});
await page.keyboard.down('KeyK');await page.waitForTimeout(100);assert(await page.evaluate(async()=> (await import('/src/main.js')).app.battle.human.lastAttackHeld));await page.keyboard.up('KeyK');
await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');await page.keyboard.press('KeyJ');await page.waitForTimeout(200);await page.keyboard.press('Tab');await page.keyboard.press('KeyQ');await page.waitForTimeout(500);await page.screenshot({path:'artifacts/battle.png'});
await page.keyboard.press('KeyP');await page.locator('.modal-card').waitFor();const before=await page.evaluate(async()=> (await import('/src/main.js')).app.battle.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(async()=> (await import('/src/main.js')).app.battle.time),before);await page.locator('[data-action="showBindings"]').click();await binding('keyboard','jump').click();await page.keyboard.press('KeyL');await page.locator('.modal-card.wide').waitFor();assert(await page.evaluate(async()=> (await import('/src/main.js')).app.battle.paused));assert.equal(await binding('keyboard','jump').innerText(),'L');await page.locator('#modal [data-action="showPause"]').click();await page.locator('[data-action="closeModal"]').first().click();
await page.evaluate(async()=>{const {app}=await import('/src/main.js');for(const u of app.battle.entities.filter(u=>u.team)){u.dead=true;u.lp=0;}app.battle.checkEnd();});await page.locator('.result-top').waitFor();assert.equal(await page.evaluate(async()=> (await import('/src/main.js')).app.state.inventory.reduce((n,e)=>n+e.count,0)),88);await page.screenshot({path:'artifacts/result.png'});
await page.reload();await page.locator('.home-copy').waitFor();assert.equal(await page.evaluate(async()=> (await import('/src/main.js')).app.state.records.wins),1);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile-home.png'});await page.locator('.nav [data-view="custom"]').click();await page.locator('[data-action="customTab"][data-id="core"]').click();await page.screenshot({path:'artifacts/mobile-core.png'});
await page.locator('.nav [data-view="settings"]').click();await page.locator('.content-scroll').evaluate(el=>el.scrollTop=0);assert(await page.locator('.setup-grid > .panel').first().evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth));await page.screenshot({path:'artifacts/mobile-bindings.png'});await page.locator('[data-action="resetBindings"][data-device="keyboard"]').click();assert.equal(await binding('keyboard','jump').innerText(),'Space');
assert.deepEqual(errors,[]);console.log('Browser smoke passed: WebGL, screens, 94 cells, 3v3, movement, pause, 88 rewards, persistent reload, remapped keyboard/mouse/gamepad input, reset/cancel and mobile layout.');
}catch(e){console.error(e);if(browser){const pages=browser.contexts().flatMap(c=>c.pages());for(const p of pages){console.error('Page state:',await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:'artifacts/failure.png'}).catch(()=>{});}}process.exitCode=1;}finally{await browser?.close();server.kill();}})();
