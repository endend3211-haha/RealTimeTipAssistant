from pathlib import Path
import subprocess,json
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/navigation-probe.json'],capture_output=True,check=True);d=json.loads(r.stdout);assert d['ok'];Path('integrations/conversation-assist/navigation-device-verified.json').write_text(json.dumps(d,indent=2),encoding='utf-8')
notes='''# Memo 회의 0.12.0

## 페이지 구성
상단 ‘회의록 / 휴대폰 회의 / 설정’ 카테고리를 터치하거나 빈 화면·일반 본문 영역에서 좌우로 밀어 이동합니다. 카드 영역은 삭제/공유 스와이프가 우선하며 검색 입력란·문서 확대 영역은 페이지 이동에서 제외합니다. 세 페이지는 좌우 끝에서 순환하지 않습니다. 다른 페이지로 이동해도 진행 중인 휴대폰 녹음을 자동으로 중지하지 않습니다. 녹음 중지는 휴대폰 회의 페이지의 일시정지 또는 설정의 서비스 중지를 사용합니다.
회의록: 이미지 기준 상단 소개·현재 날짜/총 기록 수·달력·회의 기록 검색·날짜별 목록.
휴대폰 회의: 자막 영역, 별도 AI Tip, 듣기 시작/재개·일시정지·회의 완료. MemoMind 플러그인 없이 사용합니다.
설정: 모델 관리, GGUF 연산 장치, 휴대폰 AI Tip 켜기/끄기, 문서 글자 크기, 기록 삭제/공유 안내, HTML/PDF 저장 설명, 안경 자동 연결, 연결 키 복구, 녹음·저장 안내, 서비스 중지, 앱 정보.

## 둥근 삭제·공유 아이콘
왼쪽 밀기: 붉은 원형 휴지통 아이콘 → 눌러 삭제 확인.
오른쪽 밀기: 녹색 원형 공유 아이콘 → 눌러 Android 공유 앱 목록.
Lucide 공식 SVG를 내려받아 Android 벡터로 변환해 내장했습니다. 라이선스는 licenses/Lucide-LICENSE.txt. 오프라인에서도 표시됩니다. 스와이프만으로 삭제/공유하지 않습니다.

## 휴대폰 AI Tip
현재 선택한 로컬 AI 엔진으로 자막의 최근500자 문맥을 분석합니다. 질문은 reply, 어려운 용어는 term, 불필요하면 none. 용어 사전에 정의가 있으면 보완합니다. 최소10초 간격, 동일 문맥 재분석 억제, 같은 주제 중복 억제, 결과 도착 시 새 확정 발언10개 이상이면 생략합니다. 자막 저장과 별도 스레드로 처리하고 AI 작업이 바쁘면 양보합니다. 페이지를 떠나거나 듣기가 정지된 경우 이전 결과를 표시하지 않습니다. 긴 Tip은 눌러 전체 내용을 봅니다. AI 판단·정확도는 모델에 따라 달라 모든 질문에 답한다고 보장하지 않습니다.

## 검증
Android 빌드/JUnit10개 통과. 실제 휴대폰의 고정 UI 시험에서 세 카테고리 표시·페이지 좌우 이동·휴대폰 AI Tip 영역·카드 양방향 스와이프 후 아이콘 클릭 콜백 확인. 사용자 회의를 삭제하거나 외부로 발송하지 않았습니다. 실제 연속 발화와 동시에 자동 Tip이 표시되는 장시간 시험은 별도입니다. 최종 APK는 테스트 컴포넌트 제외, 16KB LOAD/RELRO 및 ZIP 정렬 검사 통과.
기존 회의·모델·연결 키 유지, 폰 플러그인0.6.1과 글라스 GMP 변경 없음.
'''
Path('dist/memo-conversation-assist-0.12.0/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
