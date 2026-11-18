from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8').replace('private boolean phoneHelping;', 'private volatile boolean phoneHelping;')
s=s.replace('phoneTip.setBackground(shape(WHITE,16));root.addView(phoneTip', 'phoneTip.setBackground(shape(WHITE,16));phoneTip.setMaxLines(3);phoneTip.setEllipsize(android.text.TextUtils.TruncateAt.END);phoneTip.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("AI Tip").setMessage(phoneTip.getText()).setPositiveButton("확인",null).show());root.addView(phoneTip')
s=s.replace('if(!phonePage||AssistService.current==null)return;', 'if(!phonePage||AssistService.current==null||!getPreferences(0).getBoolean("phoneHelp",true))return;')
s=s.replace('phoneTip.setText((kind.equals("reply")?', 'String shown=text;if(kind.equals("term")){String known=Glossary.exact(topic);if(known!=null)shown=known;}phoneTip.setText((kind.equals("reply")?').replace('+topic+"\\n"+text);', '+topic+"\\n"+shown);')
p.write_text(s,encoding='utf-8')
