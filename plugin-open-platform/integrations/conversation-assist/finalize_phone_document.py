from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8').replace('handler.postDelayed(this,2000);','handler.postDelayed(this,phonePage?300:2000);');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8').replace('status="휴대폰 마이크 · 회의 기록 중";', '''status="휴대폰 마이크 · 회의 기록 중";PhoneMicrophone selectedMic=phoneMic;new Thread(()->{while(selectedMic.recording())try{Thread.sleep(1000);}catch(InterruptedException e){return;}if(!selectedMic.error.isEmpty()&&phoneMic==selectedMic){phoneError=selectedMic.error;pausePhone();}},"phone-microphone-watch").start();''');p.write_text(s,encoding='utf-8')
# Remove superseded card renderer; the document parser remains for legacy text support.
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MinutesView.java');p.unlink()
