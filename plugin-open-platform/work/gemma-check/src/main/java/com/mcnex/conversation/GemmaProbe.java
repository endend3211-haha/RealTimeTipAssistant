package com.mcnex.conversation;
import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.widget.TextView;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.json.JSONObject;

public class GemmaProbe extends Activity {
 private ServerSocket server;
 private volatile boolean stopped;
 private String token;
 private String state;
 private TextView view;

 @Override public void onCreate(Bundle saved) {
  super.onCreate(saved);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  view=new TextView(this);
  view.setTextIsSelectable(true);
  setContentView(view);
  android.content.SharedPreferences prefs=getSharedPreferences("local_gemma",MODE_PRIVATE);
  token=prefs.getString("token",null);
  if(token==null){token=UUID.randomUUID().toString();prefs.edit().putString("token",token).apply();}
  show("모델 준비 중");
  new Thread(this::serve,"gemma-local").start();
 }

 private void show(String message) {
  state=message;
  runOnUiThread(()->view.setText("Gemma 2 로컬 요약\n"+message+"\n\nEloquentia 연결 코드\n"+token));
 }

 private void serve() {
  try (ServerSocket listener=new ServerSocket()) {
   server=listener;
   listener.bind(new InetSocketAddress("127.0.0.1",18773),4);
   try(LocalAi ai=new LocalAi(new File(getFilesDir(),"gemma.gguf"))){
    show("연결 준비됨");
    Log.i("MemoGemma","LOCAL_READY");
    while(!stopped){
     try(Socket client=listener.accept()){
      client.setSoTimeout(5000);
      handle(client,ai);
     }catch(SocketException e){if(stopped)break;}
     catch(Exception e){Log.w("MemoGemma","Invalid or interrupted request",e);}
    }
   }
  }catch(Exception|LinkageError e){if(!stopped){show("실행 실패 · "+e.getMessage());Log.e("MemoGemma","LOCAL_FAILED",e);}}
 }

 private void handle(Socket client,LocalAi ai)throws Exception {
  BufferedInputStream input=new BufferedInputStream(client.getInputStream());
  String[] request=line(input).split(" ");
  if(request.length!=3){reply(client,400,new JSONObject());return;}
  int size=0; String auth="";
  for(int i=0;i<40;i++){
   String header=line(input);
   if(header.isEmpty())break;
   int colon=header.indexOf(':');
   if(colon<0){reply(client,400,new JSONObject());return;}
   String key=header.substring(0,colon), value=header.substring(colon+1).trim();
   if(key.equalsIgnoreCase("Authorization"))auth=value;
   if(key.equalsIgnoreCase("Content-Length"))size=Integer.parseInt(value);
   if(i==39){reply(client,400,new JSONObject());return;}
  }
  if(!request[1].equals("/summary")){reply(client,404,new JSONObject());return;}
  if(request[0].equals("OPTIONS")){reply(client,204,null);return;}
  if(!request[0].equals("POST")){reply(client,405,new JSONObject());return;}
  if(!MessageDigest.isEqual(("Bearer "+token).getBytes(StandardCharsets.UTF_8),auth.getBytes(StandardCharsets.UTF_8))){
   reply(client,401,new JSONObject().put("error","연결 코드를 확인하세요."));return;
  }
  if(size<1||size>24000){reply(client,413,new JSONObject().put("error","요약 요청 크기를 확인하세요."));return;}
  byte[] body=new byte[size];
  new DataInputStream(input).readFully(body);
  String text=new JSONObject(new String(body,StandardCharsets.UTF_8)).optString("text").trim();
  if(text.isEmpty()||text.length()>3000){reply(client,400,new JSONObject().put("error","받아쓰기 텍스트 길이를 확인하세요."));return;}
  long start=android.os.SystemClock.elapsedRealtime();
  try{
   String answer=ai.minutes("다음 대화의 핵심과 결정 사항을 한국어로 간결하게 요약하세요. 원문에 없는 내용은 추가하지 마세요.",text,96);
   if(answer.isBlank())throw new IOException("Empty output");
   reply(client,200,new JSONObject().put("ok",true).put("summary",answer).put("via","Gemma 2 · 휴대폰").put("ms",android.os.SystemClock.elapsedRealtime()-start));
   Log.i("MemoGemma","LOCAL_SUMMARY_OK");
  }catch(IOException e){reply(client,500,new JSONObject().put("error","Gemma 요약 생성에 실패했습니다."));}
 }

 private static String line(InputStream input)throws IOException {
  ByteArrayOutputStream value=new ByteArrayOutputStream();
  for(int i=0;i<4096;i++){
   int b=input.read();
   if(b<0)throw new EOFException();
   if(b=='\n')return value.toString("US-ASCII").stripTrailing();
   value.write(b);
  }
  throw new IOException("Header too long");
 }

 private static void reply(Socket client,int status,JSONObject json)throws IOException {
  byte[] body=json==null?new byte[0]:json.toString().getBytes(StandardCharsets.UTF_8);
  String headers="HTTP/1.1 "+status+" Response\r\nContent-Type: application/json; charset=utf-8\r\n"
   +"Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\n"
   +"Access-Control-Allow-Headers: Authorization, Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
   +"Cache-Control: no-store\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n";
  OutputStream output=client.getOutputStream();
  output.write(headers.getBytes(StandardCharsets.US_ASCII));output.write(body);output.flush();
 }

 @Override protected void onDestroy(){
  stopped=true;
  if(server!=null)try{server.close();}catch(IOException ignored){}
  super.onDestroy();
 }
}
