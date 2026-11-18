package com.mcnex.conversation;
interface AiEngine extends AutoCloseable {
 String explain(String context,String term,String mode)throws Exception;
 String minutes(String instruction,String text,int maxTokens)throws Exception;
 void cancel();
 void close();
}
