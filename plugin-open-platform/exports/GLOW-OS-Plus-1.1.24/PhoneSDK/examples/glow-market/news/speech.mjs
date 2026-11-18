export function createReader(onState,env=window){
 const synth=env.speechSynthesis;let generation=0,current=null,timer,startTimer;
 const supported=Boolean(synth&&env.SpeechSynthesisUtterance);
 function stop(){generation++;clearTimeout(timer);clearTimeout(startTimer);current=null;if(supported)synth.cancel();onState('idle');}
 function read(text,onComplete){
  stop();if(!supported){onState('unsupported');return;}
  const parts=String(text).trim().match(/[^。！？.!?\n]{1,160}[。！？.!?\n]?|[。！？.!?\n]/g)||[];
  if(!parts.length)return;
  const ticket=generation;
  function next(){if(ticket!==generation)return;const part=parts.shift();if(!part){current=null;onState('done');onComplete?.();return;}
   current=new env.SpeechSynthesisUtterance(part);current.lang='ko-KR';current.rate=1;
   const voice=synth.getVoices().find(v=>/^ko(?:-|_)/i.test(v.lang));if(voice)current.voice=voice;
   current.onstart=()=>{clearTimeout(startTimer);if(ticket===generation)onState('speaking');};current.onend=()=>{clearTimeout(startTimer);timer=setTimeout(next,350);};current.onerror=e=>{if(ticket!==generation)return;clearTimeout(startTimer);current=null;generation++;onState('error',e.error);};
   onState('starting');try{if(synth.paused)synth.resume();synth.speak(current);startTimer=setTimeout(()=>{if(ticket===generation)onState('waiting');},6000);}catch(e){generation++;current=null;onState('error',e.message);}
  }next();
 }
 return {read,stop,supported};
}
