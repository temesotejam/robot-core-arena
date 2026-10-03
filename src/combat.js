import {WEAPONS} from './data.js';
import {motionRhythm} from './motion.js';
// Prototype balance values: resilience to interruption, not damage reduction.
export const POISE={lance:34,naginata:38,scythe:42,hammer:52};
export const INTERRUPT_RECOVERY=.14;
// Ordinary melee finishers launch only after the preceding cut hits that victim.
// A lone finishing hit only staggers; grounded recovery owns fall immunity.
// Other attacks that flinch without a fall use the longer stagger below.
export const STAGGER={duration:.50};
export const KNOCKDOWN={down:1,rise:.50,height:.28,distance:.65,heavyDistance:.90};
// Only the immediately preceding ordinary cut's real damage unlocks a follow-up.
// Simulation and buffered pose blending must choose the same next cut.
export function nextCombo(u,charge=0,w=u.stats?.weapon){
 if(!w||w.ranged||w.id==='sword'&&charge>0||!u.comboHit||u.comboWindow<=0||u.comboChain?.weapon!==w.id||u.comboChain?.set!==u.active)return 0;
 return (u.combo+1)%Math.max(1,w.combo);
}
export function poiseActive(attack){
 if(!attack?.normal||!attack.poise||attack.exhausted)return false;
 const rhythm=motionRhythm(attack.weapon,attack);
 return attack.elapsed>=.04&&attack.elapsed<=attack.duration*rhythm.contactEnd&&attack.poise.remaining>0;
}
export function impactValue(packet,share=1){
 const w=WEAPONS[packet.weapon];
 return Math.max(1,(w?.ranged?12:8+Math.min(.9,w?.interval||.3)*32)*(packet.coefficient||1)*share*(1+Math.min(1,packet.charge||0)));
}
export function absorbImpact(attack,packet,share=1){
 // Finishers, specials and blasts are deliberate ways to break a committed heavy swing.
 if(!poiseActive(attack)||!packet.normal||packet.finisher||packet.weapon==='bazooka')return false;
 attack.poise.remaining=Math.max(0,attack.poise.remaining-impactValue(packet,share));
 return attack.poise.remaining>0;
}
