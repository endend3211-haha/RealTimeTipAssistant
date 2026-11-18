package com.mcnex.conversation;
import android.app.*;import android.os.*;import org.json.*;import java.io.*;
public class AlignmentSmokeProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){JSONObject report=new JSONObject();try{File files=getTargetContext().getFilesDir();for(boolean gpu:new boolean[]{false,true}){try(LocalAi ai=new LocalAi(new File(files,"model.gguf"),gpu)){String result=ai.minutes("한국어 한 문장으로 답하세요.","HDR은 어떤 기술인가요?",32);if(result.isEmpty())throw new IOException("Empty GGUF output");report.put(gpu?"opencl":"cpu",result);}}
 try(LiteAi ai=new LiteAi(new File(files,"model.litertlm"),getTargetContext().getCacheDir())){String result=ai.explain("카메라 역광 촬영에서 HDR 기술의 의미를 검토하고 있습니다.","자동 대화 도움","assist");JSONObject help=new JSONObject(result.substring(result.indexOf('{'),result.lastIndexOf('}')+1));if(!help.optString("kind").matches("none|term|reply"))throw new IOException("Invalid LiteRT JSON");report.put("litertlmHelp",help);String minutes=ai.minutes("원문의 결정 사항만 한국어로 쓰세요.","회의에서 HDR 비교 시험을 금요일까지 수행하기로 결정했습니다.",48);if(minutes.isEmpty())throw new IOException("Empty minutes");report.put("litertlmMinutes",minutes);}report.put("ok",true);
 }catch(Exception|LinkageError e){try{report.put("ok",false).put("error",e.toString());}catch(Exception ignored){}}
 try(FileOutputStream out=getTargetContext().openFileOutput("alignment-smoke.json",0)){out.write(report.toString().getBytes("UTF-8"));}catch(Exception ignored){}Bundle b=new Bundle();b.putString("report",report.toString());finish(report.optBoolean("ok")?-1:0,b);}
}
