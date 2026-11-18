package com.mcnex.conversation;
import android.media.*;
import java.io.*;
import java.nio.*;
import com.memomind.companion.Pcm16k;
final class OpusDecode {
 static float[] decode(byte[] body)throws Exception {
  DataInputStream in=new DataInputStream(new ByteArrayInputStream(body));int frames=in.readInt();
  if(frames<5||frames>500)throw new IOException("음성 구간 길이 오류");
  byte[][] packets=new byte[frames][];
  for(int i=0;i<frames;i++){int n=in.readUnsignedShort();if(n<1||n>1275)throw new IOException("Opus 크기 오류");packets[i]=new byte[n];in.readFully(packets[i]);}
  if(in.available()!=0)throw new IOException("잘못된 오디오 데이터");
  MediaCodec codec=MediaCodec.createDecoderByType("audio/opus");Pcm16k pcm=new Pcm16k();
  try {
   MediaFormat f=MediaFormat.createAudioFormat("audio/opus",48000,1);byte[] head=new byte[19];
   System.arraycopy("OpusHead".getBytes("US-ASCII"),0,head,0,8);head[8]=1;head[9]=1;
   ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN).putInt(12,16000);f.setByteBuffer("csd-0",ByteBuffer.wrap(head));
   ByteBuffer delay=ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());delay.putLong(0);delay.flip();f.setByteBuffer("csd-1",delay);
   ByteBuffer roll=ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());roll.putLong(80000000);roll.flip();f.setByteBuffer("csd-2",roll);
   f.setInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);codec.configure(f,null,null,0);codec.start();
   int next=0;boolean eos=false,done=false;long until=System.nanoTime()+15000000000L;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
   while(!done){
    if(System.nanoTime()>until)throw new IOException("음성 디코딩 시간 초과");
    if(!eos){int slot=codec.dequeueInputBuffer(1000);if(slot>=0){
     if(next<frames){byte[] p=packets[next];codec.getInputBuffer(slot).put(p);codec.queueInputBuffer(slot,0,p.length,next++*20000L,0);}
     else {codec.queueInputBuffer(slot,0,0,next*20000L,MediaCodec.BUFFER_FLAG_END_OF_STREAM);eos=true;}
    }}
    int slot=codec.dequeueOutputBuffer(info,1000);
    if(slot==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){MediaFormat actual=codec.getOutputFormat();if(actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT)!=1)throw new IOException("모노 음성이 아닙니다");pcm.setRate(actual.getInteger(MediaFormat.KEY_SAMPLE_RATE));}
    if(slot>=0){ByteBuffer b=codec.getOutputBuffer(slot);b.position(info.offset);b.limit(info.offset+info.size);byte[] data=new byte[info.size];b.get(data);pcm.accept(data);done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(slot,false);}
   }
   return pcm.rms()<0.0005?new float[0]:pcm.finish();
  }finally{try{codec.stop();}catch(Exception ignored){}codec.release();}
 }
}
