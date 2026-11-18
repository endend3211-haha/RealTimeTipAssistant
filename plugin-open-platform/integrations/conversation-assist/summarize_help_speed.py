from pathlib import Path
import json,statistics
p=Path('integrations/conversation-assist/help-speed-device-verified.json');d=json.loads(p.read_text(encoding='utf-8'));samples=d['samples']
models=['Gemma GPU','EXAONE OpenCL GPU'];cases=['HDR 도움','양자화 도움','도움 불필요 판단']
rows=[]
for case in cases:
 values=[]
 for model in models:
  items=[i for i in samples if i['case']==case and i['model']==model];values.append(statistics.mean(i['generateMs'] for i in items)/1000)
  print(model,case,'kinds',[i['help']['kind'] for i in items],'chars',[i['characters'] for i in items])
 rows.append('|'+case+'|'+f'{values[0]:.2f}초|{values[1]:.2f}초|')
means=[statistics.mean(i['generateMs'] for i in samples if i['model']==m)/1000 for m in models]
print('MEANS',means,'RATIO',means[1]/means[0]);print('LOADS',d['loads'])
text='''# AI 도움 속도 비교 — SM-S936N / 0.8.1

두 모델 모두 GPU. 동일한 세 대화 문맥·자동 도움 지시·최대128토큰. 순서는 Gemma→EXAONE→EXAONE→Gemma로 바꾸어 각 사례 2회, 모델별 6회, 총12회 측정했습니다. 매 요청은 별도 대화이며 이전 대화 이력은 넣지 않았습니다. 모델 준비와 추론 시간을 분리했습니다. Gemma는 LiteRT-LM 0.19, EXAONE은 OpenCL/Adreno 830입니다.

|사례 (2회 평균)|Gemma GPU|EXAONE GPU|
|---|---:|---:|
'''+ '\n'.join(rows)+f'\n|전체 평균|{means[0]:.2f}초|{means[1]:.2f}초|\n\n이번 표본의 평균 생성 지연은 Gemma가 약 {means[1]/means[0]:.2f}배 짧았습니다. 두 모델 모두 6/6 JSON 형식 검증을 통과했습니다. 이는 도움의 사실 정확성/적절성 전체를 검증한 결과가 아닙니다.\n\n'
text+='모델 준비 시간: '+json.dumps(d['loads'],ensure_ascii=False)+'\n\n'
text+='모델별 답변 문구·출력 길이는 다르며 동일 토큰 수의 처리량 측정은 아닙니다. 적은 수의 고정 사례 시험이고 발열·다른 앱·캐시·대화 길이에 따라 결과가 달라집니다. 음성인식, 폰 플러그인의 자동분석 대기, 안경 화면 전송은 시간에 포함하지 않았습니다. 따라서 실제 체감 카드 표시 지연은 더 길 수 있습니다. 현재 앱 선택 모델/CPU·GPU 선호 설정은 변경하지 않았습니다.\n'
Path('integrations/conversation-assist/HELP_SPEED_COMPARISON.md').write_text(text,encoding='utf-8')
print('\n'.join(rows))
