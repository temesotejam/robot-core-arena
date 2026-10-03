import {blendMelee} from './melee-pose.js';
import {FAST_MOTIONS} from './melee-fast.js';
import {THRUST_MOTIONS} from './melee-thrust.js';
import {HEAVY_MOTIONS} from './melee-heavy.js';
import {KNUCKLE_MOTIONS} from './knuckle-motion.js';

const PROFILES={...FAST_MOTIONS,...THRUST_MOTIONS,...HEAVY_MOTIONS,knuckle:KNUCKLE_MOTIONS};
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(p,a,b)=>smooth((p-a)/(b-a));
export function meleeClip(kind,attack={}){
 const profile=PROFILES[kind];if(!profile)return null;
 if(attack.skill)return profile.specials?.[attack.skill]||(attack.skill==='tech'?profile.tech:null);
 if(attack.charge>.5&&profile.charged)return profile.charged;
 return profile.clips[((attack.combo||0)%profile.clips.length+profile.clips.length)%profile.clips.length];
}
export function meleeContact(kind,attack={}){return meleeClip(kind,attack)?.contact||null;}
function keysFor(clip,hasShield){return hasShield&&clip.shieldKeys?clip.shieldKeys:clip.keys;}
function sampleKeys(keys,p,start=keys[0][1]){
 if(p<=0)return start;if(p>=1)return keys.at(-1)[1];
 for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){
  const [a,from]=keys[i-1],[b,to]=keys[i];
  return blendMelee(i===1?start:from,to,smooth((p-a)/(b-a)));
 }
 return keys.at(-1)[1];
}
export function sampleMelee(kind,attack,{nextCombo=null,charging=null,hasShield=false}={}){
 const profile=PROFILES[kind];if(!profile)return null;
 const ready=hasShield&&profile.shieldReady?profile.shieldReady:profile.ready;
 if(!attack){
  if(!charging)return {...ready,name:'ready'};
  if(profile.chargeHold)return {...profile.chargeHold(charging),name:'chargeHold',hasShield};
  const clip=profile.charged||profile.clips[0],keys=keysFor(clip,hasShield),load=profile.hold||keys.find(([p])=>p>=.20)?.[1]||keys[1][1];
  const from=charging.from||ready,amount=ramp(charging.elapsed||0,.10,.70);
  return {...blendMelee(from,load,amount),name:'chargeHold',hasShield};
 }
 const clip=meleeClip(kind,attack);if(!clip)return null;
 const keys=keysFor(clip,hasShield),p=clamp(attack.elapsed/attack.duration),start=attack.blendFrom||ready;
 let out=profile.sampleClip?profile.sampleClip(clip,p,start):sampleKeys(keys,p,start);
 // A held charge has already loaded the weapon. Keep that load on release,
 // rather than lowering the weapon and repeating the idle preparation.
 if(!profile.sampleClip&&attack.charge>.5&&profile.charged&&start.name==='chargeHold'){
  const loaded=keys.find(([t])=>t>=.20);
  if(loaded&&p<=loaded[0])out=blendMelee(start,loaded[1],ramp(p,0,loaded[0]));
 }
 // Gather into the following attack instead of standing upright between hits.
 // The simulation saves this exact connected pose as the next attack's start.
 if(nextCombo!==null&&p>(profile.chainStart??.70)){
  const next=profile.clips[nextCombo%profile.clips.length],preparation=next.prepare||keysFor(next,hasShield)[1][1];
  out=blendMelee(out,preparation,(profile.chainAmount??.82)*ramp(p,profile.chainStart??.70,1));
  if(profile.chainStart!==undefined)out={...out,preparedNext:nextCombo%profile.clips.length};
 }
 const contact=clip.contact||{start:.25,center:.4,end:.55},lead=profile.lead??(kind==='knuckle'||out.twoHand?1:0),rear=1-lead;
 const lift=kind==='knuckle'?.006:.026,liftStart=contact.start*.28,
  land=out.twoHand?contact.start*(attack.charge>.5?.8:1):kind==='lance'?contact.start+(contact.center-contact.start)*(attack.charge>.5?.82:.65):contact.center,rearLand=kind==='lance'?.70:.82;
 const feet=out.feet.map(v=>[...v]),footStride=[0,0],footProgress=[0,0],stepStart=contact.start*(['rapier','lance'].includes(kind)?1.15:.5);
 // One support foot remains planted. The driving foot lifts and lands before
 // the impact; the rear foot then gathers during recovery, without sliding.
 footProgress[lead]=ramp(p,liftStart,land);footProgress[rear]=ramp(p,land,rearLand);
 feet[lead][1]=.035+lift*Math.sin(Math.PI*footProgress[lead]);
 feet[rear][1]=.035+lift*Math.sin(Math.PI*footProgress[rear]);
 // Land at the travel already completed, rather than reaching the full attack
 // advance early. Once it lands, the other foot may gather.
 footStride[lead]=ramp(land,stepStart,contact.end)*footProgress[lead];
 footStride[rear]=footProgress[rear];
 // Gather the first foot only after the other one supports the recovery.
 // Both footprints then finish in the same stance used by the idle pose;
 // dropping the retained attack pose cannot teleport a planted foot.
 if(p>rearLand){
  const gather=ramp(p,rearLand,1),impactStride=ramp(land,stepStart,contact.end);
  footProgress[lead]=gather;feet[lead][1]=.035+lift*Math.sin(Math.PI*gather);
  footStride[lead]=impactStride+(1-impactStride)*gather;
 }
 if(p<=0){for(let i=0;i<2;i++)feet[i]=[...start.feet[i]];}
 else if(attack.blendFrom&&p<liftStart){const t=ramp(p,0,liftStart);for(let i=0;i<2;i++)feet[i][1]=start.feet[i][1]+(feet[i][1]-start.feet[i][1])*t;}
 return {...out,name:clip.name,strikingSide:clip.strikingSide,feet,footStride,footProgress,plantOrigin:attack.origin,plantYaw:attack.yaw};
}
