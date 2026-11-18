from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8').replace('private volatile boolean phoneHelping;', 'private long phoneHelpGeneration;private volatile boolean phoneHelping;')
pos=s.index(' void refreshPhone()');s=s[:pos]+''' void resetPhoneMeetingDisplay(){phoneHelpGeneration++;phoneHelpContext="";phoneHelpSession="";phoneHelpAt=0;phoneTopics.clear();if(phoneCaption!=null){phoneCaption.setTextColor(MUTED);phoneCaption.setText("대화 자막이 여기에 표시됩니다.");}if(phoneTip!=null){phoneTip.setTextColor(MUTED);phoneTip.setText("질문·어려운 용어가 있으면 로컬 AI가 도움을 제안합니다.");}}
'''+s[pos:]
s=s.replace('JSONObject snap=service.phoneSnapshot();String error=', 'JSONObject snap=service.phoneSnapshot();JSONObject active=snap.optJSONObject("meeting");if(active!=null&&active.optString("activeId").isEmpty()){resetPhoneMeetingDisplay();phoneState.setText("새 회의 · 듣기 시작을 눌러주세요"+(active.optString("progress").isEmpty()?"":"\\n"+active.optString("progress")));return;}String error=')
s=s.replace('phoneHelping=true;phoneHelpAt=', 'final long generation=phoneHelpGeneration;phoneHelping=true;phoneHelpAt=')
s=s.replace('if(!phonePage||AssistService.current==null||', 'if(generation!=phoneHelpGeneration||!phonePage||AssistService.current==null||')
s=s.replace('if(phonePage&&phoneTip!=null){phoneTip.setTextColor', 'if(generation==phoneHelpGeneration&&phonePage&&phoneTip!=null){phoneTip.setTextColor')
s=s.replace('toast("원문 저장 완료 · 회의록을 만들고 있습니다");lastList=', 'resetPhoneMeetingDisplay();toast("원문 저장 완료 · 회의록을 만들고 있습니다");lastList=')
s=s.replace('Memo 회의 0.13.4','Memo 회의 0.13.5');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8').replace('String id=meetings.complete();respond(s,200,', 'String id=meetings.complete();if(liveSpeech!=null){liveSpeech.close();liveSpeech=null;}respond(s,200,');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 22; versionName '0.13.4'","versionCode 23; versionName '0.13.5'");p.write_text(s,encoding='utf-8')
