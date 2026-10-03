const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('charge-artifacts',{recursive:true});
 await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
 await page.evaluate(async()=>{const [{app},{defaultConfig}]=await Promise.all([import('/src/main.js'),import('/src/customize.js')]);window.appUnderTest=app;app.state.units[0]=defaultConfig();app.state.enemies[0]=defaultConfig(0,true);for(const c of [app.state.units[0],app.state.enemies[0]]){c.passives=[];c.abilities=[];c.sets[0]={item:'weapon:sword',shield:null};}Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});});
 const cuts=[];
 for(let stage=0;stage<4;stage++){
  const result=await page.evaluate(stage=>{const app=window.appUnderTest;app.startBattle();const b=app.battle;b.countdown=0;b.paused=true;b.rng=()=>.99;const [u,v]=b.entities;Object.assign(u,{x:0,z:0,yaw:0,target:v.id,lp:10000,combo:stage-1,comboWindow:stage?1:0});Object.assign(v,{x:0,z:.8,yaw:Math.PI,target:u.id,lp:10000});b.attack(v);v.queuedAttack={charge:0,remaining:.2};const before=v.attack;b.attack(u);b.meleeStep(u,u.attack.duration*.9);v.hitReaction.elapsed=v.hitReaction.duration*.5;app.renderer.cameraYaw=-.45;app.renderer.manualYaw=-.45;app.renderer.render(b,1/60,b.time);const ref=app.renderer.robots.get(v.id);return {stage,dealt:u.dealt,interrupted:v.attack===null,kept:v.attack===before,kind:v.hitReaction.kind,queued:!!v.queuedAttack,stun:v.stun,down:v.down,bend:Math.hypot(ref.bodyPivot.rotation.x,ref.bodyPivot.rotation.z),fault:app.frameError};},stage);
  cuts.push(result);assert(result.dealt>0&&!result.fault,JSON.stringify(result));assert.equal(result.interrupted,stage===3);assert.equal(result.kind,stage===3?'stagger':'impact');assert.equal(result.down,0);if(stage===3){assert(result.bend>.2&&!result.queued&&result.stun>0);}else assert(result.kept&&result.queued&&result.stun===0);
  await page.screenshot({path:`charge-artifacts/stagger-sword-${stage+1}.png`});
 }
 await page.evaluate(()=>{const app=window.appUnderTest,b=app.battle;b.paused=false;window.resumeTime=b.time;});await page.waitForFunction(()=>window.appUnderTest.battle.time>window.resumeTime+.4);assert(await page.evaluate(()=>window.appUnderTest.battle.entities[1].stun===0&&!window.appUnderTest.frameError));
 assert.deepEqual(errors,[]);console.log('Combo stagger browser passed:',JSON.stringify(cuts));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.kill();}})();
