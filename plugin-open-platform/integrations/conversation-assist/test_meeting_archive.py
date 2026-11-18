from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'MeetingStore.java';s=p.read_text(encoding='utf-8').replace('(event.toString()+"\\n")','("\\n"+event.toString()+"\\n")');p.write_text(s,encoding='utf-8')
p=r/'MeetingManager.java';s=p.read_text(encoding='utf-8');needle=' private static List<String> chunks(String text,int limit)';a=s.index(needle);b=s.index(' private void createMinutes',a);s=s[:a]+s[b:];s=s.replace('chunks(transcript,750)','MeetingText.chunks(transcript,750)').replace('chunks(String.join("\\n",reduced),750)','MeetingText.chunks(String.join("\\n",reduced),750)')
s=s.replace('if(id.equals(active()))active(null);','if(id.equals(active()))active(null);')
p.write_text(s,encoding='utf-8')
(r/'MeetingText.java').write_text('''package com.mcnex.conversation;
import java.util.*;
final class MeetingText {
 static List<String> chunks(String text,int limit){if(limit<2)throw new IllegalArgumentException("chunk limit");List<String> out=new ArrayList<>();for(int start=0;start<text.length();){int end=Math.min(start+limit,text.length());if(end<text.length()){int line=text.lastIndexOf('\\n',end-1);if(line>start+limit/2)end=line+1;else if(Character.isHighSurrogate(text.charAt(end-1)))end--;}out.add(text.substring(start,end));start=end;}return out;}
}
''',encoding='utf-8')
t=Path('integrations/conversation-assist/android/tests/com/mcnex/conversation');t.mkdir(parents=True,exist_ok=True)
(t/'MeetingStoreTest.java').write_text('''package com.mcnex.conversation;
import org.junit.*;import static org.junit.Assert.*;import org.json.*;import java.io.*;import java.nio.file.*;import java.util.*;
public class MeetingStoreTest {
 @Test public void oneHourBeyond500SurvivesReopen()throws Exception{File root=Files.createTempDirectory("memo-meeting-test").toFile();MeetingStore s=new MeetingStore(root);String id=s.create(0);for(int i=0;i<620;i++)s.append(id,"utterance-"+i,"발언 "+i+" 전체 회의 원문을 기록합니다.",i*6000L,false);s.append(id,"utterance-0","중복이면 안 됩니다",1,false);String longText=String.join("",Collections.nCopies(900,"긴 원문 "));s.append(id,"long",longText,3600000,false);s.checkpoint(id,"tail","종료 직전 미확정 문장입니다");s.finish(id,3720000);MeetingStore reopened=new MeetingStore(root);String transcript=MeetingStore.read(reopened.document(id,"transcript"));assertTrue(transcript.contains("발언 0 "));assertTrue(transcript.contains("발언 619 "));assertTrue(transcript.contains(longText));assertTrue(transcript.contains("[미확정 자막] 종료 직전"));assertFalse(transcript.contains("중복이면"));assertEquals(622,reopened.meta(id).getInt("segments"));assertEquals("completed",reopened.meta(id).getString("status"));assertNull(reopened.active());assertEquals(1,reopened.list().length());}
 @Test public void confirmedDraftDoesNotDuplicateAndJournalRecoveryKeepsLaterData()throws Exception{MeetingStore s=new MeetingStore(Files.createTempDirectory("memo-recover").toFile());String id=s.create(1);s.checkpoint(id,"a","중간");s.append(id,"a","확정",2,false);s.checkpoint(id,"a","늦게 도착한 중간 자막");try(FileOutputStream out=new FileOutputStream(new File(s.dir(id),"events.jsonl"),true)){out.write("{incomplete".getBytes("UTF-8"));}s.append(id,"b","다음 문장",3,false);s.finish(id,4);s.rebuildTranscript(id);String text=MeetingStore.read(s.document(id,"transcript"));assertTrue(text.contains("확정"));assertTrue(text.contains("다음 문장"));assertFalse(text.contains("중간"));assertEquals(2,s.meta(id).getInt("segments"));}
 @Test public void meetingIdsCannotEscapeStorage()throws Exception{MeetingStore s=new MeetingStore(Files.createTempDirectory("memo-path").toFile());try{s.dir("../../elsewhere");fail();}catch(IOException expected){}}
 @Test public void everyCharacterOfLongMeetingIsIncludedInChunkPlan(){String original=String.join("",Collections.nCopies(1000,"회의 문장과 결정 사항입니다. 👋\\n"));List<String> chunks=MeetingText.chunks(original,750);assertTrue(chunks.size()>10);assertEquals(original,String.join("",chunks));for(String c:chunks){assertTrue(c.length()<=750);assertFalse(Character.isHighSurrogate(c.charAt(c.length()-1)));}}
 @Test public void pairingWindowIsLoopbackScopedSingleUseAndExpires(){PairingGate g=new PairingGate();g.open(100000);assertFalse(g.claim("https://example.com","com.mcnex.conversation.phone",100001));assertFalse(g.claim("http://127.0.0.1:1234","other",100001));assertTrue(g.claim("http://127.0.0.1:1234","com.mcnex.conversation.phone",100001));assertFalse(g.claim("http://127.0.0.1:1234","com.mcnex.conversation.phone",100002));g.open(200000);assertFalse(g.claim("http://127.0.0.1:1234","com.mcnex.conversation.phone",260001));}
}
''',encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8')+"\nandroid.sourceSets.test.java.srcDirs=['tests']\n";p.write_text(s,encoding='utf-8')
