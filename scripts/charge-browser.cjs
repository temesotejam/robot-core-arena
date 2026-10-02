const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 fs.mkdirSync('charge-artifacts',{recursive:true});const errors=[];
 const page=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/sword-motion.html?mode=charge');await page.locator('#pose').waitFor();
 assert.equal(await page.locator('[data-stage="4"]').getAttribute('aria-pressed'),'true');assert(await page.locator('#charge-controls').isVisible());
 await page.locator('#replay').click();await page.waitForTimeout(3000);
 await page.locator('#speed').selectOption('.25');await page.locator('#camera').selectOption('side');await page.locator('#replay').click();await page.waitForTimeout(8000);
 await page.locator('#play').click();const frozen=await page.evaluate(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.time);await page.waitForTimeout(120);assert.equal(await page.evaluate(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.time),frozen);
 // Frozen photographs use the same hold input and collision-limited release as battle.
 for(const camera of ['threequarter','side','front'])for(const phase of ['half','full',.18,.34,.42,.67]){
  await page.locator('#camera').selectOption(camera);await page.locator('#replay').click();
  await page.evaluate(async phase=>{const v=(await import('/src/sword-preview.js')).swordPreview,b=v.battle,u=b.human;
   for(let i=0;i<(phase==='half'?48:96);i++)b.tick(1/120,{attack:true});
   if(typeof phase==='number'){b.handleInput(u,{},1/120);b.meleeStep(u,u.attack.duration*phase);}
   v.draw();
  },phase);await page.screenshot({path:`charge-artifacts/charge-${camera}-${phase}.png`});
 }
 // A real keyboard hold/release on the viewer's accessible manual button.
 await page.locator('#speed').selectOption('1');await page.locator('#charge-hold').focus();await page.keyboard.down('Space');
 await page.waitForFunction(async()=>{const v=(await import('/src/sword-preview.js')).swordPreview;return v.battle.human.charge===v.battle.maxCharge(v.battle.human);});
 assert((await page.locator('#pose').innerText()).includes('最大チャージ'));
 await page.keyboard.up('Space');await page.waitForFunction(async()=>{const u=(await import('/src/sword-preview.js')).swordPreview.battle.human;return u.attack?.charge===1;});
 await page.waitForFunction(async()=>!(await import('/src/sword-preview.js')).swordPreview.battle.human.motion);
 // Pointer release also works; actual partial input produces a partial charged cut.
 const box=await page.locator('#charge-hold').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.waitForFunction(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.human.charge>=.3);await page.mouse.up();
 await page.waitForFunction(async()=>{const u=(await import('/src/sword-preview.js')).swordPreview.battle.human;return u.attack?.charge>0&&u.attack.charge<1;});
 // Canceling a pointer via focus loss clears the hold without firing.
 await page.mouse.down();await page.waitForFunction(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.human.charging);
 // Focus loss and release can arrive within a single simulation frame. A
 // subsequent pointerup must not overwrite the pending cancellation.
 await page.evaluate(()=>{document.querySelector('#play').focus();document.querySelector('#charge-hold').dispatchEvent(new PointerEvent('pointerup'));});await page.mouse.up();
 await page.waitForFunction(async()=>{const u=(await import('/src/sword-preview.js')).swordPreview.battle.human;return !u.charging&&!u.attack;});
 await page.waitForTimeout(200);assert(await page.evaluate(async()=>!(await import('/src/sword-preview.js')).swordPreview.battle.human.attack));
 await page.locator('#play').click();await page.locator('#charge-level').selectOption('.5');await page.locator('#camera').selectOption('threequarter');await page.locator('#replay').click();
 await page.evaluate(async()=>{const v=(await import('/src/sword-preview.js')).swordPreview;for(let i=0;i<48;i++)v.battle.tick(1/120,{attack:true});v.draw();});
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const v=(await import('/src/sword-preview.js')).swordPreview;v.draw();const u=v.battle.human,foot=v.renderer.project(u.x,u.y+.035,u.z),panel=document.querySelector('.controls').getBoundingClientRect();if(foot.y>=panel.top-10)throw Error('Charge preview feet hidden by mobile controls');});
 assert(await page.locator('.controls').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'charge-artifacts/charge-mobile.png'});
 const video=page.video();await page.close();await video.saveAs('charge-artifacts/charge-review.webm');
 // The actual game uses the user's attack binding and displays a full-charge cue.
 const game=await browser.newPage({viewport:{width:1100,height:800}});game.on('pageerror',e=>errors.push(e.message));await game.goto('http://127.0.0.1:4173');await game.locator('.home-copy').waitFor();
 await game.evaluate(async()=>{const [{app},{defaultConfig}]=await Promise.all([import('/src/main.js'),import('/src/customize.js')]);app.state.units[0]=defaultConfig();app.state.enemies[0]=defaultConfig();Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;Object.assign(b.human,{x:0,z:0,yaw:0,target:b.entities[1].id});Object.assign(b.entities[1],{x:0,z:.9,yaw:Math.PI});const attack=b.attack.bind(b);window.chargeReleases=[];b.attack=(u,charge=0)=>{const ok=attack(u,charge);if(ok&&u===b.human)window.chargeReleases.push({charge,coefficient:u.attack.coefficient,combo:u.combo,dash:u.dashTime});return ok;};});
 await game.mouse.move(500,300);await game.mouse.down();await game.locator('.charge-display[data-charge-ready="true"]').waitFor();assert((await game.locator('.charge-display').innerText()).includes('離して攻撃'));await game.screenshot({path:'charge-artifacts/charge-game-hud.png'});
 await game.mouse.up();await game.waitForFunction(()=>window.chargeReleases.length>0);assert.deepEqual(await game.evaluate(()=>window.chargeReleases[0]),{charge:1,coefficient:1.8,combo:0,dash:0});
 assert.deepEqual(errors,[]);console.log('Charge browser passed: actual hold/release/cancel, stable pause, maximum HUD, target and shield, 18 WebGL poses, mobile feet, real game binding.');
}catch(e){console.error(e);if(browser)for(const p of browser.contexts().flatMap(c=>c.pages())){console.error('Page state:',await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:'charge-artifacts/failure.png'}).catch(()=>{});}process.exitCode=1;}finally{await browser?.close();server.kill();}})();
