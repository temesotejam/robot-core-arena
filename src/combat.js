import {WEAPONS} from './data.js';
import {motionRhythm} from './motion.js';
// Prototype balance values: resilience to interruption, not damage reduction.
export const POISE={lance:34,naginata:38,scythe:42,hammer:52};
export const INTERRUPT_RECOVERY=.14;
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
