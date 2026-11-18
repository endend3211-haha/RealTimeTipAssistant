from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'MeetingStore.java';s=p.read_text(encoding='utf-8');idx=s.index(' JSONArray list()');s=s[:idx]+''' void removeTestFixture(String id)throws Exception{if(!meta(id).optBoolean("testFixture"))throw new IOException("테스트 기록만 정리할 수 있습니다");File target=dir(id);if(!target.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("잘못된 테스트 경로");try(java.util.stream.Stream<Path> files=Files.walk(target.toPath())){Path[] paths=files.sorted(Comparator.reverseOrder()).toArray(Path[]::new);for(Path path:paths)Files.delete(path);}known.remove(id);if(id.equals(active()))active(null);}
''' +s[idx:];p.write_text(s,encoding='utf-8')
p=r/'MeetingManager.java';s=p.read_text(encoding='utf-8');needle='JSONArray prior=store.list();for(int i=0;i<prior.length();i++){JSONObject m=prior.getJSONObject(i);String state='
s=s.replace(needle, 'boolean probes;try{Class.forName("com.mcnex.conversation.MeetingFeatureProbe");probes=true;}catch(ClassNotFoundException absent){probes=false;}JSONArray prior=store.list();for(int i=0;i<prior.length();i++){JSONObject m=prior.getJSONObject(i);if(!probes&&m.optBoolean("testFixture")){store.removeTestFixture(m.getString("id"));continue;}String state=')
p.write_text(s,encoding='utf-8')
