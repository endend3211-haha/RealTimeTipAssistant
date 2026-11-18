import json,subprocess,statistics
from pathlib import Path
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/help-speed.json'],capture_output=True,check=True)
d=json.loads(r.stdout);print('complete:',d.get('ok',False),'samples:',len(d.get('samples',[])))
for model in sorted(set(i['model'] for i in d.get('samples',[]))):
 items=[i for i in d['samples'] if i['model']==model]
 print(model,[(i['case'],i['generateMs'],i['validJson']) for i in items])
if d.get('ok'):
 Path('integrations/conversation-assist/help-speed-device-verified.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
