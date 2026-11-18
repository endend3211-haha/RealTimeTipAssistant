from pathlib import Path
import subprocess,json,statistics,zipfile
adb=['adb','-s','R3CY10PW8KD']
for remote,local in [('model-resource-probe.json','model-resource-device-verified.json'),('phone-mic-probe.json','phone-mic-device-verified.json')]:
 r=subprocess.run(adb+['exec-out','run-as','com.mcnex.conversation','cat','files/'+remote],capture_output=True,check=True);d=json.loads(r.stdout);assert d['ok'];Path('integrations/conversation-assist/'+local).write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
d=json.loads(Path('integrations/conversation-assist/model-resource-device-verified.json').read_text(encoding='utf-8'))
rows=[]
for r in d['rows']:
 rows.append('|'+r['model']+f"|{r['peakPssKb']/1048576:.2f} GiB|{r['singleCoreCpuPercent']:.1f}%|{statistics.mean(x['elapsedMs'] for x in r['samples'])/1000:.2f}초|{r['before']['temperatureC']}→{r['after']['temperatureC']}℃|")
report='''# 모델별 휴대폰 부하 — SM-S936N

각 모델을 GPU로 실행하고 같은 질문을 연속3회 생성했습니다. 순서는 Qwen→Gemma→EXAONE입니다. 준비 시간은 생성 시간에서 제외합니다. 순서·발열 영향을 제거한 장시간 부하 시험이 아닙니다. PSS는 프로세스의 공유 메모리를 비례 배분한 값으로 전체 GPU 메모리/전체 시스템 RAM과 같지 않습니다. 500ms 주기로 표본을 수집해 순간 최대치를 놓칠 수 있습니다. CPU%는 프로세스 CPU시간 / 경과시간으로 1코어=100% 기준이며 GPU%가 아닙니다. 기기는8코어입니다. 배터리 온도는 USB 충전 중 값이고 SoC온도·소비전력·배터리 소모율을 뜻하지 않습니다.

|모델|최대 앱PSS|CPU(1코어=100%)|생성 평균|배터리 온도|
|---|---:|---:|---:|---:|
'''+ '\n'.join(rows)+'''\n\n모두 Android thermalStatus=0(열 제한 보고 없음)이었습니다. Qwen 파일은 작아도 실행 버퍼 때문에 PSS가 가장 컸습니다. 이번 질문 응답 길이·판단 품질도 달라 속도만으로 모델 품질을 비교할 수 없습니다. GPU 사용률·전력은 이 시험에서 측정하지 않았습니다. 최근 질문 정책 변경 후 시험이므로 이전 속도 표와 직접 합치지 마세요.
'''
Path('integrations/conversation-assist/MODEL_RESOURCE_COMPARISON.md').write_text(report,encoding='utf-8')
with zipfile.ZipFile('dist/memo-conversation-assist-0.10.0/MemoConversationAssist-0.10.0.apk') as z:
 for name in z.namelist():
  if name.endswith('.dex'):assert b'PhoneMicProbe' not in z.read(name)
print('\n'.join(rows))
