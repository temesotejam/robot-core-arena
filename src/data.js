export const VERSION=1;
export const PARTS=['head','body','rightArm','leftArm','legs'];
export const PART_NAMES={head:'頭',body:'胴体',rightArm:'右腕',leftArm:'左腕',legs:'脚'};
export const PART_SHARE={head:.1,body:.4,rightArm:.15,leftArm:.15,legs:.2};
export const FRAMES={
 knight:{name:'ナイト',lp:1000,df:100,weight:70,move:4,dash:9,airDash:8,jump:1.6,jumps:2,airDashes:1,limit:100,color:'#d1dce6',accent:'#58dccb'},
 strider:{name:'ストライダー',lp:800,df:80,weight:50,move:4.8,dash:11,airDash:10,jump:1.5,jumps:2,airDashes:2,limit:80,color:'#6acdcf',accent:'#b3ffef'},
 wild:{name:'ワイルド',lp:900,df:90,weight:60,move:4.2,dash:9.5,airDash:8.5,jump:1.4,jumps:3,airDashes:1,limit:90,color:'#d3b074',accent:'#ffdd81'},
 brawler:{name:'ブロウラー',lp:1200,df:120,weight:100,move:3.6,dash:8,airDash:7,jump:1.3,jumps:2,airDashes:1,limit:140,color:'#aa9dcc',accent:'#decaff'},
 panzer:{name:'パンツァー',lp:1400,df:140,weight:140,move:2.8,dash:6.5,airDash:5.5,jump:.9,jumps:2,airDashes:1,limit:180,color:'#bd8d77',accent:'#ffba89'},
};
// name / AT / weight / interval / crit / tension / reach / arc / combo / physical / shield
const rows=[
 ['sword','ソード',100,10,.45,.10,10,1.2,100,4,'slash',true],
 ['rapier','レイピア',70,8,.30,.08,8,1.6,35,5,'pierce',true],
 ['dualSword','二刀流',56,14,.24,.05,6,1,110,6,'slash',false],
 ['lance','ランス',150,14,.75,.20,14,2,30,3,'pierce',true],
 ['naginata','ナギナタ',125,16,.65,.12,12,1.8,160,3,'slash',false],
 ['knuckle','ナックル',54,8,.23,.05,6,.8,70,6,'impact',false],
 ['dagger','ダガー',60,5,.25,.07,7,.7,60,5,'slash',true],
 ['hammer','ハンマー',210,25,1.05,.25,18,1.3,110,2,'impact',false],
 ['scythe','サイス',150,18,.80,.15,14,1.7,150,3,'slash',false],
 ['pistol','片手単発銃',110,8,.55,.20,8,18,0,0,'pierce',true],
 ['machinegun','機関銃',24,10,.11,.03,1.5,14,0,0,'pierce',true],
 ['shotgun','片手散弾銃',125,12,.65,.18,12,10,0,0,'impact',true],
 ['dualGun','二丁拳銃',52,16,.24,.06,4,14,0,0,'pierce',false],
 ['rifle','両手単発銃',150,20,.75,.25,12,24,0,0,'pierce',false],
 ['assault','アサルトライフル',34,22,.16,.05,2,22,0,0,'pierce',false],
 ['sniper','狙撃銃',260,25,1.60,.50,20,35,0,0,'pierce',false],
 ['heavyShotgun','両手散弾銃',180,24,.9,.25,16,12,0,0,'impact',false],
 ['bazooka','バズーカ',240,30,1.30,.30,20,20,0,0,'impact',false],
 ['missile','ミサイル',170,28,1.05,.12,14,24,0,0,'impact',false],
];
const ranged={pistol:[80,12,1,.6,1.8,1],machinegun:[65,50,1.3,0,1,1],shotgun:[70,8,1.4,.6,1.5,5],dualGun:[75,15,1.2,0,1,2],rifle:[110,10,1.4,.8,1.8,1],assault:[100,36,1.4,0,1,1],sniper:[180,4,2,1.2,2,1],heavyShotgun:[80,6,1.6,.8,1.5,8],bazooka:[20,4,2,1,1.5,1],missile:[22,5,2,1,1,4]};
export const WEAPONS=Object.fromEntries(rows.map(([id,name,at,weight,interval,crit,tension,range,arc,combo,physical,shield])=>{
 const r=ranged[id];return [id,{id,name,at,weight,interval,crit,tension,range,arc,combo,physical,shield,ranged:!!r,heavy:['hammer','rifle','assault','sniper','heavyShotgun','bazooka','missile'].includes(id),automatic:['machinegun','assault','dualGun'].includes(id),speed:r?.[0]||0,clip:r?.[1]||0,reload:r?.[2]||0,charge:r?.[3]||(['rapier','dualSword','knuckle','dagger'].includes(id)?.6:id==='hammer'?1:.8),chargePower:r?.[4]||1.8,pellets:r?.[5]||(id==='dualSword'?2:1)}];
}));
export const ELEMENTS={none:{name:'無属性',color:'#e0edf4'},fire:{name:'火',color:'#ff965b'},water:{name:'水',color:'#68baff'},lightning:{name:'雷',color:'#ffdd76'},light:{name:'光',color:'#e5baff'}};
export const PHYSICAL={slash:'斬',pierce:'貫',impact:'衝'};
export const STATUS={oh:{name:'オーバーヒート',short:'OH',duration:5,rate:.04,color:'#ff965b'},freeze:{name:'フリーズ',short:'FREEZE',duration:6,rate:.025,color:'#68baff'},stun:{name:'スタン',short:'STUN',duration:2,rate:.06,color:'#ffdd76'}};
export const PASSIVES={
 damage:{name:'ダメージアップ',description:'与ダメージ＋10%'},save:{name:'ダメージセーブ',description:'被LPダメージ−10%'},critical:{name:'クリティカル',description:'クリティカル率2倍（最大100%）'},special:{name:'必殺ブースト',description:'攻撃必殺ダメージ＋20%'},recharge:{name:'リチャージカット',description:'必殺クールダウン−50%'},extend:{name:'エクステンド強化',description:'自強化時間＋50%'},guard:{name:'ストロングガード',description:'ガード中DF＋50%'},guardOff:{name:'ガードブレイクオフ',description:'通常のガード耐久破壊を防ぐ'},longRange:{name:'ロングロックオン',description:'射撃有効射程＋50%'},charge:{name:'スピードチャージ',description:'チャージ時間−50%'},tension:{name:'テンションマスター',description:'テンション回復開始0.8→0.4秒'},status:{name:'状態異常アタック',description:'状態異常付与率＋40%（相対）'},drop:{name:'アイテム入手アップ',description:'参加味方1機につき基本報酬1組追加'},
};
export const STYLES={aggressive:'積極型',counter:'反撃型',ranged:'射撃型',mobile:'機動型',hybrid:'切替型'};
export const COORDINATION={spread:'分散対応',focus:'集中攻撃',support:'援護'};
export const DIFFICULTIES={easy:{name:'やさしい',level:1,reaction:[.45,.65]},normal:{name:'ふつう',level:2,reaction:[.25,.4]},hard:{name:'むずかしい',level:3,reaction:[.15,.25]}};
const specials=[
 ['sword','突進斬り','回転斬り','ブレードドライブ','高速連続斬り→一閃',2,25,'攻撃速度・踏み込み・コンボ受付強化'],
 ['rapier','高速突き','三連貫通突き','ピアースモード','超高速多段突き',2,25,'突き速度・追従・硬直短縮'],
 ['dualSword','クロス斬り','回転連斬','ツインラッシュ','二刀高速乱舞',3,20,'攻撃速度大幅強化・硬直短縮'],
 ['lance','チャージ突き','貫通突撃','チャージモード','超高速貫通突撃',2,25,'チャージ短縮・突撃速度と距離強化'],
 ['naginata','薙ぎ払い','回転薙ぎ','ワイドレンジ','大旋風連撃',2,30,'横範囲・追従強化・硬直短縮'],
 ['knuckle','ラッシュパンチ','アッパー','インファイト','超連続打撃',2,20,'踏み込み強化・連撃短縮・怯み強化'],
 ['dagger','高速斬撃','回り込み斬り','シャドウステップ','高速残像乱舞',2,30,'ダッシュ消費軽減・回り込み・硬直短縮'],
 ['hammer','強打','地面衝撃波','ヘヴィインパクト','超重量叩き付け',3,25,'攻撃中怯み耐性・ガード攻撃・吹き飛ばし強化'],
 ['scythe','大薙ぎ','引き寄せ斬り','グラビティレンジ','大旋回乱舞',2,30,'範囲・引き寄せ強化・硬直短縮'],
 ['pistol','高威力弾','三連精密射撃','クイックショット','高速連射→強化弾',2,25,'硬直・リロード短縮・移動射撃安定'],
 ['machinegun','集中連射','高密度弾幕','オーバードライブ','超高速連続射撃',3,20,'連射・リロード短縮・ばらつき抑制'],
 ['shotgun','強化散弾','接射バースト','クロースレンジ','零距離連続散弾',2,25,'近距離威力強化・硬直短縮・押し出し強化'],
 ['dualGun','交互高速射撃','回転射撃','ガンスリンガー','高速移動乱射',3,25,'射撃間隔短縮・横移動射撃安定'],
 ['rifle','圧縮弾','貫通チャージ弾','パワーショット','超高出力砲撃',2,25,'チャージ短縮・弾速・射程強化'],
 ['assault','集中射撃','長距離掃射','フルオートモード','フルバースト',3,20,'連射精度・反動・移動射撃安定'],
 ['sniper','精密射撃','貫通狙撃','フォーカスモード','超長距離狙撃',2,30,'ロック距離・照準・遠距離性能強化'],
 ['heavyShotgun','大型散弾','衝撃散弾','ブリーチモード','超大型散弾連射',3,25,'散弾数・ガード攻撃・吹き飛ばし強化'],
 ['bazooka','爆裂弾','大爆発弾','デモリッション','超大型爆裂弾',3,25,'爆発範囲・爆風・OH付与強化'],
 ['missile','追尾ミサイル','多連装ミサイル','ホーミングブースト','全弾一斉発射',3,30,'誘導・旋回・同時ロック強化'],
];
export const SPECIALS={};
for(const [weapon,a,b,buff,superName,cost,duration,description] of specials){
 [['normal',a,1],['tech',b,2],['buff',buff,cost],['super',superName,5]].forEach(([kind,name,c])=>{const id=`${weapon}:${kind}`;SPECIALS[id]={id,weapon,kind,name,cost:c*100,duration:kind==='buff'?duration:0,description:kind==='buff'?description:kind==='super'?'最大ゲージを使う強力な攻撃':kind==='tech'?'武器の特徴を活かす特殊攻撃':'基本の攻撃必殺',cooldown:kind==='super'?8:4};});
}
export const SHAPES={l4:[[0,0],[0,1],[0,2],[1,2]],t6:[[0,0],[1,0],[2,0],[1,1],[1,2],[2,2]],longL6:[[0,0],[0,1],[0,2],[0,3],[1,3],[2,3]],t8:[[0,0],[1,0],[2,0],[3,0],[4,0],[2,1],[2,2],[2,3]],stagger6:[[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]],c8:[[0,0],[1,0],[2,0],[0,1],[0,2],[0,3],[1,3],[2,3]],u12:[[0,0],[3,0],[0,1],[3,1],[0,2],[3,2],[0,3],[3,3],[0,4],[1,4],[2,4],[3,4]]};
export const AUX={at:{name:'AT強化',values:[.03,.06,.12]},lp:{name:'LP強化',values:[.05,.1,.2]},df:{name:'DF強化',values:[.05,.1,.2]},c:{name:'C獲得強化',values:[.05,.1,.2]},bp:{name:'BP容量強化',values:[.05,.1,.2]},burn:{name:'BP消費軽減',values:[.03,.06,.12]},regen:{name:'テンション回復強化',values:[.05,.1,.2]},generic:{name:'汎用テンション消費軽減',values:[.03,.06,.12]},groundDash:{name:'地上ダッシュ特化軽減',values:[.06,.12,.24]},airDash:{name:'空中ダッシュ特化軽減',values:[.06,.12,.24]},extraJump:{name:'追加ジャンプ特化軽減',values:[.06,.12,.24]},oh:{name:'OH付与強化',values:[.1,.2,.4]},freeze:{name:'フリーズ付与強化',values:[.1,.2,.4]},stun:{name:'スタン付与強化',values:[.1,.2,.4]}};
for(const id of ['slash','pierce','impact','fire','water','lightning','light','oh','freeze','stun'])AUX[`res_${id}`]={name:`${PHYSICAL[id]||ELEMENTS[id]?.name||STATUS[id]?.name}耐性`,values:[.05,.1,.2]};
export const CATALOG={};
function add(item){CATALOG[item.id]={basic:true,element:'none',status:null,tendency:'基本',resists:{},...item};}
for(const [frame,f]of Object.entries(FRAMES))for(const part of PARTS)add({id:`armor:${frame}:${part}`,category:'armor',part,frame,name:`${f.name} ${PART_NAMES[part]}`,lp:f.lp*PART_SHARE[part],df:f.df*PART_SHARE[part],weight:f.weight*PART_SHARE[part]});
for(const [kind,w]of Object.entries(WEAPONS))add({id:`weapon:${kind}`,category:'weapon',kind,name:w.name,at:w.at,weight:w.weight,interval:w.interval});
add({id:'shield:basic',category:'shield',name:'シールド',weight:10});
// CPU/memory detailed multipliers and slots were not finalized; these values are prototype defaults.
for(const [key,name,scope,bonus]of [['general','汎用CPU','all',.06],['melee','近接CPU','melee',.10],['ranged','射撃CPU','ranged',.08],...Object.keys(WEAPONS).map(k=>[k,`${WEAPONS[k].name}CPU`,k,.12])])add({id:`cpu:${key}`,category:'cpu',name,shape:SHAPES.l4,scope,bonus});
for(const [key,name,normal,superSlots]of [['standard','必殺重視メモリ',3,1],['super','超必殺重視メモリ',1,3]])add({id:`memory:${key}`,category:'memory',name,shape:SHAPES.t6,normalSlots:normal,superSlots});
for(const [key,name,shape,output,burn]of [['low','低燃費モーター','l4',.7,3],['standard','標準モーター','longL6',1,5],['high','高出力モーター','t8',1.5,9]])add({id:`motor:${key}`,category:'motor',name,shape:SHAPES[shape],output,burn});
for(const [key,name,shape,capacity]of [['small','小型バッテリー','l4',600],['standard','標準バッテリー','stagger6',1000],['large','大型バッテリー','c8',1500],['huge','特大バッテリー','u12',2400]])add({id:`battery:${key}`,category:'battery',name,shape:SHAPES[shape],capacity});
for(const [effect,a]of Object.entries(AUX))for(let tier=0;tier<3;tier++)add({id:`aux:${effect}:${tier}`,category:'aux',name:`${a.name} ${['小','中','大'][tier]}`,effect,tier,value:a.values[tier],attackValue:effect==='generic'?[.015,.03,.06][tier]:0,shape:tier===0?[[0,0]]:tier===1?[[0,0],[1,0]]:[[0,0],[1,0],[2,0],[1,1]]});
export const CATEGORY_NAMES={weapon:'武器',shield:'盾',armor:'装甲',cpu:'CPU',memory:'メモリ',motor:'モーター',battery:'バッテリー',aux:'補助'};
export const STAGES={flat:{name:'フラットアリーナ',width:24,depth:20,spawn:7,tag:'平地 / 接近戦',description:'視線が通るコンパクトな練習アリーナ。',obstacles:[{x:0,z:-6,w:3,d:1.5,h:.7},{x:0,z:6,w:3,d:1.5,h:.7}],ramps:[]},yard:{name:'ブロックヤード',width:36,depth:28,spawn:10,tag:'遮蔽物 / 回り込み',description:'箱の間を抜け、射線と間合いを作る。',obstacles:[{x:-5,z:0,w:2,d:5,h:2.5},{x:5,z:0,w:2,d:5,h:2.5},{x:0,z:-5,w:5,d:2,h:1.3},{x:0,z:5,w:5,d:2,h:1.3},{x:-9,z:-8,w:3,d:2,h:1.5},{x:9,z:8,w:3,d:2,h:1.5},{x:-9,z:8,w:3,d:2,h:.7},{x:9,z:-8,w:3,d:2,h:.7}],ramps:[]},terrace:{name:'テラスフィールド',width:40,depth:32,spawn:11,tag:'高低差 / 空中移動',description:'スロープと多段ジャンプで上段へ。',obstacles:[{x:0,z:0,w:6,d:5,h:3},{x:-9,z:-6,w:4,d:4,h:1.5},{x:9,z:6,w:4,d:4,h:1.5},{x:-7,z:7,w:2,d:3,h:2.5},{x:7,z:-7,w:2,d:3,h:2.5}],ramps:[{x:0,z:-6,w:4,d:7,h:3,direction:1},{x:0,z:6,w:4,d:7,h:3,direction:-1},{x:-9,z:-10,w:3,d:4,h:1.5,direction:1},{x:9,z:10,w:3,d:4,h:1.5,direction:-1}]}};
