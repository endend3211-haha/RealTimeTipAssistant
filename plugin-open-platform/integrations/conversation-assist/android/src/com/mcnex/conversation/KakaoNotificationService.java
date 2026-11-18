package com.mcnex.conversation;
import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
public final class KakaoNotificationService extends NotificationListenerService {
 private static volatile KakaoNotificationService connected;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 @Override public void onListenerConnected(){connected=this;KakaoMemoryJob.schedule(this);if(KakaoMemory.get(this).enabled())importCurrent(null);}
 @Override public void onListenerDisconnected(){if(connected==this)connected=null;}
 static void requestImport(android.content.Context context,java.util.function.Consumer<String> callback){if(!KakaoMemory.get(context).enabled()){callback.accept("먼저 카카오톡 수집 스위치를 켜주세요");return;}KakaoNotificationService service=connected;if(service==null){NotificationListenerService.requestRebind(new android.content.ComponentName(context,KakaoNotificationService.class));callback.accept("알림 연결을 준비 중입니다. 잠시 후 다시 눌러주세요");return;}service.importCurrent(callback);}
 static long ingestActive(StatusBarNotification[] notifications,KakaoMemory store)throws Exception{synchronized(store){store.prune();long before=android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(),"SELECT count(*) FROM messages",null);if(notifications!=null)for(StatusBarNotification notification:notifications){try{ingest(notification,store);}catch(Exception ignored){}}return android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(),"SELECT count(*) FROM messages",null)-before;}}
 private void importCurrent(java.util.function.Consumer<String> callback){KakaoMemory store=KakaoMemory.get(this);long epoch=store.generation();worker.execute(()->{String result;try{synchronized(store){if(!store.enabled()||epoch!=store.generation())return;StatusBarNotification[] notifications=getActiveNotifications();if(notifications==null)throw new IllegalStateException();long added=ingestActive(notifications,store);int active=0;for(StatusBarNotification n:notifications)if("com.kakao.talk".equals(n.getPackageName()))active++;long total=android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(),"SELECT count(*) FROM messages",null);result="카카오톡 알림 "+active+"개 확인 · 새로 저장 "+added+"건 · 보관 "+total+"건";getSharedPreferences("kakao-memory",0).edit().putString("lastImport",result).putLong("lastImportAt",System.currentTimeMillis()).apply();}}catch(Exception e){result="현재 알림을 읽지 못했습니다. 알림 접근 권한과 연결 상태를 확인해주세요";}if(callback!=null){String message=result;new android.os.Handler(android.os.Looper.getMainLooper()).post(()->callback.accept(message));}});}

 @Override public void onNotificationPosted(StatusBarNotification notification){if(!"com.kakao.talk".equals(notification.getPackageName()))return;KakaoMemory store=KakaoMemory.get(this);if(!store.enabled())return;long epoch=store.generation();worker.execute(()->{try{synchronized(store){if(epoch==store.generation())ingest(notification,store);}}catch(Exception ignored){/* Never log notification contents. */}});}
 static void ingest(StatusBarNotification sbn,KakaoMemory store)throws Exception {
  if(!"com.kakao.talk".equals(sbn.getPackageName())||(sbn.getNotification().flags&Notification.FLAG_GROUP_SUMMARY)!=0||!store.enabled())return;
  Bundle e=sbn.getNotification().extras;
  String title=String.valueOf(e.getCharSequence(Notification.EXTRA_TITLE,""));
  android.os.Parcelable[] bundles=e.getParcelableArray(Notification.EXTRA_MESSAGES);
  java.util.List<Notification.MessagingStyle.Message> messages=bundles==null?java.util.Collections.emptyList():Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles);
  if(!messages.isEmpty()){
   String room=String.valueOf(e.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE,title));
   for(Notification.MessagingStyle.Message m:messages){String sender=m.getSenderPerson()==null?"":String.valueOf(m.getSenderPerson().getName());save(store,sbn.getKey()+"|"+m.getTimestamp(),m.getTimestamp(),room,sender,m.getText()==null?"":m.getText().toString());}
  }else{
   CharSequence body=e.getCharSequence(Notification.EXTRA_BIG_TEXT);if(body==null)body=e.getCharSequence(Notification.EXTRA_TEXT);
   if(body!=null)save(store,sbn.getKey(),sbn.getPostTime(),title,"",body.toString());
  }
 }
 private static void save(KakaoMemory store,String key,long at,String room,String sender,String body)throws Exception {
  if(body.matches("(?is).*(인증번호|인증코드|일회용 비밀번호|OTP).*"))return;
  String day=java.time.Instant.ofEpochMilli(at).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString();
  byte[] digest=MessageDigest.getInstance("SHA-256").digest((key+"|"+day+"|"+room+"|"+sender+"|"+body).getBytes(StandardCharsets.UTF_8));
  store.add(java.util.Base64.getEncoder().encodeToString(digest),at,room,sender,body);
 }
 @Override public void onDestroy(){if(connected==this)connected=null;worker.shutdown();super.onDestroy();}
}
