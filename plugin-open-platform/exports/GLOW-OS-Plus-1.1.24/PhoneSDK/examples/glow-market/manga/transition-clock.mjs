// ACK-driven animation: keep intermediate poses on fast links, but do not
// stretch each slow transfer into only 64 ms of visible movement.
export class TransitionClock {
 constructor(){this.transferMs=0;this.reset();}
 reset(){this.last=undefined;}
 observeTransfer(milliseconds){
  if(!Number.isFinite(milliseconds)||milliseconds<=0)return;
  const sample=Math.min(1000,milliseconds);
  this.transferMs=this.transferMs?this.transferMs*.75+sample*.25:sample;
 }
 step(now){
  const cap=Math.max(64,Math.min(240,this.transferMs*1.25));
  const elapsed=this.last===undefined?16:Math.max(1,Math.min(cap,now-this.last));
  this.last=now;return elapsed;
 }
}
