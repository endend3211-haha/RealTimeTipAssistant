from pathlib import Path
import subprocess,json
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/question-policy-probe.json'],capture_output=True,check=True)
d=json.loads(r.stdout);assert d['ok'];Path('integrations/conversation-assist/question-policy-device-verified.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
notes='''# Memo 회의 APK0.8.2 / 폰 플러그인0.6.1

## 변경
전문 분야에 한정하지 않고 최근 미해결 질문·문의에 reply 답변 도움을 우선 제안합니다. 알 수 없는 개인·회사 내부 정보는 추측하지 않고 확인 방법이나 되물을 질문을 제안하도록 지시합니다. 질문이 없으면 전문 용어 설명을 제공하고 불필요한 도움은 생략합니다. AI 판단과 답변이므로 모든 질문 감지·사실 정확성을 보장하지 않습니다.
AI 요청 시작 이후 새로 확정된 자막이 0~9개이면 도움 표시 가능, 10개 이상이면 생략합니다. 확정 문장 ID를 사용해 같은 타임스탬프로 수신된 여러 문장도 계산하며, 같은 문장의 수정/부분 자막은 추가 발언으로 세지 않습니다. 결과 도착 및 저장 직후 표시 전에 재확인합니다.
짧은 질문도 분석 대상에 포함했습니다. 자동분석 최소10초 간격, 중복 억제, 5초 도움 카드 표시는 유지합니다.

## 적용
APK0.8.2는 휴대폰에 업데이트 설치합니다. MemoMind Studio의 폰 플러그인도 MemoConversationAssist-Phone-0.6.1.mmpkg로 교체 후 종료·재시작해야 새 발언10개 기준이 적용됩니다. 글라스 GMP는 변경 없습니다. APK에서 자동 연결 시작 후 폰 플러그인을 사용합니다.

## 검증
폰 논리 테스트16개 통과(9개/10개 경계, 같은 시각 문장, 짧은 질문 포함). Android JUnit7개 통과. 최종 APK 모든7개 네이티브 라이브러리16KB LOAD·RELRO 검사 통과.
실제 휴대폰의 별도 Gemma 테스트 사본에서 일반 질문/내부 미공개 예산 질문 모두 reply로 응답하고, EXAONE GPU도 일반 질문에 reply 응답 확인.
현재 등록된 LiteRT 모델은 사용자가 가져온 Qwen3-0.6B입니다. 초기 시험에서 한국어 답변 부정확·질문 판단 누락이 확인되어 프롬프트를 보완했습니다. 최종 프롬프트의 실기기 성공 사례는 Gemma/EXAONE이며 Qwen 성공을 확인했다고 주장하지 않습니다. 신뢰성 우선이면 Gemma를 권장합니다. 선택 모델·파일은 임의 변경하지 않았습니다.

## 저장
원문·회의록·모델 파일·연결 설정은 유지합니다. 테스트용 임시 Gemma 사본만 제거합니다. Qwen 및 EXAONE 파일을 지우지 않습니다.
'''
Path('dist/memo-conversation-assist-0.8.2/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
