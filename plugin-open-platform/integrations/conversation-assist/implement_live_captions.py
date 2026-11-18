from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.mjs');s=p.read_text(encoding='utf-8');s+='''
// Consecutive 20 ms frames; segmentation is independent of host chunk boundaries.
export function createCaptionSegmenter(emit,limit=100){
 let pending=[],received=0;
 return {
  push(chunk){if(chunk.discontinuity||chunk.droppedFrameCount)throw Error('안경 음성 유실 감지 · 다시 시작하세요');const sizes=Array.from(chunk.frameLengths);if(sizes.some(n=>!Number.isInteger(n)||n<1||n>1275)||sizes.reduce((a,b)=>a+b,0)!==chunk.data.length)throw Error('안경 음성 프레임 경계 오류');let offset=0;for(const n of sizes){pending.push(chunk.data.slice(offset,offset+n));offset+=n;received++;if(pending.length===limit){const block=packOpus(pending);pending=[];emit(block);}}},
  flush(){if(pending.length>=5)emit(packOpus(pending));pending=[];},
  clear(){pending=[];},
  get receivedFrames(){return received;}
 };
}
''';p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('KNOWN_TERMS}', 'KNOWN_TERMS,createCaptionSegmenter}')
s=s.replace('discardAudio=false;', 'discardAudio=false,segmenter=null,receiveHudAt=0,lastAudioAt=0,audioWatch=null;',1)
a=s.index('function enqueue(){');b=s.index('function pump(){',a)
s=s[:a]+"function enqueue(block){if(queue.length>=2)throw Error('자막 인식이 음성 속도를 따라가지 못했습니다. 잠시 멈춘 뒤 다시 시작하세요.');queue.push(block);pump();}\n"+s[b:]
s=s.replace("const body=queue.shift();try{", "const body=queue.shift(),started=performance.now();try{")
s=s.replace("if(data.text?.trim()){await add(data.text);setStatus(capture?'듣는 중':'일시정지');}", "if(data.text?.trim())await add(data.text);setStatus(capture?'듣는 중 · 자막 갱신 '+((performance.now()-started)/1000).toFixed(1)+'초':'일시정지');")
s=s.replace("const caps=await gm.runtime.getCapabilities();", "setStatus('음성인식 모델 준비 중');await request('/prepare',{});const caps=await gm.runtime.getCapabilities();")
s=s.replace("setStatus('듣는 중 · 약 6초 단위 자막');", "segmenter=createCaptionSegmenter(enqueue);lastAudioAt=Date.now();setStatus('듣는 중 · 2초 구간 자막');audioWatch=setInterval(()=>{if(capture&&Date.now()-lastAudioAt>8000)setStatus('안경 음성 수신 대기 · 연결과 마이크를 확인하세요');},2000);")
a=s.index('const current=capture;consumer=');b=s.index('\n}finally{starting=false;}',a)
s=s[:a]+'''const current=capture;consumer=(async()=>{try{for await(const chunk of current.stream){if(discardAudio)continue;lastAudioAt=Date.now();segmenter.push(chunk);if(Date.now()-receiveHudAt>1000){receiveHudAt=Date.now();setStatus('음성 수신 '+(segmenter.receivedFrames/50).toFixed(1)+'초 · '+(processing?'자막 인식 중':'듣는 중'));}}if(!closing&&!discardAudio)segmenter.flush();}catch(e){setStatus(e.message);queue=[];segmenter?.clear();try{await current.stop();}catch{}}finally{clearInterval(audioWatch);if(capture===current)capture=null;consumer=null;}})();''' +s[b:]
s=s.replace("discardAudio=true;queue=[];packets=[];", "discardAudio=true;queue=[];packets=[];segmenter?.clear();")
s=s.replace("closing=true;suspended=true;", "closing=true;suspended=true;clearInterval(audioWatch);")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/manifest.json');import json;m=json.loads(p.read_text(encoding='utf-8'));m['version']='0.2.0';m['name']='Memo 실시간 대화 0.2.0';p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8');s=s.replace('if(path.equals("/cancel")', '''if(path.equals("/prepare")&&method.equals("POST")){if(!speechLock.tryLock()){respond(s,429,obj("error","음성 처리 중입니다"));return;}try{if(whisper==null)whisper=WhisperEngine.load(this);respond(s,200,obj("ready",true));}catch(Exception|LinkageError e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}
  if(path.equals("/cancel")''');s=s.replace('.put("version","0.1.0")','.put("version","0.2.0")');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/memomind/companion/WhisperEngine.java');s=p.read_text(encoding='utf-8').replace('Math.min(2,Runtime','Math.min(4,Runtime');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 1; versionName '0.1.0'", "versionCode 2; versionName '0.2.0'");p.write_text(s,encoding='utf-8')
