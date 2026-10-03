const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');

(async()=>{const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 fs.mkdirSync('charge-artifacts',{recursive:true});const errors=[];
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.locator('.home-copy').waitFor();
 const installFixture=async()=>{
  const [{app},{defaultConfig},{Vector3,Quaternion,Euler}]=await Promise.all([import('/src/main.js'),import('/src/customize.js'),import('/vendor/three.module.min.js')]);window.locomotionApp=app;
  const draw=app.renderer.renderer.render.bind(app.renderer.renderer);
  window.locomotionCamera={position:[5.8,1.65,0],target:[0,.48,0]};
  // Fix a world camera at the actual WebGL draw: tracking cameras can conceal
  // sliding because both the ground and robot move together on the screen.
  app.renderer.renderer.render=(scene,camera)=>{const c=window.locomotionCamera;camera.position.set(...c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);draw(scene,camera);};
  window.locomotionReset=(frame='knight',laneX=0)=>{
   const c=defaultConfig();c.armor=Object.fromEntries(Object.keys(c.armor).map(p=>[p,`armor:${frame}:${p}`]));c.passives=[];c.abilities=[];c.sets=[0,1].map(()=>({item:'weapon:sword',shield:null,separate:false}));
   app.state.units[0]=c;app.state.enemies[0]=defaultConfig(0,true);app.state.enemies[0].abilities=[];
   Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.paused=true;b.training.freezeAI=true;b.rng=()=>.99;
   const [u,v]=b.entities;Object.assign(u,{x:laneX,z:0,yaw:0,target:v.id});Object.assign(v,{x:laneX,z:8,yaw:Math.PI});window.locomotionCamera={position:[laneX+5.8,1.65,0],target:[laneX,.48,0]};
   app.renderer.render(b,1/60,b.time);app.hudUpdate();return b;
  };
  window.locomotionSample=()=>{
   const b=app.battle,u=b.human,ref=app.renderer.robots.get(u.id);app.renderer.animateRobot(ref,u,b.time);ref.root.updateMatrixWorld(true);
   const gait=ref.locomotion;if(!gait)throw Error('Real renderer has no locomotion state');
   const local=o=>ref.root.worldToLocal(o.getWorldPosition(new Vector3())).toArray(),relativeRotation=o=>{const q=ref.root.getWorldQuaternion(new Quaternion()).invert().multiply(o.getWorldQuaternion(new Quaternion())),e=new Euler().setFromQuaternion(q);return [e.x,e.y,e.z];};
   const feet=ref.feet.map((leg,i)=>{const foot=leg.foot||leg,p=foot.getWorldPosition(new Vector3()),q=foot.getWorldQuaternion(new Quaternion()),direction=new Vector3(0,0,1).applyQuaternion(q);return {position:p.toArray(),local:ref.root.worldToLocal(p.clone()).toArray(),planted:!!gait.feet?.[i]?.planted,contact:gait.feet?.[i]?.contact,goal:gait.feet?.[i]?.world?.slice(),screen:app.renderer.project(p.x,p.y,p.z),yaw:Math.atan2(direction.x,direction.z)};});
   const upperBody={chest:relativeRotation(ref.bodyPivot),hips:relativeRotation(ref.legGroup),head:relativeRotation(ref.head),shoulders:ref.arms.map(local),elbows:ref.arms.map(a=>local(a.elbow)),hands:ref.arms.map(a=>local(a.hand))};
   return {time:b.time,mode:gait.mode,phase:gait.phase,x:u.x,z:u.z,yaw:u.yaw,dash:u.dashTime,attack:!!u.attack,attackPhase:u.attack?u.attack.elapsed/u.attack.duration:null,dealt:u.dealt,feet,topScreen:app.renderer.project(u.x,u.y+1.16,u.z),body:ref.bodyPivot.position.toArray(),tilt:ref.bodyPivot.rotation.x,upperBody};
  };
  window.locomotionRun=(input,seconds,lock=true)=>{
   const b=app.battle,u=b.human,v=b.entities[1],samples=[];b.paused=false;
   for(let i=0;i<Math.round(seconds*120);i++){
    if(lock){Object.assign(v,{x:u.x,z:u.z+8});u.target=v.id;}else u.target=null;
    b.tick(1/120,{x:0,z:0,...input,...(i?{dashPressed:false}:{})});samples.push(window.locomotionSample());
   }
   b.paused=true;b.consumeEvents();window.locomotionCamera={position:[u.x+5.8,1.65,u.z],target:[u.x,.48,u.z]};app.hudUpdate();app.renderer.render(b,1/60,b.time);app.hudFrame();return {samples,move:u.stats.move,x:u.x,z:u.z,time:b.time};
  };
  window.locomotionReset();
 };await page.evaluate(installFixture);
 const analyze=samples=>{
  let maxPelvisSpeed=0,steadyPelvisSpeed=0;
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],dt=b.time-a.time;
   if(dt>0&&a.mode==='walk'&&b.mode==='walk'){const speed=Math.abs(b.body[1]-a.body[1])/dt;maxPelvisSpeed=Math.max(maxPelvisSpeed,speed);if(b.time-samples[0].time>.5)steadyPelvisSpeed=Math.max(steadyPelvisSpeed,speed);}
  }
  assert(maxPelvisSpeed<.60&&steadyPelvisSpeed<.30,JSON.stringify({maxPelvisSpeed,steadyPelvisSpeed}));
  const anchors=[null,null],liftoffs=[0,0],heights=[0,0],lastContacts=[null,null],lastLandings=[null,null],touchdowns=[],sameFootStrides=[];let contactFrames=0,maxSlide=0,maxYawSlip=0,minFoot=Infinity;
  for(const s of samples)for(let i=0;i<2;i++){
   const f=s.feet[i],p=f.position;assert(p.every(Number.isFinite),JSON.stringify(s));minFoot=Math.min(minFoot,p[1]);heights[i]=Math.max(heights[i],p[1]);
   if(s.mode==='walk'&&f.planted&&lastContacts[i]!==null&&f.contact!==lastContacts[i]){
    touchdowns.push({root:[s.x,s.z],foot:i});
    if(lastLandings[i])sameFootStrides.push(Math.hypot(p[0]-lastLandings[i][0],p[2]-lastLandings[i][2])/2);
    lastLandings[i]=p;
   }
   lastContacts[i]=f.contact;
   if(s.mode==='walk'&&f.planted){contactFrames++;if(!anchors[i]||anchors[i].contact!==f.contact)anchors[i]={p,yaw:f.yaw,contact:f.contact};maxSlide=Math.max(maxSlide,Math.hypot(p[0]-anchors[i].p[0],p[2]-anchors[i].p[2]));maxYawSlip=Math.max(maxYawSlip,Math.abs(Math.atan2(Math.sin(f.yaw-anchors[i].yaw),Math.cos(f.yaw-anchors[i].yaw))));}
   else {if(anchors[i]&&s.mode==='walk')liftoffs[i]++;anchors[i]=null;}
  }
  // One support change is one step. Root travel between real touchdown contact
  // changes and half the same foot's next touchdown span both measure stride;
  // discard the shortened initial steps when checking the restored .28 cap.
  const rootStrides=touchdowns.slice(3).map((p,i)=>Math.hypot(p.root[0]-touchdowns[i+2].root[0],p.root[1]-touchdowns[i+2].root[1]));
  const median=values=>values.length?[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]:0;
  return {contactFrames,maxSlide,maxYawSlip,minFoot,liftoffs,heights,rootStride:median(rootStrides),sameFootStride:median(sameFootStrides.slice(2)),touchdowns:touchdowns.length,maxPelvisSpeed,steadyPelvisSpeed};
 };
 const wholeBody=samples=>{
  const steady=samples.filter(s=>s.mode==='walk'&&s.time-samples[0].time>.35),range=read=>{const values=steady.map(read);return Math.max(...values)-Math.min(...values);};
  assert(steady.length>20,'whole-body measurements cover several real walking cycles');
  const correlation=(a,b)=>{const mean=v=>v.reduce((sum,x)=>sum+x,0)/v.length,ma=mean(a),mb=mean(b);let cross=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;cross+=x*y;aa+=x*x;bb+=y*y;}return cross/Math.sqrt(Math.max(1e-16,aa*bb));};
  const counterSwing=[0,1].map(i=>correlation(steady.map(s=>s.upperBody.elbows[i][2]),steady.map(s=>s.feet[1-i].local[2])));
  const correlate=(a,b)=>correlation(steady.map(a),steady.map(b));
  return {chestTwist:range(s=>s.upperBody.chest[1]),chestRoll:range(s=>s.upperBody.chest[2]),hipTwist:range(s=>s.upperBody.hips[1]),headTwist:range(s=>s.upperBody.head[1]),shoulderTravel:[0,1].map(i=>range(s=>s.upperBody.shoulders[i][2])),elbowTravel:[0,1].map(i=>range(s=>s.upperBody.elbows[i][2])),handTravel:[0,1].map(i=>range(s=>s.upperBody.hands[i][2])),counterSwing,oppositeElbows:correlate(s=>s.upperBody.elbows[0][2],s=>s.upperBody.elbows[1][2]),oppositeHands:correlate(s=>s.upperBody.hands[0][2],s=>s.upperBody.hands[1][2]),oppositeChestHips:correlate(s=>s.upperBody.chest[1],s=>s.upperBody.hips[1])};
 };
 const expressive=expression=>{
  assert(expression.chestTwist>.12&&expression.chestRoll>.06&&expression.hipTwist>.035,JSON.stringify(expression));
  assert(expression.shoulderTravel.every(v=>v>.03)&&expression.elbowTravel.every(v=>v>.10)&&expression.handTravel.every(v=>v>.10),JSON.stringify(expression));
  assert(expression.oppositeElbows<-.95&&expression.oppositeHands<-.90&&expression.oppositeChestHips<-.95,JSON.stringify(expression));
  assert(expression.headTwist<.04,'the neck keeps the gaze steadier than the turning chest: '+JSON.stringify(expression));
 };
 const visible=samples=>{for(const s of samples){for(const foot of s.feet)assert(foot.screen.visible&&foot.screen.x>8&&foot.screen.x<1092&&foot.screen.y>85&&foot.screen.y<705,JSON.stringify({time:s.time,foot:foot.screen}));assert(s.topScreen.visible&&s.topScreen.x>8&&s.topScreen.x<1092&&s.topScreen.y>85,JSON.stringify({time:s.time,top:s.topScreen}));}};
 const walking=[];
 for(const [name,input] of [['forward',{z:1}],['strafe',{x:1}],['backward',{z:-1}]]){
  const result=await page.evaluate(({input})=>{window.locomotionReset();return window.locomotionRun(input,2);},{input}),a=analyze(result.samples);
  const travel=Math.hypot(result.x,result.z);assert(Math.abs(travel-result.move*.45*2)<.002,JSON.stringify({name,travel,move:result.move}));
  assert(result.samples.some(s=>s.mode==='walk'),name);assert(a.contactFrames>100&&a.liftoffs.every(n=>n>=2),JSON.stringify({name,...a}));
  assert(a.heights.every(h=>h>.05)&&a.minFoot>=.032,JSON.stringify({name,...a}));assert(a.maxSlide<.001&&a.maxYawSlip<.002,JSON.stringify({name,...a}));
  assert(a.rootStride>.17&&a.rootStride<.30&&a.sameFootStride>.17&&a.sameFootStride<.30,JSON.stringify({name,...a}));
  const expression=wholeBody(result.samples);if(name==='forward')expressive(expression);
  await page.screenshot({path:`charge-artifacts/locomotion-${name}.png`});walking.push({name,travel,move:result.move,...a,expression});
 }
 const stopped=await page.evaluate(()=>window.locomotionRun({},.75)),tail=stopped.samples.slice(-24);
 assert(tail.every(s=>s.mode==='idle'),JSON.stringify(tail.map(s=>s.mode)));
 for(let i=0;i<2;i++){const p=tail[0].feet[i].position;assert(tail.every(s=>Math.hypot(s.feet[i].position[0]-p[0],s.feet[i].position[2]-p[2])<.003));}
 await page.screenshot({path:'charge-artifacts/locomotion-stopped.png'});
 // This lane is beside the central north/south blocks, leaving enough clear
 // runway for boost → faster walking → authored sword advance.
 const dash=await page.evaluate(()=>{window.locomotionReset('knight',3);return window.locomotionRun({z:1,dashPressed:true},.15);});
 assert(dash.samples.every(s=>s.dash>0&&s.mode==='dash'),JSON.stringify(dash.samples));assert(dash.z/.15>dash.move*1.5,JSON.stringify(dash));
 const dashAnkles=dash.samples.map(s=>s.feet.map(f=>f.position[1]));assert(Math.max(...dashAnkles.flat())-Math.min(...dashAnkles.flat())<.07,JSON.stringify(dashAnkles));
 await page.screenshot({path:'charge-artifacts/locomotion-boost-dash.png'});
 const afterDash=await page.evaluate(()=>window.locomotionRun({z:1},.8));assert(afterDash.samples.slice(-20).every(s=>s.mode==='walk'));
 const attack=await page.evaluate(()=>{
  const b=window.locomotionApp.battle;if(!b.attack(b.human))throw Error('Walking-to-attack fixture failed to attack');return window.locomotionRun({},.10);
 });
 assert(attack.samples.every(s=>s.attack&&s.mode==='pose'),JSON.stringify(attack.samples));await page.screenshot({path:'charge-artifacts/locomotion-walk-to-sword.png'});
 // Walk back into the middle of the clear lane after the authored advance.
 const afterAttack=await page.evaluate(()=>window.locomotionRun({z:-1},1));assert(afterAttack.samples.slice(-20).every(s=>s.mode==='walk'),JSON.stringify(afterAttack.samples.slice(-20)));
 // Check the same real mesh contacts on the other articulated frame geometries.
 const frames=[];for(const frame of ['strider','wild','brawler']){
  const result=await page.evaluate(frame=>{window.locomotionReset(frame);return window.locomotionRun({z:1},1.5);},frame),a=analyze(result.samples);
  assert(a.contactFrames>60&&a.liftoffs.every(n=>n>=1)&&a.maxSlide<.001&&a.minFoot>=.032,JSON.stringify({frame,...a}));const expression=wholeBody(result.samples);expressive(expression);frames.push({frame,...a,expression});await page.screenshot({path:`charge-artifacts/locomotion-${frame}.png`});
 }
 // The video runs through the application's own fixed-step loop. The wrapper
 // supplies only a world direction and a stop at a simulation-time checkpoint;
 // normal Battle.tick and normal Renderer frames determine the visible motion.
 assert.equal(await page.evaluate(()=>window.locomotionApp.frameError||null),null);await page.close();
 const review=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});review.on('pageerror',e=>errors.push(e.message));
 await review.goto('http://127.0.0.1:4173');await review.locator('.home-copy').waitFor();await review.evaluate(installFixture);
 await review.evaluate(()=>{
  const b=window.locomotionReset('knight',3),u=b.human;Object.assign(u,{z:-2.7,target:null});delete window.locomotionApp.renderer.robots.get(u.id).locomotion;window.locomotionCamera={position:[9.2,1.6,0],target:[3,.48,0]};window.locomotionApp.renderer.render(b,1/60,b.time);
  const tick=b.tick.bind(b);window.locomotionVideoSamples=[];window.locomotionVideoDone=false;let previous=-1;
  b.tick=(dt)=>{if(b.paused)return;const moving=b.time<3;tick(dt,{x:0,z:moving?1:0});if(b.time!==previous){window.locomotionVideoSamples.push(window.locomotionSample());previous=b.time;}if(b.time>=3.8){b.paused=true;window.locomotionVideoDone=true;}};
  const hud=app=>{const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`歩行 → 停止 · SIM ${b.time.toFixed(2)} s · ${b.time<3?(u.stats.move*.45).toFixed(2):'0.00'} m/s`;};
  const update=window.locomotionApp.hudUpdate.bind(window.locomotionApp);window.locomotionApp.hudUpdate=()=>{update();hud(window.locomotionApp);};b.paused=false;
 });
 await review.waitForFunction(()=>window.locomotionVideoDone,{},{timeout:60000});
 const videoResult=await review.evaluate(()=>({samples:window.locomotionVideoSamples,fault:window.locomotionApp.frameError?String(window.locomotionApp.frameError.error||window.locomotionApp.frameError):null,lost:!!window.locomotionApp.renderer.contextLost,calls:window.locomotionApp.renderer.renderer.info.render.calls}));
 assert(videoResult.samples.length>100);assert.equal(videoResult.fault,null);assert.equal(videoResult.lost,false);assert(videoResult.calls>0);assert.deepEqual(errors,[]);
 visible(videoResult.samples);
 const videoAnalysis=analyze(videoResult.samples);assert(videoAnalysis.maxSlide<.001,JSON.stringify(videoAnalysis));await review.screenshot({path:'charge-artifacts/locomotion-fixed-side-stop.png'});
 const video=review.video();await review.close();await video.saveAs('charge-artifacts/locomotion-fixed-side-review.webm');
 // A front three-quarter camera also exposes the shoulder counter-swing and
 // chest/hip separation. This is a finite-resource gameplay transition with a
 // real hit, not a preview pose replay or independently advanced animation.
 const expressionReview=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});expressionReview.on('pageerror',e=>errors.push(e.message));
 await expressionReview.goto('http://127.0.0.1:4173');await expressionReview.locator('.home-copy').waitFor();await expressionReview.evaluate(installFixture);
 await expressionReview.evaluate(()=>{
  const app=window.locomotionApp,b=window.locomotionReset('knight',3),u=b.human,v=b.entities[1];Object.assign(u,{z:-1.8,target:v.id});Object.assign(v,{x:3,z:6.2});delete app.renderer.robots.get(u.id).locomotion;
  window.locomotionCamera={position:[7.5,1.6,3.8],target:[3,.48,0]};app.renderer.render(b,1/60,b.time);
  const tick=b.tick.bind(b);window.locomotionExpressionSamples=[];window.locomotionExpressionDone=false;window.locomotionExpressionAttack=null;let previous=-1;
  b.tick=dt=>{
   if(b.paused)return;
   if(!window.locomotionExpressionAttack){if(b.time<1.65){Object.assign(v,{x:u.x,z:u.z+8});u.target=v.id;}else{Object.assign(v,{x:u.x,z:u.z+.8,yaw:Math.PI,target:u.id});if(!b.attack(u))throw Error('Whole-body walking-to-attack did not start');window.locomotionExpressionAttack={at:b.time,lp:v.lp,dealt:u.dealt,charge:u.attack.charge,combo:u.attack.combo};}}
   tick(dt,{x:0,z:b.time<1.3?1:0});
   if(b.time!==previous){window.locomotionExpressionSamples.push(window.locomotionSample());previous=b.time;}
   if(b.time>=3.5){b.paused=true;window.locomotionExpressionDone=true;}
  };
  const update=app.hudUpdate.bind(app);app.hudUpdate=()=>{update();const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`歩行 → 停止 → ソード攻撃 · SIM ${b.time.toFixed(2)} s`;};b.paused=false;
 });
 await expressionReview.waitForFunction(()=>window.locomotionExpressionDone,{},{timeout:60000});
 const expressionResult=await expressionReview.evaluate(()=>({samples:window.locomotionExpressionSamples,attack:window.locomotionExpressionAttack,damage:window.locomotionExpressionAttack?.lp-window.locomotionApp.battle.entities[1].lp,dealt:window.locomotionApp.battle.human.dealt,fault:window.locomotionApp.frameError?String(window.locomotionApp.frameError.error||window.locomotionApp.frameError):null,lost:!!window.locomotionApp.renderer.contextLost,calls:window.locomotionApp.renderer.renderer.info.render.calls,infinite:window.locomotionApp.battle.training.infinite}));
 assert(expressionResult.samples.length>100);assert.equal(expressionResult.fault,null);assert.equal(expressionResult.lost,false);assert.equal(expressionResult.infinite,false);assert(expressionResult.calls>0);assert.deepEqual(errors,[]);
 assert(expressionResult.attack&&expressionResult.attack.charge===0&&expressionResult.attack.combo===0&&expressionResult.damage>0&&expressionResult.dealt>expressionResult.attack.dealt,JSON.stringify(expressionResult.attack));
 assert(expressionResult.samples.some(s=>s.mode==='walk')&&expressionResult.samples.some(s=>s.mode==='idle')&&expressionResult.samples.some(s=>s.mode==='pose'&&s.attack));visible(expressionResult.samples);
 const expressionWalking=wholeBody(expressionResult.samples),expressionContacts=analyze(expressionResult.samples);expressive(expressionWalking);assert(expressionContacts.maxSlide<.001,JSON.stringify(expressionContacts));
 const cut=expressionResult.samples.filter(s=>s.attack&&s.attackPhase>.10&&s.attackPhase<.70),cutRange=read=>{const values=cut.map(read);return Math.max(...values)-Math.min(...values);};assert(cut.length>12,'gameplay recording samples the real sword preparation and follow-through');
 const expressionSword={chestTwist:cutRange(s=>s.upperBody.chest[1]),hipTwist:cutRange(s=>s.upperBody.hips[1]),headTwist:cutRange(s=>s.upperBody.head[1]),freeElbowTravel:Math.hypot(...[0,1,2].map(axis=>cutRange(s=>s.upperBody.elbows[1][axis])))};assert(expressionSword.chestTwist>.6&&expressionSword.hipTwist>.35&&expressionSword.freeElbowTravel>.08,JSON.stringify(expressionSword));
 await expressionReview.screenshot({path:'charge-artifacts/locomotion-three-quarter-recovered.png'});const expressionVideo=expressionReview.video();await expressionReview.close();await expressionVideo.saveAs('charge-artifacts/locomotion-three-quarter-walk-sword.webm');
 console.log('Locomotion browser passed: actual finite Battle movement at ground walking speed, planted mesh contacts and lift-off forward/strafe/backward, measured whole-body participation, stable stop, boost glide, dash/attack return to walking, four leg frames, fixed-world side and three-quarter gameplay videos with a real sword hit. '+JSON.stringify({walking,dashSpeed:dash.z/.15,frames,videoAnalysis,expressionWalking,expressionContacts,expressionSword,expressionHit:{attack:expressionResult.attack,damage:expressionResult.damage}}));
}catch(e){console.error(e);if(browser)for(const page of browser.contexts().flatMap(c=>c.pages())){console.error('Page state:',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'charge-artifacts/locomotion-failure.png'}).catch(()=>{});}process.exitCode=1;
}finally{await browser?.close();server.kill();}})();
