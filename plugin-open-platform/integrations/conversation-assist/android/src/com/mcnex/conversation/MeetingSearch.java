package com.mcnex.conversation;
import org.json.*;import java.io.*;import java.text.Normalizer;import java.util.*;
final class MeetingSearch {
 static String normalize(String s){return Normalizer.normalize(s,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("\\s+","");}
 static boolean matches(String text,String[] words){String source=normalize(text);for(String word:words)if(!source.contains(normalize(word)))return false;return true;}
 static String snippet(String text,String[] words){String line="";for(String candidate:text.split("\n")){for(String w:words)if(normalize(candidate).contains(normalize(w))){line=candidate;break;}if(!line.isEmpty())break;}if(line.isEmpty())line=text;line=line.replaceAll("\\s+"," ").trim();return line.length()>180?line.substring(0,180)+"…":line;}
 static JSONArray search(MeetingStore store,String query)throws Exception{JSONArray list=store.list();if(query.trim().isEmpty())return list;String[] words=query.trim().split("\\s+");JSONArray out=new JSONArray();for(int i=0;i<list.length();i++){JSONObject m=list.getJSONObject(i);File d=store.dir(m.getString("id"));String raw=MeetingStore.read(new File(d,"transcript.txt")),minutes=MeetingStore.read(new File(d,"minutes.txt")),title=m.optString("title");if(!matches(title+"\n"+raw+"\n"+minutes,words))continue;boolean rawHit=matches(raw,words),minutesHit=matches(minutes,words);m.put("searchKind",rawHit?"자막 원문":minutesHit?"AI 회의록":"제목 / 통합 내용").put("searchTab",rawHit?0:minutesHit?1:0).put("searchSnippet",snippet(rawHit?raw:minutesHit?minutes:title+"\n"+raw,words));out.put(m);}return out;}
}
