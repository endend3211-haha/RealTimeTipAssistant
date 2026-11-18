from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace("if(health.service!=='Memo Conversation Assist')throw Error('다른 보조 앱입니다');connected=true;", "if(health.service!=='Memo Conversation Assist')throw Error('다른 보조 앱입니다');if(health.version!=='0.2.0')throw Error('보조 APK를 0.2.0으로 업데이트하세요');connected=true;");p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/.gitignore');s=p.read_text(encoding='utf-8')+'\nandroid/.whisper-build/\nandroid/.model-backup/\n';p.write_text(s,encoding='utf-8')
