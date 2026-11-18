from pathlib import Path
import subprocess
out=Path('output/conversation-assist');out.mkdir(parents=True,exist_ok=True)
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','screencap','-p'],capture_output=True,check=True);(out/'apk-060-home.png').write_bytes(r.stdout)
notes='''# Memo 회의 0.6.0

- APK에서 회의 제목·자막 원문·AI 회의록을 검색합니다. 띄어쓰기와 영문 대소문자 차이를 허용하며, 검색 결과에 내용 미리보기와 문서 종류가 표시됩니다.
- 회의 완료 후 전체 원문을 분석해 회의록과 구체적인 AI 제목을 생성합니다. 날짜·시작/종료 시간·소요 시간은 별도로 표시합니다. 기존 회의는 회의록 다시 생성을 누르면 제목도 갱신됩니다. AI 생성 실패 시 기존 제목을 유지합니다.
- 도움말 이력을 현재 회의별로 폰 플러그인에 보존합니다. 같은 주제, HDR/OIS/EIS 주요 별칭, 유사한 설명은 반복 표시를 억제하고 최근 제공 주제를 AI에도 전달합니다. 의미가 같은 모든 표현의 완전한 판별을 보장하지는 않습니다.
- 듣기 시작을 누르는 즉시 이전 자막·도움말·팝업을 안경에서 초기화합니다. 새 음성 세션의 자막만 표시하며 APK의 저장된 회의 원문은 유지합니다. 일시정지 후 재개는 같은 회의에 이어 기록합니다.

## 업데이트

APK 0.6.0은 연결된 휴대폰에 업데이트 설치 및 실행을 확인했습니다. 기존 앱을 삭제하지 않았습니다.
MemoMind Studio의 폰 플러그인을 MemoConversationAssist-0.6.0.mmpkg로 교체한 뒤 종료·재시작하세요. 글라스 플러그인은 변경되지 않았으며 함께 제공한 GMP를 계속 사용합니다. APK에서 자동 연결 시작 후 폰 플러그인의 듣기를 시작합니다.

## 검증

Android 빌드 성공, 저장·복구·검색 등 JUnit 6개 통과. 폰 플러그인 테스트 14개 통과. 실제 휴대폰 versionName 0.6.0 / versionCode 8 설치 확인. 실제 안경에서의 신규 폰 플러그인 동작 및 새 AI 제목 생성 품질은 추가 실사용 확인이 필요합니다.

APK 18,138,615바이트(약18.14MB), 로컬 Gemma 모델은 별도입니다. 원문/회의록은 APK 내부 저장소에 보존되며 TXT로 내보낼 수 있습니다. 외부 AI API나 인터넷 중계 서버를 사용하지 않습니다.
'''
Path('dist/memo-conversation-assist-0.6.0/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
