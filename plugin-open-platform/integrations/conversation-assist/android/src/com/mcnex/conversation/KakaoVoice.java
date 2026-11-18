package com.mcnex.conversation;
import android.content.*;import android.os.*;import android.speech.*;import java.util.*;
/** A short Korean on-device microphone session. Never submits the recognized question. */
final class KakaoVoice implements AutoCloseable {
 interface Callback {void text(String text);void state(boolean listening,String message);}
 private final Context context;private final Callback callback;private final Handler handler=new Handler(Looper.getMainLooper());private SpeechRecognizer recognizer;private int generation;private boolean active;
 KakaoVoice(Context context,Callback callback){this.context=context;this.callback=callback;}
 boolean active(){return active;}
 static String recognized(Bundle result){ArrayList<String> candidates=result==null?null:result.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(candidates==null||candidates.isEmpty()||candidates.get(0)==null)return "";String text=candidates.get(0).trim();return text.substring(0,Math.min(240,text.length()));}
 void start(){close();if(!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)){callback.state(false,"기기 내 한국어 음성인식을 사용할 수 없습니다. 휴대폰 음성인식 설정을 확인해주세요.");return;}int session=++generation;active=true;callback.state(true,"한국어 음성인식을 준비하고 있습니다…");try{recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(context);recognizer.setRecognitionListener(new RecognitionListener(){
  boolean valid(){return generation==session&&active;}
  public void onReadyForSpeech(Bundle b){if(valid())callback.state(true,"말씀해 주세요. 마치면 자동으로 문장을 입력합니다.");}
  public void onBeginningOfSpeech(){}public void onRmsChanged(float v){}public void onBufferReceived(byte[] b){}public void onEvent(int type,Bundle b){}
  public void onEndOfSpeech(){if(valid())callback.state(true,"말씀하신 문장을 확인하고 있습니다…");}
  public void onPartialResults(Bundle b){if(valid()){String text=recognized(b);if(!text.isEmpty())callback.text(text);}}
  public void onResults(Bundle b){if(!valid())return;String text=recognized(b);if(!text.isEmpty())callback.text(text);close();callback.state(false,text.isEmpty()?"인식된 문장이 없습니다. 다시 말씀해주세요.":"음성 입력 완료 · 문장을 확인한 뒤 질문하기를 눌러주세요.");}
  public void onError(int code){if(!valid())return;close();callback.state(false,error(code));}
 });recognizer.startListening(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ko-KR").putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true));handler.postDelayed(()->{if(generation==session&&active)stop();},30000);}catch(Exception e){close();callback.state(false,"음성인식을 시작하지 못했습니다. 마이크 권한과 기기 내 한국어 인식 설정을 확인해주세요.");}}
 void stop(){if(!active||recognizer==null)return;callback.state(true,"음성 입력을 마무리하고 있습니다…");int session=generation;try{recognizer.stopListening();}catch(Exception ignored){}handler.postDelayed(()->{if(generation==session&&active){close();callback.state(false,"음성 입력을 마쳤습니다. 입력된 문장을 확인해주세요.");}},4000);}
 static String error(int code){switch(code){case 9:return "마이크 권한을 허용해주세요. (오류 9)";case 12:case 13:return "기기 내 한국어 음성 모델을 사용할 수 없습니다. 휴대폰 음성인식 언어 설정을 확인해주세요. (오류 "+code+")";case 6:case 7:return "말소리를 인식하지 못했습니다. 다시 말씀해주세요.";case 8:return "다른 음성인식이 사용 중입니다. 회의를 일시정지한 후 다시 시도해주세요.";default:return "음성인식 오류 "+code+" · 다시 시도하거나 직접 입력해주세요.";}}
 public void close(){boolean wasActive=active;generation++;active=false;handler.removeCallbacksAndMessages(null);SpeechRecognizer old=recognizer;recognizer=null;if(old!=null){try{old.cancel();old.destroy();}catch(Exception ignored){}}if(wasActive)callback.state(false,"음성 입력이 중지되었습니다. 입력된 문장을 확인해주세요.");}
}
