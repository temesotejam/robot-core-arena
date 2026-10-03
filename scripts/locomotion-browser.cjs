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
  const [{app},{defaultConfig},{Vector3,Quaternion}]=await Promise.all([import('/src/main.js'),import('/src/customize.js'),import('/vendor/three.module.min.js')]);window.locomotionApp=app;
  const draw=app.renderer.renderer.render.bind(app.renderer.renderer);
  window.locomotionCamera={position:[5.8,1.65,0],target:[0,.48,0]};
  // Fix a world camera at the actual WebGL draw: tracking cameras can conceal
  // sliding because both the ground and robot move together on the screen.
  app.renderer.renderer.render=(scene,camera)=>{const c=window.locomotionCamera;camera.position.set(...c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);draw(scene,camera);};
  window.locomotionReset=(frame='knight')=>{
   const c=defaultConfig();c.armor=Object.fromEntries(Object.keys(c.armor).map(p=>[p,`armor:${frame}:${p}`]));c.passives=[];c.abilities=[];c.sets=[0,1].map(()=>({item:'weapon:sword',shield:null,separate:false}));
   app.state.units[0]=c;app.state.enemies[0]=defaultConfig(0,true);app.state.enemies[0].abilities=[];
   Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();const b=app.battle;b.countdown=0;b.paused=true;b.training.freezeAI=true;b.rng=()=>.99;
   const [u,v]=b.entities;Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:8,yaw:Math.PI});window.locomotionCamera={position:[5.8,1.65,0],target:[0,.48,0]};
   app.renderer.render(b,1/60,b.time);app.hudUpdate();return b;
  };
  window.locomotionSample=()=>{
   const b=app.battle,u=b.human,ref=app.renderer.robots.get(u.id);app.renderer.animateRobot(ref,u,b.time);ref.root.updateMatrixWorld(true);
   const gait=ref.locomotion;if(!gait)throw Error('Real renderer has no locomotion state');
   const feet=ref.feet.map((leg,i)=>{const foot=leg.foot||leg,p=foot.getWorldPosition(new Vector3()),q=foot.getWorldQuaternion(new Quaternion()),direction=new Vector3(0,0,1).applyQuaternion(q);return {position:p.toArray(),planted:!!gait.feet?.[i]?.planted,contact:gait.feet?.[i]?.contact,goal:gait.feet?.[i]?.world?.slice(),yaw:Math.atan2(direction.x,direction.z)};});
   return {time:b.time,mode:gait.mode,phase:gait.phase,x:u.x,z:u.z,yaw:u.yaw,dash:u.dashTime,attack:!!u.attack,feet,body:ref.bodyPivot.position.toArray(),tilt:ref.bodyPivot.rotation.x};
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
  const anchors=[null,null],liftoffs=[0,0],heights=[0,0];let contactFrames=0,maxSlide=0,maxYawSlip=0,minFoot=Infinity;
  for(const s of samples)for(let i=0;i<2;i++){
   const f=s.feet[i],p=f.position;assert(p.every(Number.isFinite),JSON.stringify(s));minFoot=Math.min(minFoot,p[1]);heights[i]=Math.max(heights[i],p[1]);
   if(s.mode==='walk'&&f.planted){contactFrames++;if(!anchors[i]||anchors[i].contact!==f.contact)anchors[i]={p,yaw:f.yaw,contact:f.contact};maxSlide=Math.max(maxSlide,Math.hypot(p[0]-anchors[i].p[0],p[2]-anchors[i].p[2]));maxYawSlip=Math.max(maxYawSlip,Math.abs(Math.atan2(Math.sin(f.yaw-anchors[i].yaw),Math.cos(f.yaw-anchors[i].yaw))));}
   else {if(anchors[i]&&s.mode==='walk')liftoffs[i]++;anchors[i]=null;}
  }
  return {contactFrames,maxSlide,maxYawSlip,minFoot,liftoffs,heights};
 };
 const walking=[];
 for(const [name,input] of [['forward',{z:1}],['strafe',{x:1}],['backward',{z:-1}]]){
  const result=await page.evaluate(({input})=>{window.locomotionReset();return window.locomotionRun(input,2);},{input}),a=analyze(result.samples);
  const travel=Math.hypot(result.x,result.z);assert(Math.abs(travel-result.move*.30*2)<.002,JSON.stringify({name,travel,move:result.move}));
  assert(result.samples.some(s=>s.mode==='walk'),name);assert(a.contactFrames>100&&a.liftoffs.every(n=>n>=2),JSON.stringify({name,...a}));
  assert(a.heights.every(h=>h>.05)&&a.minFoot>=.032,JSON.stringify({name,...a}));assert(a.maxSlide<.001&&a.maxYawSlip<.002,JSON.stringify({name,...a}));
  await page.screenshot({path:`charge-artifacts/locomotion-${name}.png`});walking.push({name,travel,move:result.move,...a});
 }
 const stopped=await page.evaluate(()=>window.locomotionRun({},.75)),tail=stopped.samples.slice(-24);
 assert(tail.every(s=>s.mode==='idle'),JSON.stringify(tail.map(s=>s.mode)));
 for(let i=0;i<2;i++){const p=tail[0].feet[i].position;assert(tail.every(s=>Math.hypot(s.feet[i].position[0]-p[0],s.feet[i].position[2]-p[2])<.003));}
 await page.screenshot({path:'charge-artifacts/locomotion-stopped.png'});
 const dash=await page.evaluate(()=>{window.locomotionReset();return window.locomotionRun({z:1,dashPressed:true},.15);});
 assert(dash.samples.every(s=>s.dash>0&&s.mode==='dash'),JSON.stringify(dash.samples));assert(dash.z/.15>dash.move*1.5,JSON.stringify(dash));
 const dashAnkles=dash.samples.map(s=>s.feet.map(f=>f.position[1]));assert(Math.max(...dashAnkles.flat())-Math.min(...dashAnkles.flat())<.07,JSON.stringify(dashAnkles));
 await page.screenshot({path:'charge-artifacts/locomotion-boost-dash.png'});
 const afterDash=await page.evaluate(()=>window.locomotionRun({z:1},.8));assert(afterDash.samples.slice(-20).every(s=>s.mode==='walk'));
 const attack=await page.evaluate(()=>{
  const b=window.locomotionApp.battle;if(!b.attack(b.human))throw Error('Walking-to-attack fixture failed to attack');return window.locomotionRun({},.10);
 });
 assert(attack.samples.every(s=>s.attack&&s.mode==='pose'),JSON.stringify(attack.samples));await page.screenshot({path:'charge-artifacts/locomotion-walk-to-sword.png'});
 // The preceding boost and authored attack advance bring us near the arena's
 // north block. Walk back into clear space to test the animation transition.
 const afterAttack=await page.evaluate(()=>window.locomotionRun({z:-1},1));assert(afterAttack.samples.slice(-20).every(s=>s.mode==='walk'),JSON.stringify(afterAttack.samples.slice(-20)));
 // Check the same real mesh contacts on the other articulated frame geometries.
 const frames=[];for(const frame of ['strider','wild','brawler']){
  const result=await page.evaluate(frame=>{window.locomotionReset(frame);return window.locomotionRun({z:1},1.5);},frame),a=analyze(result.samples);
  assert(a.contactFrames>60&&a.liftoffs.every(n=>n>=1)&&a.maxSlide<.001&&a.minFoot>=.032,JSON.stringify({frame,...a}));frames.push({frame,...a});await page.screenshot({path:`charge-artifacts/locomotion-${frame}.png`});
 }
 // The video runs through the application's own fixed-step loop. The wrapper
 // supplies only a world direction and a stop at a simulation-time checkpoint;
 // normal Battle.tick and normal Renderer frames determine the visible motion.
 assert.equal(await page.evaluate(()=>window.locomotionApp.frameError||null),null);await page.close();
 const review=await browser.newPage({viewport:{width:1100,height:800},recordVideo:{dir:'charge-artifacts',size:{width:1100,height:800}}});review.on('pageerror',e=>errors.push(e.message));
 await review.goto('http://127.0.0.1:4173');await review.locator('.home-copy').waitFor();await review.evaluate(installFixture);
 await review.evaluate(()=>{
  const b=window.locomotionReset(),u=b.human;Object.assign(u,{z:-1.8,target:null});delete window.locomotionApp.renderer.robots.get(u.id).locomotion;window.locomotionCamera={position:[6.0,1.6,0],target:[0,.48,0]};window.locomotionApp.renderer.render(b,1/60,b.time);
  const tick=b.tick.bind(b);window.locomotionVideoSamples=[];window.locomotionVideoDone=false;let previous=-1;
  b.tick=(dt)=>{if(b.paused)return;const moving=b.time<3;tick(dt,{x:0,z:moving?1:0});if(b.time!==previous){window.locomotionVideoSamples.push(window.locomotionSample());previous=b.time;}if(b.time>=3.8){b.paused=true;window.locomotionVideoDone=true;}};
  const hud=app=>{const footer=app.hud.querySelector('.hud-footer>span');if(footer)footer.textContent=`歩行 → 停止 · SIM ${b.time.toFixed(2)} s · ${b.time<3?(u.stats.move*.30).toFixed(2):'0.00'} m/s`;};
  const update=window.locomotionApp.hudUpdate.bind(window.locomotionApp);window.locomotionApp.hudUpdate=()=>{update();hud(window.locomotionApp);};b.paused=false;
 });
 await review.waitForFunction(()=>window.locomotionVideoDone,{},{timeout:60000});
 const videoResult=await review.evaluate(()=>({samples:window.locomotionVideoSamples,fault:window.locomotionApp.frameError?String(window.locomotionApp.frameError.error||window.locomotionApp.frameError):null,lost:!!window.locomotionApp.renderer.contextLost,calls:window.locomotionApp.renderer.renderer.info.render.calls}));
 assert(videoResult.samples.length>100);assert.equal(videoResult.fault,null);assert.equal(videoResult.lost,false);assert(videoResult.calls>0);assert.deepEqual(errors,[]);
 const videoAnalysis=analyze(videoResult.samples);assert(videoAnalysis.maxSlide<.001,JSON.stringify(videoAnalysis));await review.screenshot({path:'charge-artifacts/locomotion-fixed-side-stop.png'});
 const video=review.video();await review.close();await video.saveAs('charge-artifacts/locomotion-fixed-side-review.webm');
 console.log('Locomotion browser passed: actual finite Battle movement at ground walking speed, planted mesh contacts and lift-off forward/strafe/backward, stable stop, boost glide, dash/attack return to walking, four leg frames, fixed-world side video. '+JSON.stringify({walking,dashSpeed:dash.z/.15,frames,videoAnalysis}));
}catch(e){console.error(e);if(browser)for(const page of browser.contexts().flatMap(c=>c.pages())){console.error('Page state:',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'charge-artifacts/locomotion-failure.png'}).catch(()=>{});}process.exitCode=1;
}finally{await browser?.close();server.kill();}})();
