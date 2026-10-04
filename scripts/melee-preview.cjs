const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');

// Record one finite-resource Battle at the production 60 Hz simulation step.
// Only tap/release input is generated. Damage, hit-gated continuation, motion
// inheritance, support feet and target recovery are the ordinary game code.
// Replay the saved model transforms without changing or interpolating a pose.
const root=path.resolve(__dirname,'..');
const kind=process.argv.find(a=>a.startsWith('--weapon='))?.split('=')[1]||'lance';
const charged=process.argv.includes('--charge');
const output=process.env.MELEE_PREVIEW_OUTPUT||'/tmp/melee-preview';
const deliverables=path.join(output,'deliverables');
const port=Number(process.env.MELEE_PREVIEW_PORT||4173);
const views=['side','threequarter'];
fs.mkdirSync(deliverables,{recursive:true});
const hashes=()=>Object.fromEntries(fs.readdirSync(path.join(root,'src')).filter(f=>/\.(js|css)$/.test(f)).sort().map(f=>['src/'+f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src',f))).digest('hex')]));
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:hashes(),fps:60,views,errors:[]};
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'inherit'});
let browser;

(async()=>{
 try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--no-zygote','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  report.browser=browser.version();
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.home-copy').waitFor();
  const recording=await page.evaluate(async({kind,charged})=>{
   const [{app},THREE,{defaultConfig},{sampleMotion}]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js'),import('/src/customize.js'),import('/src/motion.js')]);
   const config=defaultConfig();config.passives=[];config.abilities=[];config.sets=[0,1].map(()=>({item:'weapon:'+kind,shield:'shield:basic',separate:false}));
   app.state.units[0]=config;app.state.enemies[0]=defaultConfig(0,true);app.state.enemies[0].passives=[];app.state.enemies[0].abilities=[];
   Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();
   const b=app.battle,u=b.human,v=b.entities[1],r=app.renderer,ref=r.robots.get(u.id);
   b.paused=true;b.countdown=0;b.training.freezeAI=true;b.rng=()=>.99;
   Object.assign(u,{x:0,z:0,yaw:0,target:v.id});Object.assign(v,{x:0,z:.9,yaw:Math.PI});
   // Stop the application clock before the deterministic diagnostic, so its
   // rAF loop cannot double-advance the Battle or alter a replayed model.
   app.view='inspection';r.mode='inspection';r.quality('high');r.renderer.setPixelRatio(1);r.resize();
   const data={frames:[],starts:[],hits:[],minFoot:Infinity,maxFK:0,maxGrip:0,maxPlantedDrift:0,};
   const nodes=[];ref.root.traverse(o=>nodes.push(o));
   const anchors=[null,null],point=o=>o.getWorldPosition(new THREE.Vector3());
   const attack=b.attack.bind(b);b.attack=(unit,charge=0,input={})=>{const ok=attack(unit,charge,input);if(ok&&unit===u)data.starts.push({id:u.attack.id,combo:u.attack.combo,charge,time:b.time});return ok;};
   const stages=charged?1:u.stats.weapon.combo,holdFrames=charged?Math.ceil(b.maxCharge(u)*60)+1:1;
   let pressing=false,held=0,ended=null;
   b.paused=false;
   for(let frame=0;frame<600;frame++){
    const rt=b.runtime(u),a=u.attack,input={};
    const first=frame>=30&&!data.starts.length&&!a&&!u.motion&&held<holdFrames;
    const follow=a&&a.combo<stages-1&&u.comboHit&&!u.queuedAttack&&rt.cooldown<=.14&&rt.cooldown>0;
    if(charged){if(first){input.attack=true;held++;}}
    else if(pressing)pressing=false;else if(first||follow){input.attack=true;pressing=true;held++;}
    b.tick(1/60,input);
    for(const e of b.consumeEvents())if(e.type==='hit'&&e.attacker===u.id)data.hits.push({time:b.time,combo:u.attack?.combo,damage:e.damage});
    r.animateRobot(ref,u,b.time,(x,z)=>b.groundAt(x,z));ref.root.updateMatrixWorld(true);
    const current=u.attack,motion=sampleMotion(kind,current||u.motion,{legFrame:ref.legFrame});
    for(const [i,leg]of ref.feet.entries()){
     data.minFoot=Math.min(data.minFoot,new THREE.Box3().setFromObject(leg.foot).min.y);
     const position=point(leg.foot),supported=!!current&&(motion.feet[i][1]<=.035+1e-8);
     if(supported){if(anchors[i]?.id===current.id)data.maxPlantedDrift=Math.max(data.maxPlantedDrift,position.distanceTo(anchors[i].position));else anchors[i]={id:current.id,position};}else anchors[i]=null;
    }
    for(const [i,arm]of ref.arms.entries()){
     data.maxFK=Math.max(data.maxFK,arm.upper.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(point(arm.elbow)),arm.lower.localToWorld(new THREE.Vector3(0,-.195,0)).distanceTo(point(arm.hand)));
     data.maxGrip=Math.max(data.maxGrip,point(ref.weaponAttachments[i]).distanceTo(point(arm.hand)));
    }
    data.frames.push({time:b.time,combo:current?.combo??null,p:current?current.elapsed/current.duration:null,model:nodes.map(o=>({p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray(),visible:o.visible}))});
    if(data.starts.length===stages&&!u.attack&&!u.motion){ended??=b.time;if(b.time-ended>=.5)break;}
   }
   b.paused=true;
   data.targetLP=v.lp;data.initialTargetLP=v.stats.lp;data.damage=u.dealt;data.tension=u.tension;data.infinite=b.training.infinite;data.frameCount=data.frames.length;data.stages=stages;data.charged=charged;data.kind=kind;
   // Only the actor, a plain floor and physical shadow remain in the video.
   for(const o of [...r.world.children])if(o!==ref.root)r.world.remove(o);
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#15212c',metalness:.05,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;r.world.add(floor);
   r.effects.visible=false;r.scene.fog=null;r.camera.fov=35;r.camera.updateProjectionMatrix();
   for(const light of r.scene.children)if(light.isDirectionalLight&&light.castShadow){light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.camera.updateProjectionMatrix();}
   document.querySelectorAll('body > div').forEach(o=>o.style.display='none');
   const setFrame=frame=>{for(const [i,node]of nodes.entries()){const t=frame.model[i];node.position.fromArray(t.p);node.quaternion.fromArray(t.q);node.scale.fromArray(t.s);node.visible=t.visible;}ref.root.updateMatrixWorld(true);};
   const modelBox=()=>{const box=new THREE.Box3();for(const node of nodes)if(node.isMesh&&node.visible&&node!==ref.ring&&!ref.weaponTrails.some(t=>t.mesh===node))box.expandByObject(node);return box;};
   const bounds=new THREE.Box3();for(const frame of data.frames){setFrame(frame);bounds.union(modelBox());}
   const target=bounds.getCenter(new THREE.Vector3()),cameras={};
   for(const [view,offset]of Object.entries({side:[1,.20,0],threequarter:[.85,.23,1]})){
    const axis=new THREE.Vector3(...offset).normalize();let distance=2.6;
    for(let attempt=0;attempt<100;attempt++,distance*=1.02){
     r.camera.position.copy(target).addScaledVector(axis,distance);r.camera.lookAt(target);r.camera.updateMatrixWorld(true);
     const corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z).project(r.camera));
     if(corners.every(p=>Math.abs(p.x)<.90&&Math.abs(p.y)<.90)){cameras[view]=r.camera.position.toArray();break;}
    }
    if(!cameras[view])throw Error('Could not frame the full weapon and feet');
   }
   data.captureBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};data.cameras=cameras;
   let maxReplayError=0,croppedFrames=0;
   window.meleeReplay=(index,view)=>{
    const frame=data.frames[index];for(const [i,node]of nodes.entries()){const t=frame.model[i];node.position.fromArray(t.p);node.quaternion.fromArray(t.q);node.scale.fromArray(t.s);node.visible=t.visible;maxReplayError=Math.max(maxReplayError,...node.position.toArray().map((v,j)=>Math.abs(v-t.p[j])),...node.quaternion.toArray().map((v,j)=>Math.abs(v-t.q[j])),...node.scale.toArray().map((v,j)=>Math.abs(v-t.s[j])));}
    ref.ring.visible=false;for(const t of ref.weaponTrails)t.mesh.visible=false;
    r.camera.position.set(...cameras[view]);r.camera.lookAt(target);r.camera.updateMatrixWorld(true);ref.root.updateMatrixWorld(true);
    const box=new THREE.Box3();for(const node of nodes)if(node.isMesh&&node.visible&&!node.name.includes('trail')&&node!==ref.ring&&!ref.weaponTrails.some(t=>t.mesh===node))box.expandByObject(node);
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(r.camera);if(Math.abs(p.x)>.97||Math.abs(p.y)>.97){croppedFrames++;break;}}
    r.renderer.render(r.scene,r.camera);return r.canvas.toDataURL('image/png').split(',')[1];
   };
   window.meleeReplayReport=()=>({maxReplayError,croppedFrames,glError:r.renderer.getContext().getError(),contextLost:!!r.contextLost});
   const picks=[];for(let combo=0;combo<stages;combo++)for(const phase of [.22,.38,.50,.67,.88]){let index=-1,best=Infinity;data.frames.forEach((f,i)=>{if(f.combo===combo&&Math.abs(f.p-phase)<best){index=i;best=Math.abs(f.p-phase);}});if(index>=0)picks.push({combo,phase,index});}
   const {frames,...summary}=data;return {...summary,picks};
  },{kind,charged});
  Object.assign(report,recording);
  const expected=Array.from({length:report.stages},(_,i)=>i);
  assert.deepEqual(report.starts.map(s=>s.combo),expected);assert(report.starts.every(s=>s.charge===(charged?1:0)));
  assert.deepEqual(report.hits.map(s=>s.combo),expected);assert(report.hits.every(s=>s.damage>0));
  assert.equal(report.infinite,false);assert.equal(report.damage,report.initialTargetLP-report.targetLP);assert(report.tension>=0&&report.tension<100);
  assert(report.minFoot>=-.00001&&report.maxFK<1e-6&&report.maxGrip<1e-6&&report.maxPlantedDrift<1e-6);
  for(const view of views){
   const directory=path.join(output,view);fs.mkdirSync(directory,{recursive:true});
   for(let i=0;i<report.frameCount;i++){
    const pixels=await page.evaluate(({index,view})=>window.meleeReplay(index,view),{index:i,view});
    fs.writeFileSync(path.join(directory,`${String(i).padStart(4,'0')}.png`),Buffer.from(pixels,'base64'));
   }
   for(const pick of report.picks)fs.copyFileSync(path.join(directory,`${String(pick.index).padStart(4,'0')}.png`),path.join(deliverables,`${view}-stage${pick.combo+1}-${Math.round(pick.phase*100)}.png`));
   execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','60','-i',path.join(directory,'%04d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p',path.join(output,view+'.mp4')]);
   console.log(JSON.stringify({view,renderedFrames:report.frameCount}));
  }
  const segments=[];
  for(const speed of [1,.5])for(const view of views){
   const file=path.join(output,`${view}-${speed}.mp4`);execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(output,view+'.mp4'),'-vf',`setpts=${1/speed}*PTS,fps=60`,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p',file]);segments.push(file);
  }
  const list=path.join(output,'segments.txt');fs.writeFileSync(list,segments.map(p=>`file '${p}'`).join('\n'));
  const movie=path.join(deliverables,`${kind}-${charged?'charge':'combo'}-motion.mp4`);execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',movie]);
  Object.assign(report,await page.evaluate(()=>window.meleeReplayReport()));
  assert.equal(report.maxReplayError,0);assert.equal(report.croppedFrames,0);assert.equal(report.glError,0);assert.equal(report.contextLost,false);assert.deepEqual(report.errors,[]);assert.deepEqual(hashes(),report.sourceSha256);
  report.videoSha256=crypto.createHash('sha256').update(fs.readFileSync(movie)).digest('hex');report.ok=true;
  console.log(JSON.stringify({ok:true,frameCount:report.frameCount,hits:report.hits.length,damage:report.damage,tension:report.tension,minFoot:report.minFoot,maxPlantedDrift:report.maxPlantedDrift,output:movie}));
 }catch(error){report.ok=false;report.failure=error.stack;console.error(error.stack);process.exitCode=1;
 }finally{fs.writeFileSync(path.join(deliverables,'review.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
})();
