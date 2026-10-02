export const REGIONS={
 main:{name:'メイン L',width:6,height:8,cells:Array.from({length:48},(_,i)=>[i%6,Math.floor(i/6)]).filter(([x,y])=>y!==0||(x!==0&&x!==5))},
 head:{name:'頭 MG',width:6,height:2,cells:[[1,0],[2,0],[3,0],[4,0],...[0,1,2,3,4,5].map(x=>[x,1])]},
 bodyLeft:{name:'胴 左 MG',width:3,height:3,cells:[[1,0],[2,0],[0,1],[1,1],[1,2]]},
 bodyRight:{name:'胴 右 MG',width:3,height:3,cells:[[0,0],[1,0],[1,1],[2,1],[1,2]]},
 rightArm:{name:'右腕 MG',width:2,height:5,cells:Array.from({length:10},(_,i)=>[i%2,Math.floor(i/2)]).filter(([x,y])=>y!==0||x!==0)},
 leftArm:{name:'左腕 MG',width:2,height:5,cells:Array.from({length:10},(_,i)=>[i%2,Math.floor(i/2)]).filter(([x,y])=>y!==0||x!==1)},
 legs:{name:'脚 MG',width:8,height:2,cells:[[0,0],[7,0],...[0,1,2,3,4,5,6,7].map(x=>[x,1])]},
};
const key=([x,y])=>`${x},${y}`;
export function normalizeShape(shape){const minX=Math.min(...shape.map(p=>p[0])),minY=Math.min(...shape.map(p=>p[1]));return shape.map(([x,y])=>[x-minX,y-minY]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);}
export function rotateShape(shape,rotation=0){let s=normalizeShape(shape);for(let i=0;i<((rotation%4)+4)%4;i++)s=normalizeShape(s.map(([x,y])=>[-y,x]));return s;}
export function canonicalShape(shape){return [0,1,2,3].map(r=>JSON.stringify(rotateShape(shape,r))).sort()[0];}
export function connected(shape){if(!shape?.length)return false;const all=new Set(shape.map(key)),seen=new Set([key(shape[0])]),queue=[shape[0]];for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const p of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])if(all.has(key(p))&&!seen.has(key(p))){seen.add(key(p));queue.push(p);}}return seen.size===all.size&&all.size===shape.length;}
export function placementCells(placement,item){return rotateShape(item.shape,placement.rotation).map(([x,y])=>[x+placement.x,y+placement.y]);}
export function occupied(placements,getItem,exclude=null){const result={};for(const p of placements){if(p.uid===exclude)continue;const item=getItem(p.item);if(!item?.shape)continue;result[p.region]??=new Set();for(const cell of placementCells(p,item))result[p.region].add(key(cell));}return result;}
export function canPlace(item,region,x,y,rotation,placements=[],getItem=()=>null,exclude=null){
 if(!item?.shape)return {ok:false,reason:'配置するパーツを選んでください'};
 if(!REGIONS[region])return {ok:false,reason:'配置先がありません'};
 if(region!=='main'&&item.category!=='aux')return {ok:false,reason:'サブ領域は補助パーツ専用です'};
 const valid=new Set(REGIONS[region].cells.map(key)),used=occupied(placements,getItem,exclude)[region]||new Set();
 for(const [dx,dy]of rotateShape(item.shape,rotation)){const c=key([x+dx,y+dy]);if(!valid.has(c))return {ok:false,reason:'領域の外にはみ出します'};if(used.has(c))return {ok:false,reason:'他のパーツと重なります'};}
 return {ok:true,reason:'配置できます'};
}
export function findPlacement(item,placements,getItem,region=null){for(const r of region?[region]:item.category==='aux'?Object.keys(REGIONS):['main'])for(let rot=0;rot<4;rot++)for(const [x,y]of REGIONS[r].cells)if(canPlace(item,r,x,y,rot,placements,getItem).ok)return {region:r,x,y,rotation:rot};return null;}
export function pack(items,{maxNodes=35000}={}){
 const ordered=items.map((item,index)=>({item,index})).sort((a,b)=>(a.item.category==='aux')-(b.item.category==='aux')||b.item.shape.length-a.item.shape.length);
 const used=Object.fromEntries(Object.keys(REGIONS).map(r=>[r,new Set()])),valid=Object.fromEntries(Object.entries(REGIONS).map(([r,d])=>[r,new Set(d.cells.map(key))]));let nodes=0;const result=[];
 function visit(i){if(i===ordered.length)return true;if(++nodes>maxNodes)return false;const {item,index}=ordered[i],shapes=[...new Map([0,1,2,3].map(rotation=>[JSON.stringify(rotateShape(item.shape,rotation)),{rotation,shape:rotateShape(item.shape,rotation)}])).values()];
  const rs=item.category==='aux'?['head','bodyLeft','bodyRight','rightArm','leftArm','legs','main']:['main'];
  for(const region of rs)for(const {shape,rotation}of shapes)for(const [x,y]of REGIONS[region].cells){const cells=shape.map(([dx,dy])=>key([dx+x,dy+y]));if(cells.some(c=>!valid[region].has(c)||used[region].has(c)))continue;cells.forEach(c=>used[region].add(c));result.push({item:item.id,uid:`p${index}`,region,x,y,rotation});if(visit(i+1))return true;result.pop();cells.forEach(c=>used[region].delete(c));}
  return false;
 }
 return visit(0)?result:null;
}
export function randomShape(size,rng=Math.random){for(let attempt=0;attempt<100;attempt++){let cells=[[0,0]],used=new Set(['0,0']);while(cells.length<size){const [x,y]=cells[Math.floor(rng()*cells.length)],d=[[1,0],[-1,0],[0,1],[0,-1]][Math.floor(rng()*4)],p=[x+d[0],y+d[1]];if(!used.has(key(p))){used.add(key(p));cells.push(p);}}cells=normalizeShape(cells);if(findPlacement({category:'cpu',shape:cells},[],()=>null,'main'))return cells;}throw new Error('形状を生成できませんでした');}
export function validateGrid(placements,getItem){const errors=[];const counts={cpu:0,memory:0,motor:0,battery:0};const seen=new Set();for(const p of placements){if(seen.has(p.uid))errors.push('配置IDが重複しています');seen.add(p.uid);const item=getItem(p.item);if(!item?.shape){errors.push('配置パーツが見つかりません');continue;}if(item.category in counts)counts[item.category]++;const v=canPlace(item,p.region,p.x,p.y,p.rotation,placements.filter(q=>q!==p),getItem);if(!v.ok)errors.push(`${item.name}: ${v.reason}`);}
 for(const [cat,n]of Object.entries(counts))if(n===0)errors.push(`${{cpu:'CPU',memory:'メモリ',motor:'モーター',battery:'バッテリー'}[cat]}未搭載`);for(const cat of ['cpu','memory'])if(counts[cat]>1)errors.push(`${cat==='cpu'?'CPU':'メモリ'}は1個まで`);return [...new Set(errors)];}
