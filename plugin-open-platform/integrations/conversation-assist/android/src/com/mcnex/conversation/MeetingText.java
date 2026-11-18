package com.mcnex.conversation;
import java.util.*;
final class MeetingText {
 static List<String> chunks(String text,int limit){if(limit<2)throw new IllegalArgumentException("chunk limit");List<String> out=new ArrayList<>();for(int start=0;start<text.length();){int end=Math.min(start+limit,text.length());if(end<text.length()){int line=text.lastIndexOf('\n',end-1);if(line>start+limit/2)end=line+1;else if(Character.isHighSurrogate(text.charAt(end-1)))end--;}out.add(text.substring(start,end));start=end;}return out;}
}
