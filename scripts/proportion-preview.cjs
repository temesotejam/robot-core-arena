const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),port=4175,output='/tmp/knuckle-preview/deliverables';
const baseline='78b16ea47a91b1a3b54d84ca8f482cf8ee05c843';
const before=path.join(root,'src','render-before-lbx.js');
const source=fs.readFileSync(path.join(root,'src','render.js'));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(before,execFileSync('git',['show',`${baseline}:src/render.js`],{cwd:root}));
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'inherit'});
const report={baseline,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),renderSha256:crypto.createHash('sha256').update(source).digest('hex'),errors:[],models:[]};
let browser;
(async()=>{
 try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--no-zygote','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:900,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.locator('.home-copy').waitFor();
  await page.evaluate(async()=>{
   const [{app},THREE,current,old,{defaultConfig},{CATALOG,PARTS}]=await Promise.all([import('/src/main.js'),import('/vendor/three.module.min.js'),import('/src/render.js'),import('/src/render-before-lbx.js'),import('/src/customize.js'),import('/src/data.js')]);
   app.view='inspection';const r=app.renderer;r.mode='inspection';r.clear();r.scene.fog=null;r.quality('high');r.renderer.setPixelRatio(1);r.resize();r.effects.visible=false;
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#15212c',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;r.world.add(floor);
   const camera=new THREE.OrthographicCamera(-.68,.68,.68,-.68,.01,100),refs=[];
   document.querySelectorAll('body > div').forEach(o=>o.style.display='none');
   window.proportionFrame=(version,frame,view)=>{
    for(const ref of refs)r.world.remove(ref.root);refs.length=0;
    const module=version==='before'?old:current,c=defaultConfig();c.armor=Object.fromEntries(PARTS.map(p=>[p,`armor:${frame}:${p}`]));c.sets=[0,1].map(()=>({item:'weapon:knuckle',shield:null}));
    const ref=module.createRobot(c,id=>CATALOG[id]);ref.active=0;r.world.add(ref.root);refs.push(ref);
    const u={config:c,active:0,x:0,y:0,z:0,yaw:0,vx:0,vz:0,dashTime:0,grounded:true};module.ArenaRenderer.prototype.animateRobot.call(r,ref,u,0,()=>0);ref.ring.visible=false;ref.root.updateMatrixWorld(true);
    // One scale, floor and light rig for both versions and every frame.
    const cameras={front:[0,.62,4],threequarter:[2.4,1.35,3.6],side:[4,.62,0]};camera.position.set(...cameras[view]);camera.lookAt(0,.53,0);camera.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(ref.root),hips=ref.feet.map(l=>l.getWorldPosition(new THREE.Vector3()).toArray()),feet=ref.feet.filter(l=>l.foot).map(l=>({ankle:l.foot.getWorldPosition(new THREE.Vector3()).toArray(),bottom:new THREE.Box3().setFromObject(l.foot).min.y}));
    let cropped=false;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);if(Math.abs(p.x)>.99||Math.abs(p.y)>.99)cropped=true;}
    r.renderer.render(r.scene,camera);return {pixels:r.canvas.toDataURL('image/png').split(',')[1],bounds:[bounds.min.toArray(),bounds.max.toArray()],hips,feet,cropped,calls:r.renderer.info.render.calls,glError:r.renderer.getContext().getError()};
   };
  });
  for(const version of ['before','after'])for(const frame of ['knight','strider','wild','brawler','panzer'])for(const view of ['front','threequarter','side']){
   const {pixels,...metrics}=await page.evaluate(({version,frame,view})=>window.proportionFrame(version,frame,view),{version,frame,view});
   fs.writeFileSync(path.join(output,`${version}-${frame}-${view}.png`),Buffer.from(pixels,'base64'));report.models.push({version,frame,view,...metrics});
   assert.equal(metrics.cropped,false,`${version}/${frame}/${view} cropped`);assert.equal(metrics.glError,0);assert(metrics.calls>0);assert(metrics.feet.every(f=>f.bottom>=-.000001),'foot enters floor');
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(fs.readFileSync(path.join(root,'src','render.js')),source);report.ok=true;console.log(JSON.stringify({ok:true,models:report.models.length,output}));
 }catch(error){report.ok=false;report.failure=error.stack;console.error(error.stack);process.exitCode=1;
 }finally{fs.writeFileSync(path.join(output,'proportions.json'),JSON.stringify(report,null,2));fs.rmSync(before,{force:true});await browser?.close();server.kill();}
})();
