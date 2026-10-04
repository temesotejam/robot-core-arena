const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');

// Compare the real standing model against a specific previous source commit.
// Both versions use the same lights, floor and fixed cameras, with no HUD,
// attack, trail or effect. After also covers every interchangeable frame.
const root=path.resolve(__dirname,'..'),kind=process.argv.find(a=>a.startsWith('--weapon='))?.split('=')[1]||'hammer',
 before=process.argv.find(a=>a.startsWith('--before='))?.split('=')[1],output=process.env.MELEE_READY_OUTPUT||'/tmp/melee-ready-preview';
assert(/^[a-f0-9]{40}$/.test(before),'Provide an exact --before commit');
fs.mkdirSync(output,{recursive:true});
const archive=fs.mkdtempSync('/tmp/melee-before-');
execFileSync('tar',['-x','-C',archive],{input:execFileSync('git',['archive',before],{cwd:root,maxBuffer:20*1024*1024})});
const report={before,after:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),kind,captures:[],errors:[]},servers=[];
let browser;
(async()=>{
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--no-zygote','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  for(const [version,source,port,frames]of [['before',archive,4175,['knight']],['after',root,4176,['knight','strider','wild','brawler','panzer']]]){
   servers.push(spawn(process.execPath,['scripts/serve.mjs'],{cwd:source,env:{...process.env,PORT:String(port)},stdio:'inherit'}));
   for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
   for(const frame of frames){
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.home-copy').waitFor();
    const measurements=await page.evaluate(async({kind,frame})=>{
     const [{app},THREE,{defaultConfig},{PARTS}]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js'),import('/src/customize.js'),import('/src/data.js')]);
     const config=defaultConfig();config.passives=[];config.abilities=[];config.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));config.sets=[0,1].map(()=>({item:'weapon:'+kind,shield:null,separate:false}));
     app.state.units[0]=config;Object.assign(app.state.setup,{allies:1,enemies:1,stage:'flat',duration:0,player:0,training:true});app.startBattle();
     const b=app.battle,u=b.human,r=app.renderer,ref=r.robots.get(u.id);b.paused=true;b.countdown=0;b.training.freezeAI=true;
     Object.assign(u,{x:0,y:0,z:0,yaw:0,vx:0,vz:0,target:null,attack:null,motion:null,charging:false,guard:false});
     app.view='inspection';r.mode='inspection';r.quality('high');r.renderer.setPixelRatio(1);r.resize();
     for(const o of [...r.world.children])if(o!==ref.root)r.world.remove(o);
     const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#15212c',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;r.world.add(floor);
     r.effects.visible=false;r.scene.fog=null;r.camera.fov=35;r.camera.updateProjectionMatrix();
     for(const light of r.scene.children)if(light.isDirectionalLight&&light.castShadow){Object.assign(light.shadow.camera,{left:-2,right:2,top:2,bottom:-2});light.shadow.camera.updateProjectionMatrix();}
     document.querySelectorAll('body > div').forEach(o=>o.style.display='none');r.animateRobot(ref,u,0,(x,z)=>0);ref.root.updateMatrixWorld(true);ref.ring.visible=false;for(const t of ref.weaponTrails)t.mesh.visible=false;
     const w=ref.weaponAttachments[0],head=w.localToWorld(new THREE.Vector3(...(w.userData.strikeCenter||[0,.49,0]))),grip=w.getWorldPosition(new THREE.Vector3()),support=w.localToWorld(new THREE.Vector3(...w.userData.supportGrip));
     const values={head:head.toArray(),grip:grip.toArray(),supportError:support.distanceTo(ref.arms[1].hand.getWorldPosition(new THREE.Vector3())),minLegGeometry:new THREE.Box3().setFromObject(ref.legGroup,true).min.y};
     window.readyImage=view=>{
      // The shared camera must also fit the old horizontal hammer from its
      // near side, including the conservative corners of its full bounds.
      const side=kind==='hammer'?-1:1,cameras={front:[0,1.10,3.30],side:[side*3.30,1.10,0],threequarter:[side*2.4,1.20,2.5],wrists:[-1.0,.84,1.25]};r.camera.position.set(...cameras[view]);r.camera.lookAt(...(view==='wrists'?[-.17,.55,.22]:[0,.60,0]));r.camera.updateMatrixWorld(true);
      const box=new THREE.Box3();ref.root.traverse(o=>{
       if(!o.isMesh||!o.visible||o===ref.ring||ref.weaponTrails.some(t=>t.mesh===o))return;
       if(view==='wrists'){let p=o;for(;p&&!ref.arms.includes(p);p=p.parent)if(ref.weaponAttachments.includes(p))return;if(!p)return;}
       box.expandByObject(o);
      });
      let clipped=false;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(r.camera);if(Math.abs(p.x)>.97||Math.abs(p.y)>.97)clipped=true;}
      r.renderer.render(r.scene,r.camera);return {pixels:r.canvas.toDataURL('image/png').split(',')[1],clipped,glError:r.renderer.getContext().getError(),contextLost:!!r.contextLost};
     };
     return values;
    },{kind,frame});
    assert(measurements.supportError<.005);if(version==='after')assert(measurements.minLegGeometry>=-1e-7);
    for(const view of ['front','side','threequarter',...(kind==='hammer'?['wrists']:[])]){
     const result=await page.evaluate(view=>window.readyImage(view),view);
     report.lastCapture={version,frame,view,clipped:result.clipped,glError:result.glError,contextLost:result.contextLost};
     assert.equal(result.clipped,false,`${version}/${frame}/${view}: model bounds leave the image`);assert.equal(result.glError,0);assert.equal(result.contextLost,false);
     const name=`${version}-${frame}-${view}.png`,bytes=Buffer.from(result.pixels,'base64');fs.writeFileSync(path.join(output,name),bytes);
     report.captures.push({version,frame,view,name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...measurements});
    }
    await page.close();
   }
  }
  assert.deepEqual(report.errors,[]);report.ok=true;console.log(JSON.stringify({ok:true,captures:report.captures.length,output}));
 }catch(error){report.ok=false;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(output,'review.json'),JSON.stringify(report,null,2));await browser?.close();for(const server of servers)server.kill();}
})();
