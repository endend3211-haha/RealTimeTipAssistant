package com.mcnex.conversation;
import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import com.memomind.companion.WhisperEngine;

/** Bounded, token-authenticated loopback only. No internet upstream or microphone. */
public class AssistService extends Service {
 static volatile AssistService current;private PowerManager.WakeLock phoneWake;private volatile PhoneMicrophone phoneMic;private volatile String phoneError="";public static volatile boolean running=false;static final PairingGate PAIRING=new PairingGate();
 public static volatile String status="중지됨";
 private ServerSocket server;
 private final ThreadPoolExecutor clients=new ThreadPoolExecutor(3,3,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(4));
 private final ReentrantLock speechLock=new ReentrantLock(),aiLock=MeetingManager.AI_LOCK;private MeetingManager meetings;
 private volatile AiEngine ai;
 private volatile WhisperEngine whisper;private volatile NativeKoreanSpeech liveSpeech;private volatile ContinuousOpus liveOpus;
 static String token(Context c){android.content.SharedPreferences p=c.getSharedPreferences("connection",0);String t=p.getString("token",null);if(t==null){byte[] b=new byte[24];new SecureRandom().nextBytes(b);t=android.util.Base64.encodeToString(b,android.util.Base64.NO_WRAP|android.util.Base64.URL_SAFE);p.edit().putString("token",t).apply();}return t;}
 @Override public void onCreate(){super.onCreate();current=this;meetings=MeetingManager.get(this);
  NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel("conversation","로컬 대화 도우미",NotificationManager.IMPORTANCE_LOW));
  startForeground(1,new Notification.Builder(this,"conversation").setContentTitle("Memo 대화 도우미").setContentText("휴대폰 내부에서만 음성·AI 처리 · 앱에서 중지 가능").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentIntent(PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE)).build());
  token(this);PAIRING.open(System.currentTimeMillis());new Thread(()->{try{server=new ServerSocket();server.bind(new InetSocketAddress("127.0.0.1",18772),4);running=true;status="연결 대기";while(!server.isClosed()){Socket s=server.accept();try{clients.execute(()->handle(s));}catch(RejectedExecutionException busy){s.close();}}}catch(Exception e){if(running)status="서버 오류: "+e.getMessage();}finally{running=false;}},"conversation-loopback").start();
 }
 @Override public int onStartCommand(Intent i,int f,int id){PAIRING.open(System.currentTimeMillis());if(i!=null&&"phone-start".equals(i.getAction()))new Thread(()->{try{startPhone();}catch(Exception e){phoneError=e.getMessage();status=phoneError;}},"phone-start").start();if(i!=null&&"phone-pause".equals(i.getAction()))new Thread(this::pausePhone,"phone-pause").start();return START_NOT_STICKY;}
 void startPhone()throws Exception{speechLock.lock();try{if(phoneMic!=null&&phoneMic.recording())return;if(liveOpus!=null&&liveSpeech!=null&&liveSpeech.snapshot().optBoolean("running"))throw new IOException("글라스 듣기를 먼저 정지하세요");if(phoneMic!=null){phoneMic.close();phoneMic=null;}if(liveOpus!=null){liveOpus.close();liveOpus=null;}if(liveSpeech!=null)liveSpeech.close();phoneError="";liveSpeech=new NativeKoreanSpeech(this,meetings.begin());try{phoneMic=new PhoneMicrophone(liveSpeech);}catch(Exception e){liveSpeech.close();meetings.pause();throw e;}phoneWake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Memo:PhoneMeeting");phoneWake.acquire();status="휴대폰 마이크 · 회의 기록 중";PhoneMicrophone selectedMic=phoneMic;new Thread(()->{while(selectedMic.recording())try{Thread.sleep(1000);}catch(InterruptedException e){return;}if(!selectedMic.error.isEmpty()&&phoneMic==selectedMic){phoneError=selectedMic.error;pausePhone();}},"phone-microphone-watch").start();}finally{speechLock.unlock();}}
 void pausePhone(){speechLock.lock();try{stopPhoneLocked();meetings.pause();status="휴대폰 회의 일시정지";}finally{speechLock.unlock();}}
 private void stopPhoneLocked(){if(phoneWake!=null&&phoneWake.isHeld())phoneWake.release();phoneWake=null;if(phoneMic!=null){phoneMic.close();phoneMic=null;}}
 JSONObject phoneSnapshot()throws Exception{JSONObject out=liveSpeech==null?new JSONObject():liveSpeech.snapshot();return out.put("phoneRecording",phoneMic!=null&&phoneMic.recording()).put("phoneError",!phoneError.isEmpty()?phoneError:phoneMic==null?"":phoneMic.error).put("meeting",meetings.state());}
 @Override public IBinder onBind(Intent i){return null;}
 private static String line(InputStream in)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();int c;while((c=in.read())!=-1){if(c==10)break;if(c!=13)b.write(c);if(b.size()>8192)throw new IOException("Header too large");}return b.toString("US-ASCII");}
 private static JSONObject obj(String k,Object v)throws JSONException{return new JSONObject().put(k,v);}
 private void handle(Socket socket){try(Socket s=socket){s.setSoTimeout(15000);InputStream in=s.getInputStream();String[] request=line(in).split(" ");if(request.length!=3)return;String method=request[0],path=request[1];Map<String,String> headers=new HashMap<>();for(int i=0;i<40;i++){String l=line(in);if(l.isEmpty())break;int colon=l.indexOf(':');if(colon<1)throw new IOException("Invalid header");headers.put(l.substring(0,colon).toLowerCase(Locale.ROOT),l.substring(colon+1).trim());if(i==39)throw new IOException("Too many headers");}
  if(method.equals("OPTIONS")){respond(s,204,new JSONObject());return;}
  if(path.equals("/pair")&&method.equals("GET")){if(!PAIRING.claim(headers.get("origin"),headers.get("x-memo-plugin"),System.currentTimeMillis())){respond(s,423,obj("error","APK에서 자동 연결을 시작하세요"));return;}respond(s,200,new JSONObject().put("token",token(this)).put("service","Memo Conversation Assist"));return;}
  byte[] expected=("Bearer "+token(this)).getBytes(StandardCharsets.UTF_8),got=headers.getOrDefault("authorization","").getBytes(StandardCharsets.UTF_8);
  if(!MessageDigest.isEqual(expected,got)){respond(s,401,obj("error","연결 키를 확인하세요"));return;}
  if(path.equals("/health")&&method.equals("GET")){respond(s,200,new JSONObject().put("service","Memo Conversation Assist").put("version","0.6.0").put("helpPolicy","questions-v2").put("model",meetings.hasModel()).put("status",status));return;}
  if(path.equals("/transcript")&&method.equals("GET")){respond(s,200,liveSpeech==null?new JSONObject().put("running",false).put("partial","").put("finals",new JSONArray()):liveSpeech.snapshot().put("meeting",meetings.state()));return;}
  if(path.equals("/prepare")&&method.equals("POST")){if(!speechLock.tryLock()){respond(s,429,obj("error","음성 처리 중입니다"));return;}try{if(phoneMic!=null&&phoneMic.recording())throw new IOException("휴대폰 회의를 먼저 일시정지하세요");if(liveOpus!=null){liveOpus.close();liveOpus=null;}if(liveSpeech!=null)liveSpeech.close();liveSpeech=new NativeKoreanSpeech(this,meetings.begin());liveOpus=new ContinuousOpus(liveSpeech);respond(s,200,liveSpeech.snapshot().put("ready",true).put("meeting",meetings.state()));}catch(Exception|LinkageError e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}
  if(path.equals("/finish")&&method.equals("POST")){speechLock.lock();try{if(phoneMic!=null&&phoneMic.recording()){respond(s,409,obj("error","휴대폰 회의가 진행 중입니다"));return;}if(liveOpus!=null){try{liveOpus.finish();}catch(Exception alreadyStopped){}finally{liveOpus.close();liveOpus=null;}}meetings.pause();if(liveSpeech!=null){Thread.sleep(500);respond(s,200,liveSpeech.snapshot());}else respond(s,200,obj("ok",true));}catch(Exception e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}
  if(path.equals("/meetings")&&method.equals("GET")){respond(s,200,new JSONObject().put("items",meetings.list()).put("state",meetings.state()));return;}
  if(path.equals("/meeting/complete")&&method.equals("POST")){speechLock.lock();try{stopPhoneLocked();if(liveOpus!=null){try{liveOpus.finish();}catch(Exception alreadyStopped){}finally{liveOpus.close();liveOpus=null;}}if(liveSpeech!=null){long until=System.currentTimeMillis()+2000;while(liveSpeech.snapshot().optBoolean("running")&&System.currentTimeMillis()<until)Thread.sleep(50);}String id=meetings.complete();if(liveSpeech!=null){liveSpeech.close();liveSpeech=null;}respond(s,200,new JSONObject().put("meetingId",id).put("minutesStatus","queued"));}catch(Exception e){respond(s,500,obj("error",e.getMessage()));}finally{speechLock.unlock();}return;}
  if(path.equals("/cancel")&&method.equals("POST")){meetings.cancelAi();if(phoneMic==null&&liveSpeech!=null)liveSpeech.close();respond(s,200,obj("ok",true));return;}
  if(!method.equals("POST")||!(path.equals("/audio")||path.equals("/explain"))){respond(s,404,obj("error","Unknown route"));return;}
  if(headers.containsKey("transfer-encoding")){respond(s,400,obj("error","Content-Length required"));return;}
  int length=Integer.parseInt(headers.getOrDefault("content-length","0"));if(length<1||length>700000){respond(s,413,obj("error","요청 크기 초과"));return;}
  byte[] body=new byte[length];new DataInputStream(in).readFully(body);
  ReentrantLock inference=path.equals("/audio")?speechLock:aiLock;
  if(!inference.tryLock()){respond(s,429,obj("error","같은 종류의 요청을 처리 중입니다"));return;}
  try {
   if(path.equals("/audio")){
    status="한국어 음성인식 중";
    if(liveOpus==null||liveSpeech==null)throw new IOException("지속 인식을 먼저 시작하세요");liveOpus.accept(body);respond(s,200,liveSpeech.snapshot());
   }else{
    JSONObject data=new JSONObject(new String(body,StandardCharsets.UTF_8));String context=data.optString("context"),term=data.optString("term","최근 발언"),mode=data.optString("mode","term");
    if(!mode.equals("term")&&!mode.equals("reply")&&!mode.equals("assist")){respond(s,400,obj("error","지원하지 않는 도움 요청입니다"));return;}
    if(context.isEmpty()||context.length()>1800||term.isEmpty()||term.length()>48){respond(s,400,obj("error","최근 대화는 1800자, 선택 용어는 48자 이내입니다"));return;}
    String definition=mode.equals("term")?Glossary.exact(term):null;
    if(definition!=null){respond(s,200,new JSONObject().put("text",term+" · "+definition).put("source","로컬 용어 사전").put("term",term).put("timing",new JSONObject().put("cold",false).put("loadMs",0).put("generateMs",0)));return;}
    if(!meetings.hasModel()){respond(s,409,obj("error","설정에서 선택한 AI 모델을 등록하세요"));return;}
    status=meetings.modelName()+" 설명 생성 중";
    long loadStart=android.os.SystemClock.elapsedRealtime();AiEngine previous=ai;ai=meetings.engine();boolean cold=previous!=ai;long loaded=android.os.SystemClock.elapsedRealtime();
    if(mode.equals("assist")){JSONArray avoid=data.optJSONArray("avoidTopics");if(avoid!=null){StringBuilder shown=new StringBuilder();for(int i=0;i<Math.min(12,avoid.length());i++)shown.append(avoid.optString(i).substring(0,Math.min(60,avoid.optString(i).length()))).append(" / ");context+="\n[이미 제공한 도움 주제: "+shown+". 같은 뜻의 설명을 반복하지 말고 중복이면 kind none으로 판단하세요.]";}}
    long memoryEpoch=KakaoMemory.get(this).generation();String answer=ai.explain(mode.equals("term")?context:KakaoMemory.get(this).augment(context),term,mode);long generated=android.os.SystemClock.elapsedRealtime();if(memoryEpoch!=KakaoMemory.get(this).generation()){respond(s,409,obj("error","AI 기억 설정이 변경되어 결과를 취소했습니다"));return;}if(answer.isEmpty())throw new IOException("설명 결과가 비어 있습니다");
    if(mode.equals("assist")){
     int first=answer.indexOf('{'),last=answer.lastIndexOf('}');if(first<0||last<first)throw new IOException("자동 도움 판단 형식 오류");
     JSONObject help=new JSONObject(answer.substring(first,last+1));String kind=help.optString("kind"),topic=help.optString("topic"),text=help.optString("text");
     if(!kind.equals("none")&&!kind.equals("term")&&!kind.equals("reply"))throw new IOException("자동 도움 종류 오류");
     if(!kind.equals("none")&&(topic.isEmpty()||topic.length()>48||text.isEmpty()||text.length()>500))throw new IOException("자동 도움 내용 오류");
     if(kind.equals("term")){String known=Glossary.exact(topic);if(known!=null)text=known;}
     respond(s,200,new JSONObject().put("kind",kind).put("topic",topic).put("text",kind.equals("none")?"":text).put("source",kind.equals("reply")?"AI 답변 힌트 · 확인 필요":"AI 자동 도움 · 확인 필요").put("timing",new JSONObject().put("cold",cold).put("loadMs",loaded-loadStart).put("generateMs",generated-loaded)));return;
    }
    respond(s,200,new JSONObject().put("text",answer).put("source",mode.equals("reply")?"로컬 AI 답변 후보 · 사실 확인 필요":meetings.modelName()+" · 사실 확인 필요").put("timing",new JSONObject().put("cold",cold).put("loadMs",loaded-loadStart).put("generateMs",generated-loaded)));
   }
  }catch(Exception|LinkageError e){respond(s,500,obj("error",e.getMessage()==null?e.getClass().getSimpleName():e.getMessage()));}
  finally{status="연결 대기";inference.unlock();}
 }catch(Exception ignored){/* No audio, text, or credentials in logs. */}}
 private static void respond(Socket s,int code,JSONObject data)throws IOException{byte[] body=data.toString().getBytes(StandardCharsets.UTF_8);String h="HTTP/1.1 "+code+" Response\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, X-Memo-Plugin\r\nAccess-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n";s.getOutputStream().write(h.getBytes(StandardCharsets.US_ASCII));s.getOutputStream().write(body);s.getOutputStream().flush();}
 @Override public void onDestroy(){current=null;running=false;stopPhoneLocked();if(meetings!=null)meetings.pause();try{if(server!=null)server.close();}catch(IOException ignored){}meetings.cancelAi();if(whisper!=null)whisper.cancel();if(liveSpeech!=null)liveSpeech.close();clients.shutdownNow();new Thread(()->{speechLock.lock();aiLock.lock();try{if(whisper!=null)whisper.close();if(liveOpus!=null)liveOpus.close();if(liveSpeech!=null)liveSpeech.close();}finally{aiLock.unlock();speechLock.unlock();}},"conversation-release").start();status="중지됨";super.onDestroy();}
}
