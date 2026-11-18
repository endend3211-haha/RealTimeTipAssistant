from pathlib import Path
p=Path('integrations/conversation-assist/android/debug/AndroidManifest.xml');s=p.read_text(encoding='utf-8').replace('</manifest>','<instrumentation android:name="com.mcnex.conversation.AlignmentSmokeProbe" android:targetPackage="com.mcnex.conversation"/></manifest>');p.write_text(s,encoding='utf-8')
