from pathlib import Path
p=Path('integrations/conversation-assist/android/debug/MinutesUiProbe.java');s=p.read_text(encoding='utf-8-sig').replace('a.loadedDocument=sample;','');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/debug/AndroidManifest.xml');s=p.read_text(encoding='utf-8').replace('</manifest>','<instrumentation android:name="com.mcnex.conversation.MinutesUiProbe" android:targetPackage="com.mcnex.conversation"/></manifest>');p.write_text(s,encoding='utf-8')
