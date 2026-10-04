const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {swordReview}=require('./charge-browser.cjs');

// Real application movies are separate from still-state replay. No artificial
// pose hold, replenished resource or fabricated hit is added to either duel.
const output=process.env.SWORD_REVIEW_OUTPUT||'artifacts/sword-anime';
async function landingReview(browser,errors,view,withShield){
 const page=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:output,size:{width:1100,height:800}}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
 await page.evaluate(async({view,withShield})=>{
  const [{app},{defaultConfig},THREE,{ROBOT_PROPORTIONS}]=await Promise.all([import('/src/main.js'),import('/src/customize.js'),import('/vendor/three.module.min.js'),import('/src/render.js')]);
  const config=defaultConfig();config.passives=[];config.abilities=[];config.sets=[0,1].map(()=>({item:'weapon:sword',shield:withShield?'shield:basic':null}));app.state.units[0]=config;app.state.enemies[0]=defaultConfig(0,true);app.state.enemies[0].abilities=[];
  Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.paused=true;b.training.freezeAI=true;b.rng=()=>.99;
  const u=b.human,v=b.entities[1];Object.assign(u,{x:3,z:0,yaw:0,target:null});Object.assign(v,{x:3,z:8});
  const cameras={side:{position:[8.2,2.2,0],target:[3,1.3,0]},threequarter:{position:[6.6,2.2,3.8],target:[3,1.3,0]},front:{position:[3,2.2,5.2],target:[3,1.3,0]}};
  const draw=app.renderer.renderer.render.bind(app.renderer.renderer);window.landingReviewCamera=cameras[view];app.renderer.renderer.render=(scene,camera)=>{const c=window.landingReviewCamera;camera.position.set(...c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);draw(scene,camera);};app.renderer.render(b,1/60,b.time);
  window.landingReviewApp=app;window.landingReviewData={samples:[],snapshots:{},done:false,touchdown:null};const data=window.landingReviewData,anchors=[null,null];let jumped=false,previous=-1,maxDrift=0;
  const ref=app.renderer.robots.get(u.id),position=object=>object.getWorldPosition(new THREE.Vector3());
  const snapshot=(key,caption)=>{if(!data.snapshots[key])data.snapshots[key]={unit:structuredClone(u),target:structuredClone(v),landing:structuredClone(ref.landing),locomotion:structuredClone(ref.locomotion),time:b.time,caption};};
  const tick=b.tick.bind(b);b.tick=dt=>{
   if(b.paused)return;const wasGrounded=u.grounded;tick(dt,{jumpPressed:!jumped});jumped=true;
   if(previous===b.time)return;previous=b.time;app.renderer.animateRobot(ref,u,b.time,(x,z)=>b.groundAt(x,z));ref.root.updateMatrixWorld(true);
   if(!wasGrounded&&u.grounded)data.touchdown=b.time;
   const landing=ref.landing,elapsed=landing?.start===null?null:b.time-landing.start,feet=ref.feet.map((leg,i)=>{
    const point=position(leg.foot),bounds=new THREE.Box3().setFromObject(leg.foot);assertion(bounds.min.y>=-.002,'landing foot enters ground');
    assertion(leg.upper.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.thigh,0)).distanceTo(position(leg.knee))<1e-7,'landing knee disconnects');assertion(leg.lower.localToWorld(new THREE.Vector3(0,-ROBOT_PROPORTIONS.shin,0)).distanceTo(point)<1e-7,'landing ankle disconnects');
    if(u.grounded&&data.touchdown!==null){if(anchors[i])maxDrift=Math.max(maxDrift,point.distanceTo(anchors[i]));else anchors[i]=point.clone();}
    return {position:point.toArray(),screen:app.renderer.project(point.x,point.y,point.z)};
   });
   const weapon=ref.weaponAttachments[0],tip=weapon.localToWorld(new THREE.Vector3(...weapon.userData.trailTip));assertion(position(weapon).distanceTo(position(ref.arms[0].hand))<1e-7,'landing sword grip disconnects');
   const sample={time:b.time,grounded:u.grounded,y:u.y,vy:u.vy,elapsed,body:ref.bodyPivot.rotation.toArray().slice(0,3),pelvis:ref.bodyPivot.position.toArray(),head:ref.head.rotation.toArray().slice(0,3),hands:ref.arms.map(arm=>position(arm.hand).toArray()),feet,tip:tip.toArray(),tipScreen:app.renderer.project(tip.x,tip.y,tip.z),topScreen:app.renderer.project(u.x,u.y+1.16,u.z)};data.samples.push(sample);
   if(!u.grounded&&u.vy<=0)snapshot('apex','ジャンプ頂点');
   if(elapsed!==null)for(const phase of [0,.085,.15,.25,.34,.42,.48])if(elapsed>=phase)snapshot(`landing-${Math.round(phase*1000)}`,`着地後 ${phase.toFixed(3)} s`);
   if(data.touchdown!==null&&b.time-data.touchdown>=.65){snapshot('recovered','着地回復後');data.done=true;b.paused=true;data.maxDrift=maxDrift;}
   if(b.time>3&&!data.done)throw Error('Jump-to-ground review never completed');
  };
  function assertion(condition,message){if(!condition)throw Error(message);}
  const update=app.hudUpdate.bind(app);app.hudUpdate=()=>{update();const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`ソード装備 · ジャンプ → 着地回復 · SIM ${b.time.toFixed(2)} s`;};b.paused=false;
 },{view,withShield});
 await page.waitForFunction(()=>window.landingReviewData.done,{},{timeout:60000});
 const result=await page.evaluate(()=>({...window.landingReviewData,snapshots:Object.keys(window.landingReviewData.snapshots),fault:window.landingReviewApp.frameError?String(window.landingReviewApp.frameError.error||window.landingReviewApp.frameError):null,lost:!!window.landingReviewApp.renderer.contextLost,calls:window.landingReviewApp.renderer.renderer.info.render.calls,infinite:window.landingReviewApp.battle.training.infinite}));
 assert.equal(result.fault,null);assert.equal(result.lost,false);assert.equal(result.infinite,false);assert(result.calls>0);assert(result.touchdown!==null&&result.samples.some(s=>!s.grounded));assert(result.maxDrift<.001,JSON.stringify({view,withShield,maxDrift:result.maxDrift}));
 const landed=result.samples.filter(sample=>sample.elapsed!==null),minimum=Math.min(...landed.map(s=>s.pelvis[1])),maximum=Math.max(...landed.map(s=>s.pelvis[1]));assert(landed.length>20&&maximum-minimum>.035,'the actual pelvis visibly compresses and recovers');assert(Math.max(...landed.map(s=>s.body[0]))>.12,'actual chest joins the landing');assert(result.snapshots.includes('landing-480'));
 for(const sample of result.samples)for(const point of [...sample.feet.map(f=>f.screen),sample.topScreen,sample.tipScreen])assert(point.visible&&point.x>8&&point.x<1092&&point.y>85&&point.y<705,JSON.stringify({view,withShield,time:sample.time,point}));
 const suffix=`${view}-${withShield?'shield':'bare'}`;await page.screenshot({path:`${output}/sword-landing-${suffix}-recovered.png`});const states=await page.evaluate(()=>JSON.stringify(window.landingReviewData.snapshots));const video=page.video();await page.close();await video.saveAs(`${output}/sword-landing-${suffix}-gameplay.webm`);
 // Saved real simulation states expose the entire landing from the same fixed
 // world camera, including the planted feet below the compression of the body.
 const still=await browser.newPage({viewport:{width:1100,height:800}});still.on('pageerror',error=>errors.push(error.message));await still.goto('http://127.0.0.1:4173');await still.locator('.home-copy').waitFor();
 await still.evaluate(async({states,view})=>{
  const {app}=await import('/src/main.js'),saved=JSON.parse(states),first=Object.values(saved)[0];app.state.units[0]=first.unit.config;app.state.enemies[0]=first.target.config;Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();app.battle.paused=true;app.battle.countdown=0;app.hudUpdate();app.view='inspection';app.renderer.mode='inspection';app.renderer.robots.get(app.battle.entities[1].id).root.visible=false;
  const cameras={side:{position:[8.2,2.2,0],target:[3,1.3,0]},threequarter:{position:[6.6,2.2,3.8],target:[3,1.3,0]},front:{position:[3,2.2,5.2],target:[3,1.3,0]}};
  window.landingStillDraw=key=>{const state=saved[key],ref=app.renderer.robots.get(app.battle.human.id);ref.landing=structuredClone(state.landing);ref.locomotion=structuredClone(state.locomotion);app.renderer.animateRobot(ref,state.unit,state.time,(x,z)=>app.battle.groundAt(x,z));const camera=cameras[view];app.renderer.camera.position.set(...camera.position);app.renderer.camera.lookAt(...camera.target);app.renderer.renderer.render(app.renderer.scene,app.renderer.camera);const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`実戦の保存フレーム · ${state.caption} · SIM ${state.time.toFixed(2)} s`;};
 },{states,view});
 for(const key of result.snapshots){await still.evaluate(key=>window.landingStillDraw(key),key);await still.screenshot({path:`${output}/sword-landing-${suffix}-${key}.png`});}await still.close();
 return {view,withShield,touchdown:result.touchdown,maxDrift:result.maxDrift,pelvisCompression:maximum-minimum,samples:result.samples,snapshots:result.snapshots};
}

