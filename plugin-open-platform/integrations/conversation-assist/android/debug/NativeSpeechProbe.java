package com.mcnex.conversation;
import android.app.Instrumentation;import android.content.*;import android.media.AudioFormat;import android.os.*;import android.speech.*;import java.io.*;import java.util.*;import org.json.*;
public class NativeSpeechProbe extends Instrumentation {
 SpeechRecognizer recognizer;ParcelFileDescriptor[] pipe;long started,first;boolean done;JSONArray partials=new JSONArray(),finals=new JSONArray();
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){runOnMainSync(()->{try{
  recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(getTargetContext());pipe=ParcelFileDescriptor.createPipe();started=SystemClock.elapsedRealtime();
  recognizer.setRecognitionListener(new RecognitionListener(){
   public void onReadyForSpeech(Bundle b){new Thread(()->feed()).start();}public void onBeginningOfSpeech(){}public void onRmsChanged(float r){}public void onBufferReceived(byte[] b){}public void onEndOfSpeech(){}public void onEvent(int t,Bundle b){}
   String text(Bundle b){ArrayList<String> list=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);return list==null||list.isEmpty()?"":list.get(0);}
   public void onPartialResults(Bundle b){String s=text(b);if(!s.isEmpty()){if(first==0)first=SystemClock.elapsedRealtime()-started;partials.put(s);}}
   public void onResults(Bundle b){String s=text(b);if(!s.isEmpty())finals.put(s);complete(0);}
   public void onSegmentResults(Bundle b){String s=text(b);if(!s.isEmpty())finals.put(s);}
   public void onEndOfSegmentedSession(){complete(0);}
   public void onError(int e){complete(e);}
  });
  Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ko-KR").putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE,pipe[0]).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE,16000).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT,1).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING,AudioFormat.ENCODING_PCM_16BIT).putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION,RecognizerIntent.EXTRA_AUDIO_SOURCE);
  recognizer.startListening(i);new Handler(Looper.getMainLooper()).postDelayed(()->complete(99),15000);
 }catch(Exception e){Bundle b=new Bundle();b.putString("error",e.toString());finish(0,b);}});}
 void feed(){try(InputStream input=getTargetContext().getAssets().open("korean-probe.pcm");OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] b=new byte[640];int n;while((n=input.read(b))!=-1){out.write(b,0,n);Thread.sleep(20);}out.write(new byte[32000]);}catch(Exception ignored){}}
 void complete(int error){if(done)return;done=true;try{JSONObject result=new JSONObject().put("error",error).put("firstPartialMs",first).put("elapsedMs",SystemClock.elapsedRealtime()-started).put("partials",partials).put("finals",finals);try(FileOutputStream f=getTargetContext().openFileOutput("native-speech-probe.json",0)){f.write(result.toString().getBytes("UTF-8"));}Bundle b=new Bundle();b.putString("result",result.toString());recognizer.destroy();for(ParcelFileDescriptor p:pipe)try{p.close();}catch(Exception ignored){}finish(error==0?-1:0,b);}catch(Exception e){Bundle b=new Bundle();b.putString("error",e.toString());finish(0,b);}}
}
