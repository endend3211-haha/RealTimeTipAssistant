from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'NativeKoreanSpeech.java';s=p.read_text(encoding='utf-8').replace('private int segment=0;', 'private int segment=0;private long revision=0;')
s=s.replace('partial=text(b);','String next=text(b);if(!next.equals(partial)){partial=next;revision++;}')
s=s.replace('lastFinal=text;partial="";segment++;','lastFinal=text;partial="";segment++;revision++;if(finals.length()>64)finals.remove(0);')
s=s.replace('while(finals.length()>0)finals.remove(0);','').replace('.put("running",running)','.put("revision",revision).put("running",running)');p.write_text(s,encoding='utf-8')
p=r/'AssistService.java';s=p.read_text(encoding='utf-8').replace('private volatile WhisperEngine whisper;', 'private volatile WhisperEngine whisper;private volatile NativeKoreanSpeech liveSpeech;private volatile ContinuousOpus liveOpus;')
a=s.index('  if(path.equals("/prepare")');b=s.index('  if(path.equals("/cancel")',a)
s=s[:a]+'''  if(path.equals("/transcript")&&method.equals("GET")){respond(s,200,liveSpeech==null?new JSONObject().put("running",false).put("partial","").put("finals",new JSONArray()):liveSpeech.snapshot());return;}
  if(path.equals("/prepare")&&method.equals("POST")){if(!speechLock.tryLock()){respond(s,429,obj("error","음성 처리 중입니다"));return;}try{if(liveOpus!=null){liveOpus.close();liveOpus=null;}if(liveSpeech!=null)liveSpeech.close();liveSpeech=new NativeKoreanSpeech(this);liveOpus=new ContinuousOpus(liveSpeech);respond(s,200,obj("ready",true));}catch(Exception|LinkageError e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}
  if(path.equals("/finish")&&method.equals("POST")){speechLock.lock();try{if(liveOpus!=null){liveOpus.finish();liveOpus.close();liveOpus=null;}if(liveSpeech!=null){Thread.sleep(300);respond(s,200,liveSpeech.snapshot());}else respond(s,200,obj("ok",true));}finally{speechLock.unlock();}return;}
''' +s[b:]
a=s.index('    float[] samples=OpusDecode.decode(body);');b=s.index('   }else{',a)
s=s[:a]+'''    if(liveOpus==null||liveSpeech==null)throw new IOException("지속 인식을 먼저 시작하세요");liveOpus.accept(body);respond(s,200,liveSpeech.snapshot());
''' +s[b:]
s=s.replace('if(ai!=null)ai.cancel();if(whisper!=null)whisper.cancel();respond', 'if(ai!=null)ai.cancel();if(liveSpeech!=null)liveSpeech.close();respond')
s=s.replace('if(ai!=null)ai.close();if(whisper!=null)whisper.close();','if(ai!=null)ai.close();if(whisper!=null)whisper.close();if(liveOpus!=null)liveOpus.close();if(liveSpeech!=null)liveSpeech.close();')
s=s.replace('.put("version","0.3.0")','.put("version","0.4.0")');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/AndroidManifest.xml');s=p.read_text(encoding='utf-8').replace('<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>','<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>\n <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"/>').replace('android:foregroundServiceType="specialUse"','android:foregroundServiceType="microphone|specialUse"');p.write_text(s,encoding='utf-8')
p=r/'MainActivity.java';s=p.read_text(encoding='utf-8');s=s.replace('if(copying){info.setText("모델 복사 중입니다");return;}', 'if(copying){info.setText("모델 복사 중입니다");return;}if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=0){requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO},21);info.setText("안경 음성을 내장 인식기로 전달하려면 음성 권한을 허용하고 서비스를 시작하세요");return;}')
s=s.replace('안경 음성 → 한국어 자막 → 문맥에 맞는 설명','안경 음성 → 기기 내 지속 자막 → 문맥에 맞는 도움').replace('localhost 통신 허용 여부는 MemoMind 실기기에서 확인해야 합니다.','자막은 기기 내 한국어 인식기, 도움말은 Gemma가 별도로 처리합니다.');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 4; versionName '0.3.0'", "versionCode 5; versionName '0.4.0'");p.write_text(s,encoding='utf-8')
