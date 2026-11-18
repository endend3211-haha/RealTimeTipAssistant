package com.mcnex.conversation;
import android.app.*;import android.os.*;import org.json.*;import java.io.*;
public class DualEngineProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){JSONObject report=new JSONObject();try{
  File files=getTargetContext().getFilesDir();long start=SystemClock.elapsedRealtime();
  try(LocalAi ai=new LocalAi(new File(files,"stories15M-chat-test.gguf"))){String text=ai.minutes("Continue the story.","Once upon a time",16);if(text.isEmpty())throw new IOException("Empty GGUF output");report.put("gguf",text).put("ggufMs",SystemClock.elapsedRealtime()-start);}
  try{new LocalAi(new File(files,"missing-test-model.gguf"));throw new IOException("Missing file accepted");}catch(IOException expected){report.put("missingRejected",true);}
  start=SystemClock.elapsedRealtime();try(LiteAi ai=new LiteAi(new File(files,"model.litertlm"),getTargetContext().getCacheDir())){String text=ai.minutes("한국어 한 문장으로 답하세요.","HDR은 어떤 기술인가요?",32);if(text.isEmpty())throw new IOException("Empty LiteRT output");report.put("litertlm",text).put("litertlmMs",SystemClock.elapsedRealtime()-start);}
  MeetingManager manager=MeetingManager.get(getTargetContext());String original="litertlm";
  try{getTargetContext().getSharedPreferences("ai-models",0).edit().putString("name-gguf","EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf").commit();manager.selectModel("gguf");start=SystemClock.elapsedRealtime();AiEngine exaone=manager.engine();long loaded=SystemClock.elapsedRealtime();Bundle stage=new Bundle();stage.putString("stage","EXAONE loaded");sendStatus(1,stage);String text=exaone.explain("카메라 역광 촬영에서 HDR 기술의 의미를 검토하고 있습니다.","자동 대화 도움","assist");int first=text.indexOf('{'),last=text.lastIndexOf('}');JSONObject help=new JSONObject(text.substring(first,last+1));if(!help.optString("kind").matches("none|term|reply"))throw new IOException("Invalid help JSON");report.put("exaone",help).put("exaoneLoadMs",loaded-start).put("exaoneGenerateMs",SystemClock.elapsedRealtime()-loaded);String summary=exaone.minutes("회의에서 확정된 결정 사항 한 문장만 쓰세요. 추측하지 마세요.","회의에서 카메라 HDR 비교 시험을 금요일까지 진행하기로 결정했습니다.",64);report.put("exaoneMinutes",summary);}
  finally{manager.selectModel(original);}
  report.put("ok",true);
 }catch(Exception|LinkageError e){try{report.put("ok",false).put("error",e.toString());}catch(Exception ignored){}}
 try(FileOutputStream out=getTargetContext().openFileOutput("dual-engine-probe.json",0)){out.write(report.toString().getBytes("UTF-8"));}catch(Exception ignored){}
 Bundle result=new Bundle();result.putString("report",report.toString());finish(report.optBoolean("ok")?-1:0,result);
 }
}
