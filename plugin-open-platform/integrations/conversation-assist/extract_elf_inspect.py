from pathlib import Path
import zipfile
p=Path('integrations/conversation-assist/elf-inspect');p.mkdir(exist_ok=True)
with zipfile.ZipFile('dist/memo-conversation-assist-0.8.0/MemoConversationAssist-0.8.0.apk') as z:
 for n in ['lib/arm64-v8a/liblitertlm_jni.so','lib/arm64-v8a/libconversation.so']: (p/Path(n).name).write_bytes(z.read(n))
