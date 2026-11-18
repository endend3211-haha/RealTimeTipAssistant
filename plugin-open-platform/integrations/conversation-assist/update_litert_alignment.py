from pathlib import Path
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace('litertlm-android:0.18.0','litertlm-android:0.19.0');p.write_text(s,encoding='utf-8')
