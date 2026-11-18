from pathlib import Path
base=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
lite=(base/'LiteAi.java').read_text(encoding='utf-8');start=lite.index('  String instruction=');end=lite.index('  try(Conversation',start);instructions=lite[start:end]
(base/'AiPrompts.java').write_text('package com.mcnex.conversation;\nfinal class AiPrompts {\n static String instruction(String mode){\n'+instructions+'  return instruction;\n }\n static String input(String context,String term){return "<로컬 용어 사전>\\n"+Glossary.reference(context,term)+"</로컬 용어 사전>\\n<참고 대화>\\n"+context+"\\n</참고 대화>\\n설명 대상: "+term;}\n}\n',encoding='utf-8')
lite=lite[:start]+'  String instruction=AiPrompts.instruction(mode);\n'+lite[end:];lite=lite.replace('implements AutoCloseable','implements AiEngine');(base/'LiteAi.java').write_text(lite,encoding='utf-8')
(base/'AiEngine.java').write_text('''package com.mcnex.conversation;
interface AiEngine extends AutoCloseable {
 String explain(String context,String term,String mode)throws Exception;
 String minutes(String instruction,String text,int maxTokens)throws Exception;
 void cancel();
 void close();
}
''',encoding='utf-8')
(base/'LocalAi.java').write_text('''package com.mcnex.conversation;
import java.io.*;import java.nio.charset.StandardCharsets;
public final class LocalAi implements AiEngine {
 static {System.loadLibrary("conversation");}
 private volatile long handle;private final Object lifetime=new Object();
 public LocalAi(File file)throws IOException{handle=load(file.getAbsolutePath());}
 public synchronized String explain(String context,String term,String mode)throws IOException{return run(AiPrompts.instruction(mode),AiPrompts.input(context,term),mode.equals("reply")?160:128);}
 public synchronized String minutes(String instruction,String text,int maxTokens)throws IOException{return run(instruction,"<원문>\\n"+text+"\\n</원문>",maxTokens);}
 private String run(String system,String user,int tokens)throws IOException{if(handle==0)throw new IOException("GGUF 모델이 준비되지 않았습니다");return new String(generate(handle,system.getBytes(StandardCharsets.UTF_8),user.getBytes(StandardCharsets.UTF_8),tokens),StandardCharsets.UTF_8).trim();}
 public void cancel(){synchronized(lifetime){if(handle!=0)cancel(handle);}}
 public synchronized void close(){synchronized(lifetime){if(handle!=0){free(handle);handle=0;}}}
 private static native long load(String path)throws IOException;
 private static native byte[] generate(long handle,byte[] system,byte[] user,int maxTokens)throws IOException;
 private static native void cancel(long handle);
 private static native void free(long handle);
}
''',encoding='utf-8')
p=base/'MeetingManager.java';s=p.read_text(encoding='utf-8').replace('private LiteAi model;','private volatile AiEngine model;');a=s.index(' synchronized LiteAi engine()');b=s.index('\n final class Sink',a)
s=s[:a]+''' String selectedModel(){return context.getSharedPreferences("ai-models",0).getString("selected","litertlm");}
 File modelFile(String kind){return new File(context.getFilesDir(),kind.equals("gguf")?"model.gguf":"model.litertlm");}
 String modelName(){String kind=selectedModel();return context.getSharedPreferences("ai-models",0).getString("name-"+kind,kind.equals("gguf")?"GGUF / llama.cpp":"Gemma / LiteRT-LM");}
 boolean hasModel(){return modelFile(selectedModel()).isFile();}
 synchronized AiEngine engine()throws Exception{if(model==null){File file=modelFile(selectedModel());if(!file.isFile())throw new IOException("설정에서 선택한 AI 모델을 등록하세요");model=selectedModel().equals("gguf")?new LocalAi(file):new LiteAi(file,context.getCacheDir());}return model;}
 void selectModel(String kind)throws Exception{if(!kind.equals("gguf")&&!kind.equals("litertlm"))throw new IOException("지원하지 않는 모델 형식");if(!AI_LOCK.tryLock())throw new IOException("AI 처리 완료 후 모델을 변경하세요");try{if(!modelFile(kind).isFile())throw new IOException("먼저 모델 파일을 등록하세요");synchronized(this){if(model!=null){model.close();model=null;}context.getSharedPreferences("ai-models",0).edit().putString("selected",kind).apply();}}finally{AI_LOCK.unlock();}}
 void installModel(File temp,String kind,String name)throws Exception{if(!AI_LOCK.tryLock())throw new IOException("AI 처리 완료 후 모델을 등록하세요");try{synchronized(this){if(selectedModel().equals(kind)&&model!=null){model.close();model=null;}java.nio.file.Files.move(temp.toPath(),modelFile(kind).toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);context.getSharedPreferences("ai-models",0).edit().putString("name-"+kind,name).apply();}}finally{AI_LOCK.unlock();}}
 void cancelAi(){AiEngine current=model;if(current!=null)current.cancel();}
'''+s[b:];s=s.replace('LiteAi ai=engine();','AiEngine ai=engine();');s=s.replace('m.put("minutesStatus",state).put("minutesProgress",detail);','m.put("minutesStatus",state).put("minutesProgress",detail);if(state.equals("generating"))m.put("aiModel",modelName()).put("aiEngine",selectedModel());');p.write_text(s,encoding='utf-8')
p=base/'AssistService.java';s=p.read_text(encoding='utf-8').replace('volatile LiteAi ai','volatile AiEngine ai').replace('new File(getFilesDir(),"model.litertlm").isFile()', 'meetings.hasModel()');a=s.index('    File model=new File(getFilesDir(),"model.litertlm");');b=s.index('    if(mode.equals("assist")){JSONArray avoid',a)
s=s[:a]+'''    if(!meetings.hasModel()){respond(s,409,obj("error","설정에서 선택한 AI 모델을 등록하세요"));return;}
    status=meetings.modelName()+" 설명 생성 중";
    long loadStart=android.os.SystemClock.elapsedRealtime();AiEngine previous=ai;ai=meetings.engine();boolean cold=previous!=ai;long loaded=android.os.SystemClock.elapsedRealtime();
'''+s[b:];s=s.replace('if(ai!=null)ai.cancel();','meetings.cancelAi();').replace('"Gemma 로컬 AI · 사실 확인 필요"','meetings.modelName()+" · 사실 확인 필요"');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 9; versionName '0.6.1'","versionCode 10; versionName '0.7.0'").replace(" compileSdk 35"," compileSdk 35\n ndkVersion '26.3.11579264'\n externalNativeBuild { cmake { path file('native/CMakeLists.txt'); version '3.22.1' } }");p.write_text(s,encoding='utf-8')
