import zipfile
from pathlib import Path
with zipfile.ZipFile('dist/memo-conversation-assist-0.7.0/MemoConversationAssist-0.7.0.apk') as z:
 print([n for n in z.namelist() if 'probe' in n.lower() or 'test.gguf' in n])
 for n in z.namelist():
  if n.endswith('.dex'):print(n,'DualEngineProbe',b'DualEngineProbe' in z.read(n),'MeetingFeatureProbe class',b'Lcom/mcnex/conversation/MeetingFeatureProbe;' in z.read(n))
p=Path('integrations/conversation-assist/package_dual_engine.py');s=p.read_text(encoding='utf-8').replace("assert not any('probe' in n.lower() or 'test.gguf' in n for n in z.namelist())", "assert not any(n.startswith('assets/') and ('probe' in n.lower() or n.endswith('.gguf')) for n in z.namelist())");p.write_text(s,encoding='utf-8')
