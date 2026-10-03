const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');

(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 fs.mkdirSync('charge-artifacts',{recursive:true});const errors=[];
 const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
 await page.evaluate(async()=>{
  const [{app},{defaultConfig}]=await Promise.all([import('/src/main.js'),import('/src/customize.js')]);window.tensionApp=app;
  window.tensionFixture=(weapon='sword',freezeAI=true,difficulty='normal')=>{
   app.state.units[0]=defaultConfig();app.state.enemies[0]=defaultConfig(0,true);
   for(const c of [app.state.units[0],app.state.enemies[0]]){c.passives=['tension'];c.abilities=[];c.sets=[0,1].map(()=>({item:`weapon:${weapon}`,shield:null,separate:false}));c.style='aggressive';c.difficulty=difficulty;}
   Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();
   const b=app.battle;b.countdown=0;b.paused=true;b.rng=()=>.99;b.training.freezeAI=freezeAI;
   if(b.training.infinite)throw Error('Finite-resource browser test accidentally enabled infinite tension');
   const [u,v]=b.entities;Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:8,yaw:Math.PI,target:u.id});return b;
  };
  window.tensionDraw=()=>{const b=app.battle;b.paused=true;b.consumeEvents();app.hudUpdate();app.renderer.resetCamera(b);app.renderer.render(b,1,b.time);app.hudFrame();};
 });
 // Actual attack/cooldown/update paths, finite resources, and genuine whiffs.
 // Pausing between evaluations keeps browser render timing out of simulation time.
 const human=await page.evaluate(()=>{
  const b=window.tensionFixture(),u=b.human,swings=[];b.paused=false;
  for(let i=0;i<600;i++){
   if(!u.attack&&u.actionTime===0&&b.runtime(u).cooldown===0){
    if(!b.attack(u)){window.tensionDraw();return {time:b.time,tension:u.tension,exhausted:u.exhausted,swings,damage:u.dealt,infinite:b.training.infinite};}
    swings.push({time:b.time,tension:u.tension,combo:u.combo});
   }
   b.tick(1/120,{});
  }
  throw Error('Repeated finite-resource whiffs never ran short of tension');
 });
 assert.equal(human.infinite,false);assert.equal(human.damage,0);assert.equal(human.swings.length,6,JSON.stringify(human));
 assert(human.swings.every(s=>s.combo===0),JSON.stringify(human));assert(human.time<3.2&&human.tension<15,JSON.stringify(human));
 assert.equal(await page.locator('.resource-label').filter({hasText:'TENSION'}).locator('strong').innerText(),`${Math.round(human.tension)} / 100`);
 const humanBar=await page.locator('.bar.tension i').first().evaluate(el=>parseFloat(el.style.width));assert(Math.abs(humanBar-human.tension)<.001);
 await page.screenshot({path:'charge-artifacts/tension-human-whiffs.png'});
 // A long committed attack must still have no regeneration after its ordinary
 // regeneration delay expires. Both hammer and the actual sword hold/release run.
 const committed=[];
 for(const weapon of ['hammer','sword']){
  const result=await page.evaluate(weapon=>{
   const b=window.tensionFixture(weapon),u=b.human;b.paused=false;
   if(weapon==='sword'){
    for(let i=0;i<240&&u.charge<b.maxCharge(u);i++)b.tick(1/120,{attack:true});
    if(u.charge!==b.maxCharge(u))throw Error('Actual sword hold did not reach full charge');b.tick(1/120,{});
   }else if(!b.attack(u))throw Error('Normal hammer attack failed');
   const a=u.attack;if(!a?.normal)throw Error('Missing committed normal melee attack');
   const spent=u.tension,duration=a.duration;
   while(a.elapsed<duration*.85)b.tick(1/120,{});
   window.tensionDraw();return {weapon,charge:a.charge,spent,tension:u.tension,delay:u.regenWait,active:u.attack===a,damage:u.dealt,elapsed:a.elapsed,duration};
  },weapon);
  assert(result.active&&result.delay===0,JSON.stringify(result));assert.equal(result.tension,result.spent,JSON.stringify(result));assert.equal(result.damage,0);
  if(weapon==='sword')assert.equal(result.charge,1);else assert.equal(result.charge,0);
  committed.push(result);await page.screenshot({path:`charge-artifacts/tension-committed-${weapon}.png`});
 }
 const cpu=[];
 for(const difficulty of ['easy','normal','hard']){
  const low=await page.evaluate(difficulty=>{
   const b=window.tensionFixture('sword',false,difficulty),[target,u]=b.entities;
   const originalAttack=b.attack.bind(b);window.tensionStarts=[];
   b.attack=(unit,charge=0,input={})=>{const tension=unit.tension,recovering=unit.aiRecovering,ok=originalAttack(unit,charge,input);if(ok&&unit===u)window.tensionStarts.push({time:b.time,tension,recovering,charge});return ok;};
   // Hold a replenished, non-attacking target in real blade range. Only the
   // victim's fixture health, pose and history are reset so finisher knockdowns
   // or target death cannot end the combat sample. The CPU still makes every
   // decision, connects each attack, and spends/recovers through real tick.
   window.tensionCpuStep=()=>{
    Object.assign(u,{x:0,z:0});Object.assign(target,{x:0,y:0,z:.9,lp:target.stats.lp,grounded:true,vy:0,stun:0,down:0,rise:0,knockdown:null,status:null,statusTime:0,guardBreak:0,hitReaction:null});
    target.history=[{time:b.time-2,x:target.x,y:target.y,z:target.z,vx:0,vz:0,attacking:false,guard:false,dead:false}];
    b.tick(1/120,{});
   };
   b.paused=false;for(let i=0;i<720;i++){window.tensionCpuStep();if(u.aiRecovering){b.observed=u;window.tensionDraw();return {difficulty,time:b.time,tension:u.tension,recovering:u.aiRecovering,retreat:u.vz,starts:window.tensionStarts.length,damage:u.dealt,infinite:b.training.infinite};}}
   throw Error(`CPU ${difficulty} did not stop repeated attacks to recover`);
  },difficulty);
  assert.equal(low.infinite,false);assert(low.recovering&&low.tension<25&&low.time<3.2&&low.retreat<0,JSON.stringify(low));assert(low.starts>=5,JSON.stringify(low));assert(low.damage>0,JSON.stringify(low));
  assert.equal(await page.locator('.hud-resources h3').innerText(),'敵機 1');
  assert.equal(await page.locator('.resource-label').filter({hasText:'TENSION'}).locator('strong').innerText(),`${Math.round(low.tension)} / 100`);
  await page.screenshot({path:`charge-artifacts/tension-cpu-${difficulty}-low.png`});
  const recovered=await page.evaluate(()=>{
   const app=window.tensionApp,b=app.battle,u=b.entities[1],starts=window.tensionStarts.length,start=b.time;let idleFrames=0;
   b.paused=false;for(let i=0;i<1440;i++){
    window.tensionCpuStep();
    if(window.tensionStarts.length>starts){const resumed=window.tensionStarts.at(-1);window.tensionDraw();return {time:b.time,rest:b.time-start,idleFrames,resumed,tension:u.tension,recovering:u.aiRecovering,starts:window.tensionStarts.length,allRecoveringStarts:window.tensionStarts.filter(s=>s.recovering).length};}
    if(!u.aiRecovering)throw Error(`Recovery released before attack reserve: ${u.tension}`);
    if(!u.attack)idleFrames++;
   }
   throw Error('CPU never resumed attacking after its tension recovered');
  });
  assert.equal(recovered.allRecoveringStarts,0,JSON.stringify(recovered));assert(recovered.idleFrames>120&&recovered.rest>1,JSON.stringify(recovered));
  assert(recovered.resumed.tension>=80&&!recovered.recovering,JSON.stringify(recovered));assert.equal(recovered.starts,low.starts+1);
  assert.equal(await page.locator('.resource-label').filter({hasText:'TENSION'}).locator('strong').innerText(),`${Math.round(recovered.tension)} / 100`);
  await page.screenshot({path:`charge-artifacts/tension-cpu-${difficulty}-resumed.png`});cpu.push({low,recovered});
 }
 const graphics=await page.evaluate(()=>{const app=window.tensionApp;return {fault:app.frameError?String(app.frameError.error||app.frameError):null,lost:!!app.renderer.contextLost,calls:app.renderer.renderer.info.render.calls,glError:app.renderer.renderer.getContext().getError()};});
 assert.equal(graphics.fault,null);assert.equal(graphics.lost,false);assert(graphics.calls>0);assert.equal(graphics.glError,0);assert.deepEqual(errors,[]);
 console.log('Tension browser passed: finite-resource sword whiffs run short in '+human.time.toFixed(2)+' s, normal hammer and charged sword do not regenerate mid-swing, all three CPU difficulties retreat without new attacks until 80 tension, real HUD and WebGL render. '+JSON.stringify({human,committed,cpu}));
}catch(e){console.error(e);if(browser)for(const page of browser.contexts().flatMap(c=>c.pages())){console.error('Page state:',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'charge-artifacts/tension-failure.png'}).catch(()=>{});}process.exitCode=1;
}finally{await browser?.close();server.kill();}})();
