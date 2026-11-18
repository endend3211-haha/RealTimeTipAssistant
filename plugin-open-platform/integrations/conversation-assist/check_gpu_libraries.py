import zipfile
with zipfile.ZipFile('integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk') as z:
 print('\n'.join(n for n in z.namelist() if n.startswith('lib/')))
 assert 'lib/arm64-v8a/libOpenCL.so' not in z.namelist()
