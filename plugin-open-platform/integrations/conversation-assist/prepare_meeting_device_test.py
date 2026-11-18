from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace("542,295,510);ctx.fillText('한 번: 페이지 · 두 번: 자막/도움 · 길게: 듣기/정지',542,313,510)","314,313,222);ctx.fillText('한 번: 페이지 · 두 번: 자막/도움 · 길게: 듣기/정지',542,313,220)").replace("ctx.font='10px sans-serif';ctx.fillText(`${pageIndex", "ctx.font='9px sans-serif';ctx.fillText(`${pageIndex");p.write_text(s,encoding='utf-8')
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'MeetingStore.java';s=p.read_text(encoding='utf-8').replace(' void finish(String id,long time)throws Exception{File draft=', ' void sealDraft(String id)throws Exception{File draft=new File(dir(id),"draft.json");if(draft.isFile()){JSONObject p=new JSONObject(read(draft));append(id,p.getString("id"),p.getString("text"),p.getLong("time"),true);}}\n void finish(String id,long time)throws Exception{File draft=');p.write_text(s,encoding='utf-8')
p=r/'MeetingManager.java';s=p.read_text(encoding='utf-8').replace('JSONObject m=store.meta(activeId);m.put("status","recording")','store.sealDraft(activeId);JSONObject m=store.meta(activeId);m.put("status","recording")');p.write_text(s,encoding='utf-8')
p=r/'AssistService.java';s=p.read_text(encoding='utf-8').replace('@Override public void onDestroy(){running=false;', '@Override public void onDestroy(){running=false;if(meetings!=null)meetings.pause();');p.write_text(s,encoding='utf-8')
r=Path('integrations/conversation-assist/android/debug')
(r/'MeetingFeatureProbe.java').write_text('''package com.mcnex.conversation;
import android.app.*;import android.content.*;import android.os.*;import org.json.*;import java.io.*;
public class MeetingFeatureProbe extends Instrumentation {
 public void onCreate(Bundle b){super.onCreate(b);start();}
 public void onStart(){try{
  MeetingManager manager=MeetingManager.get(getTargetContext());if(!manager.state().optString("activeId").isEmpty())throw new IOException("진행 중인 사용자 회의가 있어 테스트를 중단합니다");
  long now=System.currentTimeMillis();String id=manager.store.create(now);JSONObject meta=manager.store.meta(id);meta.put("title","테스트 회의 · 역광 개선").put("testFixture",true);manager.store.writeMeta(id,meta);
  String[] lines={"테스트 회의입니다. 참석자는 김민수와 이서연입니다.","목적은 카메라 역광에서 얼굴이 어두워지는 문제를 개선하는 것입니다.","HDR A안과 B안을 비교했습니다. B안은 얼굴 밝기는 좋아졌지만 소비 전력 검증이 필요합니다.","결정 사항: 다음 시제품에는 B안을 적용하기로 합의했습니다.","김민수는 11월 6일까지 HDR 비교 시험을 수행하고 결과를 공유합니다.","이서연은 11월 7일까지 소비 전력 측정 자료를 준비합니다.","추가 예산과 최종 양산 일정은 확정하지 않았습니다.","다음 회의에서 전력 측정 결과를 확인한 후 최종 적용 여부를 논의합니다."};
  for(int i=0;i<lines.length;i++)manager.store.append(id,"fixture-"+i,lines[i],now+i*3000L,false);manager.store.finish(id,now+60000);manager.store.active(null);
  String old=manager.store.create(now-86400000L);meta=manager.store.meta(old);meta.put("title","테스트 회의 · 사전 검토").put("testFixture",true);manager.store.writeMeta(old,meta);manager.store.append(old,"earlier","테스트용 사전 검토 기록입니다.",now-86400000L,false);manager.store.finish(old,now-86340000L);manager.store.active(null);
  manager.generate(id);long until=System.currentTimeMillis()+180000;JSONObject state;do{Thread.sleep(500);state=manager.store.meta(id);}while(!state.optString("minutesStatus").equals("ready")&&!state.optString("minutesStatus").equals("failed")&&System.currentTimeMillis()<until);
  JSONObject report=new JSONObject().put("id",id).put("other",old).put("meta",state).put("transcript",MeetingStore.read(manager.store.document(id,"transcript")));if(state.optString("minutesStatus").equals("ready"))report.put("minutes",MeetingStore.read(manager.store.document(id,"minutes")));
  try(FileOutputStream file=getTargetContext().openFileOutput("meeting-feature-probe.json",0)){file.write(report.toString().getBytes("UTF-8"));}
  startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));Bundle result=new Bundle();result.putString("status",state.optString("minutesStatus"));result.putString("report","meeting-feature-probe.json");sendStatus(1,result);
  File end=new File(getTargetContext().getFilesDir(),"meeting-probe.done");end.delete();long viewUntil=System.currentTimeMillis()+90000;while(!end.exists()&&System.currentTimeMillis()<viewUntil)Thread.sleep(250);finish(state.optString("minutesStatus").equals("ready")?-1:0,result);
 }catch(Exception e){Bundle b=new Bundle();b.putString("error",e.toString());finish(0,b);}}
}
''',encoding='utf-8')
p=r/'AndroidManifest.xml';s=p.read_text(encoding='utf-8').replace('</manifest>','<instrumentation android:name="com.mcnex.conversation.MeetingFeatureProbe" android:targetPackage="com.mcnex.conversation"/></manifest>');p.write_text(s,encoding='utf-8')
