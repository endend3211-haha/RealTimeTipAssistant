package com.mcnex.conversation;
import com.google.ai.edge.litertlm.*;
import java.io.File;
import java.util.Collections;
public final class LiteAi implements AiEngine {
 private final Engine engine;
 private volatile Conversation current;
 public LiteAi(File model,File cache){
  engine=new Engine(new EngineConfig(model.getAbsolutePath(),new Backend.GPU(),null,null,4096,null,cache.getAbsolutePath()));engine.initialize();
 }
 public synchronized String explain(String context,String term,String mode){
  String instruction=AiPrompts.instruction(mode);
  try(Conversation conversation=engine.createConversation(new ConversationConfig())){
   current=conversation;
   try{return conversation.sendMessage(instruction+"\n"+AiPrompts.input(context,term,mode),Collections.emptyMap(),null,null,null,mode.equals("reply")?160:128,new ThinkingConfig(false)).toString();}
   finally{current=null;}
  }
 }
 public synchronized String minutes(String instruction,String text,int maxTokens){
  try(Conversation conversation=engine.createConversation(new ConversationConfig())){current=conversation;try{return conversation.sendMessage(instruction+"\n<원문>\n"+text+"\n</원문>",Collections.emptyMap(),null,null,null,maxTokens,new ThinkingConfig(false)).toString();}finally{current=null;}}
 }
 public void cancel(){try{if(current!=null)current.cancelProcess();}catch(Exception ignored){}}
 public synchronized void close(){engine.close();}
}
