from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/NativeKoreanSpeech.java');s=p.read_text(encoding='utf-8').replace('.put("revision",revision)', '.put("session",session).put("revision",revision)');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8').replace('respond(s,200,obj("ready",true));','respond(s,200,liveSpeech.snapshot().put("ready",true));');p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/core.mjs');s=p.read_text(encoding='utf-8').replace('packets.length<5','packets.length<1').replace('flush(){if(pending.length>=5)','flush(){if(pending.length>0)')
s+='''
export function mergeLiveTranscript(state,snapshot){
 let entries=state.entries,changed=false;
 for(const item of snapshot.finals||[]){if(typeof item?.id!=='string'||typeof item.text!=='string'||!item.text.trim())continue;const index=entries.findIndex(e=>e.id===item.id);if(index>=0){if(entries[index].text!==item.text){entries=entries.map((e,i)=>i===index?{...e,text:item.text.slice(0,500)}:e);changed=true;}}else{entries=[...entries,{id:item.id,text:item.text.trim().slice(0,500),time:Date.now(),kind:'speech'}].slice(-500);changed=true;}}
 const fresh=(snapshot.revision??0)>=(state.revision??-1);
 return {entries,partial:fresh?String(snapshot.partial||''):state.partial,revision:fresh?snapshot.revision:state.revision,changed};
}
''';p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('shouldRequestHelp,acceptHelp}', 'shouldRequestHelp,acceptHelp,mergeLiveTranscript}')
s=s.replace('const explainedTerms=new Map();','const explainedTerms=new Map();let liveState={entries:[],partial:"",revision:-1},captureSession="",transcriptTimer=null,polling=false;')
s=s.replace("health.version!=='0.3.0'","health.version!=='0.4.0'").replace('APK를 0.3.0','APK를 0.4.0')
s=s.replace('if(queue.length>=2)', 'if(queue.length>=8)')
a=s.index('function pump(){');b=s.index('async function start(){',a)
s=s[:a]+'''function applyLive(data){
 if(data.session!==captureSession)return;
 const previous=liveState.partial;liveState=mergeLiveTranscript({...liveState,entries},data);entries=liveState.entries;
 if(liveState.changed){history();void save().catch(e=>setStatus('기록 저장 실패: '+e.message));}
 if(liveState.changed||previous!==liveState.partial){if(screen==='caption')pageIndex=0;draw();}
 if(data.error&&capture){setStatus(data.error);void stop(false);}
}
async function pollTranscript(){if(polling||!captureSession||suspended||closing)return;polling=true;try{applyLive(await request('/transcript',undefined,4000));}catch(e){$('device').textContent='자막 상태 조회 지연: '+e.message;}finally{polling=false;}}
function pump(){if(processing)return;processing=(async()=>{while(queue.length&&!closing&&!suspended){const body=queue.shift();try{applyLive(await request('/audio',body,12000));}catch(e){queue=[];void stop(false);setStatus('음성 전달 실패: '+e.message);break;}}})().finally(()=>{processing=null;});}
''' +s[b:]
s=s.replace("setStatus('음성인식 모델 준비 중');await request('/prepare',{});", "setStatus('기기 내 한국어 지속 인식 준비 중');const prepared=await request('/prepare',{});captureSession=prepared.session;liveState={entries,partial:'',revision:-1};")
s=s.replace('createCaptionSegmenter(enqueue)', 'createCaptionSegmenter(enqueue,10)').replace("setStatus('듣는 중 · 2초 구간 자막');", "setStatus('한국어 지속 인식 중');transcriptTimer=setInterval(()=>void pollTranscript(),250);")
s=s.replace('finally{clearInterval(audioWatch);if(capture', 'finally{clearInterval(audioWatch);if(capture')
a=s.index('async function stop(flush=true){');b=s.index('async function automaticHelp(){',a)
s=s[:a]+'''async function stop(flush=true){const current=capture;if(!flush){discardAudio=true;queue=[];packets=[];segmenter?.clear();}if(current){try{await current.stop();}catch(e){setStatus(e.message);}await consumer;}if(processing)await processing;clearInterval(transcriptTimer);transcriptTimer=null;if(captureSession){try{applyLive(await request('/finish',{},5000));}catch(e){$('device').textContent=e.message;}}if(!explaining)setStatus('일시정지');}
''' +s[b:]
s=s.replace("const context=recentContext(entries).slice(-500)", "const context=(recentContext(entries)+'\\n'+liveState.partial).trim().slice(-500)")
s=s.replace("const content=screen==='explanation'?answer:entries.slice(-2).reverse().map(e=>e.text).join('\\n')", "const content=screen==='explanation'?answer:[liveState.partial,...entries.slice(-2).reverse().map(e=>e.text)].filter(Boolean).join('\\n')")
s=s.replace('clearInterval(helpTimer);queue=[]', 'clearInterval(helpTimer);clearInterval(transcriptTimer);queue=[]')
s=s.replace('entries=[];answer=', 'entries=[];liveState={entries:[],partial:"",revision:-1};answer=')
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/manifest.json');import json;m=json.loads(p.read_text(encoding='utf-8'));m['version']='0.4.0';m['name']='Memo 지속 한국어 자막·도움 0.4.0';p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 5; versionName '0.4.0'", "versionCode 6; versionName '0.4.0'");p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/debug/ServiceSmoke.java');s=p.read_text(encoding='utf-8').replace('com.memomind.companion.WhisperEngine speech=com.memomind.companion.WhisperEngine.load(getTargetContext());','').replace('speech.close();','');p.write_text(s,encoding='utf-8')
