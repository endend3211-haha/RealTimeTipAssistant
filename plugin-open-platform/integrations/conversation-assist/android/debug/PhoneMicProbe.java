package com.mcnex.conversation;
import android.app.*;import android.os.*;import org.json.*;import java.io.*;
public class PhoneMicProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){JSONObject result=new JSONObject();try(NativeKoreanSpeech speech=new NativeKoreanSpeech(getTargetContext())){try(PhoneMicrophone mic=new PhoneMicrophone(speech)){Thread.sleep(4000);result.put("recording",mic.recording()).put("samplesRead",mic.samplesRead).put("error",mic.error);if(!mic.recording()||mic.samplesRead<16000||!mic.error.isEmpty())throw new IOException("Phone microphone capture failed");}Thread.sleep(1000);result.put("ok",true);}catch(Exception e){try{result.put("ok",false).put("error",e.toString());}catch(Exception ignored){}}try(FileOutputStream out=getTargetContext().openFileOutput("phone-mic-probe.json",0)){out.write(result.toString().getBytes("UTF-8"));}catch(Exception ignored){}Bundle b=new Bundle();b.putString("report",result.toString());finish(result.optBoolean("ok")?-1:0,b);}
}
