package com.mcnex.conversation;
import android.app.*;import android.os.*;import org.json.*;import java.io.*;
public class QuestionPolicyProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){JSONObject report=new JSONObject();try{File f=getTargetContext().getFilesDir();String[] cases={"점심 후 대화입니다. 도서관에서 책을 빌리려면 일반적으로 무엇을 준비해야 하나요?","이번 프로젝트의 우리 회사 내부 승인 예산은 정확히 얼마인가요? 현재 대화에서는 금액이 공유되지 않았습니다."};JSONArray rows=new JSONArray();report.put("results",rows);try(LiteAi ai=new LiteAi(new File(f,"gemma-policy-test.litertlm"),getTargetContext().getCacheDir())){for(String c:cases){String raw=ai.explain(c,"자동 대화 도움","assist");JSONObject help=new JSONObject(raw.substring(raw.indexOf('{'),raw.lastIndexOf('}')+1));rows.put(new JSONObject().put("model","Gemma (temporary test copy)").put("context",c).put("help",help));if(!help.optString("kind").equals("reply"))throw new IOException("Gemma question was not reply");}}
 try(LocalAi ai=new LocalAi(new File(f,"model.gguf"),true)){String raw=ai.explain(cases[0],"자동 대화 도움","assist");JSONObject help=new JSONObject(raw.substring(raw.indexOf('{'),raw.lastIndexOf('}')+1));rows.put(new JSONObject().put("model","EXAONE GPU").put("context",cases[0]).put("help",help));if(!help.optString("kind").equals("reply"))throw new IOException("EXAONE question help was not reply");}report.put("ok",true);
 }catch(Exception|LinkageError e){try{report.put("ok",false).put("error",e.toString());}catch(Exception ignored){}}
 try(FileOutputStream out=getTargetContext().openFileOutput("question-policy-probe.json",0)){out.write(report.toString().getBytes("UTF-8"));}catch(Exception ignored){}Bundle b=new Bundle();b.putString("report",report.toString());finish(report.optBoolean("ok")?-1:0,b);}
}
