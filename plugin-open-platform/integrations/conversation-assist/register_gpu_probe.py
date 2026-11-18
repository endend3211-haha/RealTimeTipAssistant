from pathlib import Path
p=Path('integrations/conversation-assist/android/debug/AndroidManifest.xml');s=p.read_text(encoding='utf-8-sig');s=s.replace('</manifest>','<instrumentation android:name="com.mcnex.conversation.GpuBenchmarkProbe" android:targetPackage="com.mcnex.conversation"/></manifest>');p.write_text(s,encoding='utf-8')
