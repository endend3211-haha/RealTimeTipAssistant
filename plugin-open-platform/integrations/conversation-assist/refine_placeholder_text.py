from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8').replace('root.addView(text("대화는 이어지고,\\n기록은 남습니다.",27,INK,true));','TextView motto=text("대화는 이어지고, 기록은 남습니다.",23,INK,true);motto.setSingleLine(true);motto.setAutoSizeTextTypeUniformWithConfiguration(12,23,1,android.util.TypedValue.COMPLEX_UNIT_SP);root.addView(motto,new LinearLayout.LayoutParams(-1,dp(38)));')
s=s.replace('phoneCaption=text("대화 자막이 여기에 표시됩니다.",19,INK,false)', 'phoneCaption=text("대화 자막이 여기에 표시됩니다.",19,MUTED,false)')
s=s.replace('phoneTip=text("질문·어려운 용어가 있으면 로컬 AI가 도움을 제안합니다.",14,INK,false)', 'phoneTip=text("질문·어려운 용어가 있으면 로컬 AI가 도움을 제안합니다.",14,MUTED,false)')
s=s.replace('if(text.length()>0)phoneCaption.setText(text);','if(text.length()>0){phoneCaption.setTextColor(INK);phoneCaption.setText(text);}')
s=s.replace('phoneTip.setText((kind.equals("reply")?', 'phoneTip.setTextColor(INK);phoneTip.setText((kind.equals("reply")?')
s=s.replace('if(phonePage&&phoneTip!=null)phoneTip.setText("AI 도움 대기 · "+e.getMessage());','if(phonePage&&phoneTip!=null){phoneTip.setTextColor(MUTED);phoneTip.setText("AI 도움 대기 · "+e.getMessage());}')
s=s.replace('Memo 회의 0.13.0','Memo 회의 0.13.1');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 18; versionName '0.13.0'","versionCode 19; versionName '0.13.1'");p.write_text(s,encoding='utf-8')
