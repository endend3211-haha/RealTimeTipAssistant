from pathlib import Path
notes='''# Memo 회의 0.10.0

## 휴대폰만으로 회의 기록
홈 → ‘휴대폰 마이크로 회의 시작’ → ‘듣기 시작 / 재개’. MemoMind 앱·폰/글라스 플러그인 없이 사용합니다. 마이크 권한을 허용하세요. 실시간 자막을 표시하고 전체 원문을 APK 회의 저장소에 기록합니다. 일시정지는 같은 회의에 이어 저장하며 ‘회의 완료 · 회의록 생성’을 누르면 선택한 로컬 AI로 회의록을 만듭니다. 원본 음성 파일은 저장하지 않습니다.
기록 중 포그라운드 알림과 WakeLock을 사용하며, 일시정지/종료/마이크 오류에서 해제합니다. 글라스와 휴대폰 녹음을 동시에 시작하지 않도록 제한합니다. 먼저 진행 중인 듣기를 정지한 후 입력원을 바꾸세요. 일시정지 후 입력원을 변경해도 완료 전에는 같은 회의로 이어집니다. 새 회의를 만들려면 기존 회의를 완료하세요.

## 회의록 문서 양식
카드 UI가 아니라 A4 인쇄용 문서입니다. 제목·회의 날짜/시간, 핵심 요약, 주요 논의, 결정 사항, 실행 과제 표(업무/담당자/기한), 확인 사항을 문서로 표시합니다. 내용이 없거나 AI가 구분하지 못한 항목은 임의로 지어내지 않습니다. 기존 회의록 텍스트는 섹션 제목을 해석해 문서화하고 내용을 보존합니다. 완전히 자유 형식인 기존 문서는 ‘회의록 안내’ 항목에 남을 수 있습니다. 새 회의록/다시 생성부터 실행 과제의 표 형식을 명시적으로 요청합니다.
Lucide 공식 저장소 SVG 아이콘5개를 앱에 내장했습니다. 인터넷 없이 같은 아이콘을 지속 사용하며 HTML 저장/인쇄에도 포함합니다. 라이선스는 licenses/Lucide-LICENSE.txt.
AI 회의록 탭 → ‘문서 전체 화면 · 확대’: A−/A＋, 손가락 확대. ‘양식 문서 저장’: 스타일과 아이콘이 내장된 HTML 파일. ‘PDF · 인쇄’: Android 인쇄 창에서 ‘PDF로 저장’을 선택해 저장합니다. TXT 저장은 원래 텍스트로 별도 유지합니다. PDF가 회의 완료 시 자동으로 생성되는 방식은 아닙니다. 새 회의록 생성 시 내부 minutes.html도 저장됩니다. HTML 내보내기는 현재 표시된 미리보기를 문서화하므로 매우 긴 회의록의 20만자 화면 한도를 넘는 전체 원문/요약은 TXT로 내보내세요.

## 모델 부하 비교
MODEL_RESOURCE_COMPARISON.md 및 model-resource-device-verified.json 참조. 같은 질문3회 GPU 생성 시험:
Qwen: 앱 최대PSS 2.76GiB, 생성 평균0.92초.
Gemma: 2.16GiB, 평균1.99초.
EXAONE: 2.50GiB, 평균4.05초.
이는 한 프로세스의 PSS 표본이며 GPU 전체 메모리와 같지 않습니다. USB 충전 중 순차 시험이므로 배터리 소모량/전력/장시간 발열의 순위를 뜻하지 않습니다. 빠른 Qwen에서도 이전 시험에서 부정확한 답변과 질문 누락이 있었으므로 속도와 품질을 함께 판단하세요. 현재 선택 모델은 유지했습니다.

## 검증 및 설치
0.10.0 APK를 기존 앱 위에 설치했고 versionCode15 확인. Android JUnit9개 통과, 전체7개 네이티브 라이브러리16KB LOAD/RELRO 및 zipalign 검사 통과. 테스트 전용 컴포넌트는 최종 APK에 포함하지 않습니다.
실기기 PhoneMicrophone→NativeKoreanSpeech 경로에서4초간62400 PCM샘플 수신/정상 종료 확인. 이는 장시간 회의나 소음 환경의 인식률 검증이 아닙니다.
고정 문서 예제의 아이콘·A4 문서 렌더링 및 Android 인쇄1페이지 미리보기를 실제 휴대폰에서 확인했습니다. 최종 PDF 파일 선택·저장은 사용자가 인쇄 창에서 진행합니다. 공유 예제는 실제 사용자 회의가 아닙니다.
기존 사용자 기록·모델 파일 보존. 시험용 Gemma 임시 사본만 제거했습니다. 폰 플러그인은0.6.1, 글라스 GMP는 기존 것과 동일합니다. 휴대폰 전용 사용에는 플러그인이 필요하지 않습니다.
'''
root=Path('dist/memo-conversation-assist-0.10.0');(root/'README.md').write_text(notes,encoding='utf-8')
for name in ['MODEL_RESOURCE_COMPARISON.md','model-resource-device-verified.json','phone-mic-device-verified.json']:(root/name).write_bytes(Path('integrations/conversation-assist',name).read_bytes())
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