(async()=>{fs.mkdirSync(output,{recursive:true});const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--no-zygote','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const errors=[],duels=[],landings=[];
  if(!process.argv.includes('--landing-only'))for(const withShield of [true,false])duels.push(...await swordReview(browser,errors,{views:['side','threequarter','front'],withShield,artifactDir:output,individualStills:true}));
  if(!process.argv.includes('--duel-only'))for(const withShield of [true,false])for(const view of ['side','threequarter','front'])landings.push(await landingReview(browser,errors,view,withShield));
  assert.deepEqual(errors,[]);fs.writeFileSync(`${output}/review.json`,JSON.stringify({browserVersion:await browser.version(),duels,landings,errors},null,2));
  console.log(`Sword anime browser passed: ${duels.length} finite-resource gameplay duels (four real hit-gated sword cuts and a charged full turn), ${landings.length} ordinary jump-to-ground gameplay landings, shield and no shield, fixed side/front/oblique movies, connected mesh joints and grip, grounded foot anchors, and saved real frames. `+JSON.stringify({duels:duels.map(d=>({view:d.view,withShield:d.withShield,hits:d.hits.length,maxContactDrift:d.maxContactDrift,chargedTurn:d.chargedTurn})),landings:landings.map(({view,withShield,touchdown,maxDrift,pelvisCompression})=>({view,withShield,touchdown,maxDrift,pelvisCompression}))}));
 }catch(error){console.error(error);if(browser)for(const page of browser.contexts().flatMap(context=>context.pages())){console.error('Page state:',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});}process.exitCode=1;}
 finally{await browser?.close();server.kill();}
})();
