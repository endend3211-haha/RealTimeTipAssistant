package com.mcnex.conversation;
import java.io.*;import java.nio.charset.StandardCharsets;
public final class LocalAi implements AiEngine {
 static {System.loadLibrary("conversation");}
 private volatile long handle;private final Object lifetime=new Object();
 public LocalAi(File file)throws IOException{this(file,false);}
 public LocalAi(File file,boolean gpu)throws IOException{handle=load(file.getAbsolutePath(),gpu);}
 public synchronized String explain(String context,String term,String mode)throws IOException{return run(AiPrompts.instruction(mode),AiPrompts.input(context,term,mode),mode.equals("reply")?160:128);}
 public synchronized String minutes(String instruction,String text,int maxTokens)throws IOException{return run(instruction,"<원문>\n"+text+"\n</원문>",maxTokens);}
 private String run(String system,String user,int tokens)throws IOException{if(handle==0)throw new IOException("GGUF 모델이 준비되지 않았습니다");return new String(generate(handle,system.getBytes(StandardCharsets.UTF_8),user.getBytes(StandardCharsets.UTF_8),tokens),StandardCharsets.UTF_8).trim();}
 public void cancel(){synchronized(lifetime){if(handle!=0)cancel(handle);}}
 public synchronized void close(){synchronized(lifetime){if(handle!=0){free(handle);handle=0;}}}
 public synchronized String backend(){return device(handle);}
 private static native String device(long handle);
 private static native long load(String path,boolean gpu)throws IOException;
 private static native byte[] generate(long handle,byte[] system,byte[] user,int maxTokens)throws IOException;
 private static native void cancel(long handle);
 private static native void free(long handle);
}
