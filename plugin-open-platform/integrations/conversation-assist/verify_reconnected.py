from pathlib import Path
import subprocess,json,re
adb=['adb','-s','R3CY10PW8KD']
r=Path('integrations/conversation-assist')
report=json.loads(subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat','files/continuous-pipeline-probe.json']).decode('utf-8'))
ai=json.loads(subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat','files/concurrent-ai-probe.json']).decode('utf-8'))
refs=['그는 괜찮은 척하려고 애쓰는 것 같았다.','지하철에서 다리를 벌리고 앉지 마라.','부모가 저지르는 큰 실수 중 하나는 자기 아이를 다른 집 아이와 비교하는 것이다.','주민등록증을 보여 주시겠어요?']
normal=lambda s:re.sub(r'[\s.,?!]','',s)
matches=sum(normal(item['text'])==normal(refs[i%4]) for i,item in enumerate(report['finals']))
report['referenceMatchesIgnoringSpacingAndPunctuation']=matches;report['concurrentAi']=ai
(r/'continuous-device-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
update='''\n\n## 2026-11-03 재연결 후 최종 확인\n\n최종 0.4.0 APK 업데이트 설치 성공. 회수한 장시간 Opus 시험 결과: 음성 121,440ms, 전체 122,149ms, 첫 중간 자막 622ms, 중간 자막 변화 316회, 확정 문장 24개, 인식 오류 코드 없음. 네 가지 고정 한국어 시험 문장을 여섯 번씩 반복했으며 공백·문장부호를 제외한 기준 문장 일치 24/24. 같은 시험 중 Gemma의 고정 HDR 도움 요청도 6589ms에 완료. 이는 제한된 시험 음성의 결과이며 다양한 실제 대화의 정확도 100%를 의미하지 않습니다. Bluetooth 입력과 안경 화면까지 포함한 장시간 시험은 별도로 필요합니다.\n\n다음 사용자 작업: 보조 앱에서 서비스 시작, Studio에서 폰 플러그인을 0.4.0으로 업데이트 후 재시작, 듣기 시작. 기존 글라스 GMP·Gemma·연결 키 유지.\n'''
for p in [Path('CONVERSATION_ASSIST.md'),Path('dist/memo-conversation-assist-0.4.0/README.md')]:
 s=p.read_text(encoding='utf-8');p.write_text(s+update,encoding='utf-8')
print(json.dumps({'audioMs':report['audioMs'],'elapsedMs':report['elapsedMs'],'firstPartialMs':report['firstPartialMs'],'partialChanges':report['partialChanges'],'finals':len(report['finals']),'referenceMatches':matches},ensure_ascii=True))
