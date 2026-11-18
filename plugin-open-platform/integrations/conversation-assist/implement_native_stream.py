from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
(r/'NativeKoreanSpeech.java').write_text('''package com.mcnex.conversation;
import android.content.*;import android.media.AudioFormat;import android.os.*;import android.speech.*;import org.json.*;import java.io.*;import java.util.*;import java.util.concurrent.*;
/** One continuous external-PCM session. No phone microphone or network fallback. */
final class NativeKoreanSpeech implements AutoCloseable {
 private final Context context;private final Handler main=new Handler(Looper.getMainLooper());private final Object lock=new Object();
 private SpeechRecognizer recognizer;private ParcelFileDescriptor[] pipe;private OutputStream output;private volatile boolean running,closing;private volatile String error="";
 private String partial="",lastFinal="",session=UUID.randomUUID().toString();private int segment=0;private final JSONArray finals=new JSONArray();
 NativeKoreanSpeech(Context c)throws Exception{context=c;start();}
 private void start()throws Exception{
  CountDownLatch ready=new CountDownLatch(1);main.post(()->{try{
   if(!SpeechRecognizer.isOnDeviceRecognitionAvailable(context))throw new IOException("기기 내 한국어 음성인식을 사용할 수 없습니다");
   recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(context);pipe=ParcelFileDescriptor.createPipe();output=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]);
   recognizer.setRecognitionListener(new RecognitionListener(){
    public void onReadyForSpeech(Bundle b){running=true;ready.countDown();}public void onBeginningOfSpeech(){}public void onRmsChanged(float v){}public void onBufferReceived(byte[] b){}public void onEndOfSpeech(){}public void onEvent(int type,Bundle b){}
    String text(Bundle b){ArrayList<String> words=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);return words==null||words.isEmpty()?"":words.get(0).trim();}
    public void onPartialResults(Bundle b){synchronized(lock){partial=text(b);}}
    void commit(Bundle b){String text=text(b);if(text.isEmpty())return;synchronized(lock){if(text.equals(lastFinal)&&partial.isEmpty())return;try{finals.put(new JSONObject().put("id",session+":"+segment).put("text",text));}catch(JSONException ignored){}lastFinal=text;partial="";segment++;}}
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
 JSONObject snapshot()throws JSONException{synchronized(lock){JSONArray list=new JSONArray(finals.toString());while(finals.length()>0)finals.remove(0);return new JSONObject().put("finals",list).put("partial",partial).put("partialId",session+":"+segment).put("running",running).put("error",error);}}
 void finish(){closing=true;try{if(output!=null)output.close();}catch(IOException ignored){}}
 public void close(){closing=true;running=false;finish();main.post(()->{if(recognizer!=null){recognizer.cancel();recognizer.destroy();recognizer=null;}if(pipe!=null)for(ParcelFileDescriptor p:pipe)try{p.close();}catch(IOException ignored){}});}
}
''',encoding='utf-8')
(r/'ContinuousOpus.java').write_text('''package com.mcnex.conversation;
import android.media.*;import java.io.*;import java.nio.*;import com.memomind.companion.Pcm16k;
/** Stateful decoder across HTTP transfers; packet batching never resets audio history. */
final class ContinuousOpus implements AutoCloseable {
 private final MediaCodec codec;private final Pcm16k pcm=new Pcm16k();private final NativeKoreanSpeech speech;private final MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();private long frames;private boolean ended;
 ContinuousOpus(NativeKoreanSpeech speech)throws Exception{this.speech=speech;codec=MediaCodec.createDecoderByType("audio/opus");MediaFormat f=MediaFormat.createAudioFormat("audio/opus",48000,1);byte[] h=new byte[19];System.arraycopy("OpusHead".getBytes("US-ASCII"),0,h,0,8);h[8]=1;h[9]=1;ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN).putInt(12,16000);f.setByteBuffer("csd-0",ByteBuffer.wrap(h));ByteBuffer delay=ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());delay.putLong(0);delay.flip();f.setByteBuffer("csd-1",delay);ByteBuffer preroll=ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());preroll.putLong(80000000);preroll.flip();f.setByteBuffer("csd-2",preroll);f.setInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);codec.configure(f,null,null,0);codec.start();}
 void accept(byte[] body)throws Exception{DataInputStream in=new DataInputStream(new ByteArrayInputStream(body));int count=in.readInt();if(count<1||count>500)throw new IOException("잘못된 오디오 프레임 수");for(int i=0;i<count;i++){int n=in.readUnsignedShort();if(n<1||n>1275)throw new IOException("잘못된 Opus 길이");byte[] packet=new byte[n];in.readFully(packet);int slot=codec.dequeueInputBuffer(1000);long until=System.nanoTime()+1000000000L;while(slot<0){drain(1000);if(System.nanoTime()>until)throw new IOException("오디오 디코더 입력 지연");slot=codec.dequeueInputBuffer(1000);}codec.getInputBuffer(slot).put(packet);codec.queueInputBuffer(slot,0,n,frames++*20000L,0);drain(0);}if(in.available()!=0)throw new IOException("잘못된 오디오 데이터");drain(1000);publish();}
 private void drain(long timeout)throws Exception{int slot;while((slot=codec.dequeueOutputBuffer(info,timeout))!=MediaCodec.INFO_TRY_AGAIN_LATER){if(slot==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){MediaFormat f=codec.getOutputFormat();if(f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)!=1)throw new IOException("모노 입력이 아닙니다");pcm.setRate(f.getInteger(MediaFormat.KEY_SAMPLE_RATE));}else if(slot>=0){ByteBuffer b=codec.getOutputBuffer(slot);b.position(info.offset);b.limit(info.offset+info.size);byte[] bytes=new byte[info.size];b.get(bytes);pcm.accept(bytes);ended=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(slot,false);}timeout=0;}}
 private void publish()throws Exception{float[] data=pcm.drain();if(data.length>0)speech.accept(data);}
 void finish()throws Exception{int slot=codec.dequeueInputBuffer(10000);if(slot>=0)codec.queueInputBuffer(slot,0,0,frames*20000L,MediaCodec.BUFFER_FLAG_END_OF_STREAM);long until=System.nanoTime()+2000000000L;while(!ended&&System.nanoTime()<until){drain(1000);publish();}speech.finish();}
 public void close(){try{codec.stop();}catch(Exception ignored){}codec.release();}
}
''',encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/memomind/companion/Pcm16k.java');s=p.read_text(encoding='utf-8').replace('    public double rms()', '    public float[] drain(){float[] out=Arrays.copyOf(audio,size);size=0;return out;}\n    public double rms()');p.write_text(s,encoding='utf-8')
