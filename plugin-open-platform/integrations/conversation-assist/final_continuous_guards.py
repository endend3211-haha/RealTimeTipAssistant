from pathlib import Path
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace('minSdk 31;','minSdk 33;');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8')
old='if(liveSpeech!=null){Thread.sleep(300);respond(s,200,liveSpeech.snapshot());}else respond(s,200,obj("ok",true));}finally{speechLock.unlock();}return;}'
new='if(liveSpeech!=null){Thread.sleep(500);respond(s,200,liveSpeech.snapshot());}else respond(s,200,obj("ok",true));}catch(Exception e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}'
assert old in s;s=s.replace(old,new);p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/index.html');s=p.read_text(encoding='utf-8').replace('한국어 자막과 문맥에 맞는 짧은 설명','한국어 지속 자막 · AI가 알아서 필요한 도움').replace('<h2>대화 자막</h2>','<h2>한국어 지속 자막</h2><p>말하는 동안 중간 자막이 갱신되고, 말이 끝나면 문장이 확정됩니다.</p>');p.write_text(s,encoding='utf-8')
