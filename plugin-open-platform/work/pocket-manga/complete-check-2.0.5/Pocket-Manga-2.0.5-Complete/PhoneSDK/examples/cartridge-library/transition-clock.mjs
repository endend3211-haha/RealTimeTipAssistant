// Ignore time spent idle before a transition; bound movement between ACKs so
// a late frame cannot jump straight through the middle of the coverflow.
export class TransitionClock {
 constructor(){this.reset();}
 reset(){this.last=undefined;}
 step(now){const elapsed=this.last===undefined?16:Math.max(1,Math.min(64,now-this.last));this.last=now;return elapsed;}
}
