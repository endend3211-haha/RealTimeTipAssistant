from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
(r/'MeetingStore.java').write_text('''package com.mcnex.conversation;
import org.json.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.nio.file.*;import java.text.SimpleDateFormat;import java.util.*;
/** Append-only disk transcript; no 500-entry or meeting-duration cap. */
final class MeetingStore {
 final File root;private final Map<String,Set<String>> known=new HashMap<>();
 MeetingStore(File root)throws IOException{this.root=root;if(!root.isDirectory()&&!root.mkdirs())throw new IOException("회의 저장소를 만들 수 없습니다");}
 File dir(String id)throws IOException{if(id==null||!id.matches("[a-f0-9-]{36}"))throw new IOException("잘못된 회의 ID");File d=new File(root,id);if(!d.isDirectory()&&!d.mkdirs())throw new IOException("회의 폴더 생성 실패");return d;}
 static void atomic(File file,String text)throws IOException{File tmp=new File(file.getParentFile(),file.getName()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(text.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Files.move(tmp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);}
 static String read(File file)throws IOException{return file.isFile()?new String(Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8):"";}
 JSONObject meta(String id)throws Exception{return new JSONObject(read(new File(dir(id),"meta.json")));}
 void writeMeta(String id,JSONObject value)throws Exception{atomic(new File(dir(id),"meta.json"),value.toString());}
 String create(long time)throws Exception{String id=UUID.randomUUID().toString();JSONObject m=new JSONObject().put("id",id).put("title",new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.KOREA).format(new Date(time))+" 회의").put("startedAt",time).put("status","recording").put("segments",0).put("minutesStatus","not_started");writeMeta(id,m);atomic(new File(root,"active.txt"),id);return id;}
 String active()throws IOException{String id=read(new File(root,"active.txt")).trim();return id.isEmpty()?null:id;}
 void active(String id)throws IOException{atomic(new File(root,"active.txt"),id==null?"":id);}
 private Set<String> ids(String id)throws Exception{Set<String> values=known.get(id);if(values==null){values=new HashSet<>();File f=new File(dir(id),"events.jsonl");if(f.isFile())try(BufferedReader reader=new BufferedReader(new InputStreamReader(new FileInputStream(f),StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null){try{values.add(new JSONObject(line).getString("id"));}catch(JSONException damaged){/* A crash may leave an incomplete last line. */}}}known.put(id,values);}return values;}
 void append(String id,String utterance,String text,long time,boolean draft)throws Exception{
  if(text==null||text.trim().isEmpty()||!ids(id).add(utterance))return;
  File d=dir(id);JSONObject event=new JSONObject().put("id",utterance).put("text",text).put("time",time).put("draft",draft);
  try(FileOutputStream out=new FileOutputStream(new File(d,"events.jsonl"),true)){out.write((event.toString()+"\\n").getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
  rebuildTranscript(id);
  JSONObject m=meta(id);m.put("segments",ids(id).size()).put("updatedAt",time);writeMeta(id,m);
  File f=new File(d,"draft.json");if(f.isFile()){JSONObject pending=new JSONObject(read(f));if(utterance.equals(pending.optString("id")))f.delete();}
 }
 void checkpoint(String id,String utterance,String text)throws Exception{if(text==null||text.isEmpty()||ids(id).contains(utterance))return;atomic(new File(dir(id),"draft.json"),new JSONObject().put("id",utterance).put("text",text).put("time",System.currentTimeMillis()).toString());}
 void finish(String id,long time)throws Exception{File draft=new File(dir(id),"draft.json");if(draft.isFile()){JSONObject p=new JSONObject(read(draft));append(id,p.getString("id"),p.getString("text"),p.getLong("time"),true);}JSONObject m=meta(id);m.put("status","completed").put("endedAt",time);writeMeta(id,m);if(id.equals(active()))active(null);}
 void rebuildTranscript(String id)throws Exception{File source=new File(dir(id),"events.jsonl"),target=new File(dir(id),"transcript.txt");File tmp=new File(dir(id),"transcript.txt.tmp");try(FileOutputStream out=new FileOutputStream(tmp);BufferedReader reader=new BufferedReader(new InputStreamReader(new FileInputStream(source),StandardCharsets.UTF_8))){String line;SimpleDateFormat clock=new SimpleDateFormat("HH:mm:ss",Locale.KOREA);while((line=reader.readLine())!=null){try{JSONObject e=new JSONObject(line);String text="["+clock.format(new Date(e.getLong("time")))+"] "+(e.optBoolean("draft")?"[미확정 자막] ":"")+e.getString("text")+"\\n";out.write(text.getBytes(StandardCharsets.UTF_8));}catch(JSONException damaged){}}out.getFD().sync();}Files.move(tmp.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING);}
 JSONArray list()throws Exception{List<JSONObject> result=new ArrayList<>();File[] dirs=root.listFiles(File::isDirectory);if(dirs!=null)for(File d:dirs)try{result.add(meta(d.getName()));}catch(Exception ignored){}result.sort((a,b)->Long.compare(b.optLong("startedAt"),a.optLong("startedAt")));JSONArray out=new JSONArray();for(JSONObject value:result)out.put(value);return out;}
 File document(String id,String kind)throws Exception{if(!kind.equals("transcript")&&!kind.equals("minutes"))throw new IOException("잘못된 문서 종류");File file=new File(dir(id),kind+".txt");if(!file.isFile())throw new IOException(kind.equals("minutes")?"회의록이 아직 생성되지 않았습니다":"저장된 자막이 없습니다");return file;}
}
''',encoding='utf-8')
