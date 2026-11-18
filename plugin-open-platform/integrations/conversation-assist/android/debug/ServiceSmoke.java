package com.mcnex.conversation;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
public final class ServiceSmoke extends Instrumentation {
 @Override public void onCreate(Bundle b){super.onCreate(b);start();}
 @Override public void onStart(){Bundle out=new Bundle();try{startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));runOnMainSync(()->getTargetContext().startForegroundService(new Intent(getTargetContext(),AssistService.class)));Thread.sleep(1500);java.io.File stop=new java.io.File(getTargetContext().getFilesDir(),"smoke.done");stop.delete();Bundle started=new Bundle();started.putString("service","running");sendStatus(1,started);long until=System.currentTimeMillis()+240000;while(!stop.exists()&&System.currentTimeMillis()<until)Thread.sleep(200);out.putString("service",AssistService.running?"running":"failed");finish(AssistService.running?-1:0,out);}catch(Exception e){out.putString("error",e.toString());finish(0,out);}}
}
