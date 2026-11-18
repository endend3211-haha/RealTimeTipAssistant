from pathlib import Path
r=Path('integrations/conversation-assist/android/debug')
(r/'ContinuousPipelineProbe.java').write_text('''package com.mcnex.conversation;
import android.app.Instrumentation;import android.os.*;import android.media.*;import java.io.*;import java.nio.*;import org.json.*;
public class ContinuousPipelineProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){new Thread(()->run()).start();}
 void run(){NativeKoreanSpeech speech=null;ContinuousOpus decoder=null;MediaCodec encoder=null;Bundle result=new Bundle();try{
  speech=new NativeKoreanSpeech(getTargetContext());decoder=new ContinuousOpus(speech);encoder=MediaCodec.createEncoderByType("audio/opus");MediaFormat f=MediaFormat.createAudioFormat("audio/opus",16000,1);f.setInteger(MediaFormat.KEY_BIT_RATE,24000);f.setInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);encoder.configure(f,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);encoder.start();
  ByteArrayOutputStream input=new ByteArrayOutputStream();byte[] source;try(InputStream s=getTargetContext().getAssets().open("korean-probe.pcm")){byte[] b=new byte[4096];int n;while((n=s.read(b))!=-1)input.write(b,0,n);}source=input.toByteArray();
  ByteArrayOutputStream all=new ByteArrayOutputStream();for(int i=0;i<3;i++){all.write(source);all.write(new byte[32000]);}byte[] audio=all.toByteArray();
  int offset=0,packetCount=0,partialChanges=0;String previous="";boolean eos=false,done=false;long start=SystemClock.elapsedRealtime(),first=0;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
  while(!done){
   if(!eos){int slot=encoder.dequeueInputBuffer(1000);if(slot>=0){if(offset<audio.length){int n=Math.min(640,audio.length-offset);encoder.getInputBuffer(slot).put(audio,offset,n);encoder.queueInputBuffer(slot,0,n,offset*1000000L/32000,0);offset+=n;long target=start+offset*1000L/32000,now=SystemClock.elapsedRealtime();if(target>now)Thread.sleep(target-now);}else{encoder.queueInputBuffer(slot,0,0,offset*1000000L/32000,MediaCodec.BUFFER_FLAG_END_OF_STREAM);eos=true;}}}
   int slot;while((slot=encoder.dequeueOutputBuffer(info,1000))>=0){boolean config=(info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)!=0;if(info.size>0&&!config){ByteBuffer out=encoder.getOutputBuffer(slot);out.position(info.offset);out.limit(info.offset+info.size);byte[] opus=new byte[info.size];out.get(opus);ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream data=new DataOutputStream(bytes);data.writeInt(1);data.writeShort(opus.length);data.write(opus);decoder.accept(bytes.toByteArray());packetCount++;}done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;encoder.releaseOutputBuffer(slot,false);}
   JSONObject snapshot=speech.snapshot();String partial=snapshot.optString("partial");if(!partial.isEmpty()&&!partial.equals(previous)){partialChanges++;if(first==0)first=SystemClock.elapsedRealtime()-start;previous=partial;}
   if(SystemClock.elapsedRealtime()-start>30000)throw new IOException("continuous test timeout");
  }
  decoder.finish();Thread.sleep(700);JSONObject report=speech.snapshot().put("firstPartialMs",first).put("elapsedMs",SystemClock.elapsedRealtime()-start).put("audioMs",audio.length*1000L/32000).put("partialChanges",partialChanges).put("opusPackets",packetCount);
  try(FileOutputStream out=getTargetContext().openFileOutput("continuous-pipeline-probe.json",0)){out.write(report.toString().getBytes("UTF-8"));}result.putString("result",report.toString());finish(-1,result);
 }catch(Exception e){result.putString("error",e.toString());finish(0,result);}finally{if(encoder!=null){try{encoder.stop();}catch(Exception ignored){}encoder.release();}if(decoder!=null)decoder.close();if(speech!=null)speech.close();}}
}
''',encoding='utf-8')
p=r/'AndroidManifest.xml';s=p.read_text(encoding='utf-8').replace('</manifest>','<instrumentation android:name="com.mcnex.conversation.ContinuousPipelineProbe" android:targetPackage="com.mcnex.conversation"/></manifest>');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/NativeKoreanSpeech.java');s=p.read_text(encoding='utf-8').replace('if(text.equals(lastFinal)&&partial.isEmpty())return;','');p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('polling=false;', 'polling=false,stopTask=null;',1).replace('if(!ready||starting||capture||consumer||suspended)', 'if(!ready||starting||capture||consumer||suspended||stopTask)');a=s.index('async function stop(flush=true){');b=s.index('async function automaticHelp(){',a);old=s[a:b];old=old.replace('async function stop(flush=true){','function stop(flush=true){if(stopTask)return stopTask;stopTask=(async()=>{',1);end=old.rfind('}');old=old[:end]+"})().finally(()=>{stopTask=null;});return stopTask;}"+old[end+1:];s=s[:a]+old+s[b:];p.write_text(s,encoding='utf-8')
