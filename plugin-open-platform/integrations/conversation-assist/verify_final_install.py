import subprocess,json
from pathlib import Path
adb=['adb','-s','R3CY10PW8KD']
paths=subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','find','files/meetings','-name','meta.json']).decode().splitlines()
rows=[]
for path in paths:
 m=json.loads(subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat',path]).decode('utf-8'));rows.append({'test':m.get('testFixture',False),'status':m.get('status'),'segments':m.get('segments',0)})
print(json.dumps({'meetingCount':len(rows),'testFixtureCount':sum(x['test'] for x in rows)},ensure_ascii=True))
r=Path('output/conversation-assist');r.mkdir(parents=True,exist_ok=True)
(r/'apk-home-final.png').write_bytes(subprocess.check_output(adb+['exec-out','screencap','-p']))
