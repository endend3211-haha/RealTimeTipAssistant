package com.mcnex.conversation;
import android.content.*;import android.media.AudioFormat;import android.os.*;import android.speech.*;import org.json.*;import java.io.*;import java.util.*;import java.util.concurrent.*;
/** One continuous external-PCM session. No phone microphone or network fallback. */
final class NativeKoreanSpeech implements AutoCloseable {
 interface TextSink {void partial(String id,String text);void confirmed(String id,String text);}
 private final TextSink sink;
 private final Context context;private final Handler main=new Handler(Looper.getMainLooper());private final Object lock=new Object();
 private SpeechRecognizer recognizer;private ParcelFileDescriptor[] pipe;private OutputStream output;private volatile boolean running,closing;private volatile String error="";
 private String partial="",lastFinal="",session=UUID.randomUUID().toString();private int segment=0;private long revision=0;private final JSONArray finals=new JSONArray();
 NativeKoreanSpeech(Context c)throws Exception{this(c,null);}
 NativeKoreanSpeech(Context c,TextSink sink)throws Exception{context=c;this.sink=sink;start();}
 private void start()throws Exception{
  CountDownLatch ready=new CountDownLatch(1);main.post(()->{try{
   if(!SpeechRecognizer.isOnDeviceRecognitionAvailable(context))throw new IOException("기기 내 한국어 음성인식을 사용할 수 없습니다");
   recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(context);pipe=ParcelFileDescriptor.createPipe();output=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]);
   recognizer.setRecognitionListener(new RecognitionListener(){
    public void onReadyForSpeech(Bundle b){running=true;ready.countDown();}public void onBeginningOfSpeech(){}public void onRmsChanged(float v){}public void onBufferReceived(byte[] b){}public void onEndOfSpeech(){}public void onEvent(int type,Bundle b){}
    String text(Bundle b){ArrayList<String> words=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);return words==null||words.isEmpty()?"":words.get(0).trim();}
    public void onPartialResults(Bundle b){synchronized(lock){String next=text(b);if(!next.equals(partial)){partial=next;revision++;if(sink!=null)sink.partial(session+":"+segment,partial);}}}
    void commit(Bundle b){String text=text(b);if(text.isEmpty())return;synchronized(lock){try{finals.put(new JSONObject().put("id",session+":"+segment).put("text",text));}catch(JSONException ignored){}if(sink!=null)sink.confirmed(session+":"+segment,text);lastFinal=text;partial="";segment++;revision++;if(finals.length()>64)finals.remove(0);}}
    public void onSegmentResults(Bundle b){commit(b);}public void onResults(Bundle b){commit(b);}
    public void onEndOfSegmentedSession(){running=false;if(!closing)error="내장 인식 세션이 종료되었습니다. 다시 시작하세요";}
    public void onError(int code){running=false;if(!closing)error="기기 내 한국어 인식 오류 "+code;ready.countDown();}
   });
   Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ko-KR").putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE,pipe[0]).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE,16000).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT,1).putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING,AudioFormat.ENCODING_PCM_16BIT).putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION,RecognizerIntent.EXTRA_AUDIO_SOURCE);
   recognizer.startListening(intent);
  }catch(Exception e){error=e.getMessage();ready.countDown();}});
  if(!ready.await(8,TimeUnit.SECONDS)||!running){close();throw new IOException(error.isEmpty()?"한국어 인식 시작 시간 초과":error);}
 }
 void accept(float[] samples)throws IOException{if(!running)throw new IOException(error.isEmpty()?"음성 세션이 종료되었습니다":error);byte[] pcm=new byte[samples.length*2];for(int i=0;i<samples.length;i++){int value=Math.round(Math.max(-1,Math.min(1,samples[i]))*32767);pcm[i*2]=(byte)value;pcm[i*2+1]=(byte)(value>>8);}output.write(pcm);}
 JSONObject snapshot()throws JSONException{synchronized(lock){JSONArray list=new JSONArray(finals.toString());return new JSONObject().put("finals",list).put("partial",partial).put("partialId",session+":"+segment).put("session",session).put("revision",revision).put("running",running).put("error",error);}}
 void finish(){closing=true;try{if(output!=null)output.close();}catch(IOException ignored){}}
 public void close(){closing=true;running=false;finish();main.post(()->{if(recognizer!=null){recognizer.cancel();recognizer.destroy();recognizer=null;}if(pipe!=null)for(ParcelFileDescriptor p:pipe)try{p.close();}catch(IOException ignored){}});}
}
