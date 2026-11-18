import subprocess,xml.etree.ElementTree as ET,json,urllib.request,urllib.error,struct,time,concurrent.futures
from pathlib import Path
adb=['adb','-s','R3CY10PW8KD']
raw=subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat','shared_prefs/connection.xml'])
token=ET.fromstring(raw).find("string[@name='token']").text
origin='http://127.0.0.1:18773'
def req(path,body=None,auth=True):
 headers={'Authorization':'Bearer '+token} if auth else {}
 if isinstance(body,dict):body=json.dumps(body,ensure_ascii=False).encode();headers['Content-Type']='application/json'
 elif body is not None:headers['Content-Type']='application/octet-stream'
 request=urllib.request.Request(origin+path,data=body,headers=headers)
 try:
  with urllib.request.urlopen(request,timeout=240) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
assert req('/health',auth=False)[0]==401
code,health=req('/health');assert code==200 and health['model']
print('Authentication and existing model presence: passed',flush=True)
frame=bytes.fromhex('f8fffe');silence=struct.pack('>I',300)+b''.join(struct.pack('>H',len(frame))+frame for _ in range(300))
code,data=req('/audio',silence);assert code==200 and data['text']=='',(code,data)
print('6-second silent Opus decoding: passed',flush=True)
context='이번 카메라는 역광에서 얼굴이 너무 어둡게 나옵니다. HDR 처리를 적용해서 밝은 배경과 어두운 얼굴의 디테일을 함께 살려야 합니다.'
started=time.time()
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 future=pool.submit(req,'/explain',{'context':context,'term':'HDR'})
 time.sleep(3)
 code,data=req('/audio',silence)
 print('Audio during AI request:',code,flush=True)
 result=future.result()
report={'health':health,'explanation':result,'seconds':round(time.time()-started,2),'audioDuringAi':code}
Path(__file__).with_name('device-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True),flush=True)
assert result[0]==200 and result[1]['text']
assert result[1]['source']=='로컬 용어 사전'
started=time.time()
code,unknown=req('/explain',{'context':'카메라 센서의 빛을 전기 신호로 읽는 CMOS 기술을 검토합니다.','term':'CMOS'})
print('Unknown-term AI:',json.dumps({'status':code,'seconds':round(time.time()-started,2),'result':unknown},ensure_ascii=True),flush=True)
assert code==200 and unknown['text']
report['unknownTerm']=unknown
Path(__file__).with_name('device-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
