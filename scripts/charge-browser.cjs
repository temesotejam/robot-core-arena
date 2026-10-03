const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Fast, early visual evidence for attack changes. All five attacks originate
// from normal held/released input in the actual application's fixed-step loop.
// The snapshots retain real Battle states; they never synthesize combo hits.
async function swordReview(browser,errors,{views=['side','threequarter'],withShield=true,artifactDir='charge-artifacts',individualStills=false}={}){
 fs.mkdirSync(artifactDir,{recursive:true});
 const reports=[];
 for(const view of views){
  const variant=view+(withShield?'':'-bare');
  const page=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:artifactDir,size:{width:1100,height:800}}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
  await page.evaluate(async({view,withShield,individualStills})=>{
   const [{app},{defaultConfig},THREE,{sampleMotion}]=await Promise.all([import('/src/main.js'),import('/src/customize.js'),import('/vendor/three.module.min.js'),import('/src/motion.js')]);
   window.swordReviewApp=app;const c=defaultConfig();c.passives=[];c.abilities=[];c.sets=[0,1].map(()=>({item:'weapon:sword',shield:withShield?'shield:basic':null,separate:false}));app.state.units[0]=c;app.state.enemies[0]=defaultConfig(0,true);app.state.enemies[0].abilities=[];
   Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.paused=true;b.training.freezeAI=true;b.rng=()=>.99;
   if(b.training.infinite)throw Error('Sword review must use finite resources');const [u,v]=b.entities;Object.assign(u,{x:3,z:0,yaw:0,target:v.id});Object.assign(v,{x:3,z:.9,yaw:Math.PI});
   const cameras={side:{position:[7.2,1.35,.65],target:[3,.48,.65]},threequarter:{position:[5.8,1.4,3.4],target:[3,.48,.60]},front:{position:[3,1.4,4.8],target:[3,.48,.60]}};
   window.swordReviewCamera=cameras[view];const draw=app.renderer.renderer.render.bind(app.renderer.renderer);app.renderer.renderer.render=(scene,camera)=>{const c=window.swordReviewCamera;camera.position.set(...c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);draw(scene,camera);};app.renderer.render(b,1/60,b.time);
   window.swordReviewData={samples:[],starts:[],hits:[],snapshots:{},done:false};const data=window.swordReviewData,seen=new Set(),anchors=[null,null];let pressing=false,charging=false,previous=-1,maxContactDrift=0;
   const snapshot=(key,caption)=>{if(!data.snapshots[key]){const rig=[u,v].map(unit=>{const ref=app.renderer.robots.get(unit.id),plant=ref.swordPlant;return {locomotion:structuredClone(ref.locomotion),swordPlant:plant?{...structuredClone(plant),feet:plant.feet.map(f=>f?f.toArray():null)}:null};});data.snapshots[key]={unit:structuredClone(u),target:structuredClone(v),rig,time:b.time,caption};}};
   const capture=()=>{
    const ref=app.renderer.robots.get(u.id);app.renderer.animateRobot(ref,u,b.time,(x,z)=>b.groundAt(x,z));ref.root.updateMatrixWorld(true);const a=u.attack,motion=sampleMotion('sword',a),p=a?a.elapsed/a.duration:null;
    const position=o=>o.getWorldPosition(new THREE.Vector3()),local=o=>ref.root.worldToLocal(position(o)).toArray(),feet=ref.feet.map((leg,i)=>{const point=position(leg.foot),bounds=new THREE.Box3().setFromObject(leg.foot),support=!!a&&motion.feet[i][1]<=.035+1e-9;
     if(support){if(anchors[i]?.id===a.id)maxContactDrift=Math.max(maxContactDrift,point.distanceTo(anchors[i].point));else anchors[i]={id:a.id,point:point.clone()};}else anchors[i]=null;
     if(bounds.min.y<-.002)throw Error(`Sword review foot enters ground: ${bounds.min.y}`);return {position:point.toArray(),support,screen:app.renderer.project(point.x,point.y,point.z)};
    });
    for(const arm of ref.arms){if(arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(position(arm.elbow))>1e-7||arm.lower.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(position(arm.hand))>1e-7)throw Error('Sword review arm joint disconnects');}
    const weapon=ref.weaponAttachments[0],tip=weapon.localToWorld(new THREE.Vector3(...weapon.userData.trailTip));if(position(weapon).distanceTo(position(ref.arms[0].hand))>1e-7)throw Error('Sword review blade leaves its hand');
    const headBounds=new THREE.Box3().setFromObject(ref.head),headScreens=[];for(const x of [headBounds.min.x,headBounds.max.x])for(const y of [headBounds.min.y,headBounds.max.y])for(const z of [headBounds.min.z,headBounds.max.z])headScreens.push(app.renderer.project(x,y,z));
    data.samples.push({time:b.time,id:a?.id,combo:a?.combo,charge:a?.charge,p,x:u.x,z:u.z,facing:ref.root.rotation.y,body:ref.bodyPivot.rotation.toArray().slice(0,3),pelvis:ref.bodyPivot.position.toArray(),hipYaw:ref.legGroup.rotation.y,spinYaw:motion.spinYaw||0,head:local(ref.head),headScreens,elbows:ref.arms.map(arm=>local(arm.elbow)),hands:ref.arms.map(arm=>local(arm.hand)),feet,tip:tip.toArray(),tipScreen:app.renderer.project(tip.x,tip.y,tip.z),topScreen:app.renderer.project(u.x,u.y+1.16,u.z)});
    if(a){for(const phase of a.charge>0?[.20,.50,.78]:individualStills?[.16,.40,.53,.75,.90]:[.16,.40,.53])if(p>=phase){const key=a.charge>0?`charge-${Math.round(phase*100)}`:`cut-${a.combo}-${Math.round(phase*100)}`;snapshot(key,a.charge>0?`最大チャージ・回転薙ぎ払い ${Math.round(phase*100)}%`:`${a.combo+1}段目 ${Math.round(phase*100)}%`);}}
    else if(u.charging){const amount=u.charge/b.maxCharge(u);if(amount>=.5)snapshot('charge-hold-half','チャージ50%');if(amount>=1-1e-9)snapshot('charge-hold-full','最大チャージ');}
   };
   const attack=b.attack.bind(b);b.attack=(unit,amount=0,input={})=>{const ok=attack(unit,amount,input);if(ok&&unit===u)data.starts.push({id:u.attack.id,combo:u.attack.combo,charge:u.attack.charge,at:b.time,tension:u.tension});return ok;};
   const tick=b.tick.bind(b);b.tick=dt=>{
    if(b.paused)return;const rt=b.runtime(u),normals=data.starts.filter(a=>a.charge===0),charged=data.starts.some(a=>a.charge>0);let input={x:0,z:0};
    if(normals.length<4){const first=!normals.length&&!u.attack&&!u.motion,follow=u.attack&&u.attack.combo<3&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.15&&rt.cooldown>0;
     if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;}
    }else if(!charged){if(!charging&&!u.attack&&(!u.motion||u.motion.elapsed>=u.motion.duration)&&rt.cooldown===0&&!b.invulnerable(v)){charging=true;}
     if(charging)input.attack=u.charge<b.maxCharge(u)-1e-9;
    }
    tick(dt,input);for(const e of b.events)if(e.type==='hit'&&e.attacker===u.id&&!seen.has(e)){seen.add(e);data.hits.push({time:b.time,id:u.attack?.id,combo:u.attack?.combo,charge:u.attack?.charge,damage:e.damage});}
    if(previous!==b.time){capture();previous=b.time;}
    if(charged&&!u.attack&&!u.motion){b.paused=true;data.done=true;data.damage=u.dealt;data.tension=u.tension;data.maxContactDrift=maxContactDrift;}
    if(b.time>9&&!data.done)throw Error('Sword review did not complete all real attacks');
   };
   const update=app.hudUpdate.bind(app);app.hudUpdate=()=>{update();const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`4段コンボ → 最大チャージ回転斬り · SIM ${b.time.toFixed(2)} s`;};b.paused=false;
  },{view,withShield,individualStills});
  await page.waitForFunction(()=>window.swordReviewData.done,{},{timeout:60000});
  const result=await page.evaluate(()=>({...window.swordReviewData,snapshots:Object.keys(window.swordReviewData.snapshots),fault:window.swordReviewApp.frameError?String(window.swordReviewApp.frameError.error||window.swordReviewApp.frameError):null,lost:!!window.swordReviewApp.renderer.contextLost,calls:window.swordReviewApp.renderer.renderer.info.render.calls,infinite:window.swordReviewApp.battle.training.infinite}));
  assert.equal(result.fault,null);assert.equal(result.lost,false);assert.equal(result.infinite,false);assert(result.calls>0);assert.deepEqual(result.starts.filter(a=>!a.charge).map(a=>a.combo),[0,1,2,3]);assert.equal(result.starts.filter(a=>a.charge===1).length,1);assert.equal(result.hits.length,5);assert(result.hits.every(h=>h.damage>0));assert(result.maxContactDrift<.001,JSON.stringify({view,drift:result.maxContactDrift}));assert(result.samples.length>200);
  for(const s of result.samples){for(const point of [...s.feet.map(f=>f.screen),...s.headScreens,s.topScreen,s.tipScreen])assert(point.visible&&point.x>8&&point.x<1092&&point.y>85&&point.y<705,JSON.stringify({view,time:s.time,combo:s.combo,p:s.p,point}));}
  const chargedSamples=result.samples.filter(s=>s.charge===1),chargedTurn=Math.max(...chargedSamples.map(s=>s.facing))-Math.min(...chargedSamples.map(s=>s.facing));assert(chargedSamples.length>30);assert(chargedTurn>=Math.PI*2-1e-8);for(let i=1;i<chargedSamples.length;i++)assert(chargedSamples[i].facing>=chargedSamples[i-1].facing-1e-8,'the rendered charged turn reverses');
  const poses=[];for(let combo=0;combo<4;combo++){const samples=result.samples.filter(s=>s.charge===0&&s.combo===combo),range=read=>{const vals=samples.map(read);return Math.max(...vals)-Math.min(...vals);};assert(samples.length>20);const pose={combo,chestPitch:range(s=>s.body[0]),chestYaw:range(s=>s.body[1]),pelvisHeight:range(s=>s.pelvis[1]),hipYaw:range(s=>s.hipYaw),freeElbow:Math.hypot(...[0,1,2].map(axis=>range(s=>s.elbows[1][axis])))};assert(pose.hipYaw>.30&&pose.freeElbow>.07,JSON.stringify(pose));poses.push(pose);}
  const savedStates=view==='threequarter'?await page.evaluate(()=>JSON.stringify(window.swordReviewData.snapshots)):null;
  await page.screenshot({path:`${artifactDir}/sword-motion-${variant}-recovered.png`});const video=page.video();await page.close();await video.saveAs(`${artifactDir}/sword-motion-${variant}-gameplay.webm`);
  reports.push({view,withShield,starts:result.starts,hits:result.hits,damage:result.damage,tension:result.tension,maxContactDrift:result.maxContactDrift,chargedTurn,poses,snapshots:result.snapshots});
  // Replay the recorded states on the same renderer in a separate paused page,
  // so still photographs do not introduce artificial holds into either movie.
  if(savedStates){
   const still=await browser.newPage({viewport:{width:1100,height:800}});still.on('pageerror',e=>errors.push(e.message));await still.goto('http://127.0.0.1:4173');await still.locator('.home-copy').waitFor();
   await still.evaluate(async savedStates=>{
    const [{app},THREE]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js')]),states=JSON.parse(savedStates),first=Object.values(states)[0];app.state.units[0]=first.unit.config;app.state.enemies[0]=first.target.config;Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.paused=true;b.countdown=0;app.hudUpdate();app.view='inspection';app.renderer.mode='inspection';
    const cameras={side:{position:[7.2,1.35,.65],target:[3,.48,.65]},threequarter:{position:[5.8,1.4,3.4],target:[3,.48,.60]},front:{position:[3,1.4,4.8],target:[3,.48,.60]}},draw=app.renderer.renderer.render.bind(app.renderer.renderer);window.swordStillCamera=cameras.threequarter;app.renderer.renderer.render=(scene,camera)=>{const c=window.swordStillCamera;camera.position.set(...c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);draw(scene,camera);};
    window.swordReviewDrawSaved=(key,camera,hideTarget=false)=>{const s=states[key];if(!s)throw Error(`Missing gameplay state ${key}`);window.swordStillCamera=cameras[camera];const refs=[app.renderer.robots.get(b.human.id),app.renderer.robots.get(b.entities[1].id)];for(const [i,unit]of [s.unit,s.target].entries()){const state=s.rig[i];refs[i].locomotion=structuredClone(state.locomotion);if(state.swordPlant)refs[i].swordPlant={...structuredClone(state.swordPlant),feet:state.swordPlant.feet.map(f=>f?new THREE.Vector3(...f):null)};else delete refs[i].swordPlant;app.renderer.animateRobot(refs[i],unit,s.time,(x,z)=>b.groundAt(x,z));}refs[1].root.visible=!hideTarget;app.renderer.renderer.render(app.renderer.scene,app.renderer.camera);
     const points=[];for(const ref of refs.filter(ref=>ref.root.visible)){for(const leg of ref.feet)points.push(leg.foot.getWorldPosition(new THREE.Vector3()));const headBounds=new THREE.Box3().setFromObject(ref.head);for(const x of [headBounds.min.x,headBounds.max.x])for(const y of [headBounds.min.y,headBounds.max.y])for(const z of [headBounds.min.z,headBounds.max.z])points.push(new THREE.Vector3(x,y,z));}points.push(refs[0].weaponAttachments[0].localToWorld(new THREE.Vector3(...refs[0].weaponAttachments[0].userData.trailTip)),new THREE.Vector3(s.unit.x,s.unit.y+1.16,s.unit.z));for(const point of points){const p=app.renderer.project(point.x,point.y,point.z);if(!p.visible||p.x<=8||p.x>=1092||p.y<=85||p.y>=705)throw Error(`Saved sword frame cropped: ${camera}/${key} ${JSON.stringify(p)}`);}const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`実戦の保存フレーム${hideTarget?' · 相手モデル非表示の個体確認':''} · ${s.caption} · SIM ${s.time.toFixed(2)} s`;
    };
   },savedStates);
   for(const camera of ['front','side','threequarter'])for(const key of result.snapshots.filter(key=>!key.endsWith('-75')&&!key.endsWith('-90'))){await still.evaluate(({key,camera})=>window.swordReviewDrawSaved(key,camera),{key,camera});await still.screenshot({path:`${artifactDir}/sword-motion-${camera}${withShield?'':'-bare'}-${key}.png`});}
   if(individualStills)for(const camera of ['front','threequarter'])for(const key of result.snapshots.filter(key=>key.startsWith('cut-'))){await still.evaluate(({key,camera})=>window.swordReviewDrawSaved(key,camera,true),{key,camera});await still.screenshot({path:`${artifactDir}/sword-individual-${camera}${withShield?'':'-bare'}-${key}.png`});}
   await still.close();
  }
 }
 assert.deepEqual(errors,[]);console.log('Sword motion early review passed: finite-resource actual application loop, four genuinely hit-gated cuts and a full charged sweep, planted feet, connected arms and blade grip, all body/feet/blade bounds, fixed side and three-quarter videos. '+JSON.stringify(reports));
 return reports;
}
module.exports={swordReview};
if(require.main===module)(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 fs.mkdirSync('charge-artifacts',{recursive:true});const errors=[];
 if(process.argv.includes('--sword-review')){await swordReview(browser,errors);return;}
 const page=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/sword-motion.html?mode=charge');await page.locator('#pose').waitFor();await page.evaluate(async()=>{window.chargeViewer=(await import('/src/sword-preview.js')).swordPreview;});
 assert.equal(await page.locator('[data-stage="4"]').getAttribute('aria-pressed'),'true');assert(await page.locator('#charge-controls').isVisible());
 await page.locator('#replay').click();await page.waitForTimeout(3000);
 await page.locator('#speed').selectOption('.25');await page.locator('#camera').selectOption('side');await page.locator('#replay').click();await page.waitForTimeout(8000);
 await page.locator('#play').click();const frozen=await page.evaluate(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.time);await page.waitForTimeout(120);assert.equal(await page.evaluate(async()=>(await import('/src/sword-preview.js')).swordPreview.battle.time),frozen);
 // Frozen photographs use the same hold input and collision-limited release as battle.
 for(const camera of ['threequarter','side','front'])for(const phase of ['half','full',.20,.35,.50,.68,.78,.95]){
  await page.locator('#camera').selectOption(camera);await page.locator('#replay').click();
  await page.evaluate(async phase=>{const v=(await import('/src/sword-preview.js')).swordPreview,b=v.battle,u=b.human;
   for(let i=0;i<(phase==='half'?48:96);i++)b.tick(1/120,{attack:true});
   if(typeof phase==='number'){b.handleInput(u,{},1/120);b.meleeStep(u,u.attack.duration*phase);}
   v.draw();
  },phase);await page.screenshot({path:`charge-artifacts/charge-${camera}-${phase}.png`});
  await page.evaluate(async()=>{const v=(await import('/src/sword-preview.js')).swordPreview,u=v.battle.human,panel=document.querySelector('.controls').getBoundingClientRect();for(const ref of [v.model,v.targetModel])for(const leg of ref.feet){const foot=leg.foot||leg,p=foot.getWorldPosition(foot.position.clone());if(v.renderer.project(p.x,p.y,p.z).y>=panel.top-10)throw Error('Charge feet hidden by desktop controls');}});
 }
 // A real keyboard hold/release on the viewer's accessible manual button.
 await page.locator('#speed').selectOption('1');await page.locator('#charge-hold').focus();await page.keyboard.down('Space');
 await page.waitForFunction(()=>{const v=window.chargeViewer;return v.battle.human.charge===v.battle.maxCharge(v.battle.human);});
 await page.waitForFunction(()=>document.querySelector('#pose').textContent.includes('最大チャージ'));
 assert((await page.locator('#pose').innerText()).includes('最大チャージ'));
 await page.keyboard.up('Space');await page.waitForFunction(()=>{const u=window.chargeViewer.battle.human;return u.attack?.charge===1;});
 await page.waitForFunction(()=>!window.chargeViewer.battle.human.motion);
 // Pointer release also works; actual partial input produces a partial charged sweep.
 const box=await page.locator('#charge-hold').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.waitForFunction(()=>window.chargeViewer.battle.human.charge>=.3);await page.mouse.up();
 await page.waitForFunction(()=>{const u=window.chargeViewer.battle.human;return u.attack?.charge>0&&u.attack.charge<1;});
 // Canceling a pointer via focus loss clears the hold without firing.
 await page.mouse.down();await page.waitForFunction(()=>window.chargeViewer.battle.human.charging);
 // Focus loss and release can arrive within a single simulation frame. A
 // subsequent pointerup must not overwrite the pending cancellation.
 await page.evaluate(()=>{document.querySelector('#play').focus();document.querySelector('#charge-hold').dispatchEvent(new PointerEvent('pointerup'));});await page.mouse.up();
 await page.waitForFunction(()=>{const u=window.chargeViewer.battle.human;return !u.charging&&!u.attack;});
 await page.waitForTimeout(200);assert(await page.evaluate(async()=>!(await import('/src/sword-preview.js')).swordPreview.battle.human.attack));
 await page.locator('#play').click();await page.locator('#charge-level').selectOption('.5');await page.locator('#camera').selectOption('threequarter');await page.locator('#replay').click();
 await page.evaluate(async()=>{const v=(await import('/src/sword-preview.js')).swordPreview;for(let i=0;i<48;i++)v.battle.tick(1/120,{attack:true});v.draw();});
 await page.setViewportSize({width:390,height:844});
 for(const phase of ['half','full',.20,.35,.50,.68,.78,.95]){
  await page.locator('#replay').click();await page.evaluate(async phase=>{const v=(await import('/src/sword-preview.js')).swordPreview,b=v.battle,u=b.human;for(let i=0;i<(phase==='half'?48:96);i++)b.tick(1/120,{attack:true});if(typeof phase==='number'){b.handleInput(u,{},1/120);b.meleeStep(u,u.attack.duration*phase);}v.draw();const panel=document.querySelector('.controls').getBoundingClientRect();for(const ref of [v.model,v.targetModel])for(const leg of ref.feet){const foot=leg.foot||leg,p=foot.getWorldPosition(foot.position.clone());if(v.renderer.project(p.x,p.y,p.z).y>=panel.top-10)throw Error('Charge preview feet hidden by mobile controls');}const THREE=await import('/vendor/three.module.min.js'),tip=v.model.weaponAttachments[0].localToWorld(new THREE.Vector3(0,.57,0)),screen=v.renderer.project(tip.x,tip.y,tip.z);if(screen.x<12||screen.x>innerWidth-12||screen.y<90||screen.y>=panel.top-10)throw Error('Charged blade cropped on mobile '+JSON.stringify(screen));},phase);
  await page.screenshot({path:`charge-artifacts/charge-mobile-${phase}.png`});
 }
 assert(await page.locator('.controls').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'charge-artifacts/charge-mobile.png'});
 const video=page.video();await page.close();await video.saveAs('charge-artifacts/charge-review.webm');
 // The actual game uses the user's attack binding and displays a full-charge cue.
 const game=await browser.newPage({viewport:{width:1100,height:800}});game.on('pageerror',e=>errors.push(e.message));await game.goto('http://127.0.0.1:4173');await game.locator('.home-copy').waitFor();
 await game.evaluate(async()=>{const [{app},{defaultConfig}]=await Promise.all([import('/src/main.js'),import('/src/customize.js')]);app.state.units[0]=defaultConfig();app.state.enemies[0]=defaultConfig();Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.training.freezeAI=true;b.training.infinite=true;Object.assign(b.human,{x:0,z:0,yaw:0,target:b.entities[1].id});Object.assign(b.entities[1],{x:0,z:.9,yaw:Math.PI});const attack=b.attack.bind(b);window.chargeReleases=[];b.attack=(u,charge=0,input={})=>{const ok=attack(u,charge,input);if(ok&&u===b.human)window.chargeReleases.push({charge,coefficient:u.attack.coefficient,combo:u.combo,dash:u.dashTime});return ok;};});
 await game.mouse.move(500,300);await game.mouse.down();await game.locator('.charge-display[data-charge-ready="true"]').waitFor();assert((await game.locator('.charge-display').innerText()).includes('離して攻撃'));await game.screenshot({path:'charge-artifacts/charge-game-hud.png'});
 await game.mouse.up();await game.waitForFunction(()=>window.chargeReleases.length>0);assert.deepEqual(await game.evaluate(()=>window.chargeReleases[0]),{charge:1,coefficient:1.8,combo:0,dash:0});
 // Review the real approach animation, including stance transport on mobile.
 const approach=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});approach.on('pageerror',e=>errors.push(e.message));
 await approach.goto('http://127.0.0.1:4173/sword-motion.html?mode=approach');await approach.locator('#pose').waitFor();await approach.waitForTimeout(2500);
 await approach.locator('#speed').selectOption('.25');await approach.locator('#camera').selectOption('side');await approach.locator('#replay').click();await approach.waitForTimeout(2800);await approach.locator('#play').click();
 for(const mobile of [false,true]){
  await approach.setViewportSize(mobile?{width:390,height:844}:{width:1100,height:800});await approach.locator('#camera').selectOption('side');
  for(const phase of [0,.08,.20,.35,.53]){await approach.evaluate(async phase=>{const v=(await import('/src/sword-preview.js')).swordPreview;v.reset();const b=v.battle,u=b.human;b.attack(u,0,{z:1});for(let i=0;i<Math.round(u.attack.duration*phase*120);i++)b.tick(1/120);v.draw();const panel=document.querySelector('.controls').getBoundingClientRect();for(const ref of [v.model,v.targetModel])for(const leg of ref.feet){const foot=leg.foot||leg,p=foot.getWorldPosition(foot.position.clone()),screen=v.renderer.project(p.x,p.y,p.z);if(screen.x<8||screen.x>innerWidth-8||screen.y>=panel.top-10)throw Error('Approach feet cropped '+JSON.stringify(screen));}},phase);await approach.screenshot({path:`charge-artifacts/approach-${mobile?'mobile':'desktop'}-${phase}.png`});}
 }
 const approachVideo=approach.video();await approach.close();await approachVideo.saveAs('charge-artifacts/approach-review.webm');
 assert.deepEqual(errors,[]);console.log('Charge browser passed: actual hold/release/cancel, stable pause, maximum HUD, target and shield, 24 WebGL poses, mobile feet, real game binding, W + attack and charge release, backward input, approach video and mobile stance.');
}catch(e){console.error(e);if(browser)for(const p of browser.contexts().flatMap(c=>c.pages())){console.error('Page state:',await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:'charge-artifacts/failure.png'}).catch(()=>{});}process.exitCode=1;}finally{await browser?.close();server.kill();}})();
